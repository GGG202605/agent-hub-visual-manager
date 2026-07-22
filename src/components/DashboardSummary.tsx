import type { DashboardState } from '../types';

interface DashboardSummaryProps {
  state: DashboardState;
}

const statusItems = [
  { label: 'current goal / phase', key: 'currentPhase' },
  { label: 'build gate', key: 'repoStatus' },
  { label: 'staged / commit gate', key: 'stagedStatus' },
  { label: 'push gate', key: 'pushStatus' },
  { label: 'baseline', key: 'latestCommit' },
] as const;

const governanceItems = [
  { label: 'data mode', key: 'dataMode' },
  { label: 'compression lane', key: 'compressionStatus' },
  { label: 'import model', key: 'importModelStatus' },
  { label: 'UI backlog', key: 'uiBacklogStatus' },
  { label: 'read boundary', key: 'readScope' },
  { label: 'action boundary', key: 'actionPolicy' },
  { label: 'next approval', key: 'nextDecision' },
] as const;

export function DashboardSummary({ state }: DashboardSummaryProps) {
  return (
    <section className="summary-card">
      <div className="summary-title">
        <p className="eyebrow">Status console</p>
        <h2>{state.projectNameZh}</h2>
        <span>{state.projectName}</span>
      </div>
      <dl className="summary-metrics">
        {statusItems.map((item) => (
          <div key={item.key} className="metric-block">
            <dt>{item.label}</dt>
            <dd>{state[item.key]}</dd>
          </div>
        ))}
      </dl>
      <dl className="summary-governance">
        {governanceItems.map((item) => (
          <div key={item.key}>
            <dt>{item.label}</dt>
            <dd>{state[item.key]}</dd>
          </div>
        ))}
      </dl>
      <div className="decision-strip">
        <div>
          <strong>{state.blockedCount}</strong>
          <span>blocked</span>
        </div>
        <div>
          <strong>{state.needsUserDecisionCount}</strong>
          <span>needs_user_decision</span>
        </div>
      </div>
      <div className="coordination-lanes">
        {state.coordinationLanes.map((lane) => (
          <article key={lane.id} className="coordination-lane">
            <div>
              <span className="lane-priority">{lane.priority}</span>
              <strong>{lane.label}</strong>
            </div>
            <p>{lane.note}</p>
            <span className={`gate-badge gate-${lane.state}`}>{lane.state}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
