import type { SelectedPathWriteExecutorPrototypeView } from '../types';

interface SelectedPathWriteExecutorPrototypePanelProps {
  prototype: SelectedPathWriteExecutorPrototypeView;
}

export function SelectedPathWriteExecutorPrototypePanel({
  prototype,
}: SelectedPathWriteExecutorPrototypePanelProps) {
  const hardFlags = [
    ['selected_path_write_executor_candidate', String(prototype.selected_path_write_executor_candidate)],
    ['write_executor_enabled', String(prototype.write_executor_enabled)],
    ['write_execution_approved', String(prototype.write_execution_approved)],
    ['preflight_only', String(prototype.preflight_only)],
    ['actual_write_performed', String(prototype.actual_write_performed)],
    ['stage_permission', String(prototype.stage_permission)],
    ['commit_permission', String(prototype.commit_permission)],
    ['push_permission', String(prototype.push_permission)],
    ['npm_permission', String(prototype.npm_permission)],
    ['package_config_css_dependency_change', String(prototype.package_config_css_dependency_change)],
  ] as const;

  return (
    <section className="action-panel-block action-envelope-summary" aria-label="SelectedPathWriteExecutorPrototypePanel">
      <span className="action-panel-label">SelectedPathWriteExecutorPrototypePanel / disabled prototype</span>
      <h3>selected_path_write_executor_candidate=true</h3>
      <p>Panel marker: SelectedPathWriteExecutorPrototypePanel</p>
      <p>{prototype.disabled_reason}</p>

      <div className="import-status-grid" aria-label="disabled selected-path write flags">
        {hardFlags.map(([label, value]) => (
          <PrototypeMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="selected-path write packet snapshot">
        <section className="receipt-audit-card">
          <span className="action-panel-label">approval packet</span>
          <h3>{prototype.approvalPacket.approval_id}</h3>
          <dl className="action-field-list">
            <PrototypeField label="executor_mode" value={prototype.approvalPacket.executor_mode} />
            <PrototypeField label="allowed_repo" value={prototype.approvalPacket.allowed_repo} />
            <PrototypeField label="allowed_cwd" value={prototype.approvalPacket.allowed_cwd} />
            <PrototypeField label="mutation_expectation" value={prototype.approvalPacket.mutation_expectation} />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">approved fixture target</span>
          <h3>{prototype.targetMetadata.path}</h3>
          <dl className="action-field-list">
            <PrototypeField label="byte_size" value={String(prototype.targetMetadata.byteSize)} />
            <PrototypeField label="preimage_sha256" value={prototype.targetMetadata.preimageSha256} />
            <PrototypeField label="max_files" value={String(prototype.approvalPacket.max_files)} />
            <PrototypeField label="max_bytes" value={String(prototype.approvalPacket.max_bytes)} />
          </dl>
        </section>
      </div>

      <div className="dry-run-detail-grid" aria-label="disabled selected-path write implementation plan">
        <PrototypeList title="Implementation plan" items={prototype.implementationPlan} />
        <PrototypeList title="Next gates" items={prototype.nextGateMessages} />
        <PrototypeList title="Stop conditions" items={prototype.approvalPacket.stop_conditions} />
      </div>

      <div className="action-policy-footer">
        <strong>Preflight passed does not authorize write</strong>
        <span>DemoScenario046 required for first write target approval</span>
        <span>DemoScenario047 required for first selected-path write execution</span>
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
