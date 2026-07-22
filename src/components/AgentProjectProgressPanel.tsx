import { CheckCircle2, PauseCircle } from 'lucide-react';
import type { AgentFirstDashboardView } from '../types';

interface AgentProjectProgressPanelProps {
  dashboard: AgentFirstDashboardView;
}

export function AgentProjectProgressPanel({ dashboard }: AgentProjectProgressPanelProps) {
  return (
    <section className="agent-side-panel" aria-label="项目能力进度">
      <div className="agent-side-heading">
        <span>项目能力进度</span>
        <strong>本地闭环已到 Commit</strong>
      </div>

      <ol className="agent-progress-list">
        {dashboard.progress.map((item) => (
          <li key={item.label} className={`is-${item.status}`}>
            {item.status === 'paused' ? <PauseCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            <span>{item.label}</span>
            <strong>{item.summary}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
