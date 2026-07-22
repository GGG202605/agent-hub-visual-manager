import type { NoopExecutorFixtureReceipt, SemiAutoLoopReadiness } from '../types';
import { semiAutoActionLoopStageCount } from './SemiAutoActionLoopPanel';

interface LoopReadinessPanelProps {
  readiness: SemiAutoLoopReadiness;
  receipt: NoopExecutorFixtureReceipt;
}

export function LoopReadinessPanel({ readiness, receipt }: LoopReadinessPanelProps) {
  const readinessFlags = [
    ['semi_auto_action_loop', 'true'],
    ['loop_mode', 'mock_only'],
    ['loop_stage_count', String(semiAutoActionLoopStageCount)],
    ['commit_gate_evidence_visible', 'true'],
    ['real_executor_pregate_visible', 'true'],
    ['real_executor_approved', 'false'],
    ['no_op_executor_only', 'true'],
    ['independent_pro_gate_required', 'true'],
    ['sandbox_profile_required', 'true'],
    ['receipt_rollback_recovery_required', 'true'],
    ['action_queue_loop_ui_allowed', String(readiness.actionQueueLoopUiAllowed)],
    ['can_enter_noop_executor_controlled_loop_mock', String(readiness.canEnterNoopExecutorControlledLoopMock)],
    ['human_approval_required', String(readiness.humanApprovalRequired)],
    ['real_executor_allowed', String(readiness.realExecutorAllowed)],
    ['write_shell_npm_git_push_allowed', String(readiness.writeShellNpmGitPushAllowed)],
    ['receipt_verification_status', receipt.receipt_verification_status],
  ] as const;

  return (
    <section className="action-panel-block action-envelope-summary" aria-label="Loop readiness panel">
      <span className="action-panel-label">LoopReadinessPanel / 闭环就绪度</span>
      <h3>{readiness.readinessConclusion}</h3>
      <p>
        Loop preview is not execution. No-op executor receipt is simulated. Real executor pre-gate is planning only.
        Human approval is still required before any real action.
      </p>

      <div className="import-status-grid" aria-label="loop readiness flags">
        {readinessFlags.map(([label, value]) => (
          <ReadinessMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="dry-run-detail-grid" aria-label="loop readiness blockers and allowances">
        <ReadinessList title="Still blocking real executor" items={readiness.conditionsBlockingRealExecutor} />
        <ReadinessList title="Allowed mock loop steps" items={readiness.allowedNextMockSteps} />
        <ReadinessList title="Forbidden real actions" items={readiness.forbiddenRealActions} />
      </div>
    </section>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReadinessList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="dry-run-list-card">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
