import type {
  ReadonlyMetadataCommandDescriptor,
  ReadonlyMetadataHardeningScenario,
  ReadonlyMetadataExecutorPrototypeView,
  ReadonlyMetadataReceiptPreview,
  ReadonlyMetadataStopRetryPolicyItem,
} from '../types';

export const READONLY_METADATA_ALLOWED_REPO = 'D:\\Projects\\agent-hub-demo';
export const READONLY_METADATA_ALLOWED_CWD = READONLY_METADATA_ALLOWED_REPO;

export const READONLY_METADATA_COMMAND_ALLOWLIST: readonly ReadonlyMetadataCommandDescriptor[] = [
  {
    id: 'git_status_short',
    label: 'git status --short',
    executable: 'git',
    argv: ['status', '--short'],
    shell: false,
    cwdPolicy: 'fixed_allowed_cwd',
    mutationRisk: 'read_only_metadata',
    purpose: 'Summarize dirty/untracked state without changing files.',
  },
  {
    id: 'git_status_branch',
    label: 'git status -sb',
    executable: 'git',
    argv: ['status', '-sb'],
    shell: false,
    cwdPolicy: 'fixed_allowed_cwd',
    mutationRisk: 'read_only_metadata',
    purpose: 'Capture current branch and short status without mutation.',
  },
  {
    id: 'git_rev_parse_head',
    label: 'git rev-parse HEAD',
    executable: 'git',
    argv: ['rev-parse', 'HEAD'],
    shell: false,
    cwdPolicy: 'fixed_allowed_cwd',
    mutationRisk: 'read_only_metadata',
    purpose: 'Capture HEAD commit for receipt matching.',
  },
  {
    id: 'git_branch_show_current',
    label: 'git branch --show-current',
    executable: 'git',
    argv: ['branch', '--show-current'],
    shell: false,
    cwdPolicy: 'fixed_allowed_cwd',
    mutationRisk: 'read_only_metadata',
    purpose: 'Capture current branch name for scope validation.',
  },
  {
    id: 'git_diff_cached_name_only',
    label: 'git diff --cached --name-only',
    executable: 'git',
    argv: ['diff', '--cached', '--name-only'],
    shell: false,
    cwdPolicy: 'fixed_allowed_cwd',
    mutationRisk: 'read_only_metadata',
    purpose: 'Confirm staged area contents without staging or unstaging.',
  },
];

export const READONLY_METADATA_FORBIDDEN_ACTIONS = [
  'shell mode',
  'command concatenation',
  'pipe or redirect',
  'glob expansion',
  'fallback command',
  'write',
  'stage',
  'commit',
  'push',
  'npm',
  'dependency install',
  'backend filesystem read',
  'local path traversal',
  'private knowledge base action',
] as const;

export const READONLY_METADATA_STOP_RETRY_POLICY: readonly ReadonlyMetadataStopRetryPolicyItem[] = [
  {
    condition: 'command mismatch',
    receipt_status: 'blocked_command_mismatch',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Requested command IDs must exactly match the hardcoded allowlist descriptors.',
  },
  {
    condition: 'cwd mismatch',
    receipt_status: 'blocked_cwd_mismatch',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Execution cwd must equal the single fixed allowed cwd.',
  },
  {
    condition: 'dirty repo',
    receipt_status: 'blocked_dirty_repo',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Preflight status must be empty before execution proceeds.',
  },
  {
    condition: 'staged files',
    receipt_status: 'blocked_staged_files',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Preflight staged file list must be empty before execution proceeds.',
  },
  {
    condition: 'command timeout',
    receipt_status: 'failed_command_timeout',
    outcome: 'failed',
    retry: 'manual_reauthorization_required',
    evidence: 'Timeout failure stops the run; any retry needs a new user decision.',
  },
  {
    condition: 'command exit nonzero',
    receipt_status: 'failed_command_exit_nonzero',
    outcome: 'failed',
    retry: 'not_automatic',
    evidence: 'Nonzero exit creates a failed receipt and no automatic retry.',
  },
  {
    condition: 'receipt missing fields',
    receipt_status: 'unverifiable_missing_receipt_fields',
    outcome: 'unverifiable',
    retry: 'not_allowed',
    evidence: 'Receipt QA requires all mandatory fields before success can be claimed.',
  },
  {
    condition: 'pre/post HEAD mismatch',
    receipt_status: 'blocked_head_mismatch',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'HEAD must remain unchanged through execution.',
  },
  {
    condition: 'pre/post status unexpected',
    receipt_status: 'blocked_status_unexpected',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Post status and staged state must match the clean preflight.',
  },
  {
    condition: 'redaction failure',
    receipt_status: 'blocked_redaction_failure',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Receipt output must be summarizable without secrets, raw data, or out-of-scope paths.',
  },
];

export const READONLY_METADATA_RECEIPT_QA_FIELDS = [
  'approval_id',
  'executor_mode',
  'allowed_cwd',
  'requested_commands',
  'executed_commands',
  'exit_codes',
  'baseline/current HEAD',
  'branch',
  'status summary',
  'staged summary',
  'zero_mutation_assertion',
  'receipt_status',
  'stop_checks',
  'redaction_status',
] as const;

export const READONLY_METADATA_HARDENING_SCENARIOS: readonly ReadonlyMetadataHardeningScenario[] =
  READONLY_METADATA_STOP_RETRY_POLICY.map(({ condition, outcome, retry }) => ({
    scenario: condition,
    outcome,
    retry,
  }));

export function createReadonlyMetadataReceiptPreview(): ReadonlyMetadataReceiptPreview {
  return {
    receipt_status: 'not_executed_prototype',
    prototype_implemented: true,
    prototype_executed: false,
    executor_executed: false,
    allowed_repo: READONLY_METADATA_ALLOWED_REPO,
    allowed_cwd: READONLY_METADATA_ALLOWED_CWD,
    allowed_commands_count: READONLY_METADATA_COMMAND_ALLOWLIST.length,
    executed_command_count: 0,
    files_changed_count: 0,
    no_file_change_assertion: true,
    command_results: [],
    redaction_hooks: [
      'summarize stdout/stderr before UI display',
      'redact absolute paths outside the fixed allowed repo',
      'redact secrets, tokens, caches, exports, and raw local data references',
    ],
    output_summary_placeholder:
      'No command output exists in DemoScenario040 because the prototype has not been executed.',
    stop_condition:
      'Stop before execution when command, cwd, dirty state, staged state, mutation, redaction, or receipt QA checks fail.',
    stop_retry_policy: READONLY_METADATA_STOP_RETRY_POLICY,
    receipt_qa_required_fields: READONLY_METADATA_RECEIPT_QA_FIELDS,
    hardening_scenarios: READONLY_METADATA_HARDENING_SCENARIOS,
  };
}

export const readonlyMetadataExecutorPrototypeView: ReadonlyMetadataExecutorPrototypeView = {
  readonly_metadata_executor_prototype: true,
  prototype_implemented: true,
  prototype_executed: false,
  executor_executed: false,
  allowedRepo: READONLY_METADATA_ALLOWED_REPO,
  allowedCwd: READONLY_METADATA_ALLOWED_CWD,
  allowedCommands: READONLY_METADATA_COMMAND_ALLOWLIST,
  allowedCommandsCount: READONLY_METADATA_COMMAND_ALLOWLIST.length,
  shellMode: false,
  writePermission: false,
  stagePermission: false,
  commitPermission: false,
  pushPermission: false,
  npmPermission: false,
  backendFsPermission: false,
  localPathReadPermission: false,
  receiptPreview: createReadonlyMetadataReceiptPreview(),
  statusMessage: 'Prototype exists but has not been executed',
  nextGateMessage: 'DemoScenario043 hardening keeps write executor and push blocked',
  safetyNotes: [
    'Stop/retry policy blocks command mismatch, cwd mismatch, dirty repo, staged files, mutation, missing receipt fields, and redaction failure.',
    'Timeout failures require manual reauthorization before retry.',
    'Nonzero command exits create failed receipts and no automatic retry.',
    'The allowlist contains only read-only git metadata commands.',
    'Write, stage, commit, push, npm, backend fs, and local path reads remain forbidden.',
  ],
  forbiddenActions: READONLY_METADATA_FORBIDDEN_ACTIONS,
};
