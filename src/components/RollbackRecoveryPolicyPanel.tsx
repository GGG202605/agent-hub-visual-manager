import type { RollbackRecoveryPolicyView } from '../types';

interface RollbackRecoveryPolicyPanelProps {
  policy: RollbackRecoveryPolicyView;
}

export function RollbackRecoveryPolicyPanel({ policy }: RollbackRecoveryPolicyPanelProps) {
  const flags = [
    ['rollback_recovery_candidate', String(policy.rollback_recovery_candidate)],
    ['rollback_execution_approved', String(policy.rollback_execution_approved)],
    ['rollback_executor_enabled', String(policy.rollback_executor_enabled)],
    ['rollback_preflight_only', String(policy.rollback_preflight_only)],
    ['actual_rollback_performed', String(policy.actual_rollback_performed)],
    ['stage_permission', String(policy.stage_permission)],
    ['commit_permission', String(policy.commit_permission)],
    ['push_permission', String(policy.push_permission)],
  ] as const;

  return (
    <section className="action-panel-block action-selected-decision" aria-label="RollbackRecoveryPolicyPanel">
      <span className="action-panel-label">RollbackRecoveryPolicyPanel / policy gate</span>
      <h3>rollback_recovery_candidate=true</h3>
      <p>Panel marker: RollbackRecoveryPolicyPanel</p>
      <p>{policy.summary}</p>

      <div className="import-status-grid" aria-label="rollback recovery policy flags">
        {flags.map(([label, value]) => (
          <PolicyMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="dry-run-detail-grid" aria-label="rollback recovery policy lists">
        <PolicyList title="Policy" items={policy.policyPoints} />
        <PolicyList title="Allowed rollback types" items={policy.allowedRollbackTypes} />
        <PolicyList title="Forbidden actions" items={policy.forbiddenActions} />
      </div>

      <div className="action-policy-footer">
        {policy.executionGateMessages.map((message) => (
          <span key={message}>{message}</span>
        ))}
      </div>
    </section>
  );
}

function PolicyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PolicyList({ title, items }: { title: string; items: readonly string[] }) {
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
