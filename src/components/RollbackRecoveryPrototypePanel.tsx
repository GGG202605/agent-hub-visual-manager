import type { RollbackRecoveryPrototypeView } from '../types';

interface RollbackRecoveryPrototypePanelProps {
  prototype: RollbackRecoveryPrototypeView;
}

export function RollbackRecoveryPrototypePanel({ prototype }: RollbackRecoveryPrototypePanelProps) {
  const flags = [
    ['rollback_recovery_candidate', String(prototype.rollback_recovery_candidate)],
    ['rollback_execution_approved', String(prototype.rollback_execution_approved)],
    ['rollback_executor_enabled', String(prototype.rollback_executor_enabled)],
    ['rollback_preflight_only', String(prototype.rollback_preflight_only)],
    ['actual_rollback_performed', String(prototype.actual_rollback_performed)],
    ['stage_permission', String(prototype.stage_permission)],
    ['commit_permission', String(prototype.commit_permission)],
    ['push_permission', String(prototype.push_permission)],
  ] as const;

  return (
    <section className="action-panel-block action-envelope-summary" aria-label="RollbackRecoveryPrototypePanel">
      <span className="action-panel-label">RollbackRecoveryPrototypePanel / disabled prototype</span>
      <h3>rollback_executor_enabled=false</h3>
      <p>Panel marker: RollbackRecoveryPrototypePanel</p>
      <p>{prototype.disabledReason}</p>

      <div className="import-status-grid" aria-label="disabled rollback prototype flags">
        {flags.map(([label, value]) => (
          <PrototypeMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="rollback approval packet snapshot">
        <section className="receipt-audit-card">
          <span className="action-panel-label">approval packet</span>
          <h3>{prototype.approvalPacket.approval_id}</h3>
          <dl className="action-field-list">
            <PrototypeField label="rollback_mode" value={prototype.approvalPacket.rollback_mode} />
            <PrototypeField label="rollback_type" value={prototype.approvalPacket.rollback_type} />
            <PrototypeField label="allowed_repo" value={prototype.approvalPacket.allowed_repo} />
            <PrototypeField label="allowed_cwd" value={prototype.approvalPacket.allowed_cwd} />
            <PrototypeField label="max_files" value={String(prototype.approvalPacket.max_files)} />
            <PrototypeField label="max_bytes" value={String(prototype.approvalPacket.max_bytes)} />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">target metadata</span>
          <h3>{prototype.targetMetadata.path}</h3>
          <dl className="action-field-list">
            <PrototypeField label="current_hash" value={prototype.targetMetadata.currentHash} />
            <PrototypeField label="preimage_hash" value={prototype.targetMetadata.preimageHash} />
            <PrototypeField
              label="expected_post_rollback_hash"
              value={prototype.targetMetadata.expectedPostRollbackHash}
            />
          </dl>
        </section>
      </div>

      <PrototypeList title="Disabled implementation plan" items={prototype.implementationPlan} />

      <div className="action-policy-footer">
        <span>Rollback preflight passed does not authorize rollback execution</span>
        <span>DemoScenario052 required for first rollback execution approval</span>
        <span>Rollback execution is mutation and requires separate Pro gate</span>
      </div>
    </section>
  );
}

function PrototypeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PrototypeField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PrototypeList({ title, items }: { title: string; items: readonly string[] }) {
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
