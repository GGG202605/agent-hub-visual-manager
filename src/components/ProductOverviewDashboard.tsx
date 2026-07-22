import type { ProductOverviewDashboardView } from '../types';

interface ProductOverviewDashboardProps {
  dashboard: ProductOverviewDashboardView;
}

export function ProductOverviewDashboard({ dashboard }: ProductOverviewDashboardProps) {
  return (
    <section className="summary-card" aria-label="ProductOverviewDashboard">
      <div className="summary-title">
        <p className="eyebrow">ProductOverviewDashboard</p>
        <h2>{dashboard.productName}</h2>
        <span>Panel marker: ProductOverviewDashboard</span>
      </div>

      <dl className="summary-metrics">
        <ProductMetric label="phase" value={dashboard.currentPhase} />
        <ProductMetric label="safety" value={dashboard.currentSafetyStatus} />
        <ProductMetric label="next decision" value={dashboard.currentNextDecision} />
      </dl>

      <div className="action-control-grid" aria-label="first glance product statements">
        {dashboard.heroStatements.map((statement) => (
          <article key={statement} className="receipt-audit-card">
            <span className="action-panel-label">first glance</span>
            <h3>{statement}</h3>
          </article>
        ))}
      </div>

      <div className="summary-governance">
        {dashboard.primarySignals.map((signal) => (
          <span key={signal} className="mode-pill">
            {signal}
          </span>
        ))}
      </div>

      <div className="coordination-lanes">
        {dashboard.statusCards.map((item) => (
          <article key={item.label} className="coordination-lane">
            <div>
              <span className="lane-priority">{item.status}</span>
              <strong>{item.label}</strong>
            </div>
            <p>{item.value}</p>
            <span className={`gate-badge gate-${item.status === 'pass' ? 'open' : 'blocked'}`}>
              {item.status}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-block">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
