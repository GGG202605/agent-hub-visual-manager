/// <reference types="node" />

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentFirstDashboardView } from '../../data/mockAgentHub';
import { preparePatchTransaction } from '../../../server/patchTransaction.mjs';
import { hashDevelopmentModelRoute, sha256Hex, stableStringify } from '../../../server/serverLib.mjs';
import { createTaskCheckpoint } from '../taskGraph';
import { buildPipelinePlan, INITIAL_PIPELINE_STATE, pipelineReducer } from '../taskPipeline';
import { buildSafePilotExecutionProfile, SAFE_PILOT_AGENT_ORDER } from '../safePilotLauncher';
import { DemoScenario015_RETRY_REPAIR_MARKER } from '../safePilotExecution';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const pinnedSafePilotTaskText = '评审只读方案';
const pinnedSafePilotContextText = 'P1 只读项目摘要';
const pinnedSafePilotProfile = buildSafePilotExecutionProfile(
  SAFE_PILOT_AGENT_ORDER.map((agentCode) => ({
    agentCode,
    provider: 'custom' as const,
    model: 'local-test-model',
    ready: true,
  })),
  { inputRatePerMillion: 1, outputRatePerMillion: 2, maxCost: 1 },
);
const pinnedSafePilotArgs = [
  '--safe-pilot-task-sha256',
  sha256Hex(pinnedSafePilotTaskText),
  '--safe-pilot-context-sha256',
  sha256Hex(pinnedSafePilotContextText),
  '--safe-pilot-profile-sha256',
  sha256Hex(stableStringify(pinnedSafePilotProfile)),
];
const developmentCostPolicy = {
  currency: 'CNY',
  inputMicrosPerMillionTokens: 1_000_000,
  outputMicrosPerMillionTokens: 2_000_000,
  maxCostMicros: 50_000_000,
};

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error?: Error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForHealth(baseUrl: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response.json() as Promise<Record<string, unknown>>;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError instanceof Error ? lastError : new Error('server did not become healthy');
}

async function bootstrapSession(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { origin: baseUrl },
  });
  if (!response.ok) throw new Error(`session bootstrap failed: HTTP ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

describe('local server approval boundary', () => {
  let workspace = '';
  let baseUrl = '';
  let child: ChildProcess | null = null;
  let sessionToken = '';
  let port = 0;
  let provider: HttpServer | null = null;
  let providerBaseUrl = '';
  let providerCallCount = 0;
  let providerLastContent = '';
  let providerLastResponseFormat = '';

  beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'agenthub-server-test-'));
    await mkdir(path.join(workspace, '.agent-hub'), { recursive: true });
    await writeFile(path.join(workspace, '.agent-hub', 'project-state.md'), '# Test project\n', 'utf8');
    port = await reservePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [
      'server/server.mjs',
      '--workspace',
      workspace,
      '--port',
      String(port),
      '--enable-safe-pilot-issuance',
      '--enable-checkpoints',
      ...pinnedSafePilotArgs,
    ], {
      cwd: repoRoot,
      env: { ...process.env, AGENTHUB_DEVELOPMENT_STATE_DIR: path.join(workspace, '.development-sessions') },
      stdio: 'ignore',
      windowsHide: true,
    });
    const health = await waitForHealth(baseUrl);
    expect(health).not.toHaveProperty('workspace');
    expect(health).not.toHaveProperty('agentHub');
    expect(health).not.toHaveProperty('sessionToken');
    const session = await bootstrapSession(baseUrl);
    sessionToken = String(session.sessionToken ?? '');
    expect(sessionToken).not.toBe('');
    expect(health.serviceInstanceId).toMatch(/^[a-f0-9]{24}$/);
    const repeatedHealth = await (await fetch(`${baseUrl}/api/health`)).json() as Record<string, unknown>;
    expect(repeatedHealth.serviceInstanceId).toBe(health.serviceInstanceId);
    expect(health).toMatchObject({
      version: '2.0.0',
      safePilotIssuanceRequested: true,
      safePilotIssuanceEnabled: true,
      safePilotIssuerPinning: {
        ready: true,
        taskSha256Prefix: pinnedSafePilotArgs[1].slice(0, 16),
        contextSha256Prefix: pinnedSafePilotArgs[3].slice(0, 16),
        profileSha256Prefix: pinnedSafePilotArgs[5].slice(0, 16),
        blockers: [],
      },
      operator: {
        managed: false,
        processId: expect.any(Number),
        markerSha256Prefix: '',
        entrySha256Prefix: expect.stringMatching(/^[a-f0-9]{16}$/),
      },
      developmentPreset: { id: 'local-autonomous-v1', isDefault: true },
    });

    provider = createHttpServer((request, response) => {
      providerCallCount += 1;
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          messages?: Array<{ content?: string }>;
          response_format?: { type?: string };
        };
        const messages = payload.messages ?? [];
        const content = messages[messages.length - 1]?.content ?? '';
        providerLastContent = content;
        providerLastResponseFormat = payload.response_format?.type ?? '';
        const send = () => {
          if (content.includes('temporary-503')) {
            response.writeHead(503, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ error: 'temporary local fixture' }));
            return;
          }
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              choices: [{
                finish_reason: content.includes('truncated') ? 'length' : 'stop',
                message: {
                  content: content.includes('oversized')
                    ? 'x'.repeat(1_000_100)
                    : content.includes('long-text')
                      ? 'x'.repeat(8_001)
                    : content.includes('review')
                      ? 'review complete GATE:PASS'
                      : 'local provider result',
                },
              }],
              usage: { prompt_tokens: 9, completion_tokens: 7 },
            }),
          );
        };
        if (content.includes('delay')) setTimeout(send, 500);
        else send();
      });
    });
    await new Promise<void>((resolve, reject) => {
      provider?.once('error', reject);
      provider?.listen(0, '127.0.0.1', () => resolve());
    });
    const providerAddress = provider.address();
    providerBaseUrl = `http://127.0.0.1:${typeof providerAddress === 'object' && providerAddress ? providerAddress.port : 0}/v1`;
  }, 15_000);

  afterAll(async () => {
    child?.kill();
    await new Promise<void>((resolve) => provider?.close(() => resolve()) ?? resolve());
    await rm(workspace, { recursive: true, force: true });
  });

  it('rejects untrusted browser origins before exposing local metadata or session capability', async () => {
    const staticResponse = await fetch(`${baseUrl}/`);
    expect(staticResponse.headers.get('cache-control')).toBe('no-store');

    const healthResponse = await fetch(`${baseUrl}/api/health`, {
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    expect(healthResponse.status).toBe(403);
    expect(healthResponse.headers.get('access-control-allow-origin')).toBeNull();
    const body = await healthResponse.text();
    expect(body).not.toContain('sessionToken');
    expect(body).not.toContain(workspace);

    const missingOriginSession = await fetch(`${baseUrl}/api/session`, { method: 'POST' });
    expect(missingOriginSession.status).toBe(403);
    expect(await missingOriginSession.text()).not.toContain(sessionToken);

    const trustedSession = await fetch(`${baseUrl}/api/session`, {
      method: 'POST',
      headers: { origin: baseUrl },
    });
    expect(trustedSession.status).toBe(200);
    expect(trustedSession.headers.get('cache-control')).toBe('no-store');
    expect(await trustedSession.json()).toMatchObject({ sessionToken, workspace });

    const projectResponse = await fetch(`${baseUrl}/api/project`, {
      headers: { origin: 'http://localhost:4173' },
    });
    expect(projectResponse.status).toBe(403);
    expect(projectResponse.headers.get('access-control-allow-origin')).toBeNull();

    const unauthenticatedProject = await fetch(`${baseUrl}/api/project`);
    expect(unauthenticatedProject.status).toBe(401);

    const unauthenticatedEvents = await fetch(`${baseUrl}/api/events`);
    expect(unauthenticatedEvents.status).toBe(401);

    const eventController = new AbortController();
    const authenticatedEvents = await fetch(`${baseUrl}/api/events`, {
      headers: { 'x-agenthub-session': sessionToken },
      signal: eventController.signal,
    });
    expect(authenticatedEvents.status).toBe(200);
    expect(authenticatedEvents.headers.get('cache-control')).toContain('no-store');
    const firstEvent = await authenticatedEvents.body?.getReader().read();
    expect(new TextDecoder().decode(firstEvent?.value)).toContain('event: hello');
    eventController.abort();

    const authenticatedProject = await fetch(`${baseUrl}/api/project`, {
      headers: { 'x-agenthub-session': sessionToken },
    });
    expect(authenticatedProject.headers.get('cache-control')).toBe('no-store');
    expect(authenticatedProject.headers.get('x-frame-options')).toBe('DENY');
    expect(authenticatedProject.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  function orchestrationPayload(runId: string, content: string, policy?: Record<string, number | boolean>) {
    return {
      config: { kind: 'custom', baseUrl: providerBaseUrl, model: 'local-test-model', apiKey: 'memory-only-test-key' },
      messages: [{ role: 'user', content }],
      agentId: 'AG-COORD',
      runId,
      maxTokens: 64,
      orchestration: policy ?? {
        expectedArtifacts: 1,
        maxCalls: 2,
        totalOutputTokens: 128,
        stageTimeoutMs: 5_000,
        groundingDisclosureApproved: true,
      },
    };
  }

  it('rejects a direct unapproved execution request', async () => {
    const response = await fetch(`${baseUrl}/api/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'run-build', runId: 'run-1', idempotencyKey: 'run-1:build' }),
    });
    expect(response.status).toBe(401);
  });

  it('applies a bounded atomic replacement batch through the authenticated development endpoint', async () => {
    const root = path.join(workspace, 'development-batch-fixture');
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'first.mjs'), 'export const first = 1;\n', 'utf8');
    await writeFile(path.join(root, 'src', 'second.mjs'), 'export const second = 1;\n', 'utf8');
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['add', '--', 'src/first.mjs', 'src/second.mjs'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const task = 'bounded HTTP batch';
    const missingCostPolicyResponse = await fetch(`${baseUrl}/api/development/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        root,
        task,
        presetId: 'local-autonomous-v1',
        creationId: 'http-create-without-cost-policy',
      }),
    });
    expect(missingCostPolicyResponse.status).toBe(400);
    expect(await missingCostPolicyResponse.json()).toMatchObject({
      error: expect.stringContaining('必须确认人民币输入费率'),
    });
    const createPayload = {
      root,
      task,
      presetId: 'local-autonomous-v1',
      creationId: 'http-create-1',
      costPolicy: developmentCostPolicy,
    };
    const [createResponse, joinedCreateResponse] = await Promise.all([
      fetch(`${baseUrl}/api/development/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(createPayload),
      }),
      fetch(`${baseUrl}/api/development/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(createPayload),
      }),
    ]);
    expect(createResponse.status).toBe(200);
    expect(joinedCreateResponse.status).toBe(200);
    const createResults = await Promise.all([createResponse.json(), joinedCreateResponse.json()]) as Record<string, any>[];
    expect(createResults[0].sessionId).toBe(createResults[1].sessionId);
    expect(createResults.filter((item) => item.replayed === true || item.recovered === true)).toHaveLength(1);
    const session = createResults[0] as { sessionId: string };
    const recoveredCreateResponse = await fetch(`${baseUrl}/api/development/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(createPayload),
    });
    expect(recoveredCreateResponse.status).toBe(200);
    expect(await recoveredCreateResponse.json()).toMatchObject({
      sessionId: session.sessionId,
      recovered: true,
    });
    const resumePayload = { sessionId: session.sessionId, root, task };
    const [resumeResponse, joinedResumeResponse] = await Promise.all([
      fetch(`${baseUrl}/api/development/sessions/resume`, {
        method: 'POST',
        headers,
        body: JSON.stringify(resumePayload),
      }),
      fetch(`${baseUrl}/api/development/sessions/resume`, {
        method: 'POST',
        headers,
        body: JSON.stringify(resumePayload),
      }),
    ]);
    expect(resumeResponse.status).toBe(200);
    expect(joinedResumeResponse.status).toBe(200);
    const resumeResults = await Promise.all([resumeResponse.json(), joinedResumeResponse.json()]) as Record<string, any>[];
    for (const result of resumeResults) expect(result).toMatchObject({ sessionId: session.sessionId, rootBound: true });
    expect(resumeResults.filter((item) => item.replayed === true)).toHaveLength(1);
    const revalidatedResume = await fetch(`${baseUrl}/api/development/sessions/resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify(resumePayload),
    });
    expect(revalidatedResume.status).toBe(200);
    expect(await revalidatedResume.json()).not.toHaveProperty('replayed');
    const analyzingProgress = {
      sessionId: session.sessionId,
      phase: 'analyzing',
      transitionId: 'http-progress-analyzing-1',
    };
    const [progressResponse, joinedProgressResponse] = await Promise.all([
      fetch(`${baseUrl}/api/development/sessions/progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify(analyzingProgress),
      }),
      fetch(`${baseUrl}/api/development/sessions/progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify(analyzingProgress),
      }),
    ]);
    expect(progressResponse.status).toBe(200);
    expect(joinedProgressResponse.status).toBe(200);
    const progressResults = await Promise.all([progressResponse.json(), joinedProgressResponse.json()]) as Record<string, any>[];
    for (const result of progressResults) expect(result).toMatchObject({ sessionId: session.sessionId, phase: 'analyzing' });
    expect(progressResults.filter((item) => item.replayed === true)).toHaveLength(1);
    const editingProgress = {
      sessionId: session.sessionId,
      phase: 'editing',
      transitionId: 'http-progress-editing-1',
    };
    const editingProgressResponse = await fetch(`${baseUrl}/api/development/sessions/progress`, {
      method: 'POST',
      headers,
      body: JSON.stringify(editingProgress),
    });
    expect(editingProgressResponse.status).toBe(200);
    expect(await editingProgressResponse.json()).toMatchObject({ phase: 'editing' });
    const recoveredProgressResponse = await fetch(`${baseUrl}/api/development/sessions/progress`, {
      method: 'POST',
      headers,
      body: JSON.stringify(analyzingProgress),
    });
    expect(recoveredProgressResponse.status).toBe(200);
    expect(await recoveredProgressResponse.json()).toMatchObject({ phase: 'editing', recovered: true });
    const mismatchedProgressResponse = await fetch(`${baseUrl}/api/development/sessions/progress`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...analyzingProgress, phase: 'failed' }),
    });
    expect(mismatchedProgressResponse.status).toBe(409);
    expect(await mismatchedProgressResponse.json()).toMatchObject({ error: expect.stringContaining('transitionId') });
    const batchPayload = {
      sessionId: session.sessionId,
      changeSetId: 'http-batch-1',
      replacements: [
        { path: 'src/first.mjs', oldText: 'first = 1', newText: 'first = 2' },
        { path: 'src/second.mjs', oldText: 'second = 1', newText: 'second = 2' },
      ],
    };
    const [batchResponse, joinedResponse] = await Promise.all([
      fetch(`${baseUrl}/api/development/replace-batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify(batchPayload),
      }),
      fetch(`${baseUrl}/api/development/replace-batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify(batchPayload),
      }),
    ]);
    expect(batchResponse.status).toBe(200);
    expect(joinedResponse.status).toBe(200);
    const concurrentResults = await Promise.all([batchResponse.json(), joinedResponse.json()]) as Record<string, any>[];
    for (const result of concurrentResults) {
      expect(result).toMatchObject({ ok: true, fileCount: 2, session: { changeSetCount: 1 } });
    }
    expect(concurrentResults.filter((item) => item.replayed === true)).toHaveLength(1);
    const replayResponse = await fetch(`${baseUrl}/api/development/replace-batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify(batchPayload),
    });
    expect(replayResponse.status).toBe(200);
    expect(await replayResponse.json()).toMatchObject({
      ok: true,
      fileCount: 2,
      replayed: true,
      session: { changeSetCount: 1 },
    });
    const mismatchResponse = await fetch(`${baseUrl}/api/development/replace-batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...batchPayload,
        replacements: [
          batchPayload.replacements[0],
          { ...batchPayload.replacements[1], newText: 'second = 3' },
        ],
      }),
    });
    expect(mismatchResponse.status).toBe(409);
    expect(await mismatchResponse.json()).toMatchObject({ error: expect.stringContaining('重放合同不匹配') });
    expect(await readFile(path.join(root, 'src', 'first.mjs'), 'utf8')).toContain('first = 2');
    expect(await readFile(path.join(root, 'src', 'second.mjs'), 'utf8')).toContain('second = 2');
    const correctedChangeSetId = 'http-batch-corrected-after-rejection';
    const rejectedResponse = await fetch(`${baseUrl}/api/development/replace-batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId: session.sessionId,
        changeSetId: correctedChangeSetId,
        replacements: [
          { path: 'src/first.mjs', oldText: 'missing first', newText: 'first = 3' },
          { path: 'src/second.mjs', oldText: 'missing second', newText: 'second = 3' },
        ],
      }),
    });
    expect(rejectedResponse.status).toBe(409);
    const correctedResponse = await fetch(`${baseUrl}/api/development/replace-batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId: session.sessionId,
        changeSetId: correctedChangeSetId,
        replacements: [
          { path: 'src/first.mjs', oldText: 'first = 2', newText: 'first = 3' },
          { path: 'src/second.mjs', oldText: 'second = 2', newText: 'second = 3' },
        ],
      }),
    });
    expect(correctedResponse.status).toBe(200);
    expect(await correctedResponse.json()).toMatchObject({
      ok: true,
      fileCount: 2,
      session: { changeSetCount: 2 },
    });
    expect(await readFile(path.join(root, 'src', 'first.mjs'), 'utf8')).toContain('first = 3');
    expect(await readFile(path.join(root, 'src', 'second.mjs'), 'utf8')).toContain('second = 3');
    const commandPayload = {
      sessionId: session.sessionId,
      executionId: 'http-command-1',
      commandId: 'git-diff-check',
    };
    const [commandResponse, joinedCommandResponse] = await Promise.all([
      fetch(`${baseUrl}/api/development/command`, {
        method: 'POST',
        headers,
        body: JSON.stringify(commandPayload),
      }),
      fetch(`${baseUrl}/api/development/command`, {
        method: 'POST',
        headers,
        body: JSON.stringify(commandPayload),
      }),
    ]);
    expect(commandResponse.status).toBe(200);
    expect(joinedCommandResponse.status).toBe(200);
    const commandResults = await Promise.all([commandResponse.json(), joinedCommandResponse.json()]) as Record<string, any>[];
    for (const result of commandResults) {
      expect(result).toMatchObject({
        executionId: commandPayload.executionId,
        commandId: commandPayload.commandId,
        status: 'passed',
        session: { sessionId: session.sessionId },
      });
    }
    expect(commandResults.filter((item) => item.replayed === true)).toHaveLength(1);
    const replayedCommand = await fetch(`${baseUrl}/api/development/command`, {
      method: 'POST',
      headers,
      body: JSON.stringify(commandPayload),
    });
    expect(replayedCommand.status).toBe(200);
    expect(await replayedCommand.json()).toMatchObject({
      executionId: commandPayload.executionId,
      replayed: true,
      status: 'passed',
    });
    const mismatchedCommand = await fetch(`${baseUrl}/api/development/command`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...commandPayload, commandId: 'test' }),
    });
    expect(mismatchedCommand.status).toBe(409);
    expect(await mismatchedCommand.json()).toMatchObject({ error: expect.stringContaining('重放合同不匹配') });
    const commandCacheIsolationWorkspace = path.join(workspace, 'command-response-replay-isolation');
    await mkdir(path.join(commandCacheIsolationWorkspace, '.agent-hub'), { recursive: true });
    await writeFile(
      path.join(commandCacheIsolationWorkspace, '.agent-hub', 'project-state.md'),
      '# Command cache isolation\n',
      'utf8',
    );
    const switchAwayFromCommandCache = await fetch(`${baseUrl}/api/workspace`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: commandCacheIsolationWorkspace }),
    });
    expect(switchAwayFromCommandCache.status).toBe(200);
    const switchBackFromCommandCache = await fetch(`${baseUrl}/api/workspace`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: workspace }),
    });
    expect(switchBackFromCommandCache.status).toBe(200);
    const commandAfterWorkspaceSwitch = await fetch(`${baseUrl}/api/development/command`, {
      method: 'POST',
      headers,
      body: JSON.stringify(commandPayload),
    });
    expect(commandAfterWorkspaceSwitch.status).toBe(409);
    expect(await commandAfterWorkspaceSwitch.json()).toMatchObject({ error: expect.stringContaining('executionId 已使用') });
    const reviewPayload = {
      sessionId: session.sessionId,
      reviewId: 'http-review-1',
      agentId: 'AG-REVIEW',
      modelId: 'integration-review-model',
      summary: 'FINDINGS:H0/M0/L0\nGATE:PASS\nbounded integration review',
    };
    const [reviewResponse, joinedReviewResponse] = await Promise.all([
      fetch(`${baseUrl}/api/development/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify(reviewPayload),
      }),
      fetch(`${baseUrl}/api/development/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify(reviewPayload),
      }),
    ]);
    expect(reviewResponse.status).toBe(200);
    expect(joinedReviewResponse.status).toBe(200);
    const reviewResults = await Promise.all([reviewResponse.json(), joinedReviewResponse.json()]) as Record<string, any>[];
    for (const result of reviewResults) {
      expect(result).toMatchObject({
        receipt: { reviewId: reviewPayload.reviewId, gate: 'PASS', summarySha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
        session: { sessionId: session.sessionId },
      });
      expect(JSON.stringify(result)).not.toContain(reviewPayload.summary);
    }
    expect(reviewResults.filter((item) => item.replayed === true)).toHaveLength(1);
    const replayedReview = await fetch(`${baseUrl}/api/development/review`, {
      method: 'POST',
      headers,
      body: JSON.stringify(reviewPayload),
    });
    expect(replayedReview.status).toBe(200);
    expect(await replayedReview.json()).toMatchObject({ replayed: true, receipt: { reviewId: reviewPayload.reviewId } });
    const mismatchedReview = await fetch(`${baseUrl}/api/development/review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...reviewPayload, summary: 'FINDINGS:H0/M0/L1\nGATE:PASS\ndrifted review' }),
    });
    expect(mismatchedReview.status).toBe(409);
    expect(await mismatchedReview.json()).toMatchObject({ error: expect.stringContaining('重放合同不匹配') });
    const correctedReviewId = 'http-review-corrected-after-rejection';
    const rejectedReview = await fetch(`${baseUrl}/api/development/review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...reviewPayload, reviewId: correctedReviewId, agentId: 'AG-DEV' }),
    });
    expect(rejectedReview.status).toBe(409);
    const correctedReview = await fetch(`${baseUrl}/api/development/review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...reviewPayload, reviewId: correctedReviewId }),
    });
    expect(correctedReview.status).toBe(200);
    expect(await correctedReview.json()).toMatchObject({ receipt: { reviewId: correctedReviewId, gate: 'PASS' } });
    const finalPayload = { sessionId: session.sessionId };
    const [finalResponse, joinedFinalResponse] = await Promise.all([
      fetch(`${baseUrl}/api/development/finalize`, {
        method: 'POST',
        headers,
        body: JSON.stringify(finalPayload),
      }),
      fetch(`${baseUrl}/api/development/finalize`, {
        method: 'POST',
        headers,
        body: JSON.stringify(finalPayload),
      }),
    ]);
    expect(finalResponse.status).toBe(200);
    expect(joinedFinalResponse.status).toBe(200);
    const finalResults = await Promise.all([finalResponse.json(), joinedFinalResponse.json()]) as Record<string, any>[];
    for (const result of finalResults) {
      expect(result).toMatchObject({ ready: true, session: { phase: 'ready' }, changedPaths: expect.any(Array) });
    }
    expect(finalResults.filter((item) => item.replayed === true)).toHaveLength(1);
    const recomputedFinal = await fetch(`${baseUrl}/api/development/finalize`, {
      method: 'POST',
      headers,
      body: JSON.stringify(finalPayload),
    });
    expect(recomputedFinal.status).toBe(200);
    const recomputedFinalPayload = await recomputedFinal.json() as Record<string, any>;
    expect(recomputedFinalPayload).toMatchObject({ ready: true, session: { phase: 'ready' } });
    expect(recomputedFinalPayload).not.toHaveProperty('replayed');
  }, 30_000);

  it('requires and consumes one crash-safe development model authorization before provider access', async () => {
    const root = path.join(workspace, 'development-model-budget-fixture');
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }), 'utf8');
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['add', '--', 'package.json'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const createResponse = await fetch(`${baseUrl}/api/development/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        root,
        task: '重构后端权限恢复协议并完成安全审查',
        presetId: 'local-autonomous-v1',
        costPolicy: developmentCostPolicy,
      }),
    });
    expect(createResponse.status).toBe(200);
    const session = (await createResponse.json()) as { sessionId: string; modelUsage: { reservedCalls: number } };
    expect(session.modelUsage.reservedCalls).toBe(0);
    const runId = `${session.sessionId}-integration-private-stage`;
    const modelRequestBase = orchestrationPayload(runId, 'delay development budget evidence');
    const readinessId = 'ready-11111111-1111-4111-8111-111111111111';
    const modelRequest = {
      ...modelRequestBase,
      config: { ...modelRequestBase.config, readinessId },
      maxTokens: 64,
      responseFormat: 'json_object' as const,
    };
    const inputBytes = Buffer.byteLength(JSON.stringify(modelRequest.messages), 'utf8');
    const inputSha256 = sha256Hex(JSON.stringify(modelRequest.messages));
    const modelRouteSha256 = hashDevelopmentModelRoute(modelRequest.config, modelRequest.responseFormat);
    const providerReadinessSha256 = sha256Hex(readinessId);
    const modelIssueRequest = {
      sessionId: session.sessionId,
      runId,
      agentId: 'AG-COORD',
      messages: modelRequest.messages,
      modelRouteSha256,
      providerReadinessSha256,
      maxOutputTokens: 64,
    };
    const oversizedIssueResponse = await fetch(`${baseUrl}/api/development/model-call`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...modelIssueRequest,
        messages: [{ role: 'user', content: 'x'.repeat(200_001) }],
      }),
    });
    expect(oversizedIssueResponse.status).toBe(400);
    expect(await oversizedIssueResponse.json()).toEqual({ error: '开发模型签发 messages 内容超限' });

    const missingAuthorization = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(modelRequest),
    });
    expect(missingAuthorization.status).toBe(403);
    expect(await missingAuthorization.json()).toMatchObject({ error: expect.stringContaining('一次性预算授权') });

    const [issueResponse, joinedIssueResponse] = await Promise.all([
      fetch(`${baseUrl}/api/development/model-call`, {
        method: 'POST',
        headers,
        body: JSON.stringify(modelIssueRequest),
      }),
      fetch(`${baseUrl}/api/development/model-call`, {
        method: 'POST',
        headers,
        body: JSON.stringify(modelIssueRequest),
      }),
    ]);
    expect(issueResponse.status).toBe(200);
    expect(joinedIssueResponse.status).toBe(200);
    const issueResults = await Promise.all([issueResponse.json(), joinedIssueResponse.json()]) as Record<string, any>[];
    expect(issueResults.filter((item) => item.replayed === true)).toHaveLength(1);
    expect(issueResults[0].authorization).toEqual(issueResults[1].authorization);
    const issued = issueResults[0];
    expect(issued.session.modelUsage).toMatchObject({
      reservedCalls: 1,
      reservedInputBytes: inputBytes,
      reservedOutputTokens: 64,
    });
    expect(issued.authorization.authorizationToken).toEqual(expect.any(String));
    const authorizedModelRequest = {
      ...modelRequest,
      messages: undefined,
      developmentAuthorization: issued.authorization,
    };
    const replayedIssueResponse = await fetch(`${baseUrl}/api/development/model-call`, {
      method: 'POST',
      headers,
      body: JSON.stringify(modelIssueRequest),
    });
    expect(replayedIssueResponse.status).toBe(200);
    const replayedIssue = await replayedIssueResponse.json() as Record<string, any>;
    expect(replayedIssue.authorization).toEqual(issued.authorization);
    expect(replayedIssue.session.modelUsage).toMatchObject({ reservedCalls: 1, unstartedReservedCalls: 1 });

    const routeMismatch = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...authorizedModelRequest,
        config: { ...modelRequest.config, model: 'local-test-mode2' },
      }),
    });
    expect(routeMismatch.status).toBe(403);
    expect(await routeMismatch.json()).toMatchObject({ error: expect.stringContaining('一次性授权与调用不匹配') });

    const readinessMismatch = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...authorizedModelRequest,
        config: { ...modelRequest.config, readinessId: 'ready-22222222-2222-4222-8222-222222222222' },
      }),
    });
    expect(readinessMismatch.status).toBe(403);
    expect(await readinessMismatch.json()).toMatchObject({ error: expect.stringContaining('一次性授权与调用不匹配') });

    const sameLengthMessages = modelRequest.messages.map((message) => ({
      ...message,
      content: `${message.content.slice(0, -1)}x`,
    }));
    expect(Buffer.byteLength(JSON.stringify(sameLengthMessages), 'utf8')).toBe(inputBytes);
    const digestMismatch = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...authorizedModelRequest,
        developmentAuthorization: {
          ...issued.authorization,
          inputSha256: sha256Hex(JSON.stringify(sameLengthMessages)),
        },
      }),
    });
    expect(digestMismatch.status).toBe(403);
    expect(await digestMismatch.json()).toMatchObject({ error: expect.stringContaining('一次性授权与调用不匹配') });

    const inputMismatch = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...authorizedModelRequest,
        developmentAuthorization: {
          ...issued.authorization,
          inputBytes: issued.authorization.inputBytes + 1,
        },
      }),
    });
    expect(inputMismatch.status).toBe(403);
    expect(await inputMismatch.json()).toMatchObject({ error: expect.stringContaining('一次性授权与调用不匹配') });

    const providerCallsBeforeModel = providerCallCount;
    const disconnectedController = new AbortController();
    const disconnectedResponsePromise = fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...authorizedModelRequest, messages: sameLengthMessages }),
      signal: disconnectedController.signal,
    });
    for (let attempt = 0; attempt < 50 && providerCallCount === providerCallsBeforeModel; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(providerCallCount).toBe(providerCallsBeforeModel + 1);
    expect(providerLastContent).toBe(modelRequest.messages[modelRequest.messages.length - 1]?.content);
    expect(providerLastContent).not.toBe(sameLengthMessages[sameLengthMessages.length - 1]?.content);
    expect(providerLastResponseFormat).toBe('json_object');
    disconnectedController.abort();
    await expect(disconnectedResponsePromise).rejects.toMatchObject({ name: 'AbortError' });
    const joinedResponsePromise = fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(authorizedModelRequest),
    });
    const joinedResponse = await joinedResponsePromise;
    expect(joinedResponse.status).toBe(200);
    const joinedPayload = await joinedResponse.json() as Record<string, any>;
    expect(joinedPayload).toMatchObject({
      text: 'local provider result',
      replayed: true,
      evidence: { acceptanceStatus: 'provider_returned' },
      run: { status: 'awaiting_acceptance' },
    });
    const developmentRuntimeResponse = await fetch(`${baseUrl}/api/runtime-state`, { headers });
    expect(developmentRuntimeResponse.status).toBe(200);
    const developmentRuntime = await developmentRuntimeResponse.json() as Record<string, any>;
    const developmentEvents = developmentRuntime.events.filter((event: any) => event.runId === runId);
    expect(JSON.stringify(developmentEvents)).not.toContain('delay development budget evidence');
    expect(JSON.stringify(developmentEvents)).not.toContain('local provider result');
    expect(developmentEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'agent_request',
        summary: '开发模型请求已按脱敏合同转发；原始消息不进入运行事件',
      }),
      expect.objectContaining({
        type: 'agent_message',
        summary: '开发模型返回已生成；Provider 正文仅回传本次调用',
      }),
    ]));
    const providerCallsAfterSuccess = providerCallCount;
    const failedSwitch = await fetch(`${baseUrl}/api/workspace`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: path.join(workspace, 'missing-observer-workspace') }),
    });
    expect(failedSwitch.status).toBe(409);
    const replayAfterFailedSwitch = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(authorizedModelRequest),
    });
    expect(replayAfterFailedSwitch.status).toBe(200);
    expect(await replayAfterFailedSwitch.json()).toMatchObject({ text: 'local provider result', replayed: true });
    const reselectWorkspace = await fetch(`${baseUrl}/api/workspace`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: workspace }),
    });
    expect(reselectWorkspace.status).toBe(200);
    const reselectedReplay = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(authorizedModelRequest),
    });
    expect(reselectedReplay.status).toBe(200);
    expect(await reselectedReplay.json()).toMatchObject({ text: 'local provider result', replayed: true });
    expect(providerCallCount).toBe(providerCallsAfterSuccess);
    const replayContractMismatch = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...authorizedModelRequest,
        orchestration: { ...modelRequest.orchestration, totalOutputTokens: 127 },
      }),
    });
    expect(replayContractMismatch.status).toBe(409);
    expect(await replayContractMismatch.json()).toMatchObject({ error: expect.stringContaining('响应重放合同不匹配') });
    const isolatedWorkspace = path.join(workspace, 'response-replay-isolation');
    await mkdir(path.join(isolatedWorkspace, '.agent-hub'), { recursive: true });
    await writeFile(path.join(isolatedWorkspace, '.agent-hub', 'project-state.md'), '# Isolated project\n', 'utf8');
    const switchAway = await fetch(`${baseUrl}/api/workspace`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: isolatedWorkspace }),
    });
    expect(switchAway.status).toBe(200);
    const crossWorkspaceReplay = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(authorizedModelRequest),
    });
    expect(crossWorkspaceReplay.status).toBe(409);
    expect(await crossWorkspaceReplay.json()).toMatchObject({
      error: expect.stringMatching(/签发消息正文不可用.*新 runId/),
    });
    expect(providerCallCount).toBe(providerCallsAfterSuccess);
    const switchBack = await fetch(`${baseUrl}/api/workspace`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: workspace }),
    });
    expect(switchBack.status).toBe(200);
    const acceptanceResponse = await fetch(`${baseUrl}/api/orchestration/acceptance`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        runId: modelRequest.runId,
        agentId: modelRequest.agentId,
        evidenceId: joinedPayload.evidence.evidenceId,
        outputSha256: joinedPayload.evidence.outputSha256,
        decision: 'accepted',
      }),
    });
    expect(acceptanceResponse.status).toBe(200);
    expect(await acceptanceResponse.json()).toMatchObject({ run: { status: 'completed' } });
    const clearedReplay = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(authorizedModelRequest),
    });
    expect(clearedReplay.status).toBe(409);
    expect(await clearedReplay.json()).toMatchObject({
      error: expect.stringMatching(/签发消息正文不可用.*新 runId/),
    });
    expect(providerCallCount).toBe(providerCallsAfterSuccess);
    const consumedIssueResponse = await fetch(`${baseUrl}/api/development/model-call`, {
      method: 'POST',
      headers,
      body: JSON.stringify(modelIssueRequest),
    });
    expect(consumedIssueResponse.status).toBe(409);
    expect(await consumedIssueResponse.json()).toMatchObject({ error: expect.stringContaining('已签发并启动') });
    expect(providerCallCount).toBe(providerCallsAfterSuccess);
    const consumedSnapshot = await fetch(`${baseUrl}/api/development/snapshot`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId: session.sessionId }),
    });
    expect(consumedSnapshot.status).toBe(200);
    expect(await consumedSnapshot.json()).toMatchObject({
      session: { modelUsage: { reservedCalls: 1, startedCalls: 1, unstartedReservedCalls: 0 } },
    });
    const ledger = await readFile(path.join(workspace, '.development-sessions', `${session.sessionId}.json`), 'utf8');
    expect(ledger).not.toContain(issued.authorization.authorizationToken);
    expect(ledger).not.toContain('integration-private-stage');
    expect(ledger).toContain('"consumedAt"');
    expect(ledger).toContain(`"inputBytes": ${inputBytes}`);
    expect(ledger).toContain(`"inputSha256": "${inputSha256}"`);
    expect(ledger).toContain(`"modelRouteSha256": "${modelRouteSha256}"`);
    expect(ledger).toContain(`"providerReadinessSha256": "${providerReadinessSha256}"`);
    expect(ledger).not.toContain('development budget evidence');
    expect(ledger).not.toContain(readinessId);
    expect(ledger).not.toContain('local-test-model');
    expect(ledger).not.toContain(providerBaseUrl);
    expect(ledger).toContain('"observedInputTokens": 9');
    expect(ledger).toContain('"observedOutputTokens": 7');
    expect(ledger).toContain('"usageReportedAt"');

    const laterClearedReplay = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(authorizedModelRequest),
    });
    expect(laterClearedReplay.status).toBe(409);
    expect(await laterClearedReplay.json()).toMatchObject({
      error: expect.stringMatching(/签发消息正文不可用.*新 runId/),
    });
    expect(providerCallCount).toBe(providerCallsAfterSuccess);
    const snapshot = await fetch(`${baseUrl}/api/development/snapshot`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId: session.sessionId }),
    });
    expect(snapshot.status).toBe(200);
    expect(await snapshot.json()).toMatchObject({
      session: {
        modelUsage: {
          startedCalls: 1,
          usageReportedCalls: 1,
          usageMissingStartedCalls: 0,
          observedInputTokens: 9,
          observedOutputTokens: 7,
          failureReportedCalls: 0,
          retryableFailureCalls: 0,
          transientRetryCalls: 0,
        },
      },
    });

    const failureCreateResponse = await fetch(`${baseUrl}/api/development/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        root,
        task: '重构后端 usage 失败回执并完成安全审查',
        presetId: 'local-autonomous-v1',
        costPolicy: developmentCostPolicy,
      }),
    });
    expect(failureCreateResponse.status).toBe(200);
    const failureSession = await failureCreateResponse.json() as Record<string, any>;
    const failureRunId = `${failureSession.sessionId}-long-text-usage-stage`;
    const failureModelRequestBase = orchestrationPayload(failureRunId, 'long-text usage evidence');
    const failureReadinessId = 'ready-33333333-3333-4333-8333-333333333333';
    const failureModelRequest = {
      ...failureModelRequestBase,
      config: { ...failureModelRequestBase.config, readinessId: failureReadinessId },
      maxTokens: 64,
    };
    const failureInputBytes = Buffer.byteLength(JSON.stringify(failureModelRequest.messages), 'utf8');
    const failureInputSha256 = sha256Hex(JSON.stringify(failureModelRequest.messages));
    const failureModelRouteSha256 = hashDevelopmentModelRoute(failureModelRequest.config);
    const failureIssueResponse = await fetch(`${baseUrl}/api/development/model-call`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId: failureSession.sessionId,
        runId: failureRunId,
        agentId: 'AG-COORD',
        messages: failureModelRequest.messages,
        modelRouteSha256: failureModelRouteSha256,
        providerReadinessSha256: sha256Hex(failureReadinessId),
        maxOutputTokens: 64,
      }),
    });
    expect(failureIssueResponse.status).toBe(200);
    const failureIssue = await failureIssueResponse.json() as Record<string, any>;
    const authorizedFailureModelRequest = {
      ...failureModelRequest,
      messages: undefined,
      developmentAuthorization: failureIssue.authorization,
    };
    const oversizedModelResponse = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(authorizedFailureModelRequest),
    });
    expect(oversizedModelResponse.status).toBe(502);
    expect(await oversizedModelResponse.json()).toMatchObject({
      error: expect.stringContaining('8000 字符上限'),
      failure: { code: 'PROVIDER_CALL_REJECTED', retryable: false },
    });
    const providerCallsAfterFailure = providerCallCount;
    const replayedFailure = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(authorizedFailureModelRequest),
    });
    expect(replayedFailure.status).toBe(502);
    expect(await replayedFailure.json()).toMatchObject({
      error: expect.stringContaining('8000 字符上限'),
      failure: { code: 'PROVIDER_CALL_REJECTED', retryable: false },
      replayed: true,
    });
    expect(providerCallCount).toBe(providerCallsAfterFailure);
    const failureRuntimeResponse = await fetch(`${baseUrl}/api/runtime-state`, { headers });
    expect(failureRuntimeResponse.status).toBe(200);
    const failureRuntime = await failureRuntimeResponse.json() as Record<string, any>;
    const failureEvents = failureRuntime.events.filter((event: any) => event.runId === failureRunId);
    expect(JSON.stringify(failureEvents)).not.toContain('long-text usage evidence');
    expect(failureEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'agent_error',
        summary: 'failure=PROVIDER_CALL_REJECTED; retryable=false',
      }),
    ]));
    const failureSnapshot = await fetch(`${baseUrl}/api/development/snapshot`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId: failureSession.sessionId }),
    });
    expect(failureSnapshot.status).toBe(200);
    expect(await failureSnapshot.json()).toMatchObject({
      session: {
        modelUsage: {
          startedCalls: 1,
          usageReportedCalls: 1,
          usageMissingStartedCalls: 0,
          observedInputTokens: 9,
          observedOutputTokens: 7,
          failureReportedCalls: 1,
          retryableFailureCalls: 0,
          transientRetryCalls: 0,
        },
      },
    });
  }, 15_000);

  it('returns stable retry metadata for temporary HTTP and transport failures', async () => {
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const temporaryResponse = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(orchestrationPayload('typed-temporary-upstream', 'temporary-503')),
    });
    expect(temporaryResponse.status).toBe(502);
    expect(await temporaryResponse.json()).toMatchObject({
      error: '上游 HTTP 503',
      failure: { code: 'UPSTREAM_TEMPORARY', retryable: true },
    });

    const closedPort = await reservePort();
    const transportPayload = orchestrationPayload('typed-transport-failure', 'transport failure');
    transportPayload.config = {
      kind: 'custom',
      baseUrl: `http://127.0.0.1:${closedPort}/v1`,
      model: 'local-test-model',
      apiKey: 'memory-only-test-key',
    };
    const transportResponse = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(transportPayload),
    });
    expect(transportResponse.status).toBe(502);
    expect(await transportResponse.json()).toMatchObject({
      error: 'fetch failed',
      failure: { code: 'UPSTREAM_TRANSPORT', retryable: true },
    });
  });

  it('keeps safe-pilot authorization issuance disabled without the explicit startup flag', async () => {
    const guardedPort = await reservePort();
    const guardedBaseUrl = `http://127.0.0.1:${guardedPort}`;
    const guardedChild = spawn(process.execPath, [
      'server/server.mjs',
      '--workspace',
      workspace,
      '--port',
      String(guardedPort),
    ], {
      cwd: repoRoot,
      stdio: 'ignore',
      windowsHide: true,
    });
    try {
      const health = await waitForHealth(guardedBaseUrl);
      expect(health.safePilotIssuanceEnabled).toBe(false);
      const session = await bootstrapSession(guardedBaseUrl);
      const response = await fetch(`${guardedBaseUrl}/api/safe-pilot/authorizations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-agenthub-session': String(session.sessionToken ?? '') },
        body: JSON.stringify({ issueConfirmed: true }),
      });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining('DemoScenario014 正式服务仅开放预检'),
      });
    } finally {
      guardedChild.kill();
    }
  });

  it('keeps issuance disabled when the startup flag lacks any exact hash pin', async () => {
    const guardedPort = await reservePort();
    const guardedBaseUrl = `http://127.0.0.1:${guardedPort}`;
    const guardedChild = spawn(process.execPath, [
      'server/server.mjs',
      '--workspace',
      workspace,
      '--port',
      String(guardedPort),
      '--enable-safe-pilot-issuance',
    ], {
      cwd: repoRoot,
      stdio: 'ignore',
      windowsHide: true,
    });
    try {
      const health = await waitForHealth(guardedBaseUrl);
      expect(health).toMatchObject({
        safePilotIssuanceRequested: true,
        safePilotIssuanceEnabled: false,
        safePilotIssuerPinning: { ready: false },
      });
      const session = await bootstrapSession(guardedBaseUrl);
      const response = await fetch(`${guardedBaseUrl}/api/safe-pilot/authorizations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-agenthub-session': String(session.sessionToken ?? '') },
        body: JSON.stringify({ issueConfirmed: true }),
      });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('服务启动时锁定') });
    } finally {
      guardedChild.kill();
      await new Promise<void>((resolve) => guardedChild.once('exit', () => resolve()));
    }
  });

  it('preflights the DemoScenario014 safe launcher without creating a model run', async () => {
    const profile = pinnedSafePilotProfile;
    const response = await fetch(`${baseUrl}/api/safe-pilot/preflight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({
        runId: 'pilot-DemoScenario014-integration',
        taskText: pinnedSafePilotTaskText,
        contextText: pinnedSafePilotContextText,
        profile,
        humanApproval: { approved: true, approvalRef: 'approval-DemoScenario014-integration' },
      }),
    });
    expect(response.status).toBe(200);
    const result = await response.json() as { ready: boolean; issued: boolean; authorizationSha256: string };
    expect(result).toMatchObject({ ready: true, issued: false });
    expect(result.authorizationSha256).toMatch(/^[a-f0-9]{64}$/);
    const state = await (await fetch(`${baseUrl}/api/runtime-state`, {
      headers: { 'x-agenthub-session': sessionToken },
    })).json() as { orchestrationRuns: Array<{ runId: string }>; events: Array<{ type: string }> };
    expect(state.orchestrationRuns.some((run) => run.runId === 'pilot-DemoScenario014-integration')).toBe(false);
    expect(state.events.some((event) => event.type === 'safe_pilot_preflight')).toBe(true);
  });

  it('rejects a ready preflight whose task hash differs from the server startup pin', async () => {
    const response = await fetch(`${baseUrl}/api/safe-pilot/authorizations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({
        issueConfirmed: true,
        preflight: {
          runId: 'pilot-pinned-task-mismatch',
          taskText: '另一项未经服务启动锁定的任务',
          contextText: pinnedSafePilotContextText,
          profile: pinnedSafePilotProfile,
          humanApproval: { approved: true, approvalRef: 'approval-pinned-task-mismatch' },
        },
      }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('任务哈希') });
  });

  it('rejects safe-pilot issuance when the runId is already present in the orchestration ledger', async () => {
    const runId = 'pilot-DemoScenario014-preused-run';
    const modelResponse = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify(orchestrationPayload(runId, 'preused generic run')),
    });
    expect(modelResponse.status).toBe(200);
    const profile = pinnedSafePilotProfile;
    const issueResponse = await fetch(`${baseUrl}/api/safe-pilot/authorizations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({
        issueConfirmed: true,
        preflight: {
          runId,
          taskText: pinnedSafePilotTaskText,
          contextText: pinnedSafePilotContextText,
          profile,
          humanApproval: { approved: true, approvalRef: 'approval-DemoScenario014-preused-run' },
        },
      }),
    });
    expect(issueResponse.status).toBe(409);
    await expect(issueResponse.json()).resolves.toMatchObject({
      error: expect.stringContaining('runId 已被编排账本使用'),
    });
  });

  it('enforces one-run authorization, accepted handoffs, final human acceptance and zero side effects', async () => {
    const taskText = pinnedSafePilotTaskText;
    const contextText = pinnedSafePilotContextText;
    const runId = 'pilot-DemoScenario014-authorized';
    const profile = pinnedSafePilotProfile;
    const preflight = {
      runId,
      taskText,
      contextText,
      profile,
      humanApproval: { approved: true, approvalRef: 'approval-DemoScenario014-authorized' },
    };
    const issueResponse = await fetch(`${baseUrl}/api/safe-pilot/authorizations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({ preflight, issueConfirmed: true }),
    });
    expect(issueResponse.status).toBe(200);
    const issued = await issueResponse.json() as Record<string, any>;
    expect(issued.authorization).toMatchObject({ runId, status: 'issued', profileId: 'pilot-4-readonly-v2' });
    expect(issued.authorization).toMatchObject({ humanWaitDeadlineAt: null, usage: { activeElapsedMs: 0 } });
    const safePilotAuthorization = {
      authorizationId: issued.authorization.authorizationId,
      authorizationToken: issued.authorizationToken,
      taskText,
      contextText,
    };
    const policy = {
      expectedArtifacts: 4,
      maxCalls: 5,
      totalOutputTokens: 1_600,
      stageTimeoutMs: 45_000,
      groundingDisclosureApproved: true,
    };
    const missingAuthorization = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify(orchestrationPayload(runId, 'missing safe authorization', policy)),
    });
    expect(missingAuthorization.status).toBe(403);
    await expect(missingAuthorization.json()).resolves.toMatchObject({
      error: expect.stringContaining('必须携带匹配的安全启动授权'),
    });
    let previous: Record<string, any> | null = null;
    for (const agentId of SAFE_PILOT_AGENT_ORDER) {
      if (previous && agentId === 'PRO') {
        const missingHandoff = await fetch(`${baseUrl}/api/llm`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
          body: JSON.stringify({
            ...orchestrationPayload(runId, 'missing handoff', policy),
            agentId,
            safePilotAuthorization,
          }),
        });
        expect(missingHandoff.status).toBe(409);
        expect(await missingHandoff.json()).toMatchObject({ error: '后续 Agent 必须携带上一阶段已验收 handoff' });
      }
      const handoff = previous ? {
        version: '1.0.0',
        runId,
        fromAgentId: previous.agentId,
        toAgentId: agentId,
        evidenceId: previous.evidenceId,
        outputSha256: previous.outputSha256,
        acceptanceId: previous.acceptanceId,
      } : undefined;
      const modelResponse = await fetch(`${baseUrl}/api/llm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
        body: JSON.stringify({
          ...orchestrationPayload(runId, `${agentId} local synthetic artifact`, policy),
          agentId,
          handoff,
          safePilotAuthorization,
        }),
      });
      expect(modelResponse.status).toBe(200);
      const model = await modelResponse.json() as Record<string, any>;
      expect(model.run.status).toBe('awaiting_acceptance');
      const acceptanceResponse = await fetch(`${baseUrl}/api/orchestration/acceptance`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
        body: JSON.stringify({
          runId,
          agentId,
          evidenceId: model.evidence.evidenceId,
          outputSha256: model.evidence.outputSha256,
          decision: 'accepted',
          safePilotAuthorization: {
            authorizationId: safePilotAuthorization.authorizationId,
            authorizationToken: safePilotAuthorization.authorizationToken,
          },
        }),
      });
      const acceptance = await acceptanceResponse.json() as Record<string, any>;
      expect(acceptanceResponse.status, JSON.stringify(acceptance)).toBe(200);
      expect(acceptance.authorization).toMatchObject({
        runId,
        usage: { callsStarted: SAFE_PILOT_AGENT_ORDER.indexOf(agentId) + 1 },
      });
      previous = acceptance.evidence;
      if (agentId === 'AG-REVIEW') {
        expect(acceptance.run.status).toBe('awaiting_human_acceptance');
        expect(acceptance.authorization.humanWaitDeadlineAt).toBeGreaterThan(Date.now() + 290_000);
        expect(acceptance.authorization.usage.activeElapsedMs).toBeGreaterThanOrEqual(0);
      }
    }
    const humanResponse = await fetch(`${baseUrl}/api/safe-pilot/human-acceptance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({
        authorizationId: safePilotAuthorization.authorizationId,
        authorizationToken: safePilotAuthorization.authorizationToken,
        humanAccepted: true,
      }),
    });
    expect(humanResponse.status).toBe(200);
    const human = await humanResponse.json() as Record<string, any>;
    expect(human.run.status).toBe('completed');
    expect(human.authorization).toMatchObject({
      status: 'completed',
      acceptedAgentIds: ['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW'],
      usage: { callsStarted: 4, manualRetriesUsed: 0 },
      humanWaitDeadlineAt: null,
    });

    const stages = SAFE_PILOT_AGENT_ORDER.map((agentCode, index) => ({
      agentId: agentCode,
      agentCode,
      canonicalAgentCode: agentCode,
      agentName: agentCode,
      phaseLabel: `stage-${index}`,
      narration: 'synthetic',
    }));
    const pipeline = pipelineReducer(INITIAL_PIPELINE_STATE, {
      type: 'start',
      runId,
      mode: 'connected',
      taskText,
      stages,
    });
    const checkpointResponse = await fetch(`${baseUrl}/api/checkpoints`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({ agentId: 'AG-COORD', checkpoint: createTaskCheckpoint(pipeline, {}, 1) }),
    });
    expect(checkpointResponse.status).toBe(403);
    expect(await checkpointResponse.json()).toMatchObject({ error: '四 Agent run 固定 checkpoint=false' });

    const actionResponse = await fetch(`${baseUrl}/api/approvals/grant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({
        kind: 'save-note',
        runId,
        agentId: 'AG-COORD',
        title: 'must block',
        content: 'must block',
        idempotencyKey: `${runId}:save-note`,
      }),
    });
    expect(actionResponse.status).toBe(403);
    expect(await actionResponse.json()).toMatchObject({ error: '四 Agent run 仅允许 call_model，副作用动作固定关闭' });
  });

  it('terminalizes a safe-pilot run when a hard budget blocks the next post-retry stage', async () => {
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const taskText = pinnedSafePilotTaskText;
    const contextText = pinnedSafePilotContextText;
    const runId = 'pilot-terminal-budget-after-retry';
    const profile = pinnedSafePilotProfile;
    const preflight = {
      runId,
      taskText,
      contextText,
      profile,
      humanApproval: { approved: true, approvalRef: 'approval-terminal-budget-after-retry' },
    };
    const issueResponse = await fetch(`${baseUrl}/api/safe-pilot/authorizations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ preflight, issueConfirmed: true }),
    });
    const issued = await issueResponse.json() as Record<string, any>;
    expect(issueResponse.status, JSON.stringify(issued)).toBe(200);
    const safePilotAuthorization = {
      authorizationId: issued.authorization.authorizationId,
      authorizationToken: issued.authorizationToken,
      taskText,
      contextText,
    };
    const policy = {
      expectedArtifacts: 4,
      maxCalls: 5,
      totalOutputTokens: 1_600,
      stageTimeoutMs: 45_000,
      groundingDisclosureApproved: true,
    };

    async function callCoordinator(content: string, repair?: Record<string, unknown>) {
      const payload = orchestrationPayload(runId, content, policy);
      if (repair) payload.messages = [{
        role: 'user',
        content: `${content}\n${DemoScenario015_RETRY_REPAIR_MARKER}\n${JSON.stringify(repair)}`,
      }];
      const response = await fetch(`${baseUrl}/api/llm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...payload,
          maxTokens: 800,
          safePilotAuthorization,
        }),
      });
      const body = await response.json() as Record<string, any>;
      expect(response.status, JSON.stringify(body)).toBe(200);
      return body;
    }

    async function decide(evidence: Record<string, any>, decision: 'accepted' | 'rejected') {
      const response = await fetch(`${baseUrl}/api/orchestration/acceptance`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          runId,
          agentId: 'AG-COORD',
          evidenceId: evidence.evidenceId,
          outputSha256: evidence.outputSha256,
          decision,
          safePilotAuthorization: {
            authorizationId: safePilotAuthorization.authorizationId,
            authorizationToken: safePilotAuthorization.authorizationToken,
          },
        }),
      });
      const body = await response.json() as Record<string, any>;
      expect(response.status, JSON.stringify(body)).toBe(200);
      return body;
    }

    const first = await callCoordinator('first synthetic result');
    const rejected = await decide(first.evidence, 'rejected');
    expect(rejected.authorization.status).toBe('waiting_retry_approval');
    expect(rejected.authorization.humanWaitDeadlineAt).toBeGreaterThan(Date.now() + 290_000);

    const retryResponse = await fetch(`${baseUrl}/api/safe-pilot/retry`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        authorizationId: safePilotAuthorization.authorizationId,
        authorizationToken: safePilotAuthorization.authorizationToken,
        humanApproved: true,
      }),
    });
    const retry = await retryResponse.json() as Record<string, any>;
    expect(retryResponse.status, JSON.stringify(retry)).toBe(200);
    expect(retry.authorization.usage.manualRetriesUsed).toBe(1);
    expect(retry.authorization.humanWaitDeadlineAt).toBeNull();

    const missingRepairResponse = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...orchestrationPayload(runId, 'retry without repair feedback', policy),
        maxTokens: 800,
        safePilotAuthorization,
      }),
    });
    const missingRepair = await missingRepairResponse.json() as Record<string, any>;
    expect(missingRepairResponse.status, JSON.stringify(missingRepair)).toBe(409);
    expect(missingRepair.error).toContain('必须且只能携带一份本地验收修复单');

    const repair = {
      version: '1.0.0',
      boundary: 'TRUSTED_LOCAL_VALIDATION_REPAIR',
      agentCode: 'AG-COORD',
      evidenceId: first.evidence.evidenceId,
      outputSha256: first.evidence.outputSha256,
      validationCode: 'local_validation',
      validationProblem: '合成结果未通过本地验收',
      repairRules: [
        'REWRITE_CURRENT_STAGE_ONLY',
        'PRESERVE_TASK_GROUNDING_HANDOFF',
        'NO_NEW_FACTS',
        'SATISFY_LOCAL_VALIDATION_CONTRACT',
      ],
    };
    const second = await callCoordinator('review second synthetic result', repair);
    const accepted = await decide(second.evidence, 'accepted');
    const handoff = {
      version: '1.0.0',
      runId,
      fromAgentId: 'AG-COORD',
      toAgentId: 'PRO',
      evidenceId: accepted.evidence.evidenceId,
      outputSha256: accepted.evidence.outputSha256,
      acceptanceId: accepted.evidence.acceptanceId,
    };
    const blockedResponse = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...orchestrationPayload(runId, 'must block before provider', policy),
        agentId: 'PRO',
        maxTokens: 1,
        handoff,
        safePilotAuthorization,
      }),
    });
    const blocked = await blockedResponse.json() as Record<string, any>;
    expect(blockedResponse.status, JSON.stringify(blocked)).toBe(429);
    expect(blocked.error).toContain('输出 Token 预算不足');
    expect(blocked.run.status).toBe('failed');

    const runsResponse = await fetch(`${baseUrl}/api/orchestration/runs`, { headers });
    const runs = await runsResponse.json() as Record<string, any>;
    expect(runs.runs.find((run: Record<string, any>) => run.runId === runId)).toMatchObject({
      status: 'failed',
      callsStarted: 2,
      callsSucceeded: 2,
    });
  });

  it('enforces a manual per-Agent capability revoke at grant and execution time', async () => {
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const action = {
      kind: 'save-note',
      runId: 'run-permission-test',
      agentId: 'AG-COORD',
      idempotencyKey: 'run-permission-test:save-note',
      title: 'must-not-write',
      content: 'blocked content',
    };

    const stateResponse = await fetch(`${baseUrl}/api/runtime-state`, { headers });
    const state = (await stateResponse.json()) as { profiles: unknown[] };
    expect(stateResponse.status).toBe(200);
    expect(state.profiles).toHaveLength(8);

    const enableResponse = await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-COORD', capability: 'save_note', allowed: true }),
    });
    expect(enableResponse.status).toBe(200);

    const firstGrantResponse = await fetch(`${baseUrl}/api/approvals/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify(action),
    });
    const firstGrant = (await firstGrantResponse.json()) as Record<string, unknown>;
    expect(firstGrantResponse.status).toBe(200);

    const revokeResponse = await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-COORD', capability: 'save_note', allowed: false }),
    });
    expect(revokeResponse.status).toBe(200);

    const executeResponse = await fetch(`${baseUrl}/api/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...action,
        approvalId: firstGrant.approvalId,
        approvalToken: firstGrant.approvalToken,
      }),
    });
    expect(executeResponse.status).toBe(403);

    const deniedGrantResponse = await fetch(`${baseUrl}/api/approvals/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...action, runId: 'run-permission-denied', idempotencyKey: 'run-permission-denied:note' }),
    });
    expect(deniedGrantResponse.status).toBe(403);

    const restoreResponse = await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-COORD', capability: 'save_note', allowed: true }),
    });
    expect(restoreResponse.status).toBe(200);

    const outputFiles = await readdir(workspace).catch(() => []);
    expect(outputFiles).not.toContain('must-not-write');
  });

  it('orchestrates a local model call and returns hash-addressed evidence', async () => {
    const response = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify(orchestrationPayload('run-model-evidence', 'produce artifact')),
    });
    const payload = (await response.json()) as Record<string, any>;
    expect(response.status).toBe(200);
    expect(payload.text).toBe('local provider result');
    expect(payload.evidence.outputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.evidence.requestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.evidence).not.toHaveProperty('apiKey');
    expect(payload.run).toMatchObject({ status: 'awaiting_acceptance', callsStarted: 1, callsSucceeded: 1 });
    expect(payload.evidence.acceptanceStatus).toBe('provider_returned');
    expect(payload.evidence.terminationReason).toBe('stop');
    const acceptanceResponse = await fetch(`${baseUrl}/api/orchestration/acceptance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({
        runId: 'run-model-evidence',
        agentId: 'AG-COORD',
        evidenceId: payload.evidence.evidenceId,
        outputSha256: payload.evidence.outputSha256,
        decision: 'accepted',
      }),
    });
    expect(acceptanceResponse.status).toBe(200);
    const acceptance = await acceptanceResponse.json() as Record<string, any>;
    expect(acceptance.evidence.acceptanceStatus).toBe('accepted');
    expect(acceptance.run.status).toBe('completed');

    const stateResponse = await fetch(`${baseUrl}/api/runtime-state`, {
      headers: { 'x-agenthub-session': sessionToken },
    });
    const state = (await stateResponse.json()) as Record<string, any>;
    expect(state.orchestrationRuns.find((run: any) => run.runId === 'run-model-evidence')?.evidence).toHaveLength(1);
    const ordinaryEvents = state.events.filter((event: any) => event.runId === 'run-model-evidence');
    expect(ordinaryEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'agent_request', summary: '模型请求已按会话能力转发；原始消息不进入运行事件' }),
      expect.objectContaining({ type: 'agent_message', summary: '模型返回已生成；Provider 正文仅回传本次调用' }),
    ]));
    expect(JSON.stringify(state)).not.toContain('memory-only-test-key');
  });

  it('records a trusted provider truncation reason without accepting the artifact', async () => {
    const response = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify(orchestrationPayload('run-model-truncated', 'truncated provider result')),
    });
    const payload = (await response.json()) as Record<string, any>;
    expect(response.status).toBe(200);
    expect(payload.evidence).toMatchObject({
      acceptanceStatus: 'provider_returned',
      terminationReason: 'length',
    });
    expect(payload.run.status).toBe('awaiting_acceptance');
  });

  it('blocks project-grounding disclosure before the provider when run approval is absent', async () => {
    const request = orchestrationPayload('run-grounding-without-approval', 'UNTRUSTED_PROJECT_CONTEXT');
    request.orchestration.groundingDisclosureApproved = false;
    const response = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: '项目摘要外发未获得本次 run 的显式批准' });
  });

  it('rejects a call that exceeds the reserved output-token budget', async () => {
    const policy = { expectedArtifacts: 2, maxCalls: 2, totalOutputTokens: 128, stageTimeoutMs: 5_000, groundingDisclosureApproved: true };
    const first = orchestrationPayload('run-model-budget', 'first artifact', policy);
    first.maxTokens = 100;
    const firstResponse = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify(first),
    });
    expect(firstResponse.status).toBe(200);
    const firstPayload = await firstResponse.json() as Record<string, any>;
    const firstAcceptanceResponse = await fetch(`${baseUrl}/api/orchestration/acceptance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({
        runId: 'run-model-budget',
        agentId: 'AG-COORD',
        evidenceId: firstPayload.evidence.evidenceId,
        outputSha256: firstPayload.evidence.outputSha256,
        decision: 'accepted',
      }),
    });
    const firstAcceptance = await firstAcceptanceResponse.json() as Record<string, any>;
    expect(firstAcceptanceResponse.status).toBe(200);

    const secondResponse = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({
        ...orchestrationPayload('run-model-budget', 'second artifact', policy),
        agentId: 'AG-SEC',
        handoff: {
          version: '1.0.0',
          runId: 'run-model-budget',
          fromAgentId: 'AG-COORD',
          toAgentId: 'AG-SEC',
          evidenceId: firstAcceptance.evidence.evidenceId,
          outputSha256: firstAcceptance.evidence.outputSha256,
          acceptanceId: firstAcceptance.evidence.acceptanceId,
        },
      }),
    });
    expect(secondResponse.status).toBe(429);

    const stages = ['AG-COORD', 'AG-SEC'].map((code, index) => ({
      agentId: code.toLowerCase(),
      agentCode: code,
      canonicalAgentCode: code,
      agentName: code,
      phaseLabel: `stage-${index}`,
      narration: 'test narration',
    }));
    let pipeline = pipelineReducer(INITIAL_PIPELINE_STATE, {
      type: 'start',
      runId: 'run-model-budget',
      mode: 'connected',
      taskText: 'budget recovery',
      stages,
    });
    pipeline = pipelineReducer(pipeline, { type: 'stageSucceeded', stageIndex: 0, summary: 'artifact ready' });
    pipeline = pipelineReducer(pipeline, { type: 'advance' });
    pipeline = pipelineReducer(pipeline, { type: 'advance' });
    const checkpoint = createTaskCheckpoint(pipeline, {}, 1, '2099-01-01T00:00:00.000Z');
    const checkpointResponse = await fetch(`${baseUrl}/api/checkpoints`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({ agentId: 'AG-COORD', checkpoint }),
    });
    expect(checkpointResponse.status).toBe(200);
  });

  it('rejects an oversized upstream response body', async () => {
    const response = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify(orchestrationPayload('run-model-oversized', 'oversized response')),
    });
    expect(response.status).toBe(502);
    expect((await response.json()) as Record<string, unknown>).toMatchObject({ error: '上游响应超过 1MB 上限' });
  });

  it('rejects model text that cannot fit the checkpoint receipt contract', async () => {
    const response = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify(orchestrationPayload('run-model-long-text', 'long-text response')),
    });
    expect(response.status).toBe(502);
    expect((await response.json()) as Record<string, unknown>).toMatchObject({ error: '上游文本超过 8000 字符上限' });
  });

  it('cancels an active orchestration run and aborts its upstream request', async () => {
    const modelRequest = fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify(
        orchestrationPayload('run-model-cancel', 'delay response', {
          expectedArtifacts: 2,
          maxCalls: 2,
          totalOutputTokens: 128,
          stageTimeoutMs: 5_000,
          groundingDisclosureApproved: true,
        }),
      ),
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const cancelResponse = await fetch(`${baseUrl}/api/orchestration/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthub-session': sessionToken },
      body: JSON.stringify({ runId: 'run-model-cancel' }),
    });
    expect(cancelResponse.status).toBe(200);
    expect((await cancelResponse.json()) as Record<string, any>).toMatchObject({
      ok: true,
      run: { status: 'cancelled' },
    });
    expect((await modelRequest).status).toBe(409);
  });

  it('rejects parameters changed after approval', async () => {
    const action = {
      kind: 'save-note',
      runId: 'run-tamper-test',
      agentId: 'AG-COORD',
      idempotencyKey: 'run-tamper-test:save-note',
      title: 'approved-note',
      content: 'approved content',
    };
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const grantResponse = await fetch(`${baseUrl}/api/approvals/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify(action),
    });
    const grant = (await grantResponse.json()) as Record<string, unknown>;
    const response = await fetch(`${baseUrl}/api/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...action,
        content: 'changed after approval',
        approvalId: grant.approvalId,
        approvalToken: grant.approvalToken,
      }),
    });
    expect(response.status).toBe(403);
  });

  it('binds approval to one action and replays an idempotent duplicate', async () => {
    const action = {
      kind: 'save-note',
      runId: 'run-approval-test',
      agentId: 'AG-COORD',
      idempotencyKey: 'run-approval-test:save-note',
      title: 'integration-note',
      content: 'integration note content',
    };
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };

    const grantResponse = await fetch(`${baseUrl}/api/approvals/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify(action),
    });
    const grant = (await grantResponse.json()) as Record<string, unknown>;
    expect(grantResponse.status).toBe(200);

    const executeResponse = await fetch(`${baseUrl}/api/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...action,
        approvalId: grant.approvalId,
        approvalToken: grant.approvalToken,
      }),
    });
    const executed = (await executeResponse.json()) as Record<string, unknown>;
    expect(executeResponse.status).toBe(200);
    expect(executed.ok).toBe(true);

    const secondGrantResponse = await fetch(`${baseUrl}/api/approvals/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify(action),
    });
    const secondGrant = (await secondGrantResponse.json()) as Record<string, unknown>;
    const replayResponse = await fetch(`${baseUrl}/api/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...action,
        approvalId: secondGrant.approvalId,
        approvalToken: secondGrant.approvalToken,
      }),
    });
    const replayed = (await replayResponse.json()) as Record<string, unknown>;
    expect(replayed.replayed).toBe(true);

    const files = await readdir(path.join(workspace, 'ai-output'));
    expect(files.filter((name: string) => name.startsWith('integration-note-'))).toHaveLength(1);
    const receipts = (await (await fetch(`${baseUrl}/api/receipts`, { headers })).json()) as { receipts: unknown[] };
    expect(receipts.receipts).toHaveLength(1);
  });

  it('exposes bounded in-memory activity without persisting conversation content', async () => {
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const response = await fetch(`${baseUrl}/api/runtime-state`, { headers });
    const state = (await response.json()) as {
      events: Array<{ category: string; type: string }>;
      definitions: unknown[];
    };
    expect(response.status).toBe(200);
    expect(state.definitions).toHaveLength(7);
    expect(state.events.some((event) => event.type === 'permission_changed')).toBe(true);
    expect(state.events.some((event) => event.type === 'operation_succeeded')).toBe(true);
    expect(state.events.every((event) => ['conversation', 'operation', 'approval', 'security', 'system'].includes(event.category))).toBe(true);
  });

  it('validates and registers a locked patch proposal without applying it', async () => {
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const proposal = {
      version: '1.0.0',
      proposalId: 'proposal-integration-1',
      runId: 'run-patch-proposal',
      agentId: 'AG-DEV',
      title: 'Update synthetic source',
      createdAt: '2099-01-01T00:00:00.000Z',
      files: [
        {
          path: 'src/example.ts',
          beforeSha256: 'a'.repeat(64),
          afterSha256: 'b'.repeat(64),
          addedLines: 1,
          removedLines: 1,
          patch: '--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n',
        },
      ],
    };
    const enableResponse = await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-DEV', capability: 'propose_patch', allowed: true }),
    });
    expect(enableResponse.status).toBe(200);
    const response = await fetch(`${baseUrl}/api/patches/proposals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ proposal }),
    });
    const result = (await response.json()) as Record<string, any>;
    expect(response.status).toBe(200);
    expect(result.proposal).toMatchObject({ status: 'validated_locked', files: [{ path: 'src/example.ts' }] });
    expect(JSON.stringify(result)).not.toContain('export const value');

    const replay = await fetch(`${baseUrl}/api/patches/proposals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ proposal }),
    });
    expect((await replay.json()) as Record<string, unknown>).toMatchObject({ replayed: true });

    await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-DEV', capability: 'propose_patch', allowed: false }),
    });
    const denied = await fetch(`${baseUrl}/api/patches/proposals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ proposal: { ...proposal, proposalId: 'proposal-integration-2' } }),
    });
    expect(denied.status).toBe(403);
    await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-DEV', capability: 'propose_patch', allowed: true }),
    });

    const state = (await (await fetch(`${baseUrl}/api/runtime-state`, { headers })).json()) as Record<string, any>;
    expect(state.patchProposals).toHaveLength(1);
    expect(JSON.stringify(state.patchProposals)).not.toContain('export const value');
    expect(await readdir(path.join(workspace, 'src')).catch(() => [])).toHaveLength(0);
  });

  it('uses a capability-gated one-time ticket for read-only proposal preimage verification', async () => {
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const sourceText = 'export const verified = 1;\n';
    const nextText = 'export const verified = 2;\n';
    const sourcePath = path.join(workspace, 'src', 'verified.ts');
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, sourceText, 'utf8');
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const proposal = {
      version: '1.0.0',
      proposalId: 'proposal-preflight-1',
      runId: 'run-patch-preflight',
      agentId: 'AG-DEV',
      title: 'Verify synthetic source',
      createdAt: '2099-01-01T00:01:00.000Z',
      files: [
        {
          path: 'src/verified.ts',
          beforeSha256: hash(sourceText),
          afterSha256: hash(nextText),
          addedLines: 1,
          removedLines: 1,
          patch: '--- a/src/verified.ts\n+++ b/src/verified.ts\n@@ -1 +1 @@\n-export const verified = 1;\n+export const verified = 2;\n',
        },
      ],
    };
    const registrationResponse = await fetch(`${baseUrl}/api/patches/proposals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ proposal }),
    });
    const registration = (await registrationResponse.json()) as Record<string, any>;
    expect(registrationResponse.status).toBe(200);

    const action = {
      kind: 'patch-preflight',
      runId: proposal.runId,
      agentId: 'AG-SEC',
      proposalId: proposal.proposalId,
      proposalSha256: registration.proposal.proposalSha256,
      idempotencyKey: `${proposal.runId}:patch-preflight:${proposal.proposalId}`,
    };
    const deniedGrant = await fetch(`${baseUrl}/api/approvals/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify(action),
    });
    expect(deniedGrant.status).toBe(403);

    await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-SEC', capability: 'preflight_patch', allowed: true }),
    });
    const grantResponse = await fetch(`${baseUrl}/api/approvals/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify(action),
    });
    const grant = (await grantResponse.json()) as Record<string, any>;
    expect(grantResponse.status).toBe(200);
    const ledgerPath = path.join(workspace, 'ai-output', 'RECEIPTS.md');
    const ledgerBefore = await readFile(ledgerPath, 'utf8');
    const executeResponse = await fetch(`${baseUrl}/api/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...action, approvalId: grant.approvalId, approvalToken: grant.approvalToken }),
    });
    const result = (await executeResponse.json()) as Record<string, any>;
    expect(executeResponse.status).toBe(200);
    expect(result).toMatchObject({
      ok: true,
      proposal: {
        status: 'preflight_passed_locked',
        preflight: { matched: true, files: [{ path: 'src/verified.ts', matched: true }] },
      },
    });
    expect(JSON.stringify(result)).not.toContain(sourceText.trim());
    expect(await readFile(sourcePath, 'utf8')).toBe(sourceText);
    expect(await readFile(ledgerPath, 'utf8')).toBe(ledgerBefore);

    const consumedReplay = await fetch(`${baseUrl}/api/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...action, approvalId: grant.approvalId, approvalToken: grant.approvalToken }),
    });
    expect(consumedReplay.status).toBe(409);
    await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-SEC', capability: 'preflight_patch', allowed: false }),
    });

    const applyAction = {
      kind: 'patch-apply',
      runId: proposal.runId,
      agentId: 'EXECUTOR',
      proposalId: proposal.proposalId,
      proposalSha256: registration.proposal.proposalSha256,
      idempotencyKey: `${proposal.runId}:patch-apply:${proposal.proposalId}`,
    };
    const deniedApplyGrant = await fetch(`${baseUrl}/api/approvals/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify(applyAction),
    });
    expect(deniedApplyGrant.status).toBe(403);
    await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'EXECUTOR', capability: 'apply_patch', allowed: true }),
    });
    const applyGrantResponse = await fetch(`${baseUrl}/api/approvals/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify(applyAction),
    });
    const applyGrant = (await applyGrantResponse.json()) as Record<string, any>;
    expect(applyGrantResponse.status).toBe(200);
    const applyResponse = await fetch(`${baseUrl}/api/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...applyAction,
        approvalId: applyGrant.approvalId,
        approvalToken: applyGrant.approvalToken,
      }),
    });
    const applyResult = (await applyResponse.json()) as Record<string, any>;
    expect(applyResponse.status).toBe(200);
    expect(applyResult).toMatchObject({
      ok: true,
      proposal: {
        status: 'applied',
        application: { status: 'applied', files: [{ path: 'src/verified.ts' }] },
      },
      transaction: { status: 'applied', files: [{ path: 'src/verified.ts' }] },
    });
    expect(JSON.stringify(applyResult)).not.toContain(sourceText.trim());
    expect(await readFile(sourcePath, 'utf8')).toBe(nextText);
    expect(await readdir(path.join(workspace, 'ai-output', '.agenthub-patch-transactions'))).toEqual([]);

    const consumedApplyReplay = await fetch(`${baseUrl}/api/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...applyAction,
        approvalId: applyGrant.approvalId,
        approvalToken: applyGrant.approvalToken,
      }),
    });
    expect(consumedApplyReplay.status).toBe(409);
    await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'EXECUTOR', capability: 'apply_patch', allowed: false }),
    });
  });

  it('recovers an interrupted patch transaction before exposing a switched workspace', async () => {
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const alternate = await mkdtemp(path.join(tmpdir(), 'agenthub-switch-recovery-'));
    const sourceText = 'export const switched = 1;\n';
    const nextText = 'export const switched = 2;\n';
    const relativePath = 'src/switched.ts';
    const sourcePath = path.join(alternate, relativePath);
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    try {
      await mkdir(path.join(alternate, '.agent-hub'), { recursive: true });
      await writeFile(path.join(alternate, '.agent-hub', 'project-state.md'), '# Alternate\n', 'utf8');
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, sourceText, 'utf8');
      const handle = await preparePatchTransaction(alternate, {
        version: '1.0.0',
        proposalId: 'proposal-switch-recovery-1',
        runId: 'run-switch-recovery',
        agentId: 'AG-DEV',
        title: 'Recover before switch',
        createdAt: '2099-01-01T00:02:00.000Z',
        files: [
          {
            path: relativePath,
            beforeSha256: hash(sourceText),
            afterSha256: hash(nextText),
            addedLines: 1,
            removedLines: 1,
            patch: '--- a/src/switched.ts\n+++ b/src/switched.ts\n@@ -1 +1 @@\n-export const switched = 1;\n+export const switched = 2;\n',
          },
        ],
      });
      await rename(handle.entries[0].targetPath, handle.entries[0].backupPath);
      await rename(handle.entries[0].nextPath, handle.entries[0].targetPath);

      const switched = await fetch(`${baseUrl}/api/workspace`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: alternate }),
      });
      expect(switched.status).toBe(200);
      expect(await switched.json()).toMatchObject({ ok: true, recoveredTransactions: 1 });
      expect(await readFile(sourcePath, 'utf8')).toBe(sourceText);
      expect(await readdir(path.join(alternate, 'ai-output', '.agenthub-patch-transactions'))).toEqual([]);
    } finally {
      await fetch(`${baseUrl}/api/workspace`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: workspace }),
      }).catch(() => undefined);
      await rm(alternate, { recursive: true, force: true });
    }
  });

  it('persists immutable DAG checkpoints with permission and revision guards', async () => {
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const checkpointTaskCanary = 'SENSITIVE_CHECKPOINT_TASK_CANARY';
    const stages = buildPipelinePlan(agentFirstDashboardView.agents, checkpointTaskCanary);
    const pipeline = pipelineReducer(INITIAL_PIPELINE_STATE, {
      type: 'start',
      runId: 'run-checkpoint-integration',
      mode: 'simulation',
      taskText: checkpointTaskCanary,
      stages,
    });
    const checkpoint = createTaskCheckpoint(pipeline, {}, 1, '2099-01-01T00:00:00.000Z');

    const saveResponse = await fetch(`${baseUrl}/api/checkpoints`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-COORD', checkpoint }),
    });
    expect(saveResponse.status).toBe(200);

    const replayResponse = await fetch(`${baseUrl}/api/checkpoints`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-COORD', checkpoint }),
    });
    expect((await replayResponse.json()) as Record<string, unknown>).toMatchObject({ replayed: true });

    const conflictResponse = await fetch(`${baseUrl}/api/checkpoints`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        agentId: 'AG-COORD',
        checkpoint: { ...checkpoint, updatedAt: '2099-01-01T00:00:01.000Z' },
      }),
    });
    expect(conflictResponse.status).toBe(409);

    const list = (await (await fetch(`${baseUrl}/api/checkpoints`, { headers })).json()) as { checkpoints: unknown[] };
    expect(list.checkpoints).toContainEqual(
      expect.objectContaining({ runId: 'run-checkpoint-integration', revision: 1 }),
    );
    const loaded = (await (
      await fetch(`${baseUrl}/api/checkpoint?runId=run-checkpoint-integration`, { headers })
    ).json()) as { checkpoint: { revision: number } };
    expect(loaded.checkpoint.revision).toBe(1);

    const revokeResponse = await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-COORD', capability: 'manage_checkpoint', allowed: false }),
    });
    expect(revokeResponse.status).toBe(200);
    const deniedResponse = await fetch(`${baseUrl}/api/checkpoints`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-COORD', checkpoint: { ...checkpoint, revision: 2 } }),
    });
    expect(deniedResponse.status).toBe(403);
    await fetch(`${baseUrl}/api/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: 'AG-COORD', capability: 'manage_checkpoint', allowed: true }),
    });

    const checkpointFiles = await readdir(path.join(workspace, 'ai-output', '.agenthub-checkpoints'));
    expect(checkpointFiles.filter((name) => name.endsWith('.json'))).toHaveLength(2);
    const persistedCheckpoint = await readFile(
      path.join(workspace, 'ai-output', '.agenthub-checkpoints', checkpointFiles.sort()[0]!),
      'utf8',
    );
    expect(persistedCheckpoint).not.toContain(checkpointTaskCanary);
    expect(persistedCheckpoint).not.toContain('我将拆解目标');
    expect(persistedCheckpoint).toContain('[redacted task]');
  });

  it('fails closed at live authorization and patch proposal retention limits without evicting live records', async () => {
    const retentionWorkspace = await mkdtemp(path.join(tmpdir(), 'agenthub-retention-test-'));
    const retentionPort = await reservePort();
    const retentionBaseUrl = `http://127.0.0.1:${retentionPort}`;
    let retentionChild: ChildProcess | null = null;
    try {
      await mkdir(path.join(retentionWorkspace, '.agent-hub'), { recursive: true });
      await writeFile(path.join(retentionWorkspace, '.agent-hub', 'project-state.md'), '# Retention test\n', 'utf8');
      retentionChild = spawn(process.execPath, [
        'server/server.mjs',
        '--workspace',
        retentionWorkspace,
        '--port',
        String(retentionPort),
        '--enable-safe-pilot-issuance',
        ...pinnedSafePilotArgs,
      ], {
        cwd: repoRoot,
        stdio: 'ignore',
        windowsHide: true,
      });
      const health = await waitForHealth(retentionBaseUrl);
      expect(health).not.toHaveProperty('sessionToken');
      const session = await bootstrapSession(retentionBaseUrl);
      const retentionHeaders = {
        'content-type': 'application/json',
        'x-agenthub-session': String(session.sessionToken ?? ''),
      };
      const permissionResponse = await fetch(`${retentionBaseUrl}/api/permissions`, {
        method: 'POST',
        headers: retentionHeaders,
        body: JSON.stringify({ agentId: 'AG-DEV', capability: 'propose_patch', allowed: true }),
      });
      expect(permissionResponse.status).toBe(200);

      const proposalFor = (index: number) => ({
        version: '1.0.0',
        proposalId: `proposal-retention-${index}`,
        runId: `run-patch-retention-${index}`,
        agentId: 'AG-DEV',
        title: `Synthetic retention proposal ${index}`,
        createdAt: '2099-01-01T00:00:00.000Z',
        files: [{
          path: `src/retention-${index}.ts`,
          beforeSha256: 'a'.repeat(64),
          afterSha256: 'b'.repeat(64),
          addedLines: 1,
          removedLines: 1,
          patch: `--- a/src/retention-${index}.ts\n+++ b/src/retention-${index}.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n`,
        }],
      });
      const postInBatches = async <T,>(items: T[], post: (item: T) => Promise<Response>) => {
        const statuses: number[] = [];
        for (let index = 0; index < items.length; index += 50) {
          statuses.push(...await Promise.all(items.slice(index, index + 50).map(async (item) => (await post(item)).status)));
        }
        return statuses;
      };
      const proposalStatuses = await postInBatches(
        Array.from({ length: 100 }, (_, index) => index),
        (index) => fetch(`${retentionBaseUrl}/api/patches/proposals`, {
          method: 'POST',
          headers: retentionHeaders,
          body: JSON.stringify({ proposal: proposalFor(index) }),
        }),
      );
      expect(proposalStatuses).toEqual(Array(100).fill(200));
      const blockedProposal = await fetch(`${retentionBaseUrl}/api/patches/proposals`, {
        method: 'POST',
        headers: retentionHeaders,
        body: JSON.stringify({ proposal: proposalFor(100) }),
      });
      expect(blockedProposal.status).toBe(429);
      expect(await blockedProposal.json()).toEqual({ error: '存活补丁提案已达 100 个上限' });
      const proposalList = (await (await fetch(`${retentionBaseUrl}/api/patches/proposals`, {
        headers: retentionHeaders,
      })).json()) as { proposals: Array<{ proposalId: string }> };
      expect(proposalList.proposals).toHaveLength(100);
      expect(proposalList.proposals.map((proposal) => proposal.proposalId)).toEqual(expect.arrayContaining([
        'proposal-retention-0',
        'proposal-retention-99',
      ]));

      const preflightFor = (index: number) => ({
        runId: `run-auth-retention-${index}`,
        taskText: pinnedSafePilotTaskText,
        contextText: pinnedSafePilotContextText,
        profile: pinnedSafePilotProfile,
        humanApproval: { approved: true, approvalRef: `approval-retention-${index}` },
      });
      const authorizationStatuses = await postInBatches(
        Array.from({ length: 500 }, (_, index) => index),
        (index) => fetch(`${retentionBaseUrl}/api/safe-pilot/authorizations`, {
          method: 'POST',
          headers: retentionHeaders,
          body: JSON.stringify({ issueConfirmed: true, preflight: preflightFor(index) }),
        }),
      );
      expect(authorizationStatuses).toEqual(Array(500).fill(200));
      const blockedAuthorization = await fetch(`${retentionBaseUrl}/api/safe-pilot/authorizations`, {
        method: 'POST',
        headers: retentionHeaders,
        body: JSON.stringify({ issueConfirmed: true, preflight: preflightFor(500) }),
      });
      expect(blockedAuthorization.status).toBe(429);
      expect(await blockedAuthorization.json()).toEqual({ error: '四 Agent 存活授权已达 500 个上限' });
      expect((await waitForHealth(retentionBaseUrl)).receipts).toBe(0);
    } finally {
      if (retentionChild?.exitCode === null) {
        await new Promise<void>((resolve) => {
          retentionChild?.once('exit', () => resolve());
          retentionChild?.kill();
        });
      }
      await rm(retentionWorkspace, { recursive: true, force: true });
    }
  }, 60_000);

  it('loads the latest checkpoint after a service restart', async () => {
    await new Promise((resolve) => {
      child?.once('exit', resolve);
      child?.kill();
    });
    child = spawn(process.execPath, ['server/server.mjs', '--workspace', workspace, '--port', String(port), '--enable-checkpoints'], {
      cwd: repoRoot,
      env: { ...process.env, AGENTHUB_DEVELOPMENT_STATE_DIR: path.join(workspace, '.development-sessions') },
      stdio: 'ignore',
      windowsHide: true,
    });
    const health = await waitForHealth(baseUrl);
    expect(health).not.toHaveProperty('sessionToken');
    sessionToken = String((await bootstrapSession(baseUrl)).sessionToken ?? '');
    const headers = { 'content-type': 'application/json', 'x-agenthub-session': sessionToken };
    const list = (await (await fetch(`${baseUrl}/api/checkpoints`, { headers })).json()) as {
      checkpoints: Array<{ runId: string; revision: number }>;
    };
    expect(list.checkpoints).toContainEqual(expect.objectContaining({ runId: 'run-checkpoint-integration', revision: 1 }));

    const resumeResponse = await fetch(`${baseUrl}/api/orchestration/resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ runId: 'run-model-budget' }),
    });
    const resumed = (await resumeResponse.json()) as Record<string, any>;
    expect(resumeResponse.status, JSON.stringify(resumed)).toBe(200);
    expect(resumed.run).toMatchObject({
      status: 'failed',
      callsStarted: 1,
      reservedOutputTokens: 100,
      policy: { totalOutputTokens: 128 },
    });
    const overBudgetAfterRestart = await fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...orchestrationPayload('run-model-budget', 'after restart', {
          expectedArtifacts: 2,
          maxCalls: 2,
          totalOutputTokens: 128,
          stageTimeoutMs: 5_000,
          groundingDisclosureApproved: true,
        }),
        agentId: 'AG-SEC',
      }),
    });
    expect(overBudgetAfterRestart.status).toBe(409);
  });
});
