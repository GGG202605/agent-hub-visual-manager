import type { StageExecutorPreflightView } from '../types';

interface StageExecutorPreflightPanelProps {
  preflight: StageExecutorPreflightView;
}

export function StageExecutorPreflightPanel({ preflight }: StageExecutorPreflightPanelProps) {
  const flags = [
    ['stage_executor_candidate', String(preflight.stage_executor_candidate)],
    ['stage_executor_enabled', String(preflight.stage_executor_enabled)],
    ['stage_execution_approved', String(preflight.stage_execution_approved)],
    ['stage_preflight_only', String(preflight.stage_preflight_only)],
    ['actual_stage_performed', String(preflight.actual_stage_performed)],
    ['commit_permission', String(preflight.commit_permission)],
    ['push_permission', String(preflight.push_permission)],
    ['receipt_status', preflight.receipt_status],
  ] as const;

  return (
    <section className="action-panel-block action-envelope-summary" aria-label="StageExecutorPreflightPanel">
      <span className="action-panel-label">StageExecutorPreflightPanel / disabled stage prototype</span>
      <h3>stage preflight only</h3>
      <p>Panel marker: StageExecutorPreflightPanel</p>
      <p>{preflight.summary}</p>

      <div className="import-status-grid" aria-label="stage preflight flags">
        {flags.map(([label, value]) => (
          <StageMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="stage preflight checks">
        {preflight.preflightChecks.map((item) => (
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

      <div className="action-policy-footer">
        {preflight.executionGateMessages.map((message) => (
          <span key={message}>{message}</span>
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
