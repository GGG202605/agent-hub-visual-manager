import type { ParsedAgentHubViewModel } from '../types';

interface ParserPrototypePanelProps {
  viewModel: ParsedAgentHubViewModel;
}

export function ParserPrototypePanel({ viewModel }: ParserPrototypePanelProps) {
  const infoWarnings = viewModel.warnings.filter((warning) => warning.severity === 'info');
  const cautionWarnings = viewModel.warnings.filter((warning) => warning.severity === 'warning');
  const blockedWarnings = viewModel.blockedScenarios;

  return (
    <section className="action-panel-block action-gate-summary" aria-label="Fixture parser prototype result">
      <span className="action-panel-label">解析器原型 / Parser Prototype</span>
      <h3>Fixture-only read-only parser result</h3>
      <p>
        仅解析内置 synthetic fixture，输出 ParsedAgentHubViewModel；不读取真实 `.agent-hub`，不访问 filesystem，
        不连接 executor，不写入目标项目。
      </p>

      <div className="import-status-grid" aria-label="parser safety flags">
        <ParserMetric label="fixture_only_parser" value="true" />
        <ParserMetric label="real_agent_hub_import" value="false" />
        <ParserMetric label="fs_access" value="false" />
        <ParserMetric label="parser_state" value={viewModel.state} />
        <ParserMetric label="warnings" value={viewModel.warnings.length} />
        <ParserMetric label="blocked" value={viewModel.blockedScenarios.length} />
      </div>

      <div className="action-control-grid" aria-label="parsed fixture summary">
        <section className="receipt-audit-card">
          <span className="action-panel-label">解析结果 / Parsed result</span>
          <h3>{viewModel.fixtureId}</h3>
          <dl className="action-field-list">
            <ParserField label="project" value={viewModel.project.projectId} />
            <ParserField label="current_goal" value={viewModel.project.currentGoal} />
            <ParserField label="stable_baseline" value={viewModel.project.stableBaseline} />
            <ParserField label="parsed_files" value={String(viewModel.parsedFiles.length)} />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">下一步 / Next decision</span>
          <h3>{viewModel.nextDecision.optionId}</h3>
          <p>{viewModel.nextDecision.title}</p>
          <dl className="action-field-list">
            <ParserField label="status" value={viewModel.nextDecision.status} />
            <ParserField label="source" value={viewModel.nextDecision.sourcePath} />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">覆盖范围 / Coverage</span>
          <h3>project-state / tasks / runs / reviews / goals / receipts / next-decision</h3>
          <dl className="action-field-list">
            <ParserField label="project_state" value={String(viewModel.counts.projectState)} />
            <ParserField label="tasks" value={String(viewModel.counts.tasks)} />
            <ParserField label="runs" value={String(viewModel.counts.runs)} />
            <ParserField label="reviews" value={String(viewModel.counts.reviews)} />
            <ParserField label="goals" value={String(viewModel.counts.goals)} />
            <ParserField label="receipts" value={String(viewModel.counts.receipts)} />
            <ParserField label="next_decisions" value={String(viewModel.counts.nextDecisions)} />
          </dl>
        </section>
      </div>

      <div className="action-control-grid" aria-label="parser warnings and blocked scenarios">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Info / synthetic parser notes</span>
          <WarningList items={infoWarnings} emptyText="No info notes" />
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Warnings / fixture handling</span>
          <p>这些 warning 来自内置 fixture 场景，用于说明 parser 会如何提示用户；不是实时项目错误。</p>
          <WarningList items={cautionWarnings} emptyText="No warnings" />
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Blocked scenarios / synthetic safety stop</span>
          <p>Blocked 表示安全边界被 fixture 场景触发；不会读取真实路径，也不会执行修复动作。</p>
          <WarningList items={blockedWarnings} emptyText="No blocked scenarios" />
        </section>
      </div>

      <div className="receipt-audit-grid" aria-label="parser locked gates and test matrix">
        <section className="receipt-audit-card">
          <span className="action-panel-label">真实动作锁定 / Real action locks</span>
          <ul>
            {viewModel.lockedGates.map((gate) => (
              <li key={gate.gateId}>{gate.label}</li>
            ))}
          </ul>
        </section>

        <section className="receipt-audit-card" aria-label="parser test matrix result">
          <span className="action-panel-label">测试矩阵 / Test matrix</span>
          <p>Pass 代表 fixture-only parser 和 UI 表达覆盖该场景，不代表真实执行、真实导入或真实写入已获批准。</p>
          <ul>
            {viewModel.testMatrix.map((item) => (
              <li key={item.scenario}>
                <strong>{item.scenario}</strong> {item.result}: {item.evidence}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

function WarningList({ items, emptyText }: { items: ParsedAgentHubViewModel['warnings']; emptyText: string }) {
  if (items.length === 0) {
    return <p>{emptyText}</p>;
  }

  return (
    <ul>
      {items.map((warning) => (
        <li key={warning.warningId}>
          <strong>{warning.warningId}</strong> {warning.scenario}: {warning.message}
        </li>
      ))}
    </ul>
  );
}

function ParserMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ParserField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
