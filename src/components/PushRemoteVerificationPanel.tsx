import type { PushRemoteVerificationView } from '../types';

interface PushRemoteVerificationPanelProps {
  verification: PushRemoteVerificationView;
}

export function PushRemoteVerificationPanel({ verification }: PushRemoteVerificationPanelProps) {
  const flags = [
    ['remote_verification', String(verification.remote_verification)],
    ['verification_status', verification.verification_status],
    ['remote_configured', String(verification.remote_configured)],
    ['upstream_configured', String(verification.upstream_configured)],
    ['network_verification_performed', String(verification.network_verification_performed)],
    ['credential_or_token_printed', String(verification.credential_or_token_printed)],
    ['remote_contains_approved_commit', verification.remote_contains_approved_commit],
  ] as const;

  return (
    <section className="action-panel-block action-envelope-summary" aria-label="PushRemoteVerificationPanel">
      <span className="action-panel-label">PushRemoteVerificationPanel / no remote verification</span>
      <h3>{verification.verification_status}</h3>
      <p>Panel marker: PushRemoteVerificationPanel</p>
      <p>{verification.blocker_summary}</p>

      <div className="import-status-grid" aria-label="push remote verification flags">
        {flags.map(([label, value]) => (
          <VerificationMetric key={label} label={label} value={value} />
        ))}
      </div>

      <section className="receipt-audit-card" aria-label="remote verification metadata">
        <span className="action-panel-label">local metadata only</span>
        <h3>No remote/upstream target</h3>
        <dl className="action-field-list">
          <VerificationField label="remote_name" value={verification.remote_name} />
          <VerificationField label="local_branch" value={verification.local_branch} />
          <VerificationField label="remote_branch" value={verification.remote_branch} />
          <VerificationField label="refspec" value={verification.refspec} />
          <VerificationField label="git_remote_v_summary" value={verification.git_remote_v_summary} />
          <VerificationField label="git_branch_vv_summary" value={verification.git_branch_vv_summary} />
        </dl>
      </section>

      <VerificationList title="Verification evidence" items={verification.evidence} />
    </section>
  );
}

function VerificationMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function VerificationList({ title, items }: { title: string; items: readonly string[] }) {
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

function VerificationField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
