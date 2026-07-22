import type { ExecutionChainRoadmapView } from '../types';

interface ExecutionChainRoadmapPanelProps {
  roadmap: ExecutionChainRoadmapView;
}

export function ExecutionChainRoadmapPanel({ roadmap }: ExecutionChainRoadmapPanelProps) {
  return (
    <section className="action-panel-block action-selected-decision" aria-label="ExecutionChainRoadmapPanel">
      <span className="action-panel-label">ExecutionChainRoadmapPanel</span>
      <h3>{roadmap.title}</h3>
      <p>Panel marker: ExecutionChainRoadmapPanel</p>
      <p>{roadmap.summary}</p>

      <div className="action-control-grid" aria-label="execution chain roadmap">
        {roadmap.steps.map((step) => (
          <article key={step.capability} className="receipt-audit-card">
            <span className="action-panel-label">{step.status}</span>
            <h3>{step.capability}: {step.status}</h3>
            <dl className="action-field-list">
              <RoadmapField label="status" value={step.status} />
              <RoadmapField label="next_gate" value={step.nextGate} />
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function RoadmapField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
