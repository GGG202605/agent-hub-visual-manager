import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDevelopmentPatch,
  applyDevelopmentTextReplacement,
  applyDevelopmentTextReplacementBatch,
  callViaServer,
  cancelModelOrchestration,
  createDevelopmentSession,
  fetchDevelopmentDiff,
  fetchDevelopmentPreset,
  fetchDevelopmentSnapshot,
  finalizeDevelopmentSession,
  fetchHealth,
  fetchOperatorEvidenceExport,
  issueDevelopmentModelCall,
  listDevelopmentSessions,
  ModelGatewayError,
  preflightDevelopmentSession,
  readDevelopmentFiles,
  resumeDevelopmentSession,
  runDevelopmentBrowserAcceptance,
  runDevelopmentCommand,
  searchDevelopmentFiles,
  submitDevelopmentReview,
  updateDevelopmentProgress,
  type OperatorEvidenceExportV1,
} from '../serverBridge';

const DEVELOPMENT_COST_POLICY = {
  currency: 'CNY' as const,
  inputMicrosPerMillionTokens: 1_000_000,
  outputMicrosPerMillionTokens: 2_000_000,
  maxCostMicros: 50_000_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function health(sessionToken: string) {
  return {
    ok: true,
    version: '1.8.0',
    workspace: 'forbidden-workspace-canary',
    workspaceId: 'forbidden-workspace-id-canary',
    agentHub: 'forbidden-agent-hub-path-canary',
    receipts: 0,
    safePilotIssuanceEnabled: true,
    serviceInstanceId: `instance-${sessionToken}`,
    sessionToken,
  };
}

function exportFixture(): OperatorEvidenceExportV1 {
  return {
    schema: 'agenthub.operator-evidence',
    schemaVersion: 1,
    exportedAt: '2099-01-01T00:04:00.000Z',
    producer: { product: 'agent-hub-visual-manager', serverVersion: '1.8.0' },
    scope: { runId: 'pilot-DemoScenario021', profileId: 'pilot-4-readonly-v2', terminalStatus: 'accepted' },
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
    bindings: {
      taskSha256: '1'.repeat(64),
      contextSha256: '2'.repeat(64),
      profileSha256: '3'.repeat(64),
      authorizationSha256: '4'.repeat(64),
    },
    authorization: {
      authorizationId: 'pilot-auth-DemoScenario021',
      issuedAt: '2099-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T01:00:00.000Z',
      acceptedAgentIds: ['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW'],
    },
    run: {
      agentOrder: ['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW'],
      startedAt: '2099-01-01T00:01:00.000Z',
      completedAt: '2099-01-01T00:03:00.000Z',
      finalHumanAccepted: true,
      sideEffectsAllowed: false,
      sideEffectsPerformed: false,
      budgets: {
        maxCalls: 5,
        maxRetries: 1,
        maxInputTokens: 64_000,
        maxOutputTokens: 1_600,
        maxActiveSeconds: 240,
        cost: { currency: 'CNY', limit: '1.000000' },
      },
      usage: {
        calls: 4,
        retries: 0,
        inputTokens: 406,
        outputTokens: 86,
        activeMs: 1_000,
        cost: { currency: 'CNY', observed: '0.000492' },
        acceptedStages: 4,
        acceptedHandoffs: 3,
      },
      stages: [],
    },
    integrity: {
      algorithm: 'sha256',
      canonicalization: 'agenthub-json-v1',
      payloadSha256: 'a'.repeat(64),
    },
  };
}

function installFetchMock() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({}));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DemoScenario021 authenticated operator evidence bridge', () => {
  it('bootstraps one session then sends one protected, encoded run request', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23901';
    const expected = exportFixture();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('DemoScenario021-session-token-1')))
      .mockResolvedValueOnce(jsonResponse({ ok: true, export: expected }));

    await expect(fetchOperatorEvidenceExport(serverUrl, 'pilot.run-1_2')).resolves.toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${serverUrl}/api/session`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${serverUrl}/api/operator-evidence/export?runId=pilot.run-1_2`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'GET',
      headers: { 'x-agenthub-session': 'DemoScenario021-session-token-1' },
    });
  });

  it('reuses a current token without a redundant health request', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23902';
    fetchMock.mockResolvedValueOnce(jsonResponse(health('DemoScenario021-session-token-current')));
    await fetchHealth(serverUrl);
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, export: exportFixture() }));

    await fetchOperatorEvidenceExport(serverUrl, 'pilot-DemoScenario021');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/operator-evidence/export?runId=pilot-DemoScenario021');
  });

  it('refreshes once after one 401 and uses only the fresh token on the retry', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23903';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('DemoScenario021-session-token-old')))
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse(health('DemoScenario021-session-token-fresh')))
      .mockResolvedValueOnce(jsonResponse({ ok: true, export: exportFixture() }));

    await fetchOperatorEvidenceExport(serverUrl, 'pilot-DemoScenario021');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: { 'x-agenthub-session': 'DemoScenario021-session-token-old' },
    });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      headers: { 'x-agenthub-session': 'DemoScenario021-session-token-fresh' },
    });
  });

  it('stops after a second 401 without looping or exposing either token', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23904';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('DemoScenario021-secret-old')))
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse(health('DemoScenario021-secret-fresh')))
      .mockResolvedValueOnce(jsonResponse({ error: '会话已失效' }, 401));

    let failureMessage = '';
    try {
      await fetchOperatorEvidenceExport(serverUrl, 'pilot-DemoScenario021');
    } catch (error) {
      failureMessage = error instanceof Error ? error.message : String(error);
    }
    expect(failureMessage).toBe('会话已失效');
    expect(failureMessage).not.toMatch(/DemoScenario021-secret-(old|fresh)/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('rejects invalid run IDs before transport and bounds server or malformed errors', async () => {
    const fetchMock = installFetchMock();
    await expect(fetchOperatorEvidenceExport('http://127.0.0.1:23905', 'bad/run')).rejects.toThrow('runId 非法');
    expect(fetchMock).not.toHaveBeenCalled();

    const serverUrl = 'http://127.0.0.1:23906';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('DemoScenario021-session-token-error')))
      .mockResolvedValueOnce(jsonResponse({ ok: false, errorCode: 'RUN_NOT_ELIGIBLE', error: '尚未最终验收' }, 409));
    await expect(fetchOperatorEvidenceExport(serverUrl, 'pilot-DemoScenario021')).rejects.toThrow('尚未最终验收');

    const malformedUrl = 'http://127.0.0.1:23907';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('DemoScenario021-session-token-malformed')))
      .mockResolvedValueOnce(jsonResponse({ ok: true, export: {} }));
    await expect(fetchOperatorEvidenceExport(malformedUrl, 'pilot-DemoScenario021')).rejects.toThrow('脱敏证据响应无效');
  });
});

describe('development browser acceptance bridge', () => {
  it('carries cancellation through session bootstrap and bounds orchestration cancellation independently', async () => {
    const fetchMock = installFetchMock();
    const bootstrapController = new AbortController();
    const bootstrapUrl = 'http://127.0.0.1:24986';
    fetchMock.mockImplementationOnce(async (_input, init) => {
      expect(init?.signal).toBe(bootstrapController.signal);
      bootstrapController.abort();
      throw bootstrapController.signal.reason;
    });

    await expect(fetchDevelopmentPreset(bootstrapUrl, bootstrapController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    const cancelUrl = 'http://127.0.0.1:24987';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-cancel-token')))
      .mockResolvedValueOnce(jsonResponse({ ok: true, run: { runId: 'development-run-cancel', status: 'cancelled' } }));

    await expect(cancelModelOrchestration(cancelUrl, 'development-run-cancel')).resolves.toMatchObject({
      runId: 'development-run-cancel',
      status: 'cancelled',
    });
    const healthSignal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(healthSignal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBe(healthSignal);
  });

  it('preflights through the authenticated fixed endpoint without a session ID', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23908';
    const input = {
      root: 'D:\\Projects\\trusted-app',
      task: 'refactor the backend security protocol',
      presetId: 'local-autonomous-v1',
    };
    const result = {
      ok: true,
      presetId: 'local-autonomous-v1',
      mode: 'create',
      resume: null,
      rootName: 'trusted-app',
      branch: 'master',
      agentPlan: { size: 4, reasonCode: 'complex-cross-cutting', agents: ['AG-COORD', 'PRO', 'AG-DEV', 'AG-REVIEW'] },
      requirements: { testChange: false, browserAcceptance: false },
      scripts: ['build', 'test'],
      acceptanceScripts: ['preview'],
      packageManager: 'npm',
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-preflight-token')))
      .mockResolvedValueOnce(jsonResponse(result));

    await expect(preflightDevelopmentSession(serverUrl, input)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${serverUrl}/api/development/preflight`);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agenthub-session': 'development-preflight-token',
      },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual(input);
  });

  it('recovers one lost create response with the identical creation identity', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23952';
    const input = {
      root: 'D:\\Projects\\trusted-app',
      task: 'create one recoverable session',
      presetId: 'local-autonomous-v1',
      costPolicy: DEVELOPMENT_COST_POLICY,
    };
    const result = {
      sessionId: 'dev-11111111-1111-4111-8111-111111111111',
      rootBound: true,
      recovered: true as const,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-create-recovery')))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(result));
    await expect(createDevelopmentSession(serverUrl, input)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      ...input,
      creationId: expect.stringMatching(/^creation-[a-f0-9-]{36}$/),
    });

    fetchMock.mockReset();
    const rejectedUrl = 'http://127.0.0.1:23953';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-create-rejected')))
      .mockResolvedValueOnce(jsonResponse({ error: 'creationId 已绑定其他开发创建合同' }, 409));
    await expect(createDevelopmentSession(rejectedUrl, input)).rejects.toThrow('creationId 已绑定其他开发创建合同');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    const controller = new AbortController();
    const cancelledUrl = 'http://127.0.0.1:23954';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-create-cancelled')))
      .mockImplementationOnce(async () => {
        controller.abort('user_stop');
        throw new TypeError('Failed to fetch');
      });
    await expect(createDevelopmentSession(cancelledUrl, input, controller.signal)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('recovers one lost progress response with the identical transition identity', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23955';
    const sessionId = 'dev-11111111-1111-4111-8111-111111111111';
    const result = { sessionId, phase: 'editing', recovered: true as const };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-progress-recovery')))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(result));

    await expect(updateDevelopmentProgress(serverUrl, sessionId, 'analyzing')).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      sessionId,
      phase: 'analyzing',
      transitionId: expect.stringMatching(/^transition-[a-f0-9-]{36}$/),
    });

    fetchMock.mockReset();
    const rejectedUrl = 'http://127.0.0.1:23956';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-progress-rejected')))
      .mockResolvedValueOnce(jsonResponse({ error: 'transitionId 已绑定其他开发阶段' }, 409));
    await expect(updateDevelopmentProgress(rejectedUrl, sessionId, 'editing')).rejects.toThrow('transitionId');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    const controller = new AbortController();
    const cancelledUrl = 'http://127.0.0.1:23957';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-progress-cancelled')))
      .mockImplementationOnce(async () => {
        controller.abort('user_stop');
        throw new TypeError('Failed to fetch');
      });
    await expect(updateDevelopmentProgress(cancelledUrl, sessionId, 'failed', controller.signal))
      .rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('replays each allowlisted read-only development request once with the identical body', async () => {
    const fetchMock = installFetchMock();
    const sessionId = 'dev-11111111-1111-4111-8111-111111111111';
    const cases = [
      {
        serverUrl: 'http://127.0.0.1:23959',
        path: '/api/development/preset',
        call: () => fetchDevelopmentPreset('http://127.0.0.1:23959'),
        response: { preset: { id: 'local-autonomous-v1', isDefault: true } },
        result: { id: 'local-autonomous-v1', isDefault: true },
      },
      {
        serverUrl: 'http://127.0.0.1:23960',
        path: '/api/development/sessions',
        call: () => listDevelopmentSessions('http://127.0.0.1:23960'),
        response: { sessions: [{ sessionId, phase: 'ready' }] },
        result: [{ sessionId, phase: 'ready' }],
      },
      {
        serverUrl: 'http://127.0.0.1:23924',
        path: '/api/development/preflight',
        call: () => preflightDevelopmentSession('http://127.0.0.1:23924', { root: 'D:\\Projects\\trusted-app', task: 'inspect safely' }),
        result: { ok: true, mode: 'create' },
      },
      {
        serverUrl: 'http://127.0.0.1:23925',
        path: '/api/development/snapshot',
        call: () => fetchDevelopmentSnapshot('http://127.0.0.1:23925', sessionId),
        result: { sessionId, files: [], gitStatus: [] },
      },
      {
        serverUrl: 'http://127.0.0.1:23926',
        path: '/api/development/inspect',
        call: () => readDevelopmentFiles('http://127.0.0.1:23926', sessionId, ['src/app.ts']),
        result: { files: [] },
      },
      {
        serverUrl: 'http://127.0.0.1:23927',
        path: '/api/development/inspect',
        call: () => searchDevelopmentFiles('http://127.0.0.1:23927', sessionId, 'needle'),
        result: { matches: [] },
      },
      {
        serverUrl: 'http://127.0.0.1:23928',
        path: '/api/development/inspect',
        call: () => fetchDevelopmentDiff('http://127.0.0.1:23928', sessionId),
        result: { diff: '', newFiles: [] },
      },
    ];

    for (const entry of cases) {
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(health(`read-only-${entry.serverUrl.slice(-2)}`)))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(jsonResponse('response' in entry ? entry.response : entry.result));

      await expect(entry.call()).resolves.toEqual(entry.result);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1]?.[0]).toBe(`${entry.serverUrl}${entry.path}`);
      expect(fetchMock.mock.calls[2]?.[0]).toBe(`${entry.serverUrl}${entry.path}`);
      expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);
    }
  });

  it('replays one truncated successful read, but not HTTP rejection or cancellation', async () => {
    const fetchMock = installFetchMock();
    const sessionId = 'dev-11111111-1111-4111-8111-111111111111';
    const result = { diff: 'bounded diff', newFiles: [] };
    const truncatedUrl = 'http://127.0.0.1:23929';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('read-only-truncated')))
      .mockResolvedValueOnce(new Response('{"diff":', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(result));
    await expect(fetchDevelopmentDiff(truncatedUrl, sessionId)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);

    fetchMock.mockReset();
    const rejectedUrl = 'http://127.0.0.1:23930';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('read-only-rejected')))
      .mockResolvedValueOnce(jsonResponse({ error: '会话不存在' }, 409));
    await expect(fetchDevelopmentSnapshot(rejectedUrl, sessionId)).rejects.toThrow('会话不存在');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    const controller = new AbortController();
    const cancelledUrl = 'http://127.0.0.1:23931';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('read-only-cancelled')))
      .mockImplementationOnce(async () => {
        controller.abort('user_stop');
        throw new TypeError('Failed to fetch');
      });
    await expect(fetchDevelopmentSnapshot(cancelledUrl, sessionId, controller.signal)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    const twiceFailedUrl = 'http://127.0.0.1:23933';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('read-only-twice-failed')))
      .mockRejectedValueOnce(new TypeError('first disconnect'))
      .mockRejectedValueOnce(new TypeError('second disconnect'));
    await expect(fetchDevelopmentSnapshot(twiceFailedUrl, sessionId)).rejects.toThrow('second disconnect');
    expect(fetchMock).toHaveBeenCalledTimes(3);

  });

  it('recovers one lost fixed-command response with the identical execution identity', async () => {
    const fetchMock = installFetchMock();
    const sessionId = 'dev-11111111-1111-4111-8111-111111111111';
    const commandUrl = 'http://127.0.0.1:23932';
    const result = {
      executionId: 'command-server-result',
      commandId: 'test',
      status: 'passed' as const,
      exitCode: 0,
      timedOut: false,
      worktreeChanged: false,
      durationMs: 12,
      outputSha256: 'a'.repeat(64),
      sourceStateSha256: 'b'.repeat(64),
      finishedAt: '2099-01-01T00:00:00.000Z',
      outputTail: 'bounded output',
      session: { sessionId },
      replayed: true as const,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-command-replay')))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(result));
    await expect(runDevelopmentCommand(commandUrl, sessionId, 'test')).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      sessionId,
      commandId: 'test',
      executionId: expect.stringMatching(/^command-[a-f0-9-]{36}$/),
    });

    fetchMock.mockReset();
    const retryUrl = 'http://127.0.0.1:23961';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-command-stability-retry')))
      .mockResolvedValueOnce(jsonResponse({
        ...result,
        stabilityRetryOf: 'command-first-failure',
      }));
    await expect(runDevelopmentCommand(
      retryUrl,
      sessionId,
      'test',
      undefined,
      { stabilityRetryOf: 'command-first-failure' },
    )).resolves.toMatchObject({ stabilityRetryOf: 'command-first-failure' });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      sessionId,
      commandId: 'test',
      stabilityRetryOf: 'command-first-failure',
      executionId: expect.stringMatching(/^command-[a-f0-9-]{36}$/),
    });

    fetchMock.mockReset();
    const rejectedUrl = 'http://127.0.0.1:23948';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-command-rejected')))
      .mockResolvedValueOnce(jsonResponse({ error: 'executionId 已使用' }, 409));
    await expect(runDevelopmentCommand(rejectedUrl, sessionId, 'test')).rejects.toThrow('executionId 已使用');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    const controller = new AbortController();
    const cancelledUrl = 'http://127.0.0.1:23949';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-command-cancelled')))
      .mockImplementationOnce(async () => {
        controller.abort('user_stop');
        throw new TypeError('Failed to fetch');
      });
    await expect(runDevelopmentCommand(cancelledUrl, sessionId, 'test', controller.signal)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('replays each allowlisted idempotent development mutation once with the identical body', async () => {
    const fetchMock = installFetchMock();
    const sessionId = 'dev-11111111-1111-4111-8111-111111111111';
    const result = {
      ok: true as const,
      session: { sessionId, changeSetCount: 1 },
      fileCount: 2,
      patchSha256: 'a'.repeat(64),
      replayed: true as const,
    };
    const cases = [
      {
        serverUrl: 'http://127.0.0.1:23934',
        path: '/api/development/apply',
        call: () => applyDevelopmentPatch('http://127.0.0.1:23934', {
          sessionId,
          changeSetId: 'patch-replay',
          patch: 'diff --git a/src/a.ts b/src/a.ts\n',
        }),
      },
      {
        serverUrl: 'http://127.0.0.1:23935',
        path: '/api/development/replace',
        call: () => applyDevelopmentTextReplacement('http://127.0.0.1:23935', {
          sessionId,
          changeSetId: 'replace-replay',
          path: 'src/a.ts',
          oldText: 'a',
          newText: 'b',
        }),
      },
      {
        serverUrl: 'http://127.0.0.1:23936',
        path: '/api/development/replace-batch',
        call: () => applyDevelopmentTextReplacementBatch('http://127.0.0.1:23936', {
          sessionId,
          changeSetId: 'batch-replay',
          replacements: [
            { path: 'src/a.ts', oldText: 'a', newText: 'b' },
            { path: 'src/b.ts', oldText: 'c', newText: 'd' },
          ],
        }),
      },
    ];

    for (const entry of cases) {
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(health(`mutation-${entry.serverUrl.slice(-2)}`)))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(jsonResponse(result));

      await expect(entry.call()).resolves.toEqual(result);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1]?.[0]).toBe(`${entry.serverUrl}${entry.path}`);
      expect(fetchMock.mock.calls[2]?.[0]).toBe(`${entry.serverUrl}${entry.path}`);
      expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);
    }
  });

  it('replays one truncated mutation response, but not HTTP rejection or cancellation', async () => {
    const fetchMock = installFetchMock();
    const sessionId = 'dev-11111111-1111-4111-8111-111111111111';
    const input = {
      sessionId,
      changeSetId: 'truncated-mutation',
      path: 'src/app.ts',
      oldText: 'a',
      newText: 'b',
    };
    const result = { ok: true as const, session: { sessionId }, fileCount: 1, patchSha256: 'a'.repeat(64), replayed: true as const };
    const truncatedUrl = 'http://127.0.0.1:23937';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('mutation-truncated')))
      .mockResolvedValueOnce(new Response('{"ok":', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(result));
    await expect(applyDevelopmentTextReplacement(truncatedUrl, input)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);

    fetchMock.mockReset();
    const rejectedUrl = 'http://127.0.0.1:23938';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('mutation-rejected')))
      .mockResolvedValueOnce(jsonResponse({ error: '开发变更响应重放合同不匹配' }, 409));
    await expect(applyDevelopmentTextReplacement(rejectedUrl, input)).rejects.toThrow('重放合同不匹配');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    const controller = new AbortController();
    const cancelledUrl = 'http://127.0.0.1:23939';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('mutation-cancelled')))
      .mockImplementationOnce(async () => {
        controller.abort('user_stop');
        throw new TypeError('Failed to fetch');
      });
    await expect(applyDevelopmentTextReplacement(cancelledUrl, input, controller.signal)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resumes with the user-reentered task through the authenticated fixed endpoint', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23909';
    const input = {
      sessionId: 'dev-11111111-1111-4111-8111-111111111111',
      root: 'D:\\Projects\\trusted-app',
      task: 'resume the exact interrupted task',
    };
    const result = { sessionId: input.sessionId, rootBound: true, phase: 'editing' };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-resume-token')))
      .mockResolvedValueOnce(jsonResponse(result));

    await expect(resumeDevelopmentSession(serverUrl, input)).resolves.toEqual(result);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${serverUrl}/api/development/sessions/resume`);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agenthub-session': 'development-resume-token',
      },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual(input);
  });

  it('recovers one lost resume or truncated Final response, but not rejection or cancellation', async () => {
    const fetchMock = installFetchMock();
    const resumeInput = {
      sessionId: 'dev-11111111-1111-4111-8111-111111111111',
      root: 'D:\\Projects\\trusted-app',
      task: 'resume exact evidence',
    };
    const resumeResult = { sessionId: resumeInput.sessionId, rootBound: true, phase: 'editing', replayed: true as const };
    const disconnectedUrl = 'http://127.0.0.1:23944';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-resume-replay')))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(resumeResult));
    await expect(resumeDevelopmentSession(disconnectedUrl, resumeInput)).resolves.toEqual(resumeResult);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);

    fetchMock.mockReset();
    const finalResult = {
      ready: true,
      session: { sessionId: resumeInput.sessionId, phase: 'ready' },
      changedPaths: ['src/app.ts'],
      diffCheckPassed: true,
      requiredCommands: [],
      missingOrFailed: [],
      acceptanceBlockers: [],
      reviewBlockers: [],
      browserAcceptanceRequired: false,
      blockedChangedPathCount: 0,
      replayed: true as const,
    };
    const truncatedUrl = 'http://127.0.0.1:23945';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-final-truncated')))
      .mockResolvedValueOnce(new Response('{"ready":', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(finalResult));
    await expect(finalizeDevelopmentSession(truncatedUrl, resumeInput.sessionId)).resolves.toEqual(finalResult);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);

    fetchMock.mockReset();
    const rejectedUrl = 'http://127.0.0.1:23946';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-final-rejected')))
      .mockResolvedValueOnce(jsonResponse({ error: '最终证据已漂移' }, 409));
    await expect(finalizeDevelopmentSession(rejectedUrl, resumeInput.sessionId)).rejects.toThrow('最终证据已漂移');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    const controller = new AbortController();
    const cancelledUrl = 'http://127.0.0.1:23947';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-resume-cancelled')))
      .mockImplementationOnce(async () => {
        controller.abort('user_stop');
        throw new TypeError('Failed to fetch');
      });
    await expect(resumeDevelopmentSession(cancelledUrl, resumeInput, controller.signal)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('issues one authenticated development model reservation without exposing it elsewhere', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23913';
    const input = {
      sessionId: 'dev-11111111-1111-4111-8111-111111111111',
      runId: 'dev-11111111-1111-4111-8111-111111111111-analysis-AG-DEV',
      agentId: 'AG-DEV',
      messages: [{ role: 'user' as const, content: 'bounded development request' }],
      modelRouteSha256: 'b'.repeat(64),
      providerReadinessSha256: 'c'.repeat(64),
      maxOutputTokens: 1_200,
    };
    const result = {
      authorization: {
        sessionId: input.sessionId,
        reservationId: 'model-22222222-2222-4222-8222-222222222222',
        authorizationToken: 'memory-only-model-authorization',
        inputBytes: 64,
        inputSha256: 'a'.repeat(64),
      },
      session: { sessionId: input.sessionId, modelUsage: { reservedCalls: 1, reservedOutputTokens: 1_200 } },
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-model-budget-token')))
      .mockResolvedValueOnce(jsonResponse(result));

    await expect(issueDevelopmentModelCall(serverUrl, input)).resolves.toEqual(result);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${serverUrl}/api/development/model-call`);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agenthub-session': 'development-model-budget-token',
      },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual(input);
  });

  it('retries one lost or truncated local issuance response with the identical run contract', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23917';
    const input = {
      sessionId: 'dev-11111111-1111-4111-8111-111111111111',
      runId: 'dev-11111111-1111-4111-8111-111111111111-replay-AG-DEV',
      agentId: 'AG-DEV',
      messages: [{ role: 'user' as const, content: 'replay the same bounded request' }],
      modelRouteSha256: 'b'.repeat(64),
      providerReadinessSha256: 'c'.repeat(64),
      maxOutputTokens: 600,
    };
    const result = {
      authorization: {
        sessionId: input.sessionId,
        reservationId: 'model-22222222-2222-4222-8222-222222222222',
        authorizationToken: 'same-process-replayed-authorization',
        inputBytes: 64,
        inputSha256: 'a'.repeat(64),
      },
      session: { sessionId: input.sessionId, modelUsage: { reservedCalls: 1 } },
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-model-replay-token')))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(result));

    await expect(issueDevelopmentModelCall(serverUrl, input)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${serverUrl}/api/development/model-call`);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`${serverUrl}/api/development/model-call`);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);

    fetchMock.mockReset();
    const truncatedServerUrl = 'http://127.0.0.1:23919';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-model-truncated-token')))
      .mockResolvedValueOnce(new Response('{"authorization":', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(result));
    await expect(issueDevelopmentModelCall(truncatedServerUrl, input)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);

    fetchMock.mockReset();
    const controller = new AbortController();
    const cancelledServerUrl = 'http://127.0.0.1:23958';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-model-cancelled-token')))
      .mockImplementationOnce(async () => {
        controller.abort('user_stop');
        throw new TypeError('Failed to fetch');
      });
    await expect(issueDevelopmentModelCall(cancelledServerUrl, input, controller.signal)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a deterministic development issuance rejection', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23918';
    const input = {
      sessionId: 'dev-11111111-1111-4111-8111-111111111111',
      runId: 'dev-11111111-1111-4111-8111-111111111111-rejected-AG-DEV',
      agentId: 'AG-DEV',
      messages: [{ role: 'user' as const, content: 'deterministic rejection request' }],
      modelRouteSha256: 'b'.repeat(64),
      providerReadinessSha256: 'c'.repeat(64),
      maxOutputTokens: 600,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-model-rejected-token')))
      .mockResolvedValueOnce(jsonResponse({ error: '同一开发模型 runId 的签发合同不可变' }, 409));

    await expect(issueDevelopmentModelCall(serverUrl, input)).rejects.toThrow('签发合同不可变');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('passes the one-time development authorization only in the authenticated model request body', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23914';
    const runId = 'dev-11111111-1111-4111-8111-111111111111-analysis-AG-DEV';
    const developmentAuthorization = {
      sessionId: 'dev-11111111-1111-4111-8111-111111111111',
      reservationId: 'model-22222222-2222-4222-8222-222222222222',
      authorizationToken: 'memory-only-model-authorization',
      inputBytes: 64,
      inputSha256: 'a'.repeat(64),
    };
    const result = { text: 'ok', evidence: { evidenceId: 'model-evidence' }, run: { runId } };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-model-call-token')))
      .mockResolvedValueOnce(jsonResponse(result));

    await expect(callViaServer(
      serverUrl,
      { kind: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: 'memory-key' },
      [{ role: 'user', content: 'bounded request' }],
      {
        agentId: 'AG-DEV',
        runId,
        maxTokens: 1_200,
        developmentAuthorization,
        responseFormat: 'json_object',
        orchestration: {
          expectedArtifacts: 1,
          maxCalls: 1,
          totalOutputTokens: 1_200,
          stageTimeoutMs: 120_000,
          groundingDisclosureApproved: true,
        },
      },
    )).resolves.toEqual(result);
    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${serverUrl}/api/llm`);
    expect(body.developmentAuthorization).toEqual(developmentAuthorization);
    expect(body.responseFormat).toBe('json_object');
    expect(body.developmentMessagesJson).toBeUndefined();
    expect(body.messages).toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it('retries one lost or truncated development model response with the identical request', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23920';
    const runId = 'dev-11111111-1111-4111-8111-111111111111-response-replay-AG-DEV';
    const developmentAuthorization = {
      sessionId: 'dev-11111111-1111-4111-8111-111111111111',
      reservationId: 'model-22222222-2222-4222-8222-222222222222',
      authorizationToken: 'memory-only-model-authorization',
      inputBytes: 64,
      inputSha256: 'a'.repeat(64),
    };
    const result = { text: 'replayed', evidence: { evidenceId: 'model-evidence' }, run: { runId }, replayed: true };
    const call = () => callViaServer(
      serverUrl,
      { kind: 'deepseek' as const, baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: 'memory-key' },
      [{ role: 'user' as const, content: 'bounded request' }],
      {
        agentId: 'AG-DEV',
        runId,
        maxTokens: 300,
        developmentAuthorization,
        orchestration: {
          expectedArtifacts: 1,
          maxCalls: 1,
          totalOutputTokens: 300,
          stageTimeoutMs: 120_000,
          groundingDisclosureApproved: true,
        },
      },
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-response-replay-token')))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(result));
    await expect(call()).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);

    fetchMock.mockReset();
    const truncatedServerUrl = 'http://127.0.0.1:23921';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-response-truncated-token')))
      .mockResolvedValueOnce(new Response('{"text":', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(result));
    await expect(callViaServer(
      truncatedServerUrl,
      { kind: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: 'memory-key' },
      [{ role: 'user', content: 'bounded request' }],
      {
        agentId: 'AG-DEV',
        runId,
        maxTokens: 300,
        developmentAuthorization,
        orchestration: {
          expectedArtifacts: 1,
          maxCalls: 1,
          totalOutputTokens: 300,
          stageTimeoutMs: 120_000,
          groundingDisclosureApproved: true,
        },
      },
    )).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);
  });

  it('does not retry a lost ordinary model response without a development authorization', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23922';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('ordinary-model-response-token')))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(callViaServer(
      serverUrl,
      { kind: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: 'memory-key' },
      [{ role: 'user', content: 'bounded request' }],
      {
        agentId: 'AG-DEV',
        runId: 'ordinary-model-response',
        maxTokens: 300,
        orchestration: {
          expectedArtifacts: 1,
          maxCalls: 1,
          totalOutputTokens: 300,
          stageTimeoutMs: 120_000,
          groundingDisclosureApproved: true,
        },
      },
    )).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a deterministic development response-cache rejection', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23923';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-response-unavailable-token')))
      .mockResolvedValueOnce(jsonResponse({
        error: '开发模型响应不可重放：内存缓存已过期、已淘汰、工作区已切换或服务已重启；请以新 runId 重新签发',
      }, 409));

    await expect(callViaServer(
      serverUrl,
      { kind: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: 'memory-key' },
      [{ role: 'user', content: 'bounded request' }],
      {
        agentId: 'AG-DEV',
        runId: 'development-response-unavailable',
        maxTokens: 300,
        developmentAuthorization: {
          sessionId: 'dev-11111111-1111-4111-8111-111111111111',
          reservationId: 'model-22222222-2222-4222-8222-222222222222',
          authorizationToken: 'memory-only-model-authorization',
          inputBytes: 64,
          inputSha256: 'a'.repeat(64),
        },
        orchestration: {
          expectedArtifacts: 1,
          maxCalls: 1,
          totalOutputTokens: 300,
          stageTimeoutMs: 120_000,
          groundingDisclosureApproved: true,
        },
      },
    )).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves a validated machine-readable model failure without trusting arbitrary fields', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23915';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('typed-model-failure-token')))
      .mockResolvedValueOnce(jsonResponse({
        error: '上游临时不可用',
        failure: { code: 'UPSTREAM_TEMPORARY', retryable: true, raw: 'ignored' },
      }, 502));

    const failure = await callViaServer(
      serverUrl,
      { kind: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: 'memory-key' },
      [{ role: 'user', content: 'bounded request' }],
      {
        agentId: 'AG-DEV',
        runId: 'typed-model-failure',
        maxTokens: 300,
        orchestration: {
          expectedArtifacts: 1,
          maxCalls: 2,
          totalOutputTokens: 600,
          stageTimeoutMs: 120_000,
          groundingDisclosureApproved: true,
        },
      },
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ModelGatewayError);
    expect(failure).toMatchObject({
      message: '上游临时不可用',
      status: 502,
      failureCode: 'UPSTREAM_TEMPORARY',
      retryable: true,
    });
    expect(failure).not.toHaveProperty('raw');
  });

  it('recovers one lost browser receipt without changing the typed plan body', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23910';
    const plan = {
      scriptId: 'preview' as const,
      route: '/settings',
      waitAfterLoadMs: 300,
      actions: [{ type: 'assert-text' as const, text: '设置' }],
    };
    const result = { status: 'passed', acceptanceId: 'acceptance-1', recovered: true, viewports: [] };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-session-token')))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(result));

    await expect(runDevelopmentBrowserAcceptance(serverUrl, {
      sessionId: 'development-session-1',
      acceptanceId: 'acceptance-1',
      plan,
    })).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${serverUrl}/api/development/acceptance`);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agenthub-session': 'development-session-token',
      },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      sessionId: 'development-session-1',
      acceptanceId: 'acceptance-1',
      plan,
    });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);

    fetchMock.mockReset();
    const rejectedUrl = 'http://127.0.0.1:23950';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-acceptance-rejected')))
      .mockResolvedValueOnce(jsonResponse({ error: '浏览器验收恢复合同不匹配' }, 409));
    await expect(runDevelopmentBrowserAcceptance(rejectedUrl, {
      sessionId: 'development-session-1',
      acceptanceId: 'acceptance-1',
      plan,
    })).rejects.toThrow('浏览器验收恢复合同不匹配');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    const controller = new AbortController();
    const cancelledUrl = 'http://127.0.0.1:23951';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-acceptance-cancelled')))
      .mockImplementationOnce(async () => {
        controller.abort('user_stop');
        throw new TypeError('Failed to fetch');
      });
    await expect(runDevelopmentBrowserAcceptance(cancelledUrl, {
      sessionId: 'development-session-1',
      acceptanceId: 'acceptance-1',
      plan,
    }, controller.signal)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('submits only the bounded review summary to the authenticated fixed endpoint', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23911';
    const input = {
      sessionId: 'development-session-1',
      reviewId: 'review-1',
      agentId: 'AG-REVIEW' as const,
      modelId: 'deepseek-v4-pro',
      summary: 'FINDINGS:H0/M0/L1; GATE:PASS; reviewed',
    };
    const result = { receipt: { reviewId: 'review-1', gate: 'PASS' }, session: { sessionId: 'development-session-1' } };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-review-token')))
      .mockResolvedValueOnce(jsonResponse(result));

    await expect(submitDevelopmentReview(serverUrl, input)).resolves.toEqual(result);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${serverUrl}/api/development/review`);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agenthub-session': 'development-review-token',
      },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual(input);
  });

  it('replays one lost or truncated review receipt, but not rejection or cancellation', async () => {
    const fetchMock = installFetchMock();
    const input = {
      sessionId: 'development-session-1',
      reviewId: 'review-replay-1',
      agentId: 'AG-REVIEW' as const,
      modelId: 'deepseek-v4-pro',
      summary: 'FINDINGS:H0/M0/L0; GATE:PASS; reviewed',
    };
    const result = {
      receipt: { reviewId: input.reviewId, gate: 'PASS', summarySha256: 'a'.repeat(64) },
      session: { sessionId: input.sessionId },
      replayed: true as const,
    };
    const disconnectedUrl = 'http://127.0.0.1:23940';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-review-replay')))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(result));
    await expect(submitDevelopmentReview(disconnectedUrl, input)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);

    fetchMock.mockReset();
    const truncatedUrl = 'http://127.0.0.1:23941';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-review-truncated')))
      .mockResolvedValueOnce(new Response('{"receipt":', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(result));
    await expect(submitDevelopmentReview(truncatedUrl, input)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[2]?.[1]?.body);

    fetchMock.mockReset();
    const rejectedUrl = 'http://127.0.0.1:23942';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-review-rejected')))
      .mockResolvedValueOnce(jsonResponse({ error: '开发操作响应重放合同不匹配' }, 409));
    await expect(submitDevelopmentReview(rejectedUrl, input)).rejects.toThrow('重放合同不匹配');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    const controller = new AbortController();
    const cancelledUrl = 'http://127.0.0.1:23943';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-review-cancelled')))
      .mockImplementationOnce(async () => {
        controller.abort('user_stop');
        throw new TypeError('Failed to fetch');
      });
    await expect(submitDevelopmentReview(cancelledUrl, input, controller.signal)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('posts an authenticated bounded replacement batch to the fixed endpoint', async () => {
    const fetchMock = installFetchMock();
    const serverUrl = 'http://127.0.0.1:23912';
    const input = {
      sessionId: 'development-session-1',
      changeSetId: 'batch-1',
      replacements: [
        { path: 'src/a.ts', oldText: 'a', newText: 'b' },
        { path: 'src/b.ts', oldText: 'c', newText: 'd' },
      ],
    };
    const result = { ok: true as const, session: { sessionId: input.sessionId }, fileCount: 2, patchSha256: 'a'.repeat(64) };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(health('development-batch-token')))
      .mockResolvedValueOnce(jsonResponse(result));

    await expect(applyDevelopmentTextReplacementBatch(serverUrl, input)).resolves.toEqual(result);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${serverUrl}/api/development/replace-batch`);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agenthub-session': 'development-batch-token',
      },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual(input);
  });
});
