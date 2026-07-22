import type { StageExecutorReceiptView, StageExecutorView } from '../types';

interface StageExecutorReceiptPanelProps {
  executor: StageExecutorView;
  receipt: StageExecutorReceiptView;
}

export function StageExecutorReceiptPanel({ executor, receipt }: StageExecutorReceiptPanelProps) {
  const fields = [
    ['stage_executor_v0_1', String(executor.stage_executor_v0_1)],
    ['stage_executor_implemented', String(executor.stage_executor_implemented)],
    ['stage_execution_approved', String(executor.stage_execution_approved)],
    ['current_execution_blocked', String(executor.current_execution_blocked)],
    ['receipt_status', receipt.receipt_status],
    ['verification_status', receipt.verification_status],
    ['exact_path_assertion', String(receipt.exact_path_assertion)],
    ['no_git_add_dot_assertion', String(receipt.no_git_add_dot_assertion)],
    ['no_commit_push_assertion', String(receipt.no_commit_push_assertion)],
  ] as const;

  return (
    <section className="action-panel-block action-gate-summary" aria-label="StageExecutorReceiptPanel">
      <span className="action-panel-label">StageExecutorReceiptPanel / stage executor v0.1</span>
      <h3>stage receipt: {receipt.receipt_status}</h3>
      <p>Panel marker: StageExecutorReceiptPanel</p>
      <p>{executor.summary}</p>
      <p>{receipt.blocker_summary}</p>

      <div className="import-status-grid" aria-label="stage executor receipt fields">
        {fields.map(([label, value]) => (
          <StageMetric key={label} label={label} value={value} />
        ))}
      </div>

      <section className="receipt-audit-card" aria-label="stage executor command contract">
        <span className="action-panel-label">command descriptor</span>
        <h3>{executor.command_descriptor.join(' ')}</h3>
        <dl className="action-field-list">
          <StageField label="allowed_cwd" value={executor.allowed_cwd} />
          <StageField label="requested_paths" value={receipt.requested_paths.join(', ')} />
          <StageField label="staged_paths" value={receipt.staged_paths.join(', ') || 'empty'} />
          <StageField label="pre_HEAD" value={receipt.pre_HEAD} />
          <StageField label="post_HEAD" value={receipt.post_HEAD} />
        </dl>
      </section>

      <div className="action-control-grid" aria-label="stage executor stop checks">
        {receipt.stop_checks.map((item) => (
          <article key={item.id} className="receipt-audit-card">
            <span className="action-panel-label">{item.id}</span>
            <h3>{item.status}</h3>
            <dl className="action-field-list">
              <StageField label="check" value={item.label} />
              <StageField label="evidence" value={item.evidence} />
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function StageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StageField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
