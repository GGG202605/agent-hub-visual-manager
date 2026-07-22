import type { NoPushFinalizationView } from '../types';

interface NoPushFinalizationPanelProps {
  finalization: NoPushFinalizationView;
}

export function NoPushFinalizationPanel({ finalization }: NoPushFinalizationPanelProps) {
  const flags = [
    ['no_push_finalization', String(finalization.no_push_finalization)],
    ['push_execution_excluded', String(finalization.push_execution_excluded)],
    ['remote_configured', String(finalization.remote_configured)],
    ['upstream_configured', String(finalization.upstream_configured)],
    ['push_executor_executed', String(finalization.push_executor_executed)],
    ['git_push_executed', String(finalization.git_push_executed)],
  ] as const;

  return (
    <section className="action-panel-block action-selected-decision" aria-label="NoPushFinalizationPanel">
      <span className="action-panel-label">NoPushFinalizationPanel / Route B</span>
      <h3>{finalization.route}</h3>
      <p>Panel marker: NoPushFinalizationPanel</p>
      <p>{finalization.conclusion}</p>

      <div className="import-status-grid" aria-label="no push finalization flags">
        {flags.map(([label, value]) => (
          <NoPushMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="no push finalization evidence">
        <NoPushList title="Evidence" items={finalization.evidence} />
        <NoPushList title="Future push requirements" items={finalization.futurePushRequirements} />
      </div>
    </section>
  );
}

function NoPushMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NoPushList({ title, items }: { title: string; items: readonly string[] }) {
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
