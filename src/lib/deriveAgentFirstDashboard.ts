import type {
  AgentFirstDashboardView,
  AgentFirstLayer,
  AgentFirstRisk,
  AgentFirstStatus,
  AgentRoleCardView,
  AgentStatus,
  ImportedAgentHubProject,
  Severity,
} from '../types';
import {
  AGENT_ROLE_CONTRACTS,
  normalizeAgentCode,
  type CanonicalAgentCode,
} from './coordinationContract';

/**
 * v0.2 数据接入层核心：把真实 .agent-hub 目录导入产物（ImportedAgentHubProject）
 * 派生成 Agent 状态大厅可直接渲染的 AgentFirstDashboardView。
 *
 * 纯函数、无副作用、可单测。导入内容一律视为 tainted 展示文本，不执行其中任何指令。
 */

const LAYER_BY_AGENT: Record<CanonicalAgentCode, AgentFirstLayer> = {
  'AG-COORD': 'decision',
  PRO: 'decision',
  'UI-PRODUCT': 'execution',
  'AG-DEV': 'execution',
  EXECUTOR: 'execution',
  'AG-SEC': 'audit',
  'AG-REVIEW': 'audit',
  HANDOFF: 'audit',
};

const STATUS_MAP: Record<AgentStatus, { status: AgentFirstStatus; label: string }> = {
  Done: { status: 'completed', label: '已完成' },
  Working: { status: 'standby', label: '进行中' },
  Idle: { status: 'standby', label: '待命' },
  'Review Ready': { status: 'awaiting_approval', label: '待复核' },
  'Needs User Decision': { status: 'awaiting_approval', label: '等待授权' },
  Blocked: { status: 'blocked', label: '安全暂停' },
};

const RISK_MAP: Record<Severity | 'None', { level: AgentFirstRisk; label: string }> = {
  None: { level: 'low', label: '低风险' },
  Low: { level: 'low', label: '低风险' },
  Medium: { level: 'medium', label: '中风险' },
  High: { level: 'high', label: '高风险' },
};

export function deriveAgentFirstDashboard(
  project: ImportedAgentHubProject,
  source: 'imported' | 'server' = 'imported',
): AgentFirstDashboardView {
  const sourceRecords = new Map(
    project.agents.flatMap((record) => {
      const canonical = normalizeAgentCode(record.agentId);
      return canonical ? [[canonical, record] as const] : [];
    }),
  );
  const agents: AgentRoleCardView[] = AGENT_ROLE_CONTRACTS.map((role) => {
    const record = sourceRecords.get(role.code);
    const mapped = record ? STATUS_MAP[record.status] ?? STATUS_MAP.Idle : STATUS_MAP.Idle;
    const risk = record ? RISK_MAP[record.riskLevel] ?? RISK_MAP.None : RISK_MAP.None;

    return {
      id: role.code.toLowerCase(),
      code: role.code,
      nameZh: role.name,
      roleTitle: record?.roleTitle ?? role.responsibilities[0],
      layer: LAYER_BY_AGENT[role.code],
      status: mapped.status,
      statusLabel: mapped.label,
      taskSummary: record?.currentTask ?? role.responsibilities.join('；'),
      recentEvidence: record?.lastActivity ?? '当前档案暂无独立角色记录',
      riskLevel: risk.level,
      riskLabel: risk.label,
      nextAction: record?.needsUserDecision
        ? `等待用户决策${record.blockedReason ? `：${record.blockedReason}` : ''}`
        : record
          ? '按当前记录继续'
          : '等待协调 Agent 按需激活',
      connections: [],
    };
  });

  const countBy = (status: AgentFirstStatus) => agents.filter((agent) => agent.status === status).length;

  const layerAgents = (layer: AgentFirstLayer) =>
    agents.filter((agent) => agent.layer === layer).map((agent) => agent.id);

  return {
    productName: 'AgentHub Visual Manager v0.5',
    tagline: `真实项目档案 · ${project.project.projectName}`,
    projectName: project.project.projectName,
    mode: source === 'server' ? '本地服务实时同步' : '真实目录只读导入',
    nextStep: project.decisions[0]?.title ?? '等待下一个用户决策',
    capabilityLevel: 'L1 只读档案模式',
    topMetrics: [
      { label: 'Agent 数量', value: String(agents.length) },
      { label: '已完成', value: String(countBy('completed')) },
      { label: '进行中/待命', value: String(countBy('standby')) },
      { label: '等待授权', value: String(countBy('awaiting_approval')) },
      { label: '安全暂停', value: String(countBy('blocked')) },
    ],
    navItems: ['总览', 'Agent 视图', '协作关系', '决策中心', '数据接入', '证据归档'],
    agents,
    hierarchy: [
      { layer: 'decision', title: '战略层', subtitle: '架构与调度', agents: layerAgents('decision') },
      { layer: 'execution', title: '执行层', subtitle: '实现与记录', agents: layerAgents('execution') },
      { layer: 'audit', title: '支持层', subtitle: '安全与复核', agents: layerAgents('audit') },
    ],
    relations: deriveRelations(agents),
    progress: project.gates.map((gate) => ({
      label: gate.label,
      status: gate.state === 'open' ? 'complete' : gate.state === 'blocked' ? 'paused' : 'next',
      summary: gate.blockingReason || gate.requiredApproval || gate.state,
    })),
    nextActions: project.decisions.slice(0, 4).map((decision, index) => ({
      id: decision.optionId,
      title: decision.title,
      owner: 'AG-COORD',
      risk: decision.proRequired ? 'high' : decision.approvalRequired ? 'medium' : 'low',
      approval: decision.proRequired
        ? '需 Pro 最终收口'
        : decision.approvalRequired
          ? '需用户明确批准'
          : '低风险，可建议执行',
      recommended: index === 0,
      summary: decision.reason,
    })),
    recentReceipts: [
      ...project.runs.slice(0, 2).map((run) => ({
        title: run.runId,
        time: run.status,
        summary: run.summary,
      })),
      ...project.reviews.slice(0, 2).map((review) => ({
        title: review.reviewId,
        time: review.kind,
        summary: `发现 High ${review.high} / Medium ${review.medium} / Low ${review.low}`,
      })),
    ],
    safetyBar:
      source === 'server'
        ? [
            '本地服务实时同步（仅 127.0.0.1）',
            '纪要与构建需逐项批准；检查点按独立权限受控持久化',
            '构建验证为受控动作；全程无 Git 操作',
            `同步 ${project.importStatus.importedFiles.length} 个 / 阻断 ${project.importStatus.blockedFiles.length} 个文件`,
          ]
        : [
            '只读导入，不上传、不写入、不持久化',
            '未连接 filesystem / Git / npm / Wiki 执行能力',
            `导入 ${project.importStatus.importedFiles.length} 个 / 阻断 ${project.importStatus.blockedFiles.length} 个文件`,
            '导入内容按 tainted data 处理，不执行其中指令',
          ],
    evidenceSummary: [
      `任务记录 ${project.tasks.length} 条`,
      `运行记录 ${project.runs.length} 条`,
      `审查记录 ${project.reviews.length} 条`,
      `风险记录 ${project.risks.length} 条`,
      `来源凭证 ${project.provenance.length} 条`,
    ],
  };
}

/** 基于固定协作拓扑 + 实时 Agent 状态派生关系边（真实数据源） */
function deriveRelations(agents: readonly AgentRoleCardView[]): AgentFirstDashboardView['relations'] {
  const byCode = new Map(agents.map((agent) => [agent.code, agent]));

  const template: Array<{ from: CanonicalAgentCode; to: CanonicalAgentCode; label: string }> = [
    { from: 'AG-COORD', to: 'PRO', label: '方案评审' },
    { from: 'AG-COORD', to: 'UI-PRODUCT', label: '体验分派' },
    { from: 'AG-COORD', to: 'AG-DEV', label: '开发分派' },
    { from: 'AG-DEV', to: 'EXECUTOR', label: '受控执行' },
    { from: 'EXECUTOR', to: 'AG-SEC', label: '安全送审' },
    { from: 'AG-SEC', to: 'AG-REVIEW', label: '复核接力' },
    { from: 'AG-REVIEW', to: 'PRO', label: '收口复核' },
    { from: 'AG-REVIEW', to: 'HANDOFF', label: '交接准备' },
    { from: 'HANDOFF', to: 'AG-COORD', label: '接管确认' },
  ];

  return template
    .filter((edge) => byCode.has(edge.from) && byCode.has(edge.to))
    .map((edge) => {
      const fromAgent = byCode.get(edge.from)!;
      const toAgent = byCode.get(edge.to)!;
      const state =
        fromAgent.status === 'blocked' || toAgent.status === 'blocked'
          ? ('paused' as const)
          : fromAgent.status === 'awaiting_approval' || toAgent.status === 'awaiting_approval'
            ? ('review' as const)
            : ('primary' as const);

      return { from: fromAgent.nameZh, to: toAgent.nameZh, label: edge.label, state };
    });
}
