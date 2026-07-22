import type {
  MultiFileWriteApprovalPacket,
  MultiFileWriteExecutorView,
  MultiFileWriteReceiptView,
  RollbackStopCheck,
} from '../types';

export const MULTIFILE_WRITE_ALLOWED_REPO = 'D:\\Projects\\agent-hub-demo';
export const MULTIFILE_WRITE_ALLOWED_CWD = MULTIFILE_WRITE_ALLOWED_REPO;

export const MULTIFILE_WRITE_TARGETS = [
  'src/data/writeExecutorSmokeFixture.ts',
  'src/data/multiFileWriteExecutorSmokeFixture.ts',
] as const;

export const MULTIFILE_WRITE_POSTIMAGE_HASHES = [
  {
    path: 'src/data/writeExecutorSmokeFixture.ts',
    sha256: 'C9DBAD8062EBCAF35077AB0CC28514718F112B002B5FEE9A825FF746F587A352',
  },
  {
    path: 'src/data/multiFileWriteExecutorSmokeFixture.ts',
    sha256: '5AC85E6965D7D7B2DF794B5C124C3572018FDDC7A6A59076DAFC1E24C5F81F6F',
  },
] as const;

export const MULTIFILE_WRITE_FILE_SIZES = [
  {
    path: 'src/data/writeExecutorSmokeFixture.ts',
    bytes: 625,
  },
  {
    path: 'src/data/multiFileWriteExecutorSmokeFixture.ts',
    bytes: 339,
  },
] as const;

function pass(id: string, label: string, evidence: string): RollbackStopCheck {
  return {
    id,
    label,
    status: 'pass',
    evidence,
  };
}

export const multiFileWriteApprovalPacket: MultiFileWriteApprovalPacket = {
  approval_id: 'DemoScenario057-multifile-selected-path-write-approval-20990101',
  executor_mode: 'selected_path_write_two_files',
  allowed_repo: MULTIFILE_WRITE_ALLOWED_REPO,
  allowed_cwd: MULTIFILE_WRITE_ALLOWED_CWD,
  allowed_target_paths: MULTIFILE_WRITE_TARGETS,
  max_files: 2,
  max_bytes_total: 2048,
  max_bytes_per_file: 1024,
  expected_diff_summary:
    'Add multiFileWriteCheck to existing write fixture and create one additional small fixture file.',
  preimage_required: true,
  postimage_required: true,
  rollback_strategy:
    'Remove multiFileWriteCheck and delete multiFileWriteExecutorSmokeFixture.ts in a separately approved rollback gate.',
  human_review_required: true,
  pro_gate_required: true,
  stop_conditions: [
    'target paths are not exact',
    'changed files are not exactly the two approved target paths',
    'total bytes exceed 2048',
    'any file exceeds 1024 bytes',
    'package/config/CSS/dependency is touched',
    'stage/commit/push executor is requested',
    'human review or Pro gate is missing',
  ],
};

export const multiFileWriteReceipt: MultiFileWriteReceiptView = {
  receipt_id: 'DemoScenario057-MULTIFILE-WRITE-20990101',
  approval_id: multiFileWriteApprovalPacket.approval_id,
  executor_mode: 'selected_path_write_two_files',
  target_paths: MULTIFILE_WRITE_TARGETS,
  changed_files: MULTIFILE_WRITE_TARGETS,
  file_sizes: MULTIFILE_WRITE_FILE_SIZES,
  postimage_hashes: MULTIFILE_WRITE_POSTIMAGE_HASHES,
  total_bytes: 964,
  diff_summary:
    'Updated writeExecutorSmokeFixture.ts with multiFileWriteCheck and created multiFileWriteExecutorSmokeFixture.ts.',
  staged_status: 'empty_before_manual_commit',
  head_changed_by_executor: false,
  package_config_css_dependency_change: false,
  receipt_status: 'executed_selected_path_write_two_files',
  verification_status: 'pass',
  zero_extra_mutation_assertion: true,
};

export const multiFileWriteView: MultiFileWriteExecutorView = {
  multi_file_selected_path_write: true,
  write_executor_enabled: true,
  write_execution_approved: true,
  actual_write_performed: true,
  max_files: 2,
  max_bytes_total: 2048,
  stage_permission: false,
  commit_permission: false,
  push_permission: false,
  summary:
    'DemoScenario057 proves the first controlled two-file selected-path write while keeping stage/commit/push forbidden.',
  approvalPacket: multiFileWriteApprovalPacket,
  receipt: multiFileWriteReceipt,
  preflightChecks: [
    pass('target_paths_exact', 'target paths are exact', MULTIFILE_WRITE_TARGETS.join(', ')),
    pass('max_files_two', 'max_files=2', '2/2'),
    pass('bytes_within_limit', 'total bytes <= 2048 and each file <= 1024', '964/2048 total'),
    pass('human_review_required', 'human review required', 'true'),
    pass('pro_gate_required', 'Pro gate required', 'true'),
    pass('stage_commit_push_forbidden', 'stage/commit/push forbidden', 'false/false/false'),
  ],
};
