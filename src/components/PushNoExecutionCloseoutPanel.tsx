import type { PushNoExecutionCloseoutView } from '../types';

interface PushNoExecutionCloseoutPanelProps {
  closeout: PushNoExecutionCloseoutView;
}

export function PushNoExecutionCloseoutPanel({ closeout }: PushNoExecutionCloseoutPanelProps) {
  const flags = [
    ['push_executor_implemented', String(closeout.push_executor_implemented)],
    ['push_executor_executed', String(closeout.push_executor_executed)],
    ['actual_push_performed', String(closeout.actual_push_performed)],
    ['remote_modified', String(closeout.remote_modified)],
    ['credential_or_token_read', String(closeout.credential_or_token_read)],
  ] as const;

  return (
    <section className="action-panel-block action-gate-summary" aria-label="PushNoExecutionCloseoutPanel">
      <span className="action-panel-label">PushNoExecutionCloseoutPanel / no-push closeout</span>
      <h3>{closeout.status}</h3>
      <p>Panel marker: PushNoExecutionCloseoutPanel</p>
      <p>{closeout.summary}</p>

      <div className="import-status-grid" aria-label="no push closeout flags">
        {flags.map(([label, value]) => (
          <CloseoutMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="no push closeout evidence">
        <CloseoutList title="Closeout evidence" items={closeout.closeoutEvidence} />
        <CloseoutList title="Forbidden carryover" items={closeout.forbiddenCarryover} />
      </div>

      <section className="receipt-audit-card" aria-label="first push next recommendation">
        <span className="action-panel-label">{closeout.goal_id}</span>
        <h3>First push requires separate user approval and Pro gate</h3>
        <dl className="action-field-list">
          <CloseoutField label="next_recommendation" value={closeout.nextRecommendation} />
        </dl>
      </section>
    </section>
  );
}

function CloseoutMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CloseoutList({ title, items }: { title: string; items: readonly string[] }) {
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

function CloseoutField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
