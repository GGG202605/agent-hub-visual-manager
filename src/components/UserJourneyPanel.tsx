import type { UserJourneyView } from '../types';

interface UserJourneyPanelProps {
  journey: UserJourneyView;
}

export function UserJourneyPanel({ journey }: UserJourneyPanelProps) {
  return (
    <section className="action-panel-block action-envelope-summary" aria-label="UserJourneyPanel">
      <span className="action-panel-label">UserJourneyPanel</span>
      <h3>{journey.title}</h3>
      <p>Panel marker: UserJourneyPanel</p>
      <p>{journey.summary}</p>

      <div className="action-control-grid" aria-label="local v0.1 user journey">
        {journey.stages.map((stage) => (
          <article key={stage.stage} className="receipt-audit-card">
            <span className="action-panel-label">{stage.stage}</span>
            <h3>{stage.userSees}</h3>
            <p>{stage.productAnswer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
