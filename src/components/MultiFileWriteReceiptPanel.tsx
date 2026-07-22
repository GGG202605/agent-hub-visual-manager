import type { MultiFileWriteReceiptView } from '../types';

interface MultiFileWriteReceiptPanelProps {
  receipt: MultiFileWriteReceiptView;
}

export function MultiFileWriteReceiptPanel({ receipt }: MultiFileWriteReceiptPanelProps) {
  return (
    <section className="action-panel-block action-gate-summary" aria-label="MultiFileWriteReceiptPanel">
      <span className="action-panel-label">MultiFileWriteReceiptPanel / write receipt</span>
      <h3>multi-file receipt: {receipt.receipt_status}</h3>
      <p>Panel marker: MultiFileWriteReceiptPanel</p>

      <section className="receipt-audit-card" aria-label="multi-file receipt snapshot">
        <span className="action-panel-label">receipt snapshot</span>
        <h3>{receipt.receipt_id}</h3>
        <dl className="action-field-list">
          <ReceiptField label="approval_id" value={receipt.approval_id} />
          <ReceiptField label="changed_files" value={receipt.changed_files.join(', ')} />
          <ReceiptField label="total_bytes" value={String(receipt.total_bytes)} />
          <ReceiptField label="staged_status" value={receipt.staged_status} />
          <ReceiptField label="head_changed_by_executor" value={String(receipt.head_changed_by_executor)} />
          <ReceiptField label="zero_extra_mutation" value={String(receipt.zero_extra_mutation_assertion)} />
        </dl>
      </section>

      <div className="action-control-grid" aria-label="multi-file postimage hashes">
        {receipt.postimage_hashes.map((item) => (
          <article key={item.path} className="receipt-audit-card">
            <span className="action-panel-label">postimage</span>
            <h3>{item.path}</h3>
            <dl className="action-field-list">
              <ReceiptField label="sha256" value={item.sha256} />
              <ReceiptField
                label="bytes"
                value={String(receipt.file_sizes.find((size) => size.path === item.path)?.bytes ?? 'unknown')}
              />
            </dl>
          </article>
        ))}
      </div>
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
