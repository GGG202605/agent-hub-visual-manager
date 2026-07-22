import type { PushExecutorApprovalPacket, PushExecutorContractView, RollbackStopCheck } from '../types';

function pass(id: string, label: string, evidence: string): RollbackStopCheck {
  return { id, label, status: 'pass', evidence };
}

function blocked(id: string, label: string, evidence: string): RollbackStopCheck {
  return { id, label, status: 'blocked', evidence };
}

export const pushExecutorRequiredTargetFields = [
  'remote_name',
  'remote_url_identity_or_fingerprint',
  'local_branch',
  'remote_branch',
  'refspec',
  'network_policy',
  'credential_visibility_policy',
  'human_review_required=true',
  'Pro_gate_required=true',
] as const;

export const pushExecutorApprovalPacket: PushExecutorApprovalPacket = {
  approval_id: 'DemoScenario006-FIRST-PUSH-TARGET-APPROVAL',
  executor_mode: 'push_executor_candidate',
  allowed_repo: 'D:\\Projects\\agent-hub-demo',
  allowed_cwd: 'D:\\Projects\\agent-hub-demo',
  approved_HEAD: '9999999999999999999999999999999999999999',
  remote_name: 'missing - not supplied by DemoScenario006 objective',
  remote_url_identity: 'missing - not supplied by DemoScenario006 objective',
  remote_url_fingerprint: 'missing - not supplied by DemoScenario006 objective',
  local_branch: 'master',
  remote_branch: 'missing - not supplied by DemoScenario006 objective',
  refspec: 'missing - not supplied by DemoScenario006 objective',
  network_policy: 'local metadata only; no git push or network verification without explicit target approval',
  credential_visibility_policy: 'never print credentials, tokens, helper output, or auth prompts',
  force_push_allowed: false,
  tags_allowed: false,
  mirror_allowed: false,
  all_branches_allowed: false,
  human_review_required: true,
  Pro_gate_required: true,
  push_target_complete: false,
};

export const pushExecutorContractView: PushExecutorContractView = {
  push_executor_v0_1: true,
  push_executor_implemented: true,
  push_executor_enabled: true,
  push_execution_approved: false,
  actual_push_performed: false,
  allowed_cwd: pushExecutorApprovalPacket.allowed_cwd,
  approved_HEAD: pushExecutorApprovalPacket.approved_HEAD,
  command_descriptor: ['git', 'push', '<remote_name>', '<refspec>'],
  shell: false,
  remote_add_set_url_allowed: false,
  force_push_allowed: false,
  tags_allowed: false,
  mirror_allowed: false,
  all_branches_allowed: false,
  credential_print_allowed: false,
  push_target_complete: false,
  blocked_reason:
    'remote_name, remote identity, remote_branch, refspec, network policy approval, and Pro push approval are incomplete; push execution is blocked.',
  approvalPacket: pushExecutorApprovalPacket,
  requiredTargetFields: pushExecutorRequiredTargetFields,
  preflightChecks: [
    pass('approved_head_matches', 'approved HEAD matches current baseline', '9999999999999999999999999999999999999999'),
    pass('branch_matches', 'local branch matches', 'local_branch=master'),
    pass('status_clean', 'working tree clean at initial audit', 'git status --short returned empty'),
    pass('staged_empty', 'staged area empty at initial audit', 'git diff --cached --name-only returned empty'),
    blocked('remote_target_complete', 'remote target complete', 'remote_name and remote identity/refspec are missing'),
    blocked('exact_refspec_approved', 'exact remote/refspec approved', 'refspec is missing and cannot be guessed'),
    pass('no_force_tags_mirror', 'force/tags/mirror/all disabled', 'force_push_allowed=false; tags_allowed=false; mirror_allowed=false; all_branches_allowed=false'),
    pass('credential_redaction_policy', 'credential print disabled', 'credential_print_allowed=false'),
    blocked('pro_push_gate', 'Pro push gate complete', 'Pro closeout is commit-only; it does not approve first push execution'),
  ],
  forbiddenActions: [
    'guess remote URL or remote identity',
    'read or print credential/token data',
    'git remote add or git remote set-url',
    'git push to unknown remote',
    'force push',
    'push tags',
    'push all branches',
    'git push --mirror',
    'shell string execution',
  ],
  stopConditions: [
    'push target packet is incomplete',
    'approved HEAD differs from current HEAD',
    'working tree is dirty or staged area is not empty before push',
    'remote/refspec differs from the approved packet',
    'command descriptor includes force, tags, all, mirror, or delete semantics',
    'credential or token would appear in output',
    'AG-SEC or AG-REVIEW has any High or Medium finding',
    'Pro gate is not final and scoped to the exact push target',
  ],
};
