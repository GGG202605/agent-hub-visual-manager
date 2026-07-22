import type { BuildExecutorView } from '../types';

interface BuildExecutorPanelProps {
  buildExecutor: BuildExecutorView;
}

export function BuildExecutorPanel({ buildExecutor }: BuildExecutorPanelProps) {
  const flags = [
    ['build_executor_v0_1', String(buildExecutor.build_executor_v0_1)],
    ['build_executor_implemented', String(buildExecutor.build_executor_implemented)],
    ['build_executor_executed', String(buildExecutor.build_executor_executed)],
    ['allowed_command', buildExecutor.allowed_command],
    ['shell', String(buildExecutor.shell)],
    ['npm_install_update_allowed', String(buildExecutor.npm_install_update_allowed)],
    ['dev_preview_test_allowed', String(buildExecutor.dev_preview_test_allowed)],
    ['stage_permission', String(buildExecutor.stage_permission)],
    ['commit_permission', String(buildExecutor.commit_permission)],
    ['push_permission', String(buildExecutor.push_permission)],
  ] as const;

  return (
    <section className="action-panel-block action-envelope-summary" aria-label="BuildExecutorPanel">
      <span className="action-panel-label">BuildExecutorPanel / build executor v0.1</span>
      <h3>build executor: {buildExecutor.allowed_command}</h3>
      <p>Panel marker: BuildExecutorPanel</p>
      <p>{buildExecutor.summary}</p>

      <div className="import-status-grid" aria-label="build executor flags">
        {flags.map(([label, value]) => (
          <ExecutorMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="dry-run-detail-grid" aria-label="build executor policy">
        <ExecutorList title="Allowed commands" items={buildExecutor.allowedCommands} />
        <ExecutorList title="Forbidden commands" items={buildExecutor.forbiddenCommands} />
        <ExecutorList title="Receipt requirements" items={buildExecutor.receiptRequirements} />
        <ExecutorList title="Artifact policy" items={buildExecutor.artifactPolicy} />
      </div>
    </section>
  );
}

function ExecutorMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ExecutorList({ title, items }: { title: string; items: readonly string[] }) {
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
