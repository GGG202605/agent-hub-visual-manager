import type { ProviderKind } from './agentConnectors';

export const SAFE_PILOT_PROFILE_ID = 'pilot-4-readonly-v2' as const;
export const SAFE_PILOT_AGENT_ORDER = ['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW'] as const;
export const SAFE_PILOT_DEFAULT_HUMAN_WAIT_MS = 300_000;
export const SAFE_PILOT_MIN_HUMAN_WAIT_MS = 60_000;
export const SAFE_PILOT_MAX_HUMAN_WAIT_MS = 1_800_000;

export type SafePilotAgentCode = (typeof SAFE_PILOT_AGENT_ORDER)[number];
export type SafePilotCurrency = 'CNY' | 'USD';
export type SafePilotCapability =
  | 'call_model'
  | 'manage_checkpoint'
  | 'save_note'
  | 'run_build'
  | 'propose_patch'
  | 'preflight_patch'
  | 'apply_patch';

export interface SafePilotModelBinding {
  agentCode: SafePilotAgentCode;
  provider: ProviderKind | 'none';
  model: string;
  ready: boolean;
}

export interface SafePilotBudgetV2 {
  plannedCalls: 4;
  maxCalls: 5;
  maxManualRetries: 1;
  maxInputTokens: 64_000;
  maxOutputTokens: 1_600;
  stageTimeoutMs: 45_000;
  totalTimeoutMs: 240_000;
  maxHumanWaitMs: number;
  currency: SafePilotCurrency;
  inputRateMicrosPerMillion: number | null;
  outputRateMicrosPerMillion: number | null;
  maxCostMicros: number | null;
}

export interface SafePilotExecutionProfile {
  profileId: typeof SAFE_PILOT_PROFILE_ID;
  version: '2.0.0';
  agentOrder: readonly SafePilotAgentCode[];
  modelBindings: readonly SafePilotModelBinding[];
  budget: SafePilotBudgetV2;
  runCapabilities: Readonly<Record<SafePilotAgentCode, Readonly<Record<SafePilotCapability, boolean>>>>;
  checkpointEnabled: false;
  sideEffectsAllowed: false;
  finalHumanAcceptanceRequired: true;
}

export interface SafePilotPreflightRequest {
  runId: string;
  taskText: string;
  contextText: string;
  profile: SafePilotExecutionProfile;
  humanApproval: {
    approved: boolean;
    approvalRef: string;
  };
}

export interface SafePilotPreflightResult {
  ok: boolean;
  ready: boolean;
  issued: false;
  profileId: typeof SAFE_PILOT_PROFILE_ID;
  runId: string;
  taskSha256: string;
  contextSha256: string;
  profileSha256: string;
  authorizationSha256: string;
  expiresAt: number;
  blockers: string[];
}

export interface SafePilotAuthorizationUsage {
  callsStarted: number;
  manualRetriesApproved: number;
  manualRetriesUsed: number;
  reservedInputTokens: number;
  observedInputTokens: number;
  reservedOutputTokens: number;
  observedOutputTokens: number;
  reservedCostMicros: number;
  observedCostMicros: number;
  activeElapsedMs: number;
}

export interface SafePilotAuthorizationSnapshot {
  authorizationId: string;
  runId: string;
  status: string;
  profileId: typeof SAFE_PILOT_PROFILE_ID;
  taskSha256: string;
  contextSha256: string;
  profileSha256: string;
  authorizationSha256: string;
  expiresAt: number;
  humanWaitDeadlineAt: number | null;
  usage: SafePilotAuthorizationUsage;
  acceptedAgentIds: SafePilotAgentCode[];
}

/** Token 只允许留在当前页面内存；不得渲染、记录或持久化。 */
export interface SafePilotAuthorizationReference {
  authorizationId: string;
  authorizationToken: string;
  taskText: string;
  contextText: string;
}

export interface SafePilotAuthorizationGrant {
  authorization: SafePilotAuthorizationSnapshot;
  authorizationToken: string;
}

export interface SafePilotAcceptanceReceipt {
  acceptanceId: string;
  runId: string;
  agentId: SafePilotAgentCode;
  evidenceId: string;
  outputSha256: string;
  decision: 'accepted' | 'rejected';
  createdAt: string;
}

export interface SafePilotHandoffEnvelope {
  version: '1.0.0';
  runId: string;
  fromAgentId: SafePilotAgentCode;
  toAgentId: SafePilotAgentCode;
  evidenceId: string;
  outputSha256: string;
  acceptanceId: string;
}

export interface SafePilotPricingInput {
  currency?: SafePilotCurrency;
  inputRatePerMillion?: number | null;
  outputRatePerMillion?: number | null;
  maxCost?: number | null;
}

export interface SafePilotTimingInput {
  maxHumanWaitMs?: number;
}

const SAFE_CAPABILITIES: readonly SafePilotCapability[] = [
  'call_model',
  'manage_checkpoint',
  'save_note',
  'run_build',
  'propose_patch',
  'preflight_patch',
  'apply_patch',
];

export function buildSafePilotExecutionProfile(
  modelBindings: readonly SafePilotModelBinding[],
  pricing: SafePilotPricingInput = {},
  timing: SafePilotTimingInput = {},
): SafePilotExecutionProfile {
  const normalizedBindings = SAFE_PILOT_AGENT_ORDER.map((agentCode) => {
    const binding = modelBindings.find((item) => item.agentCode === agentCode);
    return {
      agentCode,
      provider: binding?.provider ?? 'none',
      model: binding?.model.trim().slice(0, 200) ?? '',
      ready: binding?.ready === true,
    } satisfies SafePilotModelBinding;
  });
  const runCapabilities = Object.fromEntries(
    SAFE_PILOT_AGENT_ORDER.map((agentCode) => [
      agentCode,
      Object.fromEntries(SAFE_CAPABILITIES.map((capability) => [capability, capability === 'call_model'])),
    ]),
  ) as SafePilotExecutionProfile['runCapabilities'];
  return {
    profileId: SAFE_PILOT_PROFILE_ID,
    version: '2.0.0',
    agentOrder: SAFE_PILOT_AGENT_ORDER,
    modelBindings: normalizedBindings,
    budget: {
      plannedCalls: 4,
      maxCalls: 5,
      maxManualRetries: 1,
      maxInputTokens: 64_000,
      maxOutputTokens: 1_600,
      stageTimeoutMs: 45_000,
      totalTimeoutMs: 240_000,
      maxHumanWaitMs: timing.maxHumanWaitMs ?? SAFE_PILOT_DEFAULT_HUMAN_WAIT_MS,
      currency: pricing.currency ?? 'CNY',
      inputRateMicrosPerMillion: toMicros(pricing.inputRatePerMillion),
      outputRateMicrosPerMillion: toMicros(pricing.outputRatePerMillion),
      maxCostMicros: toMicros(pricing.maxCost),
    },
    runCapabilities,
    checkpointEnabled: false,
    sideEffectsAllowed: false,
    finalHumanAcceptanceRequired: true,
  };
}

export function listSafePilotBlockers(request: SafePilotPreflightRequest): string[] {
  const blockers: string[] = [];
  if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(request.runId)) blockers.push('runId 非法');
  if (!request.taskText.trim() || request.taskText.length > 4_000) blockers.push('任务文本必须为 1-4000 字符');
  if (!request.contextText.trim() || request.contextText.length > 20_000) blockers.push('上下文摘要必须为 1-20000 字符');
  if (request.profile.profileId !== SAFE_PILOT_PROFILE_ID) blockers.push('执行档案版本不匹配');
  if (request.profile.agentOrder.join('|') !== SAFE_PILOT_AGENT_ORDER.join('|')) blockers.push('Agent 顺序不是固定四角色链');
  if (
    request.profile.modelBindings.length !== SAFE_PILOT_AGENT_ORDER.length ||
    request.profile.modelBindings.some((binding, index) =>
      binding.agentCode !== SAFE_PILOT_AGENT_ORDER[index] ||
      !binding.ready ||
      binding.provider === 'none' ||
      !binding.model,
    )
  ) blockers.push('四个 Agent 的 Provider/模型绑定未全部就绪');
  const budget = request.profile.budget;
  if (
    budget.plannedCalls !== 4 ||
    budget.maxCalls !== 5 ||
    budget.maxManualRetries !== 1 ||
    budget.maxInputTokens !== 64_000 ||
    budget.maxOutputTokens !== 1_600 ||
    budget.stageTimeoutMs !== 45_000 ||
    budget.totalTimeoutMs !== 240_000
  ) blockers.push('预算不符合 pilot-4-readonly-v2 固定上限');
  if (
    !Number.isInteger(budget.maxHumanWaitMs) ||
    budget.maxHumanWaitMs < SAFE_PILOT_MIN_HUMAN_WAIT_MS ||
    budget.maxHumanWaitMs > SAFE_PILOT_MAX_HUMAN_WAIT_MS ||
    budget.maxHumanWaitMs % 60_000 !== 0
  ) blockers.push('人工等待授权必须为 1-30 分钟整数');
  if (
    !isPositiveInteger(budget.inputRateMicrosPerMillion) ||
    !isPositiveInteger(budget.outputRateMicrosPerMillion) ||
    !isPositiveInteger(budget.maxCostMicros)
  ) blockers.push('Provider 输入/输出费率与费用上限尚未确认');
  if (request.profile.checkpointEnabled || request.profile.sideEffectsAllowed) blockers.push('checkpoint 或副作用权限未关闭');
  for (const agentCode of SAFE_PILOT_AGENT_ORDER) {
    const capabilities = request.profile.runCapabilities[agentCode];
    if (!capabilities || capabilities.call_model !== true) blockers.push(`${agentCode} 缺少 run 级 call_model 权限`);
    if (capabilities && SAFE_CAPABILITIES.some((capability) => capability !== 'call_model' && capabilities[capability])) {
      blockers.push(`${agentCode} 存在越界副作用权限`);
    }
  }
  if (!request.profile.finalHumanAcceptanceRequired) blockers.push('最终人工验收门未开启');
  if (!request.humanApproval.approved || !request.humanApproval.approvalRef.trim()) blockers.push('缺少本次启动包的人工作出确认');
  return [...new Set(blockers)];
}

export function buildSafePilotHandoff(
  runId: string,
  fromAgentId: SafePilotAgentCode,
  toAgentId: SafePilotAgentCode,
  evidence: { evidenceId: string; outputSha256: string },
  acceptance: SafePilotAcceptanceReceipt,
): SafePilotHandoffEnvelope {
  const fromIndex = SAFE_PILOT_AGENT_ORDER.indexOf(fromAgentId);
  if (fromIndex < 0 || SAFE_PILOT_AGENT_ORDER[fromIndex + 1] !== toAgentId) throw new Error('handoff Agent 顺序不合法');
  if (acceptance.decision !== 'accepted') throw new Error('handoff 只能引用已接受证据');
  if (
    acceptance.runId !== runId ||
    acceptance.agentId !== fromAgentId ||
    acceptance.evidenceId !== evidence.evidenceId ||
    acceptance.outputSha256 !== evidence.outputSha256
  ) throw new Error('handoff 与验收回执不一致');
  if (!/^[a-f0-9]{64}$/.test(evidence.outputSha256)) throw new Error('handoff 输出哈希非法');
  return {
    version: '1.0.0',
    runId,
    fromAgentId,
    toAgentId,
    evidenceId: evidence.evidenceId,
    outputSha256: evidence.outputSha256,
    acceptanceId: acceptance.acceptanceId,
  };
}

export function estimateSafePilotCostMicros(
  budget: SafePilotBudgetV2,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (!isPositiveInteger(budget.inputRateMicrosPerMillion) || !isPositiveInteger(budget.outputRateMicrosPerMillion)) {
    return null;
  }
  return Math.ceil(
    (Math.max(0, inputTokens) * budget.inputRateMicrosPerMillion +
      Math.max(0, outputTokens) * budget.outputRateMicrosPerMillion) /
      1_000_000,
  );
}

function toMicros(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1_000_000);
}

function isPositiveInteger(value: number | null): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
