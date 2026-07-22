import type { BuildExecutorReceiptView } from '../types';

interface BuildExecutorReceiptPanelProps {
  receipt: BuildExecutorReceiptView;
}

export function BuildExecutorReceiptPanel({ receipt }: BuildExecutorReceiptPanelProps) {
  const rows = [
    ['approval_id', receipt.approval_id],
    ['executor_mode', receipt.executor_mode],
    ['command', receipt.command],
    ['cwd', receipt.cwd],
    ['exit_code', String(receipt.exit_code)],
    ['warnings_summary', receipt.warnings_summary],
    ['receipt_status', receipt.receipt_status],
    ['verification_status', receipt.verification_status],
    ['package_diff', receipt.package_config_css_dependency_diff_check],
  ] as const;

  return (
    <section className="action-panel-block action-gate-summary" aria-label="BuildExecutorReceiptPanel">
      <span className="action-panel-label">BuildExecutorReceiptPanel / build receipt</span>
      <h3>build receipt: {receipt.receipt_status}</h3>
      <p>Panel marker: BuildExecutorReceiptPanel</p>

      <section className="receipt-audit-card" aria-label="build executor receipt fields">
        <span className="action-panel-label">receipt snapshot</span>
        <h3>{receipt.receipt_id}</h3>
        <dl className="action-field-list">
          {rows.map(([label, value]) => (
            <ReceiptField key={label} label={label} value={value} />
          ))}
        </dl>
      </section>

      <div className="action-control-grid" aria-label="build executor stop checks">
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
