/** serverLib.mjs 的类型声明（供 src 内测试与工具以真实类型引用，替代 @ts-expect-error） */

export declare const READ_ALLOWLIST_PATTERNS: RegExp[];
export declare const READ_DENYLIST_PATTERNS: RegExp[];
export declare const MAX_FILE_BYTES: number;
export declare const MAX_TOTAL_BYTES: number;
export declare const MAX_FILES: number;
export declare const ORCHESTRATION_LIMITS: Readonly<{
  maxRunsPerWorkspace: number;
  maxCalls: number;
  maxExpectedArtifacts: number;
  maxTotalOutputTokens: number;
  minStageTimeoutMs: number;
  maxStageTimeoutMs: number;
}>;
export declare const SERVER_RETENTION_LIMITS: Readonly<{
  receiptsPerWorkspace: number;
  liveSafePilotAuthorizationsPerWorkspace: number;
  livePatchProposalsPerWorkspace: number;
}>;
export declare const DEVELOPMENT_RESPONSE_REPLAY_POLICY: Readonly<{
  completedLimit: 100;
  ttlMs: 600000;
}>;
export declare function retainLatestRecords<T>(records: T[], limit: number): T[];
export interface BoundedRecordCandidate {
  id: string;
  status?: string;
  expiresAt?: number;
}
export interface BoundedRecordAdmissionPlan {
  removableIds: string[];
  liveCount: number;
  limit: number;
  canAdmit: boolean;
}
export declare function planBoundedRecordAdmission(
  records: BoundedRecordCandidate[],
  options: { limit: number; terminalStatuses?: string[]; now?: number },
): BoundedRecordAdmissionPlan;
export interface ResponseReplaySnapshot<T> {
  status: number;
  payload: T;
}
export interface ResponseReplayEntry<T> {
  readonly key: string;
  readonly requestSha256: string;
  readonly settled: boolean;
  readonly expiresAt: number;
  readonly promise: Promise<ResponseReplaySnapshot<T>>;
}
export interface BoundedResponseReplayCache<T> {
  lookup(key: string, requestSha256: string):
    | { kind: 'miss' }
    | { kind: 'mismatch' }
    | { kind: 'hit'; promise: Promise<ResponseReplaySnapshot<T>> };
  create(key: string, requestSha256: string): ResponseReplayEntry<T>;
  settle(entry: ResponseReplayEntry<T> | null, status: number, payload: T): boolean;
  clearCompleted(): number;
  inspect(): { size: number; pending: number; completed: number };
}
export declare function createBoundedResponseReplayCache<T>(options?: {
  completedLimit?: number;
  ttlMs?: number;
  now?: () => number;
  clone?: (value: T) => T;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancelSchedule?: (handle: unknown) => void;
}): BoundedResponseReplayCache<T>;
export declare const WRITE_SUBDIR: string;
export declare const CANONICAL_AGENT_CODES: readonly string[];
export declare const AGENT_CAPABILITIES: readonly AgentCapability[];
export declare const CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[];

export type AgentCapability =
  | 'call_model'
  | 'save_note'
  | 'run_build'
  | 'manage_checkpoint'
  | 'propose_patch'
  | 'preflight_patch'
  | 'apply_patch';

export interface CapabilityDefinition {
  id: AgentCapability;
  label: string;
  summary: string;
}

export interface AgentPermissionProfile {
  agentId: string;
  capabilities: Record<AgentCapability, boolean>;
}

export declare function normalizeAgentIdentifier(value: unknown): string | null;
export declare function createDefaultPermissionProfiles(): AgentPermissionProfile[];
export declare function normalizePermissionUpdate(payload: unknown):
  | { ok: true; update: { agentId: string; capability: AgentCapability; allowed: boolean } }
  | { ok: false; error: string };
export declare function getRequiredCapability(kind: string): AgentCapability | null;
export declare function normalizePatchProposal(payload: unknown):
  | { ok: true; proposal: Record<string, unknown>; proposalSha256: string }
  | { ok: false; error: string };
export interface UnifiedPatchLine {
  prefix: ' ' | '+' | '-';
  content: string;
  noNewline: boolean;
}
export interface UnifiedPatchHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: UnifiedPatchLine[];
}
export declare function parseUnifiedPatch(value: string, expectedPath: string):
  | {
      ok: true;
      patch: string;
      addedLines: number;
      removedLines: number;
      hunks: UnifiedPatchHunk[];
    }
  | { ok: false; error: string };
export declare function normalizeCheckpointPayload(payload: unknown):
  | { ok: true; checkpoint: Record<string, unknown> }
  | { ok: false; error: string };

export declare function createSessionToken(): string;
export declare function sha256Hex(value: unknown): string;
export declare function hashDevelopmentModelRoute(config: {
  kind?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  thinkingEnabled?: unknown;
  apiKey?: unknown;
}, responseFormat?: 'text' | 'json_object'): string;
export declare function stableStringify(value: unknown): string;
export declare const OPERATOR_EVIDENCE_SCHEMA: 'agenthub.operator-evidence';
export declare const OPERATOR_EVIDENCE_SCHEMA_VERSION: 1;
export declare const OPERATOR_EVIDENCE_MAX_BYTES: number;
export declare const OPERATOR_EVIDENCE_CANONICALIZATION: 'agenthub-json-v1';
export declare function canonicalizeAgentHubJsonV1(value: unknown): string;
export declare function operatorEvidenceJsonFitsSizeLimit(serialized: string): boolean;

export type OperatorEvidenceAgentId = 'AG-COORD' | 'PRO' | 'AG-SEC' | 'AG-REVIEW';
export type OperatorEvidenceExportErrorCode =
  | 'RUN_NOT_ELIGIBLE'
  | 'EXPORT_SOURCE_INVALID'
  | 'EXPORT_TOO_LARGE';

export interface OperatorEvidenceStageV1 {
  callIndex: number;
  attempt: number;
  agentId: OperatorEvidenceAgentId;
  providerId: string;
  modelId: string;
  status: 'accepted';
  evidenceId: string;
  outputSha256: string;
  handoffSha256?: string;
  inputTokens: number;
  outputTokens: number;
  activeMs: number;
  cost: {
    currency: 'CNY';
    observed: string;
  };
  acceptedAt: string;
}

export interface OperatorEvidenceExportV1 {
  schema: 'agenthub.operator-evidence';
  schemaVersion: 1;
  exportedAt: string;
  producer: {
    product: 'agent-hub-visual-manager';
    serverVersion: string;
  };
  scope: {
    runId: string;
    profileId: 'pilot-4-readonly-v2';
    terminalStatus: 'accepted';
  };
  runtimeTruth: {
    sourceLifetime: 'process_memory';
    sameProcessRefresh: 'refetchable';
    survivesServiceRestart: false;
    rehydratesRun: false;
    automaticPersistence: false;
    workspaceWritten: false;
    checkpointCreated: false;
    rawContentIncluded: false;
  };
  bindings: {
    taskSha256: string;
    contextSha256: string;
    profileSha256: string;
    authorizationSha256: string;
  };
  authorization: {
    authorizationId: string;
    issuedAt: string;
    expiresAt: string;
    acceptedAgentIds: ['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW'];
  };
  run: {
    agentOrder: ['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW'];
    startedAt: string;
    completedAt: string;
    finalHumanAccepted: true;
    sideEffectsAllowed: false;
    sideEffectsPerformed: false;
    budgets: {
      maxCalls: number;
      maxRetries: number;
      maxInputTokens: number;
      maxOutputTokens: number;
      maxActiveSeconds: number;
      cost: {
        currency: 'CNY';
        limit: string;
      };
    };
    usage: {
      calls: number;
      retries: number;
      inputTokens: number;
      outputTokens: number;
      activeMs: number;
      cost: {
        currency: 'CNY';
        observed: string;
      };
      acceptedStages: number;
      acceptedHandoffs: number;
    };
    stages: OperatorEvidenceStageV1[];
  };
  integrity: {
    algorithm: 'sha256';
    canonicalization: 'agenthub-json-v1';
    payloadSha256: string;
  };
}

export interface OperatorEvidenceRunSourceV1 {
  runId: string;
  status: string;
  policy: {
    expectedArtifacts: number;
    maxCalls: number;
    totalOutputTokens: number;
    stageTimeoutMs: number;
  };
  callsStarted: number;
  callsSucceeded: number;
  callsFailed: number;
  observedOutputTokens: number;
  evidence: Array<{
    evidenceId: string;
    runId: string;
    agentId: string;
    provider: string;
    model: string;
    outputSha256: string;
    observedOutputTokens: number;
    acceptanceStatus: string;
    acceptedAt?: string;
  }>;
  startedAt: string;
  updatedAt: string;
}

export interface OperatorEvidenceAuthorizationSourceV1 {
  authorizationId: string;
  runId: string;
  status: string;
  profile: {
    profileId: string;
    version: string;
    agentOrder: string[];
    modelBindings: Array<{
      agentCode: string;
      provider: string;
      model: string;
      ready: boolean;
    }>;
    budget: {
      plannedCalls: number;
      maxCalls: number;
      maxManualRetries: number;
      maxInputTokens: number;
      maxOutputTokens: number;
      stageTimeoutMs: number;
      totalTimeoutMs: number;
      maxHumanWaitMs: number;
      currency: string;
      inputRateMicrosPerMillion: number | null;
      outputRateMicrosPerMillion: number | null;
      maxCostMicros: number | null;
    };
    runCapabilities: Record<string, Record<AgentCapability, boolean>>;
    checkpointEnabled: boolean;
    sideEffectsAllowed: boolean;
    finalHumanAcceptanceRequired: boolean;
  };
  taskSha256: string;
  contextSha256: string;
  profileSha256: string;
  authorizationSha256: string;
  issuedAt: string;
  expiresAt: number;
  finalHumanAcceptedAt: string | null;
  acceptedAgentIds: string[];
  usage: {
    callsStarted: number;
    manualRetriesUsed: number;
    observedInputTokens: number;
    observedOutputTokens: number;
    observedCostMicros: number;
    activeElapsedMs: number;
  };
  operatorEvidenceStages: Array<{
    callIndex: number;
    attempt: number;
    agentId: string;
    providerId: string;
    modelId: string;
    evidenceId: string;
    outputSha256: string;
    handoffSha256?: string;
    inputTokens: number;
    outputTokens: number;
    activeMs: number;
    observedCostMicros: number;
  }>;
}

export declare function buildOperatorEvidenceExportV1(input: {
  run: OperatorEvidenceRunSourceV1;
  authorization: OperatorEvidenceAuthorizationSourceV1;
  exportedAt: string;
  serverVersion: string;
}):
  | { ok: true; export: OperatorEvidenceExportV1 }
  | { ok: false; errorCode: OperatorEvidenceExportErrorCode };
export declare function createWorkspaceId(workspaceRoot: string): string;

export interface NormalizedActionDescriptor {
  kind: 'save-note' | 'run-build' | 'patch-preflight' | 'patch-apply';
  runId: string;
  idempotencyKey: string;
  agentId: string;
  title?: string;
  contentLength?: number;
  contentSha256?: string;
  proposalId?: string;
  proposalSha256?: string;
}

export declare function normalizeActionDescriptor(payload: unknown):
  | { ok: true; descriptor: NormalizedActionDescriptor }
  | { ok: false; error: string };
export declare function createActionFingerprint(workspaceId: string, descriptor: NormalizedActionDescriptor): string;
export declare function createApprovalToken(
  sessionToken: string,
  approvalId: string,
  requestHash: string,
  expiresAt: number,
): string;
export declare function verifyApprovalToken(
  sessionToken: string,
  approvalId: string,
  requestHash: string,
  expiresAt: number,
  token: string,
): boolean;

export declare function isAllowedAgentHubFile(relativePath: string): boolean;
export declare function resolveSafeWritePath(workspaceRoot: string, requestedRelPath: string): string | null;
export declare function sanitizeFileName(name: string): string;

export interface ProviderRequestConfig {
  kind: 'claude' | 'openai' | 'deepseek' | 'custom';
  baseUrl: string;
  model: string;
  apiKey: string;
  thinkingEnabled?: boolean;
  readinessId?: string;
}

export interface ProviderMessage {
  role: 'system' | 'user';
  content: string;
}

export declare function buildProviderRequest(
  config: ProviderRequestConfig,
  messages: ProviderMessage[],
  maxTokens: number,
  responseFormat?: 'text' | 'json_object',
): { url: string; headers: Record<string, string>; body: Record<string, unknown> };

export interface ModelCallFailure {
  code: 'CANCELLED' | 'STAGE_TIMEOUT' | 'UPSTREAM_TRANSPORT' | 'UPSTREAM_TEMPORARY' | 'PROVIDER_CALL_REJECTED';
  retryable: boolean;
}
export declare function classifyModelCallFailure(input?: {
  cancelled?: boolean;
  timedOut?: boolean;
  error?: unknown;
}): ModelCallFailure;

export declare function extractProviderText(kind: string, payload: unknown): string;
export declare function extractProviderTerminationReason(kind: string, payload: unknown): string;
export declare function describeProviderEmptyResponse(kind: string, payload: unknown): string;
export declare function extractProviderUsage(kind: string, payload: unknown): {
  inputTokens: number;
  outputTokens: number;
};
export declare function hasCompleteProviderUsage(kind: string, payload: unknown): boolean;
export interface OrchestrationPolicy {
  expectedArtifacts: number;
  maxCalls: number;
  totalOutputTokens: number;
  stageTimeoutMs: number;
  groundingDisclosureApproved: boolean;
}
export declare const SAFE_PILOT_PROFILE_ID: 'pilot-4-readonly-v2';
export declare const SAFE_PILOT_AGENT_ORDER: readonly ['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW'];
export declare const SAFE_PILOT_ISSUER_PIN_FIELDS: readonly ['taskSha256', 'contextSha256', 'profileSha256'];
export declare function safePilotTotalTimeoutExpired(
  startedAtMs: number,
  totalTimeoutMs: number,
  now?: number,
): boolean;
export declare function safePilotActiveElapsedMs(
  activeElapsedMs: number,
  activeSegmentStartedAtMs: number | null,
  now?: number,
): number;
export declare function safePilotActiveTimeoutExpired(
  activeElapsedMs: number,
  activeSegmentStartedAtMs: number | null,
  totalTimeoutMs: number,
  now?: number,
): boolean;
export declare function safePilotHumanWaitExpired(
  humanWaitStartedAtMs: number | null,
  maxHumanWaitMs: number,
  now?: number,
): boolean;
export declare const SAFE_PILOT_RETRY_REPAIR_MARKER: 'TRUSTED_LOCAL_VALIDATION_REPAIR_JSON:';
export declare function validateSafePilotRetryRepairMessages(
  messages: unknown,
  requirement?: { agentId: string; evidenceId: string; outputSha256: string } | null,
): string | null;
export interface SafePilotPreflightResult {
  ok: true;
  ready: boolean;
  issued: false;
  profileId: 'pilot-4-readonly-v2';
  runId: string;
  taskSha256: string;
  contextSha256: string;
  profileSha256: string;
  authorizationSha256: string;
  expiresAt: number;
  blockers: string[];
}
export declare function normalizeSafePilotPreflight(payload: unknown):
  | { ok: true; request: Record<string, unknown>; blockers: string[] }
  | { ok: false; error: string };
export declare function createSafePilotPreflight(
  request: Record<string, unknown>,
  workspaceId: string,
  now?: number,
): SafePilotPreflightResult;
export interface SafePilotIssuerPinState {
  ready: boolean;
  pins: {
    taskSha256: string;
    contextSha256: string;
    profileSha256: string;
  };
  blockers: string[];
}
export declare function normalizeSafePilotIssuerPins(payload: unknown): SafePilotIssuerPinState;
export declare function validateSafePilotIssuerPins(
  preflight: SafePilotPreflightResult | Record<string, unknown>,
  pinState: SafePilotIssuerPinState,
): string | null;
export declare function canReopenCompletedSingleAgentRun(
  run: {
    status: string;
    policy: OrchestrationPolicy;
    callsStarted: number;
    evidence: Array<{ agentId: string }>;
  },
  agentId: string,
): boolean;
export declare function normalizeOrchestrationPolicy(payload: unknown):
  | { ok: true; policy: OrchestrationPolicy }
  | { ok: false; error: string };
export declare function validateLlmPayload(payload: unknown): string | null;
export declare function debounce<T extends (...args: never[]) => void>(fn: T, waitMs: number): T;
