import type { ExecutorSandboxBoundaryView } from '../types';

interface ExecutorSandboxBoundaryPanelProps {
  boundary: ExecutorSandboxBoundaryView;
}

export function ExecutorSandboxBoundaryPanel({ boundary }: ExecutorSandboxBoundaryPanelProps) {
  const flags = [
    ['sandbox_mode', boundary.sandboxMode],
    ['noop_executor_fixture', 'true'],
    ['executor_mode', 'noop_fixture'],
    ['simulated_only', 'true'],
    ['real_executor_implemented', 'false'],
    ['readonly_metadata_executor_prototype', 'true'],
    ['executor_executed', 'false'],
    ['allowed_commands_count', '5'],
    ['executor_implemented', String(boundary.executorImplemented)],
    ['executor_permission', String(boundary.executorPermission)],
    ['shell_access', 'false'],
    ['npm_action', 'false'],
    ['git_action', 'false'],
    ['write_action', 'false'],
    ['external_action', 'false'],
    ['write_permission', String(boundary.writePermission)],
    ['stage_permission', 'false'],
    ['commit_permission', 'false'],
    ['git_action_permission', String(boundary.gitActionPermission)],
    ['npm_action_permission', String(boundary.npmActionPermission)],
    ['push_permission', String(boundary.pushPermission)],
    ['auto_execute_enabled', 'false'],
    ['auto_send_enabled', 'false'],
  ] as const;

  return (
    <section className="action-panel-block action-envelope-summary" aria-label="Executor sandbox boundary panel">
      <span className="action-panel-label">执行器沙箱边界 / Executor Sandbox Boundary</span>
      <h3>Executor Sandbox Boundary / real executor is not implemented</h3>
      <p>
        Human approval remains required before any real action. 本轮只开放 noop_fixture simulated receipt；
        不连接 real executor，不运行命令，不写入文件，不触发 Git/npm/Wiki/push。
      </p>

      <div className="import-status-grid" aria-label="executor sandbox flags">
        {flags.map(([label, value]) => (
          <SandboxMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="dry-run-summary-grid" aria-label="executor action levels">
        {boundary.actionLevels.map((level) => (
          <div key={level.level}>
            <span>{level.level} / allowed={String(level.allowedInCurrentGoal)}</span>
            <strong>{level.label}</strong>
            <small>{level.requiredApproval}</small>
            <small>{level.boundary}</small>
          </div>
        ))}
      </div>

      <div className="dry-run-detail-grid" aria-label="executor sandbox architecture lists">
        <SandboxList title="前置条件 / Preconditions" items={boundary.preconditions} />
        <SandboxList title="停止条件 / Stop conditions" items={boundary.stopConditions} />
        <SandboxList title="回执要求 / Receipt requirements" items={boundary.receiptRequirements} />
        <SandboxList title="回滚与恢复 / Rollback and recovery" items={boundary.rollbackRecoveryRequirements} />
        <SandboxList title="本轮不实现原因 / Why not now" items={boundary.whyNotImplementedThisGoal} />
      </div>

      <div className="action-policy-footer">
        <strong>DemoScenario040 recommendation</strong>
        <span>{boundary.DemoScenario034Recommendation}</span>
        <span>Action queue and sandbox boundary remain planning artifacts only.</span>
      </div>
    </section>
  );
}

function SandboxMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SandboxList({ title, items }: { title: string; items: string[] }) {
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
