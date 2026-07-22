import type { CapabilityMaturitySummaryView } from '../types';

interface CapabilityMaturitySummaryPanelProps {
  maturity: CapabilityMaturitySummaryView;
}

export function CapabilityMaturitySummaryPanel({ maturity }: CapabilityMaturitySummaryPanelProps) {
  return (
    <section className="action-panel-block action-envelope-summary" aria-label="CapabilityMaturitySummaryPanel">
      <span className="action-panel-label">CapabilityMaturitySummaryPanel</span>
      <h3>{maturity.title}</h3>
      <p>Panel marker: CapabilityMaturitySummaryPanel</p>
      <p>{maturity.summary}</p>

      <div className="import-status-grid" aria-label="capability maturity items">
        {maturity.items.map((item) => (
          <div key={item.label} className="import-metric">
            <span>{item.status}</span>
            <strong>{item.label}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
