import type { PushExecutorContractView, PushExecutorReceiptView } from '../types';

interface PushExecutorReceiptPanelProps {
  contract: PushExecutorContractView;
  receipt: PushExecutorReceiptView;
}

export function PushExecutorReceiptPanel({ contract, receipt }: PushExecutorReceiptPanelProps) {
  const flags = [
    ['push_executor_implemented', String(receipt.push_executor_implemented)],
    ['push_execution_approved', String(receipt.push_execution_approved)],
    ['actual_push_performed', String(receipt.actual_push_performed)],
    ['receipt_status', receipt.receipt_status],
    ['force_push_allowed', String(contract.force_push_allowed)],
    ['tags_allowed', String(contract.tags_allowed)],
    ['mirror_allowed', String(contract.mirror_allowed)],
    ['all_branches_allowed', String(contract.all_branches_allowed)],
    ['credential_or_token_printed', String(receipt.credential_or_token_printed)],
  ] as const;

  return (
    <section className="action-panel-block action-gate-summary" aria-label="PushExecutorReceiptPanel">
      <span className="action-panel-label">PushExecutorReceiptPanel / blocked first push receipt</span>
      <h3>{receipt.receipt_status}</h3>
      <p>Panel marker: PushExecutorReceiptPanel</p>
      <p>{receipt.blocker_summary}</p>

      <div className="import-status-grid" aria-label="push executor receipt flags">
        {flags.map(([label, value]) => (
          <ReceiptMetric key={label} label={label} value={value} />
        ))}
      </div>

      <section className="receipt-audit-card" aria-label="push executor command descriptor">
        <span className="action-panel-label">argv descriptor only</span>
        <h3>{contract.command_descriptor.join(' ')}</h3>
        <dl className="action-field-list">
          <ReceiptField label="shell" value={String(contract.shell)} />
          <ReceiptField label="command_executed" value={String(receipt.command_executed)} />
          <ReceiptField label="allowed_cwd" value={receipt.allowed_cwd} />
          <ReceiptField label="approved_HEAD" value={receipt.approved_HEAD} />
          <ReceiptField label="pre_HEAD" value={receipt.pre_HEAD} />
          <ReceiptField label="post_HEAD" value={receipt.post_HEAD} />
        </dl>
      </section>

      <div className="action-control-grid" aria-label="push executor stop checks">
        {receipt.stop_checks.map((item) => (
          <article key={item.id} className="receipt-audit-card">
            <span className="action-panel-label">{item.id}</span>
            <h3>{item.status}</h3>
            <dl className="action-field-list">
              <ReceiptField label="check" value={item.label} />
              <ReceiptField label="evidence" value={item.evidence} />
            </dl>
          </article>
        ))}
      </div>

      <div className="action-control-grid" aria-label="push executor missing approval fields">
        <ReceiptList title="Required target fields" items={contract.requiredTargetFields} />
        <ReceiptList title="Forbidden actions" items={contract.forbiddenActions} />
      </div>
    </section>
  );
}

function ReceiptMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReceiptList({ title, items }: { title: string; items: readonly string[] }) {
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

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
