export interface DevelopmentAgentPlan {
  size: 1 | 2 | 4 | 5;
  reasonCode: 'focused-low-risk' | 'bounded-standard' | 'complex-cross-cutting' | 'security-sensitive-cross-cutting';
  agents: string[];
}

export interface LocalAutonomousPreset {
  schema: 'agenthub.development-preset';
  schemaVersion: 1;
  id: 'local-autonomous-v1';
  label: string;
  isDefault: true;
  authorization: string;
  scope: Record<string, string | readonly string[]>;
  denied: readonly string[];
}

export interface DevelopmentManager {
  stateRoot: string;
  preset: LocalAutonomousPreset;
  listSessions(): Promise<unknown[]>;
  preflightSession(payload: unknown): Promise<unknown>;
  createSession(payload: unknown): Promise<unknown>;
  resumeSession(payload: unknown): Promise<unknown>;
  updateProgress(payload: unknown): Promise<unknown>;
  issueModelCall(payload: unknown): Promise<unknown>;
  preflightModelCall(payload: unknown): Promise<void>;
  beginModelCall(payload: unknown): Promise<{
    recordUsage(usage: { inputTokens: number; outputTokens: number }): Promise<void>;
    recordFailure(failure: { code: string; retryable: boolean }): Promise<void>;
    release(): void;
  }>;
  snapshot(payload: unknown): Promise<unknown>;
  inspect(payload: unknown): Promise<unknown>;
  applyChangeSet(payload: unknown): Promise<unknown>;
  applyTextReplacement(payload: unknown): Promise<unknown>;
  applyTextReplacementBatch(payload: unknown): Promise<unknown>;
  runCommand(payload: unknown): Promise<unknown>;
  runBrowserAcceptance(payload: unknown): Promise<unknown>;
  submitReview(payload: unknown): Promise<unknown>;
  finalize(payload: unknown): Promise<unknown>;
  dispose(): Promise<void>;
}

export declare const LOCAL_AUTONOMOUS_PRESET: LocalAutonomousPreset;
export declare function planDevelopmentAgents(task: unknown): DevelopmentAgentPlan;
export declare function planDevelopmentRequirements(task: unknown): { testChange: boolean; browserAcceptance: boolean };
export declare function findDevelopmentSourceQualityProblem(relativePath: unknown, before: unknown, after: unknown): string;
export declare function resolveDevelopmentStateRoot(explicitRoot?: string): string;
export declare function isSafeDevelopmentPath(value: unknown): boolean;
export declare function createDevelopmentManager(options?: {
  stateRoot?: string;
  requireExplicitCostPolicy?: boolean;
  projectCommandTimeoutMs?: number;
  acceptanceRuntime?: { run(input: unknown): Promise<any>; dispose(): Promise<void> };
  acceptanceOptions?: Record<string, unknown>;
  persistReplacementSession?: (record: Record<string, unknown>) => Promise<void>;
}): Promise<DevelopmentManager>;
