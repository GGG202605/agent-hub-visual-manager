import type { ExecutionChainReadinessView } from '../types';

interface ExecutionChainReadinessPanelProps {
  readiness: ExecutionChainReadinessView;
}

export function ExecutionChainReadinessPanel({ readiness }: ExecutionChainReadinessPanelProps) {
  return (
    <section className="action-panel-block action-gate-summary" aria-label="ExecutionChainReadinessPanel">
      <span className="action-panel-label">ExecutionChainReadinessPanel / chain closeout</span>
      <h3>{readiness.readiness_status}</h3>
      <p>Panel marker: ExecutionChainReadinessPanel</p>
      <p>{readiness.summary}</p>

      <div className="action-control-grid" aria-label="execution chain maturity">
        {readiness.maturity.map((item) => (
          <article key={item.layer} className="receipt-audit-card">
            <span className="action-panel-label">{item.layer}</span>
            <h3>{item.status}</h3>
            <dl className="action-field-list">
              <ChainField label="evidence" value={item.evidence} />
            </dl>
          </article>
        ))}
      </div>

      <section className="receipt-audit-card" aria-label="execution chain next decision">
        <span className="action-panel-label">next decision</span>
        <h3>{readiness.next_decision}</h3>
        <dl className="action-field-list">
          <ChainField label="chain_id" value={readiness.chain_id} />
          <ChainField label="forbidden_carryover" value={readiness.forbiddenCarryover.join(', ')} />
        </dl>
      </section>
    </section>
  );
}

function ChainField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
