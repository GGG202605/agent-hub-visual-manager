import type { ActionGatePilot } from '../types';

interface GateOverviewPanelProps {
  gatePilot: ActionGatePilot;
}

export function GateOverviewPanel({ gatePilot }: GateOverviewPanelProps) {
  return (
    <section className="action-panel-block action-gate-summary" aria-label="Gate Overview">
      <span className="action-panel-label">Gate Overview / 门禁总览</span>
      <h3>Metadata / Build / Write Gate</h3>
      <p>集中展示门禁状态；不提供真实 build、write、commit、push 或 executor 入口。</p>

      <div className="action-control-grid">
        {gatePilot.gateStatus.map((gate) => (
          <article key={gate.gateId} className="action-panel-block">
            <span className="action-panel-label">{gate.label}</span>
            <h3>{localizeStatus(gate.status)}</h3>
            <p>{gate.summary}</p>
            <dl className="action-field-list">
              <GateField label="evidence" value={gate.evidence} />
            </dl>
          </article>
        ))}
      </div>

      <div className="action-control-grid" aria-label="Stop Block Pass states">
        {gatePilot.stopPassBlock.map((item) => (
          <article key={item.gateId} className="action-panel-block">
            <span className="action-panel-label">{item.label}</span>
            <h3>{localizeStatus(item.status)}</h3>
            <p>{item.summary}</p>
            <small>{item.evidence}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function GateField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function localizeStatus(status: string) {
  const labels: Record<string, string> = {
    pass: '通过 / pass',
    blocked: '阻断 / blocked',
    needs_user_decision: '待用户决策 / needs_user_decision',
  };

  return labels[status] ?? status;
}
