import type { CommitRecoveryPolicyView } from '../types';

interface CommitRecoveryPolicyPanelProps {
  policy: CommitRecoveryPolicyView;
}

export function CommitRecoveryPolicyPanel({ policy }: CommitRecoveryPolicyPanelProps) {
  return (
    <section className="action-panel-block action-envelope-summary" aria-label="CommitRecoveryPolicyPanel">
      <span className="action-panel-label">CommitRecoveryPolicyPanel / policy only</span>
      <h3>{policy.mode}</h3>
      <p>Panel marker: CommitRecoveryPolicyPanel</p>
      <p>{policy.summary}</p>

      <div className="action-control-grid" aria-label="commit recovery policy">
        <PolicyCard title="bad_commit_detection" items={policy.badCommitDetection} />
        <PolicyCard title="revert_vs_reset_policy" items={policy.revertVsResetPolicy} />
        <PolicyCard title="recovery_receipt_requirements" items={policy.recoveryReceiptRequirements} />
        <PolicyCard title="DemoScenario003_scope" items={policy.DemoScenario003Scope} />
      </div>

      <section className="receipt-audit-card" aria-label="commit recovery forbidden actions">
        <span className="action-panel-label">reset hard policy</span>
        <h3>reset --hard forbidden by default</h3>
        <dl className="action-field-list">
          <PolicyField label="reason" value={policy.resetHardForbiddenReason} />
          <PolicyField label="revert_executor_requires_separate_approval" value={String(policy.revertExecutorRequiresSeparateApproval)} />
          <PolicyField label="forbidden_actions" value={policy.forbiddenActions.join(', ')} />
        </dl>
      </section>
    </section>
  );
}

function PolicyCard({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <article className="receipt-audit-card">
      <span className="action-panel-label">{title}</span>
      <h3>{items.length} checks</h3>
      <dl className="action-field-list">
        <PolicyField label="items" value={items.join(' | ')} />
      </dl>
    </article>
  );
}

function PolicyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
