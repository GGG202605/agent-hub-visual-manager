import type { ProductDemoFlowView } from '../types';

interface ProductDemoFlowPanelProps {
  flow: ProductDemoFlowView;
}

export function ProductDemoFlowPanel({ flow }: ProductDemoFlowPanelProps) {
  return (
    <section className="action-panel-block action-selected-decision" aria-label="ProductDemoFlowPanel">
      <span className="action-panel-label">ProductDemoFlowPanel</span>
      <h3>{flow.title}</h3>
      <p>Panel marker: ProductDemoFlowPanel</p>
      <p>{flow.summary}</p>

      <div className="summary-governance" aria-label="demo flow emphasis">
        {flow.emphasis.map((item) => (
          <span key={item} className="mode-pill">
            {item}
          </span>
        ))}
      </div>

      <div className="action-control-grid" aria-label="product demo flow steps">
        {flow.steps.map((step) => (
          <article key={step.step} className="receipt-audit-card">
            <span className="action-panel-label">{step.status}</span>
            <h3>
              {step.step}: {step.title}
            </h3>
            <p>{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
