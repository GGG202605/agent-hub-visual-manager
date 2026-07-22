/**
 * v0.5 本地服务纯函数库（零依赖，可被 vitest 直接单测）。
 * 安全原则：allowlist 优先、路径穿越零容忍、大小上限；常规写入限 ai-output/，补丁应用另走严格提案与事务门。
 */

import path from 'node:path';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 允许读取的 .agent-hub 文件（与前端 agentHubBrowserImport 的 allowlist 对齐） */
export const READ_ALLOWLIST_PATTERNS = [
  /(^|[\\/])project-state\.md$/i,
  /(^|[\\/])tasks[\\/][^\\/]+\.md$/i,
  /(^|[\\/])runs[\\/][^\\/]+\.md$/i,
  /(^|[\\/])reviews[\\/][^\\/]+\.md$/i,
  /(^|[\\/])NEXT-DECISION-PACKET\.md$/i,
  /(^|[\\/])RISK-REGISTER\.md$/i,
  /(^|[\\/])PROVENANCE\.md$/i,
  /(^|[\\/])BUILD-VALIDATION\.md$/i,
];

/** 任何情况下拒绝读取（防呆） */
export const READ_DENYLIST_PATTERNS = [
  /\.env/i,
  /secret|credential|token|\.pem$|\.key$|\.pfx$/i,
  /node_modules|\.git([\\/]|$)/i,
];

export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
export const MAX_FILES = 400;

export const ORCHESTRATION_LIMITS = Object.freeze({
  maxRunsPerWorkspace: 100,
  maxCalls: 32,
  maxExpectedArtifacts: 16,
  maxTotalOutputTokens: 32_768,
  minStageTimeoutMs: 5_000,
  maxStageTimeoutMs: 120_000,
});

export const SERVER_RETENTION_LIMITS = Object.freeze({
  receiptsPerWorkspace: 500,
  liveSafePilotAuthorizationsPerWorkspace: 500,
  livePatchProposalsPerWorkspace: 100,
});

export const DEVELOPMENT_RESPONSE_REPLAY_POLICY = Object.freeze({
  completedLimit: 100,
  ttlMs: 10 * 60 * 1_000,
});
const MAX_TIMER_DELAY_MS = 2_147_483_647;

function scheduleUnrefTimeout(callback, delayMs) {
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
  return timer;
}

export function retainLatestRecords(records, limit) {
  if (!Array.isArray(records) || !Number.isInteger(limit) || limit < 1) return [];
  return records.length <= limit ? [...records] : records.slice(-limit);
}

export function planBoundedRecordAdmission(records, { limit, terminalStatuses = [], now = Date.now() } = {}) {
  const safeRecords = Array.isArray(records) ? records : [];
  const terminal = new Set(Array.isArray(terminalStatuses) ? terminalStatuses : []);
  const removableIds = [];
  let liveCount = 0;
  for (const record of safeRecords) {
    const isExpired = Number.isFinite(record?.expiresAt) && record.expiresAt < now;
    if (isExpired || terminal.has(record?.status)) removableIds.push(record?.id);
    else liveCount += 1;
  }
  return {
    removableIds,
    liveCount,
    limit,
    canAdmit: Number.isInteger(limit) && limit > 0 && liveCount < limit,
  };
}

export function createBoundedResponseReplayCache({
  completedLimit = DEVELOPMENT_RESPONSE_REPLAY_POLICY.completedLimit,
  ttlMs = DEVELOPMENT_RESPONSE_REPLAY_POLICY.ttlMs,
  now = Date.now,
  clone = structuredClone,
  schedule = scheduleUnrefTimeout,
  cancelSchedule = clearTimeout,
} = {}) {
  if (!Number.isInteger(completedLimit) || completedLimit < 1) throw new TypeError('completedLimit 必须为正整数');
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_TIMER_DELAY_MS) {
    throw new TypeError('ttlMs 必须为有效定时器范围内的正安全整数');
  }
  if (
    typeof now !== 'function'
    || typeof clone !== 'function'
    || typeof schedule !== 'function'
    || typeof cancelSchedule !== 'function'
  ) throw new TypeError('now、clone、schedule 与 cancelSchedule 必须为函数');
  const entries = new Map();

  function removeEntry(key, entry) {
    if (entries.get(key) !== entry) return false;
    entries.delete(key);
    if (entry.expiryHandle !== null) cancelSchedule(entry.expiryHandle);
    entry.expiryHandle = null;
    return true;
  }

  function expireEntry(entry) {
    if (!entry.settled || entries.get(entry.key) !== entry) return;
    const remainingMs = entry.expiresAt - now();
    if (remainingMs > 0) {
      entry.expiryHandle = schedule(() => expireEntry(entry), Math.min(remainingMs, MAX_TIMER_DELAY_MS));
      return;
    }
    removeEntry(entry.key, entry);
  }

  function purge() {
    const currentTime = now();
    for (const [key, entry] of entries) {
      if (entry.settled && entry.expiresAt <= currentTime) removeEntry(key, entry);
    }
    const completed = [...entries.entries()]
      .filter(([, entry]) => entry.settled)
      .sort((left, right) => left[1].expiresAt - right[1].expiresAt);
    for (let index = 0; index < completed.length - completedLimit; index += 1) {
      removeEntry(completed[index][0], completed[index][1]);
    }
  }

  function lookup(key, requestSha256) {
    purge();
    const entry = entries.get(key);
    if (!entry) return { kind: 'miss' };
    if (entry.requestSha256 !== requestSha256) return { kind: 'mismatch' };
    return { kind: 'hit', promise: entry.promise };
  }

  function create(key, requestSha256) {
    purge();
    if (entries.has(key)) throw new Error('响应重放缓存键已存在');
    let resolve;
    const entry = {
      key,
      requestSha256,
      settled: false,
      expiresAt: Number.POSITIVE_INFINITY,
      expiryHandle: null,
      promise: new Promise((settle) => { resolve = settle; }),
      resolve,
    };
    entries.set(key, entry);
    return entry;
  }

  function settle(entry, status, payload) {
    if (!entry || entry.settled || entries.get(entry.key) !== entry) return false;
    const snapshot = clone(payload);
    const expiresAt = now() + ttlMs;
    if (!Number.isSafeInteger(expiresAt)) throw new Error('响应重放缓存到期时间非法');
    const expiryHandle = schedule(() => expireEntry(entry), ttlMs);
    entry.settled = true;
    entry.expiresAt = expiresAt;
    entry.expiryHandle = expiryHandle;
    entry.resolve({ status, payload: snapshot });
    purge();
    return true;
  }

  function clearCompleted() {
    purge();
    let removed = 0;
    for (const [key, entry] of entries) {
      if (entry.settled && removeEntry(key, entry)) removed += 1;
    }
    return removed;
  }

  function inspect() {
    purge();
    const values = [...entries.values()];
    return {
      size: values.length,
      pending: values.filter((entry) => !entry.settled).length,
      completed: values.filter((entry) => entry.settled).length,
    };
  }

  return Object.freeze({ lookup, create, settle, clearCompleted, inspect });
}

export const SAFE_PILOT_PROFILE_ID = 'pilot-4-readonly-v2';
export const SAFE_PILOT_AGENT_ORDER = Object.freeze(['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW']);
export const SAFE_PILOT_ISSUER_PIN_FIELDS = Object.freeze(['taskSha256', 'contextSha256', 'profileSha256']);
export const OPERATOR_EVIDENCE_SCHEMA = 'agenthub.operator-evidence';
export const OPERATOR_EVIDENCE_SCHEMA_VERSION = 1;
export const OPERATOR_EVIDENCE_MAX_BYTES = 256 * 1024;
export const OPERATOR_EVIDENCE_CANONICALIZATION = 'agenthub-json-v1';
const SAFE_PILOT_CAPABILITIES = Object.freeze([
  'call_model',
  'manage_checkpoint',
  'save_note',
  'run_build',
  'propose_patch',
  'preflight_patch',
  'apply_patch',
]);
const SAFE_PILOT_PROVIDERS = new Set(['claude', 'openai', 'deepseek', 'custom', 'none']);
export const SAFE_PILOT_RETRY_REPAIR_MARKER = 'TRUSTED_LOCAL_VALIDATION_REPAIR_JSON:';
const SAFE_PILOT_RETRY_CODES = new Set([
  'output_truncated',
  'substantive_gate_blocked',
  'final_gate_contract',
  'findings_contract',
  'gate_finding_consistency',
  'traceability',
  'unknown_source_tag',
  'unsupported_name',
  'content_too_short',
  'local_validation',
]);
const SAFE_PILOT_REQUIRED_REPAIR_RULES = [
  'REWRITE_CURRENT_STAGE_ONLY',
  'PRESERVE_TASK_GROUNDING_HANDOFF',
  'NO_NEW_FACTS',
  'SATISFY_LOCAL_VALIDATION_CONTRACT',
];

export function safePilotTotalTimeoutExpired(startedAtMs, totalTimeoutMs, now = Date.now()) {
  return Number.isFinite(startedAtMs)
    && Number.isFinite(totalTimeoutMs)
    && totalTimeoutMs >= 0
    && now - startedAtMs > totalTimeoutMs;
}

export function safePilotActiveElapsedMs(activeElapsedMs, activeSegmentStartedAtMs, now = Date.now()) {
  const accumulated = Number.isFinite(activeElapsedMs) && activeElapsedMs >= 0 ? activeElapsedMs : 0;
  if (!Number.isFinite(activeSegmentStartedAtMs)) return accumulated;
  return accumulated + Math.max(0, now - activeSegmentStartedAtMs);
}

export function safePilotActiveTimeoutExpired(activeElapsedMs, activeSegmentStartedAtMs, totalTimeoutMs, now = Date.now()) {
  return Number.isFinite(totalTimeoutMs)
    && totalTimeoutMs >= 0
    && safePilotActiveElapsedMs(activeElapsedMs, activeSegmentStartedAtMs, now) > totalTimeoutMs;
}

export function safePilotHumanWaitExpired(humanWaitStartedAtMs, maxHumanWaitMs, now = Date.now()) {
  return Number.isFinite(humanWaitStartedAtMs)
    && Number.isFinite(maxHumanWaitMs)
    && maxHumanWaitMs >= 0
    && now - humanWaitStartedAtMs > maxHumanWaitMs;
}

export function validateSafePilotRetryRepairMessages(messages, requirement = null) {
  if (!Array.isArray(messages)) return '四 Agent 修复重试消息非法';
  const candidates = messages.filter((message) =>
    isPlainObject(message) &&
    message.role === 'user' &&
    typeof message.content === 'string' &&
    message.content.includes(SAFE_PILOT_RETRY_REPAIR_MARKER)
  );
  if (!requirement) return candidates.length === 0 ? null : '非修复调用不得携带本地验收修复单';
  if (candidates.length !== 1) return '四 Agent 修复重试必须且只能携带一份本地验收修复单';
  const content = candidates[0].content;
  const markerIndex = content.indexOf(SAFE_PILOT_RETRY_REPAIR_MARKER);
  let repair;
  try {
    repair = JSON.parse(content.slice(markerIndex + SAFE_PILOT_RETRY_REPAIR_MARKER.length).trim());
  } catch {
    return '四 Agent 本地验收修复单 JSON 非法';
  }
  if (!isPlainObject(repair)) return '四 Agent 本地验收修复单结构非法';
  const allowed = new Set([
    'version',
    'boundary',
    'agentCode',
    'evidenceId',
    'outputSha256',
    'validationCode',
    'validationProblem',
    'repairRules',
  ]);
  if (Object.keys(repair).some((key) => !allowed.has(key))) return '四 Agent 本地验收修复单含未允许字段';
  if (
    repair.version !== '1.0.0' ||
    repair.boundary !== 'TRUSTED_LOCAL_VALIDATION_REPAIR' ||
    repair.agentCode !== requirement.agentId ||
    repair.evidenceId !== requirement.evidenceId ||
    repair.outputSha256 !== requirement.outputSha256
  ) return '四 Agent 本地验收修复单与被拒绝证据不一致';
  if (!SAFE_PILOT_RETRY_CODES.has(repair.validationCode)) return '四 Agent 本地验收修复代码非法';
  if (typeof repair.validationProblem !== 'string' || repair.validationProblem.length < 1 || repair.validationProblem.length > 500) {
    return '四 Agent 本地验收修复问题非法';
  }
  if (
    !Array.isArray(repair.repairRules) ||
    repair.repairRules.some((rule) => typeof rule !== 'string' || rule.length < 1 || rule.length > 80) ||
    SAFE_PILOT_REQUIRED_REPAIR_RULES.some((rule) => !repair.repairRules.includes(rule))
  ) return '四 Agent 本地验收修复规则不完整';
  if (
    ['AG-SEC', 'AG-REVIEW'].includes(requirement.agentId) &&
    !repair.repairRules.includes('FINAL_GATE_CONTRACT')
  ) return '四 Agent 门禁修复缺少最终 Gate 契约';
  if (
    repair.validationCode === 'substantive_gate_blocked' &&
    !repair.repairRules.includes('PRESERVE_BLOCKED_GATE')
  ) return '四 Agent 实质性阻塞修复不得改变 Gate 结论';
  return null;
}

/** 写入动作仅允许落在工作区 ai-output/ 子目录内 */
export const WRITE_SUBDIR = 'ai-output';

export const CANONICAL_AGENT_CODES = [
  'AG-COORD',
  'PRO',
  'UI-PRODUCT',
  'AG-DEV',
  'EXECUTOR',
  'AG-SEC',
  'AG-REVIEW',
  'HANDOFF',
];

export const AGENT_CAPABILITIES = [
  'call_model',
  'save_note',
  'run_build',
  'manage_checkpoint',
  'propose_patch',
  'preflight_patch',
  'apply_patch',
];

export const CAPABILITY_DEFINITIONS = [
  { id: 'call_model', label: '模型调用', summary: '允许该 Agent 通过本地网关调用已配置模型。' },
  { id: 'save_note', label: '保存纪要', summary: '允许该 Agent 将纪要写入当前工作区 ai-output/。' },
  { id: 'run_build', label: '构建验证', summary: '允许该 Agent 在当前工作区运行固定的 npm run build。' },
  { id: 'manage_checkpoint', label: '检查点', summary: '允许该 Agent 保存与恢复受控协同检查点。' },
  { id: 'propose_patch', label: '补丁提案', summary: '允许该 Agent 提交只读校验的代码 diff 提案；不允许应用。' },
  { id: 'preflight_patch', label: '原件预检', summary: '允许该 Agent 对单个已登记提案执行一次只读路径与 SHA-256 校验。' },
  { id: 'apply_patch', label: '补丁应用', summary: '允许该 Agent 使用一次性票据应用一个已通过原件预检的提案。' },
];

const AGENT_ID_ALIASES = {
  'ag-coord': 'AG-COORD',
  'ag-arch': 'PRO',
  pro: 'PRO',
  'ui-product': 'UI-PRODUCT',
  'ag-dev': 'AG-DEV',
  'ag-code': 'AG-DEV',
  executor: 'EXECUTOR',
  'ag-git': 'EXECUTOR',
  'ag-sec': 'AG-SEC',
  'ag-review': 'AG-REVIEW',
  handoff: 'HANDOFF',
  'ag-docs': 'HANDOFF',
};

const DEFAULT_CAPABILITY_GRANTS = {
  'AG-COORD': ['call_model', 'manage_checkpoint'],
  PRO: ['call_model'],
  'UI-PRODUCT': ['call_model'],
  'AG-DEV': ['call_model'],
  EXECUTOR: ['call_model'],
  'AG-SEC': ['call_model'],
  'AG-REVIEW': ['call_model'],
  HANDOFF: ['call_model'],
};

export function normalizeAgentIdentifier(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (CANONICAL_AGENT_CODES.includes(raw)) return raw;
  return AGENT_ID_ALIASES[raw.toLowerCase()] ?? null;
}

export function createDefaultPermissionProfiles() {
  return CANONICAL_AGENT_CODES.map((agentId) => ({
    agentId,
    capabilities: Object.fromEntries(
      AGENT_CAPABILITIES.map((capability) => [capability, DEFAULT_CAPABILITY_GRANTS[agentId].includes(capability)]),
    ),
  }));
}

export function normalizePermissionUpdate(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: '请求体缺失' };
  const agentId = normalizeAgentIdentifier(payload.agentId);
  const capability = typeof payload.capability === 'string' ? payload.capability.trim() : '';
  if (!agentId) return { ok: false, error: 'Agent 不在规范角色清单' };
  if (!AGENT_CAPABILITIES.includes(capability)) return { ok: false, error: '能力不在允许清单' };
  if (typeof payload.allowed !== 'boolean') return { ok: false, error: 'allowed 必须是布尔值' };
  return { ok: true, update: { agentId, capability, allowed: payload.allowed } };
}

export function getRequiredCapability(kind) {
  if (kind === 'save-note') return 'save_note';
  if (kind === 'run-build') return 'run_build';
  if (kind === 'llm') return 'call_model';
  if (kind === 'checkpoint') return 'manage_checkpoint';
  if (kind === 'patch-proposal') return 'propose_patch';
  if (kind === 'patch-preflight') return 'preflight_patch';
  if (kind === 'patch-apply') return 'apply_patch';
  return null;
}

const PATCH_PATH_PATTERNS = [
  /^src\/[a-zA-Z0-9._/-]+\.(?:ts|tsx|js|jsx|mjs|mts|css|md|json)$/,
  /^server\/[a-zA-Z0-9._/-]+\.(?:js|mjs|mts)$/,
  /^docs\/[a-zA-Z0-9._/-]+\.md$/,
  /^tests\/[a-zA-Z0-9._/-]+\.(?:ts|tsx|js|jsx|mjs|mts)$/,
  /^README\.md$/,
];

export function normalizePatchProposal(payload) {
  const value = payload?.proposal;
  if (!isPlainObject(value)) return { ok: false, error: 'proposal 缺失' };
  const allowedKeys = new Set(['version', 'proposalId', 'runId', 'agentId', 'title', 'createdAt', 'files']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return { ok: false, error: 'proposal 含未允许字段' };
  if (value.version !== '1.0.0') return { ok: false, error: 'proposal 版本不支持' };
  if (!isSafeIdentifier(value.proposalId, 160) || !isSafeIdentifier(value.runId, 160)) {
    return { ok: false, error: 'proposal 标识非法' };
  }
  const agentId = normalizeAgentIdentifier(value.agentId);
  if (!agentId) return { ok: false, error: 'proposal Agent 非法' };
  if (!isBoundedString(value.title, 1, 160)) return { ok: false, error: 'proposal title 非法' };
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
    return { ok: false, error: 'proposal createdAt 非法' };
  }
  if (!Array.isArray(value.files) || value.files.length < 1 || value.files.length > 8) {
    return { ok: false, error: 'proposal files 数量非法' };
  }

  const seenPaths = new Set();
  const files = [];
  let totalBytes = 0;
  for (const file of value.files) {
    if (!isPlainObject(file)) return { ok: false, error: 'proposal file 非法' };
    const fileKeys = new Set(['path', 'beforeSha256', 'afterSha256', 'addedLines', 'removedLines', 'patch']);
    if (Object.keys(file).some((key) => !fileKeys.has(key))) return { ok: false, error: 'proposal file 含未允许字段' };
    if (!isAllowedPatchPath(file.path) || seenPaths.has(file.path)) return { ok: false, error: 'proposal path 非法或重复' };
    if (!/^[a-f0-9]{64}$/.test(file.beforeSha256) || !/^[a-f0-9]{64}$/.test(file.afterSha256)) {
      return { ok: false, error: 'proposal 文件哈希非法' };
    }
    if (file.beforeSha256 === file.afterSha256) return { ok: false, error: 'proposal 前后哈希不得相同' };
    if (typeof file.patch !== 'string') return { ok: false, error: 'proposal patch 缺失' };
    const patchBytes = Buffer.byteLength(file.patch, 'utf8');
    if (patchBytes < 1 || patchBytes > 64 * 1024) return { ok: false, error: '单文件 patch 超过 64KB 上限' };
    totalBytes += patchBytes;
    if (totalBytes > 256 * 1024) return { ok: false, error: 'proposal patch 总量超过 256KB 上限' };
    const parsed = parseUnifiedPatch(file.patch, file.path);
    if (!parsed.ok) return parsed;
    if (file.addedLines !== parsed.addedLines || file.removedLines !== parsed.removedLines) {
      return { ok: false, error: 'proposal patch 行数统计不一致' };
    }
    seenPaths.add(file.path);
    files.push({
      path: file.path,
      beforeSha256: file.beforeSha256,
      afterSha256: file.afterSha256,
      addedLines: parsed.addedLines,
      removedLines: parsed.removedLines,
      patch: parsed.patch,
    });
  }

  const proposal = {
    version: '1.0.0',
    proposalId: value.proposalId,
    runId: value.runId,
    agentId,
    title: value.title,
    createdAt: value.createdAt,
    files,
  };
  return { ok: true, proposal, proposalSha256: sha256Hex(stableStringify(proposal)) };
}

function isAllowedPatchPath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 240) return false;
  if (value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value)) return false;
  if (path.posix.normalize(value) !== value || value.split('/').includes('..')) return false;
  return PATCH_PATH_PATTERNS.some((pattern) => pattern.test(value));
}

export function parseUnifiedPatch(value, expectedPath) {
  if (value.includes('\0') || /GIT binary patch|Binary files|^rename (?:from|to) /m.test(value)) {
    return { ok: false, error: 'proposal patch 含二进制或重命名指令' };
  }
  const normalized = value.replace(/\r\n/g, '\n');
  const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
  if (lines[0] !== `--- a/${expectedPath}` || lines[1] !== `+++ b/${expectedPath}`) {
    return { ok: false, error: 'proposal patch 路径头不匹配' };
  }
  let hunk = null;
  const hunks = [];
  let addedLines = 0;
  let removedLines = 0;

  function finishHunk() {
    if (!hunk) return null;
    if (hunk.oldSeen !== hunk.oldCount || hunk.newSeen !== hunk.newCount) return 'proposal patch hunk 行数不一致';
    return null;
  }

  for (let index = 2; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(line);
    if (match) {
      const problem = finishHunk();
      if (problem) return { ok: false, error: problem };
      hunk = {
        oldStart: Number(match[1]),
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newCount: match[4] === undefined ? 1 : Number(match[4]),
        oldSeen: 0,
        newSeen: 0,
        lines: [],
      };
      hunks.push(hunk);
      continue;
    }
    if (!hunk) return { ok: false, error: 'proposal patch 缺少 hunk 头' };
    if (line === '\\ No newline at end of file') {
      const previous = hunk.lines.at(-1);
      if (!previous || previous.noNewline) return { ok: false, error: 'proposal patch 换行标记位置非法' };
      previous.noNewline = true;
      continue;
    }
    const prefix = line[0];
    if (prefix === ' ') {
      hunk.oldSeen += 1;
      hunk.newSeen += 1;
    } else if (prefix === '-') {
      hunk.oldSeen += 1;
      removedLines += 1;
    } else if (prefix === '+') {
      hunk.newSeen += 1;
      addedLines += 1;
    } else {
      return { ok: false, error: 'proposal patch 含非法 hunk 行' };
    }
    hunk.lines.push({ prefix, content: line.slice(1), noNewline: false });
  }
  const problem = finishHunk();
  if (!hunk) return { ok: false, error: 'proposal patch 缺少 hunk' };
  if (problem) return { ok: false, error: problem };
  if (addedLines + removedLines < 1) return { ok: false, error: 'proposal patch 没有变更' };
  return {
    ok: true,
    patch: `${lines.join('\n')}\n`,
    addedLines,
    removedLines,
    hunks: hunks.map(({ oldStart, oldCount, newStart, newCount, lines: hunkLines }) => ({
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines: hunkLines.map((line) => ({ ...line })),
    })),
  };
}

export function normalizeCheckpointPayload(payload) {
  const checkpoint = payload?.checkpoint;
  if (!isPlainObject(checkpoint)) return { ok: false, error: 'checkpoint 缺失' };
  const serialized = JSON.stringify(checkpoint);
  if (serialized.length > MAX_FILE_BYTES) return { ok: false, error: 'checkpoint 超过大小上限' };
  if (!['1.0.0', '1.1.0'].includes(checkpoint.version)) return { ok: false, error: 'checkpoint 版本不支持' };
  if (!isSafeIdentifier(checkpoint.runId, 160)) return { ok: false, error: 'checkpoint runId 非法' };
  if (!Number.isInteger(checkpoint.revision) || checkpoint.revision < 1 || checkpoint.revision > 999999) {
    return { ok: false, error: 'checkpoint revision 非法' };
  }
  if (typeof checkpoint.updatedAt !== 'string' || !Number.isFinite(Date.parse(checkpoint.updatedAt))) {
    return { ok: false, error: 'checkpoint updatedAt 非法' };
  }

  const pipelineProblem = validateCheckpointPipeline(checkpoint.pipeline, checkpoint.runId);
  if (pipelineProblem) return { ok: false, error: pipelineProblem };
  const dagProblem = validateCheckpointDag(checkpoint.dag, checkpoint.pipeline);
  if (dagProblem) return { ok: false, error: dagProblem };
  if (!isPlainObject(checkpoint.attempts)) return { ok: false, error: 'checkpoint attempts 非法' };
  const nodeIds = new Set(checkpoint.dag.nodes.map((node) => node.id));
  for (const [nodeId, attempt] of Object.entries(checkpoint.attempts)) {
    if (!nodeIds.has(nodeId) || !Number.isInteger(attempt) || attempt < 0 || attempt > 3) {
      return { ok: false, error: 'checkpoint attempt 非法' };
    }
  }
  if (checkpoint.orchestration !== undefined) {
    if (checkpoint.version !== '1.1.0') return { ok: false, error: 'legacy checkpoint 不得包含 orchestration' };
    const orchestration = normalizeCheckpointOrchestration(
      checkpoint.orchestration,
      checkpoint.runId,
      checkpoint.pipeline.stages.length,
    );
    if (!orchestration.ok) return orchestration;
    checkpoint.orchestration = orchestration.run;
  }
  return { ok: true, checkpoint };
}

function normalizeCheckpointOrchestration(value, runId, stageCount) {
  if (!isPlainObject(value)) return { ok: false, error: 'checkpoint orchestration 非法' };
  const allowedKeys = new Set([
    'runId',
    'status',
    'policy',
    'callsStarted',
    'callsSucceeded',
    'callsFailed',
    'reservedOutputTokens',
    'observedOutputTokens',
    'evidence',
    'startedAt',
    'updatedAt',
    'cancelledAt',
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return { ok: false, error: 'checkpoint orchestration 含未允许字段' };
  }
  if (value.runId !== runId) return { ok: false, error: 'checkpoint orchestration runId 不一致' };
  if (!['active', 'awaiting_acceptance', 'awaiting_human_acceptance', 'completed', 'cancelled', 'failed'].includes(value.status)) {
    return { ok: false, error: 'checkpoint orchestration status 非法' };
  }
  const policy = normalizeOrchestrationPolicy(value.policy);
  if (!policy.ok) return { ok: false, error: `checkpoint ${policy.error}` };
  if (policy.policy.expectedArtifacts !== stageCount) {
    return { ok: false, error: 'checkpoint orchestration 预期产物数与阶段数不一致' };
  }
  for (const key of ['callsStarted', 'callsSucceeded', 'callsFailed', 'reservedOutputTokens', 'observedOutputTokens']) {
    if (!Number.isInteger(value[key]) || value[key] < 0) {
      return { ok: false, error: `checkpoint orchestration ${key} 非法` };
    }
  }
  if (value.callsStarted > policy.policy.maxCalls || value.callsSucceeded + value.callsFailed > value.callsStarted) {
    return { ok: false, error: 'checkpoint orchestration 调用计数不一致' };
  }
  if (value.reservedOutputTokens > policy.policy.totalOutputTokens) {
    return { ok: false, error: 'checkpoint orchestration token 预算越界' };
  }
  if (!Array.isArray(value.evidence) || value.evidence.length !== value.callsSucceeded || value.evidence.length > policy.policy.maxCalls) {
    return { ok: false, error: 'checkpoint orchestration evidence 计数不一致' };
  }
  const evidenceKeys = new Set([
    'evidenceId',
    'runId',
    'agentId',
    'provider',
    'model',
    'requestSha256',
    'outputSha256',
    'outputChars',
    'reservedOutputTokens',
    'observedOutputTokens',
    'terminationReason',
    'authorization',
    'acceptanceStatus',
    'acceptanceId',
    'acceptedAt',
    'createdAt',
  ]);
  const evidenceIds = new Set();
  const evidence = [];
  for (const item of value.evidence) {
    if (!isPlainObject(item) || Object.keys(item).some((key) => !evidenceKeys.has(key))) {
      return { ok: false, error: 'checkpoint orchestration evidence 含未允许字段' };
    }
    if (!isSafeIdentifier(item.evidenceId, 80) || evidenceIds.has(item.evidenceId) || item.runId !== runId) {
      return { ok: false, error: 'checkpoint orchestration evidence 标识非法' };
    }
    if (!CANONICAL_AGENT_CODES.includes(item.agentId) || !['claude', 'openai', 'deepseek', 'custom'].includes(item.provider)) {
      return { ok: false, error: 'checkpoint orchestration evidence 来源非法' };
    }
    if (!isBoundedString(item.model, 1, 200) || !/^[a-f0-9]{64}$/.test(item.requestSha256) || !/^[a-f0-9]{64}$/.test(item.outputSha256)) {
      return { ok: false, error: 'checkpoint orchestration evidence 哈希非法' };
    }
    if (!Number.isInteger(item.outputChars) || item.outputChars < 1 || item.outputChars > 8_000) {
      return { ok: false, error: 'checkpoint orchestration evidence 长度非法' };
    }
    if (!Number.isInteger(item.reservedOutputTokens) || item.reservedOutputTokens < 1 || item.reservedOutputTokens > 4096) {
      return { ok: false, error: 'checkpoint orchestration evidence 预留预算非法' };
    }
    if (!Number.isInteger(item.observedOutputTokens) || item.observedOutputTokens < 0 || item.observedOutputTokens > 32_768) {
      return { ok: false, error: 'checkpoint orchestration evidence usage 非法' };
    }
    if (
      item.terminationReason !== undefined &&
      ![
        'stop',
        'length',
        'content_filter',
        'tool_calls',
        'insufficient_system_resource',
        'end_turn',
        'max_tokens',
        'stop_sequence',
        'tool_use',
        'pause_turn',
        'refusal',
        'unknown',
      ].includes(item.terminationReason)
    ) return { ok: false, error: 'checkpoint orchestration evidence 结束原因非法' };
    if (
      item.authorization !== 'session_capability' ||
      !['provider_returned', 'accepted', 'rejected'].includes(item.acceptanceStatus ?? 'provider_returned') ||
      typeof item.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(item.createdAt))
    ) {
      return { ok: false, error: 'checkpoint orchestration evidence 授权或时间非法' };
    }
    if (
      item.acceptanceId !== undefined && !isSafeIdentifier(item.acceptanceId, 80) ||
      item.acceptedAt !== undefined && (typeof item.acceptedAt !== 'string' || !Number.isFinite(Date.parse(item.acceptedAt)))
    ) return { ok: false, error: 'checkpoint orchestration evidence 验收字段非法' };
    evidenceIds.add(item.evidenceId);
    evidence.push({ ...item });
  }
  if (
    value.status === 'completed' &&
    new Set(evidence.filter((item) => item.acceptanceStatus === 'accepted').map((item) => item.agentId)).size < policy.policy.expectedArtifacts
  ) {
    return { ok: false, error: 'checkpoint orchestration 完成状态缺少证据' };
  }
  if (typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt))) {
    return { ok: false, error: 'checkpoint orchestration startedAt 非法' };
  }
  if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) {
    return { ok: false, error: 'checkpoint orchestration updatedAt 非法' };
  }
  if (value.cancelledAt !== undefined && (typeof value.cancelledAt !== 'string' || !Number.isFinite(Date.parse(value.cancelledAt)))) {
    return { ok: false, error: 'checkpoint orchestration cancelledAt 非法' };
  }
  return {
    ok: true,
    run: {
      runId,
      status: value.status,
      policy: policy.policy,
      callsStarted: value.callsStarted,
      callsSucceeded: value.callsSucceeded,
      callsFailed: value.callsFailed,
      reservedOutputTokens: value.reservedOutputTokens,
      observedOutputTokens: value.observedOutputTokens,
      evidence,
      startedAt: value.startedAt,
      updatedAt: value.updatedAt,
      ...(value.cancelledAt ? { cancelledAt: value.cancelledAt } : {}),
    },
  };
}

function validateCheckpointPipeline(pipeline, runId) {
  if (!isPlainObject(pipeline) || pipeline.runId !== runId) return 'checkpoint pipeline 非法';
  const statuses = ['idle', 'running', 'paused', 'simulated', 'awaiting_evidence', 'completed', 'stopped', 'blocked', 'failed'];
  if (!statuses.includes(pipeline.status)) return 'checkpoint pipeline status 非法';
  if (!['simulation', 'connected'].includes(pipeline.mode)) return 'checkpoint pipeline mode 非法';
  if (!isBoundedString(pipeline.taskText, 1, 20_000)) return 'checkpoint taskText 非法';
  if (!Array.isArray(pipeline.stages) || pipeline.stages.length < 1 || pipeline.stages.length > 32) {
    return 'checkpoint stages 非法';
  }
  if (!Number.isInteger(pipeline.currentIndex) || pipeline.currentIndex < -1 || pipeline.currentIndex >= pipeline.stages.length) {
    return 'checkpoint currentIndex 非法';
  }
  if (!['enter', 'speak', 'exit'].includes(pipeline.walkPhase)) return 'checkpoint walkPhase 非法';
  for (const stage of pipeline.stages) {
    if (!isPlainObject(stage) || !isSafeIdentifier(stage.agentId, 80)) return 'checkpoint stage Agent 非法';
    const canonical = normalizeAgentIdentifier(stage.agentCode);
    if (!canonical || normalizeAgentIdentifier(stage.canonicalAgentCode) !== canonical) return 'checkpoint stage role 非法';
    if (!isBoundedString(stage.agentName, 1, 120) || !isBoundedString(stage.phaseLabel, 1, 160)) {
      return 'checkpoint stage label 非法';
    }
    if (!isBoundedString(stage.narration, 1, 8_000)) return 'checkpoint stage narration 非法';
  }
  if (!Array.isArray(pipeline.receipts) || pipeline.receipts.length > 64) return 'checkpoint receipts 非法';
  for (const receipt of pipeline.receipts) {
    if (!isPlainObject(receipt) || !Number.isInteger(receipt.seq) || receipt.seq < 1 || receipt.seq > pipeline.stages.length) {
      return 'checkpoint receipt seq 非法';
    }
    if (!normalizeAgentIdentifier(receipt.agentCode)) return 'checkpoint receipt Agent 非法';
    if (!['simulated', 'succeeded', 'failed', 'blocked'].includes(receipt.status)) return 'checkpoint receipt status 非法';
    if (!['template', 'agent'].includes(receipt.source)) return 'checkpoint receipt source 非法';
    if (!isBoundedString(receipt.agentName, 1, 120) || !isBoundedString(receipt.phaseLabel, 1, 160)) {
      return 'checkpoint receipt label 非法';
    }
    if (!isBoundedString(receipt.summary, 1, 8_000)) return 'checkpoint receipt summary 非法';
  }
  if (pipeline.failure !== null) {
    const failure = pipeline.failure;
    if (!isPlainObject(failure) || !Number.isInteger(failure.stageIndex) || failure.stageIndex < 0 || failure.stageIndex >= pipeline.stages.length) {
      return 'checkpoint failure 非法';
    }
    if (!normalizeAgentIdentifier(failure.agentCode) || !isBoundedString(failure.message, 1, 2_000)) {
      return 'checkpoint failure detail 非法';
    }
    if (typeof failure.retryable !== 'boolean') return 'checkpoint failure retryable 非法';
  }
  return null;
}

function validateCheckpointDag(dag, pipeline) {
  if (!isPlainObject(dag) || dag.runId !== pipeline.runId || dag.taskText !== pipeline.taskText || dag.status !== pipeline.status) {
    return 'checkpoint DAG metadata 非法';
  }
  if (!Array.isArray(dag.nodes) || dag.nodes.length !== pipeline.stages.length) return 'checkpoint DAG nodes 非法';
  const ids = new Set();
  const allowedStatuses = ['pending', 'ready', 'running', 'paused', 'simulated', 'succeeded', 'failed', 'blocked'];
  for (const node of dag.nodes) {
    if (!isPlainObject(node) || !isSafeIdentifier(node.id, 200) || ids.has(node.id)) return 'checkpoint DAG node id 非法';
    ids.add(node.id);
    if (!Number.isInteger(node.stageIndex) || node.stageIndex < 0 || node.stageIndex >= pipeline.stages.length) {
      return 'checkpoint DAG stageIndex 非法';
    }
    if (!normalizeAgentIdentifier(node.agentCode) || !isSafeIdentifier(node.agentId, 80)) return 'checkpoint DAG Agent 非法';
    if (!isBoundedString(node.label, 1, 240) || !isBoundedString(node.summary, 0, 8_000)) return 'checkpoint DAG text 非法';
    if (!allowedStatuses.includes(node.status)) return 'checkpoint DAG status 非法';
    if (!Number.isInteger(node.attempt) || node.attempt < 0 || node.attempt > 3 || node.maxAttempts !== 3) {
      return 'checkpoint DAG attempt 非法';
    }
    if (!Array.isArray(node.dependencies) || node.dependencies.length > 8) return 'checkpoint DAG dependencies 非法';
  }
  const byId = new Map(dag.nodes.map((node) => [node.id, node]));
  for (const node of dag.nodes) {
    if (node.dependencies.some((dependency) => !byId.has(dependency) || dependency === node.id)) {
      return 'checkpoint DAG dependency 引用非法';
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function hasCycle(nodeId) {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const dependency of byId.get(nodeId).dependencies) {
      if (hasCycle(dependency)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }
  if ([...byId.keys()].some((nodeId) => hasCycle(nodeId))) return 'checkpoint DAG 存在环';
  return null;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isBoundedString(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

function isSafeIdentifier(value, max) {
  return typeof value === 'string' && new RegExp(`^[a-zA-Z0-9._:-]{1,${max}}$`).test(value);
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function sha256Hex(value) {
  return createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
}

/** Hash only non-secret fields that determine the actual Provider route. */
export function hashDevelopmentModelRoute(config, responseFormat = 'text') {
  const kind = String(config?.kind ?? '');
  const descriptor = JSON.stringify([
    kind,
    String(config?.baseUrl ?? '').replace(/\/+$/, ''),
    String(config?.model ?? ''),
    kind === 'deepseek' && config?.thinkingEnabled === true,
    responseFormat,
  ]);
  return sha256Hex(descriptor);
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Canonical JSON used only for versioned operator evidence integrity checks.
 * Unlike stableStringify, this rejects unsupported values instead of silently
 * producing an ambiguous representation.
 */
export function canonicalizeAgentHubJsonV1(value) {
  const ancestors = new Set();
  const visit = (item) => {
    if (item === null) return 'null';
    if (typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('agenthub-json-v1 requires finite numbers');
      return JSON.stringify(item);
    }
    if (typeof item !== 'object') throw new TypeError('agenthub-json-v1 contains an unsupported value');
    if (ancestors.has(item)) throw new TypeError('agenthub-json-v1 does not allow cycles');
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        if (Object.getOwnPropertySymbols(item).length > 0 || Object.keys(item).length !== item.length) {
          throw new TypeError('agenthub-json-v1 arrays must contain indexed values only');
        }
        const values = [];
        for (let index = 0; index < item.length; index += 1) {
          if (!Object.hasOwn(item, index)) throw new TypeError('agenthub-json-v1 does not allow sparse arrays');
          values.push(visit(item[index]));
        }
        return `[${values.join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('agenthub-json-v1 requires plain objects');
      }
      if (Object.getOwnPropertySymbols(item).length > 0) {
        throw new TypeError('agenthub-json-v1 does not allow symbol keys');
      }
      const members = [];
      for (const key of Object.keys(item).sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
          throw new TypeError('agenthub-json-v1 does not allow accessors');
        }
        members.push(`${JSON.stringify(key)}:${visit(descriptor.value)}`);
      }
      return `{${members.join(',')}}`;
    } finally {
      ancestors.delete(item);
    }
  };
  return visit(value);
}

export function operatorEvidenceJsonFitsSizeLimit(serialized) {
  return typeof serialized === 'string'
    && Buffer.byteLength(serialized, 'utf8') <= OPERATOR_EVIDENCE_MAX_BYTES;
}

function isOperatorEvidenceString(value, max, pattern) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && value === value.trim()
    && (!pattern || pattern.test(value));
}

function isOperatorEvidenceInteger(value, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max && !Object.is(value, -0);
}

function isOperatorEvidenceTimestamp(value) {
  if (!isOperatorEvidenceString(value, 64)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function operatorEvidenceTimestampFromEpoch(value) {
  if (!isOperatorEvidenceInteger(value, 8_640_000_000_000_000)) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function operatorEvidenceDecimalFromMicros(value) {
  if (!isOperatorEvidenceInteger(value)) return null;
  return `${Math.floor(value / 1_000_000)}.${String(value % 1_000_000).padStart(6, '0')}`;
}

function sameOperatorEvidenceAgentOrder(value) {
  return Array.isArray(value)
    && value.length === SAFE_PILOT_AGENT_ORDER.length
    && value.every((agentId, index) => agentId === SAFE_PILOT_AGENT_ORDER[index]);
}

function operatorEvidenceFailure(errorCode) {
  return { ok: false, errorCode };
}

/**
 * Build one closed, redacted, run-scoped evidence document. Source objects are
 * never cloned, spread or serialized; every output field is assigned explicitly.
 */
export function buildOperatorEvidenceExportV1(input) {
  try {
    if (!isPlainObject(input) || !isPlainObject(input.run) || !isPlainObject(input.authorization)) {
      return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
    }
    const run = input.run;
    const authorization = input.authorization;
    const profile = authorization.profile;
    const runIdPattern = /^[A-Za-z0-9._-]{1,128}$/;
    const hashPattern = /^[a-f0-9]{64}$/;
    const identifierPattern = /^[A-Za-z0-9._-]{1,128}$/;

    if (
      run.status !== 'completed'
      || authorization.status !== 'completed'
      || !isPlainObject(profile)
      || profile.profileId !== SAFE_PILOT_PROFILE_ID
      || profile.version !== '2.0.0'
      || profile.finalHumanAcceptanceRequired !== true
      || profile.sideEffectsAllowed !== false
      || profile.checkpointEnabled !== false
      || !authorization.finalHumanAcceptedAt
    ) return operatorEvidenceFailure('RUN_NOT_ELIGIBLE');

    if (
      !isOperatorEvidenceString(run.runId, 128, runIdPattern)
      || run.runId !== authorization.runId
      || !sameOperatorEvidenceAgentOrder(profile.agentOrder)
      || !sameOperatorEvidenceAgentOrder(authorization.acceptedAgentIds)
    ) return operatorEvidenceFailure('RUN_NOT_ELIGIBLE');
    if (!isPlainObject(profile.runCapabilities)) return operatorEvidenceFailure('RUN_NOT_ELIGIBLE');
    for (const agentId of SAFE_PILOT_AGENT_ORDER) {
      const capabilities = profile.runCapabilities[agentId];
      if (
        !isPlainObject(capabilities)
        || Object.keys(capabilities).length !== SAFE_PILOT_CAPABILITIES.length
        || SAFE_PILOT_CAPABILITIES.some((capability) => capabilities[capability] !== (capability === 'call_model'))
      ) return operatorEvidenceFailure('RUN_NOT_ELIGIBLE');
    }

    if (
      !isOperatorEvidenceTimestamp(input.exportedAt)
      || !isOperatorEvidenceString(input.serverVersion, 64)
      || !isOperatorEvidenceString(profile.profileId, 128, identifierPattern)
      || !isOperatorEvidenceString(authorization.authorizationId, 128, identifierPattern)
    ) return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');

    const issuedAt = authorization.issuedAt;
    const expiresAt = operatorEvidenceTimestampFromEpoch(authorization.expiresAt);
    const startedAt = run.startedAt;
    const completedAt = authorization.finalHumanAcceptedAt;
    if (
      !isOperatorEvidenceTimestamp(issuedAt)
      || !expiresAt
      || !isOperatorEvidenceTimestamp(startedAt)
      || !isOperatorEvidenceTimestamp(completedAt)
      || run.updatedAt !== completedAt
      || Date.parse(issuedAt) > Date.parse(startedAt)
      || Date.parse(startedAt) > Date.parse(completedAt)
      || Date.parse(completedAt) > Date.parse(expiresAt)
      || Date.parse(completedAt) > Date.parse(input.exportedAt)
      || Date.parse(issuedAt) > Date.parse(expiresAt)
    ) return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');

    const bindingNames = ['taskSha256', 'contextSha256', 'profileSha256', 'authorizationSha256'];
    if (bindingNames.some((field) => typeof authorization[field] !== 'string' || !hashPattern.test(authorization[field]))) {
      return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
    }

    const budget = profile.budget;
    const usage = authorization.usage;
    if (!isPlainObject(budget) || !isPlainObject(usage)) {
      return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
    }
    if (
      budget.plannedCalls !== 4
      || budget.maxCalls !== 5
      || budget.maxManualRetries !== 1
      || budget.maxInputTokens !== 64_000
      || budget.maxOutputTokens !== 1_600
      || budget.stageTimeoutMs !== 45_000
      || budget.totalTimeoutMs !== 240_000
      || !isOperatorEvidenceInteger(budget.maxHumanWaitMs, 1_800_000)
      || budget.maxHumanWaitMs < 60_000
      || budget.maxHumanWaitMs % 60_000 !== 0
      || budget.currency !== 'CNY'
      || !isOperatorEvidenceInteger(budget.inputRateMicrosPerMillion)
      || budget.inputRateMicrosPerMillion <= 0
      || !isOperatorEvidenceInteger(budget.outputRateMicrosPerMillion)
      || budget.outputRateMicrosPerMillion <= 0
      || !isOperatorEvidenceInteger(budget.maxCostMicros)
      || budget.maxCostMicros <= 0
      || !isPlainObject(run.policy)
      || run.policy.expectedArtifacts !== SAFE_PILOT_AGENT_ORDER.length
      || run.policy.maxCalls !== budget.maxCalls
      || run.policy.totalOutputTokens !== budget.maxOutputTokens
      || run.policy.stageTimeoutMs !== budget.stageTimeoutMs
    ) return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');

    const usageFields = [
      'callsStarted',
      'manualRetriesUsed',
      'observedInputTokens',
      'observedOutputTokens',
      'observedCostMicros',
      'activeElapsedMs',
    ];
    if (usageFields.some((field) => !isOperatorEvidenceInteger(usage[field]))) {
      return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
    }
    if (
      usage.callsStarted < SAFE_PILOT_AGENT_ORDER.length
      || usage.callsStarted > budget.maxCalls
      || usage.manualRetriesUsed > budget.maxManualRetries
      || usage.callsStarted !== SAFE_PILOT_AGENT_ORDER.length + usage.manualRetriesUsed
      || run.callsStarted !== usage.callsStarted
      || !isOperatorEvidenceInteger(run.callsSucceeded, budget.maxCalls)
      || !isOperatorEvidenceInteger(run.callsFailed, budget.maxCalls)
      || run.callsSucceeded + run.callsFailed !== run.callsStarted
      || !isOperatorEvidenceInteger(run.observedOutputTokens, budget.maxOutputTokens)
      || run.observedOutputTokens !== usage.observedOutputTokens
      || usage.observedInputTokens > budget.maxInputTokens
      || usage.observedOutputTokens > budget.maxOutputTokens
      || usage.observedCostMicros > budget.maxCostMicros
      || usage.activeElapsedMs > budget.totalTimeoutMs
    ) return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');

    if (
      !Array.isArray(profile.modelBindings)
      || profile.modelBindings.length !== SAFE_PILOT_AGENT_ORDER.length
      || !Array.isArray(run.evidence)
      || run.evidence.length > budget.maxCalls
      || run.evidence.length !== run.callsSucceeded
      || !Array.isArray(authorization.operatorEvidenceStages)
      || authorization.operatorEvidenceStages.length > budget.maxCalls
      || authorization.operatorEvidenceStages.length !== run.evidence.length
    ) return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');

    const bindingsByAgent = new Map();
    for (let index = 0; index < profile.modelBindings.length; index += 1) {
      const binding = profile.modelBindings[index];
      const expectedAgentId = SAFE_PILOT_AGENT_ORDER[index];
      if (
        !isPlainObject(binding)
        || binding.agentCode !== expectedAgentId
        || binding.ready !== true
        || !isOperatorEvidenceString(binding.provider, 256)
        || !SAFE_PILOT_PROVIDERS.has(binding.provider)
        || binding.provider === 'none'
        || !isOperatorEvidenceString(binding.model, 256)
      ) return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
      bindingsByAgent.set(expectedAgentId, binding);
    }

    const evidenceById = new Map();
    for (const evidence of run.evidence) {
      if (
        !isPlainObject(evidence)
        || !isOperatorEvidenceString(evidence.evidenceId, 128, identifierPattern)
        || evidenceById.has(evidence.evidenceId)
        || evidence.runId !== run.runId
        || !SAFE_PILOT_AGENT_ORDER.includes(evidence.agentId)
        || !isOperatorEvidenceString(evidence.provider, 256)
        || !isOperatorEvidenceString(evidence.model, 256)
        || typeof evidence.outputSha256 !== 'string'
        || !hashPattern.test(evidence.outputSha256)
        || !isOperatorEvidenceInteger(evidence.observedOutputTokens, budget.maxOutputTokens)
        || !['accepted', 'rejected'].includes(evidence.acceptanceStatus)
        || !isOperatorEvidenceTimestamp(evidence.acceptedAt)
      ) return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
      evidenceById.set(evidence.evidenceId, evidence);
    }

    const metricsByEvidenceId = new Map();
    let previousMetricCallIndex = 0;
    let totalMetricInputTokens = 0;
    let totalMetricOutputTokens = 0;
    let totalMetricCostMicros = 0;
    for (const metric of authorization.operatorEvidenceStages) {
      const evidence = evidenceById.get(metric?.evidenceId);
      const binding = bindingsByAgent.get(metric?.agentId);
      const agentIndex = SAFE_PILOT_AGENT_ORDER.indexOf(metric?.agentId);
      const expectedCostMicros = isPlainObject(metric)
        ? Math.ceil(
            (metric.inputTokens * budget.inputRateMicrosPerMillion
              + metric.outputTokens * budget.outputRateMicrosPerMillion) / 1_000_000,
          )
        : Number.NaN;
      if (
        !isPlainObject(metric)
        || !isPlainObject(evidence)
        || !binding
        || agentIndex < 0
        || !isOperatorEvidenceString(metric.evidenceId, 128, identifierPattern)
        || metricsByEvidenceId.has(metric.evidenceId)
        || metric.agentId !== evidence.agentId
        || metric.providerId !== evidence.provider
        || metric.modelId !== evidence.model
        || metric.providerId !== binding.provider
        || metric.modelId !== binding.model
        || metric.outputSha256 !== evidence.outputSha256
        || metric.outputTokens !== evidence.observedOutputTokens
        || !isOperatorEvidenceInteger(metric.callIndex, budget.maxCalls)
        || metric.callIndex < 1
        || metric.callIndex <= previousMetricCallIndex
        || !isOperatorEvidenceInteger(metric.attempt, budget.maxManualRetries + 1)
        || metric.attempt < 1
        || !isOperatorEvidenceInteger(metric.inputTokens, budget.maxInputTokens)
        || !isOperatorEvidenceInteger(metric.outputTokens, budget.maxOutputTokens)
        || !isOperatorEvidenceInteger(metric.activeMs, budget.totalTimeoutMs)
        || !isOperatorEvidenceInteger(metric.observedCostMicros, budget.maxCostMicros)
        || !isOperatorEvidenceInteger(expectedCostMicros, budget.maxCostMicros)
        || metric.observedCostMicros !== expectedCostMicros
        || (agentIndex === 0 && metric.handoffSha256 !== undefined)
        || (agentIndex > 0 && (typeof metric.handoffSha256 !== 'string' || !hashPattern.test(metric.handoffSha256)))
      ) return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
      previousMetricCallIndex = metric.callIndex;
      totalMetricInputTokens += metric.inputTokens;
      totalMetricOutputTokens += metric.outputTokens;
      totalMetricCostMicros += metric.observedCostMicros;
      if (
        !isOperatorEvidenceInteger(totalMetricInputTokens, budget.maxInputTokens)
        || !isOperatorEvidenceInteger(totalMetricOutputTokens, budget.maxOutputTokens)
        || !isOperatorEvidenceInteger(totalMetricCostMicros, budget.maxCostMicros)
      ) return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
      metricsByEvidenceId.set(metric.evidenceId, metric);
    }
    if (
      totalMetricInputTokens !== usage.observedInputTokens
      || totalMetricOutputTokens !== usage.observedOutputTokens
      || totalMetricCostMicros !== usage.observedCostMicros
    ) return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');

    const acceptedEvidence = run.evidence.filter((evidence) => evidence?.acceptanceStatus === 'accepted');
    if (acceptedEvidence.length !== SAFE_PILOT_AGENT_ORDER.length) {
      return operatorEvidenceFailure('RUN_NOT_ELIGIBLE');
    }

    const stages = [];
    let previousCallIndex = 0;
    for (let index = 0; index < acceptedEvidence.length; index += 1) {
      const evidence = acceptedEvidence[index];
      const expectedAgentId = SAFE_PILOT_AGENT_ORDER[index];
      const metric = metricsByEvidenceId.get(evidence?.evidenceId);
      const binding = bindingsByAgent.get(expectedAgentId);
      if (!isPlainObject(evidence) || !isPlainObject(metric) || !binding) {
        return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
      }
      const handoffSha256 = metric.handoffSha256;
      if (
        evidence.runId !== run.runId
        || evidence.agentId !== expectedAgentId
        || metric.agentId !== expectedAgentId
        || metric.evidenceId !== evidence.evidenceId
        || metric.providerId !== evidence.provider
        || metric.modelId !== evidence.model
        || metric.providerId !== binding.provider
        || metric.modelId !== binding.model
        || metric.outputSha256 !== evidence.outputSha256
        || metric.outputTokens !== evidence.observedOutputTokens
        || !isOperatorEvidenceString(evidence.evidenceId, 128, identifierPattern)
        || !hashPattern.test(evidence.outputSha256)
        || !isOperatorEvidenceString(evidence.provider, 256)
        || !isOperatorEvidenceString(evidence.model, 256)
        || !isOperatorEvidenceTimestamp(evidence.acceptedAt)
        || !isOperatorEvidenceInteger(metric.callIndex, budget.maxCalls)
        || metric.callIndex < 1
        || metric.callIndex <= previousCallIndex
        || !isOperatorEvidenceInteger(metric.attempt, budget.maxManualRetries + 1)
        || metric.attempt < 1
        || !isOperatorEvidenceInteger(metric.inputTokens, budget.maxInputTokens)
        || !isOperatorEvidenceInteger(metric.outputTokens, budget.maxOutputTokens)
        || !isOperatorEvidenceInteger(metric.activeMs, budget.totalTimeoutMs)
        || !isOperatorEvidenceInteger(metric.observedCostMicros, budget.maxCostMicros)
        || (index === 0 && handoffSha256 !== undefined)
        || (index > 0 && (typeof handoffSha256 !== 'string' || !hashPattern.test(handoffSha256)))
      ) return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
      previousCallIndex = metric.callIndex;
      const stage = {
        callIndex: metric.callIndex,
        attempt: metric.attempt,
        agentId: expectedAgentId,
        providerId: evidence.provider,
        modelId: evidence.model,
        status: 'accepted',
        evidenceId: evidence.evidenceId,
        outputSha256: evidence.outputSha256,
        inputTokens: metric.inputTokens,
        outputTokens: metric.outputTokens,
        activeMs: metric.activeMs,
        cost: {
          currency: 'CNY',
          observed: operatorEvidenceDecimalFromMicros(metric.observedCostMicros),
        },
        acceptedAt: evidence.acceptedAt,
      };
      if (handoffSha256 !== undefined) stage.handoffSha256 = handoffSha256;
      stages.push(stage);
    }

    const costLimit = operatorEvidenceDecimalFromMicros(budget.maxCostMicros);
    const observedCost = operatorEvidenceDecimalFromMicros(usage.observedCostMicros);
    if (!costLimit || !observedCost || stages.some((stage) => !stage.cost.observed)) {
      return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
    }

    const document = {
      schema: OPERATOR_EVIDENCE_SCHEMA,
      schemaVersion: OPERATOR_EVIDENCE_SCHEMA_VERSION,
      exportedAt: input.exportedAt,
      producer: {
        product: 'agent-hub-visual-manager',
        serverVersion: input.serverVersion,
      },
      scope: {
        runId: run.runId,
        profileId: profile.profileId,
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
      bindings: {
        taskSha256: authorization.taskSha256,
        contextSha256: authorization.contextSha256,
        profileSha256: authorization.profileSha256,
        authorizationSha256: authorization.authorizationSha256,
      },
      authorization: {
        authorizationId: authorization.authorizationId,
        issuedAt,
        expiresAt,
        acceptedAgentIds: ['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW'],
      },
      run: {
        agentOrder: ['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW'],
        startedAt,
        completedAt,
        finalHumanAccepted: true,
        sideEffectsAllowed: false,
        sideEffectsPerformed: false,
        budgets: {
          maxCalls: budget.maxCalls,
          maxRetries: budget.maxManualRetries,
          maxInputTokens: budget.maxInputTokens,
          maxOutputTokens: budget.maxOutputTokens,
          maxActiveSeconds: budget.totalTimeoutMs / 1_000,
          cost: {
            currency: 'CNY',
            limit: costLimit,
          },
        },
        usage: {
          calls: usage.callsStarted,
          retries: usage.manualRetriesUsed,
          inputTokens: usage.observedInputTokens,
          outputTokens: usage.observedOutputTokens,
          activeMs: usage.activeElapsedMs,
          cost: {
            currency: 'CNY',
            observed: observedCost,
          },
          acceptedStages: stages.length,
          acceptedHandoffs: stages.filter((stage) => stage.handoffSha256 !== undefined).length,
        },
        stages,
      },
    };
    const payloadSha256 = sha256Hex(canonicalizeAgentHubJsonV1(document));
    document.integrity = {
      algorithm: 'sha256',
      canonicalization: OPERATOR_EVIDENCE_CANONICALIZATION,
      payloadSha256,
    };
    if (!operatorEvidenceJsonFitsSizeLimit(canonicalizeAgentHubJsonV1(document))) {
      return operatorEvidenceFailure('EXPORT_TOO_LARGE');
    }
    return { ok: true, export: document };
  } catch {
    return operatorEvidenceFailure('EXPORT_SOURCE_INVALID');
  }
}

export function createWorkspaceId(workspaceRoot) {
  return sha256Hex(path.resolve(workspaceRoot)).slice(0, 24);
}

export function normalizeActionDescriptor(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: '请求体缺失' };
  const kind = payload.kind;
  const runId = typeof payload.runId === 'string' ? payload.runId.trim() : '';
  const idempotencyKey = typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey.trim() : '';
  const agentId = normalizeAgentIdentifier(payload.agentId);
  if (!['save-note', 'run-build', 'patch-preflight', 'patch-apply'].includes(kind)) {
    return { ok: false, error: '动作类型不允许' };
  }
  if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(runId)) return { ok: false, error: 'runId 非法' };
  if (!/^[a-zA-Z0-9._:-]{1,200}$/.test(idempotencyKey)) return { ok: false, error: 'idempotencyKey 非法' };
  if (!agentId) return { ok: false, error: 'agentId 不在规范角色清单' };

  if (kind === 'patch-preflight' || kind === 'patch-apply') {
    if (!isSafeIdentifier(payload.proposalId, 160)) return { ok: false, error: 'proposalId 非法' };
    if (typeof payload.proposalSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(payload.proposalSha256)) {
      return { ok: false, error: 'proposalSha256 非法' };
    }
    return {
      ok: true,
      descriptor: {
        kind,
        runId,
        idempotencyKey,
        agentId,
        proposalId: payload.proposalId,
        proposalSha256: payload.proposalSha256,
      },
    };
  }

  if (kind === 'save-note') {
    const content = String(payload.content ?? '');
    if (content.length === 0 || content.length > 200_000) {
      return { ok: false, error: '内容为空或超限' };
    }
    return {
      ok: true,
      descriptor: {
        kind,
        runId,
        idempotencyKey,
        agentId,
        title: sanitizeFileName(payload.title ?? '推演纪要'),
        contentLength: content.length,
        contentSha256: sha256Hex(content),
      },
    };
  }

  return { ok: true, descriptor: { kind, runId, idempotencyKey, agentId } };
}

export function createActionFingerprint(workspaceId, descriptor) {
  return sha256Hex(stableStringify({ workspaceId, descriptor }));
}

export function createApprovalToken(sessionToken, approvalId, requestHash, expiresAt) {
  return createHmac('sha256', sessionToken)
    .update(`${approvalId}:${requestHash}:${expiresAt}`)
    .digest('base64url');
}

export function verifyApprovalToken(sessionToken, approvalId, requestHash, expiresAt, token) {
  if (typeof token !== 'string' || token.length === 0) return false;
  const expected = createApprovalToken(sessionToken, approvalId, requestHash, expiresAt);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(token);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function isAllowedAgentHubFile(relativePath) {
  if (READ_DENYLIST_PATTERNS.some((pattern) => pattern.test(relativePath))) return false;
  return READ_ALLOWLIST_PATTERNS.some((pattern) => pattern.test(relativePath));
}

/**
 * 解析安全写入路径：拒绝绝对路径与 ..，强制落在 <workspace>/ai-output/ 内。
 * 返回绝对路径；非法输入返回 null。
 */
export function resolveSafeWritePath(workspaceRoot, requestedRelPath) {
  if (typeof requestedRelPath !== 'string' || requestedRelPath.length === 0) return null;
  if (path.isAbsolute(requestedRelPath)) return null;
  if (requestedRelPath.includes('\0')) return null;

  const base = path.resolve(workspaceRoot, WRITE_SUBDIR);
  const target = path.resolve(base, requestedRelPath);
  const relation = path.relative(base, target);
  if (relation.startsWith('..') || path.isAbsolute(relation)) return null;
  return target;
}

/** 校验文件名安全（用于纪要保存等场景） */
export function sanitizeFileName(name) {
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|\0]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'untitled';
}

/** 组装 LLM 转发请求（与前端 agentConnectors 协议一致；服务端无 CORS 限制） */
export function buildProviderRequest(config, messages, maxTokens, responseFormat = 'text') {
  const apiKeyProblem = validateProviderApiKey(config.apiKey);
  if (apiKeyProblem) throw new Error(apiKeyProblem);
  const baseUrl = String(config.baseUrl ?? '').replace(/\/+$/, '');
  if (config.kind === 'claude') {
    const system = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n');
    return {
      url: `${baseUrl}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: config.model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: messages
          .filter((message) => message.role !== 'system')
          .map((message) => ({ role: 'user', content: message.content })),
      },
    };
  }
  return {
    url: `${baseUrl}/chat/completions`,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: {
      model: config.model,
      max_tokens: maxTokens,
      messages,
      ...(responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
      ...(config.kind === 'deepseek'
        ? { thinking: { type: config.thinkingEnabled ? 'enabled' : 'disabled' } }
        : {}),
    },
  };
}

/** Return a stable, non-sensitive failure contract for model gateway clients. */
export function classifyModelCallFailure({ cancelled = false, timedOut = false, error = null } = {}) {
  if (cancelled) return { code: 'CANCELLED', retryable: false };
  if (timedOut) return { code: 'STAGE_TIMEOUT', retryable: true };
  const message = error instanceof Error ? error.message.trim() : '';
  if (message === 'fetch failed') return { code: 'UPSTREAM_TRANSPORT', retryable: true };
  if (/^上游 HTTP (?:408|425|429|500|502|503|504)$/.test(message)) {
    return { code: 'UPSTREAM_TEMPORARY', retryable: true };
  }
  return { code: 'PROVIDER_CALL_REJECTED', retryable: false };
}

function validateProviderApiKey(value) {
  if (typeof value !== 'string' || !value || value.length > 8_192) return 'apiKey 缺失或超限';
  if (!/^[\x21-\x7e]+$/.test(value)) {
    return 'apiKey 只能包含可见 ASCII 字符，不得含中文、全角符号、空格或换行';
  }
  return null;
}

/** 从上游响应提取文本 */
export function extractProviderText(kind, payload) {
  if (payload && typeof payload === 'object') {
    if (kind === 'claude' && Array.isArray(payload.content)) {
      return payload.content
        .map((block) => (block && typeof block === 'object' && 'text' in block ? String(block.text) : ''))
        .join('')
        .trim();
    }
    if (Array.isArray(payload.choices) && payload.choices[0]?.message) {
      return String(payload.choices[0].message.content ?? '').trim();
    }
  }
  return '';
}

/**
 * 只保留受信的协议级结束原因；不得把上游任意字符串写入证据或 UI。
 */
export function extractProviderTerminationReason(kind, payload) {
  if (!payload || typeof payload !== 'object') return 'unknown';
  if (kind === 'claude') {
    const reason = typeof payload.stop_reason === 'string' ? payload.stop_reason : '';
    return ['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal'].includes(reason)
      ? reason
      : 'unknown';
  }
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const reason = typeof choices[0]?.finish_reason === 'string' ? choices[0].finish_reason : '';
  return ['stop', 'length', 'content_filter', 'tool_calls', 'insufficient_system_resource'].includes(reason)
    ? reason
    : 'unknown';
}

/**
 * 将“成功响应但正文为空”压缩为不含 Key、正文或思考内容的诊断摘要。
 * 只暴露协议级结束原因、字段形态和 token 计数，便于区分额度、过滤与上游资源问题。
 */
export function describeProviderEmptyResponse(kind, payload) {
  if (!payload || typeof payload !== 'object') return '上游响应无文本（响应结构无效）';
  if (kind === 'claude') {
    const rawStopReason = typeof payload.stop_reason === 'string' ? payload.stop_reason : '';
    const stopReason = ['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal']
      .includes(rawStopReason)
      ? rawStopReason
      : 'unknown';
    const usage = extractProviderUsage(kind, payload);
    return `上游响应无文本（结束原因：${stopReason}；输出 tokens：${usage.outputTokens}）`;
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const choice = choices[0] && typeof choices[0] === 'object' ? choices[0] : null;
  const message = choice?.message && typeof choice.message === 'object' ? choice.message : null;
  const rawFinishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : '';
  const finishReason = ['stop', 'length', 'content_filter', 'tool_calls', 'insufficient_system_resource']
    .includes(rawFinishReason)
    ? rawFinishReason
    : 'unknown';
  const content = message?.content;
  const contentShape = content === null
    ? 'null'
    : typeof content === 'string'
      ? content.length === 0 ? 'empty-string' : 'string'
      : content === undefined ? 'missing' : Array.isArray(content) ? 'array' : typeof content;
  const reasoningPresent = typeof message?.reasoning_content === 'string' && message.reasoning_content.length > 0;
  const usage = extractProviderUsage(kind, payload);
  const reasoningTokens = Number.isInteger(payload.usage?.completion_tokens_details?.reasoning_tokens)
    && payload.usage.completion_tokens_details.reasoning_tokens >= 0
    ? payload.usage.completion_tokens_details.reasoning_tokens
    : 0;
  const details = [
    `结束原因：${finishReason}`,
    `choices：${choices.length}`,
    `正文形态：${contentShape}`,
    `输出 tokens：${usage.outputTokens}`,
    `思考 tokens：${reasoningTokens}`,
    `含思考字段：${reasoningPresent ? '是' : '否'}`,
  ];
  return `上游响应无文本（${details.join('；')}）`;
}

/** 从供应商 usage 字段提取可观测 token；缺失时返回 0，不据此放宽预留预算。 */
export function extractProviderUsage(kind, payload) {
  if (!payload || typeof payload !== 'object' || !payload.usage || typeof payload.usage !== 'object') {
    return { inputTokens: 0, outputTokens: 0 };
  }
  const usage = payload.usage;
  const input = kind === 'claude' ? usage.input_tokens : usage.prompt_tokens;
  const output = kind === 'claude' ? usage.output_tokens : usage.completion_tokens;
  return {
    inputTokens: Number.isInteger(input) && input >= 0 ? input : 0,
    outputTokens: Number.isInteger(output) && output >= 0 ? output : 0,
  };
}

/** 只有供应商同时返回两个可信非负整数时，才允许把 usage 记为完整回执。 */
export function hasCompleteProviderUsage(kind, payload) {
  if (!payload || typeof payload !== 'object' || !payload.usage || typeof payload.usage !== 'object') return false;
  const input = kind === 'claude' ? payload.usage.input_tokens : payload.usage.prompt_tokens;
  const output = kind === 'claude' ? payload.usage.output_tokens : payload.usage.completion_tokens;
  return Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(output) && output >= 0;
}

export function canReopenCompletedSingleAgentRun(run, agentId) {
  return Boolean(
    run &&
    run.status === 'completed' &&
    run.policy?.expectedArtifacts === 1 &&
    Number.isInteger(run.callsStarted) &&
    run.callsStarted < run.policy.maxCalls &&
    Array.isArray(run.evidence) &&
    run.evidence.some((item) => item?.agentId === agentId),
  );
}

export function normalizeOrchestrationPolicy(value) {
  if (!isPlainObject(value)) return { ok: false, error: 'orchestration 策略缺失' };
  const { expectedArtifacts, maxCalls, totalOutputTokens, stageTimeoutMs, groundingDisclosureApproved } = value;
  if (
    !Number.isInteger(expectedArtifacts) ||
    expectedArtifacts < 1 ||
    expectedArtifacts > ORCHESTRATION_LIMITS.maxExpectedArtifacts
  ) {
    return { ok: false, error: 'expectedArtifacts 非法' };
  }
  if (!Number.isInteger(maxCalls) || maxCalls < expectedArtifacts || maxCalls > ORCHESTRATION_LIMITS.maxCalls) {
    return { ok: false, error: 'maxCalls 非法' };
  }
  if (
    !Number.isInteger(totalOutputTokens) ||
    totalOutputTokens < expectedArtifacts * 64 ||
    totalOutputTokens > ORCHESTRATION_LIMITS.maxTotalOutputTokens
  ) {
    return { ok: false, error: 'totalOutputTokens 非法' };
  }
  if (
    !Number.isInteger(stageTimeoutMs) ||
    stageTimeoutMs < ORCHESTRATION_LIMITS.minStageTimeoutMs ||
    stageTimeoutMs > ORCHESTRATION_LIMITS.maxStageTimeoutMs
  ) {
    return { ok: false, error: 'stageTimeoutMs 非法' };
  }
  if (typeof groundingDisclosureApproved !== 'boolean') {
    return { ok: false, error: 'groundingDisclosureApproved 非法' };
  }
  return {
    ok: true,
    policy: { expectedArtifacts, maxCalls, totalOutputTokens, stageTimeoutMs, groundingDisclosureApproved },
  };
}

/** DemoScenario014：校验不含 Key 的四 Agent 启动包；不创建 run、不调用 Provider。 */
export function normalizeSafePilotPreflight(value) {
  if (!isPlainObject(value)) return { ok: false, error: '安全启动包缺失' };
  const allowedRoot = new Set(['runId', 'taskText', 'contextText', 'profile', 'humanApproval']);
  if (Object.keys(value).some((key) => !allowedRoot.has(key))) return { ok: false, error: '安全启动包含未允许字段' };
  if (!isSafeIdentifier(value.runId, 160)) return { ok: false, error: '安全启动 runId 非法' };
  if (!isBoundedString(value.taskText, 1, 4_000)) return { ok: false, error: '安全启动任务文本非法' };
  if (!isBoundedString(value.contextText, 1, 20_000)) return { ok: false, error: '安全启动上下文摘要非法' };
  if (!isPlainObject(value.profile)) return { ok: false, error: '安全启动执行档案缺失' };
  const allowedProfile = new Set([
    'profileId',
    'version',
    'agentOrder',
    'modelBindings',
    'budget',
    'runCapabilities',
    'checkpointEnabled',
    'sideEffectsAllowed',
    'finalHumanAcceptanceRequired',
  ]);
  if (Object.keys(value.profile).some((key) => !allowedProfile.has(key))) {
    return { ok: false, error: '安全启动执行档案含未允许字段' };
  }
  const profile = value.profile;
  if (profile.profileId !== SAFE_PILOT_PROFILE_ID || profile.version !== '2.0.0') {
    return { ok: false, error: '安全启动执行档案版本不支持' };
  }
  if (!Array.isArray(profile.agentOrder) || stableStringify(profile.agentOrder) !== stableStringify(SAFE_PILOT_AGENT_ORDER)) {
    return { ok: false, error: '安全启动 Agent 顺序非法' };
  }
  if (!Array.isArray(profile.modelBindings) || profile.modelBindings.length !== SAFE_PILOT_AGENT_ORDER.length) {
    return { ok: false, error: '安全启动模型绑定数量非法' };
  }
  const modelBindings = [];
  for (let index = 0; index < SAFE_PILOT_AGENT_ORDER.length; index += 1) {
    const binding = profile.modelBindings[index];
    if (!isPlainObject(binding) || Object.keys(binding).some((key) => !['agentCode', 'provider', 'model', 'ready'].includes(key))) {
      return { ok: false, error: '安全启动模型绑定结构非法' };
    }
    if (
      binding.agentCode !== SAFE_PILOT_AGENT_ORDER[index] ||
      !SAFE_PILOT_PROVIDERS.has(binding.provider) ||
      !isBoundedString(binding.model, 0, 200) ||
      typeof binding.ready !== 'boolean'
    ) return { ok: false, error: '安全启动模型绑定非法' };
    modelBindings.push({
      agentCode: binding.agentCode,
      provider: binding.provider,
      model: binding.model.trim(),
      ready: binding.ready,
    });
  }
  const normalizedBudget = normalizeSafePilotBudget(profile.budget);
  if (!normalizedBudget.ok) return normalizedBudget;
  if (!isPlainObject(profile.runCapabilities)) return { ok: false, error: '安全启动 run 权限缺失' };
  const runCapabilities = {};
  for (const agentCode of SAFE_PILOT_AGENT_ORDER) {
    const capabilities = profile.runCapabilities[agentCode];
    if (!isPlainObject(capabilities) || Object.keys(capabilities).some((key) => !SAFE_PILOT_CAPABILITIES.includes(key))) {
      return { ok: false, error: `${agentCode} run 权限结构非法` };
    }
    const normalizedCapabilities = {};
    for (const capability of SAFE_PILOT_CAPABILITIES) {
      if (typeof capabilities[capability] !== 'boolean') return { ok: false, error: `${agentCode} ${capability} 权限非法` };
      normalizedCapabilities[capability] = capabilities[capability];
    }
    runCapabilities[agentCode] = normalizedCapabilities;
  }
  if (
    typeof profile.checkpointEnabled !== 'boolean' ||
    typeof profile.sideEffectsAllowed !== 'boolean' ||
    typeof profile.finalHumanAcceptanceRequired !== 'boolean'
  ) return { ok: false, error: '安全启动边界开关非法' };
  if (!isPlainObject(value.humanApproval)) return { ok: false, error: '安全启动人工确认结构非法' };
  if (
    Object.keys(value.humanApproval).some((key) => !['approved', 'approvalRef'].includes(key)) ||
    typeof value.humanApproval.approved !== 'boolean' ||
    !isBoundedString(value.humanApproval.approvalRef, 0, 200)
  ) return { ok: false, error: '安全启动人工确认非法' };

  const normalized = {
    runId: value.runId,
    taskText: value.taskText.trim(),
    contextText: value.contextText.trim(),
    profile: {
      profileId: SAFE_PILOT_PROFILE_ID,
      version: '2.0.0',
      agentOrder: [...SAFE_PILOT_AGENT_ORDER],
      modelBindings,
      budget: normalizedBudget.budget,
      runCapabilities,
      checkpointEnabled: profile.checkpointEnabled,
      sideEffectsAllowed: profile.sideEffectsAllowed,
      finalHumanAcceptanceRequired: profile.finalHumanAcceptanceRequired,
    },
    humanApproval: {
      approved: value.humanApproval.approved,
      approvalRef: value.humanApproval.approvalRef.trim(),
    },
  };
  return { ok: true, request: normalized, blockers: safePilotBlockers(normalized) };
}

export function createSafePilotPreflight(request, workspaceId, now = Date.now()) {
  const taskSha256 = sha256Hex(request.taskText);
  const contextSha256 = sha256Hex(request.contextText);
  const profileSha256 = sha256Hex(stableStringify(request.profile));
  const expiresAt = now + request.profile.budget.totalTimeoutMs + (request.profile.budget.maxHumanWaitMs * 2);
  const authorizationSha256 = sha256Hex(stableStringify({
    workspaceId,
    runId: request.runId,
    taskSha256,
    contextSha256,
    profileSha256,
    approvalRef: request.humanApproval.approvalRef,
    expiresAt,
    singleRun: true,
  }));
  const blockers = safePilotBlockers(request);
  return {
    ok: true,
    ready: blockers.length === 0,
    issued: false,
    profileId: SAFE_PILOT_PROFILE_ID,
    runId: request.runId,
    taskSha256,
    contextSha256,
    profileSha256,
    authorizationSha256,
    expiresAt,
    blockers,
  };
}

/**
 * 将服务启动参数中的 task/context/profile 哈希收敛为一个不可部分启用的签发边界。
 * 三项缺少或非法时保持服务可用，但签发必须关闭。
 */
export function normalizeSafePilotIssuerPins(value) {
  const source = isPlainObject(value) ? value : {};
  const pins = {};
  const blockers = [];
  const labels = {
    taskSha256: 'task',
    contextSha256: 'context',
    profileSha256: 'profile',
  };
  for (const field of SAFE_PILOT_ISSUER_PIN_FIELDS) {
    const normalized = typeof source[field] === 'string' ? source[field].trim().toLowerCase() : '';
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
      blockers.push(`安全启动 ${labels[field]} SHA-256 未在服务启动时锁定`);
      continue;
    }
    pins[field] = normalized;
  }
  return {
    ready: blockers.length === 0,
    pins: Object.freeze({
      taskSha256: pins.taskSha256 ?? '',
      contextSha256: pins.contextSha256 ?? '',
      profileSha256: pins.profileSha256 ?? '',
    }),
    blockers,
  };
}

/** 签发前再次比较服务启动锁与本次预检，防止 UI 精确门被通用签发开关绕过。 */
export function validateSafePilotIssuerPins(preflight, pinState) {
  if (!pinState?.ready) return '四 Agent 签发缺少完整的服务启动哈希锁';
  if (!isPlainObject(preflight)) return '四 Agent 签发预检缺失';
  const labels = {
    taskSha256: '任务',
    contextSha256: '上下文',
    profileSha256: '执行档案',
  };
  for (const field of SAFE_PILOT_ISSUER_PIN_FIELDS) {
    if (preflight[field] !== pinState.pins?.[field]) {
      return `四 Agent 签发${labels[field]}哈希与服务启动锁不一致`;
    }
  }
  return null;
}

function normalizeSafePilotBudget(value) {
  if (!isPlainObject(value)) return { ok: false, error: '安全启动预算缺失' };
  const allowed = new Set([
    'plannedCalls',
    'maxCalls',
    'maxManualRetries',
    'maxInputTokens',
    'maxOutputTokens',
    'stageTimeoutMs',
    'totalTimeoutMs',
    'maxHumanWaitMs',
    'currency',
    'inputRateMicrosPerMillion',
    'outputRateMicrosPerMillion',
    'maxCostMicros',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return { ok: false, error: '安全启动预算含未允许字段' };
  const fixed = {
    plannedCalls: 4,
    maxCalls: 5,
    maxManualRetries: 1,
    maxInputTokens: 64_000,
    maxOutputTokens: 1_600,
    stageTimeoutMs: 45_000,
    totalTimeoutMs: 240_000,
  };
  if (Object.entries(fixed).some(([key, expected]) => value[key] !== expected)) {
    return { ok: false, error: '安全启动预算不符合固定上限' };
  }
  if (
    !Number.isInteger(value.maxHumanWaitMs) ||
    value.maxHumanWaitMs < 60_000 ||
    value.maxHumanWaitMs > 1_800_000 ||
    value.maxHumanWaitMs % 60_000 !== 0
  ) return { ok: false, error: '安全启动人工等待授权必须为 1-30 分钟整数' };
  if (!['CNY', 'USD'].includes(value.currency)) return { ok: false, error: '安全启动费用币种非法' };
  for (const key of ['inputRateMicrosPerMillion', 'outputRateMicrosPerMillion', 'maxCostMicros']) {
    if (value[key] !== null && (!Number.isInteger(value[key]) || value[key] <= 0 || value[key] > Number.MAX_SAFE_INTEGER)) {
      return { ok: false, error: `安全启动 ${key} 非法` };
    }
  }
  return { ok: true, budget: { ...fixed, maxHumanWaitMs: value.maxHumanWaitMs, currency: value.currency, inputRateMicrosPerMillion: value.inputRateMicrosPerMillion, outputRateMicrosPerMillion: value.outputRateMicrosPerMillion, maxCostMicros: value.maxCostMicros } };
}

function safePilotBlockers(request) {
  const blockers = [];
  if (request.profile.modelBindings.some((binding) => !binding.ready || binding.provider === 'none' || !binding.model)) {
    blockers.push('四个 Agent 的 Provider/模型绑定未全部就绪');
  }
  const budget = request.profile.budget;
  if (![budget.inputRateMicrosPerMillion, budget.outputRateMicrosPerMillion, budget.maxCostMicros].every((value) => Number.isInteger(value) && value > 0)) {
    blockers.push('Provider 输入/输出费率与费用上限尚未确认');
  }
  if (request.profile.checkpointEnabled || request.profile.sideEffectsAllowed) blockers.push('checkpoint 或副作用权限未关闭');
  for (const agentCode of SAFE_PILOT_AGENT_ORDER) {
    const capabilities = request.profile.runCapabilities[agentCode];
    if (!capabilities.call_model || SAFE_PILOT_CAPABILITIES.some((capability) => capability !== 'call_model' && capabilities[capability])) {
      blockers.push(`${agentCode} run 权限不是 call_model-only`);
    }
  }
  if (!request.profile.finalHumanAcceptanceRequired) blockers.push('最终人工验收门未开启');
  if (!request.humanApproval.approved || !request.humanApproval.approvalRef) blockers.push('缺少本次启动包的人工作出确认');
  return [...new Set(blockers)];
}

/** 校验 LLM 转发请求体（防御性） */
export function validateLlmPayload(payload) {
  if (!payload || typeof payload !== 'object') return '请求体缺失';
  const { config, messages } = payload;
  if (!config || typeof config !== 'object') return 'config 缺失';
  if (!['claude', 'openai', 'deepseek', 'custom'].includes(config.kind)) return 'kind 非法';
  if (typeof config.baseUrl !== 'string' || config.baseUrl.length > 2_048 || !/^https?:\/\//.test(config.baseUrl)) return 'baseUrl 非法';
  let endpoint;
  try {
    endpoint = new URL(config.baseUrl);
  } catch {
    return 'baseUrl 非法';
  }
  if (endpoint.username || endpoint.password) return 'baseUrl 不得包含凭据';
  const allowedHosts = {
    claude: ['api.anthropic.com'],
    openai: ['api.openai.com'],
    deepseek: ['api.deepseek.com'],
    custom: ['127.0.0.1', 'localhost'],
  };
  if (!allowedHosts[config.kind].includes(endpoint.hostname.toLowerCase())) return 'baseUrl 不在允许范围';
  if (typeof config.model !== 'string' || !config.model || config.model.length > 200) return 'model 缺失或超限';
  if (config.thinkingEnabled !== undefined && typeof config.thinkingEnabled !== 'boolean') return 'thinkingEnabled 非法';
  if (config.readinessId !== undefined && !/^ready-[a-f0-9-]{36}$/.test(config.readinessId)) return 'readinessId 非法';
  if (payload.responseFormat !== undefined && !['text', 'json_object'].includes(payload.responseFormat)) {
    return 'responseFormat 非法';
  }
  const apiKeyProblem = validateProviderApiKey(config.apiKey);
  if (apiKeyProblem) return apiKeyProblem;
  if (!Array.isArray(messages) || messages.length === 0) return 'messages 缺失';
  if (messages.length > 100) return 'messages 数量超限';
  if (!messages.every((m) => m && typeof m.content === 'string' && ['system', 'user'].includes(m.role))) {
    return 'messages 结构非法';
  }
  if (messages.reduce((total, message) => total + message.content.length, 0) > 200_000) {
    return 'messages 内容超限';
  }
  if (payload.maxTokens !== undefined && (!Number.isInteger(payload.maxTokens) || payload.maxTokens < 1 || payload.maxTokens > 4096)) {
    return 'maxTokens 非法';
  }
  if (!normalizeAgentIdentifier(payload.agentId)) return 'agentId 不在规范角色清单';
  if (typeof payload.runId !== 'string' || !/^[a-zA-Z0-9._:-]{1,160}$/.test(payload.runId)) return 'runId 非法';
  if (payload.handoff !== undefined) {
    if (!isPlainObject(payload.handoff)) return 'handoff 非法';
    const allowedHandoffKeys = ['version', 'runId', 'fromAgentId', 'toAgentId', 'evidenceId', 'outputSha256', 'acceptanceId'];
    if (Object.keys(payload.handoff).some((key) => !allowedHandoffKeys.includes(key))) return 'handoff 含未允许字段';
    if (
      payload.handoff.version !== '1.0.0' ||
      payload.handoff.runId !== payload.runId ||
      !normalizeAgentIdentifier(payload.handoff.fromAgentId) ||
      normalizeAgentIdentifier(payload.handoff.toAgentId) !== normalizeAgentIdentifier(payload.agentId) ||
      !isSafeIdentifier(payload.handoff.evidenceId, 80) ||
      !/^[a-f0-9]{64}$/.test(payload.handoff.outputSha256) ||
      !isSafeIdentifier(payload.handoff.acceptanceId, 80)
    ) return 'handoff 字段非法';
  }
  if (payload.safePilotAuthorization !== undefined) {
    if (!isPlainObject(payload.safePilotAuthorization)) return 'safePilotAuthorization 非法';
    const allowedSafeAuthorizationKeys = ['authorizationId', 'authorizationToken', 'taskText', 'contextText'];
    if (Object.keys(payload.safePilotAuthorization).some((key) => !allowedSafeAuthorizationKeys.includes(key))) {
      return 'safePilotAuthorization 含未允许字段';
    }
    if (
      !isSafeIdentifier(payload.safePilotAuthorization.authorizationId, 80) ||
      !isBoundedString(payload.safePilotAuthorization.authorizationToken, 1, 500) ||
      !isBoundedString(payload.safePilotAuthorization.taskText, 1, 4_000) ||
      !isBoundedString(payload.safePilotAuthorization.contextText, 1, 20_000)
    ) return 'safePilotAuthorization 字段非法';
  }
  if (payload.developmentAuthorization !== undefined) {
    if (!isPlainObject(payload.developmentAuthorization)) return 'developmentAuthorization 非法';
    const allowedDevelopmentAuthorizationKeys = [
      'sessionId',
      'reservationId',
      'authorizationToken',
      'inputBytes',
      'inputSha256',
    ];
    if (Object.keys(payload.developmentAuthorization).some((key) => !allowedDevelopmentAuthorizationKeys.includes(key))) {
      return 'developmentAuthorization 含未允许字段';
    }
    if (
      !/^dev-[a-f0-9-]{36}$/.test(payload.developmentAuthorization.sessionId)
      || !/^model-[a-f0-9-]{36}$/.test(payload.developmentAuthorization.reservationId)
      || !isBoundedString(payload.developmentAuthorization.authorizationToken, 1, 500)
      || !Number.isInteger(payload.developmentAuthorization.inputBytes)
      || payload.developmentAuthorization.inputBytes < 1
      || payload.developmentAuthorization.inputBytes > 1_000_000
      || !/^[a-f0-9]{64}$/.test(payload.developmentAuthorization.inputSha256)
    ) return 'developmentAuthorization 字段非法';
    if (!/^ready-[a-f0-9-]{36}$/.test(config.readinessId)) return '独立开发模型调用缺少有效 Provider 测试代际';
  }
  const orchestration = normalizeOrchestrationPolicy(payload.orchestration);
  if (!orchestration.ok) return orchestration.error;
  return null;
}

/** 简易防抖（供文件监听用） */
export function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
}
