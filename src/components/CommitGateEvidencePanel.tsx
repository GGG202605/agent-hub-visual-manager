import type { CommitGateEvidenceView } from '../types';

interface CommitGateEvidencePanelProps {
  evidence: CommitGateEvidenceView;
}

export function CommitGateEvidencePanel({ evidence }: CommitGateEvidencePanelProps) {
  const reviewRows = [
    ['review_status.ag_sec', evidence.reviewStatus.agSec],
    ['review_status.ag_review', evidence.reviewStatus.agReview],
    ['pro_closeout', evidence.reviewStatus.proCloseout],
    ['high_medium_gate', evidence.reviewStatus.highMediumGate],
  ] as const;

  const stagedRows = [
    ['staged_check.staged_must_match_exact_paths', String(evidence.stagedCheck.stagedMustMatchExactPaths)],
    ['staged_check.cached_name_only_required', String(evidence.stagedCheck.cachedNameOnlyRequired)],
    ['staged_check.cached_diff_check_required', String(evidence.stagedCheck.cachedDiffCheckRequired)],
    ['staged_check.broad_staging_forbidden', String(evidence.stagedCheck.broadStagingForbidden)],
  ] as const;

  const permissionRows = [
    ['commit_from_ui', String(evidence.permissions.commitFromUi)],
    ['git_add_dot_allowed', String(evidence.permissions.gitAddDotAllowed)],
    ['real_git_action_from_ui', String(evidence.permissions.realGitActionFromUi)],
    ['push_permission', String(evidence.permissions.pushPermission)],
  ] as const;

  return (
    <section className="action-panel-block action-envelope-summary" aria-label="CommitGateEvidencePanel">
      <span className="action-panel-label">CommitGateEvidencePanel / exact-path commit gate</span>
      <h3>exact_paths + review_status + pro_closeout + staged_check</h3>
      <p>{evidence.summary}</p>

      <div className="import-status-grid" aria-label="commit gate evidence flags">
        {evidence.evidenceFlags.map((flag) => (
          <EvidenceMetric key={flag} label={flag} value="visible" />
        ))}
      </div>

      <section className="receipt-audit-card" aria-label="exact paths">
        <span className="action-panel-label">exact_paths</span>
        <h3>Only these relative paths can be staged outside the UI</h3>
        <div className="action-control-grid">
          {evidence.exactPaths.map((item) => (
            <article key={`${item.repo}:${item.path}`} className="receipt-audit-card">
              <span className="action-panel-label">{item.repo}</span>
              <h3>{item.status}</h3>
              <dl className="action-field-list">
                <EvidenceField label="path" value={item.path} />
                <EvidenceField label="reason" value={item.reason} />
              </dl>
            </article>
          ))}
        </div>
      </section>

      <div className="receipt-audit-grid" aria-label="review status and staged check">
        <section className="receipt-audit-card">
          <span className="action-panel-label">review_status</span>
          <h3>AG-SEC / AG-REVIEW / Pro closeout</h3>
          <dl className="action-field-list">
            {reviewRows.map(([label, value]) => (
              <EvidenceField key={label} label={label} value={value} />
            ))}
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">staged_check</span>
          <h3>Manual exact-path gate outside UI</h3>
          <dl className="action-field-list">
            {stagedRows.map(([label, value]) => (
              <EvidenceField key={label} label={label} value={value} />
            ))}
          </dl>
        </section>
      </div>

      <section className="receipt-audit-card" aria-label="commit and push permissions">
        <span className="action-panel-label">commit / push permissions</span>
        <h3>No real Commit button; push_permission=false</h3>
        <dl className="action-field-list">
          {permissionRows.map(([label, value]) => (
            <EvidenceField key={label} label={label} value={value} />
          ))}
        </dl>
      </section>

      <div className="action-policy-footer">
        <strong>Commit gate evidence is display-only.</strong>
        <span>No real Commit button</span>
        <span>No Git action is triggered by the dashboard.</span>
        <span>push_permission=false</span>
      </div>
    </section>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EvidenceField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
