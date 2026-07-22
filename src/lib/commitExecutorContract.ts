import type {
  CommitExecutorReceiptView,
  CommitRecoveryPolicyView,
  ExecutionChainReadinessView,
  RollbackStopCheck,
} from '../types';

export const COMMIT_EXECUTOR_ALLOWED_REPO = 'D:\\Projects\\agent-hub-demo';
export const COMMIT_EXECUTOR_ALLOWED_CWD = COMMIT_EXECUTOR_ALLOWED_REPO;
export const COMMIT_EXECUTOR_APPROVAL_ID =
  'DemoScenario002-commit-executor-first-controlled-commit-approval-20990101';
export const COMMIT_EXECUTOR_APPROVED_MESSAGE = 'chore: verify commit executor smoke gate';

export const COMMIT_EXECUTOR_APPROVED_PATHS = [
  'scripts/commit-executor.mjs',
  'src/lib/commitExecutorContract.ts',
  'src/lib/pushExecutorPreflightContract.ts',
  'src/components/CommitExecutorReceiptPanel.tsx',
  'src/components/CommitRecoveryPolicyPanel.tsx',
  'src/components/PushExecutorPreflightPanel.tsx',
  'src/components/ExecutionChainReadinessPanel.tsx',
  'src/data/mockAgentHub.ts',
  'src/components/ControlConsolePanel.tsx',
  'src/types.ts',
  'src/data/writeExecutorSmokeFixture.ts',
  'src/data/multiFileWriteExecutorSmokeFixture.ts',
] as const;

export const COMMIT_EXECUTOR_COMMAND_DESCRIPTOR = [
  'git',
  'commit',
  '-m',
  COMMIT_EXECUTOR_APPROVED_MESSAGE,
] as const;

function pass(id: string, label: string, evidence: string): RollbackStopCheck {
  return {
    id,
    label,
    status: 'pass',
    evidence,
  };
}

export const commitExecutorReceiptView: CommitExecutorReceiptView = {
  receipt_id: 'DemoScenario002-COMMIT-EXECUTOR-FIRST-CONTROLLED-COMMIT-20990101',
  approval_id: COMMIT_EXECUTOR_APPROVAL_ID,
  executor_mode: 'commit_executor_v0_1',
  commit_executor_implemented: true,
  commit_executor_enabled: true,
  commit_execution_approved: true,
  commit_preflight_only: false,
  actual_commit_performed: true,
  allowed_cwd: COMMIT_EXECUTOR_ALLOWED_CWD,
  approved_message: COMMIT_EXECUTOR_APPROVED_MESSAGE,
  command_descriptor: COMMIT_EXECUTOR_COMMAND_DESCRIPTOR,
  shell: false,
  commit_all_allowed: false,
  commit_a_allowed: false,
  amend_allowed: false,
  push_permission: false,
  staged_paths_before_commit: COMMIT_EXECUTOR_APPROVED_PATHS,
  committed_files_expected: COMMIT_EXECUTOR_APPROVED_PATHS,
  committed_files_verified: COMMIT_EXECUTOR_APPROVED_PATHS,
  pre_HEAD: '8888888888888888888888888888888888888888',
  post_HEAD: 'recorded in control receipt after executor run',
  commit_hash: 'recorded in control receipt after executor run',
  status_after_commit: 'clean / staged empty',
  staged_after_commit: [],
  command_exit_code: 0,
  head_changed: true,
  exact_message_assertion: true,
  exact_files_assertion: true,
  clean_worktree_assertion: true,
  staged_empty_assertion: true,
  no_push_assertion: true,
  package_config_css_dependency_change: false,
  receipt_status: 'executed_commit_executor_single_controlled_commit',
  verification_status: 'pass',
  stop_checks: [
    pass('cwd_exact', 'cwd is approved second project', COMMIT_EXECUTOR_ALLOWED_CWD),
    pass('message_exact', 'commit message is fixed', COMMIT_EXECUTOR_APPROVED_MESSAGE),
    pass('argv_only', 'command descriptor uses argv form', COMMIT_EXECUTOR_COMMAND_DESCRIPTOR.join(' | ')),
    pass('staged_files_exact', 'staged files equal approved implementation/UI plus fixture paths', COMMIT_EXECUTOR_APPROVED_PATHS.join(', ')),
    pass('no_commit_all', 'commit all and commit -a are forbidden', 'commit_all_allowed=false; commit_a_allowed=false'),
    pass('no_amend', 'amend is forbidden', 'amend_allowed=false'),
    pass('no_push', 'push is forbidden', 'push_permission=false'),
    pass('protected_paths_unchanged', 'package/config/CSS/dependency unchanged', 'protected diff check empty'),
  ],
};

export const commitRecoveryPolicyView: CommitRecoveryPolicyView = {
  mode: 'commit_recovery_policy_only',
  summary:
    'Commit recovery is policy-only in DemoScenario002. No recovery mutation is executed after the controlled commit.',
  badCommitDetection: [
    'commit message differs from the approved fixed message',
    'committed file set differs from the approved exact-path set',
    'post-commit working tree is not clean or staged area is not empty',
    'package/config/CSS/dependency path appears in the commit',
    'push is detected after commit',
  ],
  revertVsResetPolicy: [
    'Prefer a separately approved revert commit for published or shared history.',
    'Use reset only as a separately approved local recovery operation before publication.',
    'Never use reset --hard by default because it can destroy uncommitted user work.',
  ],
  resetHardForbiddenReason:
    'reset --hard is destructive and can discard unrelated user changes; DemoScenario002 does not approve it.',
  revertExecutorRequiresSeparateApproval: true,
  recoveryReceiptRequirements: [
    'bad_commit_hash',
    'detection_reason',
    'chosen_recovery_mode',
    'approval_id',
    'pre_HEAD',
    'post_HEAD',
    'recovered_files',
    'final_status',
    'push_status',
  ],
  DemoScenario003Scope: [
    'first revert executor approval packet if needed',
    'bad commit recovery execution only after separate approval',
    'push gate remains a separate DemoScenario003+ decision',
  ],
  forbiddenActions: [
    'reset --hard',
    'automatic revert',
    'amend',
    'rebase',
    'push',
    'recovery executor execution without separate approval',
  ],
};

export const commitExecutionChainReadinessView: ExecutionChainReadinessView = {
  chain_id: 'DemoScenario002-execution-chain-closeout',
  readiness_status: 'commit_executor_first_run_pass_push_gate_locked',
  summary:
    'DemoScenario002 completes the first controlled commit executor run and leaves push locked behind a separate DemoScenario003+ approval gate.',
  maturity: [
    {
      layer: 'read-only metadata executor',
      status: 'stable',
      evidence: 'repeated metadata execution and receipt diff consistency passed in prior goals',
    },
    {
      layer: 'build executor',
      status: 'first run pass',
      evidence: 'build receipt remains pass; DemoScenario002 build exit 0',
    },
    {
      layer: 'selected-path write',
      status: 'single + multi pass',
      evidence: 'DemoScenario002 adds only approved tiny fixture deltas',
    },
    {
      layer: 'stage executor',
      status: 'first stage pass reused',
      evidence: 'stage executor stages only approved fixture targets before commit staging gate',
    },
    {
      layer: 'commit executor',
      status: 'first controlled commit pass',
      evidence: 'executed_commit_executor_single_controlled_commit',
    },
    {
      layer: 'commit recovery',
      status: 'policy only',
      evidence: 'bad commit handling policy recorded; no recovery mutation executed',
    },
    {
      layer: 'push executor',
      status: 'disabled preflight only',
      evidence: 'push_executor_enabled=false; actual_push_performed=false',
    },
  ],
  next_decision: 'DemoScenario003 push executor first approval packet / needs_user_decision',
  forbiddenCarryover: [
    'push',
    'push executor implementation',
    'commit -a',
    'amend',
    'reset --hard',
    'package/config/CSS/dependency change',
    'private knowledge base read/write/sync',
    'real data read',
  ],
};
