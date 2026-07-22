import type { MultiFileWriteExecutorView } from '../types';

interface MultiFileWriteExecutorPanelProps {
  multiFileWrite: MultiFileWriteExecutorView;
}

export function MultiFileWriteExecutorPanel({ multiFileWrite }: MultiFileWriteExecutorPanelProps) {
  const flags = [
    ['multi_file_selected_path_write', String(multiFileWrite.multi_file_selected_path_write)],
    ['write_executor_enabled', String(multiFileWrite.write_executor_enabled)],
    ['write_execution_approved', String(multiFileWrite.write_execution_approved)],
    ['actual_write_performed', String(multiFileWrite.actual_write_performed)],
    ['max_files', String(multiFileWrite.max_files)],
    ['max_bytes_total', String(multiFileWrite.max_bytes_total)],
    ['stage_permission', String(multiFileWrite.stage_permission)],
    ['commit_permission', String(multiFileWrite.commit_permission)],
    ['push_permission', String(multiFileWrite.push_permission)],
  ] as const;

  return (
    <section className="action-panel-block action-selected-decision" aria-label="MultiFileWriteExecutorPanel">
      <span className="action-panel-label">MultiFileWriteExecutorPanel / two-file selected path write</span>
      <h3>multi-file write: {multiFileWrite.receipt.receipt_status}</h3>
      <p>Panel marker: MultiFileWriteExecutorPanel</p>
      <p>{multiFileWrite.summary}</p>

      <div className="import-status-grid" aria-label="multi-file write flags">
        {flags.map(([label, value]) => (
          <WriteMetric key={label} label={label} value={value} />
        ))}
      </div>

      <section className="receipt-audit-card" aria-label="multi-file approval packet">
        <span className="action-panel-label">approval packet</span>
        <h3>{multiFileWrite.approvalPacket.approval_id}</h3>
        <dl className="action-field-list">
          <WriteField label="executor_mode" value={multiFileWrite.approvalPacket.executor_mode} />
          <WriteField label="allowed_repo" value={multiFileWrite.approvalPacket.allowed_repo} />
          <WriteField label="allowed_targets" value={multiFileWrite.approvalPacket.allowed_target_paths.join(', ')} />
          <WriteField label="expected_diff" value={multiFileWrite.approvalPacket.expected_diff_summary} />
          <WriteField label="rollback_strategy" value={multiFileWrite.approvalPacket.rollback_strategy} />
        </dl>
      </section>
    </section>
  );
}

function WriteMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WriteField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
