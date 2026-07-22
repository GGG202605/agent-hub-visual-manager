import type { StageRecoveryReceiptView } from '../types';

interface StageRecoveryReceiptPanelProps {
  receipt: StageRecoveryReceiptView;
}

export function StageRecoveryReceiptPanel({ receipt }: StageRecoveryReceiptPanelProps) {
  return (
    <section className="action-panel-block action-envelope-summary" aria-label="StageRecoveryReceiptPanel">
      <span className="action-panel-label">StageRecoveryReceiptPanel / unstage recovery</span>
      <h3>stage recovery: {receipt.receipt_status}</h3>
      <p>Panel marker: StageRecoveryReceiptPanel</p>
      <p>{receipt.summary}</p>

      <section className="receipt-audit-card" aria-label="stage recovery receipt snapshot">
        <span className="action-panel-label">recovery command</span>
        <h3>{receipt.command_descriptor.join(' ')}</h3>
        <dl className="action-field-list">
          <RecoveryField label="allowed_cwd" value={receipt.allowed_cwd} />
          <RecoveryField label="requested_paths" value={receipt.requested_paths.join(', ')} />
          <RecoveryField label="staged_after_recovery" value={receipt.staged_after_recovery.join(', ') || 'empty'} />
          <RecoveryField label="head_changed" value={String(receipt.head_changed)} />
          <RecoveryField label="file_content_changed" value={String(receipt.file_content_changed)} />
          <RecoveryField label="verification_status" value={receipt.verification_status} />
        </dl>
      </section>

      <div className="action-control-grid" aria-label="stage recovery checks">
        {receipt.stop_checks.map((item) => (
          <article key={item.id} className="receipt-audit-card">
            <span className="action-panel-label">{item.id}</span>
            <h3>{item.status}</h3>
            <dl className="action-field-list">
              <RecoveryField label="check" value={item.label} />
              <RecoveryField label="evidence" value={item.evidence} />
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function RecoveryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
