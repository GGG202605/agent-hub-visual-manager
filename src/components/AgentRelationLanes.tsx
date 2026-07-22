import { ArrowRight, Layers3 } from 'lucide-react';
import type { AgentFirstDashboardView, AgentRelationViewModel } from '../types';

interface AgentRelationLanesProps {
  dashboard: AgentFirstDashboardView;
  relations: readonly AgentRelationViewModel[];
}

const RELATION_STATUS_LABELS = {
  active: '进行中',
  waiting: '等待中',
  blocked: '已暂停',
  complete: '已完成',
} as const;

/**
 * v0.2 关系车道（DemoScenario012-E）：三条水平层带 + 类型化关系行。
 * 纯 CSS/HTML 实现，按控制项目建议避免引入图形库。
 */
export function AgentRelationLanes({ dashboard, relations }: AgentRelationLanesProps) {
  return (
    <section className="agent-relation-lanes" aria-label="Agent 协作关系车道">
      <div className="agent-section-heading">
        <span>协作关系</span>
        <h2>三层车道与类型化协同路径</h2>
      </div>

      <div className="relation-lane-bands">
        {dashboard.hierarchy.map((layer) => (
          <div key={layer.layer} className={`relation-lane-band is-${layer.layer}`}>
            <div className="relation-lane-title">
              <Layers3 aria-hidden="true" />
              <strong>{layer.title}</strong>
              <span>{layer.subtitle}</span>
            </div>
            <div className="relation-lane-agents">
              {layer.agents.map((agentId) => {
                const agent = dashboard.agents.find((item) => item.id === agentId);
                return agent ? (
                  <span key={agent.id} className={`relation-lane-agent is-${agent.status}`}>
                    {agent.nameZh}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="relation-typed-list" aria-label="类型化协同路径">
        {relations.map((relation) => (
          <div key={relation.id} className={`relation-typed-row is-${relation.type} is-${relation.status}`}>
            <span className="relation-type-chip">{relation.typeLabel}</span>
            <strong>{relation.fromAgent}</strong>
            <span className="relation-arrow">
              <ArrowRight aria-hidden="true" />
              {relation.label}
            </span>
            <strong>{relation.toAgent}</strong>
            <span className="relation-status-chip">{RELATION_STATUS_LABELS[relation.status]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
