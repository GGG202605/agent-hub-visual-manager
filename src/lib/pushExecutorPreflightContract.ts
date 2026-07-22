import type {
  PushExecutorPreflightView,
  PushNoExecutionCloseoutView,
  PushRemoteTargetView,
  RollbackStopCheck,
} from '../types';

function pass(id: string, label: string, evidence: string): RollbackStopCheck {
  return {
    id,
    label,
    status: 'pass',
    evidence,
  };
}

export const pushExecutorPreflightView: PushExecutorPreflightView = {
  push_executor_candidate: true,
  push_executor_enabled: false,
  push_execution_approved: false,
  push_preflight_only: true,
  actual_push_performed: false,
  push_permission: false,
  remote_configured: false,
  upstream_configured: false,
  branch: 'master',
  candidate_remote_name: 'origin (not configured)',
  candidate_branch_refspec: 'master:master (candidate only; blocked until remote approval)',
  credential_visibility_policy: 'never print credentials, tokens, helper output, or auth prompts',
  network_policy: 'no network verification and no git push in DemoScenario004',
  summary:
    'DemoScenario004 upgrades the push gate into a disabled prototype and preflight validator. Missing remote/upstream keeps push blocked.',
  preflightChecks: [
    pass('DemoScenario003_packet_reviewed', 'DemoScenario003 packet reviewed', 'DemoScenario003 push approval packet is closed / committed and remains docs-only'),
    pass('remote_missing_blocks_push', 'remote target missing', 'remote_configured=false; no git remote -v output observed'),
    pass('upstream_missing_blocks_push', 'upstream missing', 'upstream_configured=false; git branch -vv showed no tracking branch'),
    pass('push_executor_disabled', 'push executor remains disabled', 'push_executor_enabled=false'),
    pass('actual_push_false', 'actual push did not occur', 'actual_push_performed=false'),
    pass('push_validator_no_authority', 'preflight has no push authority', 'Push preflight does not authorize git push'),
    pass('first_push_separate_gate', 'first push separate gate', 'First push requires separate user approval and Pro gate'),
  ],
  executionGateMessages: [
    'Push preflight does not authorize git push',
    'No remote/upstream means push remains blocked',
    'First push requires separate user approval and Pro gate',
  ],
  forbiddenActions: [
    'git push',
    'push executor execution',
    'remote add / remote set-url / upstream modification',
    'credential or token printing',
    'network verification',
    'automatic first push',
  ],
};

export const pushRemoteTargetView: PushRemoteTargetView = {
  remote_target_discovery: true,
  discovery_mode: 'local_git_metadata_only',
  remote_configured: false,
  upstream_configured: false,
  branch: 'master',
  head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  candidate_remote_name: 'origin (not configured)',
  candidate_branch_refspec: 'master:master (candidate only; blocked until remote approval)',
  remote_status_summary: 'No configured remote output was observed from git remote -v.',
  upstream_status_summary: 'git branch -vv showed local master with no upstream tracking branch.',
  credential_visibility_policy: 'never print credentials, tokens, helper output, or auth prompts',
  network_policy: 'local metadata only; no git ls-remote, no auth probe, no git push',
  blocker_summary: 'Push remains blocked until remote name, remote identity, branch/refspec, network policy, and Pro gate are separately approved.',
  discoveryEvidence: [
    'remote configured: false',
    'upstream configured: false',
    'branch: master',
    'candidate remote name: origin (not configured)',
    'candidate branch/refspec: master:master (candidate only)',
    'credential visibility policy: never print secrets',
    'network policy: no network verification in DemoScenario004',
    'push remains blocked if remote/upstream missing',
  ],
  requiredUserDecisions: [
    'approve exact remote name',
    'approve remote URL or existing remote identity',
    'approve remote branch/refspec',
    'approve whether network verification is allowed',
    'approve first push execution in a separate goal',
  ],
};

export const pushNoExecutionCloseoutView: PushNoExecutionCloseoutView = {
  no_push_closeout: true,
  goal_id: 'DemoScenario004',
  status: 'no_push_preflight_complete',
  push_executor_implemented: false,
  push_executor_executed: false,
  actual_push_performed: false,
  remote_modified: false,
  credential_or_token_read: false,
  summary:
    'DemoScenario004 completes remote target planning, disabled push prototype, and push preflight validation without push execution.',
  closeoutEvidence: [
    'push_executor_candidate=true',
    'push_executor_enabled=false',
    'push_execution_approved=false',
    'actual_push_performed=false',
    'remote_configured=false',
    'upstream_configured=false',
    'remote_modified=false',
    'credential_or_token_read=false',
    'git_push_executed=false',
  ],
  nextRecommendation:
    'DemoScenario005 first push target approval packet / needs_user_decision after remote target is supplied and reviewed.',
  forbiddenCarryover: [
    'git push',
    'push executor execution',
    'remote add or remote set-url',
    'upstream modification',
    'credential/token read or print',
    'automatic first push',
  ],
};
