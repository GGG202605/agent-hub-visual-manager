import type { ReadonlyMetadataExecutorPrototypeView } from '../types';
import { readonlyMetadataExecutorPrototypeView } from '../lib/readonlyMetadataExecutorContract';

interface ReadonlyMetadataExecutorPrototypePanelProps {
  prototype?: ReadonlyMetadataExecutorPrototypeView;
  executionStatusNote?: string;
}

export function ReadonlyMetadataExecutorPrototypePanel({
  prototype = readonlyMetadataExecutorPrototypeView,
  executionStatusNote,
}: ReadonlyMetadataExecutorPrototypePanelProps) {
  const flags = [
    ['readonly_metadata_executor_prototype', String(prototype.readonly_metadata_executor_prototype)],
    ['prototype_implemented', String(prototype.prototype_implemented)],
    ['prototype_executed', String(prototype.prototype_executed)],
    ['executor_executed', String(prototype.executor_executed)],
    ['allowed_commands_count', String(prototype.allowedCommandsCount)],
    ['shell_mode', String(prototype.shellMode)],
    ['write_permission', String(prototype.writePermission)],
    ['stage_permission', String(prototype.stagePermission)],
    ['commit_permission', String(prototype.commitPermission)],
    ['push_permission', String(prototype.pushPermission)],
    ['npm_permission', String(prototype.npmPermission)],
    ['backend_fs_permission', String(prototype.backendFsPermission)],
    ['local_path_read_permission', String(prototype.localPathReadPermission)],
  ] as const;

  return (
    <section className="action-panel-block action-envelope-summary" aria-label="Read-only metadata executor prototype">
      <span className="action-panel-label">DemoScenario040 / Read-only metadata executor prototype</span>
      <h3>{prototype.statusMessage}</h3>
      <p>{prototype.nextGateMessage}</p>
      {executionStatusNote ? <p>{executionStatusNote}</p> : null}

      <div className="import-status-grid" aria-label="read-only metadata executor required flags">
        {flags.map(([label, value]) => (
          <PrototypeMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="read-only metadata executor scope">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Fixed repo / cwd</span>
          <h3>single fixed target only</h3>
          <dl className="action-field-list">
            <PrototypeField label="allowed_repo" value={prototype.allowedRepo} />
            <PrototypeField label="allowed_cwd" value={prototype.allowedCwd} />
            <PrototypeField label="spawn_policy" value="executable plus argv only; shell=false" />
            <PrototypeField label="receipt_status" value={prototype.receiptPreview.receipt_status} />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Receipt preview</span>
          <h3>{prototype.receiptPreview.receipt_status}</h3>
          <dl className="action-field-list">
            <PrototypeField label="executed_command_count" value={String(prototype.receiptPreview.executed_command_count)} />
            <PrototypeField label="files_changed_count" value={String(prototype.receiptPreview.files_changed_count)} />
            <PrototypeField label="no_file_change_assertion" value={String(prototype.receiptPreview.no_file_change_assertion)} />
            <PrototypeField label="command_results" value={String(prototype.receiptPreview.command_results.length)} />
          </dl>
        </section>
      </div>

      <section className="receipt-audit-card" aria-label="read-only metadata command allowlist">
        <span className="action-panel-label">Command allowlist descriptors</span>
        <h3>read-only metadata only</h3>
        <div className="action-control-grid">
          {prototype.allowedCommands.map((command) => (
            <article key={command.id} className="receipt-audit-card">
              <span className="action-panel-label">{command.id}</span>
              <h3>{command.label}</h3>
              <dl className="action-field-list">
                <PrototypeField label="executable" value={command.executable} />
                <PrototypeField label="argv" value={command.argv.join(' ')} />
                <PrototypeField label="shell" value={String(command.shell)} />
                <PrototypeField label="cwd_policy" value={command.cwdPolicy} />
                <PrototypeField label="mutation_risk" value={command.mutationRisk} />
              </dl>
              <p>{command.purpose}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="dry-run-detail-grid" aria-label="prototype safety details">
        <PrototypeList title="Safety notes" items={prototype.safetyNotes} />
        <PrototypeList title="Forbidden actions" items={prototype.forbiddenActions} />
        <PrototypeList title="Redaction hooks" items={prototype.receiptPreview.redaction_hooks} />
        {prototype.receiptPreview.stop_retry_policy ? (
          <PrototypeList
            title="Stop-retry policy"
            items={prototype.receiptPreview.stop_retry_policy.map(
              (item) => `${item.condition}: ${item.outcome}; retry=${item.retry}`,
            )}
          />
        ) : null}
        {prototype.receiptPreview.receipt_qa_required_fields ? (
          <PrototypeList title="Receipt QA required fields" items={prototype.receiptPreview.receipt_qa_required_fields} />
        ) : null}
      </div>

      <div className="action-policy-footer">
        <strong>DemoScenario043 hardening policy is visible.</strong>
        <span>Write executor and push still require a separate future approval.</span>
        <span>{prototype.receiptPreview.output_summary_placeholder}</span>
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
