import type { ReadonlyMetadataExecutorExecutionReceipt } from '../types';

interface ReadonlyMetadataExecutorReceiptPanelProps {
  receipt: ReadonlyMetadataExecutorExecutionReceipt;
}

export function ReadonlyMetadataExecutorReceiptPanel({ receipt }: ReadonlyMetadataExecutorReceiptPanelProps) {
  const exitCodes = Object.entries(receipt.command_exit_codes);
  const flags = [
    ['readonly_metadata_executor_receipt', 'true'],
    ['executor_mode', receipt.executor_mode],
    ['receipt_status', receipt.receipt_status],
    ['receipt_qa_status', receipt.receipt_qa_status],
    ['executor_executed', 'true'],
    ['zero_mutation_assertion', String(receipt.zero_mutation_assertion)],
    ['actual_commands_count', String(receipt.actual_commands.length)],
    ['status_summary', receipt.status_summary],
    ['staged_summary', receipt.staged_summary],
    ['write_permission', 'false'],
    ['stage_permission', 'false'],
    ['commit_permission', 'false'],
    ['push_permission', 'false'],
  ] as const;

  return (
    <section className="action-panel-block action-selected-decision" aria-label="Read-only metadata executor receipt">
      <span className="action-panel-label">DemoScenario044 / Latest read-only metadata receipt</span>
      <h3>Stop-retry policy + receipt QA still verified</h3>
      <p>
        The executor remains read-only: fixed metadata allowlist, argv descriptors, shell=false, zero mutation, and
        receipt QA required before any success claim. No write, stage, commit, push, npm, backend filesystem read,
        private knowledge base, or real data action is represented by this receipt.
      </p>

      <div className="import-status-grid" aria-label="read-only metadata executor receipt flags">
        {flags.map(([label, value]) => (
          <ReceiptMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="read-only metadata executor receipt summary">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Receipt</span>
          <h3>{receipt.receipt_id}</h3>
          <dl className="action-field-list">
            <ReceiptField label="allowed_cwd" value={receipt.allowed_cwd} />
            <ReceiptField label="approval_id" value={receipt.approval_id} />
            <ReceiptField label="baseline_head" value={receipt.baseline_head} />
            <ReceiptField label="current_head" value={receipt.current_head} />
            <ReceiptField label="branch" value={receipt.branch} />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Zero mutation</span>
          <h3>{String(receipt.zero_mutation_assertion)}</h3>
          <dl className="action-field-list">
            <ReceiptField label="baseline_status_short" value={receipt.mutation_checks.baseline_status_short || 'empty'} />
            <ReceiptField label="post_status_short" value={receipt.mutation_checks.post_status_short || 'empty'} />
            <ReceiptField label="baseline_staged" value={receipt.mutation_checks.baseline_staged || 'empty'} />
            <ReceiptField label="post_staged" value={receipt.mutation_checks.post_staged || 'empty'} />
          </dl>
        </section>
      </div>

      <section className="receipt-audit-card" aria-label="actual metadata commands">
        <span className="action-panel-label">Actual commands</span>
        <h3>allowlist only</h3>
        <div className="action-control-grid">
          {receipt.command_results.map((result) => (
            <article key={result.step} className="receipt-audit-card">
              <span className="action-panel-label">{result.step}</span>
              <h3>{result.command}</h3>
              <dl className="action-field-list">
                <ReceiptField label="argv" value={result.argv.join(' ')} />
                <ReceiptField label="shell" value={String(result.shell)} />
                <ReceiptField label="exit_code" value={String(result.exit_code)} />
                <ReceiptField label="stdout" value={result.stdout || 'empty'} />
                <ReceiptField label="stderr_summary" value={result.stderr_summary || 'empty'} />
              </dl>
            </article>
          ))}
        </div>
      </section>

      <div className="dry-run-detail-grid" aria-label="receipt stop checks and exit codes">
        <ReceiptList title="Exit codes" items={exitCodes.map(([step, code]) => `${step}=${code}`)} />
        <ReceiptList title="Stop checks" items={Object.entries(receipt.stop_checks).map(([check, value]) => `${check}=${value}`)} />
        <ReceiptList title="Redaction status" items={[receipt.redaction_status]} />
      </div>

      <div className="dry-run-detail-grid" aria-label="hardening stop retry policy and receipt QA">
        <ReceiptList
          title="Stop-retry policy"
          items={receipt.stop_retry_policy.map(
            (item) => `${item.condition}: ${item.outcome}; retry=${item.retry}; receipt=${item.receipt_status}`,
          )}
        />
        <ReceiptList
          title="Receipt QA policy"
          items={receipt.receipt_qa_checks.map((check) => `${check.field}=${check.status}`)}
        />
        <ReceiptList
          title="Blocked / failed / retry-not-allowed scenarios"
          items={receipt.hardening_scenarios.map((scenario) => `${scenario.scenario}: ${scenario.outcome}; retry=${scenario.retry}`)}
        />
      </div>

      <div className="action-policy-footer">
        <strong>No mutation occurred.</strong>
        <span>command mismatch, cwd mismatch, dirty repo, staged files, receipt missing fields, HEAD/status mismatch, and redaction failure are blocked.</span>
        <span>command timeout is failed and requires manual reauthorization before retry; command exit nonzero is failed with no automatic retry.</span>
        <span>Write, stage, commit, push, npm, backend fs, private knowledge base, and real data actions remain blocked.</span>
        <span>UI receipt evidence is display-only and does not grant a write executor.</span>
      </div>
    </section>
  );
}

function ReceiptMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ReceiptList({ title, items }: { title: string; items: readonly string[] }) {
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
