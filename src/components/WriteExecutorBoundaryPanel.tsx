import type { WriteExecutorBoundaryView } from '../types';

interface WriteExecutorBoundaryPanelProps {
  boundary: WriteExecutorBoundaryView;
}

export function WriteExecutorBoundaryPanel({ boundary }: WriteExecutorBoundaryPanelProps) {
  return (
    <section className="action-panel-block action-selected-decision" aria-label="WriteExecutorBoundaryPanel">
      <span className="action-panel-label">WriteExecutorBoundaryPanel / selected-path write boundary</span>
      <h3>write_executor_enabled=false</h3>
      <p>Panel marker: WriteExecutorBoundaryPanel</p>
      <p>{boundary.summary}</p>

      <div className="dry-run-detail-grid" aria-label="selected-path write boundary lists">
        <BoundaryList title="Allowed now" items={boundary.allowedNow} />
        <BoundaryList title="Forbidden now" items={boundary.forbiddenNow} />
        <BoundaryList title="Future goal gates" items={boundary.futureGoalGates} />
        <BoundaryList title="Stop conditions" items={boundary.stopConditions} />
      </div>

      <div className="action-policy-footer">
        <strong>Preflight passed does not authorize write</strong>
        <span>actual_write_performed=false</span>
        <span>stage_permission=false</span>
        <span>commit_permission=false</span>
        <span>push_permission=false</span>
      </div>
    </section>
  );
}

function BoundaryList({ title, items }: { title: string; items: readonly string[] }) {
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
