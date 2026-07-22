import type { RealExecutorPregateView } from '../types';

interface RealExecutorPregatePanelProps {
  pregate: RealExecutorPregateView;
}

export function RealExecutorPregatePanel({ pregate }: RealExecutorPregatePanelProps) {
  const hardFlags = [
    ['real_executor_approved', String(pregate.realExecutorApproved)],
    ['real_executor_implemented', String(pregate.realExecutorImplemented)],
    ['no_op_executor_only', String(pregate.noOpExecutorOnly)],
    ['independent_pro_gate_required', String(pregate.independentProGateRequired)],
    ['sandbox_profile_required', String(pregate.sandboxProfileRequired)],
    ['receipt_rollback_recovery_required', String(pregate.receiptRollbackRecoveryRequired)],
  ] as const;

  return (
    <section className="action-panel-block action-gate-summary" aria-label="RealExecutorPregatePanel">
      <span className="action-panel-label">RealExecutorPregatePanel / real executor pre-gate</span>
      <h3>real_executor_approved=false</h3>
      <p>{pregate.summary}</p>

      <div className="import-status-grid" aria-label="real executor pre-gate flags">
        {hardFlags.map(([label, value]) => (
          <PregateMetric key={label} label={label} value={value} />
        ))}
        {pregate.safetyFlags.map((flag) => (
          <PregateMetric key={flag.label} label={flag.label} value={flag.value} />
        ))}
      </div>

      <div className="dry-run-detail-grid" aria-label="real executor pre-gate requirements">
        <PregateList title="Prerequisites before any real executor" items={pregate.prerequisites} />
        <PregateList title="Absolutely forbidden until a new approval exists" items={pregate.absolutelyForbiddenActions} />
        <PregateList
          title="Receipt / rollback / recovery evidence required"
          items={pregate.receiptRollbackRecoveryEvidence}
        />
      </div>

      <section className="receipt-audit-card" aria-label="real executor next recommendation">
        <span className="action-panel-label">next_recommendation</span>
        <h3>{pregate.recommendation}</h3>
        <p>
          Real executor pre-gate is planning only. The next step should harden the no-op loop or plan a separate real
          executor gate; it must not jump directly to real execution.
        </p>
      </section>

      <div className="action-policy-footer">
        <strong>Real executor pre-gate is planning only.</strong>
        <span>real_executor_approved=false</span>
        <span>no_op_executor_only=true</span>
        <span>No real Run / Execute / Commit / Push button</span>
      </div>
    </section>
  );
}

function PregateMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PregateList({ title, items }: { title: string; items: string[] }) {
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
