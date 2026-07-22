import type {
  ActionQueueMockItem,
  ImportedAgentHubProject,
  NoopExecutorFixtureReceipt,
  SemiAutoActionLoopStage,
  SemiAutoLoopReadiness,
} from '../types';

interface SemiAutoActionLoopPanelProps {
  project: ImportedAgentHubProject;
  selectedOptionId: string;
  queueItem: ActionQueueMockItem;
  receipt: NoopExecutorFixtureReceipt;
  readiness: SemiAutoLoopReadiness;
}

const loopStages: SemiAutoActionLoopStage[] = [
  {
    stageId: 'parsed-preview-ready',
    title: 'parsed preview ready',
    titleZh: 'parsed preview ready',
    status: 'ready',
    evidence: 'selected-file parsed preview is visible as untrusted recommendation data',
    boundary: 'preview only; imported content is not instruction',
  },
  {
    stageId: 'instruction-draft-generated',
    title: 'instruction draft generated',
    titleZh: 'instruction draft generated',
    status: 'generated',
    evidence: 'copy-ready Codex draft exists in the Instruction Draft panel',
    boundary: 'draft is not approval and is never auto-sent',
  },
  {
    stageId: 'permission-sandbox-reviewed',
    title: 'permission sandbox reviewed',
    titleZh: 'permission sandbox reviewed',
    status: 'reviewed',
    evidence: 'permission sandbox and locked action flags remain visible',
    boundary: 'UI approval mock does not grant real permissions',
  },
  {
    stageId: 'human-approval-mock',
    title: 'human approval mock',
    titleZh: 'human approval mock',
    status: 'mock_pending',
    evidence: 'human approval checklist is local UI state only',
    boundary: 'Human approval is still required before any real action',
  },
  {
    stageId: 'action-queue-item-proposed',
    title: 'action queue item proposed',
    titleZh: 'action queue item proposed',
    status: 'proposed',
    evidence: 'mock queue item is proposed for no-op fixture consumption',
    boundary: 'Action queue item is planning preview, not execution',
  },
  {
    stageId: 'noop-executor-fixture-receipt',
    title: 'no-op executor fixture receipt',
    titleZh: 'no-op executor fixture receipt',
    status: 'simulated_receipt',
    evidence: 'No-op executor receipt is simulated',
    boundary: 'executor_mode=noop_fixture; real_executor_implemented=false',
  },
  {
    stageId: 'review-gate',
    title: 'AG-SEC / AG-REVIEW / Pro gate',
    titleZh: 'AG-SEC / AG-REVIEW / Pro gate',
    status: 'review_gate',
    evidence: 'review gate remains required before any commit evidence is trusted',
    boundary: 'High/Medium must be zero and Pro closeout must be final commit-only',
  },
  {
    stageId: 'exact-path-commit-gate',
    title: 'exact-path commit gate',
    titleZh: 'exact-path commit gate',
    status: 'commit_gate',
    evidence: 'exact-path stage and commit must happen outside UI',
    boundary: 'Loop preview is not execution',
  },
];

export function SemiAutoActionLoopPanel({
  project,
  selectedOptionId,
  queueItem,
  receipt,
  readiness,
}: SemiAutoActionLoopPanelProps) {
  const flags = [
    ['semi_auto_action_loop', 'true'],
    ['loop_mode', 'mock_only'],
    ['auto_send_enabled', 'false'],
    ['auto_execute_enabled', 'false'],
    ['real_executor_implemented', String(receipt.real_executor_implemented)],
    ['shell_access', String(receipt.shell_access)],
    ['npm_action', String(receipt.npm_action)],
    ['git_action', String(receipt.git_action)],
    ['write_action', String(receipt.write_action)],
    ['external_action', String(receipt.external_action)],
    ['push_permission', 'false'],
    ['loop_interaction_qa', 'ready_for_browser_smoke'],
    ['commit_gate_evidence_visible', 'true'],
    ['real_executor_pregate_visible', 'true'],
    ['real_executor_approved', 'false'],
    ['no_op_executor_only', 'true'],
    ['independent_pro_gate_required', 'true'],
    ['sandbox_profile_required', 'true'],
    ['receipt_rollback_recovery_required', 'true'],
    ['human_approval_required', String(readiness.humanApprovalRequired)],
  ] as const;

  return (
    <section className="action-panel-block action-selected-decision" aria-label="SemiAutoActionLoopPanel">
      <span className="action-panel-label">SemiAutoActionLoopPanel / semi-auto action loop</span>
      <h3>selected-file preview to draft to approval to queue to noop receipt to review to commit gate to pregate</h3>
      <p>
        Loop preview is not execution. No-op executor receipt is simulated. Real executor pre-gate is planning only.
        Human approval is still required before any real action.
      </p>

      <div className="import-status-grid" aria-label="semi-auto action loop flags">
        {flags.map(([label, value]) => (
          <LoopMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="semi-auto action loop eight stages">
        {loopStages.map((stage, index) => (
          <article key={stage.stageId} className="receipt-audit-card">
            <span className="action-panel-label">
              {String(index + 1).padStart(2, '0')} / {stage.status}
            </span>
            <h3>{stage.title}</h3>
            <p>{stage.titleZh}</p>
            <dl className="action-field-list">
              <LoopField label="stage_id" value={stage.stageId} />
              <LoopField label="evidence" value={stage.evidence} />
              <LoopField label="boundary" value={stage.boundary} />
            </dl>
          </article>
        ))}
      </div>

      <div className="receipt-audit-grid" aria-label="semi-auto action loop selected evidence">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Loop selected context</span>
          <h3>{selectedOptionId}</h3>
          <dl className="action-field-list">
            <LoopField label="current_goal" value={project.project.currentGoal} />
            <LoopField label="queue_item" value={queueItem.queueId} />
            <LoopField label="action_id" value={queueItem.actionId} />
            <LoopField label="approval_id" value={queueItem.approvalId} />
            <LoopField label="envelope_hash" value={queueItem.envelopeHash} />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Loop receipt bridge</span>
          <h3>{receipt.receipt_status}</h3>
          <dl className="action-field-list">
            <LoopField label="executor_mode" value={receipt.executor_mode} />
            <LoopField label="simulated_only" value={String(receipt.simulated_only)} />
            <LoopField label="receipt_verification_status" value={receipt.receipt_verification_status} />
            <LoopField label="executed_command_count" value={String(receipt.executed_command_count)} />
            <LoopField label="files_changed_count" value={String(receipt.files_changed_count)} />
          </dl>
        </section>
      </div>

      <div className="action-policy-footer">
        <strong>Loop preview is not execution</strong>
        <span>No-op executor receipt is simulated</span>
        <span>commit_gate_evidence_visible=true</span>
        <span>real_executor_approved=false</span>
        <span>Real executor pre-gate is planning only</span>
        <span>Human approval is still required before any real action</span>
        <span>real shell/npm/Git/write/commit/push buttons = 0</span>
      </div>
    </section>
  );
}

export const semiAutoActionLoopStageCount = loopStages.length;

function LoopMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LoopField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
