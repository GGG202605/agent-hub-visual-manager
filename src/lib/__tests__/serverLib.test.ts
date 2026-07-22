import { describe, expect, it } from 'vitest';
import {
  buildOperatorEvidenceExportV1,
  buildProviderRequest,
  canonicalizeAgentHubJsonV1,
  canReopenCompletedSingleAgentRun,
  classifyModelCallFailure,
  createBoundedResponseReplayCache,
  createDefaultPermissionProfiles,
  createActionFingerprint,
  createApprovalToken,
  createSafePilotPreflight,
  createSessionToken,
  createWorkspaceId,
  describeProviderEmptyResponse,
  DEVELOPMENT_RESPONSE_REPLAY_POLICY,
  extractProviderTerminationReason,
  extractProviderText,
  extractProviderUsage,
  hasCompleteProviderUsage,
  hashDevelopmentModelRoute,
  isAllowedAgentHubFile,
  getRequiredCapability,
  normalizeAgentIdentifier,
  normalizeActionDescriptor,
  normalizeCheckpointPayload,
  normalizeOrchestrationPolicy,
  normalizePatchProposal,
  normalizePermissionUpdate,
  planBoundedRecordAdmission,
  normalizeSafePilotIssuerPins,
  normalizeSafePilotPreflight,
  OPERATOR_EVIDENCE_MAX_BYTES,
  operatorEvidenceJsonFitsSizeLimit,
  resolveSafeWritePath,
  retainLatestRecords,
  safePilotActiveElapsedMs,
  safePilotActiveTimeoutExpired,
  safePilotHumanWaitExpired,
  SAFE_PILOT_RETRY_REPAIR_MARKER,
  SERVER_RETENTION_LIMITS,
  safePilotTotalTimeoutExpired,
  sanitizeFileName,
  sha256Hex,
  validateLlmPayload,
  validateSafePilotRetryRepairMessages,
  validateSafePilotIssuerPins,
  verifyApprovalToken,
} from '../../../server/serverLib.mjs';
import { agentFirstDashboardView } from '../../data/mockAgentHub';
import { createTaskCheckpoint } from '../taskGraph';
import { buildPipelinePlan, INITIAL_PIPELINE_STATE, pipelineReducer } from '../taskPipeline';
import { buildSafePilotExecutionProfile, SAFE_PILOT_AGENT_ORDER } from '../safePilotLauncher';

const safePilotBindings = SAFE_PILOT_AGENT_ORDER.map((agentCode) => ({
  agentCode,
  provider: 'deepseek' as const,
  model: 'deepseek-v4-flash',
  ready: true,
}));

const OPERATOR_EVIDENCE_EXPORTED_AT = '2099-01-01T00:04:00.000Z';

describe('development model route fingerprint', () => {
  it('binds the effective non-secret route while ignoring the credential', () => {
    const route = {
      kind: 'deepseek',
      baseUrl: 'https://api.deepseek.com///',
      model: 'deepseek-v4-pro',
      thinkingEnabled: true,
      apiKey: 'first-memory-only-key',
    };
    expect(hashDevelopmentModelRoute(route)).toBe(sha256Hex(JSON.stringify([
      'deepseek',
      'https://api.deepseek.com',
      'deepseek-v4-pro',
      true,
      'text',
    ])));
    expect(hashDevelopmentModelRoute({ ...route, apiKey: 'second-memory-only-key' }))
      .toBe(hashDevelopmentModelRoute(route));
    expect(hashDevelopmentModelRoute({ ...route, model: 'deepseek-v4-flash' }))
      .not.toBe(hashDevelopmentModelRoute(route));
    expect(hashDevelopmentModelRoute(route, 'json_object'))
      .not.toBe(hashDevelopmentModelRoute(route));
  });
});

function operatorEvidenceSource() {
  const runId = 'pilot-DemoScenario021';
  const acceptedAt = SAFE_PILOT_AGENT_ORDER.map((_, index) =>
    new Date(Date.parse('2099-01-01T00:02:00.000Z') + index * 1_000).toISOString()
  );
  const outputHashes = ['a', 'b', 'c', 'd'].map((character) => character.repeat(64));
  const handoffHashes = [undefined, 'e'.repeat(64), 'f'.repeat(64), '0'.repeat(64)];
  const evidence = SAFE_PILOT_AGENT_ORDER.map((agentId, index) => ({
    evidenceId: `evidence-${index + 1}`,
    runId,
    agentId,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    outputSha256: outputHashes[index],
    observedOutputTokens: 20 + index,
    acceptanceStatus: 'accepted',
    acceptedAt: acceptedAt[index],
    providerText: 'DemoScenario021_PROVIDER_TEXT_CANARY',
  }));
  const operatorEvidenceStages = SAFE_PILOT_AGENT_ORDER.map((agentId, index) => {
    const handoffSha256 = handoffHashes[index];
    const stage = {
      callIndex: index + 1,
      attempt: 1,
      agentId,
      providerId: 'deepseek',
      modelId: 'deepseek-v4-flash',
      evidenceId: `evidence-${index + 1}`,
      outputSha256: outputHashes[index],
      inputTokens: 100 + index,
      outputTokens: 20 + index,
      activeMs: 100 + index,
      observedCostMicros: 120 + index * 2,
    };
    if (handoffSha256) return { ...stage, handoffSha256 };
    return stage;
  });
  return {
    run: {
      runId,
      status: 'completed',
      policy: { expectedArtifacts: 4, maxCalls: 5, totalOutputTokens: 1_600, stageTimeoutMs: 45_000 },
      callsStarted: 4,
      callsSucceeded: 4,
      callsFailed: 0,
      observedOutputTokens: 86,
      evidence,
      startedAt: '2099-01-01T00:01:00.000Z',
      updatedAt: '2099-01-01T00:03:00.000Z',
      rawTask: 'DemoScenario021_RAW_TASK_CANARY',
      runtimeEvent: { summary: 'DemoScenario021_EVENT_SUMMARY_CANARY' },
      receipt: { detail: 'DemoScenario021_RECEIPT_DETAIL_CANARY' },
      patch: { path: 'DemoScenario021_PATCH_PATH_CANARY' },
    },
    authorization: {
      authorizationId: 'pilot-auth-DemoScenario021',
      runId,
      status: 'completed',
      profile: {
        profileId: 'pilot-4-readonly-v2',
        version: '2.0.0',
        agentOrder: [...SAFE_PILOT_AGENT_ORDER],
        modelBindings: SAFE_PILOT_AGENT_ORDER.map((agentCode) => ({
          agentCode,
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          ready: true,
        })),
        budget: {
          plannedCalls: 4,
          maxCalls: 5,
          maxManualRetries: 1,
          maxInputTokens: 64_000,
          maxOutputTokens: 1_600,
          stageTimeoutMs: 45_000,
          totalTimeoutMs: 240_000,
          maxHumanWaitMs: 900_000,
          currency: 'CNY',
          inputRateMicrosPerMillion: 1_000_000,
          outputRateMicrosPerMillion: 1_000_000,
          maxCostMicros: 1_000_000,
        },
        runCapabilities: Object.fromEntries(SAFE_PILOT_AGENT_ORDER.map((agentId) => [agentId, {
          call_model: true,
          save_note: false,
          run_build: false,
          manage_checkpoint: false,
          propose_patch: false,
          preflight_patch: false,
          apply_patch: false,
        }])),
        checkpointEnabled: false,
        sideEffectsAllowed: false,
        finalHumanAcceptanceRequired: true,
      },
      taskSha256: '1'.repeat(64),
      contextSha256: '2'.repeat(64),
      profileSha256: '3'.repeat(64),
      authorizationSha256: '4'.repeat(64),
      issuedAt: '2099-01-01T00:00:00.000Z',
      expiresAt: Date.parse('2099-01-01T01:00:00.000Z'),
      finalHumanAcceptedAt: '2099-01-01T00:03:00.000Z',
      acceptedAgentIds: [...SAFE_PILOT_AGENT_ORDER],
      usage: {
        callsStarted: 4,
        manualRetriesUsed: 0,
        observedInputTokens: 406,
        observedOutputTokens: 86,
        observedCostMicros: 492,
        activeElapsedMs: 1_000,
      },
      operatorEvidenceStages,
      apiKey: 'fixture-key-a',
      sessionToken: 'DemoScenario021-session-token-canary',
      authorizationToken: 'DemoScenario021-authorization-token-canary',
      workspace: 'C:\\PublicFixture\\blocked\\example.md',
      rawContext: 'DemoScenario021_RAW_CONTEXT_CANARY',
    },
    exportedAt: OPERATOR_EVIDENCE_EXPORTED_AT,
    serverVersion: '1.8.0',
  };
}

describe('DemoScenario016 server in-memory retention', () => {
  it('keeps only the newest 500 receipts without mutating the source list', () => {
    const source = Array.from({ length: 501 }, (_, index) => ({ seq: index + 1 }));
    const retained = retainLatestRecords(source, SERVER_RETENTION_LIMITS.receiptsPerWorkspace);
    expect(SERVER_RETENTION_LIMITS).toEqual({
      receiptsPerWorkspace: 500,
      liveSafePilotAuthorizationsPerWorkspace: 500,
      livePatchProposalsPerWorkspace: 100,
    });
    expect(retained).toHaveLength(500);
    expect(retained[0]).toEqual({ seq: 2 });
    expect(retained[499]).toEqual({ seq: 501 });
    expect(source).toHaveLength(501);
  });

  it('purges terminal and expired authorization records before fail-closed admission', () => {
    const plan = planBoundedRecordAdmission([
      { id: 'live', status: 'issued', expiresAt: 2_000 },
      { id: 'equal-deadline', status: 'issued', expiresAt: 1_000 },
      { id: 'expired', status: 'issued', expiresAt: 999 },
      { id: 'completed', status: 'completed', expiresAt: 2_000 },
    ], {
      limit: 3,
      terminalStatuses: ['completed', 'consumed', 'failed', 'expired', 'cancelled'],
      now: 1_000,
    });
    expect(plan).toEqual({
      removableIds: ['expired', 'completed'],
      liveCount: 2,
      limit: 3,
      canAdmit: true,
    });
  });

  it('never evicts live authorization or patch proposal records to make room', () => {
    const liveAuthorizations = Array.from({ length: 500 }, (_, index) => ({
      id: `auth-${index}`,
      status: 'issued',
      expiresAt: 2_000,
    }));
    expect(planBoundedRecordAdmission(liveAuthorizations, {
      limit: SERVER_RETENTION_LIMITS.liveSafePilotAuthorizationsPerWorkspace,
      terminalStatuses: ['completed'],
      now: 1_000,
    })).toMatchObject({ removableIds: [], liveCount: 500, canAdmit: false });

    const liveProposals = Array.from({ length: 100 }, (_, index) => ({ id: `proposal-${index}`, status: 'validated_locked' }));
    expect(planBoundedRecordAdmission(liveProposals, {
      limit: SERVER_RETENTION_LIMITS.livePatchProposalsPerWorkspace,
      terminalStatuses: ['applied'],
      now: 1_000,
    })).toMatchObject({ removableIds: [], liveCount: 100, canAdmit: false });
    expect(planBoundedRecordAdmission([...liveProposals, { id: 'applied', status: 'applied' }], {
      limit: SERVER_RETENTION_LIMITS.livePatchProposalsPerWorkspace,
      terminalStatuses: ['applied'],
      now: 1_000,
    })).toMatchObject({ removableIds: ['applied'], liveCount: 100, canAdmit: false });
    expect(planBoundedRecordAdmission([...liveProposals.slice(0, 99), { id: 'applied', status: 'applied' }], {
      limit: SERVER_RETENTION_LIMITS.livePatchProposalsPerWorkspace,
      terminalStatuses: ['applied'],
      now: 1_000,
    })).toMatchObject({ removableIds: ['applied'], liveCount: 99, canAdmit: true });
  });
});

describe('development response replay retention', () => {
  it('keeps pending work alive, snapshots the terminal response, then expires it at ten minutes', async () => {
    let currentTime = 1_000;
    const cache = createBoundedResponseReplayCache<Record<string, unknown>>({ now: () => currentTime });
    expect(DEVELOPMENT_RESPONSE_REPLAY_POLICY).toEqual({ completedLimit: 100, ttlMs: 600_000 });
    const entry = cache.create('workspace:session:reservation', 'a'.repeat(64));

    currentTime += DEVELOPMENT_RESPONSE_REPLAY_POLICY.ttlMs * 2;
    expect(cache.lookup(entry.key, entry.requestSha256).kind).toBe('hit');
    const payload = { text: 'process-memory-only', evidence: { status: 'provider_returned' } };
    expect(cache.settle(entry, 200, payload)).toBe(true);
    payload.evidence.status = 'accepted';
    const replay = cache.lookup(entry.key, entry.requestSha256);
    expect(replay.kind).toBe('hit');
    if (replay.kind !== 'hit') throw new Error('expected replay hit');
    await expect(replay.promise).resolves.toEqual({
      status: 200,
      payload: { text: 'process-memory-only', evidence: { status: 'provider_returned' } },
    });

    currentTime += DEVELOPMENT_RESPONSE_REPLAY_POLICY.ttlMs;
    expect(cache.lookup(entry.key, entry.requestSha256)).toEqual({ kind: 'miss' });
    expect(cache.inspect()).toEqual({ size: 0, pending: 0, completed: 0 });
  });

  it('limits completed snapshots without evicting active work and rejects contract drift', () => {
    let currentTime = 10;
    const cache = createBoundedResponseReplayCache({ completedLimit: 2, ttlMs: 1_000, now: () => currentTime });
    const pending = cache.create('pending', 'p');
    const first = cache.create('first', '1');
    cache.settle(first, 200, { sequence: 1 });
    currentTime += 1;
    const second = cache.create('second', '2');
    cache.settle(second, 200, { sequence: 2 });
    currentTime += 1;
    const third = cache.create('third', '3');
    cache.settle(third, 200, { sequence: 3 });

    expect(cache.lookup('first', '1')).toEqual({ kind: 'miss' });
    expect(cache.lookup('second', 'changed')).toEqual({ kind: 'mismatch' });
    expect(cache.lookup('pending', 'p').kind).toBe('hit');
    expect(cache.inspect()).toEqual({ size: 3, pending: 1, completed: 2 });
    expect(cache.settle(pending, 502, { error: 'bounded' })).toBe(true);
    expect(cache.inspect()).toEqual({ size: 2, pending: 0, completed: 2 });
  });

  it('does not publish a terminal entry when snapshot cloning fails', () => {
    const cache = createBoundedResponseReplayCache<Record<string, unknown>>({
      clone: () => { throw new Error('clone failed'); },
    });
    const entry = cache.create('clone-failure', 'f');
    expect(() => cache.settle(entry, 200, { text: 'not-published' })).toThrow('clone failed');
    expect(cache.lookup(entry.key, entry.requestSha256).kind).toBe('hit');
    expect(cache.inspect()).toEqual({ size: 1, pending: 1, completed: 0 });
  });

  it('actively removes an expired response without waiting for another cache operation', () => {
    let currentTime = 1_000;
    const scheduled: { callback?: () => void } = {};
    const cache = createBoundedResponseReplayCache({
      ttlMs: 100,
      now: () => currentTime,
      schedule: (callback, delayMs) => {
        expect(delayMs).toBe(100);
        scheduled.callback = callback;
        return 'timer-handle';
      },
      cancelSchedule: () => undefined,
    });
    const entry = cache.create('active-expiry', 'e');
    cache.settle(entry, 200, { text: 'short-lived' });
    expect(scheduled.callback).toBeTypeOf('function');

    currentTime = 1_100;
    scheduled.callback?.();
    currentTime = 1_099;
    expect(cache.inspect()).toEqual({ size: 0, pending: 0, completed: 0 });
  });

  it('clears every completed snapshot and timer without removing pending work', () => {
    const cancelled: unknown[] = [];
    let nextHandle = 0;
    const cache = createBoundedResponseReplayCache({
      schedule: () => ({ timer: nextHandle += 1 }),
      cancelSchedule: (handle) => cancelled.push(handle),
    });
    const pending = cache.create('pending-workspace', 'p');
    const first = cache.create('completed-first', '1');
    const second = cache.create('completed-second', '2');
    cache.settle(first, 200, { text: 'first' });
    cache.settle(second, 502, { error: 'second' });

    expect(cache.clearCompleted()).toBe(2);
    expect(cache.lookup(first.key, first.requestSha256)).toEqual({ kind: 'miss' });
    expect(cache.lookup(second.key, second.requestSha256)).toEqual({ kind: 'miss' });
    expect(cache.lookup(pending.key, pending.requestSha256).kind).toBe('hit');
    expect(cache.inspect()).toEqual({ size: 1, pending: 1, completed: 0 });
    expect(cancelled).toEqual([{ timer: 1 }, { timer: 2 }]);
    expect(cache.clearCompleted()).toBe(0);
  });
});

describe('isAllowedAgentHubFile（读取 allowlist）', () => {
  it('放行标准记录文件', () => {
    expect(isAllowedAgentHubFile('.agent-hub/project-state.md')).toBe(true);
    expect(isAllowedAgentHubFile('.agent-hub/tasks/TASK-1.md')).toBe(true);
    expect(isAllowedAgentHubFile('.agent-hub/runs/RUN-1.md')).toBe(true);
    expect(isAllowedAgentHubFile('.agent-hub/reviews/REV-1.md')).toBe(true);
    expect(isAllowedAgentHubFile('.agent-hub/goals/x/NEXT-DECISION-PACKET.md')).toBe(true);
  });

  it('拦截敏感与无关文件', () => {
    expect(isAllowedAgentHubFile('.agent-hub/secrets/token.md')).toBe(false);
    expect(isAllowedAgentHubFile('.env')).toBe(false);
    expect(isAllowedAgentHubFile('.agent-hub/tasks/key.pem')).toBe(false);
    expect(isAllowedAgentHubFile('node_modules/tasks/TASK-1.md')).toBe(false);
    expect(isAllowedAgentHubFile('.agent-hub/random.md')).toBe(false);
  });
});

describe('resolveSafeWritePath（写入沙盒）', () => {
  const root = 'D:/work/project';

  it('正常文件名落在 ai-output/ 内', () => {
    const target = resolveSafeWritePath(root, 'note.md') as string;
    expect(target.replace(/\\/g, '/')).toContain('/ai-output/note.md');
  });

  it('拒绝路径穿越与绝对路径', () => {
    expect(resolveSafeWritePath(root, '../evil.md')).toBeNull();
    expect(resolveSafeWritePath(root, 'a/../../evil.md')).toBeNull();
    expect(resolveSafeWritePath(root, '/etc/passwd')).toBeNull();
    expect(resolveSafeWritePath(root, '')).toBeNull();
  });
});

describe('sanitizeFileName', () => {
  it('清洗非法字符并限长', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
    expect(sanitizeFileName('   ')).toBe('untitled');
    expect((sanitizeFileName('x'.repeat(200)) as string).length).toBeLessThanOrEqual(80);
  });
});

describe('buildProviderRequest / extractProviderText（服务端转发协议）', () => {
  it('classifies only stable transient gateway failures as retryable', () => {
    expect(classifyModelCallFailure({ error: new Error('fetch failed') }))
      .toEqual({ code: 'UPSTREAM_TRANSPORT', retryable: true });
    expect(classifyModelCallFailure({ error: new Error('上游 HTTP 503') }))
      .toEqual({ code: 'UPSTREAM_TEMPORARY', retryable: true });
    expect(classifyModelCallFailure({ timedOut: true, error: new Error('ignored') }))
      .toEqual({ code: 'STAGE_TIMEOUT', retryable: true });
    expect(classifyModelCallFailure({ cancelled: true, timedOut: true }))
      .toEqual({ code: 'CANCELLED', retryable: false });
    expect(classifyModelCallFailure({ error: new Error('上游文本超过 8000 字符上限') }))
      .toEqual({ code: 'PROVIDER_CALL_REJECTED', retryable: false });
  });

  it('Claude 协议与前端一致', () => {
    const request = buildProviderRequest(
      { kind: 'claude', baseUrl: 'https://api.anthropic.com/', model: 'm', apiKey: 'k' },
      [{ role: 'user', content: 'hi' }],
      64,
    );
    expect(request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.headers['x-api-key']).toBe('k');
  });

  it('OpenAI 兼容协议与文本提取', () => {
    const request = buildProviderRequest(
      { kind: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'k' },
      [{ role: 'user', content: 'hi' }],
      64,
    );
    expect(request.url).toBe('https://api.deepseek.com/chat/completions');
    expect(request.body).toMatchObject({ thinking: { type: 'disabled' } });
    expect(request.body).not.toHaveProperty('response_format');
    expect(buildProviderRequest(
      { kind: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'k' },
      [{ role: 'user', content: 'return JSON' }],
      64,
      'json_object',
    ).body).toMatchObject({ response_format: { type: 'json_object' } });
    expect(extractProviderText('deepseek', { choices: [{ message: { content: '通' } }] })).toBe('通');
    expect(extractProviderText('deepseek', {
      choices: [{ message: { reasoning_content: 'internal reasoning', content: '' } }],
    })).toBe('');
    expect(extractProviderText('claude', { content: [{ text: '通' }] })).toBe('通');
    expect(extractProviderTerminationReason('deepseek', {
      choices: [{ finish_reason: 'length', message: { content: '截断正文' } }],
    })).toBe('length');
    expect(extractProviderTerminationReason('claude', { stop_reason: 'max_tokens' })).toBe('max_tokens');
    expect(extractProviderTerminationReason('deepseek', {
      choices: [{ finish_reason: 'untrusted upstream text', message: { content: '正文' } }],
    })).toBe('unknown');
  });

  it('DeepSeek 服务端转发显式开启思考模式', () => {
    const request = buildProviderRequest(
      {
        kind: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        apiKey: 'k',
        thinkingEnabled: true,
      },
      [{ role: 'user', content: 'hi' }],
      64,
    );
    expect(request.body).toMatchObject({ thinking: { type: 'enabled' } });
  });

  it('空正文只返回安全协议诊断，不泄露思考内容', () => {
    const diagnosis = describeProviderEmptyResponse('deepseek', {
      choices: [{
        finish_reason: 'length',
        message: { content: '', reasoning_content: 'secret internal reasoning' },
      }],
      usage: {
        completion_tokens: 64,
        completion_tokens_details: { reasoning_tokens: 64 },
      },
    });
    expect(diagnosis).toContain('结束原因：length');
    expect(diagnosis).toContain('正文形态：empty-string');
    expect(diagnosis).toContain('输出 tokens：64');
    expect(diagnosis).toContain('思考 tokens：64');
    expect(diagnosis).toContain('含思考字段：是');
    expect(diagnosis).not.toContain('secret internal reasoning');
    expect(describeProviderEmptyResponse('deepseek', {
      choices: [{ finish_reason: 'untrusted upstream text', message: { content: null } }],
    })).not.toContain('untrusted upstream text');
  });
});

describe('validateLlmPayload', () => {
  const good = {
    config: { kind: 'claude' as const, baseUrl: 'https://api.anthropic.com', model: 'm', apiKey: 'k' },
    messages: [{ role: 'user' as const, content: 'hi' }],
    agentId: 'AG-COORD',
    runId: 'run-llm-test',
    orchestration: {
      expectedArtifacts: 1,
      maxCalls: 2,
      totalOutputTokens: 440,
      stageTimeoutMs: 60_000,
      groundingDisclosureApproved: true,
    },
  };

  it('合法请求通过', () => {
    expect(validateLlmPayload(good)).toBeNull();
    const readinessId = 'ready-11111111-1111-4111-8111-111111111111';
    expect(validateLlmPayload({
      ...good,
      config: { ...good.config, readinessId },
      runId: 'dev-11111111-1111-4111-8111-111111111111-analysis-1',
      developmentAuthorization: {
        sessionId: 'dev-11111111-1111-4111-8111-111111111111',
        reservationId: 'model-22222222-2222-4222-8222-222222222222',
        authorizationToken: 'memory-only-development-token',
        inputBytes: 40,
        inputSha256: 'a'.repeat(64),
      },
    })).toBeNull();
    expect(JSON.stringify(buildProviderRequest(
      { ...good.config, readinessId },
      good.messages,
      64,
    ))).not.toContain(readinessId);
  });

  it('非法请求给出原因', () => {
    expect(validateLlmPayload(null)).toBeTruthy();
    expect(validateLlmPayload({ ...good, config: { ...good.config, kind: 'evil' } })).toBe('kind 非法');
    expect(validateLlmPayload({ ...good, config: { ...good.config, baseUrl: 'ftp://x' } })).toBe('baseUrl 非法');
    expect(validateLlmPayload({ ...good, messages: [] })).toBe('messages 缺失');
    expect(validateLlmPayload({ ...good, config: { ...good.config, baseUrl: 'https://example.com' } })).toBe(
      'baseUrl 不在允许范围',
    );
    expect(validateLlmPayload({ ...good, maxTokens: 99999 })).toBe('maxTokens 非法');
    expect(validateLlmPayload({ ...good, config: { ...good.config, model: 'x'.repeat(201) } })).toBe('model 缺失或超限');
    expect(validateLlmPayload({ ...good, config: { ...good.config, apiKey: 'x'.repeat(8193) } })).toBe('apiKey 缺失或超限');
    expect(validateLlmPayload({ ...good, config: { ...good.config, thinkingEnabled: 'yes' } })).toBe('thinkingEnabled 非法');
    expect(validateLlmPayload({ ...good, config: { ...good.config, readinessId: 'bad' } })).toBe('readinessId 非法');
    expect(validateLlmPayload({ ...good, responseFormat: 'yaml' })).toBe('responseFormat 非法');
    expect(validateLlmPayload({ ...good, agentId: 'UNKNOWN' })).toBe('agentId 不在规范角色清单');
    expect(validateLlmPayload({ ...good, runId: '../bad' })).toBe('runId 非法');
    expect(validateLlmPayload({ ...good, developmentAuthorization: { sessionId: 'bad' } }))
      .toBe('developmentAuthorization 字段非法');
    expect(validateLlmPayload({
      ...good,
      developmentAuthorization: {
        sessionId: 'dev-11111111-1111-4111-8111-111111111111',
        reservationId: 'model-22222222-2222-4222-8222-222222222222',
        authorizationToken: 'token',
        inputBytes: 40,
        inputSha256: 'a'.repeat(64),
      },
    })).toBe('独立开发模型调用缺少有效 Provider 测试代际');
    expect(validateLlmPayload({
      ...good,
      developmentAuthorization: {
        sessionId: 'dev-11111111-1111-4111-8111-111111111111',
        reservationId: 'model-22222222-2222-4222-8222-222222222222',
        authorizationToken: 'token',
        apiKey: 'forbidden',
      },
    })).toBe('developmentAuthorization 含未允许字段');
  });

  it('在构造提供商 Header 前拒绝非 ASCII API Key', () => {
    expect(validateLlmPayload({ ...good, config: { ...good.config, apiKey: 'sk-开始-test' } })).toBe(
      'apiKey 只能包含可见 ASCII 字符，不得含中文、全角符号、空格或换行',
    );
    expect(() => buildProviderRequest({
      kind: 'claude',
      baseUrl: 'https://api.anthropic.com',
      model: 'm',
      apiKey: 'sk-开始-test',
    }, [{ role: 'user', content: 'hi' }], 8)).toThrow(
      'apiKey 只能包含可见 ASCII',
    );
  });
});

describe('canReopenCompletedSingleAgentRun', () => {
  const completed = {
    status: 'completed',
    policy: { expectedArtifacts: 1, maxCalls: 2, totalOutputTokens: 1600, stageTimeoutMs: 60_000, groundingDisclosureApproved: true },
    callsStarted: 1,
    evidence: [{ agentId: 'AG-COORD' }],
  };

  it('allows only one remaining same-Agent call on a completed one-Agent run', () => {
    expect(canReopenCompletedSingleAgentRun(completed, 'AG-COORD')).toBe(true);
    expect(canReopenCompletedSingleAgentRun({ ...completed, callsStarted: 2 }, 'AG-COORD')).toBe(false);
    expect(canReopenCompletedSingleAgentRun({ ...completed, status: 'active' }, 'AG-COORD')).toBe(false);
    expect(canReopenCompletedSingleAgentRun({
      ...completed,
      policy: { ...completed.policy, expectedArtifacts: 2 },
    }, 'AG-COORD')).toBe(false);
    expect(canReopenCompletedSingleAgentRun(completed, 'AG-SEC')).toBe(false);
  });
});

describe('model orchestration validation', () => {
  it('accepts bounded policies and rejects budget or timeout expansion', () => {
    expect(
      normalizeOrchestrationPolicy({
        expectedArtifacts: 8,
        maxCalls: 16,
        totalOutputTokens: 3520,
        stageTimeoutMs: 60_000,
        groundingDisclosureApproved: true,
      }).ok,
    ).toBe(true);
    expect(
      normalizeOrchestrationPolicy({
        expectedArtifacts: 8,
        maxCalls: 7,
        totalOutputTokens: 3520,
        stageTimeoutMs: 60_000,
        groundingDisclosureApproved: true,
      }).ok,
    ).toBe(false);
    expect(
      normalizeOrchestrationPolicy({
        expectedArtifacts: 1,
        maxCalls: 2,
        totalOutputTokens: 440,
        stageTimeoutMs: 500_000,
        groundingDisclosureApproved: true,
      }).ok,
    ).toBe(false);
  });

  it('extracts provider usage without trusting malformed counters', () => {
    expect(extractProviderUsage('custom', { usage: { prompt_tokens: 12, completion_tokens: 7 } })).toEqual({
      inputTokens: 12,
      outputTokens: 7,
    });
    expect(extractProviderUsage('claude', { usage: { input_tokens: 10, output_tokens: -1 } })).toEqual({
      inputTokens: 10,
      outputTokens: 0,
    });
    expect(hasCompleteProviderUsage('custom', { usage: { prompt_tokens: 12, completion_tokens: 7 } })).toBe(true);
    expect(hasCompleteProviderUsage('claude', { usage: { input_tokens: 10, output_tokens: 3 } })).toBe(true);
    expect(hasCompleteProviderUsage('claude', { usage: { input_tokens: 10, output_tokens: -1 } })).toBe(false);
    expect(hasCompleteProviderUsage('custom', { usage: { prompt_tokens: 12 } })).toBe(false);
    expect(hasCompleteProviderUsage('custom', {})).toBe(false);
  });
});

describe('DemoScenario014 safe pilot preflight', () => {
  it('detects total timeout deterministically before retry approval is consumed', () => {
    expect(safePilotTotalTimeoutExpired(1_000, 240_000, 241_000)).toBe(false);
    expect(safePilotTotalTimeoutExpired(1_000, 240_000, 241_001)).toBe(true);
  });

  it('counts only active segments and gives each human gate its own deadline', () => {
    expect(safePilotActiveElapsedMs(80_000, null, 500_000)).toBe(80_000);
    expect(safePilotActiveElapsedMs(80_000, 500_000, 550_000)).toBe(130_000);
    expect(safePilotActiveTimeoutExpired(200_000, 500_000, 240_000, 540_000)).toBe(false);
    expect(safePilotActiveTimeoutExpired(200_000, 500_000, 240_000, 540_001)).toBe(true);
    expect(safePilotHumanWaitExpired(1_000, 300_000, 301_000)).toBe(false);
    expect(safePilotHumanWaitExpired(1_000, 300_000, 301_001)).toBe(true);
  });

  it('requires a feedback-bound repair document only for the rejected evidence', () => {
    const requirement = { agentId: 'AG-SEC', evidenceId: 'model-rejected-1', outputSha256: 'a'.repeat(64) };
    const repair = {
      version: '1.0.0',
      boundary: 'TRUSTED_LOCAL_VALIDATION_REPAIR',
      agentCode: 'AG-SEC',
      evidenceId: requirement.evidenceId,
      outputSha256: requirement.outputSha256,
      validationCode: 'final_gate_contract',
      validationProblem: 'AG-SEC 最后一行缺少 Gate',
      repairRules: [
        'REWRITE_CURRENT_STAGE_ONLY',
        'PRESERVE_TASK_GROUNDING_HANDOFF',
        'NO_NEW_FACTS',
        'SATISFY_LOCAL_VALIDATION_CONTRACT',
        'FINAL_GATE_CONTRACT',
      ],
    };
    const messages = [{ role: 'user', content: `task\n${SAFE_PILOT_RETRY_REPAIR_MARKER}\n${JSON.stringify(repair)}` }];
    expect(validateSafePilotRetryRepairMessages(messages, requirement)).toBeNull();
    expect(validateSafePilotRetryRepairMessages([{ role: 'user', content: 'ordinary retry' }], requirement)).toContain('必须且只能携带');
    expect(validateSafePilotRetryRepairMessages(messages, null)).toContain('非修复调用不得携带');
    expect(validateSafePilotRetryRepairMessages([
      { role: 'user', content: `task\n${SAFE_PILOT_RETRY_REPAIR_MARKER}\n${JSON.stringify({ ...repair, evidenceId: 'wrong' })}` },
    ], requirement)).toContain('被拒绝证据不一致');
    expect(validateSafePilotRetryRepairMessages([
      { role: 'user', content: `task\n${SAFE_PILOT_RETRY_REPAIR_MARKER}\n${JSON.stringify({ ...repair, validationCode: 'substantive_gate_blocked' })}` },
    ], requirement)).toContain('不得改变 Gate 结论');
  });

  it('creates server-owned task/context/profile hashes without issuing execution', () => {
    const normalized = normalizeSafePilotPreflight({
      runId: 'pilot-DemoScenario014-unit',
      taskText: '评审只读方案',
      contextText: 'P1 只读项目摘要',
      profile: buildSafePilotExecutionProfile(safePilotBindings, {
        inputRatePerMillion: 1,
        outputRatePerMillion: 2,
        maxCost: 1,
      }),
      humanApproval: { approved: true, approvalRef: 'approval-DemoScenario014-unit' },
    });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    const result = createSafePilotPreflight(normalized.request, 'workspace-test', 1_000);
    expect(result).toMatchObject({ ready: true, issued: false, expiresAt: 841_000, blockers: [] });
    expect(result.taskSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.contextSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.profileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.authorizationSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('requires all three startup hashes and rejects any mismatched issuance preflight', () => {
    const preflight = {
      taskSha256: 'a'.repeat(64),
      contextSha256: 'b'.repeat(64),
      profileSha256: 'c'.repeat(64),
    };
    const pins = normalizeSafePilotIssuerPins(preflight);
    expect(pins).toMatchObject({ ready: true, blockers: [], pins: preflight });
    expect(validateSafePilotIssuerPins(preflight, pins)).toBeNull();
    expect(validateSafePilotIssuerPins({ ...preflight, taskSha256: 'd'.repeat(64) }, pins)).toContain('任务哈希');
    expect(validateSafePilotIssuerPins({ ...preflight, contextSha256: 'd'.repeat(64) }, pins)).toContain('上下文哈希');
    expect(validateSafePilotIssuerPins({ ...preflight, profileSha256: 'd'.repeat(64) }, pins)).toContain('执行档案哈希');

    const partial = normalizeSafePilotIssuerPins({ taskSha256: 'a'.repeat(64) });
    expect(partial.ready).toBe(false);
    expect(partial.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining('context SHA-256'),
      expect.stringContaining('profile SHA-256'),
    ]));
    expect(validateSafePilotIssuerPins(preflight, partial)).toContain('缺少完整');
  });

  it('returns blockers instead of trusting incomplete bindings or permissions', () => {
    const normalized = normalizeSafePilotPreflight({
      runId: 'pilot-DemoScenario014-blocked',
      taskText: '评审只读方案',
      contextText: 'P1 只读项目摘要',
      profile: buildSafePilotExecutionProfile([], {}),
      humanApproval: { approved: false, approvalRef: '' },
    });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.blockers).toEqual(expect.arrayContaining([
      '四个 Agent 的 Provider/模型绑定未全部就绪',
      'Provider 输入/输出费率与费用上限尚未确认',
      '缺少本次启动包的人工作出确认',
    ]));
  });

  it('rejects an out-of-range human wait before hashing the profile', () => {
    const normalized = normalizeSafePilotPreflight({
      runId: 'pilot-human-wait-invalid-server',
      taskText: '评审只读方案',
      contextText: 'P1 只读项目摘要',
      profile: buildSafePilotExecutionProfile(safePilotBindings, {
        inputRatePerMillion: 1,
        outputRatePerMillion: 2,
        maxCost: 1,
      }, { maxHumanWaitMs: 31 * 60_000 }),
      humanApproval: { approved: true, approvalRef: 'approval-human-wait-invalid-server' },
    });
    expect(normalized).toEqual({ ok: false, error: '安全启动人工等待授权必须为 1-30 分钟整数' });
  });
});

describe('per-Agent capability policy', () => {
  it('normalizes UI and legacy ids to the eight canonical roles', () => {
    expect(normalizeAgentIdentifier('ag-coord')).toBe('AG-COORD');
    expect(normalizeAgentIdentifier('AG-ARCH')).toBe('PRO');
    expect(normalizeAgentIdentifier('executor')).toBe('EXECUTOR');
    expect(normalizeAgentIdentifier('unknown')).toBeNull();
  });

  it('creates least-privilege defaults and validates manual updates', () => {
    const profiles = createDefaultPermissionProfiles();
    expect(profiles).toHaveLength(8);
    expect(profiles.find((profile) => profile.agentId === 'AG-COORD')?.capabilities).toMatchObject({
      call_model: true,
      save_note: false,
      run_build: false,
    });
    expect(profiles.find((profile) => profile.agentId === 'EXECUTOR')?.capabilities).toMatchObject({
      call_model: true,
      save_note: false,
      run_build: false,
    });
    expect(profiles.find((profile) => profile.agentId === 'AG-DEV')?.capabilities.propose_patch).toBe(false);
    expect(profiles.every((profile) => profile.capabilities.preflight_patch === false)).toBe(true);
    expect(profiles.every((profile) => profile.capabilities.apply_patch === false)).toBe(true);
    expect(normalizePermissionUpdate({ agentId: 'ag-dev', capability: 'call_model', allowed: false })).toEqual({
      ok: true,
      update: { agentId: 'AG-DEV', capability: 'call_model', allowed: false },
    });
    expect(normalizePermissionUpdate({ agentId: 'AG-DEV', capability: 'git_push', allowed: true }).ok).toBe(false);
  });

  it('maps server actions to enforced capabilities', () => {
    expect(getRequiredCapability('llm')).toBe('call_model');
    expect(getRequiredCapability('save-note')).toBe('save_note');
    expect(getRequiredCapability('run-build')).toBe('run_build');
    expect(getRequiredCapability('checkpoint')).toBe('manage_checkpoint');
    expect(getRequiredCapability('patch-proposal')).toBe('propose_patch');
    expect(getRequiredCapability('patch-preflight')).toBe('preflight_patch');
    expect(getRequiredCapability('patch-apply')).toBe('apply_patch');
    expect(getRequiredCapability('git-push')).toBeNull();
  });
});

describe('patch proposal validation', () => {
  const valid = {
    proposal: {
      version: '1.0.0',
      proposalId: 'proposal-test-1',
      runId: 'run-patch-test',
      agentId: 'AG-DEV',
      title: 'Update example value',
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
    },
  };

  it('accepts an exact bounded unified diff and returns a proposal hash', () => {
    const result = normalizePatchProposal(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proposalSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects dependency/config paths and inconsistent hunks', () => {
    const packagePatch = structuredClone(valid);
    packagePatch.proposal.files[0].path = 'package.json';
    packagePatch.proposal.files[0].patch = packagePatch.proposal.files[0].patch.split('src/example.ts').join('package.json');
    expect(normalizePatchProposal(packagePatch).ok).toBe(false);

    const badHunk = structuredClone(valid);
    badHunk.proposal.files[0].patch = badHunk.proposal.files[0].patch.replace('@@ -1 +1 @@', '@@ -1,2 +1,2 @@');
    expect(normalizePatchProposal(badHunk).ok).toBe(false);
  });
});

describe('durable checkpoint validation', () => {
  function validCheckpoint() {
    const stages = buildPipelinePlan(agentFirstDashboardView.agents, 'checkpoint validation');
    const pipeline = pipelineReducer(INITIAL_PIPELINE_STATE, {
      type: 'start',
      runId: 'run-checkpoint-test',
      mode: 'simulation',
      taskText: 'checkpoint validation',
      stages,
    });
    return createTaskCheckpoint(pipeline, {}, 1, '2099-01-01T00:00:00.000Z');
  }

  it('accepts a bounded canonical DAG checkpoint', () => {
    expect(normalizeCheckpointPayload({ checkpoint: validCheckpoint() }).ok).toBe(true);
  });

  it('rejects cycles, unknown roles and oversized payloads', () => {
    const cyclic = validCheckpoint();
    cyclic.dag.nodes[0].dependencies = [cyclic.dag.nodes[1].id];
    cyclic.dag.nodes[1].dependencies = [cyclic.dag.nodes[0].id];
    expect(normalizeCheckpointPayload({ checkpoint: cyclic }).ok).toBe(false);

    const unknownRole = validCheckpoint();
    unknownRole.pipeline.stages[0].agentCode = 'UNKNOWN';
    expect(normalizeCheckpointPayload({ checkpoint: unknownRole }).ok).toBe(false);

    const oversized = validCheckpoint();
    oversized.pipeline.taskText = 'x'.repeat(300_000);
    expect(normalizeCheckpointPayload({ checkpoint: oversized }).ok).toBe(false);

    const secretBearing = validCheckpoint() as Record<string, any>;
    secretBearing.orchestration = { apiKey: 'must-not-persist' };
    expect(normalizeCheckpointPayload({ checkpoint: secretBearing }).ok).toBe(false);
  });
});

describe('approval-bound action contract', () => {
  const payload = {
    kind: 'save-note',
    runId: 'run-123',
    idempotencyKey: 'run-123:save-note',
    agentId: 'AG-COORD',
    title: 'note',
    content: 'verified content',
  };

  function descriptorFor(input: unknown) {
    const result = normalizeActionDescriptor(input);
    if (!result.ok) throw new Error(result.error);
    return result.descriptor;
  }

  it('normalizes actions without retaining note content in the approval record', () => {
    const result = normalizeActionDescriptor(payload);
    expect(result.ok).toBe(true);
    const descriptor = descriptorFor(payload);
    expect(descriptor).toMatchObject({
      kind: 'save-note',
      runId: 'run-123',
      contentLength: 16,
      contentSha256: sha256Hex('verified content'),
    });
    expect(descriptor).not.toHaveProperty('content');
  });

  it('binds a single-use token to workspace, action hash and expiry', () => {
    const session = createSessionToken();
    const workspaceId = createWorkspaceId('D:/work/project');
    const descriptor = descriptorFor(payload);
    const requestHash = createActionFingerprint(workspaceId, descriptor);
    const expiresAt = Date.now() + 60_000;
    const token = createApprovalToken(session, 'approval-1', requestHash, expiresAt);
    expect(verifyApprovalToken(session, 'approval-1', requestHash, expiresAt, token)).toBe(true);
    expect(verifyApprovalToken(session, 'approval-1', `${requestHash}x`, expiresAt, token)).toBe(false);
  });

  it('rejects actions without run and idempotency binding', () => {
    expect(normalizeActionDescriptor({ kind: 'run-build' }).ok).toBe(false);
    expect(normalizeActionDescriptor({ kind: 'run-build', runId: 'run', idempotencyKey: '../bad' }).ok).toBe(false);
  });

  it('binds patch preflight and application approvals to one proposal without retaining patch content', () => {
    const descriptor = descriptorFor({
      kind: 'patch-preflight',
      runId: 'run-patch-preflight',
      idempotencyKey: 'run-patch-preflight:proposal-1',
      agentId: 'AG-SEC',
      proposalId: 'proposal-1',
      proposalSha256: 'a'.repeat(64),
      patch: 'must-not-enter-approval',
    });
    expect(descriptor).toMatchObject({
      kind: 'patch-preflight',
      proposalId: 'proposal-1',
      proposalSha256: 'a'.repeat(64),
    });
    expect(descriptor).not.toHaveProperty('patch');
    const applyDescriptor = descriptorFor({
      kind: 'patch-apply',
      runId: 'run-patch-preflight',
      idempotencyKey: 'run-patch-preflight:apply:proposal-1',
      agentId: 'EXECUTOR',
      proposalId: 'proposal-1',
      proposalSha256: 'a'.repeat(64),
      patch: 'must-not-enter-approval',
    });
    expect(applyDescriptor).toMatchObject({
      kind: 'patch-apply',
      agentId: 'EXECUTOR',
      proposalId: 'proposal-1',
      proposalSha256: 'a'.repeat(64),
    });
    expect(applyDescriptor).not.toHaveProperty('patch');
    expect(normalizeActionDescriptor({ ...descriptor, proposalSha256: 'bad' }).ok).toBe(false);
  });
});

describe('DemoScenario021 operator evidence v1', () => {
  function build(source = operatorEvidenceSource()) {
    return buildOperatorEvidenceExportV1(source);
  }

  it('projects one final-human-accepted safe-pilot run into the exact redacted schema', () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.export)).toEqual([
      'schema',
      'schemaVersion',
      'exportedAt',
      'producer',
      'scope',
      'runtimeTruth',
      'bindings',
      'authorization',
      'run',
      'integrity',
    ]);
    expect(result.export).toMatchObject({
      schema: 'agenthub.operator-evidence',
      schemaVersion: 1,
      exportedAt: OPERATOR_EVIDENCE_EXPORTED_AT,
      scope: {
        runId: 'pilot-DemoScenario021',
        profileId: 'pilot-4-readonly-v2',
        terminalStatus: 'accepted',
      },
      runtimeTruth: {
        sourceLifetime: 'process_memory',
        sameProcessRefresh: 'refetchable',
        survivesServiceRestart: false,
        rehydratesRun: false,
        automaticPersistence: false,
        workspaceWritten: false,
        checkpointCreated: false,
        rawContentIncluded: false,
      },
      run: {
        finalHumanAccepted: true,
        sideEffectsAllowed: false,
        sideEffectsPerformed: false,
        budgets: { cost: { currency: 'CNY', limit: '1.000000' } },
        usage: {
          calls: 4,
          retries: 0,
          acceptedStages: 4,
          acceptedHandoffs: 3,
          cost: { currency: 'CNY', observed: '0.000492' },
        },
      },
      integrity: {
        algorithm: 'sha256',
        canonicalization: 'agenthub-json-v1',
      },
    });
    expect(result.export.run.stages).toHaveLength(4);
    expect(result.export.run.stages[0]).not.toHaveProperty('handoffSha256');
    expect(result.export.run.stages.slice(1).every((stage) => /^[a-f0-9]{64}$/.test(stage.handoffSha256 ?? ''))).toBe(true);
    expect(result.export.run.stages.every((stage) => /^(0|[1-9][0-9]*)\.[0-9]{6}$/.test(stage.cost.observed))).toBe(true);
    expect(result.export).not.toHaveProperty('signature');

    const unsigned = structuredClone(result.export) as unknown as Record<string, unknown>;
    delete unsigned.integrity;
    expect(result.export.integrity.payloadSha256).toBe(sha256Hex(canonicalizeAgentHubJsonV1(unsigned)));
  });

  it('is deterministic for a fixed clock and ignores all forbidden source fields recursively', () => {
    const first = build();
    const changedForbiddenSource = operatorEvidenceSource();
    changedForbiddenSource.run.rawTask = 'DemoScenario021_RAW_TASK_CANARY_CHANGED';
    changedForbiddenSource.authorization.apiKey = 'fixture-key-b';
    (changedForbiddenSource.authorization as unknown as Record<string, unknown>).unknownFutureField = {
      nested: 'must-not-appear',
    };
    const second = build(changedForbiddenSource);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.export).toEqual(first.export);

    const serialized = JSON.stringify(first.export);
    const canaries = [
      'fixture-key-a',
      'DemoScenario021-session-token-canary',
      'DemoScenario021-authorization-token-canary',
      'C:\\PublicFixture\\blocked\\example.md',
      'DemoScenario021_RAW_TASK_CANARY',
      'DemoScenario021_RAW_CONTEXT_CANARY',
      'DemoScenario021_PROVIDER_TEXT_CANARY',
      'DemoScenario021_EVENT_SUMMARY_CANARY',
      'DemoScenario021_RECEIPT_DETAIL_CANARY',
      'DemoScenario021_PATCH_PATH_CANARY',
      'unknownFutureField',
    ];
    for (const canary of canaries) {
      expect(serialized).not.toContain(JSON.stringify(canary).slice(1, -1));
    }

    const keys = new Set<string>();
    const collectKeys = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(collectKeys);
        return;
      }
      if (!value || typeof value !== 'object') return;
      for (const [key, nested] of Object.entries(value)) {
        keys.add(key);
        collectKeys(nested);
      }
    };
    collectKeys(first.export);
    for (const forbiddenKey of ['apiKey', 'sessionToken', 'authorizationToken', 'workspace', 'rawTask', 'rawContext', 'providerText']) {
      expect(keys.has(forbiddenKey)).toBe(false);
    }
  });

  it('changes the checksum when an allowed projected value changes', () => {
    const baseline = build();
    const changed = operatorEvidenceSource();
    changed.authorization.operatorEvidenceStages[0].inputTokens += 1;
    changed.authorization.operatorEvidenceStages[0].observedCostMicros += 1;
    changed.authorization.usage.observedInputTokens += 1;
    changed.authorization.usage.observedCostMicros += 1;
    const updated = build(changed);
    expect(baseline.ok).toBe(true);
    expect(updated.ok).toBe(true);
    if (!baseline.ok || !updated.ok) return;
    expect(updated.export.run.stages[0].inputTokens).toBe(101);
    expect(updated.export.integrity.payloadSha256).not.toBe(baseline.export.integrity.payloadSha256);
  });

  it('fails closed for ineligible, mismatched and invalid source state', () => {
    const nonTerminal = operatorEvidenceSource();
    nonTerminal.run.status = 'active';
    expect(build(nonTerminal)).toEqual({ ok: false, errorCode: 'RUN_NOT_ELIGIBLE' });

    const nonPilot = operatorEvidenceSource();
    nonPilot.authorization.profile.profileId = 'other-profile';
    expect(build(nonPilot)).toEqual({ ok: false, errorCode: 'RUN_NOT_ELIGIBLE' });

    const noFinalAcceptance = operatorEvidenceSource();
    (noFinalAcceptance.authorization as unknown as { finalHumanAcceptedAt: string | null })
      .finalHumanAcceptedAt = null;
    expect(build(noFinalAcceptance)).toEqual({ ok: false, errorCode: 'RUN_NOT_ELIGIBLE' });

    const mismatched = operatorEvidenceSource();
    mismatched.authorization.runId = 'pilot-other';
    expect(build(mismatched)).toEqual({ ok: false, errorCode: 'RUN_NOT_ELIGIBLE' });

    const invalidHash = operatorEvidenceSource();
    invalidHash.authorization.taskSha256 = 'A'.repeat(64);
    expect(build(invalidHash)).toEqual({ ok: false, errorCode: 'EXPORT_SOURCE_INVALID' });

    const nonFinite = operatorEvidenceSource();
    nonFinite.authorization.usage.activeElapsedMs = Number.NaN;
    expect(build(nonFinite)).toEqual({ ok: false, errorCode: 'EXPORT_SOURCE_INVALID' });

    const oversizedArray = operatorEvidenceSource();
    oversizedArray.run.evidence.push(
      { ...oversizedArray.run.evidence[0], evidenceId: 'extra-1' },
      { ...oversizedArray.run.evidence[0], evidenceId: 'extra-2' },
    );
    expect(build(oversizedArray)).toEqual({ ok: false, errorCode: 'EXPORT_SOURCE_INVALID' });
  });

  it('canonicalizes lexicographically, rejects unsupported values and enforces the UTF-8 size boundary', () => {
    expect(canonicalizeAgentHubJsonV1({ b: 1, a: [true, null] })).toBe('{"a":[true,null],"b":1}');
    expect(() => canonicalizeAgentHubJsonV1({ value: undefined })).toThrow();
    expect(() => canonicalizeAgentHubJsonV1({ value: Number.POSITIVE_INFINITY })).toThrow();
    expect(operatorEvidenceJsonFitsSizeLimit('a'.repeat(OPERATOR_EVIDENCE_MAX_BYTES))).toBe(true);
    expect(operatorEvidenceJsonFitsSizeLimit('a'.repeat(OPERATOR_EVIDENCE_MAX_BYTES + 1))).toBe(false);
  });
});
