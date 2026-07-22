export const PATCH_PROPOSAL_VERSION = '1.0.0' as const;

export interface PatchProposalFile {
  path: string;
  beforeSha256: string;
  afterSha256: string;
  addedLines: number;
  removedLines: number;
  patch: string;
}

export interface PatchProposal {
  version: typeof PATCH_PROPOSAL_VERSION;
  proposalId: string;
  runId: string;
  agentId: string;
  title: string;
  createdAt: string;
  files: PatchProposalFile[];
}

export interface PatchProposalFileSummary extends Omit<PatchProposalFile, 'patch'> {}

export interface PatchProposalSummary {
  proposalId: string;
  runId: string;
  agentId: string;
  title: string;
  status: 'validated_locked' | 'preflight_passed_locked' | 'preflight_failed_locked' | 'applied';
  proposalSha256: string;
  receivedAt: string;
  files: PatchProposalFileSummary[];
  preflight?: {
    checkedAt: string;
    matched: boolean;
    files: Array<{
      path: string;
      expectedSha256: string;
      actualSha256: string;
      sizeBytes: number;
      matched: boolean;
    }>;
  };
  application?: {
    appliedAt: string;
    transactionId: string;
    status: string;
    files: Array<{
      path: string;
      beforeSha256: string;
      afterSha256: string;
    }>;
  };
}

/** 仅接受模型返回的完整 JSON 文本；权威路径、diff 与大小校验仍由服务端完成。 */
export function parsePatchProposalJson(text: string): PatchProposal | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.version !== PATCH_PROPOSAL_VERSION || !Array.isArray(value.files)) return null;
  if (
    !isString(value.proposalId) ||
    !isString(value.runId) ||
    !isString(value.agentId) ||
    !isString(value.title) ||
    !isString(value.createdAt) ||
    value.files.length < 1 ||
    value.files.length > 8
  ) {
    return null;
  }
  const files: PatchProposalFile[] = [];
  for (const item of value.files) {
    if (
      !isRecord(item) ||
      !isString(item.path) ||
      !/^[a-f0-9]{64}$/.test(String(item.beforeSha256 ?? '')) ||
      !/^[a-f0-9]{64}$/.test(String(item.afterSha256 ?? '')) ||
      !Number.isInteger(item.addedLines) ||
      !Number.isInteger(item.removedLines) ||
      !isString(item.patch)
    ) {
      return null;
    }
    files.push({
      path: item.path,
      beforeSha256: String(item.beforeSha256),
      afterSha256: String(item.afterSha256),
      addedLines: Number(item.addedLines),
      removedLines: Number(item.removedLines),
      patch: item.patch,
    });
  }
  return {
    version: PATCH_PROPOSAL_VERSION,
    proposalId: value.proposalId,
    runId: value.runId,
    agentId: value.agentId,
    title: value.title,
    createdAt: value.createdAt,
    files,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
