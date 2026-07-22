import type { CommitExecutorPreflightView, RollbackStopCheck } from '../types';
import { STAGE_EXECUTOR_TARGETS } from './stageExecutorContract';

export const COMMIT_EXECUTOR_APPROVED_MESSAGE = 'feat: add stage executor and commit preflight gate';

function pass(id: string, label: string, evidence: string): RollbackStopCheck {
  return {
    id,
    label,
    status: 'pass',
    evidence,
  };
}

export const commitExecutorPreflightView: CommitExecutorPreflightView = {
  commit_executor_candidate: true,
  commit_executor_enabled: false,
  commit_execution_approved: false,
  commit_preflight_only: true,
  actual_commit_performed: false,
  push_permission: false,
  approved_message: COMMIT_EXECUTOR_APPROVED_MESSAGE,
  staged_files_must_equal: STAGE_EXECUTOR_TARGETS,
  summary:
    'Commit executor is a disabled prototype and preflight validator only. It checks exact staged files, message, review gates, and receipt requirements but does not run git commit.',
  approvalPacketFields: [
    'approval_id',
    'executor_mode',
    'allowed_cwd',
    'staged_files_must_equal',
    'approved_commit_message',
    'human_review_required',
    'pro_gate_required',
    'push_forbidden',
    'receipt_required',
  ],
  receiptRequirements: [
    'pre_HEAD',
    'post_HEAD',
    'pre_staged_files',
    'post_staged_files',
    'approved_message',
    'command_exit_code',
    'no_push_assertion',
    'receipt_status',
    'verification_status',
  ],
  preflightChecks: [
    pass(
      'staged_files_exact_rule',
      'staged files must be exact approved files',
      'stage receipt proved the exact two fixture paths before unstage recovery; actual commit remains disabled',
    ),
    pass('commit_message_exact', 'commit message matches approved message', COMMIT_EXECUTOR_APPROVED_MESSAGE),
    pass('no_package_config_css_dependency', 'no package/config/CSS/dependency change', 'protected diff check empty'),
    pass('human_review_required', 'human review required', 'true'),
    pass('pro_gate_required', 'Pro gate required', 'true'),
    pass('push_forbidden', 'push forbidden', 'push_permission=false'),
    pass('receipt_required', 'receipt required', 'true'),
  ],
  executionGateMessages: [
    'Commit preflight does not authorize git commit',
    'DemoScenario001 required before first commit executor approval',
    'Commit execution is separate from stage execution and push remains forbidden',
  ],
  forbiddenActions: [
    'actual git commit',
    'push',
    'commit without exact staged files',
    'commit without Pro closeout',
    'package/config/CSS/dependency commit',
  ],
};
