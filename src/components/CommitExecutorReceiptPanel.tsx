import type { CommitExecutorReceiptView } from '../types';

interface CommitExecutorReceiptPanelProps {
  receipt: CommitExecutorReceiptView;
}

export function CommitExecutorReceiptPanel({ receipt }: CommitExecutorReceiptPanelProps) {
  const flags = [
    ['commit_executor_implemented', String(receipt.commit_executor_implemented)],
    ['commit_executor_enabled', String(receipt.commit_executor_enabled)],
    ['commit_execution_approved', String(receipt.commit_execution_approved)],
    ['commit_preflight_only', String(receipt.commit_preflight_only)],
    ['actual_commit_performed', String(receipt.actual_commit_performed)],
    ['push_permission', String(receipt.push_permission)],
    ['receipt_status', receipt.receipt_status],
    ['verification_status', receipt.verification_status],
  ] as const;

  return (
    <section className="action-panel-block action-selected-decision" aria-label="CommitExecutorReceiptPanel">
      <span className="action-panel-label">CommitExecutorReceiptPanel / controlled commit receipt</span>
      <h3>{receipt.receipt_status}</h3>
      <p>Panel marker: CommitExecutorReceiptPanel</p>
      <p>
        Commit executor v0.1 performs one controlled commit with the fixed approved message and exact staged
        file set. Push remains false.
      </p>

      <div className="import-status-grid" aria-label="commit executor receipt flags">
        {flags.map(([label, value]) => (
          <CommitMetric key={label} label={label} value={value} />
        ))}
      </div>

      <section className="receipt-audit-card" aria-label="commit executor command and receipt">
        <span className="action-panel-label">command</span>
        <h3>{receipt.approved_message}</h3>
        <dl className="action-field-list">
          <CommitField label="command_descriptor" value={receipt.command_descriptor.join(' | ')} />
          <CommitField label="allowed_cwd" value={receipt.allowed_cwd} />
          <CommitField label="pre_HEAD" value={receipt.pre_HEAD} />
          <CommitField label="post_HEAD" value={receipt.post_HEAD} />
          <CommitField label="commit_hash" value={receipt.commit_hash} />
          <CommitField label="status_after_commit" value={receipt.status_after_commit} />
        </dl>
      </section>

      <section className="receipt-audit-card" aria-label="commit executor committed files">
        <span className="action-panel-label">files</span>
        <h3>exact approved paths</h3>
        <dl className="action-field-list">
          <CommitField label="staged_paths_before_commit" value={receipt.staged_paths_before_commit.join(', ')} />
          <CommitField label="committed_files_verified" value={receipt.committed_files_verified.join(', ')} />
          <CommitField label="staged_after_commit" value={receipt.staged_after_commit.join(', ') || 'empty'} />
        </dl>
      </section>

      <div className="action-control-grid" aria-label="commit executor receipt checks">
        {receipt.stop_checks.map((item) => (
          <article key={item.id} className="receipt-audit-card">
            <span className="action-panel-label">{item.id}</span>
            <h3>{item.status}</h3>
            <dl className="action-field-list">
              <CommitField label="check" value={item.label} />
              <CommitField label="evidence" value={item.evidence} />
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function CommitMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CommitField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
