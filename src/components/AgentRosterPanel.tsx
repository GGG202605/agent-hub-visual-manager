import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getAgentPersona } from '../lib/agentPersonas';
import type { AgentFirstDashboardView, AgentFirstLayer, AgentRoleCardView } from '../types';

interface AgentRosterPanelProps {
  dashboard: AgentFirstDashboardView;
}

const LAYER_META: Record<AgentFirstLayer, { title: string; hint: string }> = {
  decision: { title: '战略层', hint: '统筹与收口' },
  execution: { title: '执行层', hint: '实现与推进' },
  audit: { title: '支持层', hint: '安全与复核' },
};

/**
 * v0.4 Agent 视图（名册式重排）：
 * 按层分组的紧凑行（人物名 + 角色 + 状态徽章），点击展开详情；
 * 替代 v0.3 的整卡片墙，信息密度与秩序感优先。
 */
export function AgentRosterPanel({ dashboard }: AgentRosterPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="agent-roster">
      {(['decision', 'execution', 'audit'] as const).map((layer) => {
        const members = dashboard.agents.filter((agent) => agent.layer === layer);
        if (members.length === 0) return null;
        return (
          <section key={layer} className={`roster-group is-${layer}`} aria-label={LAYER_META[layer].title}>
            <header className="roster-group-head">
              <strong>{LAYER_META[layer].title}</strong>
              <span>{LAYER_META[layer].hint}</span>
              <em>{members.length} 位</em>
            </header>
            <ul>
              {members.map((agent) => (
                <RosterRow
                  key={agent.id}
                  agent={agent}
                  expanded={expandedId === agent.id}
                  onToggle={() => setExpandedId((prev) => (prev === agent.id ? null : agent.id))}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function RosterRow({
  agent,
  expanded,
  onToggle,
}: {
  agent: AgentRoleCardView;
  expanded: boolean;
  onToggle: () => void;
}) {
  const persona = getAgentPersona(agent.code, agent.layer);

  return (
    <li className={`roster-row status-${agent.status}${expanded ? ' is-open' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={expanded}>
        <span className="roster-avatar" style={{ background: persona.robeColor }}>
          {persona.figure.slice(0, 1)}
        </span>
        <span className="roster-main">
          <strong>
            {persona.figure}
            <small>{agent.nameZh}</small>
          </strong>
          <span className="roster-role">{agent.roleTitle}</span>
        </span>
        <span className={`roster-status status-${agent.status}`}>{agent.statusLabel}</span>
        <ChevronDown className="roster-chevron" aria-hidden="true" />
      </button>
      {expanded ? (
        <div className="roster-detail">
          <p>{agent.taskSummary}</p>
          <dl>
            <div>
              <dt>最近证据</dt>
              <dd>{agent.recentEvidence}</dd>
            </div>
            <div>
              <dt>下一步</dt>
              <dd>{agent.nextAction}</dd>
            </div>
            <div>
              <dt>风险</dt>
              <dd>{agent.riskLabel}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </li>
  );
}
