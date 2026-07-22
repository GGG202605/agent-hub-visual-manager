import type { PhaseItem, PhaseStatus } from '../types';

interface PhaseTimelineProps {
  phases: PhaseItem[];
}

const statusLabel: Record<PhaseStatus, string> = {
  closed: '已关闭',
  committed: '已提交',
  in_review: '审核中',
  planned: '计划中',
  needs_user_decision: '需用户决策',
};

export function PhaseTimeline({ phases }: PhaseTimelineProps) {
  return (
    <section className="section-card phase-card">
      <div className="section-heading">
        <p className="eyebrow">Phase timeline</p>
        <h2>Phase 时间线</h2>
      </div>
      <ol className="timeline-list">
        {phases.map((phase) => (
          <li key={phase.id} className="timeline-item">
            <div className="timeline-marker" aria-hidden="true" />
            <div className="timeline-content">
              <div className="timeline-head">
                <div>
                  <h3>{phase.id}</h3>
                  <p>{phase.title}</p>
                </div>
                <span className={`status-badge status-${phase.status}`}>{statusLabel[phase.status]}</span>
              </div>
              <dl className="compact-meta">
                <div>
                  <dt>commit</dt>
                  <dd>{phase.commitHash}</dd>
                </div>
                <div>
                  <dt>closed</dt>
                  <dd>{phase.closed ? 'yes' : 'no'}</dd>
                </div>
                <div>
                  <dt>committed</dt>
                  <dd>{phase.committed ? 'yes' : 'no'}</dd>
                </div>
                <div>
                  <dt>decision</dt>
                  <dd>{phase.needsUserDecision ? 'needs_user_decision' : 'clear'}</dd>
                </div>
              </dl>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}