import type { BoundaryState, GateState } from '../types';

interface ApprovalBoundaryPanelProps {
  boundaries: BoundaryState;
}

const gateLabel: Record<GateState, string> = {
  open: 'open',
  blocked: 'blocked',
  needs_user_decision: 'needs_user_decision',
};

export function ApprovalBoundaryPanel({ boundaries }: ApprovalBoundaryPanelProps) {
  return (
    <section className="section-card boundary-card">
      <div className="section-heading">
        <p className="eyebrow">Approval and boundaries</p>
        <h2>Build, approval, and action gates</h2>
      </div>
      <div className="boundary-notice">
        <strong>Architecture sketch only</strong>
        <p>This screen is display-only: B rules are candidate-only, A has no real .agent-hub import or parser, and C is mock UI refinement without filesystem, Git, npm, Wiki, or executor actions.</p>
      </div>
      <div className="boundary-columns">
        <ActionList title="allowed" items={boundaries.allowedActions} tone="allowed" />
        <ActionList title="denied" items={boundaries.deniedActions} tone="denied" />
        <ActionList title="needs_user_decision" items={boundaries.needsUserDecisionActions} tone="decision" />
      </div>
      <div className="gate-list">
        {boundaries.gates.map((gate) => (
          <div key={gate.name} className="gate-row">
            <div>
              <strong>{gate.name}</strong>
              <p>{gate.note}</p>
            </div>
            <span className={`gate-badge gate-${gate.state}`}>{gateLabel[gate.state]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionList({ title, items, tone }: { title: string; items: string[]; tone: 'allowed' | 'denied' | 'decision' }) {
  return (
    <div className={`action-list action-${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
