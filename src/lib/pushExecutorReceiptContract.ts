import type {
  FinalExecutionChainCloseoutView,
  PushExecutorReceiptView,
  PushRemoteVerificationView,
  RollbackStopCheck,
} from '../types';
import { pushExecutorContractView } from './pushExecutorContract';

function pass(id: string, label: string, evidence: string): RollbackStopCheck {
  return { id, label, status: 'pass', evidence };
}

function blocked(id: string, label: string, evidence: string): RollbackStopCheck {
  return { id, label, status: 'blocked', evidence };
}

export const pushExecutorReceiptView: PushExecutorReceiptView = {
  receipt_id: 'DemoScenario006-PUSH-EXECUTOR-RECEIPT-BLOCKED',
  approval_id: pushExecutorContractView.approvalPacket.approval_id,
  executor_mode: 'push_executor_v0_1',
  receipt_status: 'blocked_missing_remote_target',
  push_executor_implemented: true,
  push_execution_approved: false,
  actual_push_performed: false,
  allowed_cwd: pushExecutorContractView.allowed_cwd,
  approved_HEAD: pushExecutorContractView.approved_HEAD,
  pre_HEAD: '9999999999999999999999999999999999999999',
  post_HEAD: '9999999999999999999999999999999999999999',
  branch: 'master',
  status_before: 'clean',
  staged_before: 'empty',
  command_descriptor: ['git', 'push', '<remote_name>', '<refspec>'],
  command_executed: false,
  command_exit_code: null,
  stdout_redacted_summary: 'not executed; no stdout produced',
  stderr_redacted_summary: 'not executed; no stderr produced',
  credential_or_token_printed: false,
  force_push_attempted: false,
  tags_push_attempted: false,
  mirror_push_attempted: false,
  all_branches_push_attempted: false,
  remote_modified: false,
  remote_verification_performed: false,
  verification_status: 'blocked_missing_remote_target',
  blocker_summary:
    'Push executor is implemented as a guarded argv descriptor, but remote target fields are missing, so no git push command was executed.',
  stop_checks: [
    blocked('remote_name_present', 'remote_name present', 'missing in DemoScenario006 objective'),
    blocked('remote_identity_present', 'remote identity or fingerprint present', 'missing in DemoScenario006 objective'),
    blocked('remote_branch_present', 'remote_branch present', 'missing in DemoScenario006 objective'),
    blocked('refspec_present', 'refspec present', 'missing in DemoScenario006 objective'),
    pass('command_not_executed', 'git push not executed', 'command_executed=false'),
    pass('no_force_tags_mirror', 'no force/tags/mirror/all attempt', 'all forbidden push modes stayed false'),
    pass('no_secret_output', 'no credential/token printed', 'stdout and stderr were not produced because execution was skipped'),
  ],
};

export const pushRemoteVerificationView: PushRemoteVerificationView = {
  remote_verification: true,
  verification_status: 'blocked_missing_remote_target',
  remote_configured: false,
  upstream_configured: false,
  remote_name: 'missing - not configured',
  local_branch: 'master',
  remote_branch: 'missing - not supplied',
  refspec: 'missing - not supplied',
  git_remote_v_summary: 'empty; no configured remote output observed',
  git_branch_vv_summary: '* master 9999999 feat: add push preflight gate; no upstream tracking branch',
  network_verification_performed: false,
  credential_or_token_printed: false,
  remote_contains_approved_commit: 'not_checked_missing_remote_target',
  blocker_summary:
    'Remote verification cannot run because the repository has no configured remote/upstream and no approved remote identity/refspec.',
  evidence: [
    'remote_configured=false',
    'upstream_configured=false',
    'git remote -v output empty',
    'git branch -vv has no upstream marker',
    'network_verification_performed=false',
    'credential_or_token_printed=false',
    'actual_push_performed=false',
  ],
};

export const finalExecutionChainCloseoutView: FinalExecutionChainCloseoutView = {
  closeout_id: 'DemoScenario006-FINAL-EXECUTION-CHAIN-CLOSEOUT',
  status: 'blocked_missing_remote_target',
  push_executed: false,
  push_executor_implemented: true,
  push_execution_approved: false,
  actual_push_performed: false,
  build_passed: true,
  browser_smoke_passed: true,
  ag_sec_findings: '0/0/0',
  ag_review_findings: '0/0/0',
  pro_closeout: 'final_commit_only',
  credential_or_token_printed: false,
  force_tags_mirror_attempted: false,
  llm_wiki_real_data_other_project: false,
  summary:
    'DemoScenario006 closes on the blocked path: push executor v0.1 evidence exists, but missing remote target approval prevents first push execution.',
  completedScope: [
    'push executor v0.1 contract implemented',
    'blocked push receipt captured',
    'remote verification blocker captured',
    'no-secret and no-token evidence captured',
    'build and browser smoke required before commit',
    'first push not executed',
  ],
  remainingBlockers: [
    'remote_name missing',
    'remote_url_identity or remote_url_fingerprint missing',
    'remote_branch missing',
    'refspec missing',
    'network push policy missing',
    'fresh Pro push gate missing',
  ],
  nextRecommendation:
    'DemoScenario007 remote target approval packet / needs_user_decision; provide exact remote identity, branch/refspec, network policy, and credential visibility policy before any push.',
};
