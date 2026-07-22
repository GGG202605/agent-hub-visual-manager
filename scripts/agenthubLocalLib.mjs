import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const AGENTHUB_LOCAL_RECORD_VERSION = '1.0.0';
export const AGENTHUB_DEFAULT_PORT = 8787;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_PREFIX_PATTERN = /^[a-f0-9]{16}$/;

export function parseAgentHubLocalArgs(argv) {
  const source = Array.isArray(argv) ? argv : [];
  const action = source[0];
  if (!['start', 'status', 'stop'].includes(action)) return fail('命令必须为 start、status 或 stop');
  const allowed = new Set([
    '--workspace',
    '--port',
    '--enable-safe-pilot-issuance',
    '--task-sha256',
    '--context-sha256',
    '--profile-sha256',
  ]);
  const values = new Map();
  let enableIssuance = false;
  for (let index = 1; index < source.length; index += 1) {
    const token = source[index];
    if (!allowed.has(token)) return fail('存在未允许的启动参数');
    if (token === '--enable-safe-pilot-issuance') {
      if (enableIssuance) return fail('启动参数不得重复');
      enableIssuance = true;
      continue;
    }
    if (values.has(token)) return fail('启动参数不得重复');
    const value = source[index + 1];
    if (!value || value.startsWith('--')) return fail('启动参数缺少值');
    values.set(token, value);
    index += 1;
  }
  const port = Number(values.get('--port') ?? AGENTHUB_DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return fail('端口必须为 1-65535 的整数');
  const workspace = values.get('--workspace');
  const pins = {
    taskSha256: normalizeHash(values.get('--task-sha256')),
    contextSha256: normalizeHash(values.get('--context-sha256')),
    profileSha256: normalizeHash(values.get('--profile-sha256')),
  };
  const hasAnyPin = Object.values(pins).some(Boolean);
  if (action !== 'start' && (workspace || enableIssuance || hasAnyPin)) return fail('status/stop 只允许指定端口');
  if (action === 'start' && !workspace) return fail('start 必须指定 --workspace');
  if (enableIssuance && Object.values(pins).some((value) => !value)) return fail('启用签发必须提供三项合法 SHA-256');
  if (!enableIssuance && hasAnyPin) return fail('未启用签发时不得提供启动哈希');
  return {
    ok: true,
    command: {
      action,
      port,
      ...(workspace ? { workspace: path.resolve(workspace) } : {}),
      issuance: { enabled: enableIssuance, pins },
    },
  };
}

export function createWorkspaceId(workspace) {
  return sha256(path.resolve(workspace)).slice(0, 24);
}

export function createOperatorMarkerPrefix(marker) {
  return SHA256_PATTERN.test(marker) ? sha256(marker).slice(0, 16) : '';
}

export function createEntryIdentityPrefix(serverEntry) {
  return sha256(path.resolve(serverEntry)).slice(0, 16);
}

export function buildServerArgs(command, marker) {
  const args = [
    'server/server.mjs',
    '--workspace',
    command.workspace,
    '--port',
    String(command.port),
    '--operator-instance-id',
    marker,
  ];
  if (command.issuance.enabled) {
    args.push(
      '--enable-safe-pilot-issuance',
      '--safe-pilot-task-sha256',
      command.issuance.pins.taskSha256,
      '--safe-pilot-context-sha256',
      command.issuance.pins.contextSha256,
      '--safe-pilot-profile-sha256',
      command.issuance.pins.profileSha256,
    );
  }
  return args;
}

export function createOwnershipRecord({ pid, port, workspaceId, marker, entrySha256Prefix, health }) {
  return {
    version: AGENTHUB_LOCAL_RECORD_VERSION,
    pid,
    port,
    workspaceId,
    operatorMarker: marker,
    operatorMarkerSha256Prefix: createOperatorMarkerPrefix(marker),
    entrySha256Prefix,
    issuanceRequested: health.safePilotIssuanceRequested,
    issuanceEnabled: health.safePilotIssuanceEnabled,
    pinningReady: health.safePilotIssuerPinning.ready,
    pinPrefixes: { ...health.safePilotIssuerPinning },
    startedAt: new Date().toISOString(),
  };
}

export function projectSafeHealth(value) {
  const source = value && typeof value === 'object' ? value : {};
  const pinning = source.safePilotIssuerPinning && typeof source.safePilotIssuerPinning === 'object'
    ? source.safePilotIssuerPinning
    : {};
  const operator = source.operator && typeof source.operator === 'object' ? source.operator : {};
  return {
    ok: source.ok === true,
    version: boundedString(source.version, 20),
    workspaceId: /^[a-f0-9]{24}$/.test(source.workspaceId ?? '') ? source.workspaceId : '',
    receipts: boundedInteger(source.receipts, 0, 500),
    safePilotIssuanceRequested: source.safePilotIssuanceRequested === true,
    safePilotIssuanceEnabled: source.safePilotIssuanceEnabled === true,
    safePilotIssuerPinning: {
      ready: pinning.ready === true,
      taskSha256Prefix: safePrefix(pinning.taskSha256Prefix),
      contextSha256Prefix: safePrefix(pinning.contextSha256Prefix),
      profileSha256Prefix: safePrefix(pinning.profileSha256Prefix),
      blockers: Array.isArray(pinning.blockers)
        ? pinning.blockers.slice(0, 8).map(() => '配置未就绪')
        : [],
    },
    operator: {
      managed: operator.managed === true,
      processId: boundedInteger(operator.processId, 1, 2_147_483_647),
      markerSha256Prefix: safePrefix(operator.markerSha256Prefix),
      entrySha256Prefix: safePrefix(operator.entrySha256Prefix),
    },
  };
}

export function verifyOwnedService(record, health, expectedPort = record?.port) {
  const safeHealth = projectSafeHealth(health);
  if (!record || record.version !== AGENTHUB_LOCAL_RECORD_VERSION) return fail('本地运行记录无效');
  if (
    !Number.isInteger(record.pid) || record.pid < 1 ||
    !Number.isInteger(record.port) || record.port < 1 || record.port > 65_535 || record.port !== expectedPort ||
    !/^[a-f0-9]{24}$/.test(record.workspaceId ?? '') ||
    !SHA256_PATTERN.test(record.operatorMarker ?? '') ||
    createOperatorMarkerPrefix(record.operatorMarker) !== record.operatorMarkerSha256Prefix ||
    !SAFE_PREFIX_PATTERN.test(record.entrySha256Prefix ?? '')
  ) return fail('本地运行记录无效');
  if (!safeHealth.ok || !safeHealth.operator.managed) return fail('监听服务不属于 AgentHub 启动器');
  if (
    safeHealth.operator.processId !== record.pid ||
    safeHealth.workspaceId !== record.workspaceId ||
    safeHealth.operator.markerSha256Prefix !== record.operatorMarkerSha256Prefix ||
    safeHealth.operator.entrySha256Prefix !== record.entrySha256Prefix ||
    safeHealth.safePilotIssuanceRequested !== record.issuanceRequested ||
    safeHealth.safePilotIssuanceEnabled !== record.issuanceEnabled ||
    safeHealth.safePilotIssuerPinning.ready !== record.pinningReady ||
    safeHealth.safePilotIssuerPinning.taskSha256Prefix !== record.pinPrefixes?.taskSha256Prefix ||
    safeHealth.safePilotIssuerPinning.contextSha256Prefix !== record.pinPrefixes?.contextSha256Prefix ||
    safeHealth.safePilotIssuerPinning.profileSha256Prefix !== record.pinPrefixes?.profileSha256Prefix
  ) return fail('监听服务与本地运行记录不一致');
  return { ok: true, health: safeHealth };
}

export function getOwnershipRecordPath(port, baseDirectory = tmpdir()) {
  return path.join(baseDirectory, 'agenthub-visual-manager', `operator-${port}.json`);
}

export function safeReceipt(action, status, health = null) {
  return {
    ok: !status.startsWith('blocked') && !status.startsWith('failed'),
    action,
    status,
    ...(health ? { service: projectSafeHealth(health) } : {}),
  };
}

function normalizeHash(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SHA256_PATTERN.test(normalized) ? normalized : '';
}

function safePrefix(value) {
  return typeof value === 'string' && SAFE_PREFIX_PATTERN.test(value) ? value : '';
}

function boundedString(value, max) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max)
    : '';
}

function boundedInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : 0;
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function fail(error) {
  return { ok: false, error };
}
