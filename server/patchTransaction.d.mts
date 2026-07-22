export interface PatchTransactionStep {
  phase: 'before_backup' | 'after_backup' | 'after_replace';
  path: string;
  index: number;
}

export interface PatchTransactionOptions {
  onStep?: (step: PatchTransactionStep) => void | Promise<void>;
}

export interface PatchTransactionEntry {
  path: string;
  targetPath: string;
  nextPath: string;
  backupPath: string;
  beforeSha256: string;
  afterSha256: string;
  mode: number;
}

export interface PatchTransactionHandle {
  realWorkspace: string;
  transactionRoot: string;
  transactionDir: string;
  journalPath: string;
  journalTempPath: string;
  journal: Record<string, unknown> & { state: string; transactionId: string };
  entries: PatchTransactionEntry[];
}

export interface PatchTransactionSummary {
  transactionId: string;
  proposalId: string;
  proposalSha256: string;
  status: 'applied' | 'rolled_back' | 'committed_cleanup_completed';
  files: Array<{ path: string; beforeSha256: string; afterSha256: string }>;
}

export declare function buildPatchedBuffer(file: Record<string, unknown>, sourceBuffer: Buffer): Buffer;
export declare function preparePatchTransaction(
  workspaceRoot: string,
  proposal: Record<string, unknown>,
): Promise<PatchTransactionHandle>;
export declare function commitPreparedPatchTransaction(
  handle: PatchTransactionHandle,
  options?: PatchTransactionOptions,
): Promise<PatchTransactionSummary>;
export declare function applyPatchTransaction(
  workspaceRoot: string,
  proposal: Record<string, unknown>,
  options?: PatchTransactionOptions,
): Promise<PatchTransactionSummary>;
export declare function rollbackPreparedPatchTransaction(
  handle: PatchTransactionHandle,
): Promise<PatchTransactionSummary>;
export declare function recoverPatchTransactions(
  workspaceRoot: string,
): Promise<Array<PatchTransactionSummary | { transactionId: string; status: 'recovery_failed'; error: string }>>;
