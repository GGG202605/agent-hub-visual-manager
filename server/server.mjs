/**
 * v2.0 AgentHub Visual Manager 本地服务（零依赖，Node >= 20）。
 *
 * 用法：node server/server.mjs --workspace <项目根目录> [--port 8787]
 *   [--enable-safe-pilot-issuance --safe-pilot-task-sha256 <hash>
 *    --safe-pilot-context-sha256 <hash> --safe-pilot-profile-sha256 <hash>]
 *   <项目根目录> 是包含 .agent-hub 的真实项目目录；运行时可经 API 切换。
 *
 * 端点：
 *   GET  /api/health            服务与工作区状态
 *   GET  /api/project           读取当前工作区 .agent-hub（allowlist）
 *   GET  /api/events            SSE：文件变化 change / 工作区切换 workspace
 *   GET  /api/workspaces        当前 + 最近工作区列表
 *   POST /api/workspace         切换工作区 {path}
 *   GET  /api/receipts          执行回执台账（内存）
 *   GET  /api/runtime-state     运行事件快照 + 会话级 Agent 权限
 *   POST /api/permissions       人工更新单个 Agent 的单项会话权限
 *   GET  /api/checkpoints       当前工作区最新可恢复检查点列表
 *   GET  /api/checkpoint        按 runId 读取最新检查点
 *   POST /api/checkpoints       保存不可变 DAG 检查点 revision
 *   GET  /api/orchestration/runs 真实模型编排 run 账本
 *   POST /api/orchestration/cancel 取消 run 并中止活跃上游调用
 *   POST /api/orchestration/acceptance 本地任务验收 Provider 返回
 *   POST /api/safe-pilot/preflight DemoScenario014 四 Agent 启动包预检（不签发、不调用模型）
 *   POST /api/safe-pilot/authorizations 四 Agent 单 run 授权（默认关闭，需启动参数）
 *   POST /api/safe-pilot/retry 四 Agent 单次人工重试门
 *   POST /api/safe-pilot/human-acceptance 四 Agent 最终人工验收门
 *   GET  /api/patches/proposals    已校验且仍锁定的补丁提案摘要
 *   POST /api/patches/proposals    校验并登记补丁提案（不应用、不写源码）
 *   POST /api/llm               智能体请求转发
 *   POST /api/approvals/grant   为一次明确点击签发短时动作票据
 *   POST /api/execute           受控执行：save-note | run-build | patch-preflight | patch-apply
 *   GET  /api/development/preset 默认本地自主开发预设
 *   POST /api/development/preflight 零落盘校验 Git 根、动态编队与固定验证能力
 *   POST /api/development/*     会话绑定的开发检查、补丁、固定验证命令与交付门禁
 *   GET  /*                     托管 dist/ 构建产物（产品模式，start-all.bat）
 *
 * 安全：仅绑定 127.0.0.1；Observer 写入仍限 <workspace>/ai-output/；Development Mode
 *       另行绑定一个显式 Git 根，只开放校验过的补丁、固定验证命令和只读 git 状态；
 *       不提供 stage/commit/push 或任意 shell；API Key 仅存在于单次请求。
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  ORCHESTRATION_LIMITS,
  SERVER_RETENTION_LIMITS,
  SAFE_PILOT_AGENT_ORDER,
  CAPABILITY_DEFINITIONS,
  buildOperatorEvidenceExportV1,
  buildProviderRequest,
  canReopenCompletedSingleAgentRun,
  classifyModelCallFailure,
  createActionFingerprint,
  createApprovalToken,
  createBoundedResponseReplayCache,
  createSafePilotPreflight,
  createDefaultPermissionProfiles,
  createSessionToken,
  createWorkspaceId,
  debounce,
  describeProviderEmptyResponse,
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
  normalizePermissionUpdate,
  normalizePatchProposal,
  planBoundedRecordAdmission,
  normalizeSafePilotIssuerPins,
  normalizeSafePilotPreflight,
  resolveSafeWritePath,
  retainLatestRecords,
  safePilotActiveElapsedMs,
  safePilotActiveTimeoutExpired,
  safePilotHumanWaitExpired,
  validateSafePilotRetryRepairMessages,
  sha256Hex,
  stableStringify,
  validateLlmPayload,
  validateSafePilotIssuerPins,
  verifyApprovalToken,
} from './serverLib.mjs';
import { applyPatchTransaction, recoverPatchTransactions } from './patchTransaction.mjs';
import { createDevelopmentManager } from './developmentMode.mjs';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(SERVER_DIR, '..', 'dist');
const SERVER_VERSION = '2.0.0';
const DEVELOPMENT_RUN_ID = /^dev-[a-f0-9-]{36}-.+/;
const DEVELOPMENT_RESPONSE_UNAVAILABLE_ERROR = '开发模型响应不可重放：内存缓存已过期、已淘汰、工作区已切换或服务已重启；请以新 runId 重新签发';
const DEVELOPMENT_REPLAYABLE_OPERATIONS = new Map([
  ['/api/development/sessions', { identityField: 'creationId', cacheSuccess: false }],
  ['/api/development/sessions/resume', { identityField: 'sessionId', cacheSuccess: false }],
  ['/api/development/sessions/progress', { identityField: 'transitionId', cacheSuccess: false }],
  ['/api/development/model-call', { identityField: 'runId', cacheSuccess: false }],
  ['/api/development/apply', { identityField: 'changeSetId', cacheSuccess: true }],
  ['/api/development/replace', { identityField: 'changeSetId', cacheSuccess: true }],
  ['/api/development/replace-batch', { identityField: 'changeSetId', cacheSuccess: true }],
  ['/api/development/command', { identityField: 'executionId', cacheSuccess: true, cacheKind: 'command' }],
  ['/api/development/acceptance', { identityField: 'acceptanceId', cacheSuccess: false }],
  ['/api/development/review', { identityField: 'reviewId', cacheSuccess: true }],
  ['/api/development/finalize', { identityField: 'sessionId', cacheSuccess: false }],
]);

const args = process.argv.slice(2);
const initialWorkspace = readArg(args, '--workspace');
const port = Number(readArg(args, '--port') ?? 8787);
const operatorInstanceId = readArg(args, '--operator-instance-id') ?? '';
const developmentStateRoot = readArg(args, '--development-state-root') ?? '';
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error('AgentHub 本地服务启动失败: 端口必须为 1-65535 的整数');
  process.exit(1);
}
if (operatorInstanceId && !/^[a-f0-9]{64}$/.test(operatorInstanceId)) {
  console.error('AgentHub 本地服务启动失败: 启动器进程标记非法');
  process.exit(1);
}
const safePilotIssuanceRequested = args.includes('--enable-safe-pilot-issuance');
const checkpointPersistenceEnabled = args.includes('--enable-checkpoints');
const safePilotIssuerPins = normalizeSafePilotIssuerPins({
  taskSha256: readArg(args, '--safe-pilot-task-sha256'),
  contextSha256: readArg(args, '--safe-pilot-context-sha256'),
  profileSha256: readArg(args, '--safe-pilot-profile-sha256'),
});
const safePilotIssuanceEnabled = safePilotIssuanceRequested && safePilotIssuerPins.ready;
const allowedHostHeaders = new Set([
  `127.0.0.1:${port}`,
  `localhost:${port}`,
]);

if (!initialWorkspace) {
  console.error('缺少 --workspace 参数。用法：node server/server.mjs --workspace <项目根目录> [--port 8787]');
  process.exit(1);
}

/** 运行时状态 */
let workspaceRoot = '';
let agentHubDir = '';
let watcher = null;
const recentWorkspaces = [];
const sseClients = new Set();
const sessionToken = createSessionToken();
const serviceInstanceId = sha256Hex(sessionToken).slice(0, 24);
const operatorIdentity = Object.freeze({
  managed: Boolean(operatorInstanceId),
  processId: process.pid,
  markerSha256Prefix: operatorInstanceId ? sha256Hex(operatorInstanceId).slice(0, 16) : '',
  entrySha256Prefix: sha256Hex(fileURLToPath(import.meta.url)).slice(0, 16),
});
const receiptsByWorkspace = new Map();
const approvals = new Map();
const idempotencyResults = new Map();
const activeRunKeys = new Set();
const CHECKPOINT_SUBDIR = '.agenthub-checkpoints';
const permissionProfiles = new Map(
  createDefaultPermissionProfiles().map((profile) => [profile.agentId, profile.capabilities]),
);
const runtimeEventsByWorkspace = new Map();
const runtimeEventSeqByWorkspace = new Map();
const orchestrationRunsByWorkspace = new Map();
const activeModelCalls = new Map();
const developmentModelResponses = createBoundedResponseReplayCache();
const developmentOperationResponses = createBoundedResponseReplayCache();
const developmentCommandResponses = createBoundedResponseReplayCache({ completedLimit: 20, ttlMs: 2 * 60_000 });
const developmentIssuedModelInputs = createBoundedResponseReplayCache({
  completedLimit: 128,
  ttlMs: 10 * 60_000,
});
const developmentOperationFlights = new Map();
const patchProposalsByWorkspace = new Map();
const safePilotAuthorizationsByWorkspace = new Map();
let workspaceSwitchInProgress = false;
let workspaceGeneration = 0;
const developmentManager = await createDevelopmentManager({
  stateRoot: developmentStateRoot,
  requireExplicitCostPolicy: true,
});

const switched = await switchWorkspace(path.resolve(initialWorkspace));
if (!switched.ok) {
  console.error(switched.error);
  process.exit(1);
}
const startupRecovery = switched.recovery;
appendRuntimeEvent({
  category: 'system',
  type: 'workspace_ready',
  status: 'info',
  title: '本地协同服务已就绪',
  summary: '运行事件与权限策略仅保存在当前服务进程内。',
});
if (startupRecovery.length) {
  appendRuntimeEvent({
    category: 'security',
    type: 'patch_transaction_recovered',
    status: 'succeeded',
    title: '补丁事务恢复完成',
    summary: `${startupRecovery.length} 个事务已恢复或完成清理`,
  });
}

/* ---------- 工作区管理 ---------- */

async function switchWorkspace(candidateRoot) {
  if (workspaceSwitchInProgress) return { ok: false, error: '工作区切换正在进行' };
  workspaceSwitchInProgress = true;
  try {
    if (activeModelCalls.size > 0 || activeRunKeys.size > 0) {
      return { ok: false, error: '当前仍有模型调用或受控动作，完成或取消后再切换' };
    }
    let nextRoot;
    try {
      nextRoot = fs.realpathSync.native(path.resolve(candidateRoot));
    } catch {
      return { ok: false, error: '工作区路径不存在或无法解析' };
    }
    const nextHub = path.join(nextRoot, '.agent-hub');
    if (!fs.existsSync(nextHub) || !fs.statSync(nextHub).isDirectory()) {
      return { ok: false, error: `工作区内未找到 .agent-hub 目录：${nextHub}` };
    }
    if (fs.lstatSync(nextRoot).isSymbolicLink() || fs.lstatSync(nextHub).isSymbolicLink()) {
      return { ok: false, error: '工作区或 .agent-hub 不得是符号链接/目录联接' };
    }

    let recovery;
    try {
      recovery = await recoverPatchTransactions(nextRoot);
    } catch (error) {
      return { ok: false, error: `补丁事务恢复检查失败：${error instanceof Error ? error.message : '未知错误'}` };
    }
    const recoveryFailures = recovery.filter((record) => record.status === 'recovery_failed');
    if (recoveryFailures.length) {
      return {
        ok: false,
        error: `存在未恢复补丁事务：${recoveryFailures.map((record) => record.transactionId).join(', ')}`,
      };
    }

    if (workspaceRoot && nextRoot !== workspaceRoot) {
      developmentModelResponses.clearCompleted();
      developmentCommandResponses.clearCompleted();
      developmentIssuedModelInputs.clearCompleted();
    }
    watcher?.close();
    watcher = null;
    workspaceRoot = nextRoot;
    workspaceGeneration += 1;
    agentHubDir = nextHub;

    if (!recentWorkspaces.includes(nextRoot)) recentWorkspaces.unshift(nextRoot);
    else {
      recentWorkspaces.splice(recentWorkspaces.indexOf(nextRoot), 1);
      recentWorkspaces.unshift(nextRoot);
    }
    if (recentWorkspaces.length > 10) recentWorkspaces.length = 10;

    try {
      watcher = fs.watch(agentHubDir, { recursive: true }, () => notifyChange());
    } catch {
      console.warn('fs.watch recursive 不可用，实时推送退化为手动刷新');
    }
    return { ok: true, recovery };
  } finally {
    workspaceSwitchInProgress = false;
  }
}

const notifyChange = debounce(() => broadcast('change', String(Date.now())), 400);

function broadcast(event, data) {
  for (const client of sseClients) {
    client.write(`event: ${event}\ndata: ${data}\n\n`);
  }
}

function permissionStatePayload() {
  return {
    definitions: CAPABILITY_DEFINITIONS,
    profiles: [...permissionProfiles.entries()].map(([agentId, capabilities]) => ({
      agentId,
      capabilities: { ...capabilities },
    })),
  };
}

function hasCapability(agentId, capability) {
  const canonical = normalizeAgentIdentifier(agentId);
  return Boolean(canonical && permissionProfiles.get(canonical)?.[capability]);
}

function appendRuntimeEvent(entry, eventWorkspace = workspaceRoot) {
  const workspaceId = createWorkspaceId(eventWorkspace);
  const nextSeq = (runtimeEventSeqByWorkspace.get(eventWorkspace) ?? 0) + 1;
  runtimeEventSeqByWorkspace.set(eventWorkspace, nextSeq);
  const event = {
    id: `${workspaceId}:${nextSeq}`,
    seq: nextSeq,
    at: new Date().toISOString(),
    workspaceId,
    category: entry.category,
    type: entry.type,
    status: entry.status,
    title: String(entry.title ?? '').slice(0, 160),
    summary: String(entry.summary ?? '').slice(0, 1_200),
    ...(normalizeAgentIdentifier(entry.agentId) ? { agentId: normalizeAgentIdentifier(entry.agentId) } : {}),
    ...(typeof entry.runId === 'string' && entry.runId ? { runId: entry.runId.slice(0, 160) } : {}),
  };
  const events = runtimeEventsByWorkspace.get(eventWorkspace) ?? [];
  events.push(event);
  if (events.length > 300) events.splice(0, events.length - 300);
  runtimeEventsByWorkspace.set(eventWorkspace, events);
  if (eventWorkspace === workspaceRoot) broadcast('runtime', JSON.stringify(event));
  return event;
}

function workspaceOrchestrationRuns(eventWorkspace = workspaceRoot) {
  let runs = orchestrationRunsByWorkspace.get(eventWorkspace);
  if (!runs) {
    runs = new Map();
    orchestrationRunsByWorkspace.set(eventWorkspace, runs);
  }
  return runs;
}

function publicOrchestrationRun(run, eventWorkspace = workspaceRoot) {
  const safePilotAuthorization = run.status === 'completed'
    ? safePilotAuthorizationForRun(run.runId, eventWorkspace)
    : null;
  const operatorEvidenceEligible = Boolean(
    safePilotAuthorization
    && buildOperatorEvidenceExportV1({
      run,
      authorization: safePilotAuthorization,
      exportedAt: run.updatedAt,
      serverVersion: SERVER_VERSION,
    }).ok,
  );
  return {
    runId: run.runId,
    status: run.status,
    policy: { ...run.policy },
    callsStarted: run.callsStarted,
    callsSucceeded: run.callsSucceeded,
    callsFailed: run.callsFailed,
    reservedOutputTokens: run.reservedOutputTokens,
    observedOutputTokens: run.observedOutputTokens,
    evidence: run.evidence.map((item) => ({ ...item })),
    operatorEvidenceEligible,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    ...(run.cancelledAt ? { cancelledAt: run.cancelledAt } : {}),
  };
}

function orchestrationRunsPayload(eventWorkspace = workspaceRoot) {
  return [...workspaceOrchestrationRuns(eventWorkspace).values()]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((run) => publicOrchestrationRun(run, eventWorkspace));
}

function workspaceSafePilotAuthorizations(eventWorkspace = workspaceRoot) {
  let records = safePilotAuthorizationsByWorkspace.get(eventWorkspace);
  if (!records) {
    records = new Map();
    safePilotAuthorizationsByWorkspace.set(eventWorkspace, records);
  }
  return records;
}

function pruneMapForAdmission(records, { limit, terminalStatuses = [], now = Date.now() }) {
  const plan = planBoundedRecordAdmission(
    [...records.entries()].map(([id, record]) => ({
      id,
      status: record.status,
      expiresAt: record.expiresAt,
    })),
    { limit, terminalStatuses, now },
  );
  for (const id of plan.removableIds) records.delete(id);
  return plan;
}

function safePilotAuthorizationForRun(runId, eventWorkspace = workspaceRoot) {
  return [...workspaceSafePilotAuthorizations(eventWorkspace).values()].find((record) => record.runId === runId) ?? null;
}

function safePilotBlocksSideEffects(runId, eventWorkspace = workspaceRoot) {
  const record = safePilotAuthorizationForRun(runId, eventWorkspace);
  return Boolean(record && record.profile.sideEffectsAllowed === false);
}

function publicSafePilotAuthorization(record) {
  const activeElapsedMs = safePilotActiveElapsedMs(
    record.usage.activeElapsedMs,
    record.activeSegmentStartedAtMs,
  );
  return {
    authorizationId: record.authorizationId,
    runId: record.runId,
    status: record.status,
    profileId: record.profile.profileId,
    taskSha256: record.taskSha256,
    contextSha256: record.contextSha256,
    profileSha256: record.profileSha256,
    authorizationSha256: record.authorizationSha256,
    expiresAt: record.expiresAt,
    humanWaitDeadlineAt: Number.isFinite(record.humanWaitStartedAtMs)
      ? record.humanWaitStartedAtMs + record.profile.budget.maxHumanWaitMs
      : null,
    usage: { ...record.usage, activeElapsedMs },
    acceptedAgentIds: [...record.acceptedAgentIds],
  };
}

function verifySafePilotToken(record, token) {
  return verifyApprovalToken(
    sessionToken,
    record.authorizationId,
    record.authorizationSha256,
    record.expiresAt,
    token,
  );
}

function safePilotAuthorizationExpired(record) {
  if (Date.now() <= record.expiresAt) return false;
  markSafePilotTerminal(record, workspaceRoot, 'expired');
  return true;
}

function pauseSafePilotActiveClock(record, humanWait = false, now = Date.now()) {
  record.usage.activeElapsedMs = safePilotActiveElapsedMs(
    record.usage.activeElapsedMs,
    record.activeSegmentStartedAtMs,
    now,
  );
  record.activeSegmentStartedAtMs = null;
  record.humanWaitStartedAtMs = humanWait ? now : null;
}

function resumeSafePilotActiveClock(record, now = Date.now()) {
  record.humanWaitStartedAtMs = null;
  if (!Number.isFinite(record.activeSegmentStartedAtMs)) record.activeSegmentStartedAtMs = now;
}

function safePilotRecordActiveTimeoutExpired(record, now = Date.now()) {
  return safePilotActiveTimeoutExpired(
    record.usage.activeElapsedMs,
    record.activeSegmentStartedAtMs,
    record.profile.budget.totalTimeoutMs,
    now,
  );
}

function safePilotRecordHumanWaitExpired(record, now = Date.now()) {
  return safePilotHumanWaitExpired(
    record.humanWaitStartedAtMs,
    record.profile.budget.maxHumanWaitMs,
    now,
  );
}

function markSafePilotTerminal(record, eventWorkspace = workspaceRoot, authorizationStatus = 'failed') {
  pauseSafePilotActiveClock(record);
  record.requiredRetryRepair = null;
  record.status = authorizationStatus;
  const run = workspaceOrchestrationRuns(eventWorkspace).get(record.runId);
  if (run && !['completed', 'cancelled', 'failed'].includes(run.status)) {
    run.status = 'failed';
    run.updatedAt = new Date().toISOString();
  }
  return run ?? null;
}

function terminalSafePilotBlock(record, eventWorkspace, status, error) {
  markSafePilotTerminal(record, eventWorkspace);
  return { ok: false, status, error, record, terminal: true };
}

function resolveSafePilotCall(payload, agentId, maxTokens, eventWorkspace) {
  const reference = payload.safePilotAuthorization;
  const boundRecord = safePilotAuthorizationForRun(payload.runId, eventWorkspace);
  if (reference === undefined) {
    return boundRecord
      ? { ok: false, status: 403, error: '四 Agent run 必须携带匹配的安全启动授权' }
      : { ok: true, record: null };
  }
  if (!reference || typeof reference !== 'object') return { ok: false, status: 400, error: 'safePilotAuthorization 非法' };
  const records = workspaceSafePilotAuthorizations(eventWorkspace);
  const record = records.get(reference.authorizationId);
  if (!record) return { ok: false, status: 403, error: '四 Agent run 授权不存在' };
  if (!verifySafePilotToken(record, reference.authorizationToken)) return { ok: false, status: 403, error: '四 Agent run 授权签名无效' };
  if (safePilotAuthorizationExpired(record)) {
    return { ok: false, status: 403, error: '四 Agent run 授权已过期' };
  }
  if (record.runId !== payload.runId) return { ok: false, status: 403, error: '四 Agent run 授权与 runId 不一致' };
  if (sha256Hex(reference.taskText ?? '') !== record.taskSha256 || sha256Hex(reference.contextText ?? '') !== record.contextSha256) {
    return { ok: false, status: 403, error: '四 Agent run 任务或上下文哈希不一致' };
  }
  if (!['issued', 'active'].includes(record.status)) return { ok: false, status: 409, error: '四 Agent run 授权当前不可调用' };
  const expectedAgent = record.profile.agentOrder[record.acceptedAgentIds.length];
  if (expectedAgent !== agentId) return { ok: false, status: 409, error: `四 Agent run 当前只允许 ${expectedAgent}` };
  const retryRepairProblem = validateSafePilotRetryRepairMessages(
    payload.messages,
    record.requiredRetryRepair ?? null,
  );
  if (retryRepairProblem) return { ok: false, status: 409, error: retryRepairProblem };
  const binding = record.profile.modelBindings.find((item) => item.agentCode === agentId);
  if (!binding || binding.provider !== payload.config.kind || binding.model !== payload.config.model) {
    return { ok: false, status: 403, error: '四 Agent run Provider/模型与授权档案不一致' };
  }
  if (record.profile.runCapabilities[agentId]?.call_model !== true) {
    return { ok: false, status: 403, error: `${agentId} 缺少 run 级 call_model 权限` };
  }
  const budget = record.profile.budget;
  if (
    payload.orchestration.expectedArtifacts !== 4 ||
    payload.orchestration.maxCalls !== budget.maxCalls ||
    payload.orchestration.totalOutputTokens !== budget.maxOutputTokens ||
    payload.orchestration.stageTimeoutMs !== budget.stageTimeoutMs
  ) return { ok: false, status: 409, error: '四 Agent run 编排策略与授权预算不一致' };
  const inputUpperBound = Buffer.byteLength(stableStringify(payload.messages), 'utf8');
  const reservedCostMicros = Math.ceil(
    (inputUpperBound * budget.inputRateMicrosPerMillion + maxTokens * budget.outputRateMicrosPerMillion) / 1_000_000,
  );
  if (safePilotRecordActiveTimeoutExpired(record)) {
    return terminalSafePilotBlock(record, eventWorkspace, 408, '四 Agent run 240 秒活跃超时预算已耗尽');
  }
  if (record.usage.callsStarted >= budget.maxCalls) {
    return terminalSafePilotBlock(record, eventWorkspace, 429, '四 Agent run 调用预算已耗尽');
  }
  if (record.usage.reservedInputTokens + inputUpperBound > budget.maxInputTokens) {
    return terminalSafePilotBlock(record, eventWorkspace, 429, '四 Agent run 输入 Token 保守预算不足');
  }
  if (record.usage.reservedOutputTokens + maxTokens > budget.maxOutputTokens) {
    return terminalSafePilotBlock(record, eventWorkspace, 429, '四 Agent run 输出 Token 预算不足');
  }
  if (record.usage.reservedCostMicros + reservedCostMicros > budget.maxCostMicros) {
    return terminalSafePilotBlock(record, eventWorkspace, 429, '四 Agent run 费用硬上限不足');
  }
  resumeSafePilotActiveClock(record);
  const requiredRetryRepair = record.requiredRetryRepair ?? null;
  record.requiredRetryRepair = null;
  record.status = 'active';
  record.usage.callsStarted += 1;
  record.usage.reservedInputTokens += inputUpperBound;
  record.usage.reservedOutputTokens += maxTokens;
  record.usage.reservedCostMicros += reservedCostMicros;
  return { ok: true, record, inputUpperBound, reservedCostMicros, requiredRetryRepair };
}

function rollbackSafePilotReservation(result, maxTokens) {
  if (!result?.record) return;
  result.record.usage.callsStarted = Math.max(0, result.record.usage.callsStarted - 1);
  result.record.usage.reservedInputTokens = Math.max(0, result.record.usage.reservedInputTokens - result.inputUpperBound);
  result.record.usage.reservedOutputTokens = Math.max(0, result.record.usage.reservedOutputTokens - maxTokens);
  result.record.usage.reservedCostMicros = Math.max(0, result.record.usage.reservedCostMicros - result.reservedCostMicros);
  result.record.requiredRetryRepair = result.requiredRetryRepair ?? null;
  result.record.status = 'active';
}

function workspacePatchProposals(eventWorkspace = workspaceRoot) {
  let proposals = patchProposalsByWorkspace.get(eventWorkspace);
  if (!proposals) {
    proposals = new Map();
    patchProposalsByWorkspace.set(eventWorkspace, proposals);
  }
  return proposals;
}

function patchProposalSummary(record) {
  return {
    proposalId: record.proposal.proposalId,
    runId: record.proposal.runId,
    agentId: record.proposal.agentId,
    title: record.proposal.title,
    status: record.status,
    proposalSha256: record.proposalSha256,
    receivedAt: record.receivedAt,
    files: record.proposal.files.map((file) => ({
      path: file.path,
      beforeSha256: file.beforeSha256,
      afterSha256: file.afterSha256,
      addedLines: file.addedLines,
      removedLines: file.removedLines,
    })),
    ...(record.preflight
      ? {
          preflight: {
            checkedAt: record.preflight.checkedAt,
            matched: record.preflight.matched,
            files: record.preflight.files.map((file) => ({ ...file })),
          },
        }
      : {}),
    ...(record.application
      ? {
          application: {
            appliedAt: record.application.appliedAt,
            transactionId: record.application.transactionId,
            status: record.application.status,
            files: record.application.files.map((file) => ({ ...file })),
          },
        }
      : {}),
  };
}

async function inspectPatchPreimages(actionWorkspace, proposal) {
  const workspaceStat = await fsp.lstat(actionWorkspace);
  if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) throw new Error('工作区根目录非法');
  const realWorkspace = await fsp.realpath(actionWorkspace);
  const files = [];
  let totalBytes = 0;

  for (const proposedFile of proposal.files) {
    const segments = proposedFile.path.split('/');
    let cursor = actionWorkspace;
    for (let index = 0; index < segments.length; index += 1) {
      cursor = path.join(cursor, segments[index]);
      const stat = await fsp.lstat(cursor);
      if (stat.isSymbolicLink()) throw new Error(`${proposedFile.path} 路径含符号链接或目录联接`);
      if (index < segments.length - 1 && !stat.isDirectory()) throw new Error(`${proposedFile.path} 父路径不是目录`);
      if (index === segments.length - 1 && !stat.isFile()) throw new Error(`${proposedFile.path} 不是普通文件`);
    }

    const realTarget = await fsp.realpath(cursor);
    const relation = path.relative(realWorkspace, realTarget);
    if (!relation || relation.startsWith('..') || path.isAbsolute(relation)) {
      throw new Error(`${proposedFile.path} 真实路径越出工作区或指向工作区根目录`);
    }
    const stat = await fsp.lstat(realTarget);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${proposedFile.path} 不是可预检的普通文件`);
    if (stat.size > 256 * 1024) throw new Error(`${proposedFile.path} 超过 256KB 只读预检上限`);
    totalBytes += stat.size;
    if (totalBytes > 1024 * 1024) throw new Error('提案原文件总量超过 1MB 只读预检上限');
    const actualSha256 = sha256Hex(await fsp.readFile(realTarget));
    files.push({
      path: proposedFile.path,
      expectedSha256: proposedFile.beforeSha256,
      actualSha256,
      sizeBytes: stat.size,
      matched: actualSha256 === proposedFile.beforeSha256,
    });
  }

  return { matched: files.every((file) => file.matched), files };
}

function patchProposalsPayload(eventWorkspace = workspaceRoot) {
  return [...workspacePatchProposals(eventWorkspace).values()]
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
    .map(patchProposalSummary);
}

function getOrCreateOrchestrationRun(runId, policy, eventWorkspace) {
  const runs = workspaceOrchestrationRuns(eventWorkspace);
  const existing = runs.get(runId);
  if (existing) {
    if (stableStringify(existing.policy) !== stableStringify(policy)) {
      return { ok: false, status: 409, error: '同一 runId 的编排策略不可变' };
    }
    return { ok: true, run: existing };
  }

  for (const [candidateId, candidate] of runs) {
    if (runs.size < ORCHESTRATION_LIMITS.maxRunsPerWorkspace) break;
    if (candidate.status !== 'active') runs.delete(candidateId);
  }
  if (runs.size >= ORCHESTRATION_LIMITS.maxRunsPerWorkspace) {
    return { ok: false, status: 507, error: '编排 run 数量已达上限' };
  }

  const now = new Date().toISOString();
  const run = {
    runId,
    status: 'active',
    policy: { ...policy },
    callsStarted: 0,
    callsSucceeded: 0,
    callsFailed: 0,
    reservedOutputTokens: 0,
    observedOutputTokens: 0,
    evidence: [],
    startedAt: now,
    updatedAt: now,
  };
  runs.set(runId, run);
  return { ok: true, run };
}

function preflightModelCallReservation(run, agentId, maxTokens, eventWorkspace) {
  if (run.status === 'cancelled') return { ok: false, status: 409, error: '编排 run 已取消' };
  const reopeningCompleted = canReopenCompletedSingleAgentRun(run, agentId);
  if (run.status === 'completed' && !reopeningCompleted) return { ok: false, status: 409, error: '编排 run 已完成' };
  if (run.status === 'failed') return { ok: false, status: 409, error: '编排 run 已失败' };
  if (run.status === 'awaiting_acceptance') return { ok: false, status: 409, error: '上一份 Provider 返回仍待本地任务验收' };
  if (run.status !== 'active' && !reopeningCompleted) return { ok: false, status: 409, error: '编排 run 当前不可调用模型' };
  if (run.callsStarted >= run.policy.maxCalls) {
    return { ok: false, status: 429, error: '模型调用次数预算已耗尽', terminal: true };
  }
  if (run.reservedOutputTokens + maxTokens > run.policy.totalOutputTokens) {
    return { ok: false, status: 429, error: '输出 token 预算不足', terminal: true };
  }
  const key = `${createWorkspaceId(eventWorkspace)}:${run.runId}:${agentId}`;
  if (activeModelCalls.has(key)) return { ok: false, status: 409, error: '该 Agent 已有活跃模型调用' };
  return { ok: true, key, reopened: reopeningCompleted };
}

function applyModelCallReservationBlock(run, result) {
  if (!result.ok && result.terminal) {
    run.status = 'failed';
    run.updatedAt = new Date().toISOString();
  }
}

function reserveModelCall(run, agentId, maxTokens, eventWorkspace) {
  const preflight = preflightModelCallReservation(run, agentId, maxTokens, eventWorkspace);
  if (!preflight.ok) {
    applyModelCallReservationBlock(run, preflight);
    return preflight;
  }
  run.callsStarted += 1;
  run.reservedOutputTokens += maxTokens;
  run.updatedAt = new Date().toISOString();
  if (preflight.reopened) run.status = 'active';
  return preflight;
}

function developmentModelResponseKey(developmentCall, eventWorkspace) {
  return `${createWorkspaceId(eventWorkspace)}:${developmentCall.sessionId}:${developmentCall.reservationId}`;
}

function developmentModelResponseRequestSha256(
  developmentCall,
  eventWorkspace,
  policy,
  handoff,
  safePilotAuthorization,
) {
  return sha256Hex(stableStringify({
    workspaceId: createWorkspaceId(eventWorkspace),
    sessionId: developmentCall.sessionId,
    reservationId: developmentCall.reservationId,
    authorizationTokenSha256: sha256Hex(developmentCall.authorizationToken),
    runId: developmentCall.runId,
    agentId: developmentCall.agentId,
    inputBytes: developmentCall.inputBytes,
    inputSha256: developmentCall.inputSha256,
    modelRouteSha256: developmentCall.modelRouteSha256,
    providerReadinessSha256: developmentCall.providerReadinessSha256,
    maxOutputTokens: developmentCall.maxOutputTokens,
    policy,
    handoff: handoff ?? null,
    safePilotAuthorizationSha256: safePilotAuthorization
      ? sha256Hex(stableStringify(safePilotAuthorization))
      : null,
  }));
}

function validateModelHandoff(run, agentId, handoff) {
  const accepted = run.evidence.filter((item) => item.acceptanceStatus === 'accepted');
  const previous = accepted[accepted.length - 1];
  if (!previous) return handoff === undefined ? null : '首阶段不得携带伪造 handoff';
  if (!handoff) return '后续 Agent 必须携带上一阶段已验收 handoff';
  if (
    handoff.runId !== run.runId ||
    normalizeAgentIdentifier(handoff.fromAgentId) !== previous.agentId ||
    normalizeAgentIdentifier(handoff.toAgentId) !== agentId ||
    handoff.evidenceId !== previous.evidenceId ||
    handoff.outputSha256 !== previous.outputSha256 ||
    handoff.acceptanceId !== previous.acceptanceId
  ) return 'handoff 与上一阶段已验收证据不一致';
  return null;
}

/* ---------- HTTP 服务 ---------- */

const server = http.createServer(async (request, response) => {
  applySecurityHeaders(response);
  if (!isTrustedLocalRequest(request)) {
    response.setHeader('cache-control', 'no-store');
    sendJson(response, 403, { error: '仅允许当前本地服务的同源请求' });
    return;
  }
  applyCors(request, response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
    } else if (request.method === 'GET') {
      await serveStatic(url.pathname, response);
    } else {
      sendJson(response, 404, { error: 'not found' });
    }
  } catch (error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
    sendJson(response, status, { error: error instanceof Error ? error.message : '内部错误' });
  }
});

function requireSession(request, response) {
  const provided = request.headers['x-agenthub-session'];
  if (typeof provided !== 'string' || provided !== sessionToken) {
    sendJson(response, 401, { error: '本地会话能力令牌缺失或无效' });
    return false;
  }
  return true;
}

function purgeExpiredApprovals() {
  const now = Date.now();
  for (const [approvalId, approval] of approvals.entries()) {
    if (approval.consumed || approval.expiresAt < now) approvals.delete(approvalId);
  }
}

function storeIdempotencyResult(key, value) {
  idempotencyResults.set(key, value);
  while (idempotencyResults.size > 500) {
    const oldestKey = idempotencyResults.keys().next().value;
    if (oldestKey === undefined) break;
    idempotencyResults.delete(oldestKey);
  }
}

async function runDevelopmentReplayableOperation(pathname, policy, payload, handler) {
  const identity = stableStringify([
    pathname,
    typeof payload?.sessionId === 'string' ? payload.sessionId : null,
    typeof payload?.[policy.identityField] === 'string' ? payload[policy.identityField] : null,
  ]);
  const key = sha256Hex(identity);
  const requestSha256 = sha256Hex(stableStringify([pathname, payload]));
  const responseCache = policy.cacheKind === 'command'
    ? developmentCommandResponses
    : developmentOperationResponses;
  const replay = policy.cacheSuccess
    ? responseCache.lookup(key, requestSha256)
    : { kind: 'miss' };
  if (replay.kind === 'mismatch') {
    return { status: 409, body: { error: '开发操作响应重放合同不匹配' } };
  }
  if (replay.kind === 'hit') {
    const snapshot = await replay.promise;
    const current = await developmentManager.snapshot({ sessionId: payload?.sessionId });
    return {
      status: snapshot.status,
      body: { ...snapshot.payload, session: current.session, replayed: true },
    };
  }
  const active = developmentOperationFlights.get(key);
  if (active) {
    if (active.requestSha256 !== requestSha256) {
      return { status: 409, body: { error: '开发操作响应重放合同不匹配' } };
    }
    return { status: 200, body: { ...await active.promise, replayed: true } };
  }
  const promise = handler(payload);
  const flight = { requestSha256, promise, workspaceGeneration };
  developmentOperationFlights.set(key, flight);
  try {
    const result = await promise;
    const cacheAllowed = policy.cacheKind !== 'command'
      || flight.workspaceGeneration === workspaceGeneration;
    if (policy.cacheSuccess && cacheAllowed) {
      const entry = responseCache.create(key, requestSha256);
      responseCache.settle(entry, 200, result);
    }
    return { status: 200, body: result };
  } finally {
    if (developmentOperationFlights.get(key) === flight) developmentOperationFlights.delete(key);
  }
}

function bindDevelopmentModelIssuePayload(payload) {
  const messages = payload?.messages;
  if (
    !Array.isArray(messages)
    || messages.length < 1
    || messages.length > 100
    || !messages.every((message) => (
      message
      && typeof message === 'object'
      && !Array.isArray(message)
      && Object.keys(message).every((key) => key === 'role' || key === 'content')
      && ['system', 'user'].includes(message.role)
      && typeof message.content === 'string'
    ))
  ) {
    return { ok: false, error: '开发模型签发 messages 结构非法' };
  }
  if (messages.reduce((total, message) => total + message.content.length, 0) > 200_000) {
    return { ok: false, error: '开发模型签发 messages 内容超限' };
  }
  const serializedMessages = JSON.stringify(messages);
  const inputBytes = Buffer.byteLength(serializedMessages, 'utf8');
  if (inputBytes > 1_000_000) {
    return { ok: false, error: '开发模型签发 messages 超限' };
  }
  return {
    ok: true,
    payload: {
      ...payload,
      inputBytes,
      inputSha256: sha256Hex(serializedMessages),
    },
  };
}

async function issueDevelopmentModelCall(payload) {
  const issuanceWorkspaceId = createWorkspaceId(workspaceRoot);
  const result = await developmentManager.issueModelCall(payload);
  cacheDevelopmentIssuedModelInput(result.authorization, payload, issuanceWorkspaceId);
  return {
    ...result,
    authorization: {
      ...result.authorization,
      inputBytes: payload.inputBytes,
      inputSha256: payload.inputSha256,
    },
  };
}

function developmentIssuedModelInputKey(authorization, workspaceId = createWorkspaceId(workspaceRoot)) {
  if (
    typeof authorization?.sessionId !== 'string'
    || typeof authorization?.reservationId !== 'string'
    || typeof authorization?.authorizationToken !== 'string'
  ) return '';
  return `${workspaceId}:${authorization.sessionId}:${authorization.reservationId}:${sha256Hex(authorization.authorizationToken)}`;
}

function cacheDevelopmentIssuedModelInput(authorization, payload, workspaceId) {
  const key = developmentIssuedModelInputKey(authorization, workspaceId);
  if (!key) throw new Error('开发模型签发消息正文缓存身份非法');
  const lookup = developmentIssuedModelInputs.lookup(key, payload.inputSha256);
  if (lookup.kind === 'mismatch') {
    throw new Error('开发模型签发消息正文缓存合同不匹配');
  }
  if (lookup.kind === 'hit') return;
  const entry = developmentIssuedModelInputs.create(key, payload.inputSha256);
  developmentIssuedModelInputs.settle(entry, 200, {
    messages: payload.messages,
    inputBytes: payload.inputBytes,
    inputSha256: payload.inputSha256,
  });
}

async function readDevelopmentIssuedModelInput(authorization) {
  const key = developmentIssuedModelInputKey(authorization);
  if (!key) return { kind: 'miss' };
  const lookup = developmentIssuedModelInputs.lookup(key, authorization.inputSha256);
  if (lookup.kind !== 'hit') return lookup;
  const cached = await lookup.promise;
  return { kind: 'hit', input: cached.payload };
}

async function ensureSafeWriteRoot(actionWorkspace) {
  const base = path.resolve(actionWorkspace, 'ai-output');
  if (!fs.existsSync(base)) {
    try {
      await fsp.mkdir(base, { recursive: false });
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
    }
  }
  const baseStat = await fsp.lstat(base);
  if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) {
    throw new Error('ai-output 必须是工作区内的真实目录，不得是符号链接/目录联接');
  }
  const realBase = await fsp.realpath(base);
  const relation = path.relative(actionWorkspace, realBase);
  if (relation.startsWith('..') || path.isAbsolute(relation)) {
    throw new Error('ai-output 真实路径越出工作区');
  }
  return realBase;
}

function buildHealthPayload(includeSessionCapability = false) {
  const receipts = receiptsByWorkspace.get(workspaceRoot) ?? [];
  return {
    ok: true,
    version: SERVER_VERSION,
    workspaceId: createWorkspaceId(workspaceRoot),
    receipts: receipts.length,
    safePilotIssuanceRequested,
    safePilotIssuanceEnabled,
    checkpointPersistenceEnabled,
    safePilotIssuerPinning: {
      ready: safePilotIssuerPins.ready,
      taskSha256Prefix: safePilotIssuerPins.pins.taskSha256.slice(0, 16),
      contextSha256Prefix: safePilotIssuerPins.pins.contextSha256.slice(0, 16),
      profileSha256Prefix: safePilotIssuerPins.pins.profileSha256.slice(0, 16),
      blockers: [...safePilotIssuerPins.blockers],
    },
    operator: operatorIdentity,
    developmentPreset: {
      id: developmentManager.preset.id,
      isDefault: developmentManager.preset.isDefault,
    },
    serviceInstanceId,
    ...(includeSessionCapability ? { workspace: workspaceRoot, agentHub: agentHubDir, sessionToken } : {}),
  };
}

async function handleApi(request, response, url) {
  if (workspaceSwitchInProgress && request.method === 'POST' && url.pathname !== '/api/workspace') {
    return sendJson(response, 409, { error: '工作区切换期间暂停受控动作' });
  }
  if (request.method === 'GET' && url.pathname === '/api/health') {
    response.setHeader('cache-control', 'no-store');
    return sendJson(response, 200, buildHealthPayload(false));
  }

  if (request.method === 'POST' && url.pathname === '/api/session') {
    if (!trustedBrowserOrigin(request)) {
      return sendJson(response, 403, { error: '会话能力仅向当前本地服务的同源页面签发' });
    }
    response.setHeader('cache-control', 'no-store');
    return sendJson(response, 200, buildHealthPayload(true));
  }

  if (request.method === 'GET' && url.pathname === '/api/development/preset') {
    if (!requireSession(request, response)) return undefined;
    return sendJson(response, 200, { preset: developmentManager.preset });
  }

  if (request.method === 'GET' && url.pathname === '/api/development/sessions') {
    if (!requireSession(request, response)) return undefined;
    return sendJson(response, 200, { sessions: await developmentManager.listSessions() });
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/development/')) {
    if (!requireSession(request, response)) return undefined;
    let payload = await readJsonBody(request);
    if (url.pathname === '/api/development/model-call') {
      const bound = bindDevelopmentModelIssuePayload(payload);
      if (!bound.ok) return sendJson(response, 400, { error: bound.error });
      payload = bound.payload;
    }
    const handlers = new Map([
      ['/api/development/preflight', developmentManager.preflightSession],
      ['/api/development/sessions', developmentManager.createSession],
      ['/api/development/sessions/resume', developmentManager.resumeSession],
      ['/api/development/sessions/progress', developmentManager.updateProgress],
      ['/api/development/model-call', issueDevelopmentModelCall],
      ['/api/development/snapshot', developmentManager.snapshot],
      ['/api/development/inspect', developmentManager.inspect],
      ['/api/development/apply', developmentManager.applyChangeSet],
      ['/api/development/replace', developmentManager.applyTextReplacement],
      ['/api/development/replace-batch', developmentManager.applyTextReplacementBatch],
      ['/api/development/command', developmentManager.runCommand],
      ['/api/development/acceptance', developmentManager.runBrowserAcceptance],
      ['/api/development/review', developmentManager.submitReview],
      ['/api/development/finalize', developmentManager.finalize],
    ]);
    const handler = handlers.get(url.pathname);
    if (!handler) return sendJson(response, 404, { error: 'development endpoint not found' });
    const replayPolicy = DEVELOPMENT_REPLAYABLE_OPERATIONS.get(url.pathname);
    if (replayPolicy) {
      const result = await runDevelopmentReplayableOperation(url.pathname, replayPolicy, payload, handler);
      return sendJson(response, result.status, result.body);
    }
    return sendJson(response, 200, await handler(payload));
  }

  if (request.method === 'GET' && url.pathname === '/api/project') {
    if (!requireSession(request, response)) return undefined;
    return sendJson(response, 200, { files: await collectAgentHubFiles() });
  }

  if (request.method === 'GET' && url.pathname === '/api/events') {
    if (!requireSession(request, response)) return undefined;
    const origin = trustedBrowserOrigin(request);
    const originHeader = origin ? { 'access-control-allow-origin': origin } : {};
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-store',
      connection: 'keep-alive',
      ...originHeader,
    });
    response.write('event: hello\ndata: connected\n\n');
    sseClients.add(response);
    request.on('close', () => sseClients.delete(response));
    return undefined;
  }

  if (request.method === 'GET' && url.pathname === '/api/workspaces') {
    if (!requireSession(request, response)) return undefined;
    return sendJson(response, 200, { current: workspaceRoot, recent: recentWorkspaces });
  }

  if (request.method === 'POST' && url.pathname === '/api/workspace') {
    if (!requireSession(request, response)) return undefined;
    const payload = await readJsonBody(request);
    const candidate = typeof payload?.path === 'string' ? payload.path.trim() : '';
    if (!candidate) return sendJson(response, 400, { error: 'path 缺失' });
    const result = await switchWorkspace(candidate);
    if (!result.ok) return sendJson(response, 409, { error: result.error });
    broadcast('workspace', workspaceRoot);
    appendRuntimeEvent({
      category: 'system',
      type: 'workspace_switched',
      status: 'info',
      title: '工作区已切换',
      summary: path.basename(workspaceRoot),
    });
    return sendJson(response, 200, { ok: true, workspace: workspaceRoot, recoveredTransactions: result.recovery.length });
  }

  if (request.method === 'GET' && url.pathname === '/api/receipts') {
    if (!requireSession(request, response)) return undefined;
    return sendJson(response, 200, { receipts: receiptsByWorkspace.get(workspaceRoot) ?? [] });
  }

  if (request.method === 'GET' && url.pathname === '/api/runtime-state') {
    if (!requireSession(request, response)) return undefined;
    response.setHeader('cache-control', 'no-store');
    return sendJson(response, 200, {
      events: runtimeEventsByWorkspace.get(workspaceRoot) ?? [],
      ...permissionStatePayload(),
      orchestrationRuns: orchestrationRunsPayload(),
      patchProposals: patchProposalsPayload(),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/permissions') {
    if (!requireSession(request, response)) return undefined;
    const payload = await readJsonBody(request);
    const normalized = normalizePermissionUpdate(payload);
    if (!normalized.ok) return sendJson(response, 400, { error: normalized.error });
    const { agentId, capability, allowed } = normalized.update;
    permissionProfiles.set(agentId, { ...permissionProfiles.get(agentId), [capability]: allowed });
    appendRuntimeEvent({
      category: 'approval',
      type: 'permission_changed',
      status: allowed ? 'succeeded' : 'blocked',
      agentId,
      title: `${agentId} 权限${allowed ? '已开放' : '已撤销'}`,
      summary: capability,
    });
    return sendJson(response, 200, { ok: true, ...permissionStatePayload() });
  }

  if (request.method === 'GET' && url.pathname === '/api/checkpoints') {
    if (!requireSession(request, response)) return undefined;
    if (!checkpointPersistenceEnabled) return sendJson(response, 200, { checkpoints: [], disabled: true });
    const records = await readCheckpointRecords(workspaceRoot);
    const latestByRun = new Map();
    for (const checkpoint of records) {
      const current = latestByRun.get(checkpoint.runId);
      if (!current || checkpoint.revision > current.revision) latestByRun.set(checkpoint.runId, checkpoint);
    }
    const checkpoints = [...latestByRun.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 30)
      .map(checkpointSummary);
    return sendJson(response, 200, { checkpoints });
  }

  if (request.method === 'GET' && url.pathname === '/api/checkpoint') {
    if (!requireSession(request, response)) return undefined;
    if (!checkpointPersistenceEnabled) return sendJson(response, 403, { error: '归档版默认禁用检查点持久化' });
    const runId = url.searchParams.get('runId') ?? '';
    if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(runId)) return sendJson(response, 400, { error: 'runId 非法' });
    const latest = (await readCheckpointRecords(workspaceRoot))
      .filter((checkpoint) => checkpoint.runId === runId)
      .sort((left, right) => right.revision - left.revision)[0];
    if (!latest) return sendJson(response, 404, { error: '检查点不存在' });
    return sendJson(response, 200, { checkpoint: latest });
  }

  if (request.method === 'POST' && url.pathname === '/api/checkpoints') {
    if (!requireSession(request, response)) return undefined;
    if (!checkpointPersistenceEnabled) return sendJson(response, 403, { error: '归档版默认禁用检查点持久化' });
    const payload = await readJsonBody(request);
    const agentId = normalizeAgentIdentifier(payload?.agentId);
    if (!hasCapability(agentId, 'manage_checkpoint')) {
      appendRuntimeEvent({
        category: 'approval',
        type: 'permission_denied',
        status: 'blocked',
        agentId,
        runId: payload?.checkpoint?.runId,
        title: `${agentId ?? 'UNKNOWN'} 检查点保存已阻断`,
        summary: 'manage_checkpoint 权限未开放',
      });
      return sendJson(response, 403, { error: `${agentId ?? 'UNKNOWN'} 未获得 manage_checkpoint 权限` });
    }
    const normalized = normalizeCheckpointPayload(payload);
    if (!normalized.ok) return sendJson(response, 400, { error: normalized.error });
    let checkpoint = normalized.checkpoint;
    if (safePilotAuthorizationForRun(checkpoint.runId)) {
      appendRuntimeEvent({
        category: 'security',
        type: 'safe_pilot_checkpoint_blocked',
        status: 'blocked',
        agentId: agentId ?? 'AG-COORD',
        runId: checkpoint.runId,
        title: '四 Agent run 检查点已阻断',
        summary: 'pilot-4-readonly-v2 固定 checkpoint=false',
      });
      return sendJson(response, 403, { error: '四 Agent run 固定 checkpoint=false' });
    }
    const authoritativeRun = workspaceOrchestrationRuns().get(checkpoint.runId);
    if (checkpoint.pipeline.mode === 'connected' && !authoritativeRun) {
      return sendJson(response, 409, { error: 'connected 检查点必须绑定当前服务端编排账本' });
    }
    if (checkpoint.pipeline.mode === 'connected') {
      if (authoritativeRun.policy.expectedArtifacts !== checkpoint.pipeline.stages.length) {
        return sendJson(response, 409, { error: '编排预期产物数与 DAG 阶段数不一致' });
      }
      const { operatorEvidenceEligible: _processLocalEligibility, ...checkpointOrchestration } =
        publicOrchestrationRun(authoritativeRun);
      checkpoint = {
        ...checkpoint,
        version: '1.1.0',
        orchestration: checkpointOrchestration,
      };
    }
    checkpoint = redactCheckpointForPersistence(checkpoint);
    const records = await readCheckpointRecords(workspaceRoot);
    const latestRevision = records
      .filter((item) => item.runId === checkpoint.runId)
      .reduce((max, item) => Math.max(max, item.revision), 0);
    const checkpointDir = await getCheckpointDir(workspaceRoot, true);
    const fileName = `${sha256Hex(checkpoint.runId).slice(0, 24)}-${String(checkpoint.revision).padStart(6, '0')}.json`;
    const target = path.join(checkpointDir, fileName);
    const serialized = `${JSON.stringify(checkpoint, null, 2)}\n`;
    const checkpointFileCount = (await fsp.readdir(checkpointDir, { withFileTypes: true })).filter(
      (entry) => entry.isFile() && /^[a-f0-9]{24}-\d{6}\.json$/i.test(entry.name),
    ).length;
    if (checkpointFileCount >= 500 && !fs.existsSync(target)) {
      return sendJson(response, 507, { error: '检查点容量已达 500 个文件上限，请先人工归档' });
    }
    if (checkpoint.revision <= latestRevision || fs.existsSync(target)) {
      if (fs.existsSync(target) && (await fsp.readFile(target, 'utf8')) === serialized) {
        return sendJson(response, 200, { ok: true, replayed: true, checkpoint: checkpointSummary(checkpoint) });
      }
      return sendJson(response, 409, { error: `checkpoint revision 必须大于 ${latestRevision}` });
    }
    try {
      await fsp.writeFile(target, serialized, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
        if ((await fsp.readFile(target, 'utf8')) === serialized) {
          return sendJson(response, 200, { ok: true, replayed: true, checkpoint: checkpointSummary(checkpoint) });
        }
        return sendJson(response, 409, { error: 'checkpoint revision 并发冲突' });
      }
      throw error;
    }
    appendRuntimeEvent({
      category: 'operation',
      type: 'checkpoint_saved',
      status: 'succeeded',
      agentId,
      runId: checkpoint.runId,
      title: `检查点 r${checkpoint.revision} 已保存`,
      summary: `${checkpoint.dag.nodes.length} 个 DAG 节点 · ${checkpoint.pipeline.status}`,
    });
    return sendJson(response, 200, { ok: true, checkpoint: checkpointSummary(checkpoint) });
  }

  if (request.method === 'GET' && url.pathname === '/api/orchestration/runs') {
    if (!requireSession(request, response)) return undefined;
    response.setHeader('cache-control', 'no-store');
    return sendJson(response, 200, { runs: orchestrationRunsPayload() });
  }

  if (request.method === 'GET' && url.pathname === '/api/operator-evidence/export') {
    if (!requireSession(request, response)) return undefined;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    const runId = url.searchParams.get('runId') ?? '';
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(runId)) {
      return sendJson(response, 400, { ok: false, errorCode: 'INVALID_RUN_ID', error: 'runId 非法' });
    }
    const run = workspaceOrchestrationRuns().get(runId);
    if (!run) {
      return sendJson(response, 404, {
        ok: false,
        errorCode: 'RUN_NOT_AVAILABLE',
        error: '当前进程中没有可用的 run 证据',
      });
    }
    const authorization = safePilotAuthorizationForRun(runId);
    if (!authorization) {
      return sendJson(response, 409, {
        ok: false,
        errorCode: 'RUN_NOT_ELIGIBLE',
        error: '该 run 尚不满足最终人工验收导出条件',
      });
    }
    try {
      const result = buildOperatorEvidenceExportV1({
        run,
        authorization,
        exportedAt: new Date().toISOString(),
        serverVersion: SERVER_VERSION,
      });
      if (result.ok) return sendJson(response, 200, { ok: true, export: result.export });
      if (result.errorCode === 'RUN_NOT_ELIGIBLE') {
        return sendJson(response, 409, {
          ok: false,
          errorCode: result.errorCode,
          error: '该 run 尚不满足最终人工验收导出条件',
        });
      }
      if (result.errorCode === 'EXPORT_TOO_LARGE') {
        return sendJson(response, 413, {
          ok: false,
          errorCode: result.errorCode,
          error: '脱敏证据超过导出大小上限',
        });
      }
      return sendJson(response, 409, {
        ok: false,
        errorCode: result.errorCode,
        error: '该 run 的脱敏导出源字段不完整或无效',
      });
    } catch {
      return sendJson(response, 500, {
        ok: false,
        errorCode: 'EXPORT_FAILED',
        error: '脱敏证据导出失败',
      });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/safe-pilot/preflight') {
    if (!requireSession(request, response)) return undefined;
    const normalized = normalizeSafePilotPreflight(await readJsonBody(request));
    if (!normalized.ok) return sendJson(response, 400, { error: normalized.error });
    const preflight = createSafePilotPreflight(normalized.request, createWorkspaceId(workspaceRoot));
    appendRuntimeEvent({
      category: 'approval',
      type: 'safe_pilot_preflight',
      status: preflight.ready ? 'succeeded' : 'blocked',
      agentId: 'AG-COORD',
      runId: preflight.runId,
      title: preflight.ready ? '四 Agent 启动包预检通过' : '四 Agent 启动包保持阻塞',
      summary: preflight.ready
        ? `${preflight.authorizationSha256.slice(0, 16)} · 仅预检，未签发、未调用模型`
        : preflight.blockers.join('；'),
    });
    return sendJson(response, 200, preflight);
  }

  if (request.method === 'POST' && url.pathname === '/api/safe-pilot/authorizations') {
    if (!requireSession(request, response)) return undefined;
    if (!safePilotIssuanceEnabled) {
      const detail = safePilotIssuanceRequested && safePilotIssuerPins.blockers.length > 0
        ? `；${safePilotIssuerPins.blockers.join('；')}`
        : '';
      return sendJson(response, 403, { error: `四 Agent 运行授权签发未启用；DemoScenario014 正式服务仅开放预检${detail}` });
    }
    const payload = await readJsonBody(request);
    if (payload?.issueConfirmed !== true) return sendJson(response, 403, { error: '缺少独立的安全启动票据签发确认' });
    const normalized = normalizeSafePilotPreflight(payload.preflight);
    if (!normalized.ok) return sendJson(response, 400, { error: normalized.error });
    const preflight = createSafePilotPreflight(normalized.request, createWorkspaceId(workspaceRoot));
    if (!preflight.ready) return sendJson(response, 409, preflight);
    const issuerPinProblem = validateSafePilotIssuerPins(preflight, safePilotIssuerPins);
    if (issuerPinProblem) {
      appendRuntimeEvent({
        category: 'security',
        type: 'safe_pilot_issuer_pin_mismatch',
        status: 'blocked',
        agentId: 'AG-COORD',
        runId: preflight.runId,
        title: '四 Agent 服务启动哈希锁已阻断签发',
        summary: issuerPinProblem,
      });
      return sendJson(response, 409, { error: issuerPinProblem, preflight });
    }
    if (workspaceOrchestrationRuns().has(preflight.runId)) {
      return sendJson(response, 409, { error: 'runId 已被编排账本使用，不能签发四 Agent 授权' });
    }
    const records = workspaceSafePilotAuthorizations();
    const admission = pruneMapForAdmission(records, {
      limit: SERVER_RETENTION_LIMITS.liveSafePilotAuthorizationsPerWorkspace,
      terminalStatuses: ['completed', 'consumed', 'failed', 'expired', 'cancelled'],
    });
    const existing = [...records.values()].find((record) => record.runId === preflight.runId);
    if (existing) return sendJson(response, 409, { error: '同一 runId 已存在安全启动授权' });
    if (!admission.canAdmit) {
      appendRuntimeEvent({
        category: 'security',
        type: 'safe_pilot_authorization_retention_blocked',
        status: 'blocked',
        agentId: 'AG-COORD',
        runId: preflight.runId,
        title: '四 Agent 安全启动授权容量已满',
        summary: `保留 ${admission.liveCount}/${admission.limit} 个存活授权；未签发、未启动 run、未调用 Provider`,
      });
      return sendJson(response, 429, { error: `四 Agent 存活授权已达 ${admission.limit} 个上限` });
    }
    const authorizationId = `pilot-auth-${createSessionToken().slice(0, 18)}`;
    const issuedAt = new Date().toISOString();
    const authorizationToken = createApprovalToken(
      sessionToken,
      authorizationId,
      preflight.authorizationSha256,
      preflight.expiresAt,
    );
    const record = {
      authorizationId,
      runId: preflight.runId,
      status: 'issued',
      profile: normalized.request.profile,
      taskSha256: preflight.taskSha256,
      contextSha256: preflight.contextSha256,
      profileSha256: preflight.profileSha256,
      authorizationSha256: preflight.authorizationSha256,
      issuedAt,
      expiresAt: preflight.expiresAt,
      finalHumanAcceptedAt: null,
      activeSegmentStartedAtMs: null,
      humanWaitStartedAtMs: null,
      lastRejectedEvidence: null,
      requiredRetryRepair: null,
      acceptedAgentIds: [],
      operatorEvidenceStages: [],
      operatorEvidenceAttemptCounts: {
        'AG-COORD': 0,
        PRO: 0,
        'AG-SEC': 0,
        'AG-REVIEW': 0,
      },
      usage: {
        callsStarted: 0,
        manualRetriesApproved: 0,
        manualRetriesUsed: 0,
        reservedInputTokens: 0,
        observedInputTokens: 0,
        reservedOutputTokens: 0,
        observedOutputTokens: 0,
        reservedCostMicros: 0,
        observedCostMicros: 0,
        activeElapsedMs: 0,
      },
    };
    records.set(authorizationId, record);
    appendRuntimeEvent({
      category: 'approval',
      type: 'safe_pilot_authorization_issued',
      status: 'succeeded',
      agentId: 'AG-COORD',
      runId: record.runId,
      title: '四 Agent 单 run 授权已签发',
      summary: `${record.authorizationSha256.slice(0, 16)} · 240 秒活跃预算 · 人工等待 ${record.profile.budget.maxHumanWaitMs / 60_000} 分/次 · checkpoint=false`,
    });
    return sendJson(response, 200, {
      ok: true,
      authorization: publicSafePilotAuthorization(record),
      authorizationToken,
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/safe-pilot/retry') {
    if (!requireSession(request, response)) return undefined;
    const payload = await readJsonBody(request);
    const record = workspaceSafePilotAuthorizations().get(payload?.authorizationId);
    if (!record || !verifySafePilotToken(record, payload?.authorizationToken)) {
      return sendJson(response, 403, { error: '四 Agent 重试授权无效' });
    }
    if (safePilotAuthorizationExpired(record)) return sendJson(response, 403, { error: '四 Agent 重试授权已过期' });
    if (payload?.humanApproved !== true || record.status !== 'waiting_retry_approval') {
      return sendJson(response, 409, { error: '四 Agent run 当前不满足人工重试门' });
    }
    if (record.usage.manualRetriesApproved >= record.profile.budget.maxManualRetries) {
      return sendJson(response, 429, { error: '四 Agent run 人工重试预算已耗尽' });
    }
    if (safePilotRecordHumanWaitExpired(record)) {
      const run = markSafePilotTerminal(record);
      appendRuntimeEvent({
        category: 'security',
        type: 'safe_pilot_retry_human_wait_expired',
        status: 'blocked',
        agentId: record.profile.agentOrder[record.acceptedAgentIds.length],
        runId: record.runId,
        title: '四 Agent 人工重试等待授权已过期',
        summary: `每次人工等待上限 ${record.profile.budget.maxHumanWaitMs / 60_000} 分钟，未消耗重试次数`,
      });
      return sendJson(response, 408, {
        error: '四 Agent run 人工重试等待授权已过期，未消耗人工重试次数',
        authorization: publicSafePilotAuthorization(record),
        ...(run ? { run: publicOrchestrationRun(run) } : {}),
      });
    }
    if (safePilotRecordActiveTimeoutExpired(record)) {
      const run = markSafePilotTerminal(record);
      appendRuntimeEvent({
        category: 'security',
        type: 'safe_pilot_retry_timeout_blocked',
        status: 'blocked',
        agentId: record.profile.agentOrder[record.acceptedAgentIds.length],
        runId: record.runId,
        title: '四 Agent 重试批准已被活跃超时阻断',
        summary: '未消耗人工重试次数，run 已终止',
      });
      return sendJson(response, 408, {
        error: '四 Agent run 240 秒活跃超时预算已耗尽，未消耗人工重试次数',
        authorization: publicSafePilotAuthorization(record),
        ...(run ? { run: publicOrchestrationRun(run) } : {}),
      });
    }
    record.usage.manualRetriesApproved += 1;
    record.usage.manualRetriesUsed += 1;
    record.requiredRetryRepair = record.lastRejectedEvidence
      ? { ...record.lastRejectedEvidence }
      : null;
    resumeSafePilotActiveClock(record);
    record.status = 'active';
    appendRuntimeEvent({
      category: 'approval',
      type: 'safe_pilot_retry_approved',
      status: 'succeeded',
      agentId: record.profile.agentOrder[record.acceptedAgentIds.length],
      runId: record.runId,
      title: '四 Agent 单次重试已人工批准',
      summary: `${record.usage.manualRetriesUsed}/${record.profile.budget.maxManualRetries}`,
    });
    return sendJson(response, 200, { ok: true, authorization: publicSafePilotAuthorization(record) });
  }

  if (request.method === 'POST' && url.pathname === '/api/safe-pilot/human-acceptance') {
    if (!requireSession(request, response)) return undefined;
    const payload = await readJsonBody(request);
    const record = workspaceSafePilotAuthorizations().get(payload?.authorizationId);
    if (!record || !verifySafePilotToken(record, payload?.authorizationToken)) {
      return sendJson(response, 403, { error: '四 Agent 最终人工验收授权无效' });
    }
    if (safePilotAuthorizationExpired(record)) return sendJson(response, 403, { error: '四 Agent 最终人工验收授权已过期' });
    if (payload?.humanAccepted !== true || record.status !== 'awaiting_human_acceptance') {
      return sendJson(response, 409, { error: '四 Agent run 尚未满足最终人工验收门' });
    }
    const run = workspaceOrchestrationRuns().get(record.runId);
    if (!run || run.status !== 'awaiting_human_acceptance') {
      return sendJson(response, 409, { error: '四 Agent 编排账本与人工验收状态不一致' });
    }
    if (safePilotRecordHumanWaitExpired(record)) {
      const terminalRun = markSafePilotTerminal(record);
      appendRuntimeEvent({
        category: 'security',
        type: 'safe_pilot_final_human_wait_expired',
        status: 'blocked',
        agentId: 'AG-REVIEW',
        runId: record.runId,
        title: '四 Agent 最终确认等待授权已过期',
        summary: `每次人工等待上限 ${record.profile.budget.maxHumanWaitMs / 60_000} 分钟`,
      });
      return sendJson(response, 408, {
        error: '四 Agent run 最终确认等待授权已过期',
        authorization: publicSafePilotAuthorization(record),
        ...(terminalRun ? { run: publicOrchestrationRun(terminalRun) } : {}),
      });
    }
    const completedAt = new Date().toISOString();
    pauseSafePilotActiveClock(record);
    record.status = 'completed';
    record.finalHumanAcceptedAt = completedAt;
    run.status = 'completed';
    run.updatedAt = completedAt;
    appendRuntimeEvent({
      category: 'approval',
      type: 'safe_pilot_human_accepted',
      status: 'succeeded',
      agentId: 'AG-REVIEW',
      runId: record.runId,
      title: '四 Agent run 已通过最终人工验收',
      summary: `${record.acceptedAgentIds.length} 个已验收交付 · ${record.usage.callsStarted} 次调用`,
    });
    return sendJson(response, 200, { ok: true, authorization: publicSafePilotAuthorization(record), run: publicOrchestrationRun(run) });
  }

  if (request.method === 'GET' && url.pathname === '/api/patches/proposals') {
    if (!requireSession(request, response)) return undefined;
    response.setHeader('cache-control', 'no-store');
    return sendJson(response, 200, { proposals: patchProposalsPayload() });
  }

  if (request.method === 'POST' && url.pathname === '/api/patches/proposals') {
    if (!requireSession(request, response)) return undefined;
    const normalized = normalizePatchProposal(await readJsonBody(request));
    if (!normalized.ok) return sendJson(response, 400, { error: normalized.error });
    const agentId = normalized.proposal.agentId;
    if (!hasCapability(agentId, 'propose_patch')) {
      appendRuntimeEvent({
        category: 'approval',
        type: 'permission_denied',
        status: 'blocked',
        agentId,
        runId: normalized.proposal.runId,
        title: `${agentId} 补丁提案已阻断`,
        summary: 'propose_patch 权限未开放',
      });
      return sendJson(response, 403, { error: `${agentId} 未获得 propose_patch 权限` });
    }
    const proposals = workspacePatchProposals();
    const existing = proposals.get(normalized.proposal.proposalId);
    if (existing) {
      if (existing.proposalSha256 === normalized.proposalSha256) {
        return sendJson(response, 200, { ok: true, replayed: true, proposal: patchProposalSummary(existing) });
      }
      return sendJson(response, 409, { error: 'proposalId 已存在且内容冲突' });
    }
    const admission = pruneMapForAdmission(proposals, {
      limit: SERVER_RETENTION_LIMITS.livePatchProposalsPerWorkspace,
      terminalStatuses: ['applied'],
    });
    if (!admission.canAdmit) {
      appendRuntimeEvent({
        category: 'security',
        type: 'patch_proposal_retention_blocked',
        status: 'blocked',
        agentId,
        runId: normalized.proposal.runId,
        title: '存活补丁提案容量已满',
        summary: `保留 ${admission.liveCount}/${admission.limit} 个存活提案；未登记、未预检、未应用`,
      });
      return sendJson(response, 429, { error: `存活补丁提案已达 ${admission.limit} 个上限` });
    }
    const record = {
      proposal: normalized.proposal,
      proposalSha256: normalized.proposalSha256,
      status: 'validated_locked',
      receivedAt: new Date().toISOString(),
    };
    proposals.set(normalized.proposal.proposalId, record);
    appendRuntimeEvent({
      category: 'operation',
      type: 'patch_proposal_validated',
      status: 'succeeded',
      agentId,
      runId: normalized.proposal.runId,
      title: '补丁提案已校验，应用仍锁定',
      summary: `${record.proposal.files.length} 个文件 · ${record.proposalSha256.slice(0, 16)}`,
    });
    return sendJson(response, 200, { ok: true, proposal: patchProposalSummary(record) });
  }

  if (request.method === 'POST' && url.pathname === '/api/orchestration/resume') {
    if (!requireSession(request, response)) return undefined;
    if (!checkpointPersistenceEnabled) return sendJson(response, 403, { error: '归档版默认禁用检查点持久化与跨重启恢复' });
    const payload = await readJsonBody(request);
    const runId = typeof payload?.runId === 'string' ? payload.runId : '';
    if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(runId)) return sendJson(response, 400, { error: 'runId 非法' });
    const runs = workspaceOrchestrationRuns();
    const existing = runs.get(runId);
    if (existing) return sendJson(response, 200, { ok: true, replayed: true, run: publicOrchestrationRun(existing) });
    if (runs.size >= ORCHESTRATION_LIMITS.maxRunsPerWorkspace) {
      return sendJson(response, 507, { error: '编排 run 数量已达上限' });
    }
    const latest = (await readCheckpointRecords(workspaceRoot))
      .filter((checkpoint) => checkpoint.runId === runId)
      .sort((left, right) => right.revision - left.revision)[0];
    if (!latest?.orchestration || latest.pipeline.mode !== 'connected') {
      return sendJson(response, 409, { error: '检查点不含可恢复的模型编排账本' });
    }
    const restored = structuredClone(latest.orchestration);
    runs.set(runId, restored);
    appendRuntimeEvent({
      category: 'operation',
      type: 'orchestration_resumed',
      status: restored.status === 'active' ? 'succeeded' : 'info',
      agentId: 'AG-COORD',
      runId,
      title: '模型编排账本已恢复',
      summary: `${restored.callsStarted}/${restored.policy.maxCalls} 次调用 · ${restored.reservedOutputTokens}/${restored.policy.totalOutputTokens} tokens`,
    });
    return sendJson(response, 200, { ok: true, run: publicOrchestrationRun(restored) });
  }

  if (request.method === 'POST' && url.pathname === '/api/orchestration/cancel') {
    if (!requireSession(request, response)) return undefined;
    const payload = await readJsonBody(request);
    const runId = typeof payload?.runId === 'string' ? payload.runId : '';
    if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(runId)) return sendJson(response, 400, { error: 'runId 非法' });
    const run = workspaceOrchestrationRuns().get(runId);
    if (!run) return sendJson(response, 404, { error: '编排 run 不存在' });
    if (run.status === 'completed') return sendJson(response, 409, { error: '已完成的编排 run 不能取消' });
    if (run.status === 'cancelled') return sendJson(response, 200, { ok: true, replayed: true, run: publicOrchestrationRun(run) });

    const cancelledAt = new Date().toISOString();
    run.status = 'cancelled';
    run.cancelledAt = cancelledAt;
    run.updatedAt = cancelledAt;
    const safePilotRecord = safePilotAuthorizationForRun(runId);
    if (safePilotRecord) {
      pauseSafePilotActiveClock(safePilotRecord);
      safePilotRecord.status = 'cancelled';
    }
    for (const active of activeModelCalls.values()) {
      if (active.workspace === workspaceRoot && active.runId === runId) active.controller.abort('run_cancelled');
    }
    appendRuntimeEvent({
      category: 'operation',
      type: 'orchestration_cancelled',
      status: 'blocked',
      agentId: 'AG-COORD',
      runId,
      title: '模型编排已取消',
      summary: `${run.callsSucceeded}/${run.policy.expectedArtifacts} 个证据已回流`,
    });
    return sendJson(response, 200, { ok: true, run: publicOrchestrationRun(run) });
  }

  if (request.method === 'POST' && url.pathname === '/api/orchestration/acceptance') {
    if (!requireSession(request, response)) return undefined;
    const payload = await readJsonBody(request);
    const runId = typeof payload?.runId === 'string' ? payload.runId : '';
    const agentId = normalizeAgentIdentifier(payload?.agentId);
    const evidenceId = typeof payload?.evidenceId === 'string' ? payload.evidenceId : '';
    const outputSha256 = typeof payload?.outputSha256 === 'string' ? payload.outputSha256 : '';
    const decision = payload?.decision;
    if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(runId) || !agentId || !/^[a-zA-Z0-9._:-]{1,80}$/.test(evidenceId)) {
      return sendJson(response, 400, { error: '验收请求标识非法' });
    }
    if (!/^[a-f0-9]{64}$/.test(outputSha256) || !['accepted', 'rejected'].includes(decision)) {
      return sendJson(response, 400, { error: '验收决定或输出哈希非法' });
    }
    const run = workspaceOrchestrationRuns().get(runId);
    if (!run) return sendJson(response, 404, { error: '编排 run 不存在' });
    if (run.status !== 'awaiting_acceptance') return sendJson(response, 409, { error: '编排 run 当前不等待验收' });
    const safePilotRecord = safePilotAuthorizationForRun(runId);
    if (safePilotRecord) {
      const safeReference = payload?.safePilotAuthorization;
      if (
        !safeReference ||
        safeReference.authorizationId !== safePilotRecord.authorizationId ||
        !verifySafePilotToken(safePilotRecord, safeReference.authorizationToken)
      ) return sendJson(response, 403, { error: '四 Agent 产物验收缺少匹配的 run 授权' });
      if (safePilotAuthorizationExpired(safePilotRecord)) {
        return sendJson(response, 403, { error: '四 Agent 产物验收授权已过期' });
      }
      if (safePilotRecord.lastEvidenceId !== evidenceId || safePilotRecord.status !== 'awaiting_acceptance') {
        return sendJson(response, 409, { error: '四 Agent 授权账本与待验收证据不一致' });
      }
      if (safePilotRecordActiveTimeoutExpired(safePilotRecord)) {
        const terminalRun = markSafePilotTerminal(safePilotRecord);
        return sendJson(response, 408, {
          error: '四 Agent run 240 秒活跃超时预算已耗尽',
          authorization: publicSafePilotAuthorization(safePilotRecord),
          ...(terminalRun ? { run: publicOrchestrationRun(terminalRun) } : {}),
        });
      }
    }
    const evidence = run.evidence.find((item) => item.evidenceId === evidenceId);
    if (!evidence || evidence.agentId !== agentId || evidence.outputSha256 !== outputSha256) {
      return sendJson(response, 409, { error: '验收对象与 Provider 返回证据不一致' });
    }
    if (evidence.acceptanceStatus !== 'provider_returned') {
      return sendJson(response, 409, { error: '该 Provider 返回已经验收' });
    }
    const acceptedAt = new Date().toISOString();
    evidence.acceptanceStatus = decision;
    evidence.acceptanceId = `accept-${sha256Hex(stableStringify({ runId, agentId, evidenceId, outputSha256, decision })).slice(0, 24)}`;
    evidence.acceptedAt = acceptedAt;
    run.updatedAt = acceptedAt;
    const acceptedAgents = new Set(
      run.evidence.filter((item) => item.acceptanceStatus === 'accepted').map((item) => item.agentId),
    );
    if (decision === 'accepted') {
      if (safePilotRecord) {
        if (!safePilotRecord.acceptedAgentIds.includes(agentId)) safePilotRecord.acceptedAgentIds.push(agentId);
        if (safePilotRecord.lastRejectedEvidence?.agentId === agentId) {
          safePilotRecord.lastRejectedEvidence = null;
        }
        safePilotRecord.status = safePilotRecord.acceptedAgentIds.length >= SAFE_PILOT_AGENT_ORDER.length
          ? 'awaiting_human_acceptance'
          : 'active';
        if (safePilotRecord.status === 'awaiting_human_acceptance') {
          pauseSafePilotActiveClock(safePilotRecord, true);
        }
        run.status = safePilotRecord.status;
      } else {
        run.status = acceptedAgents.size >= run.policy.expectedArtifacts ? 'completed' : 'active';
      }
    } else {
      if (safePilotRecord) {
        safePilotRecord.lastRejectedEvidence = { agentId, evidenceId, outputSha256 };
        safePilotRecord.status = safePilotRecord.usage.manualRetriesUsed < safePilotRecord.profile.budget.maxManualRetries
          ? 'waiting_retry_approval'
          : 'failed';
        if (safePilotRecord.status === 'waiting_retry_approval') {
          pauseSafePilotActiveClock(safePilotRecord, true);
        } else {
          markSafePilotTerminal(safePilotRecord);
        }
        run.status = safePilotRecord.status === 'waiting_retry_approval' ? 'active' : 'failed';
      } else {
        run.status = run.callsStarted < run.policy.maxCalls && run.reservedOutputTokens < run.policy.totalOutputTokens
          ? 'active'
          : 'failed';
      }
    }
    appendRuntimeEvent({
      category: 'approval',
      type: decision === 'accepted' ? 'artifact_accepted' : 'artifact_rejected',
      status: decision === 'accepted' ? 'succeeded' : 'blocked',
      agentId,
      runId,
      title: decision === 'accepted' ? `${agentId} 产物已通过本地验收` : `${agentId} 产物未通过本地验收`,
      summary: `${evidence.acceptanceId} · ${evidence.outputSha256.slice(0, 16)}`,
    });
    return sendJson(response, 200, {
      ok: true,
      evidence: { ...evidence },
      run: publicOrchestrationRun(run),
      ...(safePilotRecord ? { authorization: publicSafePilotAuthorization(safePilotRecord) } : {}),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/llm') {
    if (!requireSession(request, response)) return undefined;
    let payload = await readJsonBody(request);
    let issuedDevelopmentInput = null;
    let developmentInputUnavailable = false;
    if (payload?.developmentAuthorization !== undefined) {
      const issuedInputLookup = await readDevelopmentIssuedModelInput(payload.developmentAuthorization);
      if (issuedInputLookup.kind === 'mismatch') {
        return sendJson(response, 403, {
          error: '开发模型一次性授权与调用不匹配：inputSha256',
        });
      }
      if (issuedInputLookup.kind !== 'hit') {
        developmentInputUnavailable = true;
        payload = {
          ...payload,
          messages: [{ role: 'user', content: '' }],
        };
      } else {
        const issuedInput = issuedInputLookup.input;
        issuedDevelopmentInput = issuedInput;
        payload = {
          ...payload,
          messages: issuedInput.messages,
        };
      }
    }
    const problem = validateLlmPayload(payload);
    if (problem) return sendJson(response, 400, { error: problem });
    if (
      payload.developmentAuthorization !== undefined
      && issuedDevelopmentInput !== null
      && (
        payload.developmentAuthorization.inputBytes !== issuedDevelopmentInput.inputBytes
        || payload.developmentAuthorization.inputSha256 !== issuedDevelopmentInput.inputSha256
      )
    ) {
      return sendJson(response, 403, { error: '开发模型一次性授权与调用不匹配：inputBytes,inputSha256' });
    }

    const agentId = normalizeAgentIdentifier(payload.agentId);
    if (!hasCapability(agentId, 'call_model')) {
      appendRuntimeEvent({
        category: 'approval',
        type: 'permission_denied',
        status: 'blocked',
        agentId,
        runId: payload.runId,
        title: `${agentId} 模型调用已阻断`,
        summary: 'call_model 权限未开放',
      });
      return sendJson(response, 403, { error: `${agentId} 未获得 call_model 权限` });
    }

    const normalizedPolicy = normalizeOrchestrationPolicy(payload.orchestration);
    if (!normalizedPolicy.ok) return sendJson(response, 400, { error: normalizedPolicy.error });
    const containsGrounding = payload.messages.some((message) =>
      message.role === 'user' && message.content.includes('UNTRUSTED_PROJECT_CONTEXT')
    );
    if (containsGrounding && normalizedPolicy.policy.groundingDisclosureApproved !== true) {
      appendRuntimeEvent({
        category: 'security',
        type: 'grounding_disclosure_blocked',
        status: 'blocked',
        agentId,
        runId: payload.runId,
        title: `${agentId} 项目摘要外发已阻断`,
        summary: '本次 run 未获得显式摘要发送批准',
      });
      return sendJson(response, 403, { error: '项目摘要外发未获得本次 run 的显式批准' });
    }
    if (DEVELOPMENT_RUN_ID.test(payload.runId) && payload.developmentAuthorization === undefined) {
      appendRuntimeEvent({
        category: 'security',
        type: 'development_model_budget_blocked',
        status: 'blocked',
        agentId,
        runId: payload.runId,
        title: `${agentId} 独立开发模型调用已阻断`,
        summary: '缺少会话级一次性模型预算授权',
      });
      return sendJson(response, 403, { error: '独立开发模型调用缺少会话级一次性预算授权' });
    }
    const maxTokens = payload.maxTokens ?? 300;
    const requestWorkspace = workspaceRoot;
    let developmentCall = null;
    let developmentResponseKey = '';
    let developmentResponseRequestSha256 = '';
    if (payload.developmentAuthorization !== undefined) {
      developmentCall = {
        ...payload.developmentAuthorization,
        runId: payload.runId,
        agentId,
        inputBytes: payload.developmentAuthorization.inputBytes,
        inputSha256: payload.developmentAuthorization.inputSha256,
        modelRouteSha256: hashDevelopmentModelRoute(payload.config, payload.responseFormat),
        providerReadinessSha256: sha256Hex(payload.config.readinessId),
        maxOutputTokens: maxTokens,
      };
      developmentResponseKey = developmentModelResponseKey(developmentCall, requestWorkspace);
      developmentResponseRequestSha256 = developmentModelResponseRequestSha256(
        developmentCall,
        requestWorkspace,
        normalizedPolicy.policy,
        payload.handoff,
        payload.safePilotAuthorization,
      );
      const replayLookup = developmentModelResponses.lookup(
        developmentResponseKey,
        developmentResponseRequestSha256,
      );
      if (replayLookup.kind === 'mismatch') {
        return sendJson(response, 409, { error: '开发模型响应重放合同不匹配' });
      }
      if (replayLookup.kind === 'hit') {
        const replay = await replayLookup.promise;
        appendRuntimeEvent({
          category: 'operation',
          type: 'development_model_response_replayed',
          status: 'succeeded',
          agentId,
          runId: payload.runId,
          title: `${agentId} 开发模型响应已从内存重放`,
          summary: '同一授权与请求合同命中；未再次访问 Provider',
        }, requestWorkspace);
        return sendJson(response, replay.status, { ...replay.payload, replayed: true });
      }
      if (developmentInputUnavailable) {
        return sendJson(response, 409, {
          error: '开发模型签发消息正文不可用：已过期、已淘汰、工作区已切换或服务已重启；请以新 runId 重新签发',
        });
      }
      try {
        await developmentManager.preflightModelCall(developmentCall);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 409;
        const reason = error instanceof Error ? error.message : '开发模型一次性授权无效';
        const publicReason = status === 409 && reason.includes('已使用')
          ? DEVELOPMENT_RESPONSE_UNAVAILABLE_ERROR
          : reason;
        appendRuntimeEvent({
          category: 'security',
          type: 'development_model_budget_blocked',
          status: 'blocked',
          agentId,
          runId: payload.runId,
          title: `${agentId} 独立开发模型调用已阻断`,
          summary: publicReason,
        }, requestWorkspace);
        return sendJson(response, status, { error: publicReason });
      }
    }
    const runResult = getOrCreateOrchestrationRun(payload.runId, normalizedPolicy.policy, requestWorkspace);
    if (!runResult.ok) return sendJson(response, runResult.status, { error: runResult.error });
    const run = runResult.run;
    const handoffProblem = validateModelHandoff(run, agentId, payload.handoff);
    if (handoffProblem) {
      appendRuntimeEvent({
        category: 'security',
        type: 'handoff_blocked',
        status: 'blocked',
        agentId,
        runId: payload.runId,
        title: `${agentId} 交接证据已阻断`,
        summary: handoffProblem,
      }, requestWorkspace);
      return sendJson(response, 409, { error: handoffProblem, run: publicOrchestrationRun(run) });
    }
    const safePilotCall = resolveSafePilotCall(payload, agentId, maxTokens, requestWorkspace);
    if (!safePilotCall.ok) {
      appendRuntimeEvent({
        category: 'security',
        type: 'safe_pilot_budget_or_authorization_blocked',
        status: 'blocked',
        agentId,
        runId: payload.runId,
        title: `${agentId} 四 Agent 安全启动门已阻断`,
        summary: safePilotCall.error,
      }, requestWorkspace);
      return sendJson(response, safePilotCall.status, { error: safePilotCall.error, run: publicOrchestrationRun(run) });
    }
    const reservationPreflight = preflightModelCallReservation(run, agentId, maxTokens, requestWorkspace);
    if (!reservationPreflight.ok) {
      applyModelCallReservationBlock(run, reservationPreflight);
      rollbackSafePilotReservation(safePilotCall, maxTokens);
      appendRuntimeEvent({
        category: 'operation',
        type: 'orchestration_budget_blocked',
        status: 'blocked',
        agentId,
        runId: payload.runId,
        title: `${agentId} 模型预算已阻断`,
        summary: reservationPreflight.error,
      }, requestWorkspace);
      return sendJson(response, reservationPreflight.status, {
        error: reservationPreflight.error,
        run: publicOrchestrationRun(run),
      });
    }
    let developmentLease = null;
    if (developmentCall) {
      try {
        developmentLease = await developmentManager.beginModelCall(developmentCall);
      } catch (error) {
        rollbackSafePilotReservation(safePilotCall, maxTokens);
        const status = Number.isInteger(error?.status) ? error.status : 409;
        const reason = error instanceof Error ? error.message : '开发模型一次性授权无效';
        appendRuntimeEvent({
          category: 'security',
          type: 'development_model_budget_blocked',
          status: 'blocked',
          agentId,
          runId: payload.runId,
          title: `${agentId} 独立开发模型调用已阻断`,
          summary: reason,
        }, requestWorkspace);
        return sendJson(response, status, { error: reason, run: publicOrchestrationRun(run) });
      }
    }
    const reservation = reserveModelCall(run, agentId, maxTokens, requestWorkspace);
    if (!reservation.ok) {
      developmentLease?.release();
      rollbackSafePilotReservation(safePilotCall, maxTokens);
      appendRuntimeEvent({
        category: 'operation',
        type: 'orchestration_budget_blocked',
        status: 'blocked',
        agentId,
        runId: payload.runId,
        title: `${agentId} 模型预算已阻断`,
        summary: reservation.error,
      }, requestWorkspace);
      return sendJson(response, reservation.status, { error: reservation.error, run: publicOrchestrationRun(run) });
    }
    if (reservation.reopened) {
      appendRuntimeEvent({
        category: 'operation',
        type: 'single_agent_bounded_retry',
        status: 'pending',
        agentId,
        runId: payload.runId,
        title: `${agentId} 验收改写已启动`,
        summary: '同一单 Agent 仅使用剩余模型预算压缩上次答案',
      }, requestWorkspace);
    }
    if (safePilotCall.record) {
      safePilotCall.record.operatorEvidenceAttemptCounts[agentId] += 1;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort('stage_timeout');
    }, run.policy.stageTimeoutMs);
    const abortOnClientDisconnect = !developmentCall;
    const onRequestAborted = () => controller.abort('client_aborted');
    if (abortOnClientDisconnect) request.once('aborted', onRequestAborted);
    activeModelCalls.set(reservation.key, {
      controller,
      workspace: requestWorkspace,
      runId: payload.runId,
      agentId,
    });

    appendRuntimeEvent({
      category: 'conversation',
      type: 'agent_request',
      status: 'pending',
      agentId,
      runId: payload.runId,
      title: `协调链路 → ${agentId}`,
      summary: developmentCall
        ? '开发模型请求已按脱敏合同转发；原始消息不进入运行事件'
        : '模型请求已按会话能力转发；原始消息不进入运行事件',
    });

    const callStartedAtMs = Date.now();
    let observedCallCostMicros = 0;
    const developmentResponseEntry = developmentCall
      ? developmentModelResponses.create(developmentResponseKey, developmentResponseRequestSha256)
      : null;
    try {
      const upstream = buildProviderRequest(payload.config, payload.messages, maxTokens, payload.responseFormat);
      const upstreamResponse = await fetch(upstream.url, {
        method: 'POST',
        headers: upstream.headers,
        body: JSON.stringify(upstream.body),
        signal: controller.signal,
      });
      if (!upstreamResponse.ok) {
        throw new Error(`上游 HTTP ${upstreamResponse.status}`);
      }
      const upstreamPayload = await readBoundedUpstreamJson(upstreamResponse);
      const usage = extractProviderUsage(payload.config.kind, upstreamPayload);
      if (developmentLease && hasCompleteProviderUsage(payload.config.kind, upstreamPayload)) {
        await developmentLease.recordUsage(usage);
      }
      const text = extractProviderText(payload.config.kind, upstreamPayload);
      if (!text) throw new Error(describeProviderEmptyResponse(payload.config.kind, upstreamPayload));
      if (text.length > 8_000) throw new Error('上游文本超过 8000 字符上限');
      const terminationReason = extractProviderTerminationReason(payload.config.kind, upstreamPayload);
      if (safePilotCall.record) {
        const budget = safePilotCall.record.profile.budget;
        const observedInputTokens = safePilotCall.record.usage.observedInputTokens + usage.inputTokens;
        const observedOutputTokens = safePilotCall.record.usage.observedOutputTokens + usage.outputTokens;
        observedCallCostMicros = Math.ceil(
          (usage.inputTokens * budget.inputRateMicrosPerMillion + usage.outputTokens * budget.outputRateMicrosPerMillion) / 1_000_000,
        );
        const observedCostMicros = safePilotCall.record.usage.observedCostMicros + observedCallCostMicros;
        if (
          observedInputTokens > budget.maxInputTokens ||
          observedOutputTokens > budget.maxOutputTokens ||
          observedCostMicros > budget.maxCostMicros
        ) {
          safePilotCall.record.status = 'failed';
          throw new Error('四 Agent Provider usage 超出硬预算');
        }
        safePilotCall.record.usage.observedInputTokens = observedInputTokens;
        safePilotCall.record.usage.observedOutputTokens = observedOutputTokens;
        safePilotCall.record.usage.observedCostMicros = observedCostMicros;
      }
      const createdAt = new Date().toISOString();
      const requestSha256 = sha256Hex(
        stableStringify({
          runId: payload.runId,
          agentId,
          provider: payload.config.kind,
          model: payload.config.model,
          maxTokens,
          messages: payload.messages,
          handoff: payload.handoff ?? null,
        }),
      );
      const outputSha256 = sha256Hex(text);
      const evidenceId = `model-${sha256Hex(stableStringify({
        runId: payload.runId,
        agentId,
        outputSha256,
      })).slice(0, 24)}`;
      const evidence = {
        evidenceId,
        runId: payload.runId,
        agentId,
        provider: payload.config.kind,
        model: payload.config.model,
        requestSha256,
        outputSha256,
        outputChars: text.length,
        reservedOutputTokens: maxTokens,
        observedOutputTokens: usage.outputTokens,
        terminationReason,
        authorization: 'session_capability',
        acceptanceStatus: 'provider_returned',
        createdAt,
      };
      if (safePilotCall.record) {
        const stage = {
          callIndex: safePilotCall.record.usage.callsStarted,
          attempt: safePilotCall.record.operatorEvidenceAttemptCounts[agentId],
          agentId,
          providerId: payload.config.kind,
          modelId: payload.config.model,
          evidenceId,
          outputSha256,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          activeMs: Math.max(0, Date.now() - callStartedAtMs),
          observedCostMicros: observedCallCostMicros,
        };
        if (payload.handoff) stage.handoffSha256 = sha256Hex(stableStringify(payload.handoff));
        safePilotCall.record.operatorEvidenceStages.push(stage);
      }
      run.callsSucceeded += 1;
      run.observedOutputTokens += usage.outputTokens;
      run.evidence.push(evidence);
      run.updatedAt = createdAt;
      run.status = 'awaiting_acceptance';
      if (safePilotCall.record) {
        safePilotCall.record.status = 'awaiting_acceptance';
        safePilotCall.record.lastEvidenceId = evidence.evidenceId;
      }
      appendRuntimeEvent({
        category: 'conversation',
        type: 'agent_message',
        status: 'succeeded',
        agentId,
        runId: payload.runId,
        title: `${agentId} 已返回（待任务验收）`,
        summary: developmentCall
          ? '开发模型返回已生成；Provider 正文仅回传本次调用'
          : '模型返回已生成；Provider 正文仅回传本次调用',
      }, requestWorkspace);
      appendRuntimeEvent({
        category: 'operation',
        type: 'orchestration_artifact',
        status: 'succeeded',
        agentId,
        runId: payload.runId,
        title: `${agentId} 产物证据已回流`,
        summary: `${evidence.evidenceId} · ${run.callsSucceeded}/${run.policy.expectedArtifacts} · ${run.reservedOutputTokens}/${run.policy.totalOutputTokens} tokens`,
      }, requestWorkspace);
      const responsePayload = { text, evidence, run: publicOrchestrationRun(run) };
      developmentModelResponses.settle(developmentResponseEntry, 200, responsePayload);
      return sendJson(response, 200, responsePayload);
    } catch (error) {
      run.callsFailed += 1;
      run.updatedAt = new Date().toISOString();
      const cancelled = run.status === 'cancelled';
      let failure = classifyModelCallFailure({ cancelled, timedOut, error });
      if (developmentLease) {
        try {
          await developmentLease.recordFailure(failure);
        } catch {
          failure = { code: 'PROVIDER_CALL_REJECTED', retryable: false };
        }
      }
      if (
        !cancelled &&
        (run.callsStarted >= run.policy.maxCalls || run.reservedOutputTokens >= run.policy.totalOutputTokens)
      ) {
        run.status = 'failed';
      }
      if (safePilotCall.record) {
        if (safePilotCall.record.status !== 'failed') {
          safePilotCall.record.status = safePilotCall.record.usage.manualRetriesUsed < safePilotCall.record.profile.budget.maxManualRetries
            ? 'waiting_retry_approval'
            : 'failed';
        }
        if (safePilotCall.record.status === 'waiting_retry_approval') {
          pauseSafePilotActiveClock(safePilotCall.record, true);
        } else {
          markSafePilotTerminal(safePilotCall.record, requestWorkspace);
        }
      }
      const reason = cancelled
        ? '编排 run 已取消'
        : timedOut
          ? `智能体请求超时（${Math.round(run.policy.stageTimeoutMs / 1000)} 秒）`
          : error instanceof Error
            ? error.message
            : '模型调用失败';
      appendRuntimeEvent({
        category: 'conversation',
        type: 'agent_error',
        status: 'failed',
        agentId,
        runId: payload.runId,
        title: `${agentId} 调用失败`,
        summary: developmentCall
          ? `failure=${failure.code}; retryable=${failure.retryable}`
          : reason,
      }, requestWorkspace);
      const responseStatus = cancelled ? 409 : timedOut ? 504 : 502;
      const responsePayload = {
        error: reason,
        failure,
        run: publicOrchestrationRun(run),
      };
      developmentModelResponses.settle(developmentResponseEntry, responseStatus, responsePayload);
      return sendJson(response, responseStatus, responsePayload);
    } finally {
      clearTimeout(timeout);
      if (abortOnClientDisconnect) request.off('aborted', onRequestAborted);
      activeModelCalls.delete(reservation.key);
      developmentLease?.release();
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/approvals/grant') {
    if (!requireSession(request, response)) return undefined;
    const payload = await readJsonBody(request);
    const normalized = normalizeActionDescriptor(payload);
    if (!normalized.ok) return sendJson(response, 400, { error: normalized.error });
    if (safePilotBlocksSideEffects(normalized.descriptor.runId)) {
      appendRuntimeEvent({
        category: 'security',
        type: 'safe_pilot_side_effect_blocked',
        status: 'blocked',
        agentId: normalized.descriptor.agentId,
        runId: normalized.descriptor.runId,
        title: '四 Agent run 副作用审批已阻断',
        summary: normalized.descriptor.kind,
      });
      return sendJson(response, 403, { error: '四 Agent run 仅允许 call_model，副作用动作固定关闭' });
    }
    const requiredCapability = getRequiredCapability(normalized.descriptor.kind);
    if (!requiredCapability || !hasCapability(normalized.descriptor.agentId, requiredCapability)) {
      appendRuntimeEvent({
        category: 'approval',
        type: 'permission_denied',
        status: 'blocked',
        agentId: normalized.descriptor.agentId,
        runId: normalized.descriptor.runId,
        title: `${normalized.descriptor.agentId} 动作审批已阻断`,
        summary: `${requiredCapability ?? 'unknown'} 权限未开放`,
      });
      return sendJson(response, 403, { error: `${normalized.descriptor.agentId} 未获得 ${requiredCapability} 权限` });
    }

    purgeExpiredApprovals();
    const approvalId = `approval-${createSessionToken().slice(0, 18)}`;
    const actionWorkspace = workspaceRoot;
    const workspaceId = createWorkspaceId(actionWorkspace);
    const requestHash = createActionFingerprint(workspaceId, normalized.descriptor);
    const expiresAt = Date.now() + 60_000;
    const approvalToken = createApprovalToken(sessionToken, approvalId, requestHash, expiresAt);
    approvals.set(approvalId, {
      approvalId,
      approvalToken,
      actionWorkspace,
      workspaceId,
      requestHash,
      descriptor: normalized.descriptor,
      expiresAt,
      consumed: false,
    });
    appendRuntimeEvent({
      category: 'approval',
      type: 'approval_granted',
      status: 'succeeded',
      agentId: normalized.descriptor.agentId,
      runId: normalized.descriptor.runId,
      title: `${normalized.descriptor.agentId} 获得一次性审批`,
      summary: `${normalized.descriptor.kind} · 60 秒内有效`,
    });
    return sendJson(response, 200, {
      ok: true,
      approvalId,
      approvalToken,
      expiresAt,
      requestHash,
      workspaceId,
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/execute') {
    if (!requireSession(request, response)) return undefined;
    const payload = await readJsonBody(request);
    return handleExecute(payload, response);
  }

  return sendJson(response, 404, { error: 'not found' });
}

/* ---------- 受控执行 ---------- */

async function handleExecute(payload, response) {
  const normalized = normalizeActionDescriptor(payload);
  if (!normalized.ok) return sendJson(response, 400, { error: normalized.error });
  if (safePilotBlocksSideEffects(normalized.descriptor.runId)) {
    return sendJson(response, 403, { error: '四 Agent run 仅允许 call_model，副作用动作固定关闭' });
  }

  const requiredCapability = getRequiredCapability(normalized.descriptor.kind);
  if (!requiredCapability || !hasCapability(normalized.descriptor.agentId, requiredCapability)) {
    appendRuntimeEvent({
      category: 'approval',
      type: 'permission_denied',
      status: 'blocked',
      agentId: normalized.descriptor.agentId,
      runId: normalized.descriptor.runId,
      title: `${normalized.descriptor.agentId} 动作已阻断`,
      summary: `${requiredCapability ?? 'unknown'} 权限未开放或已撤销`,
    });
    return sendJson(response, 403, { error: `${normalized.descriptor.agentId} 未获得 ${requiredCapability} 权限` });
  }

  const approvalId = typeof payload.approvalId === 'string' ? payload.approvalId : '';
  const approvalToken = typeof payload.approvalToken === 'string' ? payload.approvalToken : '';
  const approval = approvals.get(approvalId);
  if (!approval) return sendJson(response, 403, { error: '审批票据不存在' });

  const descriptor = normalized.descriptor;
  const requestHash = createActionFingerprint(approval.workspaceId, descriptor);
  if (approval.consumed) return sendJson(response, 409, { error: '审批票据已使用' });
  if (Date.now() > approval.expiresAt) return sendJson(response, 403, { error: '审批票据已过期' });
  if (workspaceRoot !== approval.actionWorkspace) {
    return sendJson(response, 409, { error: '工作区已变化，请重新审批' });
  }
  if (requestHash !== approval.requestHash) return sendJson(response, 403, { error: '动作参数与审批范围不一致' });
  if (!verifyApprovalToken(sessionToken, approvalId, requestHash, approval.expiresAt, approvalToken)) {
    return sendJson(response, 403, { error: '审批票据签名无效' });
  }

  const idempotencyStorageKey = `${approval.workspaceId}:${descriptor.idempotencyKey}`;
  const cached = idempotencyResults.get(idempotencyStorageKey);
  if (cached) {
    approval.consumed = true;
    if (cached.requestHash !== requestHash) {
      return sendJson(response, 409, { error: '幂等键已绑定其他动作' });
    }
    appendRuntimeEvent({
      category: 'operation',
      type: 'operation_replayed',
      status: cached.body.ok ? 'succeeded' : 'failed',
      agentId: descriptor.agentId,
      runId: descriptor.runId,
      title: `${descriptor.kind} 返回幂等结果`,
      summary: descriptor.idempotencyKey,
    });
    return sendJson(response, cached.statusCode, { ...cached.body, replayed: true });
  }

  const activeRunKey = `${approval.workspaceId}:${descriptor.runId}`;
  if (activeRunKeys.has(activeRunKey)) return sendJson(response, 409, { error: '同一 run 已有动作执行中' });
  approval.consumed = true;
  activeRunKeys.add(activeRunKey);
  appendRuntimeEvent({
    category: 'operation',
    type: 'operation_started',
    status: 'pending',
    agentId: descriptor.agentId,
    runId: descriptor.runId,
    title: `${descriptor.kind} 开始`,
    summary: descriptor.idempotencyKey,
  });

  const receiptBase = {
    kind: descriptor.kind,
    runId: descriptor.runId,
    agentId: descriptor.agentId,
    workspaceId: approval.workspaceId,
    approvalId,
    idempotencyKey: descriptor.idempotencyKey,
    requestHash,
  };

  try {
    if (descriptor.kind === 'patch-preflight') {
      const proposals = workspacePatchProposals(approval.actionWorkspace);
      const record = proposals.get(descriptor.proposalId);
      if (!record || record.proposalSha256 !== descriptor.proposalSha256) {
        throw new Error('补丁提案不存在或 SHA-256 与审批范围不一致');
      }
      if (record.proposal.runId !== descriptor.runId) {
        throw new Error('补丁提案 runId 与审批范围不一致');
      }
      if (record.status !== 'validated_locked') {
        throw new Error(`补丁提案当前状态不允许原件预检：${record.status}`);
      }

      let inspection;
      try {
        inspection = await inspectPatchPreimages(approval.actionWorkspace, record.proposal);
      } catch (error) {
        inspection = {
          matched: false,
          files: [],
          error: error instanceof Error ? error.message : '原文件只读预检失败',
        };
      }
      const checkedAt = new Date().toISOString();
      record.status = inspection.matched ? 'preflight_passed_locked' : 'preflight_failed_locked';
      record.preflight = {
        checkedAt,
        matched: inspection.matched,
        files: inspection.files,
      };
      const detail = inspection.matched
        ? `${record.proposal.files.length} files matched`
        : inspection.error ?? `${inspection.files.filter((file) => !file.matched).length} SHA-256 mismatches`;
      const receipt = await pushReceipt(
        {
          ...receiptBase,
          detail,
          status: inspection.matched ? 'ok' : 'failed',
        },
        approval.actionWorkspace,
        false,
      );
      const body = {
        ok: inspection.matched,
        proposal: patchProposalSummary(record),
        receipt,
        ...(inspection.matched ? {} : { error: inspection.error ?? '原文件 SHA-256 与提案不一致' }),
      };
      storeIdempotencyResult(idempotencyStorageKey, { requestHash, statusCode: 200, body });
      appendRuntimeEvent({
        category: 'security',
        type: inspection.matched ? 'patch_preflight_passed' : 'patch_preflight_failed',
        status: inspection.matched ? 'succeeded' : 'blocked',
        agentId: descriptor.agentId,
        runId: descriptor.runId,
        title: inspection.matched ? '补丁原件只读预检通过，应用仍锁定' : '补丁原件只读预检未通过',
        summary: `${record.proposal.proposalId} · ${detail}`,
      });
      return sendJson(response, 200, body);
    }

    if (descriptor.kind === 'patch-apply') {
      const proposals = workspacePatchProposals(approval.actionWorkspace);
      const record = proposals.get(descriptor.proposalId);
      if (!record || record.proposalSha256 !== descriptor.proposalSha256) {
        throw new Error('补丁提案不存在或 SHA-256 与审批范围不一致');
      }
      if (record.proposal.runId !== descriptor.runId) {
        throw new Error('补丁提案 runId 与审批范围不一致');
      }
      if (record.status !== 'preflight_passed_locked' || !record.preflight?.matched) {
        throw new Error(`补丁提案尚未通过同一工作区原件预检：${record.status}`);
      }

      const recovery = await recoverPatchTransactions(approval.actionWorkspace);
      const recoveryFailures = recovery.filter((item) => item.status === 'recovery_failed');
      if (recoveryFailures.length) {
        throw new Error(`存在未恢复补丁事务：${recoveryFailures.map((item) => item.transactionId).join(', ')}`);
      }
      const inspection = await inspectPatchPreimages(approval.actionWorkspace, record.proposal);
      if (!inspection.matched) {
        record.status = 'preflight_failed_locked';
        record.preflight = {
          checkedAt: new Date().toISOString(),
          matched: false,
          files: inspection.files,
        };
        throw new Error('应用前 preimage SHA-256 已变化，补丁继续锁定');
      }

      const transaction = await applyPatchTransaction(approval.actionWorkspace, record.proposal);
      const appliedAt = new Date().toISOString();
      record.status = 'applied';
      record.application = {
        appliedAt,
        transactionId: transaction.transactionId,
        status: transaction.status,
        files: transaction.files.map((file) => ({ ...file })),
      };
      const receipt = await pushReceipt(
        {
          ...receiptBase,
          detail: `${record.proposal.proposalId} · ${transaction.transactionId} · ${transaction.files.length} files`,
          status: 'ok',
        },
        approval.actionWorkspace,
      );
      const body = { ok: true, proposal: patchProposalSummary(record), transaction, receipt };
      storeIdempotencyResult(idempotencyStorageKey, { requestHash, statusCode: 200, body });
      appendRuntimeEvent({
        category: 'security',
        type: 'patch_application_succeeded',
        status: 'succeeded',
        agentId: descriptor.agentId,
        runId: descriptor.runId,
        title: '补丁事务应用完成',
        summary: `${record.proposal.proposalId} · ${transaction.transactionId} · ${transaction.files.length} 个文件`,
      });
      return sendJson(response, 200, body);
    }

    if (descriptor.kind === 'save-note') {
      const fileName = `${descriptor.title}-${timestamp()}.md`;
      await ensureSafeWriteRoot(approval.actionWorkspace);
      const target = resolveSafeWritePath(approval.actionWorkspace, fileName);
      if (!target) return sendJson(response, 400, { error: '非法写入路径' });
      const content = String(payload.content ?? '');
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, content, 'utf-8');
      const receipt = await pushReceipt(
        { ...receiptBase, detail: path.relative(approval.actionWorkspace, target), status: 'ok' },
        approval.actionWorkspace,
      );
      const body = { ok: true, path: target, receipt };
      storeIdempotencyResult(idempotencyStorageKey, { requestHash, statusCode: 200, body });
      appendRuntimeEvent({
        category: 'operation',
        type: 'operation_succeeded',
        status: 'succeeded',
        agentId: descriptor.agentId,
        runId: descriptor.runId,
        title: '纪要已保存',
        summary: path.relative(approval.actionWorkspace, target),
      });
      return sendJson(response, 200, body);
    }

    const result = await runBuild(approval.actionWorkspace);
    const receipt = await pushReceipt(
      {
        ...receiptBase,
        detail: `exit=${result.exitCode}`,
        status: result.exitCode === 0 ? 'ok' : 'failed',
      },
      approval.actionWorkspace,
    );
    const body = {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      outputTail: result.outputTail,
      receipt,
    };
    storeIdempotencyResult(idempotencyStorageKey, { requestHash, statusCode: 200, body });
    appendRuntimeEvent({
      category: 'operation',
      type: result.exitCode === 0 ? 'operation_succeeded' : 'operation_failed',
      status: result.exitCode === 0 ? 'succeeded' : 'failed',
      agentId: descriptor.agentId,
      runId: descriptor.runId,
      title: result.exitCode === 0 ? '构建验证通过' : '构建验证失败',
      summary: `exit=${result.exitCode}`,
    });
    return sendJson(response, 200, body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : '执行失败';
    const receipt = await pushReceipt(
      { ...receiptBase, detail: reason.slice(0, 300), status: 'failed' },
      approval.actionWorkspace,
      descriptor.kind !== 'patch-preflight',
    );
    const body = { ok: false, error: reason, receipt };
    storeIdempotencyResult(idempotencyStorageKey, { requestHash, statusCode: 500, body });
    appendRuntimeEvent({
      category: 'operation',
      type: 'operation_failed',
      status: 'failed',
      agentId: descriptor.agentId,
      runId: descriptor.runId,
      title: `${descriptor.kind} 执行失败`,
      summary: reason,
    });
    return sendJson(response, 500, body);
  } finally {
    activeRunKeys.delete(activeRunKey);
  }
}

function runBuild(actionWorkspace) {
  return new Promise((resolve) => {
    // Windows 下 .cmd 必须经 shell 启动（Node 20.12+ 非 shell spawn .cmd 抛 EINVAL）。
    // 命令为固定字符串，无用户输入拼接，无注入面。
    const isWindows = process.platform === 'win32';
    const child = isWindows
      ? spawn('npm run build', { cwd: actionWorkspace, shell: true, timeout: 5 * 60 * 1000 })
      : spawn('npm', ['run', 'build'], { cwd: actionWorkspace, shell: false, timeout: 5 * 60 * 1000 });
    let output = '';
    const append = (chunk) => {
      output = (output + chunk.toString()).slice(-8000);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('close', (code) => resolve({ exitCode: code ?? -1, outputTail: output.slice(-2500) }));
    child.on('error', (error) => resolve({ exitCode: -1, outputTail: String(error) }));
  });
}

/** 回执：入内存台账 + 追加到 <workspace>/ai-output/RECEIPTS.md 持久留痕 */
async function pushReceipt(entry, receiptWorkspace, persist = true) {
  const receipts = receiptsByWorkspace.get(receiptWorkspace) ?? [];
  const previousReceipt = receipts[receipts.length - 1];
  const previousHash = previousReceipt?.receiptHash ?? '';
  const unsignedReceipt = {
    ...entry,
    at: new Date().toISOString(),
    seq: (previousReceipt?.seq ?? 0) + 1,
    previousHash,
  };
  const receipt = { ...unsignedReceipt, receiptHash: sha256Hex(stableStringify(unsignedReceipt)) };
  receiptsByWorkspace.set(
    receiptWorkspace,
    retainLatestRecords([...receipts, receipt], SERVER_RETENTION_LIMITS.receiptsPerWorkspace),
  );
  try {
    if (!persist) return receipt;
    const ledger = resolveSafeWritePath(receiptWorkspace, 'RECEIPTS.md');
    if (ledger) {
      await ensureSafeWriteRoot(receiptWorkspace);
      await fsp.appendFile(
        ledger,
        `- ${receipt.at} · #${receipt.seq} · ${receipt.kind} · ${receipt.status} · run=${receipt.runId} · approval=${receipt.approvalId} · hash=${receipt.receiptHash} · ${receipt.detail}\n`,
        'utf-8',
      );
    }
  } catch {
    // 台账写入失败不阻塞主流程（内存回执仍在）
  }
  return receipt;
}

/* ---------- .agent-hub 读取 ---------- */

async function getCheckpointDir(actionWorkspace, create) {
  const writeRoot = create ? await ensureSafeWriteRoot(actionWorkspace) : path.resolve(actionWorkspace, 'ai-output');
  if (!create && !fs.existsSync(writeRoot)) return null;
  const rootStat = await fsp.lstat(writeRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('ai-output 检查点根目录非法');
  const candidate = path.join(writeRoot, CHECKPOINT_SUBDIR);
  if (!fs.existsSync(candidate)) {
    if (!create) return null;
    await fsp.mkdir(candidate, { recursive: false });
  }
  const stat = await fsp.lstat(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('检查点目录不得是符号链接/目录联接');
  const realRoot = await fsp.realpath(writeRoot);
  const realDir = await fsp.realpath(candidate);
  const relation = path.relative(realRoot, realDir);
  if (relation.startsWith('..') || path.isAbsolute(relation)) throw new Error('检查点目录越出 ai-output');
  return realDir;
}

async function readCheckpointRecords(actionWorkspace) {
  const checkpointDir = await getCheckpointDir(actionWorkspace, false);
  if (!checkpointDir) return [];
  const entries = (await fsp.readdir(checkpointDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^[a-f0-9]{24}-\d{6}\.json$/i.test(entry.name))
    .slice(0, 500);
  const records = [];
  for (const entry of entries) {
    const target = path.join(checkpointDir, entry.name);
    const stat = await fsp.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) continue;
    try {
      const checkpoint = JSON.parse(await fsp.readFile(target, 'utf8'));
      const normalized = normalizeCheckpointPayload({ checkpoint });
      if (normalized.ok) records.push(normalized.checkpoint);
    } catch {
      // 单个损坏检查点不阻断其他 run 的恢复。
    }
  }
  return records;
}

function checkpointSummary(checkpoint) {
  return {
    runId: checkpoint.runId,
    revision: checkpoint.revision,
    updatedAt: checkpoint.updatedAt,
    taskText: checkpoint.pipeline.taskText,
    status: checkpoint.pipeline.status,
    completedNodes: checkpoint.dag.nodes.filter((node) => ['simulated', 'succeeded'].includes(node.status)).length,
    totalNodes: checkpoint.dag.nodes.length,
  };
}

async function collectAgentHubFiles() {
  const files = [];
  let totalBytes = 0;
  const readWorkspace = workspaceRoot;
  const readAgentHub = agentHubDir;

  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (/node_modules|\.git$/i.test(entry.name)) continue;
        await walk(absolute);
      } else if (entry.isFile()) {
        const relative = path.relative(readWorkspace, absolute).replaceAll('\\', '/');
        if (!isAllowedAgentHubFile(relative)) continue;
        const stat = await fsp.stat(absolute);
        if (stat.size > MAX_FILE_BYTES || totalBytes + stat.size > MAX_TOTAL_BYTES) continue;
        totalBytes += stat.size;
        const text = await fsp.readFile(absolute, 'utf-8');
        files.push({ path: relative, text });
      }
    }
  }

  await walk(readAgentHub);
  return files;
}

/* ---------- 静态托管（产品模式） ---------- */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

async function serveStatic(pathname, response) {
  response.setHeader('cache-control', 'no-store');
  if (!fs.existsSync(DIST_DIR)) {
    response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('dist/ 不存在：请先运行 npm run build（或使用 start-all.bat 自动构建）。开发模式请用 start-dev.bat。');
    return;
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const target = path.resolve(DIST_DIR, `.${requested}`);
  const relation = path.relative(DIST_DIR, target);
  const safe = !relation.startsWith('..') && !path.isAbsolute(relation);
  const filePath = safe && fs.existsSync(target) && fs.statSync(target).isFile()
    ? target
    : path.join(DIST_DIR, 'index.html');
  const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  response.writeHead(200, { 'content-type': mime });
  fs.createReadStream(filePath).pipe(response);
}

/* ---------- 基础设施 ---------- */

function trustedBrowserOrigin(request) {
  const host = typeof request.headers.host === 'string' ? request.headers.host.toLowerCase() : '';
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin.toLowerCase() : '';
  if (!origin || !allowedHostHeaders.has(host)) return '';
  return origin === `http://${host}` ? origin : '';
}

function redactCheckpointForPersistence(checkpoint) {
  const redactReceiptSummary = (receipt) => {
    const lines = String(receipt.summary ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const findings = lines.find((line) => /^FINDINGS:H\d+\/M\d+\/L\d+$/.test(line));
    const gate = lines.find((line) => /^GATE:(?:PASS|FAIL)$/.test(line));
    if (['AG-SEC', 'AG-REVIEW'].includes(receipt.agentCode) && findings && gate) {
      return `${findings}\n${gate}`;
    }
    return `[${receipt.status}] stage result redacted`;
  };
  const pipeline = {
    ...checkpoint.pipeline,
    taskText: '[redacted task]',
    stages: checkpoint.pipeline.stages.map((stage) => ({
      ...stage,
      agentName: stage.agentCode,
      phaseLabel: 'stage',
      narration: 'Stage narration redacted before persistence.',
    })),
    receipts: checkpoint.pipeline.receipts.map((receipt) => ({
      ...receipt,
      agentName: receipt.agentCode,
      phaseLabel: 'stage',
      summary: redactReceiptSummary(receipt),
    })),
    failure: checkpoint.pipeline.failure
      ? { ...checkpoint.pipeline.failure, message: 'Failure detail redacted before persistence.' }
      : null,
  };
  return {
    ...checkpoint,
    pipeline,
    dag: {
      ...checkpoint.dag,
      taskText: '[redacted task]',
      nodes: checkpoint.dag.nodes.map((node) => ({
        ...node,
        label: node.agentCode,
        summary: node.summary ? 'Stage result redacted before persistence.' : '',
      })),
    },
  };
}

function isTrustedLocalRequest(request) {
  const host = typeof request.headers.host === 'string' ? request.headers.host.toLowerCase() : '';
  if (!allowedHostHeaders.has(host)) return false;
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
  return !origin || Boolean(trustedBrowserOrigin(request));
}

function applyCors(request, response) {
  const origin = trustedBrowserOrigin(request);
  if (origin) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'origin');
    response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type, x-agenthub-session');
  }
}

function applySecurityHeaders(response) {
  response.setHeader('content-security-policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '));
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

async function readBoundedUpstreamJson(upstreamResponse, maxBytes = 1_000_000) {
  const declaredLength = Number(upstreamResponse.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error('上游响应超过 1MB 上限');
  if (!upstreamResponse.body) throw new Error('上游响应体缺失');
  const reader = upstreamResponse.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('response_too_large');
      throw new Error('上游响应超过 1MB 上限');
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
  } catch {
    throw new Error('上游 JSON 解析失败');
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('请求体过大'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch {
        reject(new Error('JSON 解析失败'));
      }
    });
    request.on('error', reject);
  });
}

function readArg(list, name) {
  const index = list.indexOf(name);
  return index >= 0 ? list[index + 1] : undefined;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

let shuttingDown = false;
async function shutdownLocalService() {
  if (shuttingDown) return;
  shuttingDown = true;
  watcher?.close();
  watcher = null;
  for (const client of sseClients) client.end();
  sseClients.clear();
  for (const active of activeModelCalls.values()) active.controller.abort('service_shutdown');
  const forceTimer = setTimeout(() => {
    server.closeAllConnections?.();
    process.exit(1);
  }, 5_000);
  forceTimer.unref();
  await developmentManager.dispose().catch(() => undefined);
  server.close((error) => {
    clearTimeout(forceTimer);
    process.exitCode = error ? 1 : 0;
  });
}

process.once('SIGINT', shutdownLocalService);
process.once('SIGTERM', shutdownLocalService);

server.on('error', (error) => {
  const reason = error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE'
    ? '端口已被占用'
    : '监听失败';
  console.error(`AgentHub 本地服务启动失败: ${reason}`);
  watcher?.close();
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`AgentHub 本地服务已启动: http://127.0.0.1:${port}`);
  console.log(`工作区标识: ${createWorkspaceId(workspaceRoot)}`);
  console.log(`启动器托管: ${operatorIdentity.managed ? '是' : '否'}`);
  console.log(`产品模式: ${fs.existsSync(DIST_DIR) ? '已托管 dist/（浏览器直接打开上方地址）' : '未构建（仅 API 模式）'}`);
  console.log('安全边界: 仅本机访问 / 读取 allowlist / 纪要与台账限 ai-output/ / 补丁仅限批准路径 / 无 git 操作');
  console.log('注意: run-build 动作会在工作区产生正常构建产物（如 dist/），属构建工具自身写入');
});
