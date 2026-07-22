import type {
  SelectedPathWriteApprovalPacket,
  SelectedPathWriteExecutorPrototypeView,
  SelectedPathWriteTargetMetadata,
  WriteExecutorBoundaryView,
} from '../types';
import { runSelectedPathWritePreflight } from './selectedPathWritePreflight';

export const SELECTED_PATH_WRITE_ALLOWED_REPO = 'D:\\Projects\\agent-hub-demo';
export const SELECTED_PATH_WRITE_ALLOWED_CWD = SELECTED_PATH_WRITE_ALLOWED_REPO;
export const SELECTED_PATH_WRITE_FIXTURE_TARGET = 'src/components/SelectedFileImportPanel.tsx';

export const SELECTED_PATH_WRITE_FORBIDDEN_PATHS = [
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

export const selectedPathWriteTargetMetadata: SelectedPathWriteTargetMetadata = {
  path: SELECTED_PATH_WRITE_FIXTURE_TARGET,
  byteSize: 11672,
  preimageSha256: '5E4BF9F9EE5461F2927025451635FC6914E3F5704200B5F35AEEB64F20356101',
  metadataSource: 'DemoScenario045 approved fixture target metadata check; no body read in UI, no mutation',
};

export const selectedPathWriteApprovalPacket: SelectedPathWriteApprovalPacket = {
  approval_id: 'DemoScenario045-selected-path-write-preflight-dryrun-20990101',
  executor_mode: 'selected_path_write_candidate',
  allowed_repo: SELECTED_PATH_WRITE_ALLOWED_REPO,
  allowed_cwd: SELECTED_PATH_WRITE_ALLOWED_CWD,
  allowed_target_paths: [SELECTED_PATH_WRITE_FIXTURE_TARGET],
  forbidden_paths: SELECTED_PATH_WRITE_FORBIDDEN_PATHS,
  max_files: 1,
  max_bytes: 20000,
  expected_diff_summary:
    'DemoScenario045 validates only the selected-path write preflight. Future DemoScenario046 may approve the first exact target packet; DemoScenario047 is required before any selected-path write execution.',
  preimage_required: true,
  postimage_required: true,
  rollback_strategy:
    'Use recorded preimage hash and human-reviewed recovery instructions; do not execute rollback automatically.',
  stop_conditions: [
    'approval_id missing',
    'allowed_repo or allowed_cwd mismatch',
    'target path not approved',
    'target path matches forbidden paths',
    'max_files or max_bytes exceeded',
    'preimage hash missing',
    'expected diff summary missing',
    'rollback strategy missing',
    'human review missing',
    'Pro gate missing',
    'mutation expectation not zero',
  ],
  human_review_required: true,
  pro_gate_required: true,
  mutation_expectation: 'zero',
};

export const selectedPathWritePreflightReceipt = runSelectedPathWritePreflight({
  packet: selectedPathWriteApprovalPacket,
  targetMetadata: selectedPathWriteTargetMetadata,
  expectedRepo: SELECTED_PATH_WRITE_ALLOWED_REPO,
  expectedCwd: SELECTED_PATH_WRITE_ALLOWED_CWD,
});

export const selectedPathWriteExecutorPrototypeView: SelectedPathWriteExecutorPrototypeView = {
  selected_path_write_executor_candidate: true,
  write_executor_enabled: false,
  write_execution_approved: false,
  preflight_only: true,
  actual_write_performed: false,
  stage_permission: false,
  commit_permission: false,
  push_permission: false,
  npm_permission: false,
  package_config_css_dependency_change: false,
  disabled_reason:
    'Disabled prototype only: preflight validates approval packet evidence and cannot write, stage, commit, push, run npm, or mutate files.',
  approvalPacket: selectedPathWriteApprovalPacket,
  targetMetadata: selectedPathWriteTargetMetadata,
  implementationPlan: [
    'Keep selected-path write as a separate executor class from read-only metadata execution.',
    'Accept only a user-approved packet with exact repo-relative file paths.',
    'Run preflight-only checks before any future write capability exists.',
    'Require preimage hash, expected diff summary, rollback strategy, human review, and Pro gate.',
    'Emit a zero-write receipt in DemoScenario045; first target approval must wait for DemoScenario046.',
    'First selected-path write execution must wait for DemoScenario047 and a new receipt gate.',
  ],
  nextGateMessages: [
    'Preflight passed does not authorize write',
    'DemoScenario046 required for first write target approval',
    'DemoScenario047 required for first selected-path write execution',
  ],
};

export const selectedPathWriteBoundaryView: WriteExecutorBoundaryView = {
  boundaryMode: 'selected_path_write_preflight_only',
  summary:
    'DemoScenario045 creates a disabled prototype and zero-write preflight validator only. Passing preflight does not unlock mutation.',
  allowedNow: [
    'display disabled write executor prototype',
    'validate approval packet shape',
    'validate one exact approved fixture target path',
    'record preimage hash status and expected diff status',
    'record rollback strategy and review gates',
    'emit zero-write preflight receipt',
  ],
  forbiddenNow: [
    'real write',
    'write executor mutation',
    'stage/commit/push executor action',
    'npm install/update',
    'package/config/CSS/dependency change',
    'broad filesystem read',
    'directory traversal',
    'private knowledge base read/write/sync',
    'real data read',
    'automatic rollback execution',
  ],
  futureGoalGates: [
    'DemoScenario046 required for first write target approval',
    'DemoScenario047 required for first selected-path write execution',
    'Pro final closeout required before any future mutation gate',
  ],
  stopConditions: selectedPathWriteApprovalPacket.stop_conditions,
};
