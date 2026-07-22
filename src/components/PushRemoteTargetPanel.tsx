import type { PushRemoteTargetView } from '../types';

interface PushRemoteTargetPanelProps {
  target: PushRemoteTargetView;
}

export function PushRemoteTargetPanel({ target }: PushRemoteTargetPanelProps) {
  const flags = [
    ['remote_configured', String(target.remote_configured)],
    ['upstream_configured', String(target.upstream_configured)],
    ['branch', target.branch],
    ['candidate_remote_name', target.candidate_remote_name],
    ['candidate_branch_refspec', target.candidate_branch_refspec],
  ] as const;

  return (
    <section className="action-panel-block action-envelope-summary" aria-label="PushRemoteTargetPanel">
      <span className="action-panel-label">PushRemoteTargetPanel / remote target discovery</span>
      <h3>remote target blocked</h3>
      <p>Panel marker: PushRemoteTargetPanel</p>
      <p>{target.blocker_summary}</p>

      <div className="import-status-grid" aria-label="push remote target flags">
        {flags.map(([label, value]) => (
          <RemoteMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="push remote discovery evidence">
        <RemoteList title="Discovery evidence" items={target.discoveryEvidence} />
        <RemoteList title="Required user decisions" items={target.requiredUserDecisions} />
      </div>

      <section className="receipt-audit-card" aria-label="push remote policies">
        <span className="action-panel-label">{target.discovery_mode}</span>
        <h3>No remote/upstream means push remains blocked</h3>
        <dl className="action-field-list">
          <RemoteField label="remote_status" value={target.remote_status_summary} />
          <RemoteField label="upstream_status" value={target.upstream_status_summary} />
          <RemoteField label="credential_policy" value={target.credential_visibility_policy} />
          <RemoteField label="network_policy" value={target.network_policy} />
        </dl>
      </section>
    </section>
  );
}

function RemoteMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RemoteList({ title, items }: { title: string; items: readonly string[] }) {
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

function RemoteField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
