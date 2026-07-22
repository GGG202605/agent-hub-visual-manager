interface ReadonlyMetadataExecutorStabilityPanelProps {
  stability: ReadonlyMetadataExecutorStabilityView;
}

interface ReadonlyMetadataExecutorStabilityView {
  rounds_executed: number;
  consistency_status: string;
  zero_mutation_status: string;
  rounds: readonly ReadonlyMetadataStabilityRound[];
  receipt_diff_consistency: readonly ReadonlyMetadataConsistencyCheck[];
  write_executor_planning_gate: readonly WriteExecutorPlanningGateAnswer[];
  non_approvals: readonly string[];
}

interface ReadonlyMetadataStabilityRound {
  round: number;
  receipt_id: string;
  approval_id: string;
  receipt_status: string;
  receipt_qa_status: string;
  current_head: string;
  branch: string;
  status_summary: string;
  staged_summary: string;
  zero_mutation_assertion: boolean;
  actual_commands: readonly string[];
}

interface ReadonlyMetadataConsistencyCheck {
  check: string;
  status: string;
  evidence: string;
}

interface WriteExecutorPlanningGateAnswer {
  question: string;
  answer: string;
  status: string;
}

export function ReadonlyMetadataExecutorStabilityPanel({
  stability,
}: ReadonlyMetadataExecutorStabilityPanelProps) {
  const flags = [
    ['readonly_metadata_stability_panel_visible', 'true'],
    ['repeated_execution_rounds', String(stability.rounds_executed)],
    ['receipt_diff_consistency', stability.consistency_status],
    ['zero_mutation_status', stability.zero_mutation_status],
    ['write_executor_planning_gate_visible', 'true'],
    ['write_executor_implemented', 'false'],
    ['write_executor_executed', 'false'],
  ] as const;

  return (
    <section className="action-panel-block action-selected-decision" aria-label="Read-only metadata stability evidence">
      <span className="action-panel-label">DemoScenario044 / Read-only metadata stability</span>
      <h3>Repeated execution + receipt diff consistency passed</h3>
      <p>
        Three independent read-only metadata receipts were compared for HEAD, branch, clean status, empty staged area,
        exit codes, zero mutation, receipt QA, and command sequence consistency. The write-executor planning gate is
        documented here as planning only; no write executor is implemented or executed.
      </p>

      <div className="import-status-grid" aria-label="read-only metadata stability flags">
        {flags.map(([label, value]) => (
          <StabilityMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="read-only metadata stability rounds">
        {stability.rounds.map((round) => (
          <article key={round.approval_id} className="receipt-audit-card">
            <span className="action-panel-label">round {round.round}</span>
            <h3>{round.receipt_status}</h3>
            <dl className="action-field-list">
              <StabilityField label="receipt_id" value={round.receipt_id} />
              <StabilityField label="approval_id" value={round.approval_id} />
              <StabilityField label="HEAD" value={round.current_head} />
              <StabilityField label="branch" value={round.branch} />
              <StabilityField label="status" value={round.status_summary} />
              <StabilityField label="staged" value={round.staged_summary} />
              <StabilityField label="receipt_QA" value={round.receipt_qa_status} />
              <StabilityField label="zero_mutation" value={String(round.zero_mutation_assertion)} />
            </dl>
          </article>
        ))}
      </div>

      <div className="dry-run-detail-grid" aria-label="receipt diff consistency and write executor planning gate">
        <StabilityList
          title="Receipt diff consistency"
          items={stability.receipt_diff_consistency.map((check) => `${check.check}: ${check.status}; ${check.evidence}`)}
        />
        <StabilityList
          title="Actual metadata command plan"
          items={stability.rounds[0]?.actual_commands.map((command, index) => `${index + 1}. ${command}`) ?? []}
        />
        <StabilityList title="Non-approvals" items={stability.non_approvals} />
      </div>

      <section className="receipt-audit-card" aria-label="write executor planning gate">
        <span className="action-panel-label">Write-executor planning gate</span>
        <h3>planning only / no implementation</h3>
        <div className="action-control-grid">
          {stability.write_executor_planning_gate.map((item) => (
            <article key={item.question} className="receipt-audit-card">
              <span className="action-panel-label">{item.status}</span>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="action-policy-footer">
        <strong>Executor result remains read-only.</strong>
        <span>Repeated execution did not expand command, shell, filesystem, npm, Git, Wiki, or write permissions.</span>
        <span>Write-executor planning gate is visible but not approval to implement or execute a write executor.</span>
      </div>
    </section>
  );
}

function StabilityMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StabilityField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StabilityList({ title, items }: { title: string; items: readonly string[] }) {
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
