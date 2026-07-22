import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  compactDevelopmentFeedback,
  createBrowserAcceptanceMessages,
  createDevelopmentCommitDecisionPackage,
  createDevelopmentModelRunId,
  createImplementationMessages,
  createReviewMessages,
  developmentMessageInputContract,
  developmentMessageInputBytes,
  developmentModelRouteSha256,
  developmentProviderReadinessSha256,
  extractDevelopmentPatchPaths,
  findDevelopmentAcceptanceGaps,
  findDevelopmentBrowserPlanGaps,
  findDevelopmentReviewGaps,
  formatDevelopmentAcceptanceFeedback,
  classifyDevelopmentModelRetry,
  describeDevelopmentModelRetry,
  isDevelopmentAcceptancePlanFailure,
  mergeDevelopmentContexts,
  parseDevelopmentAgentAction,
  parseDevelopmentAcceptancePlan,
  parseDevelopmentAnalysis,
  rankDevelopmentTestCandidates,
  registerDevelopmentAgentAction,
  requiresDevelopmentBrowserAcceptance,
  reuseDevelopmentAcceptancePlan,
  routeDevelopmentModel,
  runDevelopmentModelWithTransientRetry,
  shouldPrepareDevelopmentProvidersBeforeSession,
  shouldRetryDevelopmentTestForStability,
  selectDevelopmentEvidenceReuse,
  selectDevelopmentRepairContextPaths,
  selectDevelopmentReviewContextPaths,
  selectDevelopmentExecutionStage,
  selectDevelopmentUnreadPaths,
  toDevelopmentTextReplacement,
} from '../developmentMode';

describe('development mode agent protocol', () => {
  it('retries only one ordinary test failure on the exact unchanged source state', () => {
    const sourceStateSha256 = 'a'.repeat(64);
    const failedTest = {
      executionId: 'test-command-first-failure',
      commandId: 'test',
      status: 'failed',
      exitCode: 1,
      timedOut: false,
      worktreeChanged: false,
      durationMs: 100,
      outputSha256: 'b'.repeat(64),
      sourceStateSha256,
      finishedAt: '2099-01-01T00:00:00.000Z',
    } as const;

    expect(shouldRetryDevelopmentTestForStability(failedTest, sourceStateSha256)).toBe(true);
    expect(shouldRetryDevelopmentTestForStability({ ...failedTest, status: 'passed' }, sourceStateSha256)).toBe(false);
    expect(shouldRetryDevelopmentTestForStability({ ...failedTest, executionId: undefined }, sourceStateSha256)).toBe(false);
    expect(shouldRetryDevelopmentTestForStability({ ...failedTest, commandId: 'build' }, sourceStateSha256)).toBe(false);
    expect(shouldRetryDevelopmentTestForStability({ ...failedTest, timedOut: true }, sourceStateSha256)).toBe(false);
    expect(shouldRetryDevelopmentTestForStability({ ...failedTest, worktreeChanged: true }, sourceStateSha256)).toBe(false);
    expect(shouldRetryDevelopmentTestForStability({ ...failedTest, durationMs: 120_001 }, sourceStateSha256)).toBe(false);
    expect(shouldRetryDevelopmentTestForStability(failedTest, 'c'.repeat(64))).toBe(false);
    expect(shouldRetryDevelopmentTestForStability(failedTest, 'invalid')).toBe(false);
  });

  it('retries only one server-attributed transient Provider failure with a unique bounded runId', async () => {
    expect(classifyDevelopmentModelRetry(new Error('fetch failed'))).toBe('transport');
    expect(classifyDevelopmentModelRetry(new Error('上游 HTTP 429'))).toBe('upstream-temporary');
    expect(classifyDevelopmentModelRetry(new Error('智能体请求超时（120 秒）'))).toBe('stage-timeout');
    expect(classifyDevelopmentModelRetry(new Error('Failed to fetch'))).toBeNull();
    expect(classifyDevelopmentModelRetry(new Error('上游 HTTP 400'))).toBeNull();
    expect(classifyDevelopmentModelRetry(new DOMException('用户停止', 'AbortError'))).toBeNull();
    expect(classifyDevelopmentModelRetry(Object.assign(new Error('已本地化'), {
      failureCode: 'UPSTREAM_TRANSPORT',
      retryable: true,
    }))).toBe('transport');
    expect(classifyDevelopmentModelRetry(Object.assign(new Error('fetch failed'), {
      failureCode: 'PROVIDER_CALL_REJECTED',
      retryable: false,
    }))).toBeNull();
    expect(describeDevelopmentModelRetry('transport')).toBe('上游传输瞬时中断');

    const sessionId = 'dev-11111111-1111-4111-8111-111111111111';
    const firstRunId = createDevelopmentModelRunId(sessionId, 'attempt', 'x'.repeat(180));
    const retryRunId = createDevelopmentModelRunId(sessionId, 'attempt', 'x'.repeat(180), 1);
    expect(firstRunId).toHaveLength(160);
    expect(retryRunId).toHaveLength(160);
    expect(retryRunId).toMatch(/-transient-retry-1$/);
    expect(retryRunId).not.toBe(firstRunId);

    const attempts: number[] = [];
    const retryKinds: string[] = [];
    await expect(runDevelopmentModelWithTransientRetry(async (attempt) => {
      attempts.push(attempt);
      if (attempt === 0) throw new Error('fetch failed');
      return 'recovered';
    }, {
      retryDelayMs: 0,
      onRetry: (kind) => retryKinds.push(kind),
    })).resolves.toBe('recovered');
    expect(attempts).toEqual([0, 1]);
    expect(retryKinds).toEqual(['transport']);
  });

  it('does not retry protocol failures, a second transient failure or cancellation', async () => {
    let protocolAttempts = 0;
    await expect(runDevelopmentModelWithTransientRetry(async () => {
      protocolAttempts += 1;
      throw new Error('上游文本超过 8000 字符上限');
    }, { retryDelayMs: 0 })).rejects.toThrow('8000 字符上限');
    expect(protocolAttempts).toBe(1);

    let transientAttempts = 0;
    await expect(runDevelopmentModelWithTransientRetry(async () => {
      transientAttempts += 1;
      throw new Error('上游 HTTP 503');
    }, { retryDelayMs: 0 })).rejects.toThrow('上游 HTTP 503');
    expect(transientAttempts).toBe(2);

    const controller = new AbortController();
    let cancelledAttempts = 0;
    await expect(runDevelopmentModelWithTransientRetry(async () => {
      cancelledAttempts += 1;
      throw new Error('fetch failed');
    }, {
      signal: controller.signal,
      retryDelayMs: 0,
      onRetry: () => controller.abort(new DOMException('用户停止', 'AbortError')),
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelledAttempts).toBe(1);
  });

  it('binds the exact UTF-8 message JSON to its byte budget and SHA-256', async () => {
    const messages = [
      { role: 'system', content: 'bounded' },
      { role: 'user', content: '中文🙂' },
    ];
    const serialized = JSON.stringify(messages);
    expect(developmentMessageInputBytes(messages))
      .toBe(new TextEncoder().encode(serialized).byteLength);
    await expect(developmentMessageInputContract(messages)).resolves.toEqual({
      inputBytes: new TextEncoder().encode(serialized).byteLength,
      inputSha256: createHash('sha256').update(serialized).digest('hex'),
    });
    const route = {
      kind: 'deepseek' as const,
      baseUrl: 'https://api.deepseek.com///',
      model: 'deepseek-v4-pro',
      thinkingEnabled: true,
    };
    await expect(developmentModelRouteSha256(route)).resolves.toBe(createHash('sha256')
      .update(JSON.stringify(['deepseek', 'https://api.deepseek.com', 'deepseek-v4-pro', true, 'text']))
      .digest('hex'));
    await expect(developmentModelRouteSha256({ ...route, baseUrl: 'https://api.deepseek.com' }))
      .resolves.toBe(await developmentModelRouteSha256(route));
    await expect(developmentModelRouteSha256({ ...route, model: 'deepseek-v4-flash' }))
      .resolves.not.toBe(await developmentModelRouteSha256(route));
    await expect(developmentModelRouteSha256(route, 'json_object'))
      .resolves.not.toBe(await developmentModelRouteSha256(route));
    const readinessId = 'ready-11111111-1111-4111-8111-111111111111';
    await expect(developmentProviderReadinessSha256(readinessId)).resolves
      .toBe(createHash('sha256').update(readinessId).digest('hex'));
    await expect(developmentProviderReadinessSha256('invalid')).rejects.toThrow('测试代际非法');
  });

  it('prepares Providers eagerly only for a new session', () => {
    expect(shouldPrepareDevelopmentProvidersBeforeSession('create')).toBe(true);
    expect(shouldPrepareDevelopmentProvidersBeforeSession('resume')).toBe(false);
    expect(shouldPrepareDevelopmentProvidersBeforeSession('reopen')).toBe(false);
  });

  it('skips duplicate analysis and implementation only for a resumed controlled diff', () => {
    expect(selectDevelopmentExecutionStage({ changeSetCount: 0 }, ' M src/app.ts')).toBe('implement');
    expect(selectDevelopmentExecutionStage({ changeSetCount: 2 }, '')).toBe('implement');
    expect(selectDevelopmentExecutionStage({ changeSetCount: 2 }, ' M src/app.ts')).toBe('verify');
  });

  it('reuses only successful evidence for the exact worktree state and invalidates stale review order', () => {
    const stateA = 'a'.repeat(64);
    const stateB = 'b'.repeat(64);
    const session = {
      agentPlan: { size: 2, reasonCode: 'bounded-standard', agents: ['AG-DEV', 'AG-REVIEW'] },
      evidencePolicy: {
        command: 1,
        browserAcceptance: 1,
        independentReview: 1,
        requirements: 1,
        finalization: 1,
        policySha256: 'f'.repeat(64),
      },
      commands: [
        { commandId: 'test', policyVersion: 1, status: 'passed', sourceStateSha256: stateA, finishedAt: '2099-01-01T00:01:00.000Z' },
        { commandId: 'test', policyVersion: 1, status: 'failed', sourceStateSha256: stateB, finishedAt: '2099-01-01T00:02:00.000Z' },
        { commandId: 'build', policyVersion: 1, status: 'passed', sourceStateSha256: stateA, finishedAt: '2099-01-01T00:03:00.000Z' },
        { commandId: 'git-diff-check', policyVersion: 1, status: 'passed', sourceStateSha256: stateA, finishedAt: '2099-01-01T00:04:00.000Z' },
      ],
      acceptances: [
        { policyVersion: 1, status: 'passed', sourceStateSha256: stateA, finishedAt: '2099-01-01T00:05:00.000Z', evidenceSha256: 'c'.repeat(64) },
        { policyVersion: 1, status: 'failed', sourceStateSha256: stateB, finishedAt: '2099-01-01T00:06:00.000Z', evidenceSha256: 'd'.repeat(64) },
      ],
      reviews: [
        {
          agentId: 'AG-REVIEW',
          policyVersion: 1,
          gate: 'PASS',
          findings: { high: 0, medium: 0, low: 1 },
          sourceStateSha256: stateA,
          reviewedAt: '2099-01-01T00:07:00.000Z',
        },
        {
          agentId: 'AG-REVIEW',
          policyVersion: 1,
          gate: 'FAIL',
          findings: { high: 1, medium: 0, low: 0 },
          sourceStateSha256: stateB,
          reviewedAt: '2099-01-01T00:08:00.000Z',
        },
      ],
    } as any;
    const reusable = selectDevelopmentEvidenceReuse(
      session,
      ['test', 'build', 'git-diff-check'],
      stateA,
      true,
    );
    expect(reusable.pendingCommands).toEqual([]);
    expect(reusable.commandResults.map((entry) => entry.commandId)).toEqual(['test', 'build', 'git-diff-check']);
    expect(reusable.browserAcceptance?.sourceStateSha256).toBe(stateA);
    expect(reusable.review?.sourceStateSha256).toBe(stateA);

    const failedLatest = selectDevelopmentEvidenceReuse({
      ...session,
      commands: [...session.commands, {
        commandId: 'test',
        policyVersion: 1,
        status: 'failed',
        sourceStateSha256: stateA,
        finishedAt: '2099-01-01T00:09:00.000Z',
      }],
    }, ['test', 'build', 'git-diff-check'], stateA, true);
    expect(failedLatest.pendingCommands).toEqual(['test']);
    expect(failedLatest.review).toBeNull();

    const staleReview = selectDevelopmentEvidenceReuse({
      ...session,
      reviews: [{
        agentId: 'AG-REVIEW',
        policyVersion: 1,
        gate: 'PASS',
        findings: { high: 0, medium: 0, low: 0 },
        sourceStateSha256: stateA,
        reviewedAt: '2099-01-01T00:04:30.000Z',
      }],
    }, ['test', 'build', 'git-diff-check'], stateA, true);
    expect(staleReview.review).toBeNull();
    const stalePolicy = selectDevelopmentEvidenceReuse({
      ...session,
      evidencePolicy: { ...session.evidencePolicy, command: 2, independentReview: 2 },
    }, ['test', 'build', 'git-diff-check'], stateA, true);
    expect(stalePolicy.pendingCommands).toEqual(['test', 'build', 'git-diff-check']);
    expect(stalePolicy.browserAcceptance?.sourceStateSha256).toBe(stateA);
    expect(stalePolicy.review).toBeNull();
    expect(selectDevelopmentEvidenceReuse({ ...session, evidencePolicy: undefined } as any, ['test'], stateA, false))
      .toMatchObject({ pendingCommands: ['test'], browserAcceptance: null, review: null });
    expect(selectDevelopmentEvidenceReuse(session, ['test'], 'invalid', false)).toMatchObject({
      commandResults: [],
      pendingCommands: ['test'],
      browserAcceptance: null,
      review: null,
    });

    const securitySession = {
      ...session,
      agentPlan: {
        size: 5,
        reasonCode: 'security-sensitive-cross-cutting',
        agents: ['AG-COORD', 'PRO', 'AG-DEV', 'AG-SEC', 'AG-REVIEW'],
      },
      reviews: [
        {
          agentId: 'AG-SEC',
          policyVersion: 1,
          gate: 'PASS',
          findings: { high: 0, medium: 0, low: 0 },
          sourceStateSha256: stateA,
          reviewedAt: '2099-01-01T00:06:00.000Z',
        },
        {
          agentId: 'AG-REVIEW',
          policyVersion: 1,
          gate: 'PASS',
          findings: { high: 0, medium: 0, low: 0 },
          sourceStateSha256: stateA,
          reviewedAt: '2099-01-01T00:07:00.000Z',
        },
      ],
    } as any;
    expect(selectDevelopmentEvidenceReuse(
      securitySession,
      ['test', 'build', 'git-diff-check'],
      stateA,
      true,
    ).reviews.map((entry) => entry.agentId)).toEqual(['AG-SEC', 'AG-REVIEW']);
    expect(selectDevelopmentEvidenceReuse({
      ...securitySession,
      reviews: securitySession.reviews.map((entry: any) => (
        entry.agentId === 'AG-REVIEW'
          ? { ...entry, reviewedAt: '2099-01-01T00:05:30.000Z' }
          : entry
      )),
    }, ['test', 'build', 'git-diff-check'], stateA, true).review).toBeNull();
  });

  it('keeps analysis paths on the server supplied file inventory', () => {
    expect(parseDevelopmentAnalysis(
      '```json\n{"relevantPaths":["src/app.ts","../secret"],"plan":["edit"],"risks":["none"]}\n```',
      ['src/app.ts', 'src/view.tsx'],
    )).toEqual({ relevantPaths: ['src/app.ts'], plan: ['edit'], risks: ['none'] });
    expect(parseDevelopmentAnalysis(JSON.stringify({
      relevantPaths: ['1.ts', '2.ts', '3.ts', '4.ts', '5.ts', '6.ts', '7.ts'],
    }), ['1.ts', '2.ts', '3.ts', '4.ts', '5.ts', '6.ts', '7.ts']).relevantPaths).toEqual([
      '1.ts', '2.ts', '3.ts', '4.ts', '5.ts', '6.ts',
    ]);
  });

  it('creates a deterministic redacted commit decision package from final evidence', () => {
    const input = {
      ready: true,
      originalHead: 'a'.repeat(40),
      worktreeEvidenceSha256: 'b'.repeat(64),
      changedPaths: [' M src/z.ts', 'M  src/a.ts', ' M src/z.ts'],
      requiredCommands: ['test', 'build', 'test'],
      browserAcceptanceRequired: true,
      browserAcceptancePassed: true,
      reviewPassed: true,
    };
    const payload = createDevelopmentCommitDecisionPackage(input);
    expect(payload).toBe(createDevelopmentCommitDecisionPackage(input));
    expect(payload.endsWith('\n')).toBe(true);
    expect(JSON.parse(payload)).toEqual({
      schema: 'agenthub.development-commit-decision',
      version: 1,
      originalHead: 'a'.repeat(40),
      worktreeEvidenceSha256: 'b'.repeat(64),
      changedPaths: ['src/a.ts', 'src/z.ts'],
      verification: { requiredCommands: ['build', 'test'], passed: true },
      browserAcceptance: { required: true, passed: true },
      independentReview: { findings: { high: 0, medium: 0 }, gate: 'PASS' },
    });
    expect(payload).not.toContain('D:\\');
    expect(payload).not.toContain('task');
    expect(payload).not.toContain('provider');
    expect(() => createDevelopmentCommitDecisionPackage({
      ...input,
      changedPaths: ['../outside.ts'],
    })).toThrow('安全的仓库相对路径');
    expect(() => createDevelopmentCommitDecisionPackage({
      ...input,
      changedPaths: ['R  src/old.ts -> src/new.ts'],
    })).toThrow('安全的仓库相对路径');
    expect(() => createDevelopmentCommitDecisionPackage({
      ...input,
      browserAcceptancePassed: false,
    })).toThrow('浏览器验收尚未通过');
  });

  it('routes DeepSeek quality roles and repeated repair failures to Pro without downgrading explicit choices', () => {
    const flash = { kind: 'deepseek' as const, model: 'deepseek-v4-flash' };
    expect(routeDevelopmentModel(flash, 'AG-DEV', 'implement-1')).toEqual({
      model: 'deepseek-v4-flash',
      reason: 'configured',
    });
    expect(routeDevelopmentModel(flash, 'AG-REVIEW', 'review-1')).toEqual({
      model: 'deepseek-v4-pro',
      reason: 'quality-role',
    });
    expect(routeDevelopmentModel(flash, 'AG-SEC', 'review-ag-sec-1')).toEqual({
      model: 'deepseek-v4-pro',
      reason: 'quality-role',
    });
    expect(routeDevelopmentModel(flash, 'PRO', 'analysis-PRO')).toEqual({
      model: 'deepseek-v4-pro',
      reason: 'quality-role',
    });
    expect(routeDevelopmentModel(flash, 'AG-DEV', 'verification-repair-1-2')).toEqual({
      model: 'deepseek-v4-pro',
      reason: 'retry-escalation',
    });
    expect(routeDevelopmentModel({ kind: 'deepseek', model: 'deepseek-v4-pro' }, 'AG-DEV', 'implement-1')).toEqual({
      model: 'deepseek-v4-pro',
      reason: 'configured',
    });
    expect(routeDevelopmentModel({ kind: 'custom', model: 'local-model' }, 'AG-REVIEW', 'review-1')).toEqual({
      model: 'local-model',
      reason: 'configured',
    });
  });

  it('accepts bounded JSON tool actions and fenced unified diffs', () => {
    expect(parseDevelopmentAgentAction('{"action":"read","paths":["src/app.ts"]}')).toEqual({
      action: 'read',
      paths: ['src/app.ts'],
    });
    expect(parseDevelopmentAgentAction('{"action":"replace","path":"src/app.ts","oldText":"const a = 1;","newText":"const a = 2;"}')).toEqual({
      action: 'replace',
      path: 'src/app.ts',
      oldText: 'const a = 1;',
      newText: 'const a = 2;',
    });
    expect(parseDevelopmentAgentAction('{"action":"insert","path":"src/app.ts","anchor":"const a = 1;","position":"after","text":"\\nconst b = 2;"}')).toEqual({
      action: 'insert',
      path: 'src/app.ts',
      anchor: 'const a = 1;',
      position: 'after',
      text: '\nconst b = 2;',
    });
    expect(parseDevelopmentAgentAction(JSON.stringify({
      action: 'batch',
      edits: [
        { action: 'replace', path: 'src/app.ts', oldText: 'const a = 1;', newText: 'const a = 2;' },
        { action: 'insert', path: 'src/app.test.ts', anchor: 'describe(', position: 'before', text: 'import x;\n' },
      ],
    }))).toEqual({
      action: 'batch',
      edits: [
        { action: 'replace', path: 'src/app.ts', oldText: 'const a = 1;', newText: 'const a = 2;' },
        { action: 'insert', path: 'src/app.test.ts', anchor: 'describe(', position: 'before', text: 'import x;\n' },
      ],
    });
    expect(() => parseDevelopmentAgentAction('{"action":"batch","edits":[{"action":"replace","path":"src/app.ts","oldText":"a","newText":"b"}]}')).toThrow('2-4');
    expect(() => parseDevelopmentAgentAction(JSON.stringify({
      action: 'batch',
      edits: Array.from({ length: 5 }, () => ({ action: 'replace', path: 'src/app.ts', oldText: 'a', newText: 'b' })),
    }))).toThrow('2-4');
    expect(() => parseDevelopmentAgentAction(JSON.stringify({
      action: 'batch',
      edits: [{ action: 'read', paths: ['src/app.ts'] }, { action: 'replace', path: 'src/app.ts', oldText: 'a', newText: 'b' }],
    }))).toThrow('只允许 insert/replace');
    expect(toDevelopmentTextReplacement({
      action: 'insert', path: 'src/app.ts', anchor: 'const a = 1;', position: 'before', text: 'const b = 2;\n',
    })).toEqual({
      path: 'src/app.ts', oldText: 'const a = 1;', newText: 'const b = 2;\nconst a = 1;',
    });
    expect(parseDevelopmentAgentAction('```diff\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-a\n+b\n```')).toEqual({
      action: 'apply',
      patch: '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-a\n+b\n',
    });
    expect(() => parseDevelopmentAgentAction('随便执行 shell')).toThrow('未返回可执行');
  });

  it('deduplicates refreshed file context without persisting dialogue', () => {
    expect(mergeDevelopmentContexts(
      [{ path: 'src/app.ts', content: 'old', sha256: 'a', bytes: 3 }],
      [{ path: 'src/app.ts', content: 'new', sha256: 'b', bytes: 3 }],
    )).toEqual([{ path: 'src/app.ts', content: 'new', sha256: 'b', bytes: 3 }]);
  });

  it('blocks an identical no-progress action until the worktree state changes', () => {
    const signatures = new Set<string>();
    expect(registerDevelopmentAgentAction({ action: 'read', paths: ['b.ts', 'a.ts'] }, signatures)).toBe(false);
    expect(registerDevelopmentAgentAction({ action: 'read', paths: ['a.ts', 'b.ts', 'a.ts'] }, signatures)).toBe(true);
    expect(registerDevelopmentAgentAction({ action: 'search', query: 'needle' }, signatures)).toBe(false);
    expect(registerDevelopmentAgentAction({ action: 'search', query: 'needle' }, signatures)).toBe(true);
    signatures.clear();
    expect(registerDevelopmentAgentAction({ action: 'search', query: 'needle' }, signatures)).toBe(false);
  });

  it('only requests valid file context that has not already been loaded', () => {
    expect(selectDevelopmentUnreadPaths(
      ['src/loaded.ts', 'src/new.ts', 'src/new.ts', '../outside.ts'],
      ['src/loaded.ts', 'src/new.ts'],
      [{ path: 'src/loaded.ts', content: 'loaded', sha256: 'loaded', bytes: 6 }],
    )).toEqual(['src/new.ts']);
  });

  it('deduplicates and bounds deterministic feedback before a Provider call', () => {
    const long = `HEAD:${'x'.repeat(5_000)}:TAIL`;
    const compacted = compactDevelopmentFeedback([' same\r\nline ', 'same\nline', long, 'ignored'], 3);
    expect(compacted).toHaveLength(3);
    expect(compacted[0]).toBe('same\nline');
    expect(compacted[1]).toContain('HEAD:');
    expect(compacted[1]).toContain(':TAIL');
    expect(compacted[1]).toContain('[FEEDBACK_TRUNCATED]');
    expect(compacted[1].length).toBeLessThanOrEqual(4_000);
    expect(compactDevelopmentFeedback(['ignored'], 0)).toEqual([]);
  });

  it('prioritizes refreshed paths while sharing context across multiple long files', () => {
    const merged = mergeDevelopmentContexts(
      [
        { path: 'src/target.tsx', content: 'old'.repeat(10_000), sha256: 'old', bytes: 30_000 },
        { path: 'src/other.tsx', content: 'other'.repeat(6_000), sha256: 'other', bytes: 30_000 },
      ],
      [{ path: 'src/target.tsx', content: 'new'.repeat(10_000), sha256: 'new', bytes: 30_000 }],
    );
    expect(merged.map((file) => file.path)).toEqual(['src/target.tsx', 'src/other.tsx']);
    expect(merged[0].sha256).toBe('new');
    expect(merged[0].content).toContain('<<<AGENTHUB_OMITTED_MIDDLE_USE_SEARCH_FOR_EXACT_CONTEXT>>>');
    expect(merged[1].content).toContain('<<<AGENTHUB_OMITTED_MIDDLE_USE_SEARCH_FOR_EXACT_CONTEXT>>>');
    expect(merged.reduce((total, file) => total + file.content.length, 0)).toBeLessThanOrEqual(52_000);
  });

  it('keeps four prioritized large contexts instead of allowing one file to consume the budget', () => {
    const merged = mergeDevelopmentContexts(
      [{ path: 'seed.ts', content: 'seed'.repeat(20_000), sha256: 'seed', bytes: 80_000 }],
      ['first.ts', 'second.ts', 'third.ts', 'fourth.ts', 'fifth.ts'].map((path) => ({
        path,
        content: path.repeat(12_000),
        sha256: path,
        bytes: path.length * 12_000,
      })),
    );
    expect(merged.map((file) => file.path)).toEqual(['first.ts', 'second.ts', 'third.ts', 'fourth.ts']);
    expect(merged.every((file) => file.content.includes('<<<AGENTHUB_OMITTED_MIDDLE_USE_SEARCH_FOR_EXACT_CONTEXT>>>'))).toBe(true);
    expect(merged.reduce((total, file) => total + file.content.length, 0)).toBeLessThanOrEqual(52_000);
  });

  it('keeps exact head and tail excerpts for a single oversized refreshed file', () => {
    const content = `HEAD:${'a'.repeat(70_000)}:TAIL`;
    const merged = mergeDevelopmentContexts([], [
      { path: 'src/styles.css', content, sha256: 'styles', bytes: content.length },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].content).toContain('HEAD:');
    expect(merged[0].content).toContain(':TAIL');
    expect(merged[0].content).toContain('<<<AGENTHUB_OMITTED_MIDDLE_USE_SEARCH_FOR_EXACT_CONTEXT>>>');
    expect(merged[0].content.length).toBeLessThanOrEqual(52_000);
  });

  it('directs additive edits to a bounded insert action', () => {
    const messages = createImplementationMessages({
      task: 'add a notice',
      analysis: { relevantPaths: [], plan: [], risks: [] },
      files: [],
      discoveryActionsRemaining: 2,
      writeActionRequired: true,
      attempt: 1,
    });
    expect(messages[0].content).toContain('"action":"insert"');
    expect(messages[0].content).toContain('必须优先使用');
    expect(messages[0].content).toContain('{"action":"batch","edits"');
    expect(messages[0].content).toContain('{"action":"apply","patch"');
    expect(messages[0].content).toContain('整批原子应用');
    expect(messages[0].content).toContain('跨 5 个及以上文件必须拆成多轮动作');
    expect(messages[0].content).toContain('输出必须短于 6000 字符');
    expect(messages[0].content).toContain('不得把 opening brace 作为锚点');
    expect(messages[0].content).toContain('不得在有缩进的父节点内生成从第 0 列开始的子标签');
    expect(messages[0].content).toContain('相邻 test/it/describe 块之间恰好保留一个空行');
    expect(messages[0].content).toContain('read 与 search 共享 discoveryActionsRemaining 硬预算');
    expect(messages[0].content).toContain('writeActionRequired=true');
    expect(messages[0].content).toContain('READ_ALREADY_AVAILABLE');
    expect(messages[0].content).toContain('DISCOVERY_BUDGET_EXHAUSTED');
    expect(messages[1].content).toContain('"discoveryActionsRemaining":2');
    expect(messages[1].content).toContain('"writeActionRequired":true');
    expect(messages[1].content.indexOf('"writeActionRequired":true'))
      .toBeLessThan(messages[1].content.indexOf('"files":[]'));
  });

  it('forbids completion while deterministic browser repair evidence remains', () => {
    const messages = createImplementationMessages({
      task: 'fix browser acceptance',
      analysis: { relevantPaths: [], plan: [], risks: [] },
      files: [],
      searchMatches: ['BROWSER_REPAIR_HINT:/favicon.ico 404'],
      attempt: 21,
    });
    expect(messages[0].content).toContain('不得 complete、降级、忽略');
    expect(messages[0].content).toContain('BROWSER_REPAIR_HINT 是必须落实');
    expect(messages[1].content).toContain('"discoveryActionsRemaining":1');
  });

  it('requires review to reject accidental CSS nesting and malformed test formatting', () => {
    const messages = createReviewMessages({
      task: 'add a styled notice and test',
      diff: '',
      newFiles: [],
      commandResults: [],
      agentId: 'AG-REVIEW',
    });
    expect(messages[0].content).toContain('新增顶级 selector 没有落入无关的未闭合规则');
    expect(messages[0].content).toContain('新增测试必须沿用所在文件的缩进与格式');
    expect(messages[0].content).toContain('批次会整批原子应用或完整回滚');
    expect(messages[0].content).toContain('父节点内从第 0 列开始的子标签属于必须修复的格式缺陷');
    expect(messages[0].content).toContain('新增但未被 HTML/JS/TSX/JSX/Vue/Svelte 引用');
    expect(messages[0].content).toContain('REVIEW_PRECHECK_REJECTED');
    expect(messages[0].content).toContain('必须与实现角色分离');
    expect(createReviewMessages({
      task: 'audit permissions',
      diff: '',
      newFiles: [],
      commandResults: [],
      agentId: 'AG-SEC',
    })[0].content).toContain('权限、认证、凭据、数据边界、注入、泄露与滥用路径');
  });

  it('rejects task-relevant state styles that are never connected to executable markup', () => {
    const diff = [
      '--- a/styles.css',
      '+++ b/styles.css',
      '@@ -1,0 +1,4 @@',
      '+.empty-state {',
      '+  color: gray;',
      '+}',
    ].join('\n');
    const files = [
      { path: 'styles.css', content: '.empty-state { color: gray; }', sha256: 'a', bytes: 29 },
      { path: 'src/app.js', content: "summary.textContent = '全部在预算内';", sha256: 'b', bytes: 37 },
    ];
    expect(findDevelopmentReviewGaps('没有超预算时显示明确空状态', diff, files)).toEqual([
      '任务要求的状态样式 .empty-state 已新增，但没有被变更后的 HTML/JS/TSX/JSX/Vue/Svelte 正文引用',
    ]);
    expect(findDevelopmentReviewGaps('没有超预算时显示明确空状态', diff, [
      ...files,
      { path: 'index.html', content: '<p class="empty-state">全部在预算内</p>', sha256: 'c', bytes: 38 },
    ])).toEqual([]);
    expect(findDevelopmentReviewGaps('没有超预算时显示明确空状态', diff, [
      ...files,
      { path: 'docs/notes.md', content: 'Use `.empty-state` for empty results.', sha256: 'd', bytes: 37 },
      { path: 'src/app.test.ts', content: "expect(markup).toContain('empty-state');", sha256: 'e', bytes: 40 },
    ])).toEqual([
      '任务要求的状态样式 .empty-state 已新增，但没有被变更后的 HTML/JS/TSX/JSX/Vue/Svelte 正文引用',
    ]);
    expect(findDevelopmentReviewGaps('没有超预算时显示明确空状态', diff, [
      ...files,
      { path: 'src/EmptyState.tsx', content: 'return <p className={styles.emptyState}>全部在预算内</p>;', sha256: 'f', bytes: 57 },
    ])).toEqual([]);
    expect(findDevelopmentReviewGaps('调整普通卡片颜色', diff, files)).toEqual([]);
  });

  it('rejects structurally misindented HTML lines added by a repair', () => {
    const diff = [
      '--- a/index.html',
      '+++ b/index.html',
      '@@ -1,4 +1,7 @@',
      ' <main>',
      '   <header>',
      '+              <div class="controls">',
      '+      <button>切换</button>',
      '+    </div>',
      '   </header>',
      ' </main>',
    ].join('\n');
    const bad = '<main>\n  <header>\n              <div class="controls">\n      <button>切换</button>\n    </div>\n  </header>\n</main>';
    expect(findDevelopmentReviewGaps('新增切换按钮', diff, [{
      path: 'index.html', content: bad, sha256: 'a', bytes: bad.length,
    }])).toEqual([
      '新增 HTML 行缩进与结构层级不一致：index.html:3（应为 4 个空格，实际 14）',
    ]);

    const good = '<main>\n  <header>\n    <div class="controls">\n      <button>切换</button>\n    </div>\n  </header>\n</main>';
    expect(findDevelopmentReviewGaps('新增切换按钮', diff, [{
      path: 'index.html', content: good, sha256: 'b', bytes: good.length,
    }])).toEqual([]);
  });

  it('extracts existing and created targets from a rejected unified diff', () => {
    expect(extractDevelopmentPatchPaths([
      '--- a/src/view.tsx',
      '+++ b/src/view.tsx',
      '--- /dev/null',
      '+++ b/src/view.test.tsx',
    ].join('\n'))).toEqual(['src/view.tsx', 'src/view.test.tsx']);
  });

  it('requires a real test path only when the task explicitly asks to change tests', () => {
    expect(findDevelopmentAcceptanceGaps(
      '在现有响应式测试中加入对应静态断言',
      ['src/components/Panel.tsx'],
    )).toEqual(['任务明确要求新增或修改测试/断言，但当前没有 test/spec 变更路径']);
    expect(findDevelopmentAcceptanceGaps(
      '在现有响应式测试中加入对应静态断言',
      ['src/components/Panel.tsx', 'src/lib/__tests__/responsive.test.ts'],
    )).toEqual([]);
    expect(findDevelopmentAcceptanceGaps('修改按钮并确保测试通过', ['src/components/Panel.tsx'])).toEqual([]);
  });

  it('keeps the highest-value responsive test candidates within a bounded review context', () => {
    expect(rankDevelopmentTestCandidates('在现有响应式测试中加入断言', [
      'src/lib/__tests__/developmentMode.test.ts',
      'src/lib/__tests__/commandShellResponsive.test.ts',
      'src/lib/__tests__/developmentAcceptance.test.ts',
      'src/lib/__tests__/serverIntegration.test.ts',
    ])).toEqual([
      'src/lib/__tests__/commandShellResponsive.test.ts',
      'src/lib/__tests__/developmentAcceptance.test.ts',
      'src/lib/__tests__/developmentMode.test.ts',
    ]);
  });

  it('preloads current production changes for review without rereading new files', () => {
    expect(selectDevelopmentReviewContextPaths([
      'README.md',
      'src/lib/__tests__/feature.test.ts',
      'src/lib/feature.ts',
      'server/feature.mjs',
      'src/newFeature.ts',
      'outside.txt',
      'src/lib/feature.ts',
    ], ['src/newFeature.ts'], [
      'README.md',
      'src/lib/__tests__/feature.test.ts',
      'src/lib/feature.ts',
      'server/feature.mjs',
      'src/newFeature.ts',
    ], 3)).toEqual([
      'src/lib/feature.ts',
      'server/feature.mjs',
      'src/lib/__tests__/feature.test.ts',
    ]);
    expect(selectDevelopmentReviewContextPaths(['README.md'], [], ['README.md'], 0)).toEqual([]);
  });

  it('preloads repair context from exact failure evidence before generic candidates', () => {
    expect(selectDevelopmentRepairContextPaths(
      ['src/changed.ts', 'missing.ts'],
      ['FAIL src\\lib\\__tests__\\feature.test.ts: feature.ts rejected'],
      ['src/relevant.ts'],
      ['src/fallback.test.ts'],
      [
        'src/changed.ts',
        'src/lib/__tests__/feature.test.ts',
        'src/feature.ts',
        'src/relevant.ts',
        'src/fallback.test.ts',
      ],
      4,
    )).toEqual([
      'src/lib/__tests__/feature.test.ts',
      'src/feature.ts',
      'src/changed.ts',
      'src/relevant.ts',
    ]);
    expect(selectDevelopmentRepairContextPaths(
      [],
      ['shared.ts failed; src/feature.tsx is unrelated'],
      [],
      [],
      ['src/shared.ts', 'tests/shared.ts', 'src/feature.ts'],
    )).toEqual([]);
  });

  it('requires browser evidence for UI language or browser-facing changed paths', () => {
    expect(requiresDevelopmentBrowserAcceptance('修改按钮并确保测试通过')).toBe(true);
    expect(requiresDevelopmentBrowserAcceptance('修复一个缺陷', ['src/components/Panel.tsx'])).toBe(true);
    expect(requiresDevelopmentBrowserAcceptance('修复一个缺陷', ['server/parser.mjs'])).toBe(false);
  });

  it('turns a same-origin favicon 404 into a bounded no-network repair hint', () => {
    const feedback = formatDevelopmentAcceptanceFeedback({
      viewports: [{
        id: 'desktop',
        failures: ['console-errors:1', 'failed-requests:1'],
        diagnostics: ['Failed to load resource: 404 @ /favicon.ico', 'Image:http-404 @ /favicon.ico'],
      }],
    } as any);
    expect(feedback[0]).toContain('href="data:,"');
    expect(feedback[0]).toContain('既有 void-element 风格');
    expect(feedback[0]).toContain('独占一行');
    expect(feedback[0]).toContain('不得把两个标签拼接在同一行');
    expect(feedback[0]).toContain('不得新增外部资源请求');
    expect(feedback.join(' ')).not.toContain('127.0.0.1');
  });

  it('folds identical browser failures from both viewports into one feedback item', () => {
    const feedback = formatDevelopmentAcceptanceFeedback({
      viewports: [
        { id: 'desktop', failures: ['assert-text:not-found'], diagnostics: [] },
        { id: 'mobile', failures: ['assert-text:not-found'], diagnostics: [] },
      ],
    } as any);
    expect(feedback).toEqual(['BROWSER_ACCEPTANCE_REJECTED:desktop+mobile:assert-text:not-found']);
  });

  it('parses only bounded same-origin browser acceptance actions', () => {
    const syntheticApiKey = ['sk', '0'.repeat(16)].join('-');
    expect(parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'dev',
      route: '/settings',
      waitAfterLoadMs: 500,
      actions: [
        { type: 'fill', selector: '[name="query"]', value: 'synthetic value' },
        { type: 'click', selector: '[data-testid="submit"]' },
        { type: 'assert-text', text: '完成' },
        { type: 'assert-text-absent', text: '处理中' },
        { type: 'assert-hidden', selector: '[data-testid="spinner"]' },
      ],
    }), ['dev'])).toMatchObject({
      scriptId: 'dev',
      route: '/settings',
      actions: [
        { type: 'fill' },
        { type: 'click' },
        { type: 'assert-text' },
        { type: 'assert-text-absent' },
        { type: 'assert-hidden' },
      ],
    });
    expect(parseDevelopmentAcceptancePlan('{"scriptId":"python-flask","route":"/health","actions":[{"type":"assert-visible","selector":"body"}]}', ['python-flask']))
      .toMatchObject({ scriptId: 'python-flask', route: '/health' });
    expect(() => parseDevelopmentAcceptancePlan('{"scriptId":"dev","route":"https://example.com"}', ['dev'])).toThrow('同源');
    expect(() => parseDevelopmentAcceptancePlan('{"scriptId":"dev","route":"/"}', ['dev'])).toThrow('任务结果断言');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'dev',
      actions: [
        { type: 'fill', selector: 'input', value: syntheticApiKey },
        { type: 'assert-visible', selector: 'body' },
      ],
    }), ['dev'])).toThrow('fill 非法');
  });

  it('compiles one strict reusable browser plan before runtime', () => {
    const plan = parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      route: '/tasks',
      actions: [
        { type: 'assert-visible', selector: '[data-testid="task-list"]' },
        { type: 'assert-visible', selector: '[data-testid="task-list"]' },
        { type: 'click', selector: '[data-testid="toggle"]' },
        { type: 'assert-text', text: '已完成' },
        { type: 'assert-text', text: '已完成' },
      ],
    }), ['preview']);
    expect(plan.actions).toEqual([
      { type: 'assert-visible', selector: '[data-testid="task-list"]' },
      { type: 'click', selector: '[data-testid="toggle"]' },
      { type: 'assert-text', text: '已完成' },
    ]);
    expect(reuseDevelopmentAcceptancePlan(plan, ['preview'])).toBe(plan);
    expect(reuseDevelopmentAcceptancePlan(plan, ['dev'])).toBeNull();
    expect(reuseDevelopmentAcceptancePlan({ ...plan, actions: [] }, ['preview'])).toBeNull();
    expect(() => parseDevelopmentAcceptancePlan('{"scriptId":"dev","route":"/"}', ['preview'])).toThrow('scriptId');
    expect(() => parseDevelopmentAcceptancePlan('{"scriptId":"preview","route":"/","url":"https://example.com"}', ['preview'])).toThrow('额外字段');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [
        { type: 'assert-visible', selector: '#panel' },
        { type: 'assert-text', text: '面板' },
        { type: 'assert-absent', selector: '#panel' },
      ],
    }), ['preview'])).toThrow('相互矛盾');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [
        { type: 'assert-text', text: '处理中' },
        { type: 'assert-text-absent', text: '处理中' },
      ],
    }), ['preview'])).toThrow('文本断言相互矛盾');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [{ type: 'assert-text-absent', text: '处理中', selector: 'body' }],
    }), ['preview'])).toThrow('只允许 type,text');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [{ action: 'click', selector: '#save' }],
    }), ['preview'])).toThrow('必须使用 type 字段；收到字段 action,selector');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [{ type: 'assertText', text: '完成' }],
    }), ['preview'])).toThrow('类型 "assertText"不受支持');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [
        { type: 'assert-absent', selector: '#submit' },
        { type: 'click', selector: '#submit' },
        { type: 'assert-text', text: '完成' },
      ],
    }), ['preview'])).toThrow('断言不存在');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [{ type: 'click', selector: '#submit' }],
    }), ['preview'])).toThrow('结果断言');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      route: '/\\\\example.com',
    }), ['preview'])).toThrow('同源');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      route: `/${'r'.repeat(500)}`,
    }), ['preview'])).toThrow('route');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [{ type: 'assert-visible', selector: 's'.repeat(301) }],
    }), ['preview'])).toThrow('selector');
    expect(() => parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [
        { type: 'fill', selector: '#query', value: 'v'.repeat(1_001) },
        { type: 'assert-text', text: '完成' },
      ],
    }), ['preview'])).toThrow('value');
  });

  it('rejects generic static plans for interactive tasks before starting a browser', () => {
    const staticPlan = parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [{ type: 'assert-visible', selector: '#settings' }],
    }), ['preview']);
    expect(findDevelopmentBrowserPlanGaps('点击设置按钮后打开面板', staticPlan)).toEqual([
      '交互型任务的浏览器验收计划缺少 click/fill/press 动作',
    ]);
    const interactivePlan = parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [
        { type: 'click', selector: '#settings' },
        { type: 'assert-visible', selector: '#settings-panel' },
      ],
    }), ['preview']);
    expect(findDevelopmentBrowserPlanGaps('点击设置按钮后打开面板', interactivePlan)).toEqual([]);
  });

  it('rejects broad absent-text assertions that overlap persistent control copy', () => {
    const plan = parseDevelopmentAcceptancePlan(JSON.stringify({
      scriptId: 'preview',
      actions: [
        { type: 'click', selector: '#over-budget-toggle' },
        { type: 'assert-text-absent', text: '超预算' },
      ],
    }), ['preview']);
    expect(findDevelopmentBrowserPlanGaps('切换仅看超预算', plan, [{
      path: 'index.html',
      content: '<button id="over-budget-toggle">仅看超预算</button>',
      sha256: 'a',
      bytes: 51,
    }])).toEqual([
      'assert-text-absent(“超预算”) 与静态交互控件文案重叠，必须改用精确结果文本或 selector 断言',
    ]);
  });

  it('attributes invalid selectors to the acceptance plan instead of project code', () => {
    const result = {
      consoleErrorCount: 0,
      consoleWarningCount: 0,
      failedRequestCount: 0,
      viewports: [
        { failures: ['assert-absent:invalid-selector'] },
        { failures: ['assert-absent:invalid-selector'] },
      ],
    } as any;
    expect(isDevelopmentAcceptancePlanFailure(result)).toBe(true);
    expect(isDevelopmentAcceptancePlanFailure({
      ...result,
      consoleErrorCount: 1,
      viewports: [{ failures: ['assert-absent:element-present', 'assert-absent:invalid-selector'] }],
    } as any)).toBe(true);
    expect(isDevelopmentAcceptancePlanFailure({
      ...result,
      viewports: [{ failures: ['assert-visible:not-visible'] }],
    })).toBe(false);
  });

  it('asks the Agent for typed localhost acceptance instead of shell or JavaScript', () => {
    const messages = createBrowserAcceptanceMessages({
      task: '验证设置页',
      availableScripts: ['preview'],
      files: [],
      diff: '',
      agentId: 'AG-REVIEW',
    });
    expect(messages[0].content).toContain('只允许 click(selector)');
    expect(messages[0].content).toContain('assert-text-absent(text)');
    expect(messages[0].content).toContain('assert-hidden(selector)');
    expect(messages[0].content).toContain('{"type":"click","selector":"#save"}');
    expect(messages[0].content).toContain('不得输出 URL、Shell、JavaScript');
    expect(messages[0].content).toContain('python-fastapi|python-flask|python-static');
    expect(messages[0].content).toContain('不得添加额外字段');
    expect(messages[0].content).toContain('交互后必须有结果断言');
    expect(messages[0].content).toContain('不得使用仍存在于按钮、标签或标题中的宽泛子串');
  });
});
