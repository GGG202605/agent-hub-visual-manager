import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  createDevelopmentAcceptanceRuntime,
  isDevelopmentAcceptanceScript,
  normalizeDevelopmentAcceptancePlan,
} from './developmentAcceptance.mjs';

const SESSION_SCHEMA = 'agenthub.development-session';
const SESSION_VERSION = 1;
const MAX_TASK_CHARS = 12_000;
const MAX_PATCH_BYTES = 256 * 1024;
const MAX_REPLACEMENT_BYTES = 32 * 1024;
const MAX_REPLACEMENT_BATCH = 4;
const MAX_REPLACED_FILE_BYTES = 512 * 1024;
const MAX_READ_BYTES = 768 * 1024;
const MAX_PROCESS_BYTES = 2 * 1024 * 1024;
const MAX_PROGRESS_TRANSITIONS = 100;
const DEFAULT_PROJECT_COMMAND_TIMEOUT_MS = 15 * 60_000;
const MAX_TEST_STABILITY_RETRY_DURATION_MS = 120_000;
const DEVELOPMENT_MODEL_BUDGET = Object.freeze({
  maxCalls: 40,
  maxInputBytes: 2_000_000,
  maxInputBytesPerCall: 1_000_000,
  maxOutputTokens: 64_000,
  maxOutputTokensPerCall: 2_000,
});
const MAX_DEVELOPMENT_RATE_MICROS_PER_MILLION_TOKENS = 1_000_000_000;
const MAX_DEVELOPMENT_COST_MICROS = 1_000_000_000;
const LEGACY_DEVELOPMENT_COST_POLICY = Object.freeze({
  currency: 'CNY',
  inputMicrosPerMillionTokens: 1_000_000,
  outputMicrosPerMillionTokens: 2_000_000,
  maxCostMicros: 50_000_000,
});
const DEVELOPMENT_EVIDENCE_POLICY = Object.freeze({
  command: 2,
  browserAcceptance: 1,
  independentReview: 2,
  requirements: 2,
  finalization: 2,
});
const DEVELOPMENT_EVIDENCE_POLICY_SHA256 = sha256(JSON.stringify(DEVELOPMENT_EVIDENCE_POLICY));
const SESSION_ID = /^dev-[a-f0-9-]{36}$/;
const MODEL_RESERVATION_ID = /^model-[a-f0-9-]{36}$/;
const DEVELOPMENT_MODEL_FAILURE_RETRYABILITY = new Map([
  ['UPSTREAM_TRANSPORT', true],
  ['UPSTREAM_TEMPORARY', true],
  ['STAGE_TIMEOUT', true],
  ['CANCELLED', false],
  ['PROVIDER_CALL_REJECTED', false],
]);
const SAFE_COMMANDS = new Set(['test', 'build', 'lint', 'typecheck', 'check', 'git-diff-check']);
const SAFE_PHASES = new Set(['ready', 'analyzing', 'editing', 'verifying', 'reviewing', 'failed']);
const BLOCKED_PATH_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.agenthub-development',
]);

export const LOCAL_AUTONOMOUS_PRESET = Object.freeze({
  schema: 'agenthub.development-preset',
  schemaVersion: 1,
  id: 'local-autonomous-v1',
  label: '本地自主开发',
  isDefault: true,
  authorization: 'one-user-start-per-development-session',
  scope: Object.freeze({
    roots: 'one-explicit-clean-local-git-worktree',
    files: 'read-create-update-delete-within-root',
    commands: Object.freeze(['test', 'build', 'lint', 'typecheck', 'check', 'git-diff-check']),
    browser: 'localhost-only-autonomous-acceptance',
    providers: 'user-configured-memory-only-credentials',
    models: 'deepseek-flash-default-pro-quality-and-retry-escalation',
    modelBudget: '40-calls-2000000-reserved-input-bytes-64000-reserved-output-tokens-user-confirmed-cny-hard-limit',
    agents: 'dynamic-2-4-5-sequential-role-pipeline',
    git: Object.freeze(['status', 'diff', 'diff-check']),
  }),
  denied: Object.freeze([
    'arbitrary-shell',
    'git-stage',
    'git-commit-without-final-user-decision',
    'git-push',
    'remote-or-production-write',
    'outside-root-file-api',
    'secret-or-provider-body-persistence',
  ]),
});

const COMPLEX_MARKERS = [
  /(?:架构|重构|迁移|权限|认证|数据库|并发|事务|协议|api|server|backend|跨模块)/i,
  /(?:恢复(?:机制|流程|会话|现场|检查点|事务|数据|备份|策略)|(?:崩溃|故障|灾难|中断|断点|会话|事务|数据|备份).{0,8}恢复)/i,
  /(?:安全(?:审查|边界|漏洞|策略|权限|模型)|威胁建模)/i,
  /\b(?:architecture|refactor|migration|security|auth|database|concurrency|transaction|recovery|protocol)\b/i,
];
const SIMPLE_MARKERS = [/(?:文案|拼写|颜色|间距|标题|提示语|rename|copy|typo|spacing|label)/i];
const SECURITY_MARKERS = [
  /(?:权限|认证|授权|凭据|密钥|令牌|会话安全|安全(?:审查|边界|漏洞|策略|权限|模型)|威胁建模)/i,
  /(?:\bsecurity\b|\bauth(?:entication|orization)?\b|\bcredentials?\b|\bsecrets?\b|\b(?:access|session|api)[ -]?tokens?\b|\bpermissions?\b|\bprivileges?\b|\bthreat\b|\bvulnerabilit(?:y|ies)\b)/i,
];

export function planDevelopmentAgents(task) {
  const text = String(task ?? '').trim();
  const explicitPaths = text.match(/[a-zA-Z0-9_.-]+\/(?:[a-zA-Z0-9_.\/-]+)/g) ?? [];
  const complex = COMPLEX_MARKERS.some((pattern) => pattern.test(text)) || explicitPaths.length >= 4;
  const securitySensitive = SECURITY_MARKERS.some((pattern) => pattern.test(text));
  const simple = text.length > 0 && text.length <= 180 && explicitPaths.length <= 1
    && SIMPLE_MARKERS.some((pattern) => pattern.test(text));
  if (securitySensitive) {
    return {
      size: 5,
      reasonCode: 'security-sensitive-cross-cutting',
      agents: ['AG-COORD', 'PRO', 'AG-DEV', 'AG-SEC', 'AG-REVIEW'],
    };
  }
  if (complex) {
    return {
      size: 4,
      reasonCode: 'complex-cross-cutting',
      agents: ['AG-COORD', 'PRO', 'AG-DEV', 'AG-REVIEW'],
    };
  }
  if (simple) {
    return { size: 2, reasonCode: 'focused-low-risk', agents: ['AG-DEV', 'AG-REVIEW'] };
  }
  return { size: 2, reasonCode: 'bounded-standard', agents: ['AG-DEV', 'AG-REVIEW'] };
}

export function planDevelopmentRequirements(task) {
  const text = String(task ?? '').replace(/\s+/g, ' ').trim();
  return {
    testChange: /(?:新增|补充|加入|添加|修改|更新|完善)(?:(?!确保|运行|执行|通过).){0,12}(?:测试|断言)|(?:测试|断言)(?:(?!确保|运行|执行|通过).){0,20}(?:新增|补充|加入|添加|修改|更新|完善)/i.test(text),
    browserAcceptance: requiresBrowserAcceptance(text),
  };
}

/** Preserve an existing HTML file's line-oriented head layout and void-element convention. */
export function findDevelopmentSourceQualityProblem(relativePath, before, after) {
  const sourcePath = String(relativePath ?? '');
  if (typeof before !== 'string' || typeof after !== 'string' || before === after) return '';
  if (isMarkdownPath(sourcePath)) return findAddedMarkdownDuplicate(before, after);
  if (!before) return '';
  if (isJavaScriptTestPath(sourcePath)) {
    const original = before.replace(/\r\n/g, '\n');
    const updated = after.replace(/\r\n/g, '\n');
    const problems = [];
    const countRepeatedBlankLines = (value) => (value.match(/(?:\n[ \t]*){3,}/g) ?? []).length;
    if (countRepeatedBlankLines(updated) > countRepeatedBlankLines(original)) {
      problems.push('新增测试块之间出现连续空行，必须沿用单个空行分隔');
    }
    const originalUsesSeparatedBlocks = /\}\);[ \t]*\n[ \t]*\n[ \t]*(?:test|it|describe)\(/.test(original);
    const countAdjacentBlocks = (value) => (value.match(/\}\);[ \t]*\n[ \t]*(?:test|it|describe)\(/g) ?? []).length;
    if (originalUsesSeparatedBlocks && countAdjacentBlocks(updated) > countAdjacentBlocks(original)) {
      problems.push('新增测试块与相邻 test/it/describe 直接粘连，必须保留一个空行');
    }
    return problems.join('；');
  }
  if (!/\.html$/i.test(sourcePath)) return '';
  const original = stripHtmlComments(before);
  const updated = stripHtmlComments(after);
  const originalVoidTags = htmlVoidTags(original);
  const selfClosingCount = originalVoidTags.filter(isSelfClosingHtmlTag).length;
  const plainCount = originalVoidTags.length - selfClosingCount;
  const expectedStyle = selfClosingCount >= 2 && plainCount === 0
    ? 'self-closing'
    : plainCount >= 2 && selfClosingCount === 0
      ? 'plain'
      : '';
  if (expectedStyle) {
    const inconsistent = htmlVoidTags(updated).some((tag) => (
      expectedStyle === 'self-closing' ? !isSelfClosingHtmlTag(tag) : isSelfClosingHtmlTag(tag)
    ));
    if (inconsistent) return `HTML void-element 未沿用既有 ${expectedStyle === 'self-closing' ? '/>' : '>'} 风格`;
  }
  const originalHeadVoidCounts = original.split(/\r?\n/).map(countHeadVoidTags);
  const lineOrientedHead = originalHeadVoidCounts.filter((count) => count === 1).length >= 2
    && originalHeadVoidCounts.every((count) => count <= 1);
  if (lineOrientedHead && updated.split(/\r?\n/).some((line) => countHeadVoidTags(line) > 1)) {
    return 'HTML <head> 内的 meta/link/base 必须各占独立一行，不得拼接相邻标签';
  }
  return '';
}

export function resolveDevelopmentStateRoot(explicitRoot = '') {
  return path.resolve(
    explicitRoot
      || process.env.AGENTHUB_DEVELOPMENT_STATE_DIR
      || path.join(os.homedir(), '.agenthub-visual-manager', 'development-sessions'),
  );
}

export async function createDevelopmentManager(options = {}) {
  const stateRoot = resolveDevelopmentStateRoot(options.stateRoot);
  const requireExplicitCostPolicy = options.requireExplicitCostPolicy === true;
  const projectCommandTimeoutMs = normalizeInternalTimeout(
    options.projectCommandTimeoutMs,
    DEFAULT_PROJECT_COMMAND_TIMEOUT_MS,
  );
  const persistReplacementSession = options.persistReplacementSession
    ?? ((record) => persistSession(stateRoot, record));
  await fsp.mkdir(stateRoot, { recursive: true });
  await removeStaleTempFiles(stateRoot);
  const roots = new Map();
  const acceptanceRuntime = options.acceptanceRuntime ?? createDevelopmentAcceptanceRuntime(options.acceptanceOptions);
  const sessionOperations = new Map();
  const modelAuthorizationSecret = randomBytes(32);

  function createModelAuthorizationToken(sessionId, reservationId) {
    return createHmac('sha256', modelAuthorizationSecret)
      .update(`agenthub.development-model:${sessionId}:${reservationId}`)
      .digest('hex');
  }

  async function readStoredSessions() {
    const records = [];
    for (const entry of await fsp.readdir(stateRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !SESSION_ID.test(entry.name.replace(/\.json$/, '')) || !entry.name.endsWith('.json')) continue;
      try {
        const record = normalizeStoredSession(JSON.parse(await fsp.readFile(path.join(stateRoot, entry.name), 'utf8')));
        if (record) records.push(record);
      } catch {
        // A corrupt ledger entry is ignored rather than trusted.
      }
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async function listSessions() {
    return (await readStoredSessions())
      .slice(0, 100)
      .map((record) => publicSession(record, roots.get(record.sessionId)));
  }

  async function inspectSessionStart(payload) {
    const task = normalizeDevelopmentTask(payload?.task);
    if (payload?.presetId !== undefined && payload.presetId !== LOCAL_AUTONOMOUS_PRESET.id) {
      throw httpError(400, '开发预设不受支持');
    }
    const root = await inspectGitRoot(payload?.root);
    const worktreeStateSha256 = await workingTreeStateSha256(root.path, root.status);
    const taskSha256 = sha256(task);
    const storedSessions = await readStoredSessions();
    const candidates = storedSessions.filter((record) => (
      record.rootFingerprint === root.fingerprint
      && record.baseHead === root.head
      && record.taskSha256 === taskSha256
    ));
    const resume = candidates.find((record) => resumeStateMatches(record, root, worktreeStateSha256)) ?? null;
    if (root.status && !resume) {
      if (candidates.length) throw httpError(409, '当前工作树与中断会话最后受控状态不一致，已拒绝自动恢复');
      throw httpError(409, '新开发会话只接受 clean Git 工作树；当前变更未匹配可安全恢复的中断会话');
    }
    return {
      task,
      root,
      resume,
      storedSessions,
      worktreeStateSha256,
      agentPlan: planDevelopmentAgents(task),
      requirements: planDevelopmentRequirements(task),
      projectInfo: await readProjectInfo(root.path),
    };
  }

  async function preflightSession(payload) {
    const inspected = await inspectSessionStart(payload);
    const mode = canReopenDevelopmentDelivery(inspected.resume, inspected.requirements)
      ? 'reopen'
      : inspected.resume
        ? 'resume'
        : 'create';
    return {
      ok: true,
      presetId: LOCAL_AUTONOMOUS_PRESET.id,
      mode,
      resume: inspected.resume ? {
        sessionId: inspected.resume.sessionId,
        phase: inspected.resume.phase,
        updatedAt: inspected.resume.updatedAt,
      } : null,
      rootName: inspected.root.name,
      branch: inspected.root.branch,
      agentPlan: inspected.agentPlan,
      requirements: inspected.requirements,
      scripts: inspected.projectInfo.scripts,
      acceptanceScripts: inspected.projectInfo.acceptanceScripts,
      packageManager: inspected.projectInfo.packageManager,
    };
  }

  async function createSession(payload) {
    const inspected = await inspectSessionStart(payload);
    const { task, root } = inspected;
    const costPolicy = payload?.costPolicy === undefined && !requireExplicitCostPolicy
      ? { ...LEGACY_DEVELOPMENT_COST_POLICY }
      : normalizeDevelopmentCostPolicy(payload?.costPolicy);
    const creationId = payload?.creationId === undefined
      ? ''
      : normalizeIdentifier(payload.creationId, 160, 'creationId');
    const existingCreation = creationId
      ? inspected.storedSessions.find((record) => record.creationId === creationId)
      : null;
    if (existingCreation) {
      const sameContract = existingCreation.rootFingerprint === root.fingerprint
        && existingCreation.baseHead === root.head
        && existingCreation.taskSha256 === sha256(task)
        && sameDevelopmentCostPolicy(existingCreation.costPolicy, costPolicy)
        && resumeStateMatches(existingCreation, root, inspected.worktreeStateSha256);
      if (!sameContract) throw httpError(409, 'creationId 已绑定其他开发创建合同或受控状态已漂移');
      roots.set(existingCreation.sessionId, root);
      return { ...publicSession(existingCreation, root), recovered: true };
    }
    if (inspected.resume) throw httpError(409, '存在可恢复的同任务开发会话；请使用预检返回的会话继续');
    const sessionId = `dev-${randomUUID()}`;
    const now = new Date().toISOString();
    const record = {
      schema: SESSION_SCHEMA,
      schemaVersion: SESSION_VERSION,
      sessionId,
      presetId: LOCAL_AUTONOMOUS_PRESET.id,
      ...(creationId ? { creationId } : {}),
      rootFingerprint: root.fingerprint,
      baseHead: root.head,
      taskSha256: sha256(task),
      taskChars: task.length,
      worktreeStateSha256: inspected.worktreeStateSha256,
      createdAt: now,
      updatedAt: now,
      phase: 'ready',
      agentPlan: inspected.agentPlan,
      requirements: inspected.requirements,
      costPolicy,
      changeSets: [],
      commands: [],
      commandExecutions: [],
      progressTransitions: [],
      acceptances: [],
      reviews: [],
      modelReservations: [],
      final: null,
    };
    roots.set(sessionId, root);
    await persistSession(stateRoot, record);
    return publicSession(record, root);
  }

  async function resumeSession(payload) {
    return runSessionOperation(payload?.sessionId, () => resumeSessionUnlocked(payload));
  }

  async function resumeSessionUnlocked(payload) {
    const sessionId = requireSessionId(payload?.sessionId);
    const task = normalizeDevelopmentTask(payload?.task);
    const record = await readSession(stateRoot, sessionId);
    if (sha256(task) !== record.taskSha256) throw httpError(409, '重新输入的任务与该开发会话不匹配');
    const root = await inspectGitRoot(payload?.root);
    if (root.fingerprint !== record.rootFingerprint) throw httpError(409, '所选 Git 工作区与该开发会话不匹配');
    if (root.head !== record.baseHead) throw httpError(409, '所选 Git 工作区 HEAD 已漂移，不能恢复旧开发会话');
    const worktreeStateSha256 = await workingTreeStateSha256(root.path, root.status);
    if (!resumeStateMatches(record, root, worktreeStateSha256)) {
      throw httpError(409, '当前工作树与开发会话最后受控状态不一致，已拒绝恢复');
    }
    const currentRequirements = planDevelopmentRequirements(task);
    if (!canReopenDevelopmentDelivery(record, currentRequirements)) record.final = null;
    record.requirements = currentRequirements;
    record.worktreeStateSha256 = worktreeStateSha256;
    roots.set(sessionId, root);
    await persistSession(stateRoot, record);
    return publicSession(record, root);
  }

  async function updateProgress(payload) {
    if (payload?.phase === 'failed') {
      return runSessionOperationAfterCurrent(payload?.sessionId, () => updateProgressUnlocked(payload));
    }
    return runSessionOperation(payload?.sessionId, () => updateProgressUnlocked(payload));
  }

  async function issueModelCall(payload) {
    return runSessionOperation(payload?.sessionId, () => issueModelCallUnlocked(payload));
  }

  async function issueModelCallUnlocked(payload) {
    const { record, root } = await boundSession(payload?.sessionId);
    const runId = normalizeIdentifier(payload?.runId, 160, 'runId');
    if (!runId.startsWith(`${record.sessionId}-`)) throw httpError(400, '开发模型 runId 未绑定当前会话');
    const agentId = typeof payload?.agentId === 'string' ? payload.agentId : '';
    if (!record.agentPlan.agents.includes(agentId)) throw httpError(400, '开发模型 Agent 不在当前动态编队');
    const maxOutputTokens = payload?.maxOutputTokens;
    if (
      !Number.isInteger(maxOutputTokens)
      || maxOutputTokens < 1
      || maxOutputTokens > DEVELOPMENT_MODEL_BUDGET.maxOutputTokensPerCall
    ) {
      throw httpError(400, `单次开发模型输出上限必须为 1-${DEVELOPMENT_MODEL_BUDGET.maxOutputTokensPerCall}`);
    }
    const inputBytes = payload?.inputBytes;
    if (
      !Number.isInteger(inputBytes)
      || inputBytes < 1
      || inputBytes > DEVELOPMENT_MODEL_BUDGET.maxInputBytesPerCall
    ) {
      throw httpError(400, `单次开发模型输入上限必须为 1-${DEVELOPMENT_MODEL_BUDGET.maxInputBytesPerCall} UTF-8 bytes`);
    }
    const inputSha256 = typeof payload?.inputSha256 === 'string' ? payload.inputSha256 : '';
    if (!/^[a-f0-9]{64}$/.test(inputSha256)) throw httpError(400, '开发模型输入摘要必须为 SHA-256');
    const modelRouteSha256 = typeof payload?.modelRouteSha256 === 'string' ? payload.modelRouteSha256 : '';
    if (!/^[a-f0-9]{64}$/.test(modelRouteSha256)) throw httpError(400, '开发模型路由摘要必须为 SHA-256');
    const providerReadinessSha256 = typeof payload?.providerReadinessSha256 === 'string'
      ? payload.providerReadinessSha256
      : '';
    if (!/^[a-f0-9]{64}$/.test(providerReadinessSha256)) {
      throw httpError(400, '开发模型 Provider 测试代际摘要必须为 SHA-256');
    }
    const retryOfReservationId = payload?.retryOfReservationId === undefined
      ? null
      : String(payload.retryOfReservationId);
    if (retryOfReservationId !== null && !MODEL_RESERVATION_ID.test(retryOfReservationId)) {
      throw httpError(400, '开发模型补发引用非法');
    }
    const runIdSha256 = sha256(runId);
    const sameRunReservations = record.modelReservations.filter((item) => item.runIdSha256 === runIdSha256);
    if (sameRunReservations.length) {
      if (sameRunReservations.length !== 1) throw httpError(409, '开发模型 runId 已存在冲突预留');
      const existing = sameRunReservations[0];
      if (
        existing.agentId !== agentId
        || existing.inputBytes !== inputBytes
        || existing.inputSha256 !== inputSha256
        || existing.modelRouteSha256 !== modelRouteSha256
        || existing.providerReadinessSha256 !== providerReadinessSha256
        || existing.maxOutputTokens !== maxOutputTokens
        || (existing.retryOfReservationId ?? null) !== retryOfReservationId
      ) {
        throw httpError(409, '同一开发模型 runId 的签发合同不可变');
      }
      if (existing.consumedAt) throw httpError(409, '开发模型 runId 已签发并启动');
      const authorizationToken = createModelAuthorizationToken(record.sessionId, existing.reservationId);
      if (!secureHashMatches(existing.tokenSha256, authorizationToken)) {
        throw httpError(409, '开发模型签发所属服务进程已结束，无法重放；请使用新 runId 继续');
      }
      return {
        authorization: {
          sessionId: record.sessionId,
          reservationId: existing.reservationId,
          authorizationToken,
        },
        session: publicSession(record, root),
      };
    }
    if (retryOfReservationId !== null) {
      const original = record.modelReservations.find((item) => item.reservationId === retryOfReservationId);
      if (
        !original
        || original.retryOfReservationId
        || !original.consumedAt
        || !original.failureAt
        || DEVELOPMENT_MODEL_FAILURE_RETRYABILITY.get(original.failureCode) !== true
      ) {
        throw httpError(409, '开发模型补发只允许引用一次已落账的瞬时失败');
      }
      if (
        original.agentId !== agentId
        || original.inputBytes !== inputBytes
        || original.inputSha256 !== inputSha256
        || original.modelRouteSha256 !== modelRouteSha256
        || original.providerReadinessSha256 !== providerReadinessSha256
        || original.maxOutputTokens !== maxOutputTokens
        || original.runIdSha256 === runIdSha256
      ) {
        throw httpError(409, '开发模型补发必须保持 Agent、输入、模型路由、Provider 测试代际、输出上限并使用新 runId');
      }
      if (record.modelReservations.some((item) => item.retryOfReservationId === retryOfReservationId)) {
        throw httpError(409, '开发模型瞬时失败已签发唯一一次补发');
      }
    }
    const usage = modelUsage(record);
    if (usage.reservedCalls >= usage.maxCalls) throw httpError(409, '开发会话模型调用次数硬预算已耗尽');
    if (usage.reservedInputBytes + inputBytes > usage.maxInputBytes) {
      throw httpError(409, '开发会话模型输入字节硬预算不足');
    }
    if (usage.reservedOutputTokens + maxOutputTokens > usage.maxOutputTokens) {
      throw httpError(409, '开发会话模型输出 token 硬预算不足');
    }
    const reservedCostMicros = developmentCostMicros(
      record.costPolicy,
      inputBytes,
      maxOutputTokens,
    );
    if (usage.chargedCostMicros + reservedCostMicros > usage.maxCostMicros) {
      throw httpError(409, '开发会话人民币费用硬预算不足，已在 Provider 前停止');
    }
    const reservationId = `model-${randomUUID()}`;
    const authorizationToken = createModelAuthorizationToken(record.sessionId, reservationId);
    const reservation = {
      reservationId,
      tokenSha256: sha256(authorizationToken),
      runIdSha256,
      agentId,
      inputBytes,
      inputSha256,
      modelRouteSha256,
      providerReadinessSha256,
      maxOutputTokens,
      reservedAt: new Date().toISOString(),
      consumedAt: null,
      observedInputTokens: null,
      observedOutputTokens: null,
      usageReportedAt: null,
      failureCode: null,
      failureAt: null,
      retryOfReservationId,
    };
    const previousUpdatedAt = record.updatedAt;
    const reservationIndex = record.modelReservations.length;
    record.modelReservations.push(reservation);
    record.updatedAt = reservation.reservedAt;
    try {
      await persistSession(stateRoot, record);
    } catch (error) {
      record.modelReservations.splice(reservationIndex, 1);
      record.updatedAt = previousUpdatedAt;
      throw error;
    }
    return {
      authorization: {
        sessionId: record.sessionId,
        reservationId: reservation.reservationId,
        authorizationToken,
      },
      session: publicSession(record, root),
    };
  }

  async function beginModelCall(payload) {
    const release = acquireSessionOperation(payload?.sessionId);
    try {
      const { record } = await boundSession(payload?.sessionId);
      const reservation = validateModelCallAuthorization(record, payload);
      const previousConsumedAt = reservation.consumedAt;
      const previousUpdatedAt = record.updatedAt;
      reservation.consumedAt = new Date().toISOString();
      record.updatedAt = reservation.consumedAt;
      try {
        await persistSession(stateRoot, record);
      } catch (error) {
        reservation.consumedAt = previousConsumedAt;
        record.updatedAt = previousUpdatedAt;
        throw error;
      }
      return {
        async recordUsage(usage) {
          const inputTokens = usage?.inputTokens;
          const outputTokens = usage?.outputTokens;
          if (
            !Number.isSafeInteger(inputTokens)
            || inputTokens < 0
            || inputTokens > reservation.inputBytes
            || !Number.isSafeInteger(outputTokens)
            || outputTokens < 0
            || outputTokens > reservation.maxOutputTokens
          ) {
            throw httpError(400, 'Provider usage 回执超出当前开发模型授权');
          }
          if (reservation.usageReportedAt) {
            if (reservation.observedInputTokens === inputTokens && reservation.observedOutputTokens === outputTokens) return;
            throw httpError(409, 'Provider usage 回执与已记录结果冲突');
          }
          const previousObservedInputTokens = reservation.observedInputTokens;
          const previousObservedOutputTokens = reservation.observedOutputTokens;
          const previousUsageReportedAt = reservation.usageReportedAt;
          const previousUpdatedAt = record.updatedAt;
          reservation.observedInputTokens = inputTokens;
          reservation.observedOutputTokens = outputTokens;
          reservation.usageReportedAt = new Date().toISOString();
          record.updatedAt = reservation.usageReportedAt;
          try {
            await persistSession(stateRoot, record);
          } catch (error) {
            reservation.observedInputTokens = previousObservedInputTokens;
            reservation.observedOutputTokens = previousObservedOutputTokens;
            reservation.usageReportedAt = previousUsageReportedAt;
            record.updatedAt = previousUpdatedAt;
            throw error;
          }
        },
        async recordFailure(failure) {
          const code = typeof failure?.code === 'string' ? failure.code : '';
          const retryable = failure?.retryable;
          if (!DEVELOPMENT_MODEL_FAILURE_RETRYABILITY.has(code)
            || DEVELOPMENT_MODEL_FAILURE_RETRYABILITY.get(code) !== retryable) {
            throw httpError(400, 'Provider 失败回执不在开发模型固定合同');
          }
          if (reservation.failureAt) {
            if (reservation.failureCode === code) return;
            throw httpError(409, 'Provider 失败回执与已记录结果冲突');
          }
          const previousFailureCode = reservation.failureCode;
          const previousFailureAt = reservation.failureAt;
          const previousUpdatedAt = record.updatedAt;
          reservation.failureCode = code;
          reservation.failureAt = new Date().toISOString();
          record.updatedAt = reservation.failureAt;
          try {
            await persistSession(stateRoot, record);
          } catch (error) {
            reservation.failureCode = previousFailureCode;
            reservation.failureAt = previousFailureAt;
            record.updatedAt = previousUpdatedAt;
            throw error;
          }
        },
        release,
      };
    } catch (error) {
      release();
      throw error;
    }
  }

  async function preflightModelCall(payload) {
    return runSessionOperation(payload?.sessionId, async () => {
      const { record } = await boundSession(payload?.sessionId);
      validateModelCallAuthorization(record, payload);
    });
  }

  function validateModelCallAuthorization(record, payload) {
    const reservationId = typeof payload?.reservationId === 'string' ? payload.reservationId : '';
    const authorizationToken = typeof payload?.authorizationToken === 'string' ? payload.authorizationToken : '';
    const runId = normalizeIdentifier(payload?.runId, 160, 'runId');
    const agentId = typeof payload?.agentId === 'string' ? payload.agentId : '';
    const reservation = record.modelReservations.find((item) => item.reservationId === reservationId);
    if (!reservation || !authorizationToken || !secureHashMatches(reservation.tokenSha256, authorizationToken)) {
      throw httpError(403, '开发模型一次性授权无效');
    }
    const contractMismatches = [
      reservation.runIdSha256 !== sha256(runId) ? 'runId' : '',
      reservation.agentId !== agentId ? 'agentId' : '',
      reservation.inputBytes !== payload?.inputBytes ? 'inputBytes' : '',
      reservation.inputSha256 !== payload?.inputSha256 ? 'inputSha256' : '',
      reservation.modelRouteSha256 !== payload?.modelRouteSha256 ? 'modelRouteSha256' : '',
      reservation.providerReadinessSha256 !== payload?.providerReadinessSha256 ? 'providerReadinessSha256' : '',
      reservation.maxOutputTokens !== payload?.maxOutputTokens ? 'maxOutputTokens' : '',
    ].filter(Boolean);
    if (contractMismatches.length) {
      throw httpError(403, `开发模型一次性授权与调用不匹配：${contractMismatches.join(',')}`);
    }
    if (reservation.consumedAt) throw httpError(409, '开发模型一次性授权已使用');
    return reservation;
  }

  async function updateProgressUnlocked(payload) {
    const { record, root } = await boundSession(payload?.sessionId);
    const phase = typeof payload?.phase === 'string' ? payload.phase : '';
    if (!SAFE_PHASES.has(phase)) throw httpError(400, '开发阶段非法');
    const transitionId = payload?.transitionId === undefined
      ? ''
      : normalizeIdentifier(payload.transitionId, 160, 'transitionId');
    const existing = transitionId
      ? record.progressTransitions.find((entry) => entry.transitionId === transitionId)
      : null;
    if (existing) {
      if (existing.phase !== phase) throw httpError(409, 'transitionId 已绑定其他开发阶段');
      return { ...publicSession(record, root), recovered: true };
    }
    if (transitionId && record.progressTransitions.length >= MAX_PROGRESS_TRANSITIONS) {
      throw httpError(409, '开发阶段转换账本已满，请完成当前会话后新建任务');
    }
    const previousPhase = record.phase;
    const previousUpdatedAt = record.updatedAt;
    const appliedAt = new Date().toISOString();
    record.phase = phase;
    record.updatedAt = appliedAt;
    if (transitionId) {
      record.progressTransitions.push({
        schema: 'agenthub.development-progress-transition',
        schemaVersion: 1,
        transitionId,
        phase,
        appliedAt,
      });
    }
    try {
      await persistSession(stateRoot, record);
    } catch (error) {
      if (transitionId) record.progressTransitions.pop();
      record.phase = previousPhase;
      record.updatedAt = previousUpdatedAt;
      throw error;
    }
    return publicSession(record, root);
  }

  async function snapshot(payload) {
    return runSessionOperation(payload?.sessionId, () => snapshotUnlocked(payload));
  }

  async function snapshotUnlocked(payload) {
    const { record, root } = await boundSession(payload?.sessionId, true);
    const [head, branch, statusResult, filesResult, projectInfo] = await Promise.all([
      runGit(root.path, ['rev-parse', 'HEAD']),
      runGit(root.path, ['branch', '--show-current']),
      runGit(root.path, ['status', '--short', '--untracked-files=all']),
      runGit(root.path, ['ls-files', '--cached', '--others', '--exclude-standard']),
      readProjectInfo(root.path),
    ]);
    const files = filesResult.stdout.split(/\r?\n/).filter(Boolean).filter(isSafeRelativePath).slice(0, 2_000);
    const seedPaths = [
      'AGENTS.md',
      'README.md',
      'package.json',
      'tsconfig.json',
      'pyproject.toml',
      'pytest.ini',
      'setup.cfg',
      'app.py',
      'main.py',
      'wsgi.py',
      'index.html',
      'public/index.html',
    ].filter((item) => files.includes(item));
    const seedFiles = await readFilesFromRoot(root.path, seedPaths, 256 * 1024);
    const worktreeStateSha256 = await workingTreeStateSha256(root.path, statusResult.stdout);
    return {
      session: publicSession(record, root),
      head: head.stdout.trim(),
      branch: branch.stdout.trim() || '(detached)',
      gitStatus: sanitizeGitStatus(statusResult.stdout),
      worktreeStateSha256,
      files,
      scripts: projectInfo.scripts,
      acceptanceScripts: projectInfo.acceptanceScripts,
      packageManager: projectInfo.packageManager,
      seedFiles,
    };
  }

  async function inspect(payload) {
    return runSessionOperation(payload?.sessionId, () => inspectUnlocked(payload));
  }

  async function inspectUnlocked(payload) {
    const { root } = await boundSession(payload?.sessionId, true);
    const kind = payload?.kind;
    if (kind === 'read') {
      if (!Array.isArray(payload.paths) || payload.paths.length < 1 || payload.paths.length > 12) {
        throw httpError(400, '单次读取必须包含 1-12 个路径');
      }
      return { files: await readFilesFromRoot(root.path, payload.paths, MAX_READ_BYTES) };
    }
    if (kind === 'search') {
      const query = typeof payload?.query === 'string' ? payload.query.trim() : '';
      if (!query || query.length > 120 || /[\u0000-\u001f]/.test(query)) throw httpError(400, '搜索词非法');
      const result = await runGit(root.path, ['grep', '-n', '-I', '-F', '-e', query, '--', '.'], { allowedExitCodes: [0, 1] });
      return {
        matches: result.stdout
          .split(/\r?\n/)
          .filter((line) => isSafeRelativePath(line.split(':', 1)[0]))
          .slice(0, 240),
      };
    }
    if (kind === 'diff') return collectDiff(root.path);
    throw httpError(400, '检查类型不受支持');
  }

  async function applyChangeSet(payload) {
    return runSessionOperation(payload?.sessionId, () => applyChangeSetUnlocked(payload));
  }

  async function applyChangeSetUnlocked(payload) {
    const { record, root, currentStateSha256 } = await boundSession(payload?.sessionId);
    const patch = typeof payload?.patch === 'string' ? payload.patch : '';
    const patchBytes = Buffer.byteLength(patch, 'utf8');
    if (!patchBytes || patchBytes > MAX_PATCH_BYTES) throw httpError(400, '补丁为空或超过 256KB');
    const changeSetId = normalizeIdentifier(payload?.changeSetId, 160, 'changeSetId');
    if (record.changeSets.some((item) => item.changeSetId === changeSetId)) throw httpError(409, 'changeSetId 已使用');
    const paths = validateUnifiedDiff(patch);
    await assertWritablePatchPaths(root.path, paths);
    await runGit(root.path, ['apply', '--check', '--whitespace=error-all', '--recount', '-'], { input: patch });
    const originalFiles = await capturePatchPathStates(root.path, paths);
    let patchApplied = false;
    try {
      await runGit(root.path, ['apply', '--whitespace=error-all', '--recount', '-'], { input: patch });
      patchApplied = true;
      const diffCheck = await runGit(root.path, ['diff', '--check'], { allowedExitCodes: [0, 2] });
      if (diffCheck.code !== 0) {
        throw httpError(409, `补丁后置 diff 校验失败：${boundedTail(diffCheck.output, 2_000)}`);
      }
      await assertChangedSourceQuality(paths, originalFiles);
    } catch (error) {
      if (!patchApplied) throw error;
      try {
        await restorePatchPathStates(originalFiles);
        const restored = await runGit(root.path, ['status', '--short', '--untracked-files=all']);
        const restoredStateSha256 = await workingTreeStateSha256(root.path, restored.stdout);
        if (restoredStateSha256 !== currentStateSha256) throw new Error('restored-state-mismatch');
      } catch {
        throw httpError(500, '补丁后置校验失败且自动回滚失败；会话已安全停止，请检查工作树');
      }
      if (error?.status === 409) throw httpError(409, `${error.message}；已完整回滚`);
      throw httpError(500, '补丁应用失败，已完整回滚');
    }
    const now = new Date().toISOString();
    record.phase = 'editing';
    record.updatedAt = now;
    record.final = null;
    record.changeSets.push({
      changeSetId,
      appliedAt: now,
      fileCount: paths.length,
      patchBytes,
      patchSha256: sha256(patch),
    });
    record.changeSets = record.changeSets.slice(-100);
    const status = await runGit(root.path, ['status', '--short', '--untracked-files=all']);
    record.worktreeStateSha256 = await workingTreeStateSha256(root.path, status.stdout);
    await persistSession(stateRoot, record);
    return { ok: true, session: publicSession(record, root), fileCount: paths.length, patchSha256: sha256(patch) };
  }

  async function applyTextReplacement(payload) {
    return runSessionOperation(
      payload?.sessionId,
      () => applyTextReplacements(payload, [payload ?? {}], 'replace'),
    );
  }

  async function applyTextReplacementBatch(payload) {
    return runSessionOperation(payload?.sessionId, () => {
      if (!Array.isArray(payload?.replacements) || payload.replacements.length < 2 || payload.replacements.length > MAX_REPLACEMENT_BATCH) {
        throw httpError(400, '精确替换批次必须包含 2-4 个操作');
      }
      return applyTextReplacements(payload, payload.replacements, 'replace-batch');
    });
  }

  async function applyTextReplacements(payload, replacements, operation) {
    const { record, root } = await boundSession(payload?.sessionId);
    const changeSetId = normalizeIdentifier(payload?.changeSetId, 160, 'changeSetId');
    if (record.changeSets.some((item) => item.changeSetId === changeSetId)) throw httpError(409, 'changeSetId 已使用');
    const files = new Map();
    const receiptItems = [];
    let replacementBytes = 0;
    for (const replacement of replacements) {
      const relativePath = typeof replacement?.path === 'string' ? replacement.path : '';
      if (!isSafeRelativePath(relativePath)) throw httpError(400, '替换路径不在开发预设范围');
      const oldText = typeof replacement?.oldText === 'string' ? replacement.oldText : '';
      const newText = typeof replacement?.newText === 'string' ? replacement.newText : '';
      const itemBytes = Buffer.byteLength(oldText, 'utf8') + Buffer.byteLength(newText, 'utf8');
      if (!oldText || oldText === newText || itemBytes > MAX_REPLACEMENT_BYTES) {
        throw httpError(400, '精确替换为空、无变化或超过 32KB');
      }
      replacementBytes += itemBytes;
      const target = await resolveSafeFile(root.path, relativePath);
      let file = files.get(target);
      if (!file) {
        const buffer = await fsp.readFile(target);
        const content = buffer.toString('utf8');
        if (!Buffer.from(content, 'utf8').equals(buffer)) throw httpError(415, `${relativePath} 不是 UTF-8 文本`);
        file = { relativePath, target, original: content, updated: content, mode: (await fsp.stat(target)).mode };
        files.set(target, file);
      }
      const lineEnding = file.updated.match(/\r\n|\n|\r/)?.[0] ?? os.EOL;
      const comparableOldText = normalizeLineEndings(oldText, lineEnding);
      const comparableNewText = normalizeLineEndings(newText, lineEnding);
      const occurrences = countExactOccurrences(file.updated, comparableOldText);
      if (occurrences !== 1) throw httpError(409, `精确替换旧文本命中 ${occurrences} 次，必须恰好 1 次`);
      const index = file.updated.indexOf(comparableOldText);
      file.updated = `${file.updated.slice(0, index)}${comparableNewText}${file.updated.slice(index + comparableOldText.length)}`;
      if (Buffer.byteLength(file.updated, 'utf8') > MAX_REPLACED_FILE_BYTES) throw httpError(413, '替换后文件超过 512KB');
      receiptItems.push({
        pathSha256: sha256(relativePath),
        oldTextSha256: sha256(oldText),
        newTextSha256: sha256(newText),
      });
    }
    const changedFiles = [...files.values()].filter((file) => file.updated !== file.original);
    if (changedFiles.length !== files.size) throw httpError(400, '精确替换批次包含相互抵消的无变化文件');
    for (const file of changedFiles) {
      const problem = findDevelopmentSourceQualityProblem(file.relativePath, file.original, file.updated);
      if (problem) throw httpError(409, `源码质量门拒绝 ${file.relativePath}：${problem}`);
    }
    const now = new Date().toISOString();
    const receipt = JSON.stringify(receiptItems.length === 1 ? receiptItems[0] : receiptItems);
    const written = [];
    try {
      for (const file of changedFiles) {
        await writeTextAtomically(file.target, file.updated, file.mode);
        written.push(file);
      }
      const diffCheck = await runGit(root.path, ['diff', '--check'], { allowedExitCodes: [0, 2] });
      if (diffCheck.code !== 0) {
        throw httpError(409, `精确替换后置 diff 校验失败，已完整回滚：${boundedTail(diffCheck.output, 2_000)}`);
      }
      const status = await runGit(root.path, ['status', '--short', '--untracked-files=all']);
      const nextRecord = {
        ...record,
        phase: 'editing',
        updatedAt: now,
        final: null,
        changeSets: [
          ...record.changeSets,
          {
            changeSetId,
            operation,
            appliedAt: now,
            fileCount: changedFiles.length,
            patchBytes: replacementBytes,
            patchSha256: sha256(receipt),
          },
        ].slice(-100),
        worktreeStateSha256: await workingTreeStateSha256(root.path, status.stdout),
      };
      const response = {
        ok: true,
        session: publicSession(nextRecord, root),
        fileCount: changedFiles.length,
        patchSha256: sha256(receipt),
      };
      await persistReplacementSession(nextRecord);
      return response;
    } catch (error) {
      try {
        for (const file of [...written].reverse()) await writeTextAtomically(file.target, file.original, file.mode);
      } catch {
        throw httpError(500, '精确替换后置校验失败且自动回滚失败；会话已安全停止，请检查工作树');
      }
      if (error?.status === 409) throw error;
      throw httpError(500, '精确替换事务失败，已完整回滚');
    }
  }

  async function runCommand(payload) {
    return runSessionOperation(payload?.sessionId, () => runCommandUnlocked(payload));
  }

  async function runCommandUnlocked(payload) {
    const { record, root, currentStateSha256 } = await boundSession(payload?.sessionId);
    const commandId = typeof payload?.commandId === 'string' ? payload.commandId : '';
    if (!SAFE_COMMANDS.has(commandId)) throw httpError(400, '命令不在本地自主预设清单');
    const executionId = normalizeIdentifier(payload?.executionId, 160, 'executionId');
    const stabilityRetryOf = payload?.stabilityRetryOf === undefined
      ? undefined
      : normalizeIdentifier(payload.stabilityRetryOf, 160, 'stabilityRetryOf');
    let stabilityRetrySourceStateSha256;
    if (record.commandExecutions.some((item) => item.executionId === executionId)) {
      throw httpError(409, 'executionId 已使用且瞬时命令响应不可用；为避免重复执行，必须以新 ID 明确启动新命令');
    }
    if (stabilityRetryOf) {
      if (commandId !== 'test') throw httpError(400, '稳定性复验只允许固定 test 命令');
      const latestSameStateTest = [...record.commands].reverse().find((item) => (
        item.commandId === 'test' && item.sourceStateSha256 === currentStateSha256
      ));
      if (
        latestSameStateTest?.executionId !== stabilityRetryOf
        || !isEligibleTestStabilityRetry(latestSameStateTest, currentStateSha256)
      ) {
        throw httpError(409, '稳定性复验来源不是当前源码状态下最新且合格的首次 test 失败');
      }
      const stateAlreadyRetried = record.commandExecutions.some((item) => (
        item.stabilityRetrySourceStateSha256 === currentStateSha256
      ));
      if (stateAlreadyRetried) throw httpError(409, '当前源码状态已执行过一次 test 稳定性复验');
      stabilityRetrySourceStateSha256 = latestSameStateTest.sourceStateSha256;
    }
    let projectInfo = null;
    if (commandId !== 'git-diff-check') {
      projectInfo = await readProjectInfo(root.path);
      if (!projectInfo.scripts.includes(commandId)) throw httpError(409, `项目未声明可用的 ${commandId} 固定命令`);
    }
    const startedAt = Date.now();
    record.phase = 'verifying';
    record.updatedAt = new Date(startedAt).toISOString();
    record.final = null;
    record.commandExecutions.push({
      schema: 'agenthub.development-command-execution',
      schemaVersion: 1,
      executionId,
      commandId,
      startedAt: record.updatedAt,
      ...(stabilityRetryOf ? { stabilityRetryOf } : {}),
      ...(stabilityRetrySourceStateSha256 ? { stabilityRetrySourceStateSha256 } : {}),
    });
    record.commandExecutions = record.commandExecutions.slice(-100);
    await persistSession(stateRoot, record);
    let result;
    if (commandId === 'git-diff-check') {
      result = await runDevelopmentDiffCheck(root.path);
    } else {
      result = await runProjectCommand(root.path, projectInfo, commandId, projectCommandTimeoutMs);
    }
    const finishedAt = new Date().toISOString();
    const [finishedHead, commandStatus] = await Promise.all([
      runGit(root.path, ['rev-parse', 'HEAD']),
      runGit(root.path, ['status', '--short', '--untracked-files=all']),
    ]);
    if (finishedHead.stdout.trim() !== record.baseHead) {
      throw httpError(409, '固定验证命令执行期间 Git HEAD 发生变化，证据已拒绝');
    }
    const sourceStateSha256 = await workingTreeStateSha256(root.path, commandStatus.stdout);
    const worktreeChanged = sourceStateSha256 !== currentStateSha256;
    const output = worktreeChanged
      ? `${result.output}\n[AgentHub] 固定验证命令改变了受管工作树，证据已拒绝`
      : result.output;
    const entry = {
      executionId,
      ...(stabilityRetryOf ? { stabilityRetryOf } : {}),
      commandId,
      policyVersion: DEVELOPMENT_EVIDENCE_POLICY.command,
      status: result.code === 0 && !worktreeChanged ? 'passed' : 'failed',
      exitCode: result.code,
      timedOut: result.timedOut === true,
      worktreeChanged,
      durationMs: Date.now() - startedAt,
      outputSha256: sha256(output),
      sourceStateSha256,
      finishedAt,
    };
    record.phase = entry.status === 'passed' ? 'verifying' : 'failed';
    record.updatedAt = finishedAt;
    record.worktreeStateSha256 = sourceStateSha256;
    record.commands.push(entry);
    record.commands = record.commands.slice(-100);
    record.final = null;
    await persistSession(stateRoot, record);
    return { ...entry, outputTail: boundedTail(output, 16_000), session: publicSession(record, root) };
  }

  async function runBrowserAcceptance(payload) {
    return runSessionOperation(payload?.sessionId, () => runBrowserAcceptanceUnlocked(payload));
  }

  async function runBrowserAcceptanceUnlocked(payload) {
    const { record, root, currentStateSha256 } = await boundSession(payload?.sessionId);
    const acceptanceId = normalizeIdentifier(payload?.acceptanceId, 160, 'acceptanceId');
    const projectInfo = await readProjectInfo(root.path);
    const existing = record.acceptances.find((item) => item.acceptanceId === acceptanceId);
    if (existing) {
      if (existing.scriptId === null) {
        throw httpError(409, '浏览器验收瞬时响应不可恢复，且 acceptanceId 已使用；不得重复执行');
      }
      const normalizedPlan = normalizeDevelopmentAcceptancePlan(payload?.plan, projectInfo.acceptanceScripts);
      const planSha256 = sha256(JSON.stringify(normalizedPlan));
      if (existing.planSha256 !== planSha256 || existing.sourceStateSha256 !== currentStateSha256) {
        throw httpError(409, '浏览器验收恢复合同不匹配');
      }
      return {
        ...existing,
        viewports: [],
        recovered: true,
        session: publicSession(record, root),
      };
    }
    const sourceStateSha256 = currentStateSha256;
    record.phase = 'verifying';
    record.updatedAt = new Date().toISOString();
    record.final = null;
    await persistSession(stateRoot, record);
    try {
      const result = await acceptanceRuntime.run({
        root: root.path,
        plan: payload?.plan,
        availableScripts: projectInfo.acceptanceScripts,
      });
      const [finishedHead, finishedStatus] = await Promise.all([
        runGit(root.path, ['rev-parse', 'HEAD']),
        runGit(root.path, ['status', '--short', '--untracked-files=all']),
      ]);
      if (finishedHead.stdout.trim() !== record.baseHead) {
        throw httpError(409, '浏览器验收期间 Git HEAD 发生变化，证据已拒绝');
      }
      const finishedStateSha256 = await workingTreeStateSha256(root.path, finishedStatus.stdout);
      if (finishedStateSha256 !== sourceStateSha256) throw httpError(409, '浏览器验收期间工作树发生变化，证据已拒绝');
      const receipt = {
        acceptanceId,
        policyVersion: DEVELOPMENT_EVIDENCE_POLICY.browserAcceptance,
        status: result.status,
        scriptId: result.scriptId,
        planSha256: result.planSha256,
        evidenceSha256: result.evidenceSha256,
        sourceStateSha256,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        durationMs: result.durationMs,
        actionCount: result.actionCount,
        viewportCount: result.viewportCount,
        consoleErrorCount: result.consoleErrorCount,
        consoleWarningCount: result.consoleWarningCount,
        failedRequestCount: result.failedRequestCount,
        failureCount: result.failureCount,
        screenshotSha256: result.screenshotSha256,
      };
      record.phase = result.status === 'passed' ? 'verifying' : 'failed';
      record.updatedAt = result.finishedAt;
      record.worktreeStateSha256 = finishedStateSha256;
      record.acceptances.push(receipt);
      record.acceptances = record.acceptances.slice(-20);
      record.final = null;
      await persistSession(stateRoot, record);
      return {
        ...result,
        acceptanceId,
        policyVersion: DEVELOPMENT_EVIDENCE_POLICY.browserAcceptance,
        sourceStateSha256,
        session: publicSession(record, root),
      };
    } catch (error) {
      const now = new Date().toISOString();
      record.worktreeStateSha256 = sourceStateSha256;
      const failedReceipt = {
        acceptanceId,
        policyVersion: DEVELOPMENT_EVIDENCE_POLICY.browserAcceptance,
        status: 'failed',
        scriptId: null,
        planSha256: sha256(JSON.stringify(payload?.plan ?? null)),
        evidenceSha256: sha256(error instanceof Error ? error.message : 'browser-acceptance-failed'),
        sourceStateSha256,
        startedAt: record.updatedAt,
        finishedAt: now,
        durationMs: 0,
        actionCount: 0,
        viewportCount: 0,
        consoleErrorCount: 0,
        consoleWarningCount: 0,
        failedRequestCount: 0,
        failureCount: 1,
        screenshotSha256: [],
      };
      record.phase = 'failed';
      record.updatedAt = now;
      record.acceptances.push(failedReceipt);
      record.acceptances = record.acceptances.slice(-20);
      record.final = null;
      await persistSession(stateRoot, record);
      throw error;
    }
  }

  async function submitReview(payload) {
    return runSessionOperation(payload?.sessionId, () => submitReviewUnlocked(payload));
  }

  async function submitReviewUnlocked(payload) {
    const { record, root } = await boundSession(payload?.sessionId);
    const reviewId = normalizeIdentifier(payload?.reviewId, 160, 'reviewId');
    if (record.reviews.some((item) => item.reviewId === reviewId)) throw httpError(409, 'reviewId 已使用');
    const allowedReviewers = record.agentPlan.agents.includes('AG-REVIEW')
      ? record.agentPlan.agents.filter((agentId) => agentId === 'AG-SEC' || agentId === 'AG-REVIEW')
      : ['AG-DEV'];
    if (!allowedReviewers.includes(payload?.agentId)) {
      throw httpError(409, `当前开发会话只接受 ${allowedReviewers.join('、')} 的评审`);
    }
    const reviewer = payload.agentId;
    const modelId = normalizeModelId(payload?.modelId);
    const summary = typeof payload?.summary === 'string' ? payload.summary.trim() : '';
    if (!summary || summary.length > 1_000 || summary.includes('\0')) throw httpError(400, '复审摘要为空或超过 1000 字符');
    const findingsMatches = [...summary.matchAll(/\bFINDINGS:H(\d{1,2})\/M(\d{1,2})\/L(\d{1,2})\b/g)];
    const gateMatches = [...summary.matchAll(/\bGATE:(PASS|FAIL)\b/g)];
    if (findingsMatches.length !== 1 || gateMatches.length !== 1) {
      throw httpError(400, '复审摘要必须恰好包含一组 FINDINGS:Hn/Mn/Ln 和一个 GATE:PASS|FAIL');
    }
    const findings = {
      high: Number(findingsMatches[0][1]),
      medium: Number(findingsMatches[0][2]),
      low: Number(findingsMatches[0][3]),
    };
    const gate = gateMatches[0][1];
    if (gate === 'PASS' && (findings.high > 0 || findings.medium > 0)) {
      throw httpError(409, '存在 High/Medium finding 时不得提交 GATE:PASS');
    }
    const status = await runGit(root.path, ['status', '--short', '--untracked-files=all']);
    const sourceStateSha256 = await workingTreeStateSha256(root.path, status.stdout);
    const reviewedAt = new Date(Math.max(
      Date.now(),
      Number.isFinite(Date.parse(record.updatedAt)) ? Date.parse(record.updatedAt) + 1 : 0,
    )).toISOString();
    const receipt = {
      schema: 'agenthub.development-review',
      schemaVersion: 1,
      policyVersion: DEVELOPMENT_EVIDENCE_POLICY.independentReview,
      reviewId,
      agentId: reviewer,
      modelId,
      findings,
      gate,
      summarySha256: sha256(summary),
      sourceStateSha256,
      reviewedAt,
    };
    record.phase = gate === 'PASS' && findings.high === 0 && findings.medium === 0 ? 'reviewing' : 'failed';
    record.updatedAt = reviewedAt;
    record.worktreeStateSha256 = sourceStateSha256;
    record.reviews.push(receipt);
    record.reviews = record.reviews.slice(-20);
    record.final = null;
    await persistSession(stateRoot, record);
    return { receipt, session: publicSession(record, root) };
  }

  async function finalize(payload) {
    return runSessionOperation(payload?.sessionId, () => finalizeUnlocked(payload));
  }

  async function finalizeUnlocked(payload) {
    const { record, root, stateDrifted } = await boundSession(payload?.sessionId, true);
    const [status, diffCheck, projectInfo] = await Promise.all([
      runGit(root.path, ['status', '--short', '--untracked-files=all']),
      runGit(root.path, ['diff', '--check'], { allowedExitCodes: [0, 2] }),
      readProjectInfo(root.path),
    ]);
    const required = ['test', 'build', 'lint', 'typecheck', 'check'].filter((item) => projectInfo.scripts.includes(item));
    const changedPaths = status.stdout.split(/\r?\n/).filter(Boolean);
    const currentStateSha256 = await workingTreeStateSha256(root.path, status.stdout);
    const latest = new Map();
    for (const entry of record.commands) {
      if (entry.sourceStateSha256 === currentStateSha256) latest.set(entry.commandId, entry);
    }
    const missingOrFailed = required.filter((item) => {
      const entry = latest.get(item);
      return entry?.status !== 'passed'
        || entry.sourceStateSha256 !== currentStateSha256
        || entry.policyVersion !== DEVELOPMENT_EVIDENCE_POLICY.command;
    });
    const blockedChangedPathCount = changedPaths.filter((line) => !isSafeRelativePath(extractStatusCandidate(line))).length;
    const acceptanceBlockers = [];
    const reviewBlockers = [];
    if (record.requirements?.testChange && !changedPaths.some((line) => isTestPath(extractStatusCandidate(line)))) {
      acceptanceBlockers.push('required-test-change-missing');
    }
    const browserAcceptanceRequired = record.requirements?.browserAcceptance
      || changedPaths.some((line) => isBrowserAcceptancePath(extractStatusCandidate(line)));
    const latestAcceptance = [...record.acceptances].reverse()
      .find((entry) => entry.sourceStateSha256 === currentStateSha256);
    if (browserAcceptanceRequired) {
      if (!projectInfo.acceptanceScripts.length) acceptanceBlockers.push('required-browser-script-missing');
      else if (!latestAcceptance) {
        acceptanceBlockers.push(record.acceptances.length
          ? 'required-browser-acceptance-stale'
          : 'required-browser-acceptance-missing');
      }
      else if (latestAcceptance.policyVersion !== DEVELOPMENT_EVIDENCE_POLICY.browserAcceptance) {
        acceptanceBlockers.push('required-browser-acceptance-policy-stale');
      }
      else if (latestAcceptance.status !== 'passed') acceptanceBlockers.push('required-browser-acceptance-failed');
      else if (latestAcceptance.sourceStateSha256 !== currentStateSha256) acceptanceBlockers.push('required-browser-acceptance-stale');
    }
    const acceptanceForOrdering = latestAcceptance ?? record.acceptances.at(-1);
    const verificationFinishedAt = [
      ...required.map((item) => latest.get(item)?.finishedAt),
      ...(browserAcceptanceRequired ? [acceptanceForOrdering?.finishedAt] : []),
    ].filter((item) => typeof item === 'string').sort().at(-1);
    const requiredReviewers = [];
    if (record.agentPlan.agents.includes('AG-SEC')) requiredReviewers.push('AG-SEC');
    if (record.agentPlan.agents.includes('AG-REVIEW')) requiredReviewers.push('AG-REVIEW');
    else reviewBlockers.push('formal-delivery-requires-independent-review');
    const acceptedReviews = new Map();
    for (const reviewer of requiredReviewers) {
      const prefix = reviewer === 'AG-SEC' ? 'required-security-review' : 'required-independent-review';
      const reviewerHistory = record.reviews.filter((entry) => entry.agentId === reviewer);
      const latestReview = [...reviewerHistory].reverse()
        .find((entry) => entry.sourceStateSha256 === currentStateSha256);
      if (!latestReview) {
        reviewBlockers.push(reviewerHistory.length ? `${prefix}-stale` : `${prefix}-missing`);
        const latestHistoricalReview = reviewerHistory.at(-1);
        if (verificationFinishedAt && latestHistoricalReview?.reviewedAt <= verificationFinishedAt) {
          reviewBlockers.push(`${prefix}-predates-verification`);
        }
        continue;
      }
      if (latestReview.policyVersion !== DEVELOPMENT_EVIDENCE_POLICY.independentReview) {
        reviewBlockers.push(`${prefix}-policy-stale`);
      }
      if (latestReview.findings.high > 0 || latestReview.findings.medium > 0) {
        reviewBlockers.push(`${prefix}-findings-open`);
      }
      if (latestReview.gate !== 'PASS') reviewBlockers.push(`${prefix}-gate-failed`);
      if (verificationFinishedAt && latestReview.reviewedAt <= verificationFinishedAt) {
        reviewBlockers.push(`${prefix}-predates-verification`);
      }
      acceptedReviews.set(reviewer, latestReview);
    }
    const securityReview = acceptedReviews.get('AG-SEC');
    const independentReview = acceptedReviews.get('AG-REVIEW');
    if (securityReview && independentReview && independentReview.reviewedAt <= securityReview.reviewedAt) {
      reviewBlockers.push('required-independent-review-predates-security-review');
    }
    const finalHead = await runGit(root.path, ['rev-parse', 'HEAD']);
    if (finalHead.stdout.trim() !== record.baseHead) {
      throw httpError(409, 'Final 校验期间 Git HEAD 发生变化，已拒绝交付');
    }
    const ready = changedPaths.length > 0
      && blockedChangedPathCount === 0
      && diffCheck.code === 0
      && missingOrFailed.length === 0
      && acceptanceBlockers.length === 0
      && reviewBlockers.length === 0;
    const now = new Date().toISOString();
    record.phase = ready ? 'ready' : 'failed';
    record.updatedAt = now;
    if (!stateDrifted) record.worktreeStateSha256 = currentStateSha256;
    record.final = {
      ready,
      evidencePolicySha256: DEVELOPMENT_EVIDENCE_POLICY_SHA256,
      finalizedAt: now,
      changedFileCount: changedPaths.length,
      statusSha256: sha256(status.stdout),
      diffCheckPassed: diffCheck.code === 0,
      verificationPassed: missingOrFailed.length === 0,
      acceptancePassed: acceptanceBlockers.length === 0,
      reviewPassed: reviewBlockers.length === 0,
      browserAcceptanceRequired,
      browserAcceptancePassed: !browserAcceptanceRequired
        || (latestAcceptance?.status === 'passed' && !acceptanceBlockers.some((item) => item.startsWith('required-browser-'))),
      blockedChangedPathCount,
    };
    await persistSession(stateRoot, record);
    return {
      ready,
      session: publicSession(record, root),
      changedPaths,
      diffCheckPassed: diffCheck.code === 0,
      requiredCommands: required,
      missingOrFailed,
      acceptanceBlockers,
      reviewBlockers,
      browserAcceptanceRequired,
      blockedChangedPathCount,
    };
  }

  async function boundSession(value, allowStateDrift = false) {
    const sessionId = requireSessionId(value);
    const root = roots.get(sessionId);
    if (!root) throw httpError(409, '开发会话尚未绑定工作区；请先恢复该会话');
    const record = await readSession(stateRoot, sessionId);
    const [head, status] = await Promise.all([
      runGit(root.path, ['rev-parse', 'HEAD']),
      runGit(root.path, ['status', '--short', '--untracked-files=all']),
    ]);
    if (head.stdout.trim() !== record.baseHead) {
      throw httpError(409, '当前 Git HEAD 与开发会话原始 HEAD 不一致，已拒绝继续');
    }
    const currentStateSha256 = await workingTreeStateSha256(root.path, status.stdout);
    const expectedStateSha256 = record.worktreeStateSha256 ?? latestEvidenceStateSha256(record);
    const stateDrifted = Boolean(expectedStateSha256 && expectedStateSha256 !== currentStateSha256);
    if (stateDrifted && !allowStateDrift) {
      throw httpError(409, '当前工作树与开发会话最后受控状态不一致，已拒绝继续');
    }
    return { record, root, currentStateSha256, stateDrifted };
  }

  async function runSessionOperation(value, operation) {
    const release = acquireSessionOperation(value);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async function runSessionOperationAfterCurrent(value, operation) {
    while (true) {
      const active = sessionOperations.get(sessionOperationKey(value));
      if (active) {
        await active;
        continue;
      }
      try {
        return await runSessionOperation(value, operation);
      } catch (error) {
        if (error?.status === 409 && error?.message === '该开发工作树已有受管操作正在运行，请等待当前动作完成') continue;
        throw error;
      }
    }
  }

  function sessionOperationKey(value) {
    const sessionId = requireSessionId(value);
    const root = roots.get(sessionId);
    return root ? `root:${root.fingerprint}` : `session:${sessionId}`;
  }

  function acquireSessionOperation(value) {
    const operationKey = sessionOperationKey(value);
    if (sessionOperations.has(operationKey)) {
      throw httpError(409, '该开发工作树已有受管操作正在运行，请等待当前动作完成');
    }
    let settle;
    const completion = new Promise((resolve) => { settle = resolve; });
    sessionOperations.set(operationKey, completion);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (sessionOperations.get(operationKey) === completion) sessionOperations.delete(operationKey);
      settle();
    };
  }

  return {
    stateRoot,
    preset: LOCAL_AUTONOMOUS_PRESET,
    listSessions,
    preflightSession,
    createSession,
    resumeSession,
    updateProgress,
    issueModelCall,
    preflightModelCall,
    beginModelCall,
    snapshot,
    inspect,
    applyChangeSet,
    applyTextReplacement,
    applyTextReplacementBatch,
    runCommand,
    runBrowserAcceptance,
    submitReview,
    finalize,
    dispose: () => acceptanceRuntime.dispose(),
  };
}

async function inspectGitRoot(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1_024 || value.includes('\0')) {
    throw httpError(400, 'Git 工作区路径缺失或非法');
  }
  const requested = path.resolve(value.trim());
  const stat = await fsp.lstat(requested).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) throw httpError(400, '开发根必须是真实目录，不得是符号链接或目录联接');
  const real = await fsp.realpath(requested);
  const top = await runGit(real, ['rev-parse', '--show-toplevel']);
  const realTop = await fsp.realpath(top.stdout.trim());
  if (!samePath(real, realTop)) throw httpError(400, '开发根必须是 Git 工作树顶层');
  const gitMarker = await fsp.lstat(path.join(real, '.git')).catch(() => null);
  if (!gitMarker || gitMarker.isSymbolicLink() || (!gitMarker.isDirectory() && !gitMarker.isFile())) {
    throw httpError(400, '开发根缺少可信 .git 元数据');
  }
  const [head, branch, status] = await Promise.all([
    runGit(real, ['rev-parse', 'HEAD']),
    runGit(real, ['branch', '--show-current']),
    runGit(real, ['status', '--short', '--untracked-files=all']),
  ]);
  return {
    path: real,
    name: path.basename(real),
    fingerprint: sha256(normalizePathForIdentity(real)),
    head: head.stdout.trim(),
    branch: branch.stdout.trim() || '(detached)',
    status: status.stdout.replace(/\r?\n$/, ''),
  };
}

function publicSession(record, root) {
  return {
    sessionId: record.sessionId,
    presetId: record.presetId,
    evidencePolicy: {
      ...DEVELOPMENT_EVIDENCE_POLICY,
      policySha256: DEVELOPMENT_EVIDENCE_POLICY_SHA256,
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    phase: record.phase,
    agentPlan: record.agentPlan,
    requirements: { ...record.requirements },
    modelUsage: modelUsage(record),
    changeSetCount: record.changeSets.length,
    commands: record.commands.map((entry) => ({
      ...entry,
      timedOut: entry.timedOut === true,
      worktreeChanged: entry.worktreeChanged === true,
    })),
    stabilityRetriedSourceStates: [...new Set(record.commandExecutions.flatMap((execution) => (
      execution.stabilityRetrySourceStateSha256 ? [execution.stabilityRetrySourceStateSha256] : []
    )))],
    acceptances: record.acceptances.map((entry) => ({ ...entry, screenshotSha256: [...entry.screenshotSha256] })),
    reviews: record.reviews.map((entry) => ({ ...entry, findings: { ...entry.findings } })),
    final: record.final ? { ...record.final } : null,
    rootBound: Boolean(root),
    ...(root ? { rootName: root.name, branch: root.branch, head: root.head } : {}),
  };
}

function normalizeStoredSession(value) {
  if (!value || typeof value !== 'object' || value.schema !== SESSION_SCHEMA || value.schemaVersion !== SESSION_VERSION) return null;
  if (!SESSION_ID.test(value.sessionId) || value.presetId !== LOCAL_AUTONOMOUS_PRESET.id) return null;
  if (!/^[a-f0-9]{64}$/.test(value.rootFingerprint) || !/^[a-f0-9]{40,64}$/.test(value.baseHead)) return null;
  if (value.creationId !== undefined && !/^[a-zA-Z0-9._:-]{1,160}$/.test(value.creationId)) return null;
  if (!/^[a-f0-9]{64}$/.test(value.taskSha256) || !Number.isInteger(value.taskChars)) return null;
  if (value.worktreeStateSha256 !== undefined && !/^[a-f0-9]{64}$/.test(value.worktreeStateSha256)) return null;
  if (!SAFE_PHASES.has(value.phase) || !Array.isArray(value.changeSets) || !Array.isArray(value.commands)) return null;
  if (!isStoredAgentPlan(value.agentPlan)) return null;
  if (value.requirements !== undefined && (!value.requirements || typeof value.requirements !== 'object')) return null;
  if (value.requirements?.testChange !== undefined && typeof value.requirements.testChange !== 'boolean') return null;
  if (value.requirements?.browserAcceptance !== undefined && typeof value.requirements.browserAcceptance !== 'boolean') return null;
  const requirements = {
    testChange: value.requirements?.testChange ?? false,
    browserAcceptance: value.requirements?.browserAcceptance ?? false,
  };
  const costPolicy = value.costPolicy === undefined
    ? { ...LEGACY_DEVELOPMENT_COST_POLICY }
    : normalizeStoredDevelopmentCostPolicy(value.costPolicy);
  if (!costPolicy) return null;
  const acceptances = value.acceptances ?? [];
  if (!Array.isArray(acceptances) || acceptances.length > 20 || acceptances.some((entry) => !isStoredAcceptance(entry))) return null;
  const reviews = value.reviews ?? [];
  if (!Array.isArray(reviews) || reviews.length > 20 || reviews.some((entry) => !isStoredReview(entry))) return null;
  const commandExecutions = value.commandExecutions ?? [];
  if (
    !Array.isArray(commandExecutions)
    || commandExecutions.length > 100
    || commandExecutions.some((entry) => !isStoredCommandExecution(entry))
    || new Set(commandExecutions.map((entry) => entry.executionId)).size !== commandExecutions.length
    || !hasValidCommandStabilityRetryLinks(commandExecutions, value.commands)
  ) return null;
  const progressTransitions = value.progressTransitions ?? [];
  if (
    !Array.isArray(progressTransitions)
    || progressTransitions.length > MAX_PROGRESS_TRANSITIONS
    || progressTransitions.some((entry) => !isStoredProgressTransition(entry))
    || new Set(progressTransitions.map((entry) => entry.transitionId)).size !== progressTransitions.length
  ) return null;
  const modelReservations = value.modelReservations ?? [];
  if (
    !Array.isArray(modelReservations)
    || modelReservations.length > DEVELOPMENT_MODEL_BUDGET.maxCalls
    || modelReservations.some((entry) => !isStoredModelReservation(entry))
    || modelReservations.some((entry) => !value.agentPlan.agents.includes(entry.agentId))
    || new Set(modelReservations.map((entry) => entry.reservationId)).size !== modelReservations.length
    || !hasValidModelRetryLinks(modelReservations)
    || modelReservations.reduce((total, entry) => total + (entry.inputBytes ?? 0), 0) > DEVELOPMENT_MODEL_BUDGET.maxInputBytes
    || modelReservations.reduce((total, entry) => total + entry.maxOutputTokens, 0) > DEVELOPMENT_MODEL_BUDGET.maxOutputTokens
  ) return null;
  if (modelUsage({ modelReservations, costPolicy }).chargedCostMicros > costPolicy.maxCostMicros) return null;
  return {
    ...value,
    requirements,
    costPolicy,
    acceptances,
    reviews,
    commandExecutions,
    progressTransitions,
    modelReservations,
  };
}

function resumeStateMatches(record, root, worktreeStateSha256) {
  const expected = record.worktreeStateSha256 ?? latestEvidenceStateSha256(record);
  if (expected) return expected === worktreeStateSha256;
  return !root.status && record.changeSets.length === 0;
}

function canReopenDevelopmentDelivery(record, currentRequirements) {
  return record?.final?.ready === true
    && record.final.evidencePolicySha256 === DEVELOPMENT_EVIDENCE_POLICY_SHA256
    && record.requirements?.testChange === currentRequirements.testChange
    && record.requirements?.browserAcceptance === currentRequirements.browserAcceptance;
}

function latestEvidenceStateSha256(record) {
  const candidates = [
    ...record.commands.map((entry) => ({ at: entry.finishedAt, value: entry.sourceStateSha256 })),
    ...record.acceptances.map((entry) => ({ at: entry.finishedAt, value: entry.sourceStateSha256 })),
    ...record.reviews.map((entry) => ({ at: entry.reviewedAt, value: entry.sourceStateSha256 })),
  ].filter((entry) => typeof entry.at === 'string' && /^[a-f0-9]{64}$/.test(entry.value));
  candidates.sort((left, right) => left.at.localeCompare(right.at));
  return candidates.at(-1)?.value ?? '';
}

function isStoredAcceptance(value) {
  return value && typeof value === 'object'
    && /^[a-zA-Z0-9._:-]{1,160}$/.test(value.acceptanceId)
    && isOptionalPolicyVersion(value.policyVersion)
    && (value.status === 'passed' || value.status === 'failed')
    && (value.scriptId === null || isDevelopmentAcceptanceScript(value.scriptId))
    && /^[a-f0-9]{64}$/.test(value.planSha256)
    && /^[a-f0-9]{64}$/.test(value.evidenceSha256)
    && /^[a-f0-9]{64}$/.test(value.sourceStateSha256)
    && Array.isArray(value.screenshotSha256)
    && value.screenshotSha256.every((item) => /^[a-f0-9]{64}$/.test(item));
}

function isStoredCommandExecution(value) {
  return value && typeof value === 'object'
    && value.schema === 'agenthub.development-command-execution'
    && value.schemaVersion === 1
    && /^[a-zA-Z0-9._:-]{1,160}$/.test(value.executionId)
    && SAFE_COMMANDS.has(value.commandId)
    && typeof value.startedAt === 'string'
    && (
      value.stabilityRetryOf === undefined
        ? value.stabilityRetrySourceStateSha256 === undefined
        : /^[a-zA-Z0-9._:-]{1,160}$/.test(value.stabilityRetryOf)
          && /^[a-f0-9]{64}$/.test(value.stabilityRetrySourceStateSha256)
    );
}

function hasValidCommandStabilityRetryLinks(executions, commands) {
  const retrySources = new Set();
  const retriedStates = new Set();
  for (let index = 0; index < executions.length; index += 1) {
    const execution = executions[index];
    if (!execution.stabilityRetryOf) continue;
    if (execution.commandId !== 'test' || retrySources.has(execution.stabilityRetryOf)) return false;
    const sourceExecutionIndex = executions.findIndex((item) => item.executionId === execution.stabilityRetryOf);
    const source = commands.find((item) => item.executionId === execution.stabilityRetryOf);
    if (
      sourceExecutionIndex >= index
      || (source && !isEligibleTestStabilityRetry(source, execution.stabilityRetrySourceStateSha256))
      || retriedStates.has(execution.stabilityRetrySourceStateSha256)
    ) return false;
    if (sourceExecutionIndex >= 0 && !source) return false;
    const result = commands.find((item) => item.executionId === execution.executionId);
    if (result && result.stabilityRetryOf !== execution.stabilityRetryOf) return false;
    retrySources.add(execution.stabilityRetryOf);
    retriedStates.add(execution.stabilityRetrySourceStateSha256);
  }
  return true;
}

function isEligibleTestStabilityRetry(entry, sourceStateSha256) {
  return entry
    && entry.commandId === 'test'
    && entry.status === 'failed'
    && /^[a-zA-Z0-9._:-]{1,160}$/.test(entry.executionId)
    && entry.timedOut === false
    && entry.worktreeChanged === false
    && Number.isInteger(entry.durationMs)
    && entry.durationMs >= 0
    && entry.durationMs <= MAX_TEST_STABILITY_RETRY_DURATION_MS
    && /^[a-f0-9]{64}$/.test(sourceStateSha256)
    && entry.sourceStateSha256 === sourceStateSha256;
}

function isStoredProgressTransition(value) {
  return value && typeof value === 'object'
    && value.schema === 'agenthub.development-progress-transition'
    && value.schemaVersion === 1
    && /^[a-zA-Z0-9._:-]{1,160}$/.test(value.transitionId)
    && SAFE_PHASES.has(value.phase)
    && typeof value.appliedAt === 'string';
}

function isStoredReview(value) {
  return value && typeof value === 'object'
    && value.schema === 'agenthub.development-review'
    && value.schemaVersion === 1
    && isOptionalPolicyVersion(value.policyVersion)
    && /^[a-zA-Z0-9._:-]{1,160}$/.test(value.reviewId)
    && (value.agentId === 'AG-DEV' || value.agentId === 'AG-SEC' || value.agentId === 'AG-REVIEW')
    && /^[a-zA-Z0-9._:/-]{1,160}$/.test(value.modelId)
    && Number.isInteger(value.findings?.high) && value.findings.high >= 0 && value.findings.high <= 99
    && Number.isInteger(value.findings?.medium) && value.findings.medium >= 0 && value.findings.medium <= 99
    && Number.isInteger(value.findings?.low) && value.findings.low >= 0 && value.findings.low <= 99
    && (value.gate === 'PASS' || value.gate === 'FAIL')
    && /^[a-f0-9]{64}$/.test(value.summarySha256)
    && /^[a-f0-9]{64}$/.test(value.sourceStateSha256)
    && typeof value.reviewedAt === 'string';
}

function isStoredAgentPlan(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.agents)) return false;
  const roles = value.agents.join(',');
  if (value.size === 1) return value.reasonCode === 'focused-low-risk' && roles === 'AG-DEV';
  if (value.size === 2) {
    return (value.reasonCode === 'focused-low-risk' || value.reasonCode === 'bounded-standard')
      && roles === 'AG-DEV,AG-REVIEW';
  }
  if (value.size === 4) {
    return value.reasonCode === 'complex-cross-cutting'
      && roles === 'AG-COORD,PRO,AG-DEV,AG-REVIEW';
  }
  return value.size === 5
    && value.reasonCode === 'security-sensitive-cross-cutting'
    && roles === 'AG-COORD,PRO,AG-DEV,AG-SEC,AG-REVIEW';
}

function isOptionalPolicyVersion(value) {
  return value === undefined || (Number.isInteger(value) && value >= 1 && value <= 1_000);
}

function isStoredModelReservation(value) {
  return value && typeof value === 'object'
    && MODEL_RESERVATION_ID.test(value.reservationId)
    && /^[a-f0-9]{64}$/.test(value.tokenSha256)
    && /^[a-f0-9]{64}$/.test(value.runIdSha256)
    && typeof value.agentId === 'string'
    && /^[A-Z][A-Z0-9-]{1,31}$/.test(value.agentId)
    && (
      value.inputBytes === undefined
      || (Number.isInteger(value.inputBytes)
        && value.inputBytes >= 1
        && value.inputBytes <= DEVELOPMENT_MODEL_BUDGET.maxInputBytesPerCall)
    )
    && (value.inputSha256 === undefined || /^[a-f0-9]{64}$/.test(value.inputSha256))
    && (value.modelRouteSha256 === undefined || /^[a-f0-9]{64}$/.test(value.modelRouteSha256))
    && (value.providerReadinessSha256 === undefined || /^[a-f0-9]{64}$/.test(value.providerReadinessSha256))
    && Number.isInteger(value.maxOutputTokens)
    && value.maxOutputTokens >= 1
    && value.maxOutputTokens <= DEVELOPMENT_MODEL_BUDGET.maxOutputTokensPerCall
    && typeof value.reservedAt === 'string'
    && (value.consumedAt === null || typeof value.consumedAt === 'string')
    && isStoredModelUsageReceipt(value)
    && isStoredModelFailureReceipt(value)
    && (
      value.retryOfReservationId === undefined
      || value.retryOfReservationId === null
      || MODEL_RESERVATION_ID.test(value.retryOfReservationId)
    );
}

function isStoredModelUsageReceipt(value) {
  const absent = [value.observedInputTokens, value.observedOutputTokens, value.usageReportedAt]
    .every((item) => item === undefined || item === null);
  if (absent) return true;
  return typeof value.usageReportedAt === 'string'
    && typeof value.consumedAt === 'string'
    && Number.isInteger(value.inputBytes)
    && Number.isSafeInteger(value.observedInputTokens)
    && value.observedInputTokens >= 0
    && value.observedInputTokens <= value.inputBytes
    && Number.isSafeInteger(value.observedOutputTokens)
    && value.observedOutputTokens >= 0
    && value.observedOutputTokens <= value.maxOutputTokens;
}

function isStoredModelFailureReceipt(value) {
  const absent = [value.failureCode, value.failureAt].every((item) => item === undefined || item === null);
  if (absent) return true;
  return typeof value.failureAt === 'string'
    && typeof value.consumedAt === 'string'
    && DEVELOPMENT_MODEL_FAILURE_RETRYABILITY.has(value.failureCode);
}

function hasValidModelRetryLinks(reservations) {
  const earlier = new Map();
  const retried = new Set();
  for (const reservation of reservations) {
    const retryOf = reservation.retryOfReservationId;
    if (retryOf) {
      const original = earlier.get(retryOf);
      if (
        !original
        || original.retryOfReservationId
        || retried.has(retryOf)
        || DEVELOPMENT_MODEL_FAILURE_RETRYABILITY.get(original.failureCode) !== true
        || !original.failureAt
        || original.agentId !== reservation.agentId
        || original.inputBytes !== reservation.inputBytes
        || original.inputSha256 !== reservation.inputSha256
        || original.modelRouteSha256 !== reservation.modelRouteSha256
        || original.providerReadinessSha256 !== reservation.providerReadinessSha256
        || original.maxOutputTokens !== reservation.maxOutputTokens
        || original.runIdSha256 === reservation.runIdSha256
      ) return false;
      retried.add(retryOf);
    }
    earlier.set(reservation.reservationId, reservation);
  }
  return true;
}

function modelUsage(record) {
  const reservations = Array.isArray(record.modelReservations) ? record.modelReservations : [];
  const costPolicy = record.costPolicy ?? LEGACY_DEVELOPMENT_COST_POLICY;
  const trackedInputReservations = reservations.filter((item) => Number.isInteger(item.inputBytes));
  const usageReceipts = reservations.filter((item) => typeof item.usageReportedAt === 'string');
  const failureReceipts = reservations.filter((item) => typeof item.failureAt === 'string');
  const reservedInputBytes = trackedInputReservations.reduce((total, item) => total + item.inputBytes, 0);
  const reservedOutputTokens = reservations.reduce((total, item) => total + item.maxOutputTokens, 0);
  const startedCalls = reservations.filter((item) => item.consumedAt).length;
  const reservedCostMicros = reservations.reduce((total, item) => total + developmentCostMicros(
    costPolicy,
    item.inputBytes ?? DEVELOPMENT_MODEL_BUDGET.maxInputBytesPerCall,
    item.maxOutputTokens,
  ), 0);
  const observedCostMicros = usageReceipts.reduce((total, item) => total + developmentCostMicros(
    costPolicy,
    item.observedInputTokens,
    item.observedOutputTokens,
  ), 0);
  const unsettledCostMicros = reservations
    .filter((item) => typeof item.usageReportedAt !== 'string')
    .reduce((total, item) => total + developmentCostMicros(
      costPolicy,
      item.inputBytes ?? DEVELOPMENT_MODEL_BUDGET.maxInputBytesPerCall,
      item.maxOutputTokens,
    ), 0);
  const chargedCostMicros = observedCostMicros + unsettledCostMicros;
  return {
    maxCalls: DEVELOPMENT_MODEL_BUDGET.maxCalls,
    maxInputBytes: DEVELOPMENT_MODEL_BUDGET.maxInputBytes,
    maxInputBytesPerCall: DEVELOPMENT_MODEL_BUDGET.maxInputBytesPerCall,
    maxOutputTokens: DEVELOPMENT_MODEL_BUDGET.maxOutputTokens,
    maxOutputTokensPerCall: DEVELOPMENT_MODEL_BUDGET.maxOutputTokensPerCall,
    reservedCalls: reservations.length,
    startedCalls,
    unstartedReservedCalls: reservations.length - startedCalls,
    reservedInputBytes,
    untrackedLegacyInputCalls: reservations.length - trackedInputReservations.length,
    reservedOutputTokens,
    usageReportedCalls: usageReceipts.length,
    usageMissingStartedCalls: startedCalls - usageReceipts.length,
    observedInputTokens: usageReceipts.reduce((total, item) => total + item.observedInputTokens, 0),
    observedOutputTokens: usageReceipts.reduce((total, item) => total + item.observedOutputTokens, 0),
    costCurrency: costPolicy.currency,
    inputMicrosPerMillionTokens: costPolicy.inputMicrosPerMillionTokens,
    outputMicrosPerMillionTokens: costPolicy.outputMicrosPerMillionTokens,
    maxCostMicros: costPolicy.maxCostMicros,
    reservedCostMicros,
    observedCostMicros,
    unsettledCostMicros,
    chargedCostMicros,
    failureReportedCalls: failureReceipts.length,
    retryableFailureCalls: failureReceipts.filter((item) => (
      DEVELOPMENT_MODEL_FAILURE_RETRYABILITY.get(item.failureCode) === true
    )).length,
    transientRetryCalls: reservations.filter((item) => item.retryOfReservationId).length,
    remainingCalls: DEVELOPMENT_MODEL_BUDGET.maxCalls - reservations.length,
    remainingInputBytes: DEVELOPMENT_MODEL_BUDGET.maxInputBytes - reservedInputBytes,
    remainingOutputTokens: DEVELOPMENT_MODEL_BUDGET.maxOutputTokens - reservedOutputTokens,
    remainingCostMicros: costPolicy.maxCostMicros - chargedCostMicros,
  };
}

function secureHashMatches(expectedSha256, value) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256) || typeof value !== 'string' || value.length > 500) return false;
  const expected = Buffer.from(expectedSha256, 'hex');
  const actual = Buffer.from(sha256(value), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function persistSession(stateRoot, record) {
  const target = path.join(stateRoot, `${record.sessionId}.json`);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  const body = `${JSON.stringify(record, null, 2)}\n`;
  try {
    await fsp.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600 });
    await fsp.rename(temporary, target);
  } finally {
    await fsp.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function readSession(stateRoot, sessionId) {
  try {
    const record = normalizeStoredSession(JSON.parse(await fsp.readFile(path.join(stateRoot, `${sessionId}.json`), 'utf8')));
    if (!record) throw new Error('invalid');
    return record;
  } catch {
    throw httpError(404, '开发会话不存在或账本无效');
  }
}

function countExactOccurrences(content, needle) {
  let count = 0;
  let offset = 0;
  while (offset <= content.length - needle.length) {
    const index = content.indexOf(needle, offset);
    if (index < 0) break;
    count += 1;
    if (count > 1) break;
    offset = index + needle.length;
  }
  return count;
}

function normalizeLineEndings(value, lineEnding) {
  return value.replace(/\r\n|\r|\n/g, lineEnding);
}

async function writeTextAtomically(target, content, mode) {
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fsp.writeFile(temporary, content, { encoding: 'utf8', mode });
    await fsp.rename(temporary, target);
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readFilesFromRoot(root, requestedPaths, byteLimit) {
  const unique = [...new Set(requestedPaths.map((item) => String(item)))];
  let total = 0;
  const files = [];
  for (const relativePath of unique) {
    const target = await resolveSafeFile(root, relativePath);
    const buffer = await fsp.readFile(target);
    total += buffer.length;
    if (buffer.length > 256 * 1024 || total > byteLimit) throw httpError(413, '读取内容超过开发上下文上限');
    const content = buffer.toString('utf8');
    if (!Buffer.from(content, 'utf8').equals(buffer)) throw httpError(415, `${relativePath} 不是 UTF-8 文本`);
    files.push({ path: relativePath, content, sha256: sha256(buffer), bytes: buffer.length });
  }
  return files;
}

async function resolveSafeFile(root, relativePath) {
  if (!isSafeRelativePath(relativePath)) throw httpError(400, `路径不在开发预设范围：${relativePath}`);
  const target = path.resolve(root, ...relativePath.split('/'));
  const relation = path.relative(root, target);
  if (relation.startsWith('..') || path.isAbsolute(relation)) throw httpError(400, '路径越出开发根');
  const stat = await fsp.lstat(target).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) throw httpError(400, `只允许读取真实文件：${relativePath}`);
  const real = await fsp.realpath(target);
  const realRelation = path.relative(root, real);
  if (realRelation.startsWith('..') || path.isAbsolute(realRelation)) throw httpError(400, '真实文件路径越出开发根');
  return real;
}

export function isSafeDevelopmentPath(value) {
  return isSafeRelativePath(value);
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 260 || value.includes('\\') || value.includes('\0')) return false;
  if (path.posix.isAbsolute(value) || path.posix.normalize(value) !== value || value.split('/').includes('..')) return false;
  const parts = value.split('/');
  if (parts.some((part) => !part || BLOCKED_PATH_SEGMENTS.has(part))) return false;
  const name = parts.at(-1).toLowerCase();
  if (name === '.env' || name.startsWith('.env.') || /(?:secret|credentials?)\.(?:json|ya?ml|txt)$/i.test(name)) return false;
  return true;
}

function isTestPath(value) {
  return typeof value === 'string'
    && /(?:^|\/)(?:__tests__|tests?)(?:\/|$)|\.(?:test|spec)\.[^/]+$/i.test(value);
}

function isJavaScriptTestPath(value) {
  return isTestPath(value) && /\.[cm]?[jt]sx?$/i.test(value);
}

function isMarkdownPath(value) {
  return typeof value === 'string' && /\.mdx?$/i.test(value);
}

function findAddedMarkdownDuplicate(before, after) {
  const originalCounts = new Map();
  for (const line of before.replace(/\r\n/g, '\n').split('\n')) {
    originalCounts.set(line, (originalCounts.get(line) ?? 0) + 1);
  }
  const addedLines = [];
  for (const line of after.replace(/\r\n/g, '\n').split('\n')) {
    const remaining = originalCounts.get(line) ?? 0;
    if (remaining > 0) originalCounts.set(line, remaining - 1);
    else addedLines.push(line);
  }
  const normalizedBefore = normalizeMarkdownDuplicateText(before);
  const normalizedAfter = normalizeMarkdownDuplicateText(after);
  for (const line of addedLines) {
    const content = line
      .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s*)/, '')
      .replace(/\s+$/g, '');
    const candidates = [content];
    const labelEnd = content.search(/[：:]/);
    if (labelEnd >= 0) candidates.push(content.slice(labelEnd + 1));
    for (const candidate of candidates) {
      const normalized = normalizeMarkdownDuplicateText(candidate)
        .replace(/[。！？!?；;]+$/g, '')
        .trim();
      if (normalized.length < 16 || normalized.length > 240) continue;
      const beforeCount = countMarkdownOccurrences(normalizedBefore, normalized);
      const afterCount = countMarkdownOccurrences(normalizedAfter, normalized);
      if (afterCount >= 2 && afterCount > beforeCount) {
        return '新增 Markdown 说明重复已有正文，必须保留一处清晰表述';
      }
    }
  }
  return '';
}

function normalizeMarkdownDuplicateText(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function countMarkdownOccurrences(value, search) {
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(search, offset)) >= 0) {
    count += 1;
    offset += search.length;
  }
  return count;
}

function requiresBrowserAcceptance(value) {
  return /(?:浏览器验收|浏览器测试|前端|网页|页面|界面|视图|响应式|交互|表单|按钮|弹窗|抽屉|导航|菜单|布局|样式|颜色|图标|动画|web\s*(?:ui|app)|frontend|browser|responsive|\bui\b|\bcss\b|\bhtml\b|\.tsx?\b|\.jsx?\b|\.vue\b|\.svelte\b|src[\\/](?:components|pages|views))/i.test(String(value ?? ''));
}

function isBrowserAcceptancePath(value) {
  return typeof value === 'string'
    && /(?:^|\/)(?:src\/)?(?:components|pages|views)(?:\/|$)|\.(?:html|css|scss|sass|less|tsx|jsx|vue|svelte)$/i.test(value);
}

function stripHtmlComments(value) {
  return value.replace(/<!--[\s\S]*?-->/g, '');
}

function htmlVoidTags(value) {
  return value.match(/<(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b[^>]*>/gi) ?? [];
}

function isSelfClosingHtmlTag(value) {
  return /\/\s*>$/.test(value);
}

function countHeadVoidTags(value) {
  return (value.match(/<(?:base|link|meta)\b[^>]*>/gi) ?? []).length;
}

function validateUnifiedDiff(patch) {
  if (patch.includes('\0') || /(?:GIT binary patch|Binary files .* differ)/.test(patch)) throw httpError(400, '不接受二进制补丁');
  if (/^(?:rename|copy) (?:from|to) /m.test(patch) || /^(?:old|new) mode /m.test(patch)) {
    throw httpError(400, '不接受重命名、复制或权限位变更');
  }
  if (/^(?:new file mode|deleted file mode) (?!100644$)/m.test(patch)) throw httpError(400, '只允许普通文本文件模式');
  const paths = new Set();
  for (const line of patch.split(/\r?\n/)) {
    if (!line.startsWith('--- ') && !line.startsWith('+++ ')) continue;
    const token = line.slice(4).split('\t', 1)[0].trim();
    if (token === '/dev/null') continue;
    if (!/^[ab]\//.test(token) || token.includes('"')) throw httpError(400, '补丁路径格式非法');
    const relative = token.slice(2);
    if (!isSafeRelativePath(relative)) throw httpError(400, `补丁路径不在开发预设范围：${relative}`);
    paths.add(relative);
  }
  if (paths.size < 1 || paths.size > 24) throw httpError(400, '补丁必须包含 1-24 个安全文本路径');
  return [...paths];
}

async function collectDiff(root) {
  const [changed, untracked] = await Promise.all([
    runGit(root, ['diff', '--name-only', '--', '.']),
    runGit(root, ['ls-files', '--others', '--exclude-standard']),
  ]);
  const allChangedPaths = changed.stdout.split(/\r?\n/).filter(Boolean);
  const safeChangedPaths = allChangedPaths.filter(isSafeRelativePath).slice(0, 200);
  const diff = safeChangedPaths.length
    ? await runGit(root, ['diff', '--no-ext-diff', '--unified=3', '--', ...safeChangedPaths])
    : { stdout: '' };
  const paths = untracked.stdout.split(/\r?\n/).filter(Boolean).filter(isSafeRelativePath).slice(0, 24);
  const newFiles = await readFilesFromRoot(root, paths, 256 * 1024);
  return {
    diff: boundedTail(diff.stdout, 640_000),
    newFiles,
    blockedChangedPathCount: allChangedPaths.length - safeChangedPaths.length,
  };
}

async function readProjectInfo(root) {
  const adapters = await Promise.all([
    readNodeProjectInfo(root),
    readPythonProjectInfo(root),
  ]);
  const commandPlan = new Map();
  for (const adapter of adapters) {
    for (const command of adapter.commands) {
      const planned = commandPlan.get(command.commandId) ?? [];
      planned.push(command);
      commandPlan.set(command.commandId, planned);
    }
  }
  const runtimes = adapters.map((item) => item.runtime).filter(Boolean);
  return {
    scripts: [...commandPlan.keys()].sort(),
    acceptanceScripts: adapters.flatMap((item) => item.acceptanceScripts),
    packageManager: runtimes.length ? runtimes.join(' + ') : 'none',
    commandPlan,
  };
}

async function readNodeProjectInfo(root) {
  try {
    const value = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8'));
    const names = value?.scripts && typeof value.scripts === 'object' ? Object.keys(value.scripts) : [];
    const commands = names
      .filter((item) => SAFE_COMMANDS.has(item) && item !== 'git-diff-check')
      .sort()
      .map((commandId) => ({ adapter: 'node', commandId, label: `node:${commandId}` }));
    return {
      commands,
      acceptanceScripts: ['preview', 'dev', 'start'].filter((item) => names.includes(item)),
      runtime: typeof value?.packageManager === 'string' ? value.packageManager.slice(0, 80) : 'npm',
    };
  } catch {
    return { commands: [], acceptanceScripts: [], runtime: '' };
  }
}

async function readPythonProjectInfo(root) {
  const manifestNames = [
    'pyproject.toml',
    'pytest.ini',
    'setup.cfg',
    'tox.ini',
    'requirements.txt',
    'requirements-dev.txt',
    'ruff.toml',
    '.ruff.toml',
    'mypy.ini',
  ];
  const manifestEntries = await Promise.all(manifestNames.map(async (name) => [name, await readOptionalProjectFile(root, name)]));
  const manifests = Object.fromEntries(manifestEntries);
  const [hasSetupPy, testRoot, hasRootIndex, hasPublicIndex, hasAppPy, hasWsgiPy, hasMainPy] = await Promise.all([
    isRegularProjectFile(root, 'setup.py'),
    findPythonTestRoot(root),
    isRegularProjectFile(root, 'index.html'),
    isRegularProjectFile(root, 'public/index.html'),
    isRegularProjectFile(root, 'app.py'),
    isRegularProjectFile(root, 'wsgi.py'),
    isRegularProjectFile(root, 'main.py'),
  ]);
  const manifestText = Object.values(manifests).filter((value) => typeof value === 'string').join('\n');
  const isPythonProject = hasSetupPy
    || testRoot !== null
    || hasRootIndex
    || hasPublicIndex
    || hasAppPy
    || hasWsgiPy
    || hasMainPy
    || Object.values(manifests).some((value) => value !== null);
  if (!isPythonProject) return { commands: [], acceptanceScripts: [], runtime: '' };

  const python = await resolvePythonRuntime(root);
  const commands = [];
  const declaresPytest = manifests['pytest.ini'] !== null
    || /\[tool\.pytest(?:\.|\])/i.test(manifestText)
    || /(?:^|[^a-z0-9_-])pytest(?:[^a-z0-9_-]|$)/im.test(manifestText);
  if (declaresPytest) {
    commands.push({
      adapter: 'python',
      commandId: 'test',
      label: 'python:pytest',
      executable: python.executable,
      args: ['-m', 'pytest', '-p', 'no:cacheprovider'],
    });
  } else if (testRoot !== null) {
    commands.push({
      adapter: 'python',
      commandId: 'test',
      label: 'python:unittest',
      executable: python.executable,
      args: ['-m', 'unittest', 'discover', '-s', testRoot, '-p', 'test*.py'],
    });
  }
  if (manifests['ruff.toml'] !== null
    || manifests['.ruff.toml'] !== null
    || /\[tool\.ruff(?:\.|\])/i.test(manifestText)
    || /(?:^|[^a-z0-9_-])ruff(?:[^a-z0-9_-]|$)/im.test(manifestText)) {
    commands.push({ adapter: 'python', commandId: 'lint', label: 'python:ruff', executable: python.executable, args: ['-m', 'ruff', 'check', '--no-cache', '.'] });
  }
  if (manifests['mypy.ini'] !== null
    || /\[tool\.mypy(?:\.|\])/i.test(manifestText)
    || /(?:^|[^a-z0-9_-])mypy(?:[^a-z0-9_-]|$)/im.test(manifestText)) {
    const cacheDir = process.platform === 'win32' ? 'nul' : '/dev/null';
    commands.push({
      adapter: 'python',
      commandId: 'typecheck',
      label: 'python:mypy',
      executable: python.executable,
      args: ['-m', 'mypy', `--cache-dir=${cacheDir}`, '.'],
    });
  }
  const acceptanceScripts = [];
  const declaresFastApi = /(?:^|[^a-z0-9_-])(?:fastapi|uvicorn)(?:[^a-z0-9_-]|$)/im.test(manifestText);
  const declaresFlask = /(?:^|[^a-z0-9_-])flask(?:[^a-z0-9_-]|$)/im.test(manifestText);
  if (declaresFastApi && (hasMainPy || hasAppPy)) acceptanceScripts.push('python-fastapi');
  if (declaresFlask && (hasAppPy || hasWsgiPy)) acceptanceScripts.push('python-flask');
  if (hasRootIndex || hasPublicIndex) acceptanceScripts.push('python-static');
  return { commands, acceptanceScripts, runtime: python.label };
}

async function readOptionalProjectFile(root, relativePath) {
  const target = path.join(root, relativePath);
  const stat = await fsp.lstat(target).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) return null;
  return fsp.readFile(target, 'utf8').catch(() => null);
}

async function isRegularProjectFile(root, relativePath) {
  let current = root;
  const parts = relativePath.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = await fsp.lstat(current).catch(() => null);
    if (!stat || stat.isSymbolicLink()) return false;
    if (index < parts.length - 1 && !stat.isDirectory()) return false;
    if (index === parts.length - 1) return stat.isFile();
  }
  return false;
}

async function findPythonTestRoot(root) {
  for (const relativePath of ['tests', 'test']) {
    if (await containsPythonTestFile(root, relativePath)) return relativePath;
  }
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  return entries.some((entry) => entry.isFile() && /^test.*\.py$/i.test(entry.name)) ? '.' : null;
}

async function containsPythonTestFile(root, relativePath) {
  const queue = [relativePath];
  let inspected = 0;
  while (queue.length && inspected < 2_000) {
    const current = queue.shift();
    const currentPath = path.join(root, ...current.split('/'));
    const currentStat = await fsp.lstat(currentPath).catch(() => null);
    if (!currentStat?.isDirectory() || currentStat.isSymbolicLink()) continue;
    const entries = await fsp.readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      inspected += 1;
      if (entry.isSymbolicLink()) continue;
      if (entry.isFile() && /^test.*\.py$/i.test(entry.name)) return true;
      if (entry.isDirectory() && !BLOCKED_PATH_SEGMENTS.has(entry.name)) queue.push(path.posix.join(current, entry.name));
      if (inspected >= 2_000) break;
    }
  }
  return false;
}

async function resolvePythonRuntime(root) {
  const candidates = process.platform === 'win32'
    ? [
      ['.venv/Scripts/python.exe', 'python (.venv)'],
      ['venv/Scripts/python.exe', 'python (venv)'],
    ]
    : [
      ['.venv/bin/python', 'python (.venv)'],
      ['venv/bin/python', 'python (venv)'],
    ];
  for (const [relativePath, label] of candidates) {
    const target = path.join(root, ...relativePath.split('/'));
    const stat = await fsp.lstat(target).catch(() => null);
    if (stat?.isFile() && !stat.isSymbolicLink()) return { executable: target, label };
  }
  return { executable: process.platform === 'win32' ? 'python' : 'python3', label: 'python' };
}

async function runProjectCommand(root, projectInfo, commandId, timeoutMs) {
  const commands = projectInfo.commandPlan.get(commandId) ?? [];
  const output = [];
  let latest = { code: 0, signal: null, stdout: '', stderr: '', output: '' };
  for (const command of commands) {
    const result = command.adapter === 'node'
      ? await runNpmScript(root, commandId, timeoutMs)
      : await runProcess(command.executable, command.args, {
        cwd: root,
        env: { ...sanitizedChildEnv(), PYTHONDONTWRITEBYTECODE: '1' },
        timeoutMs,
      });
    output.push(`[${command.label}]${result.output ? `\n${result.output}` : ''}`);
    latest = result;
    if (result.code !== 0) break;
  }
  const combined = output.join('\n');
  return { ...latest, stdout: combined, stderr: '', output: combined };
}

async function runNpmScript(root, script, timeoutMs) {
  const env = sanitizedChildEnv();
  if (process.platform === 'win32') {
    const command = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    return runProcess(command, ['/d', '/s', '/c', `npm.cmd run ${script}`], { cwd: root, env, timeoutMs });
  }
  return runProcess('npm', ['run', script], { cwd: root, env, timeoutMs });
}

async function runGit(root, args, options = {}) {
  const result = await runProcess('git', ['-c', 'core.quotepath=false', '-C', root, ...args], {
    cwd: root,
    env: sanitizedChildEnv(),
    timeoutMs: options.timeoutMs ?? 120_000,
    input: options.input,
  });
  const allowed = options.allowedExitCodes ?? [0];
  if (!allowed.includes(result.code)) throw httpError(409, boundedTail(result.output, 4_000) || `git ${args[0]} 失败`);
  return result;
}

function runProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      void stopOwnedProcessTree(child).catch(() => {
        if (child.exitCode === null) child.kill();
      });
    }, options.timeoutMs);
    const append = (target, chunk) => boundedTail(target + chunk.toString('utf8'), MAX_PROCESS_BYTES);
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(httpError(500, error.message));
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const timeoutNotice = timedOut
        ? `[agenthub] 固定命令超过 ${options.timeoutMs}ms，已终止本次受管进程树`
        : '';
      const output = [stdout, stderr, timeoutNotice].filter(Boolean).join('\n');
      resolve({ code: timedOut ? 1 : Number.isInteger(code) ? code : 1, signal, stdout, stderr, output, timedOut });
    });
    if (options.input !== undefined) child.stdin.end(options.input, 'utf8');
    else child.stdin.end();
  });
}

async function stopOwnedProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.once('error', () => resolve());
      killer.once('close', () => resolve());
    });
    if (child.exitCode === null) {
      await Promise.race([new Promise((resolve) => child.once('close', resolve)), delay(1_500)]);
    }
    if (child.exitCode === null) child.kill();
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await Promise.race([new Promise((resolve) => child.once('close', resolve)), delay(1_500)]);
  if (child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

function sanitizedChildEnv() {
  const allowed = /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|COMMONPROGRAMFILES|COMSPEC|OS|NUMBER_OF_PROCESSORS)$/i;
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.test(key))),
    CI: '1',
    NO_COLOR: '1',
  };
}

async function assertWritablePatchPaths(root, paths) {
  for (const relativePath of paths) {
    let cursor = root;
    for (const segment of relativePath.split('/')) {
      cursor = path.join(cursor, segment);
      const stat = await fsp.lstat(cursor).catch(() => null);
      if (!stat) break;
      if (stat.isSymbolicLink()) throw httpError(400, `补丁路径不得经过符号链接或目录联接：${relativePath}`);
    }
    const parent = await nearestExistingParent(path.dirname(path.resolve(root, ...relativePath.split('/'))));
    const realParent = await fsp.realpath(parent);
    const relation = path.relative(root, realParent);
    if (relation.startsWith('..') || path.isAbsolute(relation)) throw httpError(400, '补丁真实路径越出开发根');
  }
}

async function capturePatchPathStates(root, paths) {
  const states = [];
  for (const relativePath of paths) {
    const target = path.resolve(root, ...relativePath.split('/'));
    const stat = await fsp.lstat(target).catch(() => null);
    if (!stat) {
      states.push({ target, existed: false, content: null, mode: 0o600 });
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw httpError(400, `补丁目标必须是普通文件或新文件：${relativePath}`);
    states.push({ target, existed: true, content: await fsp.readFile(target), mode: stat.mode });
  }
  return states;
}

async function restorePatchPathStates(states) {
  for (const state of [...states].reverse()) {
    if (state.existed) await writeBufferAtomically(state.target, state.content, state.mode);
    else await fsp.rm(state.target, { force: true });
  }
}

async function assertChangedSourceQuality(paths, states) {
  for (let index = 0; index < paths.length; index += 1) {
    const relativePath = paths[index];
    const state = states[index];
    if (
      !state
      || (!state.existed && !isMarkdownPath(relativePath))
      || (!/\.html$/i.test(relativePath) && !isJavaScriptTestPath(relativePath) && !isMarkdownPath(relativePath))
    ) continue;
    const afterStat = await fsp.lstat(state.target).catch(() => null);
    if (!afterStat) continue;
    if (!afterStat.isFile() || afterStat.isSymbolicLink()) throw httpError(409, `源码质量门拒绝 ${relativePath}：目标不再是普通文件`);
    const afterBuffer = await fsp.readFile(state.target);
    const before = state.existed ? state.content.toString('utf8') : '';
    const after = afterBuffer.toString('utf8');
    if (
      (state.existed && !Buffer.from(before, 'utf8').equals(state.content))
      || !Buffer.from(after, 'utf8').equals(afterBuffer)
    ) {
      throw httpError(415, `${relativePath} 不是 UTF-8 文本`);
    }
    const problem = findDevelopmentSourceQualityProblem(relativePath, before, after);
    if (problem) throw httpError(409, `源码质量门拒绝 ${relativePath}：${problem}`);
  }
}

async function runDevelopmentDiffCheck(root) {
  const result = await runGit(root, ['diff', '--check'], { allowedExitCodes: [0, 2], timeoutMs: 120_000 });
  if (result.code !== 0) return result;
  const problem = await findChangedSourceQualityProblem(root);
  if (!problem) return result;
  const output = [result.output, `[AgentHub] 源码质量门拒绝：${problem}`].filter(Boolean).join('\n');
  return { ...result, code: 1, stdout: output, stderr: '', output };
}

async function findChangedSourceQualityProblem(root) {
  const [tracked, untracked] = await Promise.all([
    runGit(root, ['diff', '--name-only', '--diff-filter=ACMRTUXB', '--', '.']),
    runGit(root, ['ls-files', '--others', '--exclude-standard']),
  ]);
  const candidates = new Map();
  for (const relativePath of tracked.stdout.split(/\r?\n/).filter(Boolean)) candidates.set(relativePath, true);
  for (const relativePath of untracked.stdout.split(/\r?\n/).filter(Boolean)) candidates.set(relativePath, false);
  const paths = [...candidates.keys()]
    .filter(isSafeRelativePath)
    .filter((relativePath) => (
      /\.html$/i.test(relativePath) || isJavaScriptTestPath(relativePath) || isMarkdownPath(relativePath)
    ));
  if (paths.length > 200) return '变更 HTML/测试/Markdown 文件超过 200 个，无法完成有界源码质量检查';
  for (const relativePath of paths) {
    const target = await resolveSafeFile(root, relativePath);
    const afterBuffer = await fsp.readFile(target);
    if (afterBuffer.length > MAX_REPLACED_FILE_BYTES) return `${relativePath} 超过 512KB 源码质量检查上限`;
    const after = afterBuffer.toString('utf8');
    if (!Buffer.from(after, 'utf8').equals(afterBuffer)) return `${relativePath} 不是 UTF-8 文本`;
    const tracked = candidates.get(relativePath);
    if (!tracked && !isMarkdownPath(relativePath)) continue;
    const original = tracked
      ? await runGit(root, ['show', `HEAD:${relativePath}`], { allowedExitCodes: [0, 1, 128] })
      : { code: 0, stdout: '' };
    if (original.code !== 0) return `${relativePath} 无法读取 HEAD 基线`;
    const problem = findDevelopmentSourceQualityProblem(relativePath, original.stdout, after);
    if (problem) return `${relativePath}：${problem}`;
  }
  return '';
}

async function writeBufferAtomically(target, content, mode) {
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fsp.writeFile(temporary, content, { mode });
    await fsp.rename(temporary, target);
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function nearestExistingParent(candidate) {
  let cursor = candidate;
  while (true) {
    const stat = await fsp.lstat(cursor).catch(() => null);
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw httpError(400, '补丁父路径不是可信目录');
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) throw httpError(400, '补丁父路径不存在');
    cursor = parent;
  }
}

function sanitizeGitStatus(value) {
  let blocked = 0;
  const visible = [];
  for (const line of String(value).split(/\r?\n/).filter(Boolean)) {
    const candidate = extractStatusCandidate(line);
    if (candidate && isSafeRelativePath(candidate)) visible.push(line);
    else blocked += 1;
  }
  if (blocked) visible.push(`!! [${blocked} blocked path(s) omitted]`);
  return visible.join('\n');
}

function extractStatusCandidate(line) {
  return String(line).slice(3).replace(/^"|"$/g, '').split(' -> ').at(-1) ?? '';
}

async function workingTreeStateSha256(root, statusText) {
  const entries = [];
  for (const line of String(statusText).split(/\r?\n/).filter(Boolean)) {
    const relativePath = extractStatusCandidate(line);
    const entry = { lineSha256: sha256(line), kind: 'blocked', contentSha256: '' };
    if (isSafeRelativePath(relativePath)) {
      const target = path.resolve(root, ...relativePath.split('/'));
      const stat = await fsp.lstat(target).catch(() => null);
      if (!stat) entry.kind = 'missing';
      else if (stat.isSymbolicLink()) entry.kind = 'symlink';
      else if (stat.isFile()) {
        entry.kind = 'file';
        entry.contentSha256 = await sha256File(target);
      } else entry.kind = 'other';
    }
    entries.push(entry);
  }
  return sha256(JSON.stringify(entries));
}

function normalizeIdentifier(value, max, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!new RegExp(`^[a-zA-Z0-9._:-]{1,${max}}$`).test(text)) throw httpError(400, `${label} 非法`);
  return text;
}

function normalizeInternalTimeout(value, fallback) {
  if (value === undefined) return fallback;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > fallback) {
    throw new Error('内部项目命令超时配置非法');
  }
  return timeout;
}

function normalizeDevelopmentTask(value) {
  const task = typeof value === 'string' ? value.trim() : '';
  if (!task || task.length > MAX_TASK_CHARS) throw httpError(400, '开发任务为空或超过 12000 字符');
  return task;
}

function normalizeDevelopmentCostPolicy(value) {
  const normalized = normalizeStoredDevelopmentCostPolicy(value);
  if (!normalized) {
    throw httpError(
      400,
      '新开发会话必须确认人民币输入费率、输出费率与费用硬上限',
    );
  }
  return normalized;
}

function normalizeStoredDevelopmentCostPolicy(value) {
  if (
    !value
    || typeof value !== 'object'
    || value.currency !== 'CNY'
    || !Number.isSafeInteger(value.inputMicrosPerMillionTokens)
    || value.inputMicrosPerMillionTokens < 1
    || value.inputMicrosPerMillionTokens > MAX_DEVELOPMENT_RATE_MICROS_PER_MILLION_TOKENS
    || !Number.isSafeInteger(value.outputMicrosPerMillionTokens)
    || value.outputMicrosPerMillionTokens < 1
    || value.outputMicrosPerMillionTokens > MAX_DEVELOPMENT_RATE_MICROS_PER_MILLION_TOKENS
    || !Number.isSafeInteger(value.maxCostMicros)
    || value.maxCostMicros < 1
    || value.maxCostMicros > MAX_DEVELOPMENT_COST_MICROS
  ) return null;
  return {
    currency: 'CNY',
    inputMicrosPerMillionTokens: value.inputMicrosPerMillionTokens,
    outputMicrosPerMillionTokens: value.outputMicrosPerMillionTokens,
    maxCostMicros: value.maxCostMicros,
  };
}

function sameDevelopmentCostPolicy(left, right) {
  return left?.currency === right?.currency
    && left?.inputMicrosPerMillionTokens === right?.inputMicrosPerMillionTokens
    && left?.outputMicrosPerMillionTokens === right?.outputMicrosPerMillionTokens
    && left?.maxCostMicros === right?.maxCostMicros;
}

function developmentCostMicros(costPolicy, inputTokens, outputTokens) {
  const numerator = (
    BigInt(inputTokens) * BigInt(costPolicy.inputMicrosPerMillionTokens)
    + BigInt(outputTokens) * BigInt(costPolicy.outputMicrosPerMillionTokens)
  );
  return Number((numerator + 999_999n) / 1_000_000n);
}

function normalizeModelId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^[a-zA-Z0-9._:/-]{1,160}$/.test(text)) throw httpError(400, 'modelId 非法');
  return text;
}

function requireSessionId(value) {
  const sessionId = typeof value === 'string' ? value : '';
  if (!SESSION_ID.test(sessionId)) throw httpError(400, 'sessionId 非法');
  return sessionId;
}

function normalizePathForIdentity(value) {
  const resolved = path.resolve(value).replaceAll('\\', '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalizePathForIdentity(left) === normalizePathForIdentity(right);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sha256File(value) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(value)) hash.update(chunk);
  return hash.digest('hex');
}

function boundedTail(value, max) {
  const text = String(value ?? '');
  return text.length <= max ? text : text.slice(-max);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeStaleTempFiles(stateRoot) {
  for (const entry of await fsp.readdir(stateRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.tmp')) await fsp.rm(path.join(stateRoot, entry.name), { force: true });
  }
}
