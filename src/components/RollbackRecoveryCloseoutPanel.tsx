import type { RollbackRecoveryCloseoutView } from '../types';

interface RollbackRecoveryCloseoutPanelProps {
  closeout: RollbackRecoveryCloseoutView;
}

export function RollbackRecoveryCloseoutPanel({ closeout }: RollbackRecoveryCloseoutPanelProps) {
  return (
    <section className="action-panel-block action-selected-decision" aria-label="RollbackRecoveryCloseoutPanel">
      <span className="action-panel-label">RollbackRecoveryCloseoutPanel / v0.1 closeout</span>
      <h3>{closeout.status}</h3>
      <p>Panel marker: RollbackRecoveryCloseoutPanel</p>
      <p>{closeout.summary}</p>

      <div className="dry-run-detail-grid" aria-label="rollback recovery closeout lists">
        <CloseoutList title="Completed scope" items={closeout.completedScope} />
        <CloseoutList title="Remaining boundaries" items={closeout.remainingBoundaries} />
        <CloseoutList title="DemoScenario052 scope" items={closeout.DemoScenario052Scope} />
      </div>

      <div className="action-policy-footer">
        <strong>{closeout.nextDecision}</strong>
        <span>DemoScenario052 required for first rollback execution approval</span>
        <span>Rollback execution is mutation and requires separate Pro gate</span>
        <span>rollback_execution_approved=false</span>
      </div>
    </section>
  );
}

function CloseoutList({ title, items }: { title: string; items: readonly string[] }) {
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
