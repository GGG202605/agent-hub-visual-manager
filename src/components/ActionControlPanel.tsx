import { useMemo, useState } from 'react';
import type { ActionControlSafetyState, ActionGatePilot, FixtureDecisionRecord, ImportedAgentHubProject } from '../types';
import { createActionEnvelopeDraft, formatActionEnvelopeDraft } from '../lib/agentHubActionEnvelope';
import { createDryRunMockPlan } from '../lib/agentHubDryRunMock';
import { createOperationReceiptTemplate, formatOperationReceiptTemplate } from '../lib/agentHubOperationReceipt';
import { createReceiptReviewView } from '../lib/agentHubReceiptReview';
import { generateInstructionDraft, selectRecommendedDecision } from '../lib/agentHubInstructionDraft';

interface ActionControlPanelProps {
  project: ImportedAgentHubProject;
  selectedOptionId: string;
  gatePilot: ActionGatePilot;
}

const safetyState: ActionControlSafetyState = {
  currentActionLevel: 'L1 draft-only',
  executorConnected: false,
  dryRunApproved: false,
  writeApproved: false,
  externalActionApproved: false,
  pushApproved: false,
};

const closedLoopSteps = [
  ['Imported Decision', '导入下一步候选', 'done'],
  ['Action Envelope Draft', '动作草案 / Action Envelope', 'done'],
  ['Human Approval Gate', '等待用户审批', 'active'],
  ['Execution Locked', '执行锁定 / 未接入执行器', 'locked'],
  ['Dry-run Mock Plan', 'Dry-run 模拟草案', 'template'],
  ['Operation Receipt Review Template', '回执审计模板', 'template'],
] as const;

export function ActionControlPanel({ project, selectedOptionId, gatePilot }: ActionControlPanelProps) {
  const [copyState, setCopyState] = useState('等待复制 / copy ready');
  const selectedDecision = selectDecision(project, selectedOptionId);
  const instructionDraft = generateInstructionDraft(project, selectedDecision);
  const envelope = useMemo(
    () => createActionEnvelopeDraft(project, selectedDecision),
    [project, selectedDecision],
  );
  const receipt = useMemo(() => createOperationReceiptTemplate(envelope), [envelope]);
  const dryRunPlan = useMemo(() => createDryRunMockPlan(envelope), [envelope]);
  const receiptReview = useMemo(() => createReceiptReviewView(receipt), [receipt]);
  const envelopeText = useMemo(() => formatActionEnvelopeDraft(envelope), [envelope]);
  const receiptText = useMemo(() => formatOperationReceiptTemplate(receipt), [receipt]);

  async function copyText(kind: 'envelope' | 'receipt', value: string) {
    if (!navigator.clipboard) {
      setCopyState('浏览器未开放 clipboard；请手动选择文本复制。');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyState(kind === 'envelope' ? '已复制执行信封草案 / envelope copied' : '已复制回执模板 / receipt copied');
    } catch {
      setCopyState('复制失败；未执行任何动作，请手动复制文本。');
    }
  }

  return (
    <section className="action-control-panel" aria-labelledby="action-control-title">
      <div className="action-control-header">
        <div>
          <p className="eyebrow">ACTION1 + RECEIPT1 / L1 draft-only / no executor</p>
          <h2 id="action-control-title">动作草案闭环 / Action Envelope + Receipt Mock</h2>
          <p>
            从当前 selected next decision 生成执行信封草案与回执模板；仅复制草案，不自动执行，不写入，不调用 Codex/Git/npm/Wiki。
            执行锁定，未接入执行器；no executor connected。
          </p>
        </div>
        <div className="action-lock-stack" aria-label="action safety state">
          <span>currentActionLevel: {safetyState.currentActionLevel}</span>
          <span>executorConnected: {String(safetyState.executorConnected)}</span>
          <span>dryRunApproved: {String(safetyState.dryRunApproved)}</span>
          <span>real_dry_run_approved={String(gatePilot.real_dry_run_approved)}</span>
          <span>build_execution_approved={String(gatePilot.build_execution_approved)}</span>
          <span>selected_path_write_approved={String(gatePilot.selected_path_write_approved)}</span>
          <span>executor_implemented={String(gatePilot.executor_implemented)}</span>
          <span>realDryRunImplemented: {String(dryRunPlan.realDryRunImplemented)}</span>
          <span>simulator_mode: {dryRunPlan.simulator_mode}</span>
          <span>writeApproved: {String(safetyState.writeApproved)}</span>
          <span>externalActionApproved: {String(safetyState.externalActionApproved)}</span>
          <span>pushApproved: {String(safetyState.pushApproved)}</span>
        </div>
      </div>

      <div className="action-control-grid" aria-label="ACTION3 ACTION4 gate deck">
        {gatePilot.gateStatus.map((gate) => (
          <section key={gate.gateId} className="action-panel-block action-gate-summary">
            <span className="action-panel-label">{gate.label}</span>
            <h3>{gate.status}</h3>
            <p>{gate.summary}</p>
            <dl className="action-field-list">
              <ActionField label="evidence" value={gate.evidence} />
            </dl>
          </section>
        ))}
      </div>

      <div className="action-control-grid" aria-label="stop pass block state">
        {gatePilot.stopPassBlock.map((item) => (
          <section key={item.gateId} className="action-panel-block">
            <span className="action-panel-label">{item.label}</span>
            <h3>{item.status}</h3>
            <p>{item.summary}</p>
            <small>{item.evidence}</small>
          </section>
        ))}
      </div>

      <div className="action-loop-rail" aria-label="closed loop state">
        {closedLoopSteps.map(([en, zh, state], index) => (
          <article key={en} className={`action-loop-step action-step-${state}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{zh}</strong>
            <small>{en}</small>
          </article>
        ))}
      </div>

      <div className="action-control-grid">
        <section className="action-panel-block action-selected-decision">
          <span className="action-panel-label">当前 selected next decision</span>
          <h3>{selectedDecision.optionId}</h3>
          <p>{selectedDecision.title}</p>
          <dl className="action-field-list">
            <ActionField label="status" value={selectedDecision.status} />
            <ActionField label="source" value={selectedDecision.sourceRef} />
            <ActionField label="commit_allowed 草案字段" value={String(envelope.commit_allowed_draft)} />
            <ActionField
              label="conditional_commit_allowed 草案字段"
              value={String(envelope.conditional_commit_allowed_draft)}
            />
          </dl>
        </section>

        <section className="action-panel-block action-envelope-summary">
          <span className="action-panel-label">执行信封 / Action Envelope</span>
          <h3>{envelope.action_type}</h3>
          <dl className="action-field-list">
            <ActionField label="action_id" value={envelope.action_id} />
            <ActionField label="hash preview" value={envelope.envelope_hash_preview} />
            <ActionField label="target_repo" value={envelope.target_repo} />
            <ActionField label="target_paths" value={envelope.target_paths.join(', ')} />
            <ActionField label="simulator_mode" value={dryRunPlan.simulator_mode} />
            <ActionField label="expiry" value={envelope.expiry_note} />
          </dl>
        </section>

        <section className="action-panel-block action-gate-summary">
          <span className="action-panel-label">审批门禁 / Approval Gate</span>
          <h3>执行锁定 / Execution locked</h3>
          <div className="action-gate-tags">
            <span>等待用户审批</span>
            <span>Pro 复核 required: {String(envelope.pro_review_required)}</span>
            <span>dry-run required: {String(envelope.dry_run_required)}</span>
            <span>dry-run 未批准</span>
            <span>real_dry_run_approved={String(dryRunPlan.real_dry_run_approved)}</span>
            <span>receipt review: {receiptReview.receipt_status}</span>
            <span>未接入执行器</span>
            <span>Metadata Gate 仅展示 preflight status</span>
            <span>Build Gate 不提供 build 按钮</span>
            <span>Write Fixture Gate 不提供 write 按钮</span>
            <span>不自动执行</span>
            <span>不写入</span>
            <span>不调用 Codex/Git/npm/Wiki</span>
          </div>
        </section>
      </div>

      <div className="action-template-grid">
        <section className="action-copy-block">
          <div className="action-copy-header">
            <div>
              <span className="action-panel-label">仅复制草案 / Copy-only</span>
              <h3>Action Envelope draft</h3>
            </div>
            <button type="button" className="action-copy-button" onClick={() => void copyText('envelope', envelopeText)}>
              仅复制草案 / Copy envelope draft
            </button>
          </div>
          <textarea readOnly value={envelopeText} aria-label="copy-only action envelope draft" />
        </section>

        <section className="action-copy-block">
          <div className="action-copy-header">
            <div>
              <span className="action-panel-label">回执模板 / Operation Receipt</span>
              <h3>{receipt.receipt_status}</h3>
            </div>
            <button type="button" className="action-copy-button" onClick={() => void copyText('receipt', receiptText)}>
              仅复制模板 / Copy receipt template
            </button>
          </div>
          <textarea readOnly value={receiptText} aria-label="copy-only operation receipt template" />
        </section>
      </div>

      <div className="action-policy-footer" aria-label="action control policy">
        <strong>{copyState}</strong>
        <span>Instruction draft linked: {instructionDraft.optionId}</span>
        <span>Receipt status: {receipt.receipt_status}</span>
        <span>Dry-run mock: {dryRunPlan.simulator_mode}</span>
        <span>Receipt review: {receiptReview.receipt_status}</span>
        <span>Next Decision: {gatePilot.nextDecisionPacket.join(' | ')}</span>
        <span>动作草案闭环 / 不调用 Codex/Git/npm/Wiki / 未接入执行器</span>
        <span>所有真实执行仍需单独 Goal、独立审批、Pro review 与 exact scope。</span>
      </div>
    </section>
  );
}

function ActionField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function selectDecision(project: ImportedAgentHubProject, selectedOptionId: string): FixtureDecisionRecord {
  return (
    project.decisions.find((decision) => decision.optionId === selectedOptionId) ??
    selectRecommendedDecision(project)
  );
}
