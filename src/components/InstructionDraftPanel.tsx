import type { ImportedAgentHubProject } from '../types';
import { createActionEnvelopeDraft } from '../lib/agentHubActionEnvelope';
import { createDryRunMockPlan } from '../lib/agentHubDryRunMock';
import { createOperationReceiptTemplate } from '../lib/agentHubOperationReceipt';
import { createReceiptReviewView } from '../lib/agentHubReceiptReview';
import { generateInstructionDraft, selectRecommendedDecision } from '../lib/agentHubInstructionDraft';

interface InstructionDraftPanelProps {
  project: ImportedAgentHubProject;
  selectedOptionId?: string;
}

export function InstructionDraftPanel({ project, selectedOptionId }: InstructionDraftPanelProps) {
  const selectedDecision =
    project.decisions.find((decision) => decision.optionId === selectedOptionId) ?? selectRecommendedDecision(project);
  const generatedDraft = generateInstructionDraft(project, selectedDecision);
  const envelope = createActionEnvelopeDraft(project, selectedDecision);
  const dryRunPlan = createDryRunMockPlan(envelope);
  const receipt = createOperationReceiptTemplate(envelope);
  const receiptReview = createReceiptReviewView(receipt);

  return (
    <section className="instruction-draft-panel" aria-labelledby="instruction-draft-title">
      <div className="instruction-draft-header">
        <div>
          <p className="eyebrow">复制草案 / 仅草案 / 需要用户审批</p>
          <h2 id="instruction-draft-title">Codex Goal 指令草案</h2>
          <p>
            当前选中的 option 会生成 copy-ready 文本区域。这里不会自动执行；需要用户审批后，再交给 Codex 执行。
          </p>
        </div>
        <div className="draft-option-badge" aria-label="recommended next option">
          <span>推荐下一步 / recommended option</span>
          <strong>{generatedDraft.optionId}</strong>
          <small>{sourceLabel(project.importStatus.source)}</small>
        </div>
      </div>

      <div className="draft-safety-strip" aria-label="instruction draft safety boundaries">
        <span>semi_auto_action_loop=true</span>
        <span>loop_mode=mock_only</span>
        <span>Loop preview is not execution</span>
        <span>semi_auto_loop=true</span>
        <span>导入数据源：{sourceLabel(project.importStatus.source)}</span>
        <span>导入状态：{project.importStatus.state}</span>
        <span>需要用户审批 / Human approval required</span>
        <span>supervised_handoff_evidence=true</span>
        <span>action_queue_mock_only=true</span>
        <span>Action queue is a planning preview, not execution</span>
        <span>Executor sandbox is not implemented</span>
        <span>human_approval_required=true</span>
        <span>copy_to_codex_manual=true</span>
        <span>Draft handoff is not execution</span>
        <span>Human must review and paste manually</span>
        <span>Approval in UI mock does not grant real permissions</span>
        <span>未连接 filesystem / Git / npm / Wiki / Codex 执行能力</span>
        <span>不会修改文件、不会提交、不会 push</span>
        <span>执行锁定 / execution locked</span>
        <span>未接入 executor / no executor connected</span>
        <span>executor_implemented=false</span>
        <span>executor_permission=false</span>
        <span>write_permission=false</span>
        <span>git_action_permission=false</span>
        <span>npm_action_permission=false</span>
        <span>push_permission=false</span>
        <span>Dry-run mock：{dryRunPlan.simulator_mode}</span>
        <span>realDryRunImplemented={String(dryRunPlan.realDryRunImplemented)}</span>
        <span>real_dry_run_approved={String(dryRunPlan.real_dry_run_approved)}</span>
        <span>回执模板：{receipt.receipt_status}</span>
        <span>回执审计：{receiptReview.receipt_status}</span>
        <span>下一步状态：{localizeDecisionStatus(generatedDraft.nextDecisionStatus)}</span>
        <span>允许范围 / allowed scope</span>
        <span>停止条件 / stop if</span>
        <span>证据要求 / evidence</span>
        <span>完成标准 / DoD</span>
      </div>

      <div className="draft-meta-grid">
        <div>
          <span>selected option</span>
          <strong>{generatedDraft.optionId}</strong>
        </div>
        <div>
          <span>需要审批 / approval required</span>
          <strong>{generatedDraft.approvalRequired ? '是 / yes' : '否 / no'}</strong>
        </div>
        <div>
          <span>Pro_required</span>
          <strong>{generatedDraft.proRequired ? 'true' : 'false'}</strong>
        </div>
        <div>
          <span>commit_allowed</span>
          <strong>{String(generatedDraft.commitAllowed)}</strong>
        </div>
        <div>
          <span>conditional_commit_allowed</span>
          <strong>{String(generatedDraft.conditionalCommitAllowed)}</strong>
        </div>
        <div>
          <span>来源记录 / source refs</span>
          <strong>{selectedDecision.sourceRef}</strong>
        </div>
        <div>
          <span>Action Envelope</span>
          <strong>{envelope.envelope_hash_preview}</strong>
        </div>
        <div>
          <span>currentActionLevel</span>
          <strong>{envelope.current_action_level}</strong>
        </div>
        <div>
          <span>receipt_status</span>
          <strong>{receipt.receipt_status}</strong>
        </div>
        <div>
          <span>simulator_mode</span>
          <strong>{dryRunPlan.simulator_mode}</strong>
        </div>
        <div>
          <span>realDryRunImplemented</span>
          <strong>{String(dryRunPlan.realDryRunImplemented)}</strong>
        </div>
        <div>
          <span>receipt review</span>
          <strong>{receiptReview.receipt_status}</strong>
        </div>
        <div>
          <span>executorConnected</span>
          <strong>false</strong>
        </div>
        <div>
          <span>imported counts</span>
          <strong>
            {project.importStatus.importedFiles.length}/{project.importStatus.skippedFiles.length}/
            {project.importStatus.blockedFiles.length}
          </strong>
        </div>
      </div>

      <div className="draft-structure-grid" aria-label="instruction draft structure summary">
        <DraftStructureBlock title="允许范围 / allowed scope" items={generatedDraft.allowedScope} />
        <DraftStructureBlock title="停止条件 / stop-if" items={generatedDraft.stopIf} />
        <DraftStructureBlock title="完成标准 / DoD" items={generatedDraft.dod} />
        <DraftStructureBlock title="汇报字段 / report fields" items={generatedDraft.reportFields} />
      </div>

      <label className="draft-textarea-label" htmlFor="instruction-draft-text">
        复制草案 / copy-ready generated draft
      </label>
      <textarea id="instruction-draft-text" readOnly value={generatedDraft.draftText} aria-label="copy-ready generated instruction draft" />
    </section>
  );
}

function DraftStructureBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="draft-structure-block">
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={stableListKey(title, item, index)}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function localizeDecisionStatus(status: string) {
  return status === 'needs_user_decision' ? '需要用户决策 / needs_user_decision' : status;
}

function sourceLabel(source: ImportedAgentHubProject['importStatus']['source']) {
  return source === 'fixture' ? 'fixture-only' : 'browser-selected-agent-hub';
}

function stableListKey(scope: string, value: string, index: number) {
  return `${scope}-${index}-${value.slice(0, 80)}`;
}
