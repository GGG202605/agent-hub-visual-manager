import type { SelectedPathWritePreflightView } from '../types';

interface SelectedPathWritePreflightPanelProps {
  preflight: SelectedPathWritePreflightView;
}

export function SelectedPathWritePreflightPanel({ preflight }: SelectedPathWritePreflightPanelProps) {
  const receiptRows = [
    ['approval_id', preflight.receipt.approval_id],
    ['executor_mode', preflight.receipt.executor_mode],
    ['allowed_repo', preflight.receipt.allowed_repo],
    ['allowed_cwd', preflight.receipt.allowed_cwd],
    ['preimage_hash_status', preflight.receipt.preimage_hash_status],
    ['expected_diff_status', preflight.receipt.expected_diff_status],
    ['rollback_strategy_status', preflight.receipt.rollback_strategy_status],
    ['zero_write_assertion', String(preflight.receipt.zero_write_assertion)],
    ['receipt_status', preflight.receipt.receipt_status],
  ] as const;

  return (
    <section className="action-panel-block action-gate-summary" aria-label="SelectedPathWritePreflightPanel">
      <span className="action-panel-label">SelectedPathWritePreflightPanel / zero-write preflight</span>
      <h3>zero-write receipt visible: {preflight.receipt.receipt_status}</h3>
      <p>Panel marker: SelectedPathWritePreflightPanel</p>
      <p>{preflight.summary}</p>

      <section className="receipt-audit-card" aria-label="zero-write receipt">
        <span className="action-panel-label">zero-write receipt</span>
        <h3>actual_write_performed=false</h3>
        <dl className="action-field-list">
          {receiptRows.map(([label, value]) => (
            <PreflightField key={label} label={label} value={value} />
          ))}
          <PreflightField label="target_paths_checked" value={preflight.receipt.target_paths_checked.join(', ')} />
          <PreflightField
            label="forbidden_paths_checked"
            value={preflight.receipt.forbidden_paths_checked.join(', ')}
          />
        </dl>
      </section>

      <div className="action-control-grid" aria-label="selected-path write preflight stop checks">
        {preflight.checks.map((item) => (
          <article key={item.id} className="receipt-audit-card">
            <span className="action-panel-label">{item.id}</span>
            <h3>{item.status}</h3>
            <dl className="action-field-list">
              <PreflightField label="check" value={item.label} />
              <PreflightField label="evidence" value={item.evidence} />
            </dl>
          </article>
        ))}
      </div>

      <div className="dry-run-detail-grid" aria-label="zero-write preflight evidence">
        <PreflightList title="Zero-write evidence" items={preflight.zeroWriteEvidence} />
        <PreflightList title="Packet target paths" items={preflight.packet.allowed_target_paths} />
        <PreflightList title="Packet forbidden paths" items={preflight.packet.forbidden_paths} />
      </div>

      <div className="action-policy-footer">
        <strong>Preflight passed does not authorize write</strong>
        <span>write_execution_approved=false</span>
        <span>DemoScenario046 required for first write target approval</span>
        <span>DemoScenario047 required for first selected-path write execution</span>
      </div>
    </section>
  );
}

function PreflightField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PreflightList({ title, items }: { title: string; items: readonly string[] }) {
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
