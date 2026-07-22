import type { NewChatHandoffView } from '../types';

interface NewChatHandoffPanelProps {
  handoff: NewChatHandoffView;
}

export function NewChatHandoffPanel({ handoff }: NewChatHandoffPanelProps) {
  return (
    <section className="action-panel-block action-gate-summary" aria-label="NewChatHandoffPanel">
      <span className="action-panel-label">NewChatHandoffPanel</span>
      <h3>New-chat handoff</h3>
      <p>Panel marker: NewChatHandoffPanel</p>

      <div className="import-status-grid" aria-label="new chat handoff status">
        <HandoffMetric label="control_HEAD" value={handoff.controlHead} />
        <HandoffMetric label="second_project_HEAD" value={handoff.secondProjectHead} />
        <HandoffMetric label="capability_level" value={handoff.currentCapabilityLevel} />
        <HandoffMetric label="remote_push_status" value={handoff.remotePushStatus} />
        <HandoffMetric label="no_push_finalization_status" value={handoff.noPushFinalizationStatus} />
        <HandoffMetric label="next_recommendation" value={handoff.nextRecommendation} />
      </div>

      <div className="action-control-grid" aria-label="new chat handoff details">
        <section className="dry-run-list-card">
          <h3>Current forbidden items</h3>
          <ul>
            {handoff.forbiddenItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="dry-run-list-card">
          <h3>Never inherit permissions</h3>
          <ul>
            {handoff.neverInheritPermissions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="receipt-audit-card">
          <span className="action-panel-label">copyable handoff prompt</span>
          <h3>Startup prompt</h3>
          <p>{handoff.copyablePrompt}</p>
        </section>
      </div>
    </section>
  );
}

function HandoffMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
