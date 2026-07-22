import type { SafetyBoundarySummaryView } from '../types';

interface SafetyBoundarySummaryPanelProps {
  safety: SafetyBoundarySummaryView;
}

export function SafetyBoundarySummaryPanel({ safety }: SafetyBoundarySummaryPanelProps) {
  return (
    <section className="action-panel-block action-gate-summary" aria-label="SafetyBoundarySummaryPanel">
      <span className="action-panel-label">SafetyBoundarySummaryPanel</span>
      <h3>Safety boundary summary</h3>
      <p>Panel marker: SafetyBoundarySummaryPanel</p>
      <p>{safety.summary}</p>

      <div className="import-status-grid" aria-label="safety boundary flags">
        {safety.safetyFlags.map((flag) => (
          <div key={flag} className="import-metric">
            <span>safety flag</span>
            <strong>{flag}</strong>
          </div>
        ))}
      </div>

      <section className="dry-run-list-card" aria-label="preserved safety boundaries">
        <h3>Preserved boundaries</h3>
        <ul>
          {safety.preservedBoundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}
