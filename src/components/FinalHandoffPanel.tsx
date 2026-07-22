import type { FinalHandoffView } from '../types';

interface FinalHandoffPanelProps {
  handoff: FinalHandoffView;
}

export function FinalHandoffPanel({ handoff }: FinalHandoffPanelProps) {
  const flags = [
    ['final_handoff_package', String(handoff.final_handoff_package)],
    ['control_project_head', handoff.control_project_head],
    ['second_project_head', handoff.second_project_head],
  ] as const;

  return (
    <section className="action-panel-block action-gate-summary" aria-label="FinalHandoffPanel">
      <span className="action-panel-label">FinalHandoffPanel / handoff package</span>
      <h3>Final handoff package</h3>
      <p>Panel marker: FinalHandoffPanel</p>
      <p>{handoff.noPushFinalizationConclusion}</p>

      <div className="import-status-grid" aria-label="final handoff heads">
        {flags.map(([label, value]) => (
          <HandoffMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="final handoff package lists">
        <HandoffList title="Completed capabilities" items={handoff.completedCapabilities} />
        <HandoffList title="Unfinished capabilities" items={handoff.unfinishedCapabilities} />
        <HandoffList title="Forbidden carryover permissions" items={handoff.forbiddenCarryoverPermissions} />
        <HandoffList title="Context recovery" items={handoff.contextRecovery} />
      </div>

      <section className="receipt-audit-card" aria-label="next chat startup instruction">
        <span className="action-panel-label">next chat</span>
        <h3>Startup instruction</h3>
        <dl className="action-field-list">
          <HandoffField label="instruction" value={handoff.nextChatStartupInstruction} />
        </dl>
      </section>
    </section>
  );
}

function HandoffMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HandoffList({ title, items }: { title: string; items: readonly string[] }) {
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

function HandoffField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
