import type { FinalExecutionChainCloseoutView } from '../types';

interface FinalExecutionChainCloseoutPanelProps {
  closeout: FinalExecutionChainCloseoutView;
}

export function FinalExecutionChainCloseoutPanel({ closeout }: FinalExecutionChainCloseoutPanelProps) {
  const flags = [
    ['status', closeout.status],
    ['push_executed', String(closeout.push_executed)],
    ['push_executor_implemented', String(closeout.push_executor_implemented)],
    ['push_execution_approved', String(closeout.push_execution_approved)],
    ['actual_push_performed', String(closeout.actual_push_performed)],
    ['build_passed', String(closeout.build_passed)],
    ['browser_smoke_passed', String(closeout.browser_smoke_passed)],
    ['AG-SEC', closeout.ag_sec_findings],
    ['AG-REVIEW', closeout.ag_review_findings],
    ['Pro', closeout.pro_closeout],
    ['credential_or_token_printed', String(closeout.credential_or_token_printed)],
    ['force_tags_mirror_attempted', String(closeout.force_tags_mirror_attempted)],
    ['LLM_Wiki_real_data_other_project', String(closeout.llm_wiki_real_data_other_project)],
  ] as const;

  return (
    <section className="action-panel-block action-selected-decision" aria-label="FinalExecutionChainCloseoutPanel">
      <span className="action-panel-label">FinalExecutionChainCloseoutPanel / DemoScenario006 closeout</span>
      <h3>{closeout.status}</h3>
      <p>Panel marker: FinalExecutionChainCloseoutPanel</p>
      <p>{closeout.summary}</p>

      <div className="import-status-grid" aria-label="final execution chain closeout flags">
        {flags.map(([label, value]) => (
          <CloseoutMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="final execution chain evidence">
        <CloseoutList title="Completed scope" items={closeout.completedScope} />
        <CloseoutList title="Remaining blockers" items={closeout.remainingBlockers} />
      </div>

      <section className="receipt-audit-card" aria-label="next push decision">
        <span className="action-panel-label">{closeout.closeout_id}</span>
        <h3>Fresh remote target approval required</h3>
        <dl className="action-field-list">
          <CloseoutField label="next_recommendation" value={closeout.nextRecommendation} />
        </dl>
      </section>
    </section>
  );
}

function CloseoutMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function CloseoutField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
