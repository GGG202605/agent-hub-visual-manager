import type { RollbackPreflightView } from '../types';

interface RollbackPreflightReceiptPanelProps {
  preflight: RollbackPreflightView;
}

export function RollbackPreflightReceiptPanel({ preflight }: RollbackPreflightReceiptPanelProps) {
  const receiptRows = [
    ['approval_id', preflight.receipt.approval_id],
    ['rollback_mode', preflight.receipt.rollback_mode],
    ['rollback_type', preflight.receipt.rollback_type],
    ['preimage_hash_status', preflight.receipt.preimage_hash_status],
    ['current_hash_status', preflight.receipt.current_hash_status],
    ['expected_post_rollback_hash_status', preflight.receipt.expected_post_rollback_hash_status],
    ['mutation_expectation', preflight.receipt.mutation_expectation],
    ['actual_rollback_performed', String(preflight.receipt.actual_rollback_performed)],
    ['receipt_status', preflight.receipt.receipt_status],
  ] as const;

  return (
    <section className="action-panel-block action-gate-summary" aria-label="RollbackPreflightReceiptPanel">
      <span className="action-panel-label">RollbackPreflightReceiptPanel / preflight receipt</span>
      <h3>rollback preflight receipt: {preflight.receipt.receipt_status}</h3>
      <p>Panel marker: RollbackPreflightReceiptPanel</p>
      <p>{preflight.summary}</p>

      <section className="receipt-audit-card" aria-label="rollback preflight receipt snapshot">
        <span className="action-panel-label">preflight receipt</span>
        <h3>actual_rollback_performed=false</h3>
        <dl className="action-field-list">
          {receiptRows.map(([label, value]) => (
            <PreflightField key={label} label={label} value={value} />
          ))}
          <PreflightField label="target_paths_checked" value={preflight.receipt.target_paths_checked.join(', ')} />
        </dl>
      </section>

      <div className="action-control-grid" aria-label="rollback preflight stop checks">
        {preflight.receipt.stop_checks.map((item) => (
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

      <div className="dry-run-detail-grid" aria-label="rollback receipt validator evidence">
        <PreflightList title="Zero mutation evidence" items={preflight.zeroMutationEvidence} />
        <PreflightList title="Receipt required fields" items={preflight.validatorEvidence.required_fields} />
        <PreflightList
          title={`Receipt validator: ${preflight.validatorEvidence.status}`}
          items={preflight.validatorEvidence.checks.map((item) => `${item.id}: ${item.status}`)}
        />
      </div>

      <div className="action-policy-footer">
        <span>Rollback preflight passed does not authorize rollback execution</span>
        <span>receipt_validator_status={preflight.validatorEvidence.status}</span>
        <span>DemoScenario052 required for first rollback execution approval</span>
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
