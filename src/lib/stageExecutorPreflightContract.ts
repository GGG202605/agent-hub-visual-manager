import type { RollbackStopCheck, StageExecutorPreflightView } from '../types';
import { MULTIFILE_WRITE_TARGETS } from './multiFileSelectedPathWriteContract';

function pass(id: string, label: string, evidence: string): RollbackStopCheck {
  return {
    id,
    label,
    status: 'pass',
    evidence,
  };
}

export const stageExecutorPreflightView: StageExecutorPreflightView = {
  stage_executor_candidate: true,
  stage_executor_enabled: false,
  stage_execution_approved: false,
  stage_preflight_only: true,
  actual_stage_performed: false,
  commit_permission: false,
  push_permission: false,
  summary:
    'Stage executor is policy, disabled prototype, and preflight only. It validates exact paths but does not run git add.',
  policyPoints: [
    'stage preflight checks exact changed files only',
    'stage preflight does not authorize git add',
    'DemoScenario058 required before first stage execution approval',
    'commit and push remain forbidden even after a future stage gate',
    'package/config/CSS/dependency paths are never allowed in this stage candidate',
  ],
  preflightChecks: [
    pass('target_paths_exact', 'target paths are exact', MULTIFILE_WRITE_TARGETS.join(', ')),
    pass('changed_files_approved', 'changed files are approved', 'two fixture files only'),
    pass('no_package_config_css_dependency', 'no package/config/CSS/dependency change', 'diff check empty'),
    pass('human_review_required', 'human review required', 'true'),
    pass('pro_gate_required', 'Pro gate required', 'true'),
    pass('commit_push_forbidden', 'commit/push forbidden', 'commit_permission=false; push_permission=false'),
  ],
  receipt_status: 'stage_executor_preflight_only',
  executionGateMessages: [
    'Stage preflight does not authorize git add',
    'DemoScenario058 required before first stage execution approval',
    'Stage execution is mutation of the index and requires a separate Pro gate',
  ],
  forbiddenActions: [
    'actual git add',
    'commit executor',
    'push executor',
    'package/config/CSS/dependency staging',
    'directory-level stage',
    'bulk stage',
  ],
};
