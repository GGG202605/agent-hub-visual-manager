import type { CompletionEvidence } from './coordinationContract';
import type { PipelineState } from './taskPipeline';

export type OrchestrationRunStatus =
  | 'active'
  | 'awaiting_acceptance'
  | 'awaiting_human_acceptance'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface OrchestrationPolicy {
  expectedArtifacts: number;
  maxCalls: number;
  totalOutputTokens: number;
  stageTimeoutMs: number;
  groundingDisclosureApproved: boolean;
}

export interface ModelCallEvidence {
  evidenceId: string;
  runId: string;
  agentId: string;
  provider: string;
  model: string;
  requestSha256: string;
  outputSha256: string;
  outputChars: number;
  reservedOutputTokens: number;
  observedOutputTokens: number;
  terminationReason?: string;
  authorization: 'session_capability';
  acceptanceStatus: 'provider_returned' | 'accepted' | 'rejected';
  acceptanceId?: string;
  acceptedAt?: string;
  createdAt: string;
}

export interface ModelHandoffEnvelope {
  version: '1.0.0';
  runId: string;
  fromAgentId: string;
  toAgentId: string;
  evidenceId: string;
  outputSha256: string;
  acceptanceId: string;
}

export interface OrchestrationRunSummary {
  runId: string;
  status: OrchestrationRunStatus;
  policy: OrchestrationPolicy;
  callsStarted: number;
  callsSucceeded: number;
  callsFailed: number;
  reservedOutputTokens: number;
  observedOutputTokens: number;
  evidence: ModelCallEvidence[];
  startedAt: string;
  updatedAt: string;
  cancelledAt?: string;
}

export interface OrchestratedModelResult {
  text: string;
  evidence: ModelCallEvidence;
  run: OrchestrationRunSummary;
  /** 同一进程内从已验证的开发模型响应缓存返回，未再次访问 Provider。 */
  replayed?: boolean;
}

const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 32_768;

export function createOrchestrationPolicy(
  stageCount: number,
  overrides: Partial<Pick<OrchestrationPolicy, 'totalOutputTokens' | 'stageTimeoutMs' | 'groundingDisclosureApproved'>> = {},
): OrchestrationPolicy {
  const expectedArtifacts = clampInteger(stageCount, 1, 16);
  const maxCalls = Math.min(expectedArtifacts * 2, 32);
  const minimumBudget = expectedArtifacts * 64;
  const defaultBudget = expectedArtifacts * 440;
  return {
    expectedArtifacts,
    maxCalls,
    totalOutputTokens: clampInteger(overrides.totalOutputTokens ?? defaultBudget, minimumBudget, MAX_OUTPUT_TOKENS),
    stageTimeoutMs: clampInteger(overrides.stageTimeoutMs ?? 60_000, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
    groundingDisclosureApproved: overrides.groundingDisclosureApproved === true,
  };
}

export function deriveModelClosureEvidence(
  pipeline: PipelineState,
  evidence: readonly ModelCallEvidence[],
): CompletionEvidence {
  const acceptedEvidence = evidence.filter((item) => item.acceptanceStatus === 'accepted');
  const evidenceAgents = new Set(acceptedEvidence.map((item) => item.agentId));
  const artifactsVerified =
    acceptedEvidence.length >= pipeline.stages.length &&
    acceptedEvidence.every(
      (item) =>
        /^[a-f0-9]{64}$/.test(item.requestSha256) &&
        /^[a-f0-9]{64}$/.test(item.outputSha256) &&
        item.outputChars > 0 &&
        item.authorization === 'session_capability',
    ) &&
    pipeline.stages.every((stage) => evidenceAgents.has(stage.canonicalAgentCode));

  const gateCodes = ['AG-SEC', 'AG-REVIEW'];
  const gatesPassed = pipeline.mode === 'single' || gateCodes.every((code) => {
    const receipt = pipeline.receipts.find((item) => item.agentCode === code);
    return receipt?.status === 'succeeded' && hasStrictPassingGate(receipt.summary);
  });

  return {
    taskStatuses: pipeline.stages.map((_, index) =>
      pipeline.receipts[index]?.status === 'succeeded' ? 'accepted' : 'failed',
    ),
    artifactCount: acceptedEvidence.length,
    artifactsVerified,
    approvalsSatisfied: acceptedEvidence.length > 0 && acceptedEvidence.every((item) => item.authorization === 'session_capability'),
    highFindings: gatesPassed ? 0 : 1,
    mediumFindings: 0,
  };
}

export function hasStrictPassingGate(text: string): boolean {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || lines[lines.length - 1] !== 'GATE:PASS') return false;
  const findings = lines[lines.length - 2]?.match(/^FINDINGS:H(\d+)\/M(\d+)\/L(\d+)$/);
  return Boolean(findings && Number(findings[1]) === 0 && Number(findings[2]) === 0);
}

export function isRunReadyForClosure(run: OrchestrationRunSummary | null, stageCount: number): boolean {
  return Boolean(
    run &&
      run.status === 'completed' &&
      run.evidence.filter((item) => item.acceptanceStatus === 'accepted').length >= stageCount &&
      new Set(run.evidence.filter((item) => item.acceptanceStatus === 'accepted').map((item) => item.agentId)).size >= stageCount,
  );
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  const normalized = Number.isFinite(value) ? Math.round(value) : minimum;
  return Math.min(Math.max(normalized, minimum), maximum);
}
