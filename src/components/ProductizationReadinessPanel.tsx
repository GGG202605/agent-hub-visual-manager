import type { ProductizationReadinessView } from '../types';

interface ProductizationReadinessPanelProps {
  readiness: ProductizationReadinessView;
}

export function ProductizationReadinessPanel({ readiness }: ProductizationReadinessPanelProps) {
  const flags = [
    ['productization_readiness_panel', String(readiness.productization_readiness_panel)],
    ['still_engineering_console', String(readiness.stillEngineeringConsole)],
    ['recommended_next_stage', readiness.recommendedNextStage],
  ] as const;

  return (
    <section className="action-panel-block action-envelope-summary" aria-label="ProductizationReadinessPanel">
      <span className="action-panel-label">ProductizationReadinessPanel / product readiness</span>
      <h3>Productization readiness</h3>
      <p>Panel marker: ProductizationReadinessPanel</p>
      <p>{readiness.summary}</p>

      <div className="import-status-grid" aria-label="productization readiness flags">
        {flags.map(([label, value]) => (
          <ReadinessMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="productization readiness answers">
        {readiness.readinessChecks.map((item) => (
          <article key={item.question} className="receipt-audit-card">
            <span className="action-panel-label">readiness answer</span>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        ))}
      </div>

      <div className="action-control-grid" aria-label="productization readiness lists">
        <ReadinessList title="Panels to merge" items={readiness.panelsToMerge} />
        <ReadinessList title="Flags to preserve" items={readiness.flagsToPreserve} />
        <ReadinessList title="Buttons still forbidden" items={readiness.buttonsStillForbidden} />
      </div>

      <section className="receipt-audit-card" aria-label="user idea to agent chain support">
        <span className="action-panel-label">support level</span>
        <h3>User idea to Agent execution chain</h3>
        <dl className="action-field-list">
          <ReadinessField label="current_support" value={readiness.userIdeaToAgentChainSupport} />
          <ReadinessField label="next_stage" value={readiness.recommendedNextStage} />
        </dl>
      </section>
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

function ReadinessList({ title, items }: { title: string; items: readonly string[] }) {
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

function ReadinessField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
