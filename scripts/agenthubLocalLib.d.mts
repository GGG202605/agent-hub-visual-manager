export interface AgentHubLocalCommand {
  action: 'start' | 'status' | 'stop';
  port: number;
  workspace?: string;
  issuance: {
    enabled: boolean;
    pins: { taskSha256: string; contextSha256: string; profileSha256: string };
  };
}

export interface SafeOperatorHealth {
  ok: boolean;
  version: string;
  workspaceId: string;
  receipts: number;
  safePilotIssuanceRequested: boolean;
  safePilotIssuanceEnabled: boolean;
  safePilotIssuerPinning: {
    ready: boolean;
    taskSha256Prefix: string;
    contextSha256Prefix: string;
    profileSha256Prefix: string;
    blockers: string[];
  };
  operator: {
    managed: boolean;
    processId: number;
    markerSha256Prefix: string;
    entrySha256Prefix: string;
  };
}

export declare const AGENTHUB_LOCAL_RECORD_VERSION: '1.0.0';
export declare const AGENTHUB_DEFAULT_PORT: 8787;
export declare function parseAgentHubLocalArgs(argv: string[]):
  | { ok: true; command: AgentHubLocalCommand }
  | { ok: false; error: string };
export declare function createWorkspaceId(workspace: string): string;
export declare function createOperatorMarkerPrefix(marker: string): string;
export declare function createEntryIdentityPrefix(serverEntry: string): string;
export declare function buildServerArgs(command: AgentHubLocalCommand, marker: string): string[];
export declare function createOwnershipRecord(input: {
  pid: number;
  port: number;
  workspaceId: string;
  marker: string;
  entrySha256Prefix: string;
  health: SafeOperatorHealth;
}): Record<string, unknown>;
export declare function projectSafeHealth(value: unknown): SafeOperatorHealth;
export declare function verifyOwnedService(record: Record<string, any> | null, health: unknown, expectedPort?: number):
  | { ok: true; health: SafeOperatorHealth }
  | { ok: false; error: string };
export declare function getOwnershipRecordPath(port: number, baseDirectory?: string): string;
export declare function safeReceipt(action: string, status: string, health?: unknown): Record<string, unknown>;
