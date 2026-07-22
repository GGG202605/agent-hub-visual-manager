import type { EvidenceSummaryView } from '../types';

interface EvidenceSummaryPanelProps {
  evidence: EvidenceSummaryView;
}

export function EvidenceSummaryPanel({ evidence }: EvidenceSummaryPanelProps) {
  return (
    <section className="action-panel-block action-envelope-summary" aria-label="EvidenceSummaryPanel">
      <span className="action-panel-label">EvidenceSummaryPanel</span>
      <h3>Evidence summary</h3>
      <p>Panel marker: EvidenceSummaryPanel</p>
      <p>{evidence.summary}</p>

      <div className="action-control-grid" aria-label="denoised evidence cards">
        {evidence.cards.map((card) => (
          <article key={card.label} className="receipt-audit-card">
            <span className="action-panel-label">{card.status}</span>
            <h3>{card.label}</h3>
            <dl className="action-field-list">
              <EvidenceField label="evidence" value={card.evidence} />
              <EvidenceField label="reference" value={card.reference} />
            </dl>
          </article>
        ))}
      </div>

      <section className="dry-run-list-card" aria-label="evidence denoise rules">
        <h3>Evidence denoise rules</h3>
        <ul>
          {evidence.mainViewRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function EvidenceField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
