import type {
  ExecutionChainReadinessView,
  RollbackStopCheck,
  StageExecutorReceiptView,
  StageExecutorView,
  StageRecoveryReceiptView,
} from '../types';

export const STAGE_EXECUTOR_ALLOWED_REPO = 'D:\\Projects\\agent-hub-demo';
export const STAGE_EXECUTOR_ALLOWED_CWD = STAGE_EXECUTOR_ALLOWED_REPO;
export const STAGE_EXECUTOR_APPROVAL_ID = 'DemoScenario059r-stage-executor-first-run-approval-20990101';

export const STAGE_EXECUTOR_TARGETS = [
  'src/data/writeExecutorSmokeFixture.ts',
  'src/data/multiFileWriteExecutorSmokeFixture.ts',
] as const;

export const STAGE_EXECUTOR_COMMAND_DESCRIPTOR = [
  'git',
  'add',
  '--',
  ...STAGE_EXECUTOR_TARGETS,
] as const;

export const STAGE_RECOVERY_COMMAND_DESCRIPTOR = [
  'git',
  'reset',
  '--',
  ...STAGE_EXECUTOR_TARGETS,
] as const;

function pass(id: string, label: string, evidence: string): RollbackStopCheck {
  return {
    id,
    label,
    status: 'pass',
    evidence,
  };
}

export const stageExecutorView: StageExecutorView = {
  stage_executor_v0_1: true,
  stage_executor_implemented: true,
  stage_execution_approved: true,
  allowed_cwd: STAGE_EXECUTOR_ALLOWED_CWD,
  allowed_paths: STAGE_EXECUTOR_TARGETS,
  command_descriptor: STAGE_EXECUTOR_COMMAND_DESCRIPTOR,
  shell: false,
  git_add_dot_allowed: false,
  directory_stage_allowed: false,
  glob_stage_allowed: false,
  file_content_mutation_allowed: false,
  package_config_css_dependency_change_allowed: false,
  commit_permission: false,
  push_permission: false,
  current_execution_blocked: false,
  current_blocker:
    'Resolved by explicit DemoScenario059r fixture delta on the two approved stage targets.',
  summary:
    'Stage executor v0.1 is implemented and executed with exact-path argv only. DemoScenario059r unblocked the clean-target issue with a tiny approved fixture delta.',
  stopConditions: [
    'cwd is not the approved repo',
    'requested paths differ from the two approved fixture paths',
    'git add . is requested',
    'directory-level or glob staging is requested',
    'shell string or command concatenation is requested',
    'stage result does not exactly equal the approved paths',
    'package/config/CSS/dependency diff appears',
    'commit or push is requested',
  ],
};

export const stageExecutorReceiptView: StageExecutorReceiptView = {
  receipt_id: 'DemoScenario059r-STAGE-EXECUTOR-FIRST-RUN-20990101',
  approval_id: STAGE_EXECUTOR_APPROVAL_ID,
  executor_mode: 'stage_executor_v0_1',
  allowed_cwd: STAGE_EXECUTOR_ALLOWED_CWD,
  requested_paths: STAGE_EXECUTOR_TARGETS,
  staged_paths: STAGE_EXECUTOR_TARGETS,
  pre_status: 'approved fixture delta present; staged empty before stage executor',
  post_status: 'staged exactly the two approved fixture targets; implementation files remained unstaged',
  pre_HEAD: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  post_HEAD: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  command_exit_code: 0,
  exact_path_assertion: true,
  no_git_add_dot_assertion: true,
  no_commit_push_assertion: true,
  package_config_css_dependency_change: false,
  receipt_status: 'executed_stage_executor_two_files',
  verification_status: 'pass',
  blocker_summary:
    'Original clean-target blocker was resolved by the explicit fixture delta. Stage executor staged only the two approved fixture paths.',
  stop_checks: [
    pass('allowed_paths_exact', 'requested paths are exact approved fixture paths', STAGE_EXECUTOR_TARGETS.join(', ')),
    pass('argv_descriptor_only', 'command descriptor uses argv form', STAGE_EXECUTOR_COMMAND_DESCRIPTOR.join(' | ')),
    pass('no_git_add_dot', 'git add dot is not used', 'git add -- <path1> <path2> only'),
    pass('staged_paths_exact', 'staged paths equal approved paths', STAGE_EXECUTOR_TARGETS.join(', ')),
    pass('implementation_files_unstaged', 'stage executor did not stage implementation files', 'only fixture paths appeared in cached name-only output'),
    pass('no_commit_push', 'commit and push are not allowed', 'commit_permission=false; push_permission=false'),
    pass('protected_paths_unchanged', 'package/config/CSS/dependency unchanged', 'protected diff check empty'),
  ],
};

export const stageRecoveryReceiptView: StageRecoveryReceiptView = {
  receipt_id: 'DemoScenario059r-STAGE-RECOVERY-UNSTAGE-20990101',
  approval_id: 'DemoScenario059r-stage-recovery-approval-20990101',
  executor_mode: 'stage_recovery_unstage_v0_1',
  allowed_cwd: STAGE_EXECUTOR_ALLOWED_CWD,
  requested_paths: STAGE_EXECUTOR_TARGETS,
  unstaged_paths: STAGE_EXECUTOR_TARGETS,
  staged_after_recovery: [],
  command_descriptor: STAGE_RECOVERY_COMMAND_DESCRIPTOR,
  command_exit_code: 0,
  head_changed: false,
  file_content_changed: false,
  package_config_css_dependency_change: false,
  receipt_status: 'executed_stage_recovery_unstage_two_files',
  verification_status: 'pass',
  summary:
    'Stage recovery executed git reset -- exact approved fixture paths only. Staged area returned to empty and fixture content stayed dirty for the later manual commit gate.',
  stop_checks: [
    pass('recovery_command_exact', 'recovery command is exact-path reset', STAGE_RECOVERY_COMMAND_DESCRIPTOR.join(' | ')),
    pass('no_hard_reset', 'git reset --hard is not used', 'false'),
    pass('no_file_restore', 'file content restore is not used', 'false'),
    pass('staged_empty_after_recovery', 'staged area is empty after recovery', 'cached name-only output empty'),
    pass('fixture_content_preserved', 'fixture content stayed dirty after recovery', 'working tree still shows the two fixture files modified'),
  ],
};

export const executionChainReadinessView: ExecutionChainReadinessView = {
  chain_id: 'DemoScenario059-execution-chain-readiness',
  readiness_status: 'ready_for_commit_gate_planning',
  summary:
    'DemoScenario059r resolves the clean-target blocker with explicit fixture deltas, proves first exact-path stage execution, and proves exact-path unstage recovery. Commit executor remains preflight-only.',
  maturity: [
    {
      layer: 'read-only metadata executor',
      status: 'stable',
      evidence: 'repeated metadata execution and receipt diff consistency passed in prior goals',
    },
    {
      layer: 'build executor',
      status: 'first run pass',
      evidence: 'DemoScenario056 build executor receipt executed_build_executor_passed',
    },
    {
      layer: 'selected-path write',
      status: 'single + multi pass',
      evidence: 'single-file and multi-file fixture writes passed with postimage hashes',
    },
    {
      layer: 'rollback/recovery',
      status: 'rollback + recovery pass',
      evidence: 'rollback and recovery re-apply goals closed',
    },
    {
      layer: 'stage executor',
      status: 'first stage + unstage recovery pass',
      evidence: 'executed_stage_executor_two_files and executed_stage_recovery_unstage_two_files',
    },
    {
      layer: 'commit executor',
      status: 'preflight only',
      evidence: 'disabled commit preflight contract only; actual commit executor remains false',
    },
    {
      layer: 'push executor',
      status: 'not started',
      evidence: 'push_permission=false',
    },
  ],
  next_decision:
    'DemoScenario001 commit executor first approval packet / needs_user_decision',
  forbiddenCarryover: [
    'commit executor execution',
    'push',
    'git add .',
    'directory-level stage',
    'package/config/CSS/dependency change',
    'private knowledge base read/write/sync',
    'real data read',
  ],
};
