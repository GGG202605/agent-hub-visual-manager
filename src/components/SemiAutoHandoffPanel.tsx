import type { ActionGatePilot, HandoffSafetyFlag, ImportedAgentHubProject, SemiAutoHandoffStage } from '../types';

interface SemiAutoHandoffPanelProps {
  project: ImportedAgentHubProject;
  selectedOptionId: string;
  gatePilot: ActionGatePilot;
}

const handoffSafetyFlags: HandoffSafetyFlag[] = [
  { label: 'semi_auto_loop', value: 'true' },
  { label: 'supervised_handoff_evidence', value: 'true' },
  { label: 'action_queue_mock_only', value: 'true' },
  { label: 'auto_send_enabled', value: 'false' },
  { label: 'auto_execute_enabled', value: 'false' },
  { label: 'human_approval_required', value: 'true' },
  { label: 'copy_to_codex_manual', value: 'true' },
  { label: 'executor_implemented', value: 'false' },
  { label: 'executor_permission', value: 'false' },
  { label: 'write_permission', value: 'false' },
  { label: 'git_action_permission', value: 'false' },
  { label: 'npm_action_permission', value: 'false' },
  { label: 'push_permission', value: 'false' },
];

const handoffStages: SemiAutoHandoffStage[] = [
  {
    stageId: 'parsed-preview-ready',
    title: 'Parsed preview ready',
    status: 'ready',
    summary: 'Selected-file preview is available as untrusted recommendation data.',
    evidence: 'selected_file_import_enabled=true; parser_output_role=recommendation_signal_only',
  },
  {
    stageId: 'permission-sandbox-reviewed',
    title: 'Permission sandbox reviewed',
    status: 'mock_pending',
    summary: 'Sandbox checkboxes are mock consent signals, not real capability grants.',
    evidence: 'permission_sandbox_mock=true; approval in UI mock does not grant real permissions',
  },
  {
    stageId: 'instruction-draft-generated',
    title: 'Instruction draft generated',
    status: 'ready',
    summary: 'Draft text is copyable and compressed for human review.',
    evidence: 'instruction_draft_only=true; imported_content_as_instruction=false',
  },
  {
    stageId: 'human-review-required',
    title: 'Human review required',
    status: 'review_required',
    summary: 'User must inspect the draft and choose whether to paste it into Codex.',
    evidence: 'human_approval_required=true; generated draft is not approval',
  },
  {
    stageId: 'manual-copy-paste',
    title: 'Manual copy / paste to Codex',
    status: 'manual_required',
    summary: 'The UI can display copyable text, but cannot send it anywhere.',
    evidence: 'copy_to_codex_manual=true; auto_send_enabled=false',
  },
  {
    stageId: 'codex-receipt-return',
    title: 'Codex result returns receipt',
    status: 'mock_pending',
    summary: 'Receipt return is a future human-provided evidence step.',
    evidence: 'receipt_status=mock_pending; executor_permission=false',
  },
  {
    stageId: 'supervised-evidence-recorded',
    title: 'Supervised handoff evidence recorded',
    status: 'mock_pending',
    summary: 'Evidence chain records what should be checked before any future action.',
    evidence: 'supervised_handoff_evidence=true; receipt templates are not execution evidence',
  },
  {
    stageId: 'locked-action-queue-preview',
    title: 'Locked action queue preview',
    status: 'locked',
    summary: 'Queue rows show proposed actions and required approvals only.',
    evidence: 'action_queue_mock_only=true; real action buttons=0',
  },
  {
    stageId: 'executor-sandbox-boundary',
    title: 'Executor sandbox boundary',
    status: 'locked',
    summary: 'Executor levels, preconditions, stop conditions, and receipts are architecture-only.',
    evidence: 'executor_implemented=false; executor_permission=false',
  },
  {
    stageId: 'reviews-closeout',
    title: 'AG-SEC / AG-REVIEW / Pro closeout',
    status: 'review_required',
    summary: 'Reviews must close before any commit gate can be considered.',
    evidence: 'AG-SEC/AG-REVIEW High/Medium must be 0; Pro final commit-only required',
  },
  {
    stageId: 'exact-path-commit-gate',
    title: 'exact-path commit gate',
    status: 'locked',
    summary: 'Commit remains a separate exact-path gate after evidence review.',
    evidence: 'git add . forbidden; push_permission=false',
  },
];

export function SemiAutoHandoffPanel({ project, selectedOptionId, gatePilot }: SemiAutoHandoffPanelProps) {
  const selectedDecision =
    project.decisions.find((decision) => decision.optionId === selectedOptionId) ?? project.decisions[0];

  return (
    <section className="action-panel-block action-gate-summary" aria-label="Semi-auto Handoff Panel">
      <span className="action-panel-label">半自动交接 / Semi-auto Handoff</span>
      <h3>Draft handoff is not execution</h3>
      <p>
        Human must review and paste manually. Approval in UI mock does not grant real permissions.
        This panel connects parsed preview, permission sandbox, instruction draft, supervised evidence, locked action queue,
        executor sandbox boundary, receipt timeline, reviews, and exact-path commit gate as a mock workflow only.
      </p>

      <div className="import-status-grid" aria-label="semi-auto handoff safety flags">
        {handoffSafetyFlags.map((flag) => (
          <HandoffMetric key={flag.label} label={flag.label} value={flag.value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="semi-auto handoff status summary">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Selected decision / 当前选择</span>
          <h3>{selectedDecision?.optionId ?? 'Pause'}</h3>
          <dl className="action-field-list">
            <HandoffField label="decision_status" value={selectedDecision?.status ?? 'needs_user_decision'} />
            <HandoffField label="approval_required" value={String(selectedDecision?.approvalRequired ?? true)} />
            <HandoffField label="source_ref" value={selectedDecision?.sourceRef ?? 'mock-fallback'} />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Permission boundary / 权限边界</span>
          <h3>mock handoff only</h3>
          <dl className="action-field-list">
            <HandoffField label="real_dry_run_approved" value={String(gatePilot.real_dry_run_approved)} />
            <HandoffField label="build_execution_approved" value={String(gatePilot.build_execution_approved)} />
            <HandoffField label="selected_path_write_approved" value={String(gatePilot.selected_path_write_approved)} />
            <HandoffField label="executor_implemented" value={String(gatePilot.executor_implemented)} />
          </dl>
        </section>
      </div>

      <div className="receipt-timeline" aria-label="human approval handoff workflow stages">
        {handoffStages.map((stage, index) => (
          <article key={stage.stageId} className={`receipt-timeline-step receipt-${stage.status}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{stage.title}</strong>
            <small>{stage.summary}</small>
            <small>{stage.evidence}</small>
          </article>
        ))}
      </div>
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

function HandoffField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
