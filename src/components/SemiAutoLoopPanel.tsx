import type { FixtureDecisionRecord, ImportedAgentHubProject } from '../types';
import { generateInstructionDraft } from '../lib/agentHubInstructionDraft';

interface SemiAutoLoopPanelProps {
  project: ImportedAgentHubProject;
  selectedOptionId: string;
  onSelectedOptionIdChange: (optionId: string) => void;
}

const evidenceFields = [
  '任务更新 / task updated',
  '运行记录更新 / run updated',
  '复核已创建 / review created',
  '构建状态 / build status',
  '提交哈希 / commit hash',
  'dry-run 模拟草案 / dry-run mock plan',
  '回执审计状态 / receipt review status',
  '边界结果 / boundary results',
  '下一步决策更新 / next decision updated',
];

const safetyGates = [
  '仅草案 / draft only',
  '需要用户审批 / human approval required',
  '不自动执行 / no auto execution',
  '不连接 Codex',
  '不连接 Git',
  '不运行 npm',
  '未连接 filesystem / Wiki action',
  '仅浏览器 File API 只读导入',
  '不使用终端读取 .agent-hub 正文',
  '不写文件 / no file writes',
  'realDryRunImplemented=false',
  'real_dry_run_approved=false',
  'simulator_mode=fixture_only_mock',
  'receipt_status=not_executed_template',
  '不 push',
];

const loopSteps = [
  { label: '读取状态', en: 'Read state', status: 'done' },
  { label: '识别下一步', en: 'Identify next option', status: 'done' },
  { label: '生成指令草案', en: 'Generate draft', status: 'done' },
  { label: '生成动作草案', en: 'Envelope draft', status: 'done' },
  { label: '等待用户审批', en: 'Human approval pending', status: 'active' },
  { label: '执行锁定', en: 'Execution locked', status: 'locked' },
  { label: 'Dry-run 模拟草案', en: 'Dry-run mock plan', status: 'locked' },
  { label: '回执审计', en: 'Receipt review', status: 'locked' },
  { label: '刷新面板', en: 'Dashboard refresh', status: 'locked' },
];

export function SemiAutoLoopPanel({ project, selectedOptionId, onSelectedOptionIdChange }: SemiAutoLoopPanelProps) {
  const selectedDecision = selectDecision(project, selectedOptionId);
  const generatedDraft = generateInstructionDraft(project, selectedDecision);

  return (
    <section className="semi-auto-loop-panel" aria-labelledby="semi-auto-loop-title">
      <div className="loop-panel-header">
        <div>
          <p className="eyebrow">LOOP3 / 导入决策驱动 / 仅草案</p>
          <h2 id="semi-auto-loop-title">导入 next decisions 闭环 / Imported Decision Loop</h2>
          <p>
            选择导入的下一步候选后，拓扑详情与 Codex Goal 指令草案会同步变化；所有结果仍是 copy-only。
          </p>
        </div>
        <div className="loop-status-badges" aria-label="loop safety status">
          <span>数据源：{sourceLabel(project.importStatus.source)}</span>
          <span>导入状态：{project.importStatus.state}</span>
          <span>currentActionLevel=L1 draft-only</span>
          <span>executorConnected=false</span>
          <span>realDryRunImplemented=false</span>
          <span>real_dry_run_approved=false</span>
          <span>simulator_mode=fixture_only_mock</span>
          <span>receipt_status=not_executed_template</span>
          <span>不自动执行 / no auto execution</span>
        </div>
      </div>

      <div className="loop-option-selector" aria-label="next decision option selection">
        <div>
          <span className="loop-card-label">下一步候选 / Next options</span>
          <h3>选择一个候选来刷新指令草案</h3>
        </div>
        <div className="loop-option-list">
          {project.decisions.map((decision, index) => (
            <button
              key={stableListKey('decision-option', decision.optionId, decision.sourceRef, index)}
              type="button"
              className={`loop-option-button ${decision.optionId === selectedDecision.optionId ? 'is-selected' : ''}`}
              aria-pressed={decision.optionId === selectedDecision.optionId}
              onClick={() => onSelectedOptionIdChange(decision.optionId)}
            >
              <strong>{safeOptionLabel(decision.optionId)}</strong>
              <span>{safeOptionButtonTitle(decision)}</span>
              <small>{localizeDecisionStatus(decision.status)}</small>
              <small>Pro_required={String(decision.proRequired ?? true)}</small>
              <small>commit_allowed={String(decision.commitAllowed ?? false)}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="loop-progress-stepper" aria-label="semi-auto loop progress">
        {loopSteps.map((step, index) => (
          <article key={step.label} className={`loop-step-card loop-step-${step.status}`}>
            <span className="loop-step-index">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h3>{step.label}</h3>
              <strong>{step.en}</strong>
              <p>{localizeStepStatus(step.status)}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="loop-detail-grid">
        <section className="loop-decision-card" aria-label="selected next option">
          <span className="loop-card-label">当前选择 / Selected next option</span>
          <h3>{selectedDecision.optionId}</h3>
          <p>{selectedDecision.title}</p>
          <small>{selectedDecision.reason}</small>
          <small>来源：{selectedDecision.sourceRef}</small>
          <small>动作草案：同步到 ActionControlPanel / copy-only</small>
          <small>Dry-run 模拟：ACTION3-ARCH / fixture-only mock</small>
          <small>回执审计：RECEIPT2 / not executed template review</small>
        </section>

        <section className="loop-approval-card" aria-label="human approval gate">
          <span className="loop-card-label">需要审批 / Approval required</span>
          <h3>当前状态：等待用户审批</h3>
          <p>不会自动执行。未连接 executor、filesystem、Git、npm、Wiki 或 Codex action。</p>
          <span className="loop-gate-heading">安全门禁 / Safety Gates</span>
          <div className="loop-safety-tags">
            {safetyGates.map((gate) => (
              <span key={gate}>{gate}</span>
            ))}
          </div>
        </section>

        <section className="loop-evidence-card" aria-label="evidence return placeholder">
          <span className="loop-card-label">执行回流证据 / Evidence return</span>
          <h3>未来回流字段</h3>
          <div className="loop-evidence-list">
            {evidenceFields.map((field) => (
              <div key={field}>
                <span>{field}</span>
                <strong>等待外部结果 / waiting</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="loop-draft-card" aria-label="generated Codex Goal instruction draft">
        <div className="loop-draft-header">
          <div>
            <span className="loop-card-label">指令草案 / Instruction Draft</span>
            <h3>已生成 Codex Goal 指令草案</h3>
          </div>
          <span className="loop-refresh-status">面板刷新：选择已同步到草案</span>
        </div>
        <textarea
          className="loop-draft-preview"
          readOnly
          value={generatedDraft.draftText}
          aria-label="generated Codex Goal instruction draft for selected option"
        />
      </section>
    </section>
  );
}

function localizeDecisionStatus(status: string) {
  return status === 'needs_user_decision' ? '需要用户决策 / needs_user_decision' : status;
}

function localizeStepStatus(status: string) {
  if (status === 'done') {
    return '已完成 / done';
  }
  if (status === 'active') {
    return '当前停在这里 / current stop';
  }
  return '未连接，仅占位 / locked placeholder';
}

function selectDecision(project: ImportedAgentHubProject, selectedOptionId: string): FixtureDecisionRecord {
  return (
    project.decisions.find((decision) => decision.optionId === selectedOptionId) ??
    project.decisions.find((decision) => decision.optionId === 'LOOP3') ??
    project.decisions.find((decision) => decision.optionId === 'IMPORT4') ??
    project.decisions.find((decision) => decision.optionId === 'IMPORT1') ??
    project.decisions[0] ?? {
      optionId: 'Pause',
      title: 'Pause and request next user decision',
      status: 'needs_user_decision',
      reason: 'No fixture next decision options were available.',
      sourceRef: 'fixture-generated-fallback',
    }
  );
}

function sourceLabel(source: ImportedAgentHubProject['importStatus']['source']) {
  return source === 'fixture' ? 'fixture-only' : 'browser-selected-agent-hub';
}

function safeOptionLabel(optionId: string) {
  return optionId === 'PUSH-GATE' ? 'Policy Gate' : optionId;
}

function safeOptionButtonTitle(decision: FixtureDecisionRecord) {
  const safeTitles: Record<string, string> = {
    LOOP1: '半自动闭环原型 / Semi-auto loop prototype',
    LOOP2: '半自动闭环 UX refinement',
    LOOP3: '导入决策驱动 refinement',
    LOOP4: '导入决策质量 refinement',
    ACTION1: '执行信封草案 + fixture-only UI mock',
    ACTION3: 'dry-run simulator architecture/mock only',
    'ACTION3-GATE': 'dry-run gate architecture review only',
    'ACTION3-FIXTURE': 'fixture-only dry-run sample planning',
    RECEIPT3: '回执审计 refinement / receipt review refinement',
    'ACTION4-ARCH': '未来真实 executor 架构评审 only',
    IMPORT1: '只读导入审批 / Import approval',
    IMPORT2: '浏览器只读导入原型',
    IMPORT3: '真实导入手工验证',
    IMPORT4: '更宽一轮受控导入验证',
    IMPORT5: '另一个低风险项目导入验证',
    HARDEN1: '导入安全加固',
    ACTION0: '执行器架构 only / no implementation',
    RECEIPT1: '回执模板 schema + dashboard mock',
    RECEIPT2: '回执复核 dashboard refinement',
    'ACTION-GATE': 'Pro architecture review gate only',
    UX4: '视觉与可用性升级',
    DRAFT1: '指令草案 refinement',
    'PUSH-GATE': '策略复核 only / no publication',
    Pause: '暂停并等待用户决策',
  };

  if (safeTitles[decision.optionId]) {
    return safeTitles[decision.optionId];
  }

  return /\b(Run|Execute|Commit|Push|Build|Sync Wiki|Call Codex|npm run)\b/i.test(decision.title)
    ? '导入候选 / imported option, no execution'
    : decision.title;
}

function stableListKey(scope: string, id: string, sourceRef: string, index: number) {
  return `${scope}-${index}-${id}-${sourceRef}`.slice(0, 160);
}
