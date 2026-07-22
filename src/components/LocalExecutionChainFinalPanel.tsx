import type { LocalExecutionChainFinalView } from '../types';

interface LocalExecutionChainFinalPanelProps {
  finalChain: LocalExecutionChainFinalView;
}

export function LocalExecutionChainFinalPanel({ finalChain }: LocalExecutionChainFinalPanelProps) {
  const flags = [
    ['local_execution_chain_v0_1_final', String(finalChain.local_execution_chain_v0_1_final)],
    ['no_push_finalization', String(finalChain.no_push_finalization)],
    ['push_execution_excluded', String(finalChain.push_execution_excluded)],
    ['remote_configured', String(finalChain.remote_configured)],
    ['upstream_configured', String(finalChain.upstream_configured)],
    ['push_executor_executed', String(finalChain.push_executor_executed)],
  ] as const;

  return (
    <section className="action-panel-block action-selected-decision" aria-label="LocalExecutionChainFinalPanel">
      <span className="action-panel-label">LocalExecutionChainFinalPanel / v0.1 local closeout</span>
      <h3>Local execution chain v0.1 is finalized without push</h3>
      <p>Panel marker: LocalExecutionChainFinalPanel</p>
      <p>{finalChain.summary}</p>
      <p>{finalChain.futurePushGate}</p>

      <div className="import-status-grid" aria-label="local execution chain final flags">
        {flags.map(([label, value]) => (
          <FinalMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="capability maturity matrix">
        {finalChain.capabilityMatrix.map((item) => (
          <article key={item.capability} className="receipt-audit-card">
            <span className="action-panel-label">{item.lastVerifiedGoal}</span>
            <h3>{item.capability}</h3>
            <dl className="action-field-list">
              <FinalField label="status" value={item.status} />
              <FinalField label="evidence_type" value={item.evidenceType} />
              <FinalField label="remaining_risk" value={item.remainingRisk} />
              <FinalField label="next_gate_if_continued" value={item.nextGateIfContinued} />
            </dl>
          </article>
        ))}
      </div>

      <FinalList title="Final flags" items={finalChain.finalFlags} />
    </section>
  );
}

function FinalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FinalList({ title, items }: { title: string; items: readonly string[] }) {
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

function FinalField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
