import type { FinalReviewScorecardView } from '../types';

interface FinalReviewScorecardPanelProps {
  scorecard: FinalReviewScorecardView;
}

export function FinalReviewScorecardPanel({ scorecard }: FinalReviewScorecardPanelProps) {
  return (
    <section className="action-panel-block action-gate-summary" aria-label="FinalReviewScorecardPanel">
      <span className="action-panel-label">FinalReviewScorecardPanel</span>
      <h3>{scorecard.title}</h3>
      <p>Panel marker: FinalReviewScorecardPanel</p>
      <p>{scorecard.summary}</p>

      <div className="summary-governance" aria-label="final readiness levels">
        <span className="mode-pill">{scorecard.readinessLevel}</span>
        <span className="mode-pill mode-pill-muted">{scorecard.cloudPushReadiness}</span>
      </div>

      <div className="action-control-grid" aria-label="local v0.1 final scorecard rows">
        {scorecard.rows.map((row) => (
          <article key={row.category} className="receipt-audit-card">
            <span className="action-panel-label">{row.status}</span>
            <h3>{row.category}</h3>
            <dl className="action-field-list">
              <ScorecardField label="score" value={row.score} />
              <ScorecardField label="note" value={row.note} />
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function ScorecardField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
