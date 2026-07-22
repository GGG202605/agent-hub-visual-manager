import type {
  ActionQueueMockItem,
  NoopExecutorFixtureReceipt,
  NoopExecutorScenarioResult,
  SemiAutoLoopReadiness,
} from '../types';

interface NoopExecutorReceiptPanelProps {
  queueItem: ActionQueueMockItem;
  receipt: NoopExecutorFixtureReceipt;
  scenarioResults: NoopExecutorScenarioResult[];
  readiness: SemiAutoLoopReadiness;
}

export function NoopExecutorReceiptPanel({
  queueItem,
  receipt,
  scenarioResults,
  readiness,
}: NoopExecutorReceiptPanelProps) {
  const statusCounts = scenarioResults.reduce(
    (counts, result) => ({
      ...counts,
      [result.receipt.scenario_status]: counts[result.receipt.scenario_status] + 1,
    }),
    { pass: 0, blocked: 0, failed: 0, unverifiable: 0 },
  );
  const safetyFlags = [
    ['semi_auto_action_loop', 'true'],
    ['loop_mode', 'mock_only'],
    ['noop_executor_fixture', 'true'],
    ['no_op_executor_only', 'true'],
    ['executor_mode', receipt.executor_mode],
    ['simulated_only', String(receipt.simulated_only)],
    ['real_executor_approved', 'false'],
    ['real_executor_implemented', String(receipt.real_executor_implemented)],
    ['shell_access', String(receipt.shell_access)],
    ['npm_action', String(receipt.npm_action)],
    ['git_action', String(receipt.git_action)],
    ['write_action', String(receipt.write_action)],
    ['external_action', String(receipt.external_action)],
    ['no_file_change_assertion', String(receipt.no_file_change_assertion)],
    ['executed_command_count', String(receipt.executed_command_count)],
    ['files_changed_count', String(receipt.files_changed_count)],
    ['scenario_matrix_count', String(scenarioResults.length)],
    ['scenario_pass', String(statusCounts.pass)],
    ['scenario_blocked', String(statusCounts.blocked)],
    ['scenario_failed', String(statusCounts.failed)],
    ['scenario_unverifiable', String(statusCounts.unverifiable)],
    ['action_queue_loop_ui_allowed', String(readiness.actionQueueLoopUiAllowed)],
    ['human_approval_required', String(readiness.humanApprovalRequired)],
  ] as const;

  return (
    <section className="action-panel-block action-selected-decision" aria-label="No-op executor fixture UI">
      <span className="action-panel-label">No-op Executor Fixture / scenario hardening</span>
      <h3>No-op executor scenario matrix + simulated receipt verification</h3>
      <p>
        DemoScenario040 keeps the synthetic pass, blocked, failed, and unverifiable scenarios from mock action queue data only.
        No shell/npm/Git/write/external action is available, real_executor_approved=false, and no real executor is implemented.
        No-op executor receipt is simulated. DemoScenario041 read-only metadata executor receipt is separate evidence and does
        not grant write, stage, commit, push, npm, private knowledge base, or backend filesystem permission.
      </p>

      <div className="import-status-grid" aria-label="no-op executor safety flags">
        {safetyFlags.map(([label, value]) => (
          <ReceiptMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="no-op executor receipt and verification">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Consumed mock queue item</span>
          <h3>{queueItem.queueId}</h3>
          <dl className="action-field-list">
            <ReceiptField label="action_id" value={receipt.action_id} />
            <ReceiptField label="approval_id" value={receipt.approval_id} />
            <ReceiptField label="envelope_hash" value={receipt.envelope_hash} />
            <ReceiptField label="risk_level" value={queueItem.riskLevel} />
            <ReceiptField label="allowed_scope" value={queueItem.allowedScope.join(', ')} />
            <ReceiptField label="required_reviews" value={queueItem.requiredReviews.join(', ')} />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Simulated executor receipt</span>
          <h3>{receipt.receipt_status}</h3>
          <dl className="action-field-list">
            <ReceiptField label="scenario_status" value={receipt.scenario_status} />
            <ReceiptField label="executor_mode" value={receipt.executor_mode} />
            <ReceiptField label="dry_run_type" value={receipt.dry_run_type} />
            <ReceiptField label="receipt_status" value={receipt.receipt_status} />
            <ReceiptField label="simulated_only" value={String(receipt.simulated_only)} />
            <ReceiptField label="no_op_executor_only" value="true" />
            <ReceiptField label="real_executor_approved" value="false" />
            <ReceiptField label="no_file_change_assertion" value={String(receipt.no_file_change_assertion)} />
            <ReceiptField label="final_git_status_fixture" value={receipt.final_git_status_fixture} />
            <ReceiptField label="blocked_reason" value={receipt.blocked_reason || 'none'} />
            <ReceiptField label="verification_status" value={receipt.verification_status} />
            <ReceiptField label="receipt_verification_status" value={receipt.receipt_verification_status} />
          </dl>
        </section>
      </div>

      <div className="receipt-audit-grid" aria-label="receipt verification details">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Receipt verification</span>
          <h3>{receipt.verification_status}</h3>
          <dl className="action-field-list">
            <ReceiptField label="contract_fields_valid" value={String(receipt.contract_fields_valid)} />
            <ReceiptField label="required_reviews_present" value={String(receipt.required_reviews_present)} />
            <ReceiptField
              label="forbidden_actions_detected"
              value={receipt.forbidden_actions_detected.length === 0 ? '0' : receipt.forbidden_actions_detected.join(', ')}
            />
            <ReceiptField label="final_git_status_matches_fixture" value={String(receipt.final_git_status_matches_fixture)} />
            <ReceiptField label="simulated_only_assertion" value={String(receipt.simulated_only_assertion)} />
            <ReceiptField label="real_shell_npm_git_write_action" value="false" />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Verification notes</span>
          <h3>simulated_only=true</h3>
          <ul>
            {receipt.verification_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="receipt-audit-card" aria-label="No-op scenario matrix">
        <span className="action-panel-label">No-op scenario matrix</span>
        <h3>pass / blocked / failed / unverifiable states</h3>
        <div className="action-control-grid">
          {scenarioResults.map((result) => (
            <article key={result.scenario.scenarioId} className="receipt-audit-card">
              <span className="action-panel-label">{result.scenario.scenarioId}</span>
              <h3>{result.scenario.title}</h3>
              <dl className="action-field-list">
                <ReceiptField label="scenario_kind" value={result.scenario.kind} />
                <ReceiptField label="expected_status" value={result.scenario.expectedStatus} />
                <ReceiptField label="scenario_status" value={result.receipt.scenario_status} />
                <ReceiptField label="receipt_status" value={result.receipt.receipt_status} />
                <ReceiptField label="receipt_verification_status" value={result.receipt.receipt_verification_status} />
                <ReceiptField label="blocked_reason" value={result.receipt.blocked_reason || 'none'} />
                <ReceiptField label="simulated_only" value={String(result.receipt.simulated_only)} />
                <ReceiptField label="real_executor_implemented" value={String(result.receipt.real_executor_implemented)} />
                <ReceiptField label="shell/npm/git/write/external" value="false/false/false/false/false" />
              </dl>
              {result.receipt.synthetic_blocked_scenario ? (
                <p>Blocked scenario is synthetic; no real action executed.</p>
              ) : (
                <p>Valid scenario is synthetic; no real action executed.</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="receipt-audit-card" aria-label="Semi-auto loop readiness">
        <span className="action-panel-label">Semi-auto loop readiness</span>
        <h3>{readiness.readinessConclusion}</h3>
        <dl className="action-field-list">
          <ReceiptField
            label="can_enter_noop_executor_controlled_loop_mock"
            value={String(readiness.canEnterNoopExecutorControlledLoopMock)}
          />
          <ReceiptField label="action_queue_loop_ui_allowed" value={String(readiness.actionQueueLoopUiAllowed)} />
          <ReceiptField label="human_approval_required" value={String(readiness.humanApprovalRequired)} />
          <ReceiptField label="real_executor_allowed" value={String(readiness.realExecutorAllowed)} />
          <ReceiptField label="write_shell_npm_git_push_allowed" value={String(readiness.writeShellNpmGitPushAllowed)} />
        </dl>
        <div className="dry-run-detail-grid">
          <ReceiptList title="Conditions still blocking real executor" items={readiness.conditionsBlockingRealExecutor} />
          <ReceiptList title="Allowed next mock steps" items={readiness.allowedNextMockSteps} />
          <ReceiptList title="Forbidden real actions" items={readiness.forbiddenRealActions} />
        </div>
      </section>

      <div className="action-policy-footer">
        <strong>Receipt verification is simulated evidence, not real execution.</strong>
        <span>No-op executor fixture consumes mock queue only.</span>
        <span>No shell/npm/Git/write/commit/push buttons or command paths are exposed.</span>
        <span>Blocked scenario is synthetic; no real action executed.</span>
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

function ReceiptList({ title, items }: { title: string; items: string[] }) {
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
