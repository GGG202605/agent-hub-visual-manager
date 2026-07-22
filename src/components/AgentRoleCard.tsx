import { CheckCircle2, CircleDot, Clock3, PauseCircle } from 'lucide-react';
import type { AgentRoleCardView } from '../types';

interface AgentRoleCardProps {
  agent: AgentRoleCardView;
}

const statusIcon = {
  completed: CheckCircle2,
  standby: CircleDot,
  awaiting_approval: Clock3,
  blocked: PauseCircle,
} as const;

export function AgentRoleCard({ agent }: AgentRoleCardProps) {
  const Icon = statusIcon[agent.status];

  return (
    <article className={`agent-role-card is-${agent.status}`} aria-label={`${agent.nameZh} card`}>
      <div className="agent-card-topline">
        <span className="agent-avatar">{agent.code.replace('AG-', '').slice(0, 2)}</span>
        <div>
          <strong>{agent.nameZh}</strong>
          <small>{agent.code}</small>
        </div>
        <span className="agent-status-badge">
          <Icon aria-hidden="true" />
          {agent.statusLabel}
        </span>
      </div>

      <p className="agent-role-title">{agent.roleTitle}</p>
      <p className="agent-task-summary">{agent.taskSummary}</p>

      <dl className="agent-card-facts">
        <div>
          <dt>最近证据</dt>
          <dd>{agent.recentEvidence}</dd>
        </div>
        <div>
          <dt>下一步</dt>
          <dd>{agent.nextAction}</dd>
        </div>
      </dl>

      <div className="agent-card-footer">
        <span className={`agent-risk-tag risk-${agent.riskLevel}`}>{agent.riskLabel}</span>
        <span>{agent.connections.length} 条协作关系</span>
      </div>
    </article>
  );
}
