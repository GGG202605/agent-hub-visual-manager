import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LOCAL_AUTONOMOUS_PRESET,
  createDevelopmentManager,
  findDevelopmentSourceQualityProblem,
  isSafeDevelopmentPath,
  planDevelopmentAgents,
  planDevelopmentRequirements,
} from '../../../server/developmentMode.mjs';
import { normalizeDevelopmentAcceptancePlan } from '../../../server/developmentAcceptance.mjs';

const temporaryRoots: string[] = [];
const MODEL_INPUT_SHA256 = 'a'.repeat(64);
const MODEL_ROUTE_SHA256 = 'c'.repeat(64);
const MODEL_PROVIDER_READINESS_SHA256 = 'e'.repeat(64);
const DEVELOPMENT_COST_POLICY = {
  currency: 'CNY',
  inputMicrosPerMillionTokens: 1_000_000,
  outputMicrosPerMillionTokens: 2_000_000,
  maxCostMicros: 50_000_000,
};
let commandExecutionSequence = 0;

function commandInput(sessionId: string, commandId: string) {
  commandExecutionSequence += 1;
  return { sessionId, commandId, executionId: `test-command-${commandExecutionSequence}` };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local autonomous development preset', () => {
  it('uses an honest two, four or five-role pipeline according to bounded task complexity and security risk', () => {
    const detailedSingleFeature = `为本地待办板新增一个仅显示未完成项的无障碍筛选按钮，并保持计数和状态一致，补齐单元测试与桌面、移动端浏览器验收。${'验收只覆盖这个单一功能，不改依赖和脚本。'.repeat(24)}`;
    expect(planDevelopmentAgents('修改 src/label.ts 的按钮文案')).toEqual({
      size: 2,
      reasonCode: 'focused-low-risk',
      agents: ['AG-DEV', 'AG-REVIEW'],
    });
    expect(planDevelopmentAgents('补充 src/panel.tsx 的 dirty 会安全停止提示文案').size).toBe(2);
    expect(planDevelopmentAgents('新增一个独立开发模式并补齐测试').size).toBe(2);
    expect(planDevelopmentAgents('优化模型 token 预算显示').size).toBe(2);
    expect(planDevelopmentAgents('rename the author label').size).toBe(2);
    expect(planDevelopmentAgents('新增重置为0按钮，点击后恢复显示0，并补充测试与390px验收').size).toBe(2);
    expect(planDevelopmentAgents('实现中断会话恢复机制并补齐安全测试').size).toBe(4);
    expect(planDevelopmentAgents(detailedSingleFeature).size).toBe(2);
    expect(planDevelopmentAgents('重构后端权限、恢复事务和跨模块 API 协议，并完成安全审查')).toEqual({
      size: 5,
      reasonCode: 'security-sensitive-cross-cutting',
      agents: ['AG-COORD', 'PRO', 'AG-DEV', 'AG-SEC', 'AG-REVIEW'],
    });
    expect(planDevelopmentRequirements('在现有响应式测试中加入静态断言')).toEqual({ testChange: true, browserAcceptance: true });
    expect(planDevelopmentRequirements('修改按钮并确保测试通过')).toEqual({ testChange: false, browserAcceptance: true });
    expect(planDevelopmentRequirements('优化前端表单并完成浏览器验收')).toEqual({ testChange: false, browserAcceptance: true });
  });

  it('denies escape, generated trees, secrets and Git metadata', () => {
    expect(LOCAL_AUTONOMOUS_PRESET.isDefault).toBe(true);
    expect(LOCAL_AUTONOMOUS_PRESET.scope.models).toBe('deepseek-flash-default-pro-quality-and-retry-escalation');
    expect(LOCAL_AUTONOMOUS_PRESET.denied).toContain('git-push');
    expect(isSafeDevelopmentPath('src/app.ts')).toBe(true);
    expect(isSafeDevelopmentPath('../outside.ts')).toBe(false);
    expect(isSafeDevelopmentPath('.git/config')).toBe(false);
    expect(isSafeDevelopmentPath('.env.local')).toBe(false);
    expect(isSafeDevelopmentPath('node_modules/pkg/index.js')).toBe(false);
    expect(isSafeDevelopmentPath('.venv/Lib/site-packages/pkg.py')).toBe(false);
    expect(isSafeDevelopmentPath('__pycache__/module.pyc')).toBe(false);
    expect(isSafeDevelopmentPath('.pytest_cache/v/cache/nodeids')).toBe(false);
    expect(isSafeDevelopmentPath('.mypy_cache/3.13/module.meta.json')).toBe(false);
    expect(isSafeDevelopmentPath('.ruff_cache/0.14.0/content')).toBe(false);
  });

  it('preflights the exact dynamic plan without creating a durable session', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-preflight-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-preflight-state-'));
    temporaryRoots.push(root, stateRoot);
    await writeFile(path.join(root, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@9.1.0',
      scripts: { test: 'node --test', build: 'node build.mjs', start: 'node server.mjs' },
    }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const task = 'PRIVATE_PREFLIGHT_TASK refactor backend architecture, authentication, recovery, and security protocol';
    const preflight = await manager.preflightSession({ root, task, presetId: 'local-autonomous-v1' }) as any;
    expect(preflight).toMatchObject({
      ok: true,
      presetId: 'local-autonomous-v1',
      mode: 'create',
      resume: null,
      rootName: path.basename(root),
      branch: expect.any(String),
      agentPlan: {
        size: 5,
        reasonCode: 'security-sensitive-cross-cutting',
        agents: ['AG-COORD', 'PRO', 'AG-DEV', 'AG-SEC', 'AG-REVIEW'],
      },
      scripts: ['build', 'test'],
      acceptanceScripts: ['start'],
      packageManager: 'pnpm@9.1.0',
    });
    expect(JSON.stringify(preflight)).not.toContain(task);
    expect(JSON.stringify(preflight)).not.toContain(root);
    expect(await manager.listSessions()).toEqual([]);
    expect(await readdir(stateRoot)).toEqual([]);

    await writeFile(path.join(root, 'untracked.txt'), 'dirty\n', 'utf8');
    await expect(manager.preflightSession({ root, task })).rejects.toThrow('clean Git 工作树');
    expect(await readdir(stateRoot)).toEqual([]);
    await rm(path.join(root, 'untracked.txt'));
    await expect(manager.preflightSession({ root, task, presetId: 'unsupported' })).rejects.toThrow('开发预设不受支持');
    expect(await readdir(stateRoot)).toEqual([]);

    const creationInput = {
      root,
      task,
      presetId: 'local-autonomous-v1',
      creationId: 'creation-preflight-recovery',
      costPolicy: DEVELOPMENT_COST_POLICY,
    };
    const session = await manager.createSession(creationInput) as any;
    expect(await readdir(stateRoot)).toEqual([`${session.sessionId}.json`]);
    const creationLedger = await readFile(path.join(stateRoot, `${session.sessionId}.json`), 'utf8');
    expect(creationLedger).toContain('"creationId": "creation-preflight-recovery"');
    expect(creationLedger).not.toContain(root);
    expect(creationLedger).not.toContain(task);
    expect(await manager.preflightSession({ root, task })).toMatchObject({
      mode: 'resume',
      resume: { sessionId: session.sessionId, phase: 'ready' },
    });
    expect(await manager.createSession(creationInput)).toMatchObject({
      sessionId: session.sessionId,
      recovered: true,
      rootBound: true,
    });
    expect(await readdir(stateRoot)).toEqual([`${session.sessionId}.json`]);
    const restarted = await createDevelopmentManager({ stateRoot });
    expect(await restarted.createSession(creationInput)).toMatchObject({
      sessionId: session.sessionId,
      recovered: true,
      rootBound: true,
    });
    await expect(restarted.createSession({
      ...creationInput,
      task: 'different creation contract',
    })).rejects.toThrow('creationId 已绑定其他开发创建合同');
    await expect(restarted.createSession({
      ...creationInput,
      costPolicy: { ...DEVELOPMENT_COST_POLICY, maxCostMicros: 49_000_000 },
    })).rejects.toThrow('creationId 已绑定其他开发创建合同');
    await restarted.dispose();
    await expect(manager.createSession({ root, task })).rejects.toThrow('存在可恢复的同任务开发会话');
    await manager.dispose();
  }, 15_000);

  it('applies each versioned progress transition once without regressing after response loss', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-progress-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-progress-state-'));
    temporaryRoots.push(root, stateRoot);
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const task = 'PRIVATE_PROGRESS_TASK recover a lost local response without regressing phase';
    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task }) as any;
    const analyzing = {
      sessionId: session.sessionId,
      phase: 'analyzing',
      transitionId: 'transition-analyzing-1',
    };
    const editing = {
      sessionId: session.sessionId,
      phase: 'editing',
      transitionId: 'transition-editing-1',
    };
    expect(await manager.updateProgress(analyzing)).toMatchObject({ phase: 'analyzing' });
    expect(await manager.updateProgress(editing)).toMatchObject({ phase: 'editing' });
    expect(await manager.updateProgress(analyzing)).toMatchObject({ phase: 'editing', recovered: true });
    await expect(manager.updateProgress({ ...analyzing, phase: 'failed' })).rejects.toThrow('transitionId');

    const ledger = await readFile(path.join(stateRoot, `${session.sessionId}.json`), 'utf8');
    expect(JSON.parse(ledger).progressTransitions).toEqual([
      expect.objectContaining({ transitionId: analyzing.transitionId, phase: analyzing.phase }),
      expect.objectContaining({ transitionId: editing.transitionId, phase: editing.phase }),
    ]);
    expect(ledger).not.toContain(root);
    expect(ledger).not.toContain(task);
    await manager.dispose();

    const restarted = await createDevelopmentManager({ stateRoot });
    await expect(restarted.updateProgress({
      sessionId: session.sessionId,
      phase: 'failed',
      transitionId: 'transition-failed-before-rebind',
    })).rejects.toThrow('开发会话尚未绑定工作区');
    await restarted.resumeSession({ sessionId: session.sessionId, root, task });
    expect(await restarted.updateProgress(editing)).toMatchObject({ phase: 'editing', recovered: true });
    expect(await restarted.updateProgress({
      sessionId: session.sessionId,
      phase: 'failed',
      transitionId: 'transition-failed-after-rebind',
    })).toMatchObject({ phase: 'failed' });
    await restarted.dispose();
  }, 15_000);

  it('automatically resumes only an exact task and controlled worktree state', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-resume-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-resume-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'value.mjs'), 'export const value = 1;\n', 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/value.mjs', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const task = 'PRIVATE_RESUME_TASK update the value safely';
    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task }) as any;
    await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'resume-value-change',
      path: 'src/value.mjs',
      oldText: 'value = 1',
      newText: 'value = 2',
    });
    await manager.dispose();

    const restarted = await createDevelopmentManager({ stateRoot });
    const resumePreflight = await restarted.preflightSession({ root, task }) as any;
    expect(resumePreflight).toMatchObject({
      mode: 'resume',
      resume: { sessionId: session.sessionId, phase: 'editing' },
    });
    expect(JSON.stringify(resumePreflight)).not.toContain(root);
    expect(JSON.stringify(resumePreflight)).not.toContain(task);
    expect(await readdir(stateRoot)).toEqual([`${session.sessionId}.json`]);
    await expect(restarted.resumeSession({ sessionId: session.sessionId, root, task: 'different task' }))
      .rejects.toThrow('任务与该开发会话不匹配');
    expect(await restarted.resumeSession({ sessionId: session.sessionId, root, task })).toMatchObject({
      sessionId: session.sessionId,
      rootBound: true,
    });
    await restarted.dispose();

    await writeFile(path.join(root, 'src', 'value.mjs'), 'export const value = 3;\n', 'utf8');
    const drifted = await createDevelopmentManager({ stateRoot });
    await expect(drifted.preflightSession({ root, task })).rejects.toThrow('最后受控状态不一致');
    await expect(drifted.resumeSession({ sessionId: session.sessionId, root, task }))
      .rejects.toThrow('最后受控状态不一致');
    await drifted.dispose();
  }, 15_000);

  it('does not bless an unexpected browser-side worktree mutation as resumable', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-acceptance-drift-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-acceptance-drift-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'value.mjs'), 'export const value = 1;\n', 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { preview: 'node preview.mjs' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/value.mjs', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const acceptanceRuntime = {
      async run() {
        await writeFile(path.join(root, 'src', 'value.mjs'), 'export const value = 3;\n', 'utf8');
        const now = new Date().toISOString();
        return {
          status: 'passed',
          scriptId: 'preview',
          planSha256: 'a'.repeat(64),
          evidenceSha256: 'b'.repeat(64),
          startedAt: now,
          finishedAt: now,
          durationMs: 1,
          actionCount: 0,
          viewportCount: 2,
          consoleErrorCount: 0,
          consoleWarningCount: 0,
          failedRequestCount: 0,
          failureCount: 0,
          screenshotSha256: [],
          viewports: [],
        };
      },
      async dispose() {},
    };
    const task = 'verify the frontend without accepting browser-side source mutations';
    const manager = await createDevelopmentManager({ stateRoot, acceptanceRuntime });
    const session = await manager.createSession({ root, task }) as any;
    await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'controlled-value-change',
      path: 'src/value.mjs',
      oldText: 'value = 1',
      newText: 'value = 2',
    });
    await expect(manager.runBrowserAcceptance({
      sessionId: session.sessionId,
      acceptanceId: 'mutating-acceptance',
      plan: { scriptId: 'preview', route: '/', actions: [{ type: 'assert-visible', selector: 'body' }] },
    })).rejects.toThrow('浏览器验收期间工作树发生变化');
    await manager.dispose();

    const restarted = await createDevelopmentManager({ stateRoot, acceptanceRuntime });
    await expect(restarted.preflightSession({ root, task })).rejects.toThrow('最后受控状态不一致');
    await expect(restarted.resumeSession({ sessionId: session.sessionId, root, task }))
      .rejects.toThrow('最后受控状态不一致');
    await restarted.dispose();
  });

  it('rejects overlapping operations for one session and releases the gate afterward', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-exclusive-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-exclusive-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'value.mjs'), 'export const value = 1;\n', 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({
      scripts: { preview: 'node preview.mjs', test: 'node -e "process.exit(0)"' },
    }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/value.mjs', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    let markAcceptanceStarted!: () => void;
    let releaseAcceptance!: () => void;
    const acceptanceStarted = new Promise<void>((resolve) => { markAcceptanceStarted = resolve; });
    const acceptanceGate = new Promise<void>((resolve) => { releaseAcceptance = resolve; });
    const acceptanceRuntime = {
      async run() {
        const startedAt = new Date().toISOString();
        markAcceptanceStarted();
        await acceptanceGate;
        return {
          status: 'passed',
          scriptId: 'preview',
          planSha256: 'a'.repeat(64),
          evidenceSha256: 'b'.repeat(64),
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: 1,
          actionCount: 1,
          viewportCount: 2,
          consoleErrorCount: 0,
          consoleWarningCount: 0,
          failedRequestCount: 0,
          failureCount: 0,
          screenshotSha256: [],
          viewports: [],
        };
      },
      async dispose() {},
    };
    const manager = await createDevelopmentManager({ stateRoot, acceptanceRuntime });
    const session = await manager.createSession({ root, task: '验证同一会话的受管操作独占' }) as any;
    const siblingSession = await manager.createSession({ root, task: '验证同一工作树的第二个任务会话' }) as any;
    const runningAcceptance = manager.runBrowserAcceptance({
      sessionId: session.sessionId,
      acceptanceId: 'exclusive-browser',
      plan: { scriptId: 'preview', route: '/', actions: [{ type: 'assert-visible', selector: 'body' }] },
    });
    await acceptanceStarted;
    try {
      await expect(manager.snapshot({ sessionId: session.sessionId })).rejects.toThrow('已有受管操作正在运行');
      await expect(manager.snapshot({ sessionId: siblingSession.sessionId })).rejects.toThrow('已有受管操作正在运行');
      await expect(manager.runCommand(commandInput(session.sessionId, 'test')))
        .rejects.toThrow('已有受管操作正在运行');
      await expect(manager.applyTextReplacement({
        sessionId: session.sessionId,
        changeSetId: 'exclusive-change',
        path: 'src/value.mjs',
        oldText: 'value = 1',
        newText: 'value = 2',
      })).rejects.toThrow('已有受管操作正在运行');
    } finally {
      releaseAcceptance();
      await runningAcceptance;
    }
    const applied = await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'exclusive-change',
      path: 'src/value.mjs',
      oldText: 'value = 1',
      newText: 'value = 2',
    }) as any;
    expect(applied.ok).toBe(true);
    expect(await readFile(path.join(root, 'src', 'value.mjs'), 'utf8')).toContain('value = 2');
    expect((await manager.snapshot({ sessionId: siblingSession.sessionId }) as any).gitStatus).toContain('src/value.mjs');
    await expect(manager.runCommand(commandInput(siblingSession.sessionId, 'test')))
      .rejects.toThrow('最后受控状态不一致');
    await manager.dispose();
  }, 15_000);

  it('queues a failed stop transition behind the active model receipt', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-model-stop-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-model-stop-state-'));
    temporaryRoots.push(root, stateRoot);
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task: 'verify queued failed progress after cancellation' }) as any;
    const call = {
      sessionId: session.sessionId,
      runId: `${session.sessionId}-cancelled-model-stage`,
      agentId: 'AG-DEV',
      inputBytes: 120,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 80,
    };
    const issued = await manager.issueModelCall(call) as any;
    const lease = await manager.beginModelCall({ ...issued.authorization, ...call });
    let progressSettled = false;
    const failedProgress = manager.updateProgress({
      sessionId: session.sessionId,
      phase: 'failed',
      transitionId: 'transition-model-stop-after-receipt',
    }).then((result) => {
      progressSettled = true;
      return result as any;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(progressSettled).toBe(false);
    await lease.recordFailure({ code: 'CANCELLED', retryable: false });
    lease.release();

    await expect(failedProgress).resolves.toMatchObject({ phase: 'failed' });
    const ledger = await readFile(path.join(stateRoot, `${session.sessionId}.json`), 'utf8');
    expect(ledger).toContain('transition-model-stop-after-receipt');
    expect(ledger).toContain('"phase": "failed"');
    await manager.dispose();
  });

  it('persists a crash-safe redacted model budget and consumes one-time calls under the root gate', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-model-budget-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-model-budget-state-'));
    temporaryRoots.push(root, stateRoot);
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const task = '修改 package.json 的测试文案';
    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task }) as any;
    expect(session.modelUsage).toMatchObject({
      maxCalls: 40,
      maxInputBytes: 2_000_000,
      maxInputBytesPerCall: 1_000_000,
      maxOutputTokens: 64_000,
      maxOutputTokensPerCall: 2_000,
      reservedCalls: 0,
      startedCalls: 0,
      unstartedReservedCalls: 0,
      reservedInputBytes: 0,
      usageReportedCalls: 0,
      usageMissingStartedCalls: 0,
      observedInputTokens: 0,
      observedOutputTokens: 0,
      costCurrency: 'CNY',
      inputMicrosPerMillionTokens: 1_000_000,
      outputMicrosPerMillionTokens: 2_000_000,
      maxCostMicros: 50_000_000,
      chargedCostMicros: 0,
      remainingCostMicros: 50_000_000,
      remainingInputBytes: 2_000_000,
    });
    const privateRunId = `${session.sessionId}-private-model-stage`;
    await expect(manager.issueModelCall({
      sessionId: session.sessionId,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      maxOutputTokens: 1_600,
    })).rejects.toThrow('输入摘要必须为 SHA-256');
    await expect(manager.issueModelCall({
      sessionId: session.sessionId,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      inputSha256: MODEL_INPUT_SHA256,
      maxOutputTokens: 1_600,
    })).rejects.toThrow('路由摘要必须为 SHA-256');
    await expect(manager.issueModelCall({
      sessionId: session.sessionId,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      maxOutputTokens: 1_600,
    })).rejects.toThrow('Provider 测试代际摘要必须为 SHA-256');
    const issued = await manager.issueModelCall({
      sessionId: session.sessionId,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1_600,
    }) as any;
    expect(issued.session.modelUsage).toMatchObject({
      reservedCalls: 1,
      startedCalls: 0,
      unstartedReservedCalls: 1,
      reservedInputBytes: 12_345,
      remainingInputBytes: 1_987_655,
      reservedOutputTokens: 1_600,
      usageReportedCalls: 0,
      observedInputTokens: 0,
      observedOutputTokens: 0,
      reservedCostMicros: 15_545,
      unsettledCostMicros: 15_545,
      chargedCostMicros: 15_545,
      remainingCostMicros: 49_984_455,
    });
    expect(JSON.stringify(issued.session)).not.toContain(issued.authorization.authorizationToken);
    const ledgerPath = path.join(stateRoot, `${session.sessionId}.json`);
    const ledger = await readFile(ledgerPath, 'utf8');
    expect(ledger).not.toContain(issued.authorization.authorizationToken);
    expect(ledger).not.toContain('private-model-stage');
    expect(ledger).toContain('tokenSha256');

    await expect(manager.preflightModelCall({
      ...issued.authorization,
      authorizationToken: 'wrong-token',
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1_600,
    })).rejects.toThrow('一次性授权无效');
    await expect(manager.preflightModelCall({
      ...issued.authorization,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_346,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1_600,
    })).rejects.toThrow('一次性授权与调用不匹配');
    await expect(manager.preflightModelCall({
      ...issued.authorization,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1_600,
    })).resolves.toBeUndefined();
    expect((await manager.snapshot({ sessionId: session.sessionId }) as any).session.modelUsage)
      .toMatchObject({ reservedCalls: 1, startedCalls: 0, unstartedReservedCalls: 1 });

    await expect(manager.beginModelCall({
      ...issued.authorization,
      authorizationToken: 'wrong-token',
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1_600,
    })).rejects.toThrow('一次性授权无效');
    await expect(manager.beginModelCall({
      ...issued.authorization,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_346,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1_600,
    })).rejects.toThrow('一次性授权与调用不匹配：inputBytes');
    await expect(manager.beginModelCall({
      ...issued.authorization,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      inputSha256: 'b'.repeat(64),
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1_600,
    })).rejects.toThrow('一次性授权与调用不匹配');
    await expect(manager.beginModelCall({
      ...issued.authorization,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: 'd'.repeat(64),
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1_600,
    })).rejects.toThrow('一次性授权与调用不匹配');
    await expect(manager.beginModelCall({
      ...issued.authorization,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: 'f'.repeat(64),
      maxOutputTokens: 1_600,
    })).rejects.toThrow('一次性授权与调用不匹配');
    const lease = await manager.beginModelCall({
      ...issued.authorization,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1_600,
    });
    await expect(manager.snapshot({ sessionId: session.sessionId })).rejects.toThrow('已有受管操作正在运行');
    await expect(lease.recordUsage({ inputTokens: 12_346, outputTokens: 7 }))
      .rejects.toThrow('usage 回执超出当前开发模型授权');
    await expect(lease.recordUsage({ inputTokens: 123, outputTokens: 1_601 }))
      .rejects.toThrow('usage 回执超出当前开发模型授权');
    await lease.recordUsage({ inputTokens: 123, outputTokens: 7 });
    await lease.recordUsage({ inputTokens: 123, outputTokens: 7 });
    await expect(lease.recordUsage({ inputTokens: 124, outputTokens: 7 }))
      .rejects.toThrow('usage 回执与已记录结果冲突');
    lease.release();
    await expect(manager.beginModelCall({
      ...issued.authorization,
      runId: privateRunId,
      agentId: 'AG-DEV',
      inputBytes: 12_345,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1_600,
    })).rejects.toThrow('一次性授权已使用');
    expect((await manager.snapshot({ sessionId: session.sessionId }) as any).session.modelUsage).toMatchObject({
      startedCalls: 1,
      usageReportedCalls: 1,
      usageMissingStartedCalls: 0,
      observedInputTokens: 123,
      observedOutputTokens: 7,
      observedCostMicros: 137,
      unsettledCostMicros: 0,
      chargedCostMicros: 137,
      remainingCostMicros: 49_999_863,
    });
    const usageLedger = await readFile(ledgerPath, 'utf8');
    expect(usageLedger).toContain('"observedInputTokens": 123');
    expect(usageLedger).toContain('"observedOutputTokens": 7');
    expect(usageLedger).toContain('"usageReportedAt"');
    await expect(manager.issueModelCall({
      sessionId: session.sessionId,
      runId: `${session.sessionId}-oversized-call`,
      agentId: 'AG-DEV',
      inputBytes: 1,
      maxOutputTokens: 2_001,
    })).rejects.toThrow('1-2000');
    await expect(manager.issueModelCall({
      sessionId: session.sessionId,
      runId: `${session.sessionId}-oversized-input`,
      agentId: 'AG-DEV',
      inputBytes: 1_000_001,
      maxOutputTokens: 1,
    })).rejects.toThrow('1-1000000');

    const outputLimitedLedger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    outputLimitedLedger.modelReservations.push(
      ...Array.from({ length: 31 }, (_, offset) => {
        const index = offset + 1;
        return {
          reservationId: `model-10000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
          tokenSha256: (index + 200).toString(16).padStart(64, '0'),
          runIdSha256: (index + 300).toString(16).padStart(64, '0'),
          agentId: 'AG-DEV',
          maxOutputTokens: 2_000,
          reservedAt: new Date().toISOString(),
          consumedAt: null,
        };
      }),
      {
        reservationId: 'model-10000000-0000-4000-8000-000000000020',
        tokenSha256: 'c'.repeat(64),
        runIdSha256: 'd'.repeat(64),
        agentId: 'AG-DEV',
        maxOutputTokens: 400,
        reservedAt: new Date().toISOString(),
        consumedAt: null,
      },
    );
    await writeFile(ledgerPath, `${JSON.stringify(outputLimitedLedger, null, 2)}\n`, 'utf8');
    await expect(manager.issueModelCall({
      sessionId: session.sessionId,
      runId: `${session.sessionId}-budget-34`,
      agentId: 'AG-DEV',
      inputBytes: 1,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1,
    })).rejects.toThrow('输出 token 硬预算不足');

    const callLimited = await manager.createSession({ root, task: '修改 package.json 的标题文案' }) as any;
    const callLimitedLedgerPath = path.join(stateRoot, `${callLimited.sessionId}.json`);
    const callLimitedLedger = JSON.parse(await readFile(callLimitedLedgerPath, 'utf8'));
    callLimitedLedger.modelReservations = Array.from({ length: 40 }, (_, offset) => {
      const index = offset + 1;
      return {
        reservationId: `model-00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
        tokenSha256: index.toString(16).padStart(64, '0'),
        runIdSha256: (index + 100).toString(16).padStart(64, '0'),
        agentId: 'AG-DEV',
        maxOutputTokens: 1,
        reservedAt: new Date().toISOString(),
        consumedAt: null,
      };
    });
    await writeFile(callLimitedLedgerPath, `${JSON.stringify(callLimitedLedger, null, 2)}\n`, 'utf8');
    await expect(manager.issueModelCall({
      sessionId: callLimited.sessionId,
      runId: `${callLimited.sessionId}-budget-41`,
      agentId: 'AG-DEV',
      inputBytes: 1,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1,
    })).rejects.toThrow('调用次数硬预算已耗尽');

    const inputLimited = await manager.createSession({ root, task: '修改 package.json 的输入预算文案' }) as any;
    for (const index of [1, 2]) {
      await manager.issueModelCall({
        sessionId: inputLimited.sessionId,
        runId: `${inputLimited.sessionId}-input-budget-${index}`,
        agentId: 'AG-DEV',
        inputBytes: 1_000_000,
        inputSha256: MODEL_INPUT_SHA256,
        modelRouteSha256: MODEL_ROUTE_SHA256,
        providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
        maxOutputTokens: 1,
      });
    }
    await expect(manager.issueModelCall({
      sessionId: inputLimited.sessionId,
      runId: `${inputLimited.sessionId}-input-budget-3`,
      agentId: 'AG-DEV',
      inputBytes: 1,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 1,
    })).rejects.toThrow('输入字节硬预算不足');
    expect((await manager.snapshot({ sessionId: inputLimited.sessionId }) as any).session.modelUsage)
      .toMatchObject({ reservedInputBytes: 2_000_000, remainingInputBytes: 0 });

    const costLimited = await manager.createSession({
      root,
      task: '修改 package.json 的费用硬上限文案',
      costPolicy: {
        currency: 'CNY',
        inputMicrosPerMillionTokens: 1_000_000,
        outputMicrosPerMillionTokens: 2_000_000,
        maxCostMicros: 100,
      },
    }) as any;
    await expect(manager.issueModelCall({
      sessionId: costLimited.sessionId,
      runId: `${costLimited.sessionId}-cost-budget`,
      agentId: 'AG-DEV',
      inputBytes: 100,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 20,
    })).rejects.toThrow('人民币费用硬预算不足');
    expect((await manager.snapshot({ sessionId: costLimited.sessionId }) as any).session.modelUsage)
      .toMatchObject({ reservedCalls: 0, chargedCostMicros: 0, remainingCostMicros: 100 });

    const usageMissing = await manager.createSession({ root, task: '修改 package.json 的 usage 回执文案' }) as any;
    const usageMissingRunId = `${usageMissing.sessionId}-usage-missing`;
    const usageMissingIssue = await manager.issueModelCall({
      sessionId: usageMissing.sessionId,
      runId: usageMissingRunId,
      agentId: 'AG-DEV',
      inputBytes: 100,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 20,
    }) as any;
    const usageMissingLease = await manager.beginModelCall({
      ...usageMissingIssue.authorization,
      runId: usageMissingRunId,
      agentId: 'AG-DEV',
      inputBytes: 100,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 20,
    });
    usageMissingLease.release();
    expect((await manager.snapshot({ sessionId: usageMissing.sessionId }) as any).session.modelUsage).toMatchObject({
      startedCalls: 1,
      usageReportedCalls: 0,
      usageMissingStartedCalls: 1,
      observedInputTokens: 0,
      observedOutputTokens: 0,
    });

    const retryTask = '修改 package.json 的瞬时补发账本文案';
    const retrySession = await manager.createSession({ root, task: retryTask }) as any;
    const originalRunId = `${retrySession.sessionId}-transient-original`;
    const originalIssue = await manager.issueModelCall({
      sessionId: retrySession.sessionId,
      runId: originalRunId,
      agentId: 'AG-DEV',
      inputBytes: 100,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 20,
    }) as any;
    const originalLease = await manager.beginModelCall({
      ...originalIssue.authorization,
      runId: originalRunId,
      agentId: 'AG-DEV',
      inputBytes: 100,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 20,
    });
    await expect(originalLease.recordFailure({ code: 'UPSTREAM_TRANSPORT', retryable: false }))
      .rejects.toThrow('固定合同');
    await originalLease.recordFailure({ code: 'UPSTREAM_TRANSPORT', retryable: true });
    await originalLease.recordFailure({ code: 'UPSTREAM_TRANSPORT', retryable: true });
    await expect(originalLease.recordFailure({ code: 'UPSTREAM_TEMPORARY', retryable: true }))
      .rejects.toThrow('已记录结果冲突');
    originalLease.release();

    const retryRunId = `${retrySession.sessionId}-transient-retry-1`;
    await expect(manager.issueModelCall({
      sessionId: retrySession.sessionId,
      runId: retryRunId,
      agentId: 'AG-DEV',
      inputBytes: 100,
      inputSha256: 'b'.repeat(64),
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 20,
      retryOfReservationId: originalIssue.authorization.reservationId,
    })).rejects.toThrow('补发必须保持 Agent、输入、模型路由、Provider 测试代际、输出上限');
    await expect(manager.issueModelCall({
      sessionId: retrySession.sessionId,
      runId: retryRunId,
      agentId: 'AG-DEV',
      inputBytes: 100,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: 'd'.repeat(64),
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 20,
      retryOfReservationId: originalIssue.authorization.reservationId,
    })).rejects.toThrow('补发必须保持 Agent、输入、模型路由、Provider 测试代际、输出上限');
    await expect(manager.issueModelCall({
      sessionId: retrySession.sessionId,
      runId: retryRunId,
      agentId: 'AG-DEV',
      inputBytes: 100,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: 'f'.repeat(64),
      maxOutputTokens: 20,
      retryOfReservationId: originalIssue.authorization.reservationId,
    })).rejects.toThrow('补发必须保持 Agent、输入、模型路由、Provider 测试代际、输出上限');
    const retryIssue = await manager.issueModelCall({
      sessionId: retrySession.sessionId,
      runId: retryRunId,
      agentId: 'AG-DEV',
      inputBytes: 100,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 20,
      retryOfReservationId: originalIssue.authorization.reservationId,
    }) as any;
    expect(retryIssue.session.modelUsage).toMatchObject({
      reservedCalls: 2,
      startedCalls: 1,
      failureReportedCalls: 1,
      retryableFailureCalls: 1,
      transientRetryCalls: 1,
    });
    await expect(manager.issueModelCall({
      sessionId: retrySession.sessionId,
      runId: `${retrySession.sessionId}-transient-retry-duplicate`,
      agentId: 'AG-DEV',
      inputBytes: 100,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 20,
      retryOfReservationId: originalIssue.authorization.reservationId,
    })).rejects.toThrow('唯一一次补发');
    const retryLedger = await readFile(path.join(stateRoot, `${retrySession.sessionId}.json`), 'utf8');
    expect(retryLedger).toContain('"failureCode": "UPSTREAM_TRANSPORT"');
    expect(retryLedger).toContain(`"inputSha256": "${MODEL_INPUT_SHA256}"`);
    expect(retryLedger).toContain(`"modelRouteSha256": "${MODEL_ROUTE_SHA256}"`);
    expect(retryLedger).toContain(`"providerReadinessSha256": "${MODEL_PROVIDER_READINESS_SHA256}"`);
    expect(retryLedger).toContain(`"retryOfReservationId": "${originalIssue.authorization.reservationId}"`);
    expect(retryLedger).not.toContain('transient-original');
    await manager.dispose();

    const restarted = await createDevelopmentManager({ stateRoot });
    const resumed = await restarted.resumeSession({ sessionId: session.sessionId, root, task }) as any;
    expect(resumed.modelUsage).toMatchObject({
      reservedCalls: 33,
      startedCalls: 1,
      reservedInputBytes: 12_345,
      untrackedLegacyInputCalls: 32,
      reservedOutputTokens: 64_000,
      usageReportedCalls: 1,
      usageMissingStartedCalls: 0,
      observedInputTokens: 123,
      observedOutputTokens: 7,
      remainingCalls: 7,
      remainingOutputTokens: 0,
    });
    const resumedRetry = await restarted.resumeSession({
      sessionId: retrySession.sessionId,
      root,
      task: retryTask,
    }) as any;
    expect(resumedRetry.modelUsage).toMatchObject({
      failureReportedCalls: 1,
      retryableFailureCalls: 1,
      transientRetryCalls: 1,
    });
    await restarted.dispose();
  }, 15_000);

  it('replays an unstarted model issuance only inside its original service process', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-model-issuance-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-model-issuance-state-'));
    temporaryRoots.push(root, stateRoot);
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const task = '修改 package.json 的本地模型签发测试';
    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task }) as any;
    const call = {
      sessionId: session.sessionId,
      runId: `${session.sessionId}-idempotent-issuance`,
      agentId: 'AG-DEV',
      inputBytes: 321,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 80,
    };
    const issued = await manager.issueModelCall(call) as any;
    const replayed = await manager.issueModelCall(call) as any;
    expect(replayed.authorization).toEqual(issued.authorization);
    expect(replayed.session.modelUsage).toMatchObject({ reservedCalls: 1, unstartedReservedCalls: 1 });
    await expect(manager.issueModelCall({ ...call, maxOutputTokens: 81 }))
      .rejects.toThrow('同一开发模型 runId 的签发合同不可变');

    const consumedCall = { ...call, runId: `${session.sessionId}-consumed-issuance` };
    const consumedIssue = await manager.issueModelCall(consumedCall) as any;
    const lease = await manager.beginModelCall({ ...consumedIssue.authorization, ...consumedCall });
    lease.release();
    await expect(manager.issueModelCall(consumedCall)).rejects.toThrow('开发模型 runId 已签发并启动');
    const ledgerPath = path.join(stateRoot, `${session.sessionId}.json`);
    const ledger = await readFile(ledgerPath, 'utf8');
    expect(ledger).not.toContain(issued.authorization.authorizationToken);
    expect(ledger).not.toContain(consumedIssue.authorization.authorizationToken);
    await manager.dispose();

    const restarted = await createDevelopmentManager({ stateRoot });
    await restarted.resumeSession({ sessionId: session.sessionId, root, task });
    await expect(restarted.issueModelCall(call))
      .rejects.toThrow('签发所属服务进程已结束，无法重放');
    expect((await restarted.snapshot({ sessionId: session.sessionId }) as any).session.modelUsage).toMatchObject({
      reservedCalls: 2,
      startedCalls: 1,
      unstartedReservedCalls: 1,
    });
    await restarted.dispose();
  }, 15_000);

  it('rolls back every model ledger transition when atomic persistence fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-model-ledger-rollback-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-model-ledger-rollback-state-'));
    temporaryRoots.push(root, stateRoot);
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task: '验证模型账本写盘失败的原子回滚' }) as any;
    const ledgerPath = path.join(stateRoot, `${session.sessionId}.json`);
    const runId = `${session.sessionId}-atomic-model-ledger`;
    const call = {
      sessionId: session.sessionId,
      runId,
      agentId: 'AG-DEV',
      inputBytes: 100,
      inputSha256: MODEL_INPUT_SHA256,
      modelRouteSha256: MODEL_ROUTE_SHA256,
      providerReadinessSha256: MODEL_PROVIDER_READINESS_SHA256,
      maxOutputTokens: 20,
    };
    const sabotageLedger = async () => {
      const durable = await readFile(ledgerPath, 'utf8');
      await rm(ledgerPath, { force: true });
      await mkdir(ledgerPath);
      return async () => {
        await rm(ledgerPath, { recursive: true, force: true });
        await writeFile(ledgerPath, durable, 'utf8');
      };
    };
    const expectNoTemporaryLedgers = async () => {
      expect((await readdir(stateRoot)).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
    };

    let restoreLedger = await sabotageLedger();
    await expect(manager.issueModelCall(call)).rejects.toThrow();
    await expectNoTemporaryLedgers();
    await restoreLedger();
    expect((await manager.snapshot({ sessionId: session.sessionId }) as any).session.modelUsage)
      .toMatchObject({ reservedCalls: 0, startedCalls: 0 });

    const issued = await manager.issueModelCall(call) as any;
    restoreLedger = await sabotageLedger();
    await expect(manager.beginModelCall({ ...issued.authorization, ...call })).rejects.toThrow();
    await expectNoTemporaryLedgers();
    await restoreLedger();
    expect((await manager.snapshot({ sessionId: session.sessionId }) as any).session.modelUsage)
      .toMatchObject({ reservedCalls: 1, startedCalls: 0 });

    const lease = await manager.beginModelCall({ ...issued.authorization, ...call });
    restoreLedger = await sabotageLedger();
    await expect(lease.recordUsage({ inputTokens: 9, outputTokens: 7 })).rejects.toThrow();
    await expectNoTemporaryLedgers();
    await restoreLedger();
    await lease.recordUsage({ inputTokens: 9, outputTokens: 7 });
    expect(await readFile(ledgerPath, 'utf8')).toContain('"observedInputTokens": 9');

    restoreLedger = await sabotageLedger();
    await expect(lease.recordFailure({ code: 'UPSTREAM_TEMPORARY', retryable: true })).rejects.toThrow();
    await expectNoTemporaryLedgers();
    await restoreLedger();
    await lease.recordFailure({ code: 'UPSTREAM_TEMPORARY', retryable: true });
    lease.release();
    expect(await readFile(ledgerPath, 'utf8')).toContain('"failureCode": "UPSTREAM_TEMPORARY"');
    expect((await manager.snapshot({ sessionId: session.sessionId }) as any).session.modelUsage).toMatchObject({
      reservedCalls: 1,
      startedCalls: 1,
      usageReportedCalls: 1,
      failureReportedCalls: 1,
    });
    await manager.dispose();
  });

  it('persists only redacted session evidence and resumes by root fingerprint', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'value.mjs'), 'export const value = 1;\n', 'utf8');
    await writeFile(path.join(root, 'test.mjs'), "import { value } from './src/value.mjs'; console.log('PRIVATE_COMMAND_OUTPUT_CANARY'); if (value !== 2) throw new Error('bad');\n", 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node test.mjs' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/value.mjs', 'test.mjs', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const task = 'PRIVATE_TASK_CANARY update the value';
    const session = await manager.createSession({ root, task, presetId: 'local-autonomous-v1' }) as any;
    expect(session.rootBound).toBe(true);
    const ledgerPath = path.join(stateRoot, `${session.sessionId}.json`);
    const ledger = await readFile(ledgerPath, 'utf8');
    expect(ledger).not.toContain(root);
    expect(ledger).not.toContain(task);
    expect(ledger).not.toContain('src/value.mjs');
    expect(JSON.parse(ledger).worktreeStateSha256).toMatch(/^[a-f0-9]{64}$/);

    const snapshot = await manager.snapshot({ sessionId: session.sessionId }) as any;
    expect(snapshot.files).toContain('src/value.mjs');
    await expect(manager.applyChangeSet({
      sessionId: session.sessionId,
      changeSetId: 'rejected-conflict-marker',
      patch: [
        'diff --git a/src/value.mjs b/src/value.mjs',
        '--- a/src/value.mjs',
        '+++ b/src/value.mjs',
        '@@ -1 +1 @@',
        '-export const value = 1;',
        '+<<<<<<< unsafe',
        '',
      ].join('\n'),
    })).rejects.toThrow('已完整回滚');
    expect((await readFile(path.join(root, 'src', 'value.mjs'), 'utf8')).replace(/\r\n/g, '\n')).toBe('export const value = 1;\n');
    expect(gitOutput(root, ['status', '--short', '--untracked-files=all'])).toBe('');
    const applied = await manager.applyChangeSet({
      sessionId: session.sessionId,
      changeSetId: 'change-1',
      patch: [
        'diff --git a/src/value.mjs b/src/value.mjs',
        '--- a/src/value.mjs',
        '+++ b/src/value.mjs',
        '@@ -1 +1 @@',
        '-export const value = 1;',
        '+export const value = 2;',
        '',
      ].join('\n'),
    }) as any;
    expect(applied.ok).toBe(true);
    expect((await readFile(path.join(root, 'src', 'value.mjs'), 'utf8')).replace(/\r\n/g, '\n')).toBe('export const value = 2;\n');
    await approveReview(manager, session.sessionId, 'review-before-test');
    const commandExecution = {
      sessionId: session.sessionId,
      commandId: 'test',
      executionId: 'command-redacted-recovery',
    };
    expect((await manager.runCommand(commandExecution) as any)).toMatchObject({
      status: 'passed',
      executionId: commandExecution.executionId,
      outputTail: expect.stringContaining('PRIVATE_COMMAND_OUTPUT_CANARY'),
    });
    const commandLedger = await readFile(ledgerPath, 'utf8');
    expect(commandLedger).toContain('"schema": "agenthub.development-command-execution"');
    expect(commandLedger).toContain(`"executionId": "${commandExecution.executionId}"`);
    expect(commandLedger).not.toContain('PRIVATE_COMMAND_OUTPUT_CANARY');
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      reviewBlockers: ['required-independent-review-predates-verification'],
    });
    await approveReview(manager, session.sessionId, 'review-value-change');
    expect((await manager.finalize({ sessionId: session.sessionId }) as any).ready).toBe(true);
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: true,
      browserAcceptanceRequired: false,
      session: { final: { browserAcceptanceRequired: false } },
    });
    const reviewedLedger = await readFile(ledgerPath, 'utf8');
    expect(reviewedLedger).not.toContain('PRIVATE_REVIEW_CANARY');
    expect(reviewedLedger).not.toContain('src/value.mjs');
    expect(reviewedLedger).toContain('"schema": "agenthub.development-review"');
    await expect(manager.submitReview({
      sessionId: session.sessionId,
      reviewId: 'review-wrong-agent',
      agentId: 'AG-DEV',
      modelId: 'deepseek-v4-flash',
      summary: 'FINDINGS:H0/M0/L0; GATE:PASS; wrong reviewer',
    })).rejects.toThrow('只接受 AG-REVIEW');
    await expect(manager.submitReview({
      sessionId: session.sessionId,
      reviewId: 'review-inconsistent-gate',
      agentId: 'AG-REVIEW',
      modelId: 'deepseek-v4-pro',
      summary: 'FINDINGS:H1/M0/L0; GATE:PASS; inconsistent',
    })).rejects.toThrow('不得提交 GATE:PASS');
    await expect(manager.createSession({ root, task: 'must start clean' })).rejects.toThrow('clean Git 工作树');

    await writeFile(path.join(root, '.env'), 'PRIVATE_SECRET_CANARY=never-export\n', 'utf8');
    const unsafeDiff = await manager.inspect({ sessionId: session.sessionId, kind: 'diff' }) as any;
    expect(JSON.stringify(unsafeDiff)).not.toContain('PRIVATE_SECRET_CANARY');
    expect((await manager.finalize({ sessionId: session.sessionId }) as any)).toMatchObject({
      ready: false,
      blockedChangedPathCount: 1,
    });
    await rm(path.join(root, '.env'));
    expect((await manager.finalize({ sessionId: session.sessionId }) as any).ready).toBe(true);

    const restarted = await createDevelopmentManager({ stateRoot });
    expect((await restarted.listSessions() as any[])[0]).toMatchObject({ sessionId: session.sessionId, rootBound: false });
    const readyPreflight = await restarted.preflightSession({ root, task }) as any;
    expect(readyPreflight).toMatchObject({
      mode: 'reopen',
      resume: { sessionId: session.sessionId, phase: 'ready' },
    });
    expect(JSON.stringify(readyPreflight)).not.toContain(root);
    expect(JSON.stringify(readyPreflight)).not.toContain(task);
    const controlledValue = await readFile(path.join(root, 'src', 'value.mjs'), 'utf8');
    await writeFile(path.join(root, 'src', 'value.mjs'), 'export const value = 3;\n', 'utf8');
    await expect(restarted.preflightSession({ root, task })).rejects.toThrow('最后受控状态不一致');
    await writeFile(path.join(root, 'src', 'value.mjs'), controlledValue, 'utf8');
    expect(await restarted.resumeSession({ sessionId: session.sessionId, root, task })).toMatchObject({ rootBound: true });
    await expect(restarted.runCommand(commandExecution)).rejects.toThrow('executionId 已使用');
    const statusBeforeHeadDrift = gitOutput(root, ['status', '--short', '--untracked-files=all']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '--allow-empty', '-m', 'head drift']);
    expect(gitOutput(root, ['status', '--short', '--untracked-files=all'])).toBe(statusBeforeHeadDrift);
    await expect(restarted.snapshot({ sessionId: session.sessionId })).rejects.toThrow('Git HEAD');
    await expect(restarted.finalize({ sessionId: session.sessionId })).rejects.toThrow('Git HEAD');
    const afterHeadDrift = await createDevelopmentManager({ stateRoot });
    await expect(afterHeadDrift.resumeSession({ sessionId: session.sessionId, root, task })).rejects.toThrow('HEAD 已漂移');
  }, 30_000);

  it('requires independent security and quality reviews for a security-sensitive delivery', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-security-review-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-security-review-state-'));
    temporaryRoots.push(root, stateRoot);
    await writeFile(path.join(root, 'auth.mjs'), 'export const allowed = false;\n', 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'auth.mjs']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({
      root,
      task: '修复权限校验漏洞并完成独立安全审查',
    }) as any;
    expect(session.agentPlan).toMatchObject({
      size: 5,
      agents: ['AG-COORD', 'PRO', 'AG-DEV', 'AG-SEC', 'AG-REVIEW'],
    });
    await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'security-fix',
      path: 'auth.mjs',
      oldText: 'false',
      newText: 'true',
    });
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      reviewBlockers: ['required-security-review-missing', 'required-independent-review-missing'],
    });
    await manager.submitReview({
      sessionId: session.sessionId,
      reviewId: 'security-review',
      agentId: 'AG-SEC',
      modelId: 'deepseek-v4-pro',
      summary: 'FINDINGS:H0/M0/L0; GATE:PASS; independent security review',
    });
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      reviewBlockers: ['required-independent-review-missing'],
    });
    await approveReview(manager, session.sessionId, 'quality-review-after-security');
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: true,
      reviewBlockers: [],
    });
    await manager.dispose();
    const ledgerPath = path.join(stateRoot, `${session.sessionId}.json`);
    const forgedLedger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    forgedLedger.agentPlan = {
      size: 1,
      reasonCode: 'focused-low-risk',
      agents: ['AG-DEV', 'AG-REVIEW'],
    };
    await writeFile(ledgerPath, `${JSON.stringify(forgedLedger, null, 2)}\n`, 'utf8');
    const forged = await createDevelopmentManager({ stateRoot });
    expect(await forged.listSessions()).toEqual([]);
    await forged.dispose();
  }, 15_000);

  it('detects and runs a fixed Python unittest command without opening shell input', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-python-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-python-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'tests'));
    await writeFile(path.join(root, 'calculator.py'), 'VALUE = 1\n', 'utf8');
    await writeFile(path.join(root, 'index.html'), '<main>python static fixture</main>\n', 'utf8');
    await writeFile(path.join(root, 'pyproject.toml'), '[project]\nname = "agenthub-python-fixture"\nversion = "0.1.0"\n', 'utf8');
    await writeFile(path.join(root, 'tests', 'test_calculator.py'), [
      'import unittest',
      'from calculator import VALUE',
      '',
      'class CalculatorTest(unittest.TestCase):',
      '    def test_value(self):',
      '        self.assertEqual(VALUE, 2)',
      '',
    ].join('\n'), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'calculator.py', 'index.html', 'pyproject.toml', 'tests/test_calculator.py']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task: '修复 Python 计算值并通过现有测试' }) as any;
    const snapshot = await manager.snapshot({ sessionId: session.sessionId }) as any;
    expect(snapshot).toMatchObject({
      scripts: ['test'],
      acceptanceScripts: ['python-static'],
      packageManager: 'python',
    });
    expect(snapshot.seedFiles.map((item: any) => item.path)).toContain('pyproject.toml');
    expect(snapshot.seedFiles.map((item: any) => item.path)).toContain('index.html');
    await expect(manager.runCommand(commandInput(session.sessionId, 'lint')))
      .rejects.toThrow('项目未声明可用的 lint 固定命令');

    await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'python-value-fix',
      path: 'calculator.py',
      oldText: 'VALUE = 1',
      newText: 'VALUE = 2',
    });
    const result = await manager.runCommand(commandInput(session.sessionId, 'test')) as any;
    expect(result).toMatchObject({ status: 'passed', exitCode: 0 });
    expect(result.outputTail).toContain('[python:unittest]');
    await approveReview(manager, session.sessionId, 'review-python-value-fix');
    const finalized = await manager.finalize({ sessionId: session.sessionId }) as any;
    expect(finalized).toMatchObject({
      ready: true,
      missingOrFailed: [],
      acceptanceBlockers: [],
      reviewBlockers: [],
    });
    expect(finalized.changedPaths).toEqual([' M calculator.py']);
    const ledger = await readFile(path.join(stateRoot, `${session.sessionId}.json`), 'utf8');
    expect(ledger).not.toContain(root);
    expect(ledger).not.toContain('calculator.py');
    expect(ledger).not.toContain('agenthub-python-fixture');
  }, 30_000);

  it('restores persisted Python Web evidence and rejects a forged acceptance script id', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-python-recovery-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-python-recovery-state-'));
    temporaryRoots.push(root, stateRoot);
    await writeFile(path.join(root, 'index.html'), '<main>before</main>\n', 'utf8');
    await writeFile(path.join(root, 'pyproject.toml'), '[project]\nname = "python-recovery"\nversion = "0.1.0"\n', 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'index.html', 'pyproject.toml']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const acceptanceRuntime = {
      async run(input: any) {
        expect(input.root).toBe(root);
        expect(input.availableScripts).toEqual(['python-static']);
        expect(input.plan).toMatchObject({ scriptId: 'python-static' });
        return {
          status: 'passed',
          scriptId: 'python-static',
          planSha256: 'a'.repeat(64),
          evidenceSha256: 'b'.repeat(64),
          startedAt: new Date(Date.now() - 20).toISOString(),
          finishedAt: new Date(Date.now() - 10).toISOString(),
          durationMs: 10,
          actionCount: 1,
          viewportCount: 2,
          consoleErrorCount: 0,
          consoleWarningCount: 0,
          failedRequestCount: 0,
          failureCount: 0,
          screenshotSha256: ['c'.repeat(64), 'd'.repeat(64)],
          viewports: [],
        };
      },
      async dispose() {},
    };
    const manager = await createDevelopmentManager({ stateRoot, acceptanceRuntime });
    const task = '优化 Python 静态页面布局';
    const session = await manager.createSession({ root, task }) as any;
    await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'python-page-change',
      path: 'index.html',
      oldText: 'before',
      newText: 'after',
    });
    const accepted = await manager.runBrowserAcceptance({
      sessionId: session.sessionId,
      acceptanceId: 'python-static-acceptance',
      plan: { scriptId: 'python-static', route: '/', actions: [{ type: 'assert-text', text: 'after' }] },
    }) as any;
    expect(accepted.session.acceptances.at(-1)).toMatchObject({ status: 'passed', scriptId: 'python-static' });
    await approveReview(manager, session.sessionId, 'review-python-static');
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({ ready: true });
    await manager.dispose();

    const restarted = await createDevelopmentManager({ stateRoot, acceptanceRuntime });
    expect((await restarted.listSessions() as any[])[0]).toMatchObject({
      sessionId: session.sessionId,
      rootBound: false,
      acceptances: [{ status: 'passed', scriptId: 'python-static' }],
    });
    await restarted.resumeSession({ sessionId: session.sessionId, root, task });
    expect(await restarted.finalize({ sessionId: session.sessionId })).toMatchObject({ ready: true });
    await restarted.dispose();

    const ledgerPath = path.join(stateRoot, `${session.sessionId}.json`);
    const forgedLedger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    forgedLedger.acceptances[0].scriptId = 'python-arbitrary';
    await writeFile(ledgerPath, JSON.stringify(forgedLedger, null, 2), 'utf8');
    const forged = await createDevelopmentManager({ stateRoot, acceptanceRuntime });
    expect(await forged.listSessions()).toEqual([]);
    await forged.dispose();
  }, 30_000);

  it('runs both fixed adapters for a mixed Node and Python repository', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-mixed-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-mixed-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'tests'));
    await writeFile(path.join(root, 'calculator.py'), 'VALUE = 2\n', 'utf8');
    await writeFile(path.join(root, 'app.py'), 'app = object()\n', 'utf8');
    await writeFile(path.join(root, 'main.py'), 'app = object()\n', 'utf8');
    await writeFile(path.join(root, 'test.mjs'), "process.stdout.write('node-ok')\n", 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node test.mjs' } }), 'utf8');
    await writeFile(path.join(root, 'pyproject.toml'), [
      '[project]',
      'name = "agenthub-mixed-fixture"',
      'version = "0.1.0"',
      'dependencies = ["flask", "fastapi", "uvicorn"]',
      '',
    ].join('\n'), 'utf8');
    await writeFile(path.join(root, 'tests', 'test_calculator.py'), [
      'import unittest',
      'from calculator import VALUE',
      '',
      'class CalculatorTest(unittest.TestCase):',
      '    def test_value(self):',
      '        self.assertEqual(VALUE, 2)',
      '',
    ].join('\n'), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'app.py', 'calculator.py', 'main.py', 'test.mjs', 'package.json', 'pyproject.toml', 'tests/test_calculator.py']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task: '验证混合项目的固定测试门禁' }) as any;
    expect(await manager.snapshot({ sessionId: session.sessionId })).toMatchObject({
      scripts: ['test'],
      acceptanceScripts: ['python-fastapi', 'python-flask'],
      packageManager: 'npm + python',
    });
    const result = await manager.runCommand(commandInput(session.sessionId, 'test')) as any;
    expect(result).toMatchObject({ status: 'passed', exitCode: 0 });
    expect(result.outputTail).toContain('[node:test]');
    expect(result.outputTail).toContain('[python:unittest]');
    expect(gitOutput(root, ['status', '--short', '--untracked-files=all'])).toBe('');
  }, 30_000);

  it('rejects verification evidence when a fixed command changes the managed worktree', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-command-mutation-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-command-mutation-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'value.mjs'), 'export const value = 1;\n', 'utf8');
    await writeFile(path.join(root, 'mutate.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('src/value.mjs', 'export const value = 2;\\n');\n", 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node mutate.mjs' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/value.mjs', 'mutate.mjs', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task: '调整应用数值' }) as any;
    const result = await manager.runCommand(commandInput(session.sessionId, 'test')) as any;
    expect(result).toMatchObject({ status: 'failed', exitCode: 0, worktreeChanged: true });
    expect(result.outputTail).toContain('固定验证命令改变了受管工作树');
    expect((await manager.snapshot({ sessionId: session.sessionId }) as any).worktreeStateSha256)
      .toBe(result.sourceStateSha256);
    await manager.dispose();
  });

  it('persists and enforces one eligible test stability retry per exact source state', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-test-stability-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-test-stability-state-'));
    temporaryRoots.push(root, stateRoot);
    await writeFile(path.join(root, 'test.mjs'), 'process.exit(1);\n', 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node test.mjs' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'test.mjs', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const task = '验证失败测试只做一次稳定性复验';
    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task }) as any;
    const first = await manager.runCommand(commandInput(session.sessionId, 'test')) as any;
    expect(first).toMatchObject({
      commandId: 'test',
      status: 'failed',
      timedOut: false,
      worktreeChanged: false,
    });
    await expect(manager.runCommand({
      ...commandInput(session.sessionId, 'build'),
      stabilityRetryOf: first.executionId,
    })).rejects.toThrow('稳定性复验只允许固定 test 命令');
    const retry = await manager.runCommand({
      ...commandInput(session.sessionId, 'test'),
      stabilityRetryOf: first.executionId,
    }) as any;
    expect(retry).toMatchObject({
      commandId: 'test',
      status: 'failed',
      stabilityRetryOf: first.executionId,
      sourceStateSha256: first.sourceStateSha256,
    });
    await manager.dispose();

    const restarted = await createDevelopmentManager({ stateRoot });
    expect(await restarted.preflightSession({ root, task })).toMatchObject({
      mode: 'resume',
      resume: { sessionId: session.sessionId },
    });
    const resumed = await restarted.resumeSession({ sessionId: session.sessionId, root, task }) as any;
    expect(resumed.stabilityRetriedSourceStates).toEqual([first.sourceStateSha256]);
    expect(resumed.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ stabilityRetryOf: first.executionId }),
    ]));
    const repeatedFailure = await restarted.runCommand(commandInput(session.sessionId, 'test')) as any;
    await expect(restarted.runCommand({
      ...commandInput(session.sessionId, 'test'),
      stabilityRetryOf: repeatedFailure.executionId,
    })).rejects.toThrow('当前源码状态已执行过一次 test 稳定性复验');
    await restarted.dispose();

    const ledgerPath = path.join(stateRoot, `${session.sessionId}.json`);
    const forgedLedger = JSON.parse(await readFile(ledgerPath, 'utf8')) as any;
    const linkedExecution = forgedLedger.commandExecutions.find((item: any) => item.stabilityRetryOf);
    linkedExecution.stabilityRetrySourceStateSha256 = 'f'.repeat(64);
    await writeFile(ledgerPath, `${JSON.stringify(forgedLedger, null, 2)}\n`, 'utf8');
    const forged = await createDevelopmentManager({ stateRoot });
    expect(await forged.listSessions()).toEqual([]);
    await forged.dispose();
  }, 15_000);

  it('finalizes with prior passing evidence only after the worktree returns to the exact same state', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-evidence-reuse-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-evidence-reuse-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'value.mjs'), 'export const value = 1;\n', 'utf8');
    await writeFile(path.join(root, 'test.mjs'), "import { value } from './src/value.mjs'; if (value !== 2) process.exit(1);\n", 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node test.mjs' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/value.mjs', 'test.mjs', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task: '调整应用数值为二' }) as any;
    const stateA = await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'state-a',
      path: 'src/value.mjs',
      oldText: 'value = 1',
      newText: 'value = 2',
    }) as any;
    const passed = await manager.runCommand(commandInput(session.sessionId, 'test')) as any;
    await manager.runCommand(commandInput(session.sessionId, 'git-diff-check'));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await manager.submitReview({
      sessionId: session.sessionId,
      reviewId: 'state-a-review',
      agentId: 'AG-REVIEW',
      modelId: 'local-test-model',
      summary: 'FINDINGS:H0/M0/L0; GATE:PASS; exact state reviewed',
    });
    await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'state-b',
      path: 'src/value.mjs',
      oldText: 'value = 2',
      newText: 'value = 3',
    });
    expect(await manager.runCommand(commandInput(session.sessionId, 'test')))
      .toMatchObject({ status: 'failed' });
    const returned = await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'return-state-a',
      path: 'src/value.mjs',
      oldText: 'value = 3',
      newText: 'value = 2',
    }) as any;
    expect(returned.session.changeSetCount).toBe(stateA.session.changeSetCount + 2);
    const finalized = await manager.finalize({ sessionId: session.sessionId }) as any;
    expect(finalized).toMatchObject({ ready: true, missingOrFailed: [], reviewBlockers: [] });
    expect(finalized.session.final.reviewPassed).toBe(true);
    expect(passed.sourceStateSha256).toBe((await manager.snapshot({ sessionId: session.sessionId }) as any).worktreeStateSha256);
    const rerun = await manager.runCommand(commandInput(session.sessionId, 'test')) as any;
    expect(rerun.session.final).toBeNull();
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      reviewBlockers: ['required-independent-review-predates-verification'],
    });
    await approveReview(manager, session.sessionId, 'state-a-review-after-rerun');
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({ ready: true });
    await manager.dispose();
  }, 15_000);

  it('downgrades a legacy final ledger to resume and reruns policy-stale gates', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-policy-version-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-policy-version-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'value.mjs'), 'export const value = 1;\n', 'utf8');
    await writeFile(path.join(root, 'test.mjs'), "import { value } from './src/value.mjs'; if (value !== 2) process.exit(1);\n", 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node test.mjs' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/value.mjs', 'test.mjs', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const task = '调整应用数值为二并完成回归验证';
    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task }) as any;
    await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'policy-version-change',
      path: 'src/value.mjs',
      oldText: 'value = 1',
      newText: 'value = 2',
    });
    const command = await manager.runCommand(commandInput(session.sessionId, 'test')) as any;
    const review = await approveReview(manager, session.sessionId, 'policy-version-review') as any;
    const finalized = await manager.finalize({ sessionId: session.sessionId }) as any;
    expect(command.policyVersion).toBe(session.evidencePolicy.command);
    expect(review.receipt.policyVersion).toBe(session.evidencePolicy.independentReview);
    expect(finalized).toMatchObject({ ready: true, missingOrFailed: [], reviewBlockers: [] });
    expect(finalized.session.final.evidencePolicySha256).toBe(session.evidencePolicy.policySha256);
    await manager.dispose();

    const ledgerPath = path.join(stateRoot, `${session.sessionId}.json`);
    const legacy = JSON.parse(await readFile(ledgerPath, 'utf8')) as any;
    for (const entry of legacy.commands) delete entry.policyVersion;
    for (const entry of legacy.reviews) delete entry.policyVersion;
    delete legacy.final.evidencePolicySha256;
    await writeFile(ledgerPath, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');

    const restarted = await createDevelopmentManager({ stateRoot });
    expect(await restarted.preflightSession({ root, task })).toMatchObject({
      mode: 'resume',
      resume: { sessionId: session.sessionId },
    });
    const resumed = await restarted.resumeSession({ sessionId: session.sessionId, root, task }) as any;
    expect(resumed.final).toBeNull();
    expect(await restarted.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      missingOrFailed: ['test'],
      reviewBlockers: ['required-independent-review-policy-stale'],
    });
    await restarted.runCommand(commandInput(session.sessionId, 'test'));
    await approveReview(restarted, session.sessionId, 'policy-version-review-refreshed');
    expect(await restarted.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: true,
      missingOrFailed: [],
      reviewBlockers: [],
    });
    await restarted.dispose();

    const reopened = await createDevelopmentManager({ stateRoot });
    expect(await reopened.preflightSession({ root, task })).toMatchObject({ mode: 'reopen' });
    await reopened.dispose();
  }, 15_000);

  it('terminates the complete managed command tree on timeout and records a diagnostic', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-timeout-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-timeout-state-'));
    temporaryRoots.push(root, stateRoot);
    await writeFile(path.join(root, 'hang.mjs'), [
      `import { spawn } from 'node:child_process';`,
      `import { writeFileSync } from 'node:fs';`,
      `const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });`,
      `writeFileSync('command-pids.json', JSON.stringify([process.pid, child.pid]));`,
      `setInterval(() => {}, 1000);`,
      '',
    ].join('\n'), 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node hang.mjs' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'hang.mjs', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot, projectCommandTimeoutMs: 2_500 });
    const session = await manager.createSession({ root, task: '验证固定命令超时清理' }) as any;
    const result = await manager.runCommand(commandInput(session.sessionId, 'test')) as any;
    const pids = JSON.parse(await readFile(path.join(root, 'command-pids.json'), 'utf8')) as number[];
    try {
      expect(result).toMatchObject({ status: 'failed', exitCode: 1, timedOut: true });
      expect(result.session.commands.at(-1)).toMatchObject({ commandId: 'test', timedOut: true });
      expect(result.outputTail).toContain('已终止本次受管进程树');
      await expectProcessesToExit(pids);
      const ledger = await readFile(path.join(stateRoot, `${session.sessionId}.json`), 'utf8');
      expect(ledger).toContain('"timedOut": true');
    } finally {
      for (const pid of pids) forceKillProcess(pid);
      await manager.dispose();
    }
  }, 15_000);

  it('applies an exact single-match replacement and rolls back unsafe output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-replace-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-replace-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    const target = path.join(root, 'src', 'value.mjs');
    await writeFile(target, 'export const value = 1;\r\nexport const label = "same same";\r\n', 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/value.mjs']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task: 'replace value exactly' }) as any;
    const applied = await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'replace-1',
      path: 'src/value.mjs',
      oldText: 'export const value = 1;\nexport const label',
      newText: 'export const value = 2;\nexport const label',
    }) as any;
    expect(applied).toMatchObject({ ok: true, fileCount: 1 });
    expect(await readFile(target, 'utf8')).toContain('value = 2;\r\nexport const label');

    await expect(manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'replace-ambiguous',
      path: 'src/value.mjs',
      oldText: 'same',
      newText: 'different',
    })).rejects.toThrow('命中 2 次');
    expect(await readFile(target, 'utf8')).toContain('same same');

    await expect(manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'replace-unsafe',
      path: 'src/value.mjs',
      oldText: 'export const value = 2;',
      newText: 'export const value = 3;   ',
    })).rejects.toThrow('已完整回滚');
    expect(await readFile(target, 'utf8')).toContain('value = 2');

    const ledger = await readFile(path.join(stateRoot, `${session.sessionId}.json`), 'utf8');
    expect(ledger).not.toContain('src/value.mjs');
    expect(ledger).not.toContain('value = 2');
  }, 30_000);

  it('rejects HTML edits that collapse head tags or break the existing void style', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-html-quality-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-html-quality-state-'));
    temporaryRoots.push(root, stateRoot);
    const target = path.join(root, 'index.html');
    const original = [
      '<!doctype html>',
      '<html>',
      '  <head>',
      '    <meta charset="UTF-8" />',
      '    <meta name="viewport" content="width=device-width" />',
      '    <link rel="stylesheet" href="/style.css" />',
      '  </head>',
      '  <body></body>',
      '</html>',
      '',
    ].join('\n');
    const malformed = original.replace(
      '    <link rel="stylesheet" href="/style.css" />',
      '    <link rel="stylesheet" href="/style.css" />    <link rel="icon" href="data:,">',
    );
    expect(findDevelopmentSourceQualityProblem('index.html', original, malformed)).toContain('void-element');
    await writeFile(target, original, 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'index.html']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task: '修复 favicon 404' }) as any;
    await expect(manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'malformed-favicon',
      path: 'index.html',
      oldText: '    <link rel="stylesheet" href="/style.css" />',
      newText: '    <link rel="stylesheet" href="/style.css" />    <link rel="icon" href="data:,">',
    })).rejects.toThrow('源码质量门拒绝');
    expect(await readFile(target, 'utf8')).toBe(original);

    const malformedPatch = [
      'diff --git a/index.html b/index.html',
      '--- a/index.html',
      '+++ b/index.html',
      '@@ -1,10 +1,10 @@',
      ' <!doctype html>',
      ' <html>',
      '   <head>',
      '     <meta charset="UTF-8" />',
      '     <meta name="viewport" content="width=device-width" />',
      '-    <link rel="stylesheet" href="/style.css" />',
      '+    <link rel="stylesheet" href="/style.css" />    <link rel="icon" href="data:,">',
      '   </head>',
      '   <body></body>',
      ' </html>',
      '',
    ].join('\n');
    await expect(manager.applyChangeSet({
      sessionId: session.sessionId,
      changeSetId: 'malformed-favicon-patch',
      patch: malformedPatch,
    })).rejects.toThrow('源码质量门拒绝');
    expect(await readFile(target, 'utf8')).toBe(original);

    await expect(manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'formatted-favicon',
      path: 'index.html',
      oldText: '    <link rel="stylesheet" href="/style.css" />',
      newText: '    <link rel="stylesheet" href="/style.css" />\n    <link rel="icon" href="data:," />',
    })).resolves.toMatchObject({ ok: true, fileCount: 1 });
    await expect(manager.runCommand(commandInput(session.sessionId, 'git-diff-check')))
      .resolves.toMatchObject({ status: 'passed', policyVersion: 2 });
  }, 30_000);

  it('rejects test edits that add repeated or missing block separators', () => {
    const original = [
      "test('first', () => {",
      '  expect(true).toBe(true);',
      '});',
      '',
      "test('second', () => {",
      '  expect(true).toBe(true);',
      '});',
      '',
    ].join('\n');
    const malformed = original.replace(
      "\ntest('second'",
      "\n\ntest('middle', () => {});\ntest('second'",
    );
    const problem = findDevelopmentSourceQualityProblem('src/example.test.ts', original, malformed);
    expect(problem).toContain('连续空行');
    expect(problem).toContain('直接粘连');
    expect(findDevelopmentSourceQualityProblem(
      'src/example.test.ts',
      original,
      original.replace("\ntest('second'", "\ntest('middle', () => {});\n\ntest('second'"),
    )).toBe('');

    const legacyAdjacency = original.replace(
      "\ntest('second'",
      "\ntest('legacy', () => {});\n\ntest('second'",
    );
    expect(findDevelopmentSourceQualityProblem(
      'src/example.test.ts',
      legacyAdjacency,
      legacyAdjacency.replace('expect(true)', 'expect(Boolean(true))'),
    )).toBe('');
  });

  it('rejects a newly added Markdown statement that duplicates existing prose', async () => {
    const original = [
      '# Guide',
      '',
      'The workflow is bounded.',
      '',
    ].join('\n');
    const once = original.replace(
      'The workflow is bounded.',
      'The workflow is bounded. DeepSeek actions use JSON Output while review keeps the text Gate.',
    );
    expect(findDevelopmentSourceQualityProblem('README.md', original, once)).toBe('');
    const duplicated = `${once}Quick start: DeepSeek actions use JSON Output while review keeps the text Gate.\n`;
    expect(findDevelopmentSourceQualityProblem('README.md', once, duplicated))
      .toContain('重复已有正文');
    expect(findDevelopmentSourceQualityProblem(
      'README.md',
      original,
      `${original}Quick start: a distinct operational note that does not duplicate the existing guide.\n`,
    )).toBe('');

    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-markdown-quality-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-markdown-quality-state-'));
    temporaryRoots.push(root, stateRoot);
    const target = path.join(root, 'README.md');
    await writeFile(target, original, 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'README.md']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task: 'add one bounded README note' }) as any;
    await expect(manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'markdown-once',
      path: 'README.md',
      oldText: 'The workflow is bounded.',
      newText: 'The workflow is bounded. DeepSeek actions use JSON Output while review keeps the text Gate.',
    })).resolves.toMatchObject({ ok: true, fileCount: 1 });
    await expect(manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'markdown-duplicate',
      path: 'README.md',
      oldText: 'DeepSeek actions use JSON Output while review keeps the text Gate.\n',
      newText: [
        'DeepSeek actions use JSON Output while review keeps the text Gate.',
        'Quick start: DeepSeek actions use JSON Output while review keeps the text Gate.',
        '',
      ].join('\n'),
    })).rejects.toThrow('源码质量门拒绝');
    expect(await readFile(target, 'utf8')).toBe(once);

    const repeated = 'DeepSeek actions use JSON Output while review keeps the text Gate.';
    const duplicateNewFilePatch = [
      'diff --git a/notes.md b/notes.md',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/notes.md',
      '@@ -0,0 +1,3 @@',
      '+# Notes',
      `+Quick start: ${repeated}`,
      `+${repeated}`,
      '',
    ].join('\n');
    expect(findDevelopmentSourceQualityProblem('notes.md', '', [
      '# Notes',
      `Quick start: ${repeated}`,
      repeated,
      '',
    ].join('\n'))).toContain('重复已有正文');
    await expect(manager.applyChangeSet({
      sessionId: session.sessionId,
      changeSetId: 'markdown-new-file-duplicate',
      patch: duplicateNewFilePatch,
    })).rejects.toThrow('源码质量门拒绝');
    await expect(stat(path.join(root, 'notes.md'))).rejects.toThrow();
  });

  it('applies two to four exact text edits as one redacted atomic change set', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-batch-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-batch-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    const first = path.join(root, 'src', 'first.mjs');
    const second = path.join(root, 'src', 'second.mjs');
    await writeFile(first, 'export const value = 1;\n', 'utf8');
    await writeFile(second, 'export const label = "before";\n', 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/first.mjs', 'src/second.mjs']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const session = await manager.createSession({ root, task: 'bounded atomic batch' }) as any;
    const applied = await manager.applyTextReplacementBatch({
      sessionId: session.sessionId,
      changeSetId: 'batch-1',
      replacements: [
        { path: 'src/first.mjs', oldText: 'value = 1', newText: 'value = 2' },
        { path: 'src/first.mjs', oldText: 'value = 2', newText: 'value = 3' },
        { path: 'src/second.mjs', oldText: 'label = "before"', newText: 'label = "after"' },
      ],
    }) as any;
    expect(applied).toMatchObject({ ok: true, fileCount: 2, session: { changeSetCount: 1 } });
    expect(await readFile(first, 'utf8')).toContain('value = 3');
    expect(await readFile(second, 'utf8')).toContain('label = "after"');

    await expect(manager.applyTextReplacementBatch({
      sessionId: session.sessionId,
      changeSetId: 'batch-invalid',
      replacements: [
        { path: 'src/first.mjs', oldText: 'value = 3', newText: 'value = 4' },
        { path: 'src/second.mjs', oldText: 'missing', newText: 'never-written' },
      ],
    })).rejects.toThrow('命中 0 次');
    expect(await readFile(first, 'utf8')).toContain('value = 3');
    expect(await readFile(second, 'utf8')).toContain('label = "after"');

    await expect(manager.applyTextReplacementBatch({
      sessionId: session.sessionId,
      changeSetId: 'batch-unsafe',
      replacements: [
        { path: 'src/first.mjs', oldText: 'value = 3', newText: 'value = 4' },
        { path: 'src/second.mjs', oldText: 'label = "after";', newText: 'label = "bad";   ' },
      ],
    })).rejects.toThrow('已完整回滚');
    expect(await readFile(first, 'utf8')).toContain('value = 3');
    expect(await readFile(second, 'utf8')).toContain('label = "after"');
    await expect(manager.applyTextReplacementBatch({
      sessionId: session.sessionId,
      changeSetId: 'batch-too-small',
      replacements: [{ path: 'src/first.mjs', oldText: 'value = 3', newText: 'value = 4' }],
    })).rejects.toThrow('2-4');
    await expect(manager.applyTextReplacementBatch({
      sessionId: session.sessionId,
      changeSetId: 'batch-too-large',
      replacements: Array.from({ length: 5 }, () => ({ path: 'src/first.mjs', oldText: 'value = 3', newText: 'value = 4' })),
    })).rejects.toThrow('2-4');

    const ledger = await readFile(path.join(stateRoot, `${session.sessionId}.json`), 'utf8');
    const changeSets = JSON.parse(ledger).changeSets;
    expect(changeSets).toHaveLength(1);
    expect(changeSets[0]).toMatchObject({ operation: 'replace-batch', fileCount: 2 });
    expect(ledger).not.toContain('src/first.mjs');
    expect(ledger).not.toContain('src/second.mjs');
    expect(ledger).not.toContain('value = 3');
    expect(ledger).not.toContain('label = "after"');
  }, 30_000);

  it('rolls back every file when replacement ledger persistence fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-batch-ledger-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-batch-ledger-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    const first = path.join(root, 'src', 'first.mjs');
    const second = path.join(root, 'src', 'second.mjs');
    const firstOriginal = 'export const first = 1;\n';
    const secondOriginal = 'export const second = 1;\n';
    await writeFile(first, firstOriginal, 'utf8');
    await writeFile(second, secondOriginal, 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/first.mjs', 'src/second.mjs']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({
      stateRoot,
      persistReplacementSession: async () => { throw new Error('injected ledger failure'); },
    });
    const session = await manager.createSession({ root, task: 'rollback failed ledger persistence' }) as any;
    await expect(manager.applyTextReplacementBatch({
      sessionId: session.sessionId,
      changeSetId: 'batch-ledger-failure',
      replacements: [
        { path: 'src/first.mjs', oldText: 'first = 1', newText: 'first = 2' },
        { path: 'src/second.mjs', oldText: 'second = 1', newText: 'second = 2' },
      ],
    })).rejects.toThrow('事务失败，已完整回滚');
    expect(await readFile(first, 'utf8')).toBe(firstOriginal);
    expect(await readFile(second, 'utf8')).toBe(secondOriginal);
    expect(JSON.parse(await readFile(path.join(stateRoot, `${session.sessionId}.json`), 'utf8')).changeSets).toEqual([]);
  }, 30_000);

  it('keeps an explicit test-change requirement in the server final gate', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-acceptance-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-acceptance-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'app.mjs'), 'export const value = 1;\n', 'utf8');
    await writeFile(path.join(root, 'src', 'app.test.mjs'), 'export const expected = 1;\n', 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/app.mjs', 'src/app.test.mjs']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    const manager = await createDevelopmentManager({ stateRoot });
    const task = '修改实现，并在现有测试中加入对应断言';
    const session = await manager.createSession({ root, task }) as any;
    await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'source-only',
      path: 'src/app.mjs',
      oldText: 'value = 1',
      newText: 'value = 2',
    });
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      acceptanceBlockers: ['required-test-change-missing'],
      reviewBlockers: ['required-independent-review-missing'],
    });

    await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'test-change',
      path: 'src/app.test.mjs',
      oldText: 'expected = 1',
      newText: 'expected = 2',
    });
    await approveReview(manager, session.sessionId, 'review-source-and-test');
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: true,
      acceptanceBlockers: [],
      reviewBlockers: [],
    });
    const ledger = await readFile(path.join(stateRoot, `${session.sessionId}.json`), 'utf8');
    expect(ledger).not.toContain(task);
    expect(ledger).toContain('"testChange": true');
  }, 30_000);

  it('requires fresh redacted browser evidence before a frontend task can finalize', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-browser-root-'));
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'agenthub-dev-browser-state-'));
    temporaryRoots.push(root, stateRoot);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'app.mjs'), 'export const label = "before";\n', 'utf8');
    await writeFile(path.join(root, 'test.mjs'), 'process.exit(0);\n', 'utf8');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node test.mjs', preview: 'node preview.mjs' } }), 'utf8');
    git(root, ['init']);
    git(root, ['add', '--', 'src/app.mjs', 'test.mjs', 'package.json']);
    git(root, ['-c', 'user.name=AgentHub Test', '-c', 'user.email=agenthub@example.invalid', 'commit', '-m', 'fixture']);

    let acceptanceStatus: 'passed' | 'failed' = 'failed';
    let acceptanceRunCount = 0;
    let assertFinalRevokedFor = '';
    const acceptanceRuntime = {
      async run(input: any) {
        acceptanceRunCount += 1;
        expect(input.root).toBe(root);
        expect(input.availableScripts).toEqual(['preview']);
        if (assertFinalRevokedFor) {
          const inFlightLedger = JSON.parse(await readFile(path.join(stateRoot, `${assertFinalRevokedFor}.json`), 'utf8')) as any;
          expect(inFlightLedger.final).toBeNull();
          assertFinalRevokedFor = '';
        }
        const startedAt = new Date().toISOString();
        const finishedAt = new Date(Date.now() + 1).toISOString();
        const normalizedPlan = normalizeDevelopmentAcceptancePlan(input.plan, input.availableScripts);
        return {
          status: acceptanceStatus,
          scriptId: 'preview',
          planSha256: createHash('sha256').update(JSON.stringify(normalizedPlan)).digest('hex'),
          evidenceSha256: 'b'.repeat(64),
          startedAt,
          finishedAt,
          durationMs: 1,
          actionCount: 1,
          viewportCount: 2,
          consoleErrorCount: 0,
          consoleWarningCount: 0,
          failedRequestCount: 0,
          failureCount: acceptanceStatus === 'passed' ? 0 : 1,
          screenshotSha256: ['c'.repeat(64), 'd'.repeat(64)],
          viewports: [],
        };
      },
      async dispose() {},
    };
    const manager = await createDevelopmentManager({ stateRoot, acceptanceRuntime });
    const session = await manager.createSession({ root, task: '优化前端响应式页面' }) as any;
    expect(session.requirements.browserAcceptance).toBe(true);
    expect((await manager.snapshot({ sessionId: session.sessionId }) as any).acceptanceScripts).toEqual(['preview']);
    await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'browser-source-change',
      path: 'src/app.mjs',
      oldText: 'before',
      newText: 'after',
    });
    await manager.runCommand(commandInput(session.sessionId, 'test'));
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      acceptanceBlockers: ['required-browser-acceptance-missing'],
    });
    const failedAcceptanceInput = {
      sessionId: session.sessionId,
      acceptanceId: 'browser-acceptance-failed',
      plan: { scriptId: 'preview', route: '/PRIVATE_ROUTE_CANARY', actions: [{ type: 'assert-text', text: 'PRIVATE_TEXT_CANARY' }] },
    };
    await manager.runBrowserAcceptance(failedAcceptanceInput);
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      acceptanceBlockers: ['required-browser-acceptance-failed'],
    });
    expect(await manager.runBrowserAcceptance(failedAcceptanceInput)).toMatchObject({
      acceptanceId: failedAcceptanceInput.acceptanceId,
      status: 'failed',
      recovered: true,
      viewports: [],
    });
    expect(acceptanceRunCount).toBe(1);
    acceptanceStatus = 'passed';
    const passedAcceptanceInput = {
      sessionId: session.sessionId,
      acceptanceId: 'browser-acceptance-passed',
      plan: { scriptId: 'preview', route: '/PRIVATE_ROUTE_CANARY', actions: [{ type: 'assert-text', text: 'PRIVATE_TEXT_CANARY' }] },
    };
    const accepted = await manager.runBrowserAcceptance(passedAcceptanceInput) as any;
    expect(accepted.status).toBe('passed');
    expect(accepted.policyVersion).toBe(session.evidencePolicy.browserAcceptance);
    expect(accepted.session.acceptances.at(-1)).toMatchObject({ acceptanceId: 'browser-acceptance-passed', status: 'passed' });
    const recoveredAcceptance = await manager.runBrowserAcceptance(passedAcceptanceInput) as any;
    expect(recoveredAcceptance).toMatchObject({
      acceptanceId: passedAcceptanceInput.acceptanceId,
      status: 'passed',
      recovered: true,
      viewports: [],
      session: { sessionId: session.sessionId },
    });
    expect(acceptanceRunCount).toBe(2);
    const restartedForAcceptanceRecovery = await createDevelopmentManager({ stateRoot, acceptanceRuntime });
    await restartedForAcceptanceRecovery.resumeSession({
      sessionId: session.sessionId,
      root,
      task: '优化前端响应式页面',
    });
    expect(await restartedForAcceptanceRecovery.runBrowserAcceptance(passedAcceptanceInput)).toMatchObject({
      acceptanceId: passedAcceptanceInput.acceptanceId,
      status: 'passed',
      recovered: true,
      viewports: [],
    });
    expect(acceptanceRunCount).toBe(2);
    await restartedForAcceptanceRecovery.dispose();
    await expect(manager.runBrowserAcceptance({
      ...passedAcceptanceInput,
      plan: { ...passedAcceptanceInput.plan, route: '/contract-drift' },
    })).rejects.toThrow('恢复合同不匹配');
    expect(acceptanceRunCount).toBe(2);
    const policyLedgerPath = path.join(stateRoot, `${session.sessionId}.json`);
    const policyStaleLedger = JSON.parse(await readFile(policyLedgerPath, 'utf8')) as any;
    policyStaleLedger.acceptances.at(-1).policyVersion += 1;
    await writeFile(policyLedgerPath, `${JSON.stringify(policyStaleLedger, null, 2)}\n`, 'utf8');
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      acceptanceBlockers: ['required-browser-acceptance-policy-stale'],
    });
    await manager.runBrowserAcceptance({
      sessionId: session.sessionId,
      acceptanceId: 'browser-acceptance-policy-refreshed',
      plan: { scriptId: 'preview', route: '/', actions: [{ type: 'assert-visible', selector: 'body' }] },
    });
    await approveReview(manager, session.sessionId, 'review-browser-passed');
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: true,
      acceptanceBlockers: [],
      reviewBlockers: [],
    });
    assertFinalRevokedFor = session.sessionId;
    await manager.runBrowserAcceptance({
      sessionId: session.sessionId,
      acceptanceId: 'browser-acceptance-after-final',
      plan: { scriptId: 'preview', route: '/', actions: [{ type: 'assert-visible', selector: 'body' }] },
    });
    expect(assertFinalRevokedFor).toBe('');
    await approveReview(manager, session.sessionId, 'review-browser-after-final');
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({ ready: true });
    await manager.applyTextReplacement({
      sessionId: session.sessionId,
      changeSetId: 'browser-source-change-after-acceptance',
      path: 'src/app.mjs',
      oldText: 'after',
      newText: 'after-again',
    });
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      missingOrFailed: ['test'],
      acceptanceBlockers: ['required-browser-acceptance-stale'],
      reviewBlockers: ['required-independent-review-stale'],
    });
    await manager.runCommand(commandInput(session.sessionId, 'test'));
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      acceptanceBlockers: ['required-browser-acceptance-stale'],
      reviewBlockers: [
        'required-independent-review-stale',
        'required-independent-review-predates-verification',
      ],
    });
    await manager.runBrowserAcceptance({
      sessionId: session.sessionId,
      acceptanceId: 'browser-acceptance-refreshed',
      plan: { scriptId: 'preview', route: '/', actions: [{ type: 'assert-visible', selector: 'body' }] },
    });
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: false,
      acceptanceBlockers: [],
      reviewBlockers: [
        'required-independent-review-stale',
        'required-independent-review-predates-verification',
      ],
    });
    await approveReview(manager, session.sessionId, 'review-browser-refreshed');
    expect(await manager.finalize({ sessionId: session.sessionId })).toMatchObject({
      ready: true,
      acceptanceBlockers: [],
      reviewBlockers: [],
    });
    const ledger = await readFile(path.join(stateRoot, `${session.sessionId}.json`), 'utf8');
    expect(ledger).not.toContain(root);
    expect(ledger).not.toContain('PRIVATE_ROUTE_CANARY');
    expect(ledger).not.toContain('PRIVATE_TEXT_CANARY');
    expect(ledger).toContain('"viewportCount": 2');
  }, 30_000);
});

function git(root: string, args: string[]) {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

function gitOutput(root: string, args: string[]) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

async function approveReview(manager: any, sessionId: string, reviewId: string) {
  return manager.submitReview({
    sessionId,
    reviewId,
    agentId: 'AG-REVIEW',
    modelId: 'deepseek-v4-pro',
    summary: 'FINDINGS:H0/M0/L0; GATE:PASS; PRIVATE_REVIEW_CANARY',
  });
}

async function expectProcessesToExit(pids: number[]) {
  for (let attempt = 0; attempt < 20 && pids.some(isProcessAlive); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(pids.filter(isProcessAlive)).toEqual([]);
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function forceKillProcess(pid: number) {
  if (!isProcessAlive(pid)) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {
    // The managed tree may exit between the liveness check and cleanup.
  }
}
