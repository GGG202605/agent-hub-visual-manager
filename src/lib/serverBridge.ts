import type { ChatMessage, ConnectorConfig } from './agentConnectors';
import type { TaskCheckpoint, TaskCheckpointSummary } from './taskGraph';
import type {
  OrchestratedModelResult,
  OrchestrationPolicy,
  OrchestrationRunSummary,
  ModelCallEvidence,
  ModelHandoffEnvelope,
} from './orchestration';
import type { PatchProposal, PatchProposalSummary } from './patchProposal';
import type {
  SafePilotAuthorizationGrant,
  SafePilotAuthorizationReference,
  SafePilotAuthorizationSnapshot,
  SafePilotPreflightRequest,
  SafePilotPreflightResult,
} from './safePilotLauncher';

export const DEFAULT_SERVER_URL = 'http://127.0.0.1:8787';

export type ModelResponseFormat = 'text' | 'json_object';

export interface ModelGatewayFailure {
  code: string;
  retryable: boolean;
}

export class ModelGatewayError extends Error {
  readonly status: number;
  readonly failureCode: string | null;
  readonly retryable: boolean;

  constructor(message: string, status: number, failure: ModelGatewayFailure | null) {
    super(message);
    this.name = 'ModelGatewayError';
    this.status = status;
    this.failureCode = failure?.code ?? null;
    this.retryable = failure?.retryable === true;
  }
}

export interface ServerHealth {
  ok: boolean;
  version: string;
  workspace: string;
  workspaceId: string;
  agentHub: string;
  receipts: number;
  safePilotIssuanceEnabled: boolean;
  developmentPreset?: { id: string; isDefault: boolean };
  serviceInstanceId: string;
  sessionToken: string;
}

export type DevelopmentPhase = 'ready' | 'analyzing' | 'editing' | 'verifying' | 'reviewing' | 'failed';

export interface DevelopmentAgentPlan {
  size: 1 | 2 | 4 | 5;
  reasonCode: 'focused-low-risk' | 'bounded-standard' | 'complex-cross-cutting' | 'security-sensitive-cross-cutting';
  agents: string[];
}

export interface DevelopmentCommandResult {
  executionId?: string;
  stabilityRetryOf?: string;
  commandId: string;
  policyVersion?: number;
  status: 'passed' | 'failed';
  exitCode: number;
  timedOut: boolean;
  worktreeChanged: boolean;
  durationMs: number;
  outputSha256: string;
  sourceStateSha256: string;
  finishedAt: string;
  outputTail?: string;
}

export type DevelopmentAcceptanceScript =
  | 'preview'
  | 'dev'
  | 'start'
  | 'python-fastapi'
  | 'python-flask'
  | 'python-static';

export type DevelopmentAcceptanceAction =
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'press'; key: 'Enter' | 'Escape' | 'Tab' | 'ArrowDown' | 'ArrowUp' | 'Space' }
  | { type: 'wait'; ms: number }
  | { type: 'assert-visible'; selector: string }
  | { type: 'assert-hidden'; selector: string }
  | { type: 'assert-absent'; selector: string }
  | { type: 'assert-text'; text: string }
  | { type: 'assert-text-absent'; text: string };

export interface DevelopmentAcceptancePlan {
  scriptId: DevelopmentAcceptanceScript;
  route: string;
  waitAfterLoadMs: number;
  actions: DevelopmentAcceptanceAction[];
}

export interface DevelopmentAcceptanceReceipt {
  acceptanceId: string;
  policyVersion?: number;
  status: 'passed' | 'failed';
  scriptId: DevelopmentAcceptanceScript | null;
  planSha256: string;
  evidenceSha256: string;
  sourceStateSha256: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  actionCount: number;
  viewportCount: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  failedRequestCount: number;
  failureCount: number;
  screenshotSha256: string[];
}

export interface DevelopmentAcceptanceViewport {
  id: 'desktop' | 'mobile';
  width: number;
  height: number;
  documentWidth: number;
  documentHeight: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  failedRequestCount: number;
  failureCount: number;
  failures: string[];
  diagnostics: string[];
  screenshotSha256: string;
  screenshotDataUrl: string;
}

export interface DevelopmentAcceptanceResult extends DevelopmentAcceptanceReceipt {
  scriptId: DevelopmentAcceptanceScript;
  viewports: DevelopmentAcceptanceViewport[];
  session: DevelopmentSession;
  recovered?: true;
  replayed?: true;
}

export interface DevelopmentReviewReceipt {
  schema: 'agenthub.development-review';
  schemaVersion: 1;
  policyVersion?: number;
  reviewId: string;
  agentId: 'AG-DEV' | 'AG-SEC' | 'AG-REVIEW';
  modelId: string;
  findings: { high: number; medium: number; low: number };
  gate: 'PASS' | 'FAIL';
  summarySha256: string;
  sourceStateSha256: string;
  reviewedAt: string;
}

export interface DevelopmentCostPolicy {
  currency: 'CNY';
  inputMicrosPerMillionTokens: number;
  outputMicrosPerMillionTokens: number;
  maxCostMicros: number;
}

export interface DevelopmentModelUsage {
  maxCalls: number;
  maxInputBytes: number;
  maxInputBytesPerCall: number;
  maxOutputTokens: number;
  maxOutputTokensPerCall: number;
  reservedCalls: number;
  startedCalls: number;
  unstartedReservedCalls: number;
  reservedInputBytes: number;
  untrackedLegacyInputCalls: number;
  reservedOutputTokens: number;
  usageReportedCalls: number;
  usageMissingStartedCalls: number;
  observedInputTokens: number;
  observedOutputTokens: number;
  costCurrency: 'CNY';
  inputMicrosPerMillionTokens: number;
  outputMicrosPerMillionTokens: number;
  maxCostMicros: number;
  reservedCostMicros: number;
  observedCostMicros: number;
  unsettledCostMicros: number;
  chargedCostMicros: number;
  failureReportedCalls: number;
  retryableFailureCalls: number;
  transientRetryCalls: number;
  remainingCalls: number;
  remainingInputBytes: number;
  remainingOutputTokens: number;
  remainingCostMicros: number;
}

export interface DevelopmentModelAuthorization {
  sessionId: string;
  reservationId: string;
  authorizationToken: string;
  inputBytes: number;
  inputSha256: string;
}

export interface DevelopmentEvidencePolicy {
  command: number;
  browserAcceptance: number;
  independentReview: number;
  requirements: number;
  finalization: number;
  policySha256: string;
}

export interface DevelopmentSession {
  sessionId: string;
  presetId: 'local-autonomous-v1';
  evidencePolicy: DevelopmentEvidencePolicy;
  createdAt: string;
  updatedAt: string;
  phase: DevelopmentPhase;
  agentPlan: DevelopmentAgentPlan;
  requirements: { testChange: boolean; browserAcceptance: boolean };
  modelUsage: DevelopmentModelUsage;
  changeSetCount: number;
  commands: DevelopmentCommandResult[];
  stabilityRetriedSourceStates?: string[];
  acceptances: DevelopmentAcceptanceReceipt[];
  reviews: DevelopmentReviewReceipt[];
  final: null | {
    ready: boolean;
    evidencePolicySha256?: string;
    finalizedAt: string;
    changedFileCount: number;
    statusSha256: string;
    diffCheckPassed: boolean;
    verificationPassed: boolean;
    acceptancePassed?: boolean;
    browserAcceptanceRequired?: boolean;
    browserAcceptancePassed?: boolean;
    reviewPassed?: boolean;
    blockedChangedPathCount?: number;
  };
  rootBound: boolean;
  rootName?: string;
  branch?: string;
  head?: string;
}

export interface DevelopmentPreset {
  schema: 'agenthub.development-preset';
  schemaVersion: 1;
  id: 'local-autonomous-v1';
  label: string;
  isDefault: true;
  authorization: string;
  scope: Record<string, string | string[]>;
  denied: string[];
}

interface DevelopmentPreflightBase {
  ok: true;
  presetId: 'local-autonomous-v1';
  rootName: string;
  branch: string;
  agentPlan: DevelopmentAgentPlan;
  requirements: { testChange: boolean; browserAcceptance: boolean };
  scripts: string[];
  acceptanceScripts: DevelopmentAcceptanceScript[];
  packageManager: string;
}

export type DevelopmentPreflight = DevelopmentPreflightBase & (
  | { mode: 'create'; resume: null }
  | { mode: 'resume'; resume: { sessionId: string; phase: DevelopmentPhase; updatedAt: string } }
  | { mode: 'reopen'; resume: { sessionId: string; phase: DevelopmentPhase; updatedAt: string } }
);

export interface DevelopmentFileContext {
  path: string;
  content: string;
  sha256: string;
  bytes: number;
}

export interface DevelopmentSnapshot {
  session: DevelopmentSession;
  head: string;
  branch: string;
  gitStatus: string;
  worktreeStateSha256: string;
  files: string[];
  scripts: string[];
  acceptanceScripts: DevelopmentAcceptanceScript[];
  packageManager: string;
  seedFiles: DevelopmentFileContext[];
}

export interface ServerFileEntry {
  path: string;
  text: string;
}

export interface ExecuteReceipt {
  seq: number;
  kind: string;
  detail: string;
  status: 'ok' | 'failed';
  at: string;
  runId?: string;
  agentId?: string;
  workspaceId?: string;
  approvalId?: string;
  idempotencyKey?: string;
  requestHash?: string;
  previousHash?: string;
  receiptHash?: string;
}

export interface ExecuteActionContext {
  runId: string;
  agentId: string;
}

export type AgentCapability =
  | 'call_model'
  | 'save_note'
  | 'run_build'
  | 'manage_checkpoint'
  | 'propose_patch'
  | 'preflight_patch'
  | 'apply_patch';
export type RuntimeEventCategory = 'conversation' | 'operation' | 'approval' | 'security' | 'system';
export type RuntimeEventStatus = 'info' | 'pending' | 'succeeded' | 'failed' | 'blocked';

export interface CapabilityDefinition {
  id: AgentCapability;
  label: string;
  summary: string;
}

export interface AgentPermissionProfile {
  agentId: string;
  capabilities: Record<AgentCapability, boolean>;
}

export interface RuntimeEvent {
  id: string;
  seq: number;
  at: string;
  workspaceId: string;
  category: RuntimeEventCategory;
  type: string;
  status: RuntimeEventStatus;
  title: string;
  summary: string;
  agentId?: string;
  runId?: string;
}

export type OperatorEvidenceOrchestrationRunSummary = OrchestrationRunSummary & {
  operatorEvidenceEligible?: boolean;
};

export type OperatorEvidenceAgentId = 'AG-COORD' | 'PRO' | 'AG-SEC' | 'AG-REVIEW';

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
  cost: { currency: 'CNY'; observed: string };
  acceptedAt: string;
}

export interface OperatorEvidenceExportV1 {
  schema: 'agenthub.operator-evidence';
  schemaVersion: 1;
  exportedAt: string;
  producer: { product: 'agent-hub-visual-manager'; serverVersion: string };
  scope: { runId: string; profileId: 'pilot-4-readonly-v2'; terminalStatus: 'accepted' };
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
      cost: { currency: 'CNY'; limit: string };
    };
    usage: {
      calls: number;
      retries: number;
      inputTokens: number;
      outputTokens: number;
      activeMs: number;
      cost: { currency: 'CNY'; observed: string };
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

export interface RuntimeStatePayload {
  events: RuntimeEvent[];
  definitions: CapabilityDefinition[];
  profiles: AgentPermissionProfile[];
  orchestrationRuns: OperatorEvidenceOrchestrationRunSummary[];
  patchProposals: PatchProposalSummary[];
}

interface ApprovalGrant {
  ok: boolean;
  approvalId?: string;
  approvalToken?: string;
  expiresAt?: number;
  requestHash?: string;
  workspaceId?: string;
  error?: string;
}

const sessionTokens = new Map<string, string>();

export async function fetchHealth(serverUrl: string, signal?: AbortSignal | null): Promise<ServerHealth> {
  const baseUrl = trim(serverUrl);
  const response = await fetch(`${baseUrl}/api/session`, { method: 'POST', signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const health = (await response.json()) as ServerHealth;
  if (!health.sessionToken) throw new Error('本地服务未返回会话能力令牌');
  sessionTokens.set(baseUrl, health.sessionToken);
  return health;
}

async function ensureSession(serverUrl: string, signal?: AbortSignal | null): Promise<string> {
  const baseUrl = trim(serverUrl);
  const existing = sessionTokens.get(baseUrl);
  if (existing) return existing;
  return (await fetchHealth(baseUrl, signal)).sessionToken;
}

async function authenticatedHeaders(serverUrl: string, signal?: AbortSignal | null): Promise<Record<string, string>> {
  return {
    'content-type': 'application/json',
    'x-agenthub-session': await ensureSession(serverUrl, signal),
  };
}

async function authenticatedFetch(serverUrl: string, path: string, init: RequestInit): Promise<Response> {
  const baseUrl = trim(serverUrl);
  const run = async () =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(await authenticatedHeaders(baseUrl, init.signal)) },
    });
  let response = await run();
  if (response.status === 401) {
    sessionTokens.delete(baseUrl);
    response = await run();
  }
  return response;
}

type DevelopmentReadOnlyPath =
  | '/api/development/preset'
  | '/api/development/sessions'
  | '/api/development/preflight'
  | '/api/development/snapshot'
  | '/api/development/inspect';
type DevelopmentIdempotentMutationPath =
  | '/api/development/apply'
  | '/api/development/replace'
  | '/api/development/replace-batch';
type DevelopmentIdempotentEvidencePath =
  | '/api/development/command'
  | '/api/development/review';
type DevelopmentIdempotentOperationPath = DevelopmentIdempotentMutationPath | DevelopmentIdempotentEvidencePath;
type DevelopmentRevalidatedOperationPath =
  | '/api/development/sessions'
  | '/api/development/sessions/resume'
  | '/api/development/sessions/progress'
  | '/api/development/model-call'
  | '/api/development/acceptance'
  | '/api/development/finalize';
type DevelopmentLocallyReplayablePath =
  | DevelopmentReadOnlyPath
  | DevelopmentIdempotentOperationPath
  | DevelopmentRevalidatedOperationPath;

async function developmentLocallyReplayableRequest<T>(
  serverUrl: string,
  path: DevelopmentLocallyReplayablePath,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const requestBody = body === undefined ? undefined : JSON.stringify(body);
  const request = () => authenticatedFetch(serverUrl, path, {
    method: requestBody === undefined ? 'GET' : 'POST',
    ...(requestBody === undefined ? {} : { body: requestBody }),
    signal,
  });
  try {
    return await parseDevelopmentResponse<T>(await request());
  } catch (error) {
    if (signal?.aborted || (!(error instanceof TypeError) && !(error instanceof SyntaxError))) throw error;
    await waitForLocalResponseReplay(signal);
    return parseDevelopmentResponse<T>(await request());
  }
}

function developmentReadOnlyRequest<T>(
  serverUrl: string,
  path: DevelopmentReadOnlyPath,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return developmentLocallyReplayableRequest(serverUrl, path, body, signal);
}

function developmentIdempotentOperationRequest<T>(
  serverUrl: string,
  path: DevelopmentIdempotentOperationPath,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return developmentLocallyReplayableRequest(serverUrl, path, body, signal);
}

function developmentRevalidatedOperationRequest<T>(
  serverUrl: string,
  path: DevelopmentRevalidatedOperationPath,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return developmentLocallyReplayableRequest(serverUrl, path, body, signal);
}

async function parseDevelopmentResponse<T>(response: Response): Promise<T> {
  let payload: T & { error?: string };
  try {
    payload = (await response.json()) as T & { error?: string };
  } catch (error) {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    throw error;
  }
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}

export async function fetchProjectFiles(serverUrl: string, signal?: AbortSignal): Promise<File[]> {
  const response = await authenticatedFetch(serverUrl, '/api/project', { method: 'GET', signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as { files: ServerFileEntry[] };
  return payload.files.map((entry) => {
    const file = new File([entry.text], entry.path.split('/').pop() ?? entry.path, { type: 'text/markdown' });
    Object.defineProperty(file, 'webkitRelativePath', { value: entry.path });
    return file;
  });
}

export function subscribeEvents(
  serverUrl: string,
  onChange: () => void,
  onDown?: () => void,
  onWorkspace?: (workspace: string) => void,
  onRuntime?: (event: RuntimeEvent) => void,
  onReady?: () => void,
): () => void {
  const controller = new AbortController();
  const dispatch = (block: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    const data = dataLines.join('\n');
    if (eventName === 'change') onChange();
    if (eventName === 'workspace') onWorkspace?.(data);
    if (eventName === 'hello') {
      onChange();
      onReady?.();
    }
    if (eventName === 'runtime') {
      try {
        onRuntime?.(JSON.parse(data) as RuntimeEvent);
      } catch {
        // 忽略单条畸形事件，保持 SSE 主连接可用。
      }
    }
  };

  void (async () => {
    try {
      const response = await authenticatedFetch(serverUrl, '/api/events', {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          dispatch(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
        }
        if (done) break;
      }
      if (!controller.signal.aborted) onDown?.();
    } catch {
      if (!controller.signal.aborted) onDown?.();
    }
  })();

  return () => controller.abort();
}

export async function fetchWorkspaces(serverUrl: string): Promise<{ current: string; recent: string[] }> {
  const response = await authenticatedFetch(serverUrl, '/api/workspaces', { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as { current: string; recent: string[] };
}

export async function switchWorkspaceApi(
  serverUrl: string,
  path: string,
): Promise<{ ok: boolean; workspace?: string; error?: string }> {
  const response = await authenticatedFetch(serverUrl, '/api/workspace', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
  return (await response.json()) as { ok: boolean; workspace?: string; error?: string };
}

export async function fetchDevelopmentPreset(serverUrl: string, signal?: AbortSignal): Promise<DevelopmentPreset> {
  const payload = await developmentReadOnlyRequest<{ preset: DevelopmentPreset }>(
    serverUrl,
    '/api/development/preset',
    undefined,
    signal,
  );
  return payload.preset;
}

export async function listDevelopmentSessions(serverUrl: string, signal?: AbortSignal): Promise<DevelopmentSession[]> {
  const payload = await developmentReadOnlyRequest<{ sessions: DevelopmentSession[] }>(
    serverUrl,
    '/api/development/sessions',
    undefined,
    signal,
  );
  return payload.sessions;
}

export function preflightDevelopmentSession(
  serverUrl: string,
  input: { root: string; task: string; presetId?: string },
  signal?: AbortSignal,
): Promise<DevelopmentPreflight> {
  return developmentReadOnlyRequest(serverUrl, '/api/development/preflight', input, signal);
}

export function createDevelopmentSession(
  serverUrl: string,
  input: { root: string; task: string; presetId?: string; costPolicy: DevelopmentCostPolicy },
  signal?: AbortSignal,
): Promise<DevelopmentSession & { recovered?: true; replayed?: true }> {
  const creationId = `creation-${globalThis.crypto.randomUUID()}`;
  return developmentRevalidatedOperationRequest(
    serverUrl,
    '/api/development/sessions',
    { ...input, creationId },
    signal,
  );
}

export function resumeDevelopmentSession(
  serverUrl: string,
  input: { sessionId: string; root: string; task: string },
  signal?: AbortSignal,
): Promise<DevelopmentSession & { replayed?: true }> {
  return developmentRevalidatedOperationRequest(serverUrl, '/api/development/sessions/resume', input, signal);
}

export function updateDevelopmentProgress(
  serverUrl: string,
  sessionId: string,
  phase: DevelopmentPhase,
  signal?: AbortSignal,
): Promise<DevelopmentSession & { recovered?: true; replayed?: true }> {
  const transitionId = `transition-${globalThis.crypto.randomUUID()}`;
  return developmentRevalidatedOperationRequest(
    serverUrl,
    '/api/development/sessions/progress',
    { sessionId, phase, transitionId },
    signal,
  );
}

export async function issueDevelopmentModelCall(
  serverUrl: string,
  input: {
    sessionId: string;
    runId: string;
    agentId: string;
    messages: ChatMessage[];
    modelRouteSha256: string;
    providerReadinessSha256: string;
    maxOutputTokens: number;
    retryOfReservationId?: string;
  },
  signal?: AbortSignal,
): Promise<{ authorization: DevelopmentModelAuthorization; session: DevelopmentSession }> {
  return developmentRevalidatedOperationRequest<{
    authorization: DevelopmentModelAuthorization;
    session: DevelopmentSession;
  }>(serverUrl, '/api/development/model-call', input, signal);
}

export function fetchDevelopmentSnapshot(
  serverUrl: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<DevelopmentSnapshot> {
  return developmentReadOnlyRequest(serverUrl, '/api/development/snapshot', { sessionId }, signal);
}

export function readDevelopmentFiles(
  serverUrl: string,
  sessionId: string,
  paths: string[],
  signal?: AbortSignal,
): Promise<{ files: DevelopmentFileContext[] }> {
  return developmentReadOnlyRequest(serverUrl, '/api/development/inspect', { sessionId, kind: 'read', paths }, signal);
}

export function searchDevelopmentFiles(
  serverUrl: string,
  sessionId: string,
  query: string,
  signal?: AbortSignal,
): Promise<{ matches: string[] }> {
  return developmentReadOnlyRequest(serverUrl, '/api/development/inspect', { sessionId, kind: 'search', query }, signal);
}

export function fetchDevelopmentDiff(
  serverUrl: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<{ diff: string; newFiles: DevelopmentFileContext[] }> {
  return developmentReadOnlyRequest(serverUrl, '/api/development/inspect', { sessionId, kind: 'diff' }, signal);
}

export function applyDevelopmentPatch(
  serverUrl: string,
  input: { sessionId: string; changeSetId: string; patch: string },
  signal?: AbortSignal,
): Promise<{ ok: true; session: DevelopmentSession; fileCount: number; patchSha256: string; replayed?: true }> {
  return developmentIdempotentOperationRequest(serverUrl, '/api/development/apply', input, signal);
}

export function applyDevelopmentTextReplacement(
  serverUrl: string,
  input: { sessionId: string; changeSetId: string; path: string; oldText: string; newText: string },
  signal?: AbortSignal,
): Promise<{ ok: true; session: DevelopmentSession; fileCount: number; patchSha256: string; replayed?: true }> {
  return developmentIdempotentOperationRequest(serverUrl, '/api/development/replace', input, signal);
}

export function applyDevelopmentTextReplacementBatch(
  serverUrl: string,
  input: {
    sessionId: string;
    changeSetId: string;
    replacements: Array<{ path: string; oldText: string; newText: string }>;
  },
  signal?: AbortSignal,
): Promise<{ ok: true; session: DevelopmentSession; fileCount: number; patchSha256: string; replayed?: true }> {
  return developmentIdempotentOperationRequest(serverUrl, '/api/development/replace-batch', input, signal);
}

export function runDevelopmentCommand(
  serverUrl: string,
  sessionId: string,
  commandId: string,
  signal?: AbortSignal,
  options?: { stabilityRetryOf?: string },
): Promise<DevelopmentCommandResult & { session: DevelopmentSession; replayed?: true }> {
  const executionId = `command-${globalThis.crypto.randomUUID()}`;
  return developmentIdempotentOperationRequest(
    serverUrl,
    '/api/development/command',
    {
      sessionId,
      commandId,
      executionId,
      ...(options?.stabilityRetryOf ? { stabilityRetryOf: options.stabilityRetryOf } : {}),
    },
    signal,
  );
}

export function runDevelopmentBrowserAcceptance(
  serverUrl: string,
  input: { sessionId: string; acceptanceId: string; plan: DevelopmentAcceptancePlan },
  signal?: AbortSignal,
): Promise<DevelopmentAcceptanceResult> {
  return developmentRevalidatedOperationRequest(serverUrl, '/api/development/acceptance', input, signal);
}

export function submitDevelopmentReview(
  serverUrl: string,
  input: { sessionId: string; reviewId: string; agentId: 'AG-DEV' | 'AG-SEC' | 'AG-REVIEW'; modelId: string; summary: string },
  signal?: AbortSignal,
): Promise<{ receipt: DevelopmentReviewReceipt; session: DevelopmentSession; replayed?: true }> {
  return developmentIdempotentOperationRequest(serverUrl, '/api/development/review', input, signal);
}

export function finalizeDevelopmentSession(
  serverUrl: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<{
  ready: boolean;
  session: DevelopmentSession;
  changedPaths: string[];
  diffCheckPassed: boolean;
  requiredCommands: string[];
  missingOrFailed: string[];
  acceptanceBlockers: string[];
  reviewBlockers: string[];
  browserAcceptanceRequired: boolean;
  blockedChangedPathCount: number;
  replayed?: true;
}> {
  return developmentRevalidatedOperationRequest(serverUrl, '/api/development/finalize', { sessionId }, signal);
}

export async function fetchReceipts(serverUrl: string): Promise<ExecuteReceipt[]> {
  const response = await authenticatedFetch(serverUrl, '/api/receipts', { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as { receipts: ExecuteReceipt[] };
  return payload.receipts;
}

export async function fetchRuntimeState(serverUrl: string): Promise<RuntimeStatePayload> {
  const response = await authenticatedFetch(serverUrl, '/api/runtime-state', { method: 'GET' });
  const payload = (await response.json()) as RuntimeStatePayload & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}

export async function fetchOperatorEvidenceExport(
  serverUrl: string,
  runId: string,
): Promise<OperatorEvidenceExportV1> {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(runId)) throw new Error('runId 非法');
  const response = await authenticatedFetch(
    serverUrl,
    `/api/operator-evidence/export?runId=${encodeURIComponent(runId)}`,
    { method: 'GET' },
  );
  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload: {
    ok?: boolean;
    export?: unknown;
    errorCode?: unknown;
    error?: unknown;
  } = (rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
    ? rawPayload
    : {}) as {
      ok?: boolean;
      export?: unknown;
      errorCode?: unknown;
      error?: unknown;
    };
  if (!response.ok || payload.ok !== true || !isOperatorEvidenceExportV1(payload.export)) {
    throw new Error(
      operatorEvidenceErrorMessage(payload.error, response.ok ? '脱敏证据响应无效' : `HTTP ${response.status}`),
    );
  }
  return payload.export;
}

export async function updateAgentPermission(
  serverUrl: string,
  agentId: string,
  capability: AgentCapability,
  allowed: boolean,
): Promise<Pick<RuntimeStatePayload, 'definitions' | 'profiles'>> {
  const response = await authenticatedFetch(serverUrl, '/api/permissions', {
    method: 'POST',
    body: JSON.stringify({ agentId, capability, allowed }),
  });
  const payload = (await response.json()) as Pick<RuntimeStatePayload, 'definitions' | 'profiles'> & {
    ok?: boolean;
    error?: string;
  };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}

export async function fetchTaskCheckpoints(serverUrl: string): Promise<TaskCheckpointSummary[]> {
  const response = await authenticatedFetch(serverUrl, '/api/checkpoints', { method: 'GET' });
  const payload = (await response.json()) as { checkpoints?: TaskCheckpointSummary[]; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload.checkpoints ?? [];
}

export async function fetchTaskCheckpoint(serverUrl: string, runId: string): Promise<TaskCheckpoint> {
  const response = await authenticatedFetch(
    serverUrl,
    `/api/checkpoint?runId=${encodeURIComponent(runId)}`,
    { method: 'GET' },
  );
  const payload = (await response.json()) as { checkpoint?: TaskCheckpoint; error?: string };
  if (!response.ok || !payload.checkpoint) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload.checkpoint;
}

export async function saveTaskCheckpoint(
  serverUrl: string,
  checkpoint: TaskCheckpoint,
): Promise<{ ok: boolean; checkpoint?: TaskCheckpointSummary; replayed?: boolean; error?: string }> {
  const response = await authenticatedFetch(serverUrl, '/api/checkpoints', {
    method: 'POST',
    body: JSON.stringify({ agentId: 'AG-COORD', checkpoint }),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    checkpoint?: TaskCheckpointSummary;
    replayed?: boolean;
    error?: string;
  };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return { ok: true, checkpoint: payload.checkpoint, replayed: payload.replayed };
}

export async function fetchOrchestrationRuns(serverUrl: string): Promise<OrchestrationRunSummary[]> {
  const response = await authenticatedFetch(serverUrl, '/api/orchestration/runs', { method: 'GET' });
  const payload = (await response.json()) as { runs?: OrchestrationRunSummary[]; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload.runs ?? [];
}

export async function cancelModelOrchestration(
  serverUrl: string,
  runId: string,
  signal: AbortSignal = AbortSignal.timeout(5_000),
): Promise<OrchestrationRunSummary> {
  const response = await authenticatedFetch(serverUrl, '/api/orchestration/cancel', {
    method: 'POST',
    body: JSON.stringify({ runId }),
    signal,
  });
  const payload = (await response.json()) as { ok?: boolean; run?: OrchestrationRunSummary; error?: string };
  if (!response.ok || !payload.ok || !payload.run) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload.run;
}

export async function resumeModelOrchestration(
  serverUrl: string,
  runId: string,
): Promise<OrchestrationRunSummary> {
  const response = await authenticatedFetch(serverUrl, '/api/orchestration/resume', {
    method: 'POST',
    body: JSON.stringify({ runId }),
  });
  const payload = (await response.json()) as { ok?: boolean; run?: OrchestrationRunSummary; error?: string };
  if (!response.ok || !payload.ok || !payload.run) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload.run;
}

export async function submitPatchProposal(
  serverUrl: string,
  proposal: PatchProposal,
): Promise<PatchProposalSummary> {
  const response = await authenticatedFetch(serverUrl, '/api/patches/proposals', {
    method: 'POST',
    body: JSON.stringify({ proposal }),
  });
  const payload = (await response.json()) as { ok?: boolean; proposal?: PatchProposalSummary; error?: string };
  if (!response.ok || !payload.ok || !payload.proposal) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload.proposal;
}

export async function executePatchPreflight(
  serverUrl: string,
  proposal: PatchProposalSummary,
  agentId = 'AG-SEC',
): Promise<{
  ok: boolean;
  proposal?: PatchProposalSummary;
  receipt?: ExecuteReceipt;
  replayed?: boolean;
  error?: string;
}> {
  return executeApprovedAction(serverUrl, {
    kind: 'patch-preflight',
    runId: proposal.runId,
    agentId,
    proposalId: proposal.proposalId,
    proposalSha256: proposal.proposalSha256,
    idempotencyKey: `${proposal.runId}:patch-preflight:${proposal.proposalId}:${proposal.proposalSha256.slice(0, 16)}`,
  });
}

export async function executePatchApplication(
  serverUrl: string,
  proposal: PatchProposalSummary,
  agentId = 'EXECUTOR',
): Promise<{
  ok: boolean;
  proposal?: PatchProposalSummary;
  transaction?: {
    transactionId: string;
    proposalId: string;
    proposalSha256: string;
    status: string;
    files: Array<{ path: string; beforeSha256: string; afterSha256: string }>;
  };
  receipt?: ExecuteReceipt;
  replayed?: boolean;
  error?: string;
}> {
  return executeApprovedAction(serverUrl, {
    kind: 'patch-apply',
    runId: proposal.runId,
    agentId,
    proposalId: proposal.proposalId,
    proposalSha256: proposal.proposalSha256,
    idempotencyKey: `${proposal.runId}:patch-apply:${proposal.proposalId}:${proposal.proposalSha256.slice(0, 16)}`,
  });
}

export async function callViaServer(
  serverUrl: string,
  config: ConnectorConfig,
  messages: ChatMessage[],
  options: {
    agentId: string;
    runId: string;
    orchestration: OrchestrationPolicy;
    maxTokens?: number;
    handoff?: ModelHandoffEnvelope;
    safePilotAuthorization?: SafePilotAuthorizationReference;
    developmentAuthorization?: DevelopmentModelAuthorization;
    responseFormat?: ModelResponseFormat;
    signal?: AbortSignal;
  },
): Promise<OrchestratedModelResult> {
  const requestBody = JSON.stringify({
    config,
    ...(options.developmentAuthorization ? {} : { messages }),
    agentId: options.agentId,
    runId: options.runId,
    maxTokens: options.maxTokens ?? 300,
    handoff: options.handoff,
    safePilotAuthorization: options.safePilotAuthorization,
    developmentAuthorization: options.developmentAuthorization,
    responseFormat: options.responseFormat,
    orchestration: options.orchestration,
  });
  const request = () => authenticatedFetch(serverUrl, '/api/llm', {
    method: 'POST',
    body: requestBody,
    signal: options.signal,
  });
  const parse = async (response: Response) => {
    const payload = (await response.json()) as Partial<OrchestratedModelResult> & { error?: string; failure?: unknown };
    if (!response.ok || !payload.text || !payload.evidence || !payload.run) {
      throw new ModelGatewayError(
        payload.error ?? `HTTP ${response.status}`,
        response.status,
        normalizeModelGatewayFailure(payload.failure),
      );
    }
    return payload as OrchestratedModelResult;
  };
  try {
    return await parse(await request());
  } catch (error) {
    if (
      !options.developmentAuthorization
      || options.signal?.aborted
      || (!(error instanceof TypeError) && !(error instanceof SyntaxError))
    ) throw error;
    await waitForLocalResponseReplay(options.signal);
    return parse(await request());
  }
}

function waitForLocalResponseReplay(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('本地响应重放已取消'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error('本地响应重放已取消'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, 120);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function normalizeModelGatewayFailure(value: unknown): ModelGatewayFailure | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ModelGatewayFailure>;
  if (typeof candidate.code !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(candidate.code)) return null;
  if (typeof candidate.retryable !== 'boolean') return null;
  return { code: candidate.code, retryable: candidate.retryable };
}

export async function acceptModelEvidence(
  serverUrl: string,
  input: {
    runId: string;
    agentId: string;
    evidenceId: string;
    outputSha256: string;
    decision: 'accepted' | 'rejected';
    safePilotAuthorization?: Pick<SafePilotAuthorizationReference, 'authorizationId' | 'authorizationToken'>;
  },
): Promise<{
  ok: true;
  evidence: ModelCallEvidence;
  run: OrchestrationRunSummary;
  authorization?: SafePilotAuthorizationSnapshot;
}> {
  const response = await authenticatedFetch(serverUrl, '/api/orchestration/acceptance', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    evidence?: ModelCallEvidence;
    run?: OrchestrationRunSummary;
    authorization?: SafePilotAuthorizationSnapshot;
    error?: string;
  };
  if (!response.ok || !payload.ok || !payload.evidence || !payload.run) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return { ok: true, evidence: payload.evidence, run: payload.run, authorization: payload.authorization };
}

/** DemoScenario014 仅校验启动包并返回服务端哈希；不会签发执行票据或调用 Provider。 */
export async function preflightSafePilot(
  serverUrl: string,
  request: SafePilotPreflightRequest,
): Promise<SafePilotPreflightResult> {
  const response = await authenticatedFetch(serverUrl, '/api/safe-pilot/preflight', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  const payload = (await response.json()) as SafePilotPreflightResult & { error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}

export async function issueSafePilotAuthorization(
  serverUrl: string,
  preflight: SafePilotPreflightRequest,
): Promise<SafePilotAuthorizationGrant> {
  const response = await authenticatedFetch(serverUrl, '/api/safe-pilot/authorizations', {
    method: 'POST',
    body: JSON.stringify({ preflight, issueConfirmed: true }),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    authorization?: SafePilotAuthorizationSnapshot;
    authorizationToken?: string;
    error?: string;
  };
  if (!response.ok || !payload.ok || !payload.authorization || !payload.authorizationToken) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return { authorization: payload.authorization, authorizationToken: payload.authorizationToken };
}

export async function approveSafePilotRetry(
  serverUrl: string,
  reference: Pick<SafePilotAuthorizationReference, 'authorizationId' | 'authorizationToken'>,
): Promise<SafePilotAuthorizationSnapshot> {
  const response = await authenticatedFetch(serverUrl, '/api/safe-pilot/retry', {
    method: 'POST',
    body: JSON.stringify({ ...reference, humanApproved: true }),
  });
  const payload = (await response.json()) as { ok?: boolean; authorization?: SafePilotAuthorizationSnapshot; error?: string };
  if (!response.ok || !payload.ok || !payload.authorization) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload.authorization;
}

export async function acceptSafePilotHumanFinal(
  serverUrl: string,
  reference: Pick<SafePilotAuthorizationReference, 'authorizationId' | 'authorizationToken'>,
): Promise<{ authorization: SafePilotAuthorizationSnapshot; run: OrchestrationRunSummary }> {
  const response = await authenticatedFetch(serverUrl, '/api/safe-pilot/human-acceptance', {
    method: 'POST',
    body: JSON.stringify({ ...reference, humanAccepted: true }),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    authorization?: SafePilotAuthorizationSnapshot;
    run?: OrchestrationRunSummary;
    error?: string;
  };
  if (!response.ok || !payload.ok || !payload.authorization || !payload.run) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return { authorization: payload.authorization, run: payload.run };
}

async function grantAction(serverUrl: string, action: Record<string, unknown>): Promise<ApprovalGrant> {
  const response = await authenticatedFetch(serverUrl, '/api/approvals/grant', {
    method: 'POST',
    body: JSON.stringify(action),
  });
  const payload = (await response.json()) as ApprovalGrant;
  if (!response.ok || !payload.ok || !payload.approvalId || !payload.approvalToken) {
    throw new Error(payload.error ?? `审批票据创建失败（HTTP ${response.status}）`);
  }
  return payload;
}

async function executeApprovedAction<T extends { ok: boolean; error?: string }>(
  serverUrl: string,
  action: Record<string, unknown>,
): Promise<T> {
  const grant = await grantAction(serverUrl, action);
  const response = await authenticatedFetch(serverUrl, '/api/execute', {
    method: 'POST',
    body: JSON.stringify({
      ...action,
      approvalId: grant.approvalId,
      approvalToken: grant.approvalToken,
    }),
  });
  return (await response.json()) as T;
}

export async function executeSaveNote(
  serverUrl: string,
  title: string,
  content: string,
  context: ExecuteActionContext,
): Promise<{ ok: boolean; path?: string; receipt?: ExecuteReceipt; replayed?: boolean; error?: string }> {
  return executeApprovedAction(serverUrl, {
    kind: 'save-note',
    title,
    content,
    runId: context.runId,
    agentId: context.agentId,
    idempotencyKey: `${context.runId}:save-note`,
  });
}

export async function executeRunBuild(
  serverUrl: string,
  context: ExecuteActionContext,
): Promise<{
  ok: boolean;
  exitCode?: number;
  outputTail?: string;
  receipt?: ExecuteReceipt;
  replayed?: boolean;
  error?: string;
}> {
  return executeApprovedAction(serverUrl, {
    kind: 'run-build',
    runId: context.runId,
    agentId: context.agentId,
    idempotencyKey: `${context.runId}:run-build`,
  });
}

function trim(url: string): string {
  return url.replace(/\/+$/, '');
}

function isOperatorEvidenceExportV1(value: unknown): value is OperatorEvidenceExportV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OperatorEvidenceExportV1>;
  return candidate.schema === 'agenthub.operator-evidence'
    && candidate.schemaVersion === 1
    && typeof candidate.exportedAt === 'string'
    && candidate.integrity?.algorithm === 'sha256'
    && candidate.integrity.canonicalization === 'agenthub-json-v1'
    && typeof candidate.integrity.payloadSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(candidate.integrity.payloadSha256);
}

function operatorEvidenceErrorMessage(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const bounded = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 240);
  return bounded || fallback;
}
