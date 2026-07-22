import type { ProductNextDecisionView } from '../types';

interface ProductNextDecisionPanelProps {
  decision: ProductNextDecisionView;
}

export function ProductNextDecisionPanel({ decision }: ProductNextDecisionPanelProps) {
  return (
    <section className="action-panel-block action-selected-decision" aria-label="ProductNextDecisionPanel">
      <span className="action-panel-label">ProductNextDecisionPanel</span>
      <h3>Next decision: {decision.currentNextDecision}</h3>
      <p>Panel marker: ProductNextDecisionPanel</p>

      <div className="action-control-grid" aria-label="product next decision routes">
        {decision.routes.map((route) => (
          <article key={route.route} className="receipt-audit-card">
            <span className="action-panel-label">Route {route.route}</span>
            <h3>{route.title}</h3>
            <p>{route.summary}</p>
            <dl className="action-field-list">
              <DecisionField label="risk" value={route.risk} />
              <DecisionField label="approval_required" value={String(route.approvalRequired)} />
              <DecisionField label="recommended" value={String(route.recommended)} />
              <DecisionField label="why" value={route.why} />
              <DecisionField label="Pro_required" value={String(route.proRequired)} />
              <DecisionField label="high_risk" value={String(route.highRisk)} />
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function DecisionField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
