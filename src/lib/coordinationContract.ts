export const COORDINATION_CONTRACT_VERSION = '1.0.0' as const;

export type CanonicalAgentCode =
  | 'AG-COORD'
  | 'PRO'
  | 'UI-PRODUCT'
  | 'AG-DEV'
  | 'EXECUTOR'
  | 'AG-SEC'
  | 'AG-REVIEW'
  | 'HANDOFF';

export type AgentRuntimeKind =
  | 'supervisor'
  | 'specialist'
  | 'deterministic_service'
  | 'policy_guard'
  | 'handoff';

export type AgentActivationPolicy = 'always' | 'conditional' | 'on_action' | 'on_gate' | 'final';

export interface AgentRoleContract {
  code: CanonicalAgentCode;
  name: string;
  runtime: AgentRuntimeKind;
  activation: AgentActivationPolicy;
  responsibilities: readonly string[];
  requiredInputs: readonly string[];
  outputs: readonly string[];
  prohibited: readonly string[];
  escalationTo: CanonicalAgentCode | 'USER';
}

export const AGENT_ROLE_CONTRACTS: readonly AgentRoleContract[] = [
  {
    code: 'AG-COORD',
    name: '协调 Agent',
    runtime: 'supervisor',
    activation: 'always',
    responsibilities: ['接收并澄清需求', '拆解任务并分派责任人', '监控依赖、阻塞和预算'],
    requiredInputs: ['用户需求', '项目基线', '可用 Agent 与能力清单'],
    outputs: ['任务计划', '任务分派', '升级或暂停决定'],
    prohibited: ['直接执行工具副作用', '批准自己的请求', '把未验证结果标记为完成'],
    escalationTo: 'USER',
  },
  {
    code: 'PRO',
    name: '专业评审 Agent',
    runtime: 'specialist',
    activation: 'on_gate',
    responsibilities: ['评审架构和产品方案', '定义高风险节点的验收标准', '给出专业收口建议'],
    requiredInputs: ['方案', '风险清单', '验收标准'],
    outputs: ['专业评审结论', '修改建议', '收口建议'],
    prohibited: ['代替用户授权', '直接执行变更', '把建议冒充审批'],
    escalationTo: 'USER',
  },
  {
    code: 'UI-PRODUCT',
    name: 'UI/Product Design Agent',
    runtime: 'specialist',
    activation: 'conditional',
    responsibilities: ['定义用户流程', '设计界面和交互', '给出体验验收标准'],
    requiredInputs: ['用户目标', '现有界面', '产品约束'],
    outputs: ['体验方案', '交互规范', 'UI 验收标准'],
    prohibited: ['在未授权时修改代码', '为非 UI 任务强制激活自己'],
    escalationTo: 'AG-COORD',
  },
  {
    code: 'AG-DEV',
    name: '开发 Agent',
    runtime: 'specialist',
    activation: 'conditional',
    responsibilities: ['在批准范围内实现代码', '补充测试', '产出可审查的变更'],
    requiredInputs: ['任务说明', '允许路径', '验收标准'],
    outputs: ['代码或文档产物', '测试证据', '变更摘要'],
    prohibited: ['自行扩大范围', '自行 stage、commit 或 push', '绕过安全与复核'],
    escalationTo: 'AG-COORD',
  },
  {
    code: 'EXECUTOR',
    name: '执行器 Agent',
    runtime: 'deterministic_service',
    activation: 'on_action',
    responsibilities: ['校验授权票据', '执行允许列表动作', '返回不可歧义的操作回执'],
    requiredInputs: ['规范化动作', '有效审批票据', '工作区和 run 绑定'],
    outputs: ['操作结果', '退出码', '带哈希回执'],
    prohibited: ['自由规划任务', '开放通用 Shell', '执行未绑定审批的动作'],
    escalationTo: 'AG-SEC',
  },
  {
    code: 'AG-SEC',
    name: '安全 Agent',
    runtime: 'policy_guard',
    activation: 'on_gate',
    responsibilities: ['检查权限、路径和密钥边界', '识别输入污染与越权', '阻断不安全动作'],
    requiredInputs: ['动作包', '权限策略', '项目边界'],
    outputs: ['安全发现', '允许范围', '阻断原因'],
    prohibited: ['参与被审查实现', '批准自己的请求', '在缺少证据时宣告通过'],
    escalationTo: 'USER',
  },
  {
    code: 'AG-REVIEW',
    name: '复核 Agent',
    runtime: 'policy_guard',
    activation: 'on_gate',
    responsibilities: ['独立核验产物', '检查测试与验收标准', '决定接收或返工建议'],
    requiredInputs: ['产物', '验收标准', '测试和安全证据'],
    outputs: ['复核发现', '接收或返工建议', 'DoD 证据'],
    prohibited: ['复核自己的产物', '跳过测试证据', '在发现未关闭时放行'],
    escalationTo: 'AG-COORD',
  },
  {
    code: 'HANDOFF',
    name: 'Handoff Agent',
    runtime: 'handoff',
    activation: 'final',
    responsibilities: ['整理交接包', '校验基线与产物引用', '记录未决问题并确认接管'],
    requiredInputs: ['运行快照', '产物索引', '未决事项和权限边界'],
    outputs: ['恢复快照', '交接包', '接管确认'],
    prohibited: ['继承上一轮权限', '静默覆盖冲突基线', '把未接管状态写成完成'],
    escalationTo: 'AG-COORD',
  },
] as const;

const AGENT_ALIASES: Readonly<Record<string, CanonicalAgentCode>> = {
  'AG-ARCH': 'PRO',
  'AG-CODE': 'AG-DEV',
  'AG-GIT': 'EXECUTOR',
  'AG-DOCS': 'HANDOFF',
};

export function normalizeAgentCode(code: string): CanonicalAgentCode | null {
  const normalized = AGENT_ALIASES[code] ?? code;
  return AGENT_ROLE_CONTRACTS.some((role) => role.code === normalized)
    ? (normalized as CanonicalAgentCode)
    : null;
}

export function getAgentRoleContract(code: string): AgentRoleContract | null {
  const canonical = normalizeAgentCode(code);
  return canonical ? AGENT_ROLE_CONTRACTS.find((role) => role.code === canonical) ?? null : null;
}

export type CoordinationRunStatus =
  | 'draft'
  | 'planning'
  | 'awaiting_plan_approval'
  | 'running'
  | 'waiting_input'
  | 'waiting_approval'
  | 'paused'
  | 'blocked'
  | 'reviewing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type CoordinationTaskStatus =
  | 'queued'
  | 'ready'
  | 'running'
  | 'waiting_dependency'
  | 'waiting_input'
  | 'waiting_approval'
  | 'retryable_failed'
  | 'failed'
  | 'reviewing'
  | 'accepted'
  | 'cancelled';

export type HandoffStatus = 'prepared' | 'validated' | 'accepted' | 'rejected' | 'assumed';
export type OperationStatus =
  | 'proposed'
  | 'waiting_approval'
  | 'approved'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'compensated';

export interface CompletionEvidence {
  taskStatuses: readonly CoordinationTaskStatus[];
  artifactCount: number;
  artifactsVerified: boolean;
  approvalsSatisfied: boolean;
  highFindings: number;
  mediumFindings: number;
}

export type CompletionBlockReason =
  | 'no_tasks'
  | 'tasks_incomplete'
  | 'artifacts_missing'
  | 'artifacts_unverified'
  | 'approvals_missing'
  | 'review_findings_open';

export function evaluateRunCompletion(evidence: CompletionEvidence): {
  allowed: boolean;
  reasons: CompletionBlockReason[];
} {
  const reasons: CompletionBlockReason[] = [];
  if (evidence.taskStatuses.length === 0) reasons.push('no_tasks');
  if (evidence.taskStatuses.some((status) => status !== 'accepted')) reasons.push('tasks_incomplete');
  if (evidence.artifactCount < 1) reasons.push('artifacts_missing');
  if (!evidence.artifactsVerified) reasons.push('artifacts_unverified');
  if (!evidence.approvalsSatisfied) reasons.push('approvals_missing');
  if (evidence.highFindings > 0 || evidence.mediumFindings > 0) reasons.push('review_findings_open');
  return { allowed: reasons.length === 0, reasons };
}
