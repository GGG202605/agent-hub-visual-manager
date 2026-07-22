import type {
  RollbackApprovalPacket,
  RollbackRecoveryCloseoutView,
  RollbackRecoveryPolicyView,
  RollbackRecoveryPrototypeView,
  RollbackReceiptTemplate,
  RollbackTargetMetadata,
} from '../types';
import {
  runRollbackRecoveryPreflight,
  validateRollbackReceiptTemplate,
} from './rollbackRecoveryPreflight';

export const ROLLBACK_ALLOWED_REPO = 'D:\\Projects\\agent-hub-demo';
export const ROLLBACK_ALLOWED_CWD = ROLLBACK_ALLOWED_REPO;
export const ROLLBACK_FIXTURE_TARGET = 'src/data/writeExecutorSmokeFixture.ts';
export const ROLLBACK_PREIMAGE_HASH =
  'CCB26DD1001D82F9B7D1D945ABADD5A12456210C2D0FD45752953B66A004ADB6';
export const ROLLBACK_CURRENT_HASH =
  '9802375E224067C9C2E0C50A04129877E65D592661B88E1FB3FB7228E8DF3026';

export const ROLLBACK_FORBIDDEN_PATHS = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'vite.config.*',
  'tsconfig*.json',
  'src/**/*.css',
  'dist/**',
  'build/**',
  'node_modules/**',
  '.git/**',
  '.env*',
] as const;

export const rollbackTargetMetadata: RollbackTargetMetadata = {
  path: ROLLBACK_FIXTURE_TARGET,
  currentByteSize: 584,
  currentHash: ROLLBACK_CURRENT_HASH,
  preimageByteSize: 456,
  preimageHash: ROLLBACK_PREIMAGE_HASH,
  expectedPostRollbackHash: ROLLBACK_PREIMAGE_HASH,
  metadataSource:
    'DemoScenario049 selected-path write v0.1 closeout receipt; metadata only, no fixture mutation in DemoScenario051',
};

export const rollbackApprovalPacket: RollbackApprovalPacket = {
  approval_id: 'DemoScenario051-rollback-recovery-preflight-approval-20990101',
  rollback_mode: 'selected_path_rollback_preflight',
  allowed_repo: ROLLBACK_ALLOWED_REPO,
  allowed_cwd: ROLLBACK_ALLOWED_CWD,
  allowed_target_paths: [ROLLBACK_FIXTURE_TARGET],
  forbidden_paths: ROLLBACK_FORBIDDEN_PATHS,
  rollback_type: 'restore_preimage',
  preimage_hash: ROLLBACK_PREIMAGE_HASH,
  current_hash: ROLLBACK_CURRENT_HASH,
  expected_post_rollback_hash: ROLLBACK_PREIMAGE_HASH,
  max_files: 1,
  max_bytes: 1024,
  human_review_required: true,
  pro_gate_required: true,
  stop_conditions: [
    'approval_id missing',
    'rollback target is not an exact file path',
    'rollback target not listed in allowed_target_paths',
    'rollback target matches forbidden paths',
    'rollback_type is not restore_preimage or delete_created_file',
    'preimage/current/expected hash missing',
    'max_files is not 1',
    'max_bytes exceeded',
    'human review missing',
    'Pro gate missing',
    'mutation expectation is not zero for preflight',
    'actual_rollback_performed is not false',
  ],
  mutation_expectation: 'zero_for_preflight',
  actual_rollback_performed: false,
};

export const rollbackReceiptTemplate: RollbackReceiptTemplate = {
  approval_id: rollbackApprovalPacket.approval_id,
  rollback_mode: rollbackApprovalPacket.rollback_mode,
  target_paths: rollbackApprovalPacket.allowed_target_paths,
  pre_rollback_hash: ROLLBACK_CURRENT_HASH,
  post_rollback_hash: ROLLBACK_PREIMAGE_HASH,
  changed_files: [],
  diff_summary: 'preflight-only receipt template; no rollback execution and no changed files',
  zero_extra_mutation_assertion: true,
  staged_status: 'empty',
  receipt_status: 'preflight_only_not_executed',
  verification_status: 'validated_template_only',
  recovery_note:
    'DemoScenario052 must provide separate user approval and Pro gate before any rollback mutation can occur.',
};

export const rollbackPreflightReceipt = runRollbackRecoveryPreflight({
  packet: rollbackApprovalPacket,
  targetMetadata: rollbackTargetMetadata,
  expectedRepo: ROLLBACK_ALLOWED_REPO,
  expectedCwd: ROLLBACK_ALLOWED_CWD,
});

export const rollbackReceiptValidatorEvidence = validateRollbackReceiptTemplate({
  packet: rollbackApprovalPacket,
  receipt: rollbackReceiptTemplate,
});

export const rollbackRecoveryPolicyView: RollbackRecoveryPolicyView = {
  rollback_recovery_candidate: true,
  rollback_execution_approved: false,
  rollback_executor_enabled: false,
  rollback_preflight_only: true,
  actual_rollback_performed: false,
  stage_permission: false,
  commit_permission: false,
  push_permission: false,
  summary:
    'Rollback/recovery v0.1 is a disabled preflight package only. Planning and receipt validation do not authorize rollback execution.',
  policyPoints: [
    'rollback planning does not equal rollback execution',
    'rollback execution is mutation and risk is not lower than selected-path write',
    'rollback v0.1 only allows selected-path rollback',
    'rollback target must come from an approval packet',
    'rollback may only restore an approved preimage or delete an approved created file',
    'rollback execution requires separate user approval and Pro gate',
  ],
  allowedRollbackTypes: [
    'restore approved preimage',
    'delete approved created file',
  ],
  forbiddenActions: [
    'stage',
    'commit',
    'push',
    'directory restore',
    'bulk restore',
    'auto scan restore',
    'package/config/CSS/dependency change',
    'broad fs read',
    'private knowledge base write',
    'real data read',
  ],
  executionGateMessages: [
    'Rollback preflight passed does not authorize rollback execution',
    'DemoScenario052 required for first rollback execution approval',
    'Rollback execution is mutation and requires separate Pro gate',
  ],
};

export const rollbackRecoveryPrototypeView: RollbackRecoveryPrototypeView = {
  prototype_id: 'DemoScenario051-rollback-disabled-prototype',
  rollback_recovery_candidate: true,
  rollback_executor_enabled: false,
  rollback_execution_approved: false,
  rollback_preflight_only: true,
  actual_rollback_performed: false,
  stage_permission: false,
  commit_permission: false,
  push_permission: false,
  approvalPacket: rollbackApprovalPacket,
  targetMetadata: rollbackTargetMetadata,
  implementationPlan: [
    'Render policy and approval packet evidence only.',
    'Validate exact rollback target, hashes, max_files, max_bytes, human review, and Pro gate.',
    'Emit preflight-only receipt with actual_rollback_performed=false.',
    'Validate receipt requirements without restoring or deleting files.',
    'Keep DemoScenario052 as the first possible rollback execution approval gate.',
  ],
  disabledReason:
    'Disabled rollback prototype only: no restore, delete, write, stage, commit, push, npm, Wiki, or broad filesystem action exists.',
};

export const rollbackPreflightView = {
  mode: 'rollback_recovery_preflight_only' as const,
  summary:
    'DemoScenario051 validates rollback approval packet and receipt requirements against the known fixture hashes, with zero mutation.',
  receipt: rollbackPreflightReceipt,
  packet: rollbackApprovalPacket,
  targetMetadata: rollbackTargetMetadata,
  receiptTemplate: rollbackReceiptTemplate,
  validatorEvidence: rollbackReceiptValidatorEvidence,
  zeroMutationEvidence: [
    'rollback_preflight_only=true',
    'actual_rollback_performed=false',
    'rollback_execution_approved=false',
    'rollback_executor_enabled=false',
    'stage_permission=false',
    'commit_permission=false',
    'push_permission=false',
    'changed_files=[] in receipt template',
    'mutation_expectation=zero_for_preflight',
  ],
};

export const rollbackRecoveryCloseoutView: RollbackRecoveryCloseoutView = {
  status: 'rollback_recovery_v0_1_preflight_closed',
  summary:
    'Rollback/recovery v0.1 is closed as policy, disabled prototype, preflight validator, and receipt validator only.',
  completedScope: [
    'rollback policy',
    'recovery policy',
    'rollback approval packet schema',
    'rollback receipt requirements',
    'disabled rollback prototype UI',
    'rollback preflight validator',
    'rollback receipt validator',
    'rollback preflight receipt',
  ],
  remainingBoundaries: [
    'rollback execution approved=false',
    'actual_rollback_performed=false',
    'fixture content unchanged',
    'write executor mutation=false',
    'stage/commit/push executor=false',
    'package/config/CSS/dependency change=false',
    'private knowledge base=false',
    'real data=false',
  ],
  DemoScenario052Scope: [
    'first rollback execution approval packet only',
    'selected-path rollback only',
    'single target file only',
    'separate user approval required',
    'separate Pro gate required',
    'no stage/commit/push executor',
    'no automatic rollback',
  ],
  nextDecision:
    'DemoScenario052 first rollback execution approval packet / needs_user_decision; no rollback execution is approved by DemoScenario051.',
};
