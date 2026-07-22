import { ArrowRight, ShieldCheck } from 'lucide-react';
import type { AgentFirstDashboardView } from '../types';

interface AgentNextActionPanelProps {
  dashboard: AgentFirstDashboardView;
}

export function AgentNextActionPanel({ dashboard }: AgentNextActionPanelProps) {
  return (
    <section className="agent-side-panel" aria-label="下一步决策">
      <div className="agent-side-heading">
        <span>下一步决策</span>
        <strong>推荐继续 Agent UI 优化</strong>
      </div>

      <div className="agent-next-action-stack">
        {dashboard.nextActions.map((route) => (
          <article key={route.id} className={route.recommended ? 'is-recommended' : ''}>
            <div>
              <span>{route.recommended ? '推荐' : '备选'}</span>
              <h3>{route.title}</h3>
            </div>
            <p>{route.summary}</p>
            <dl>
              <div>
                <dt>负责 Agent</dt>
                <dd>{route.owner}</dd>
              </div>
              <div>
                <dt>审批</dt>
                <dd>{route.approval}</dd>
              </div>
            </dl>
            {route.risk === 'high' ? (
              <small>
                <ShieldCheck aria-hidden="true" />
                高风险路线必须另开 gate
              </small>
            ) : (
              <small>
                <ArrowRight aria-hidden="true" />
                可作为下一轮产品体验路线
              </small>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
