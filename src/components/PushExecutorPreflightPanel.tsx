import type { PushExecutorPreflightView } from '../types';

interface PushExecutorPreflightPanelProps {
  preflight: PushExecutorPreflightView;
}

export function PushExecutorPreflightPanel({ preflight }: PushExecutorPreflightPanelProps) {
  const flags = [
    ['push_executor_candidate', String(preflight.push_executor_candidate)],
    ['push_executor_enabled', String(preflight.push_executor_enabled)],
    ['push_execution_approved', String(preflight.push_execution_approved)],
    ['push_preflight_only', String(preflight.push_preflight_only)],
    ['actual_push_performed', String(preflight.actual_push_performed)],
    ['push_permission', String(preflight.push_permission)],
    ['remote_configured', String(preflight.remote_configured)],
    ['upstream_configured', String(preflight.upstream_configured)],
    ['branch', preflight.branch],
  ] as const;

  return (
    <section className="action-panel-block action-gate-summary" aria-label="PushExecutorPreflightPanel">
      <span className="action-panel-label">PushExecutorPreflightPanel / disabled push gate</span>
      <h3>push preflight only</h3>
      <p>Panel marker: PushExecutorPreflightPanel</p>
      <p>{preflight.summary}</p>

      <section className="receipt-audit-card" aria-label="push target preflight policy">
        <span className="action-panel-label">remote target policy</span>
        <h3>No remote/upstream means push remains blocked</h3>
        <dl className="action-field-list">
          <PushField label="candidate_remote_name" value={preflight.candidate_remote_name} />
          <PushField label="candidate_branch_refspec" value={preflight.candidate_branch_refspec} />
          <PushField label="credential_visibility_policy" value={preflight.credential_visibility_policy} />
          <PushField label="network_policy" value={preflight.network_policy} />
        </dl>
      </section>

      <div className="import-status-grid" aria-label="push executor preflight flags">
        {flags.map(([label, value]) => (
          <PushMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="push preflight checks">
        {preflight.preflightChecks.map((item) => (
          <article key={item.id} className="receipt-audit-card">
            <span className="action-panel-label">{item.id}</span>
            <h3>{item.status}</h3>
            <dl className="action-field-list">
              <PushField label="check" value={item.label} />
              <PushField label="evidence" value={item.evidence} />
            </dl>
          </article>
        ))}
      </div>

      <div className="action-policy-footer">
        {preflight.executionGateMessages.map((message) => (
          <span key={message}>{message}</span>
        ))}
      </div>
    </section>
  );
}

function PushMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PushField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
