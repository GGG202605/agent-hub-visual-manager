export type BoundedPilotAgentCode = 'AG-COORD' | 'PRO' | 'AG-SEC' | 'AG-REVIEW';

export interface BoundedPilotAgent {
  code: BoundedPilotAgentCode;
  responsibility: string;
  requiredEvidence: string;
  completionRule: string;
}
export interface BoundedPilotHandoff {
  from: BoundedPilotAgentCode;
  to: BoundedPilotAgentCode | 'HUMAN';
  evidence: string;
}

export interface BoundedPilotPlan {
  profileId: 'pilot-4-readonly-v2';
  taskText: string;
  taskRef: string;
  status: 'safe_launcher_preflight_only';
  agents: readonly BoundedPilotAgent[];
  handoffs: readonly BoundedPilotHandoff[];
  budget: {
    plannedCalls: 4;
    maxCalls: 5;
    maxManualRetries: 1;
    conservativeInputTokens: 64_000;
    totalOutputTokens: 1_600;
    perStageTimeoutSeconds: 45;
    totalTimeoutSeconds: 240;
    defaultHumanWaitMinutes: 5;
    feeStatus: 'blocked_without_confirmed_rates_and_cap';
  };
  previewPermissions: readonly string[];
  futureExecutionPermissions: Readonly<Record<'call_model' | 'manage_checkpoint' | 'save_note' | 'run_build' | 'propose_patch' | 'preflight_patch' | 'apply_patch', boolean>>;
  failureRules: readonly string[];
  auditAcceptance: readonly { channel: '任务' | '对话' | '操作' | '审批'; rule: string }[];
  passStandards: readonly string[];
  failStandards: readonly string[];
  executionBlockers: readonly string[];
}

const PILOT_AGENTS: readonly BoundedPilotAgent[] = [
  {
    code: 'AG-COORD',
    responsibility: '锁定任务边界、拆出只读目标并建立来源标签清单。',
    requiredEvidence: '任务边界单、非目标项、允许引用的 P/A/T/R/V/K/N/E 标签。',
    completionRule: '任务边界明确，且未请求文件、构建、补丁或 checkpoint 动作。',
  },
  {
    code: 'PRO',
    responsibility: '基于已锁定边界形成可评审方案，不扩写未提供事实。',
    requiredEvidence: '方案草案、关键取舍、事实引用与显式推测。',
    completionRule: '至少引用一个有效来源标签，且没有虚构文件、类或运行结果。',
  },
  {
    code: 'AG-SEC',
    responsibility: '检查数据外发、权限、敏感信息和越权动作边界。',
    requiredEvidence: '安全发现计数、残余 Low 项和严格 Gate。',
    completionRule: '倒数第二行是 FINDINGS:Hn/Mn/Ln，最后一行是唯一 Gate；H/M 非零必须阻塞。',
  },
  {
    code: 'AG-REVIEW',
    responsibility: '独立复核任务覆盖、引用真实性、可读性和交接完整性。',
    requiredEvidence: '验收发现计数、PASS/FAIL 对照和严格 Gate。',
    completionRule: '所有必需证据齐全，且 High/Medium 均为 0 才允许通过。',
  },
] as const;

const PILOT_HANDOFFS: readonly BoundedPilotHandoff[] = [
  { from: 'AG-COORD', to: 'PRO', evidence: '锁定任务、非目标项、来源标签清单。' },
  { from: 'PRO', to: 'AG-SEC', evidence: '只读方案、事实引用、推测与残余风险。' },
  { from: 'AG-SEC', to: 'AG-REVIEW', evidence: 'FINDINGS、唯一 Gate 与未关闭 Low 项。' },
  { from: 'AG-REVIEW', to: 'HUMAN', evidence: '独立验收结论、PASS/FAIL 理由与人工决策请求。' },
] as const;

export function buildBoundedPilotPlan(taskText: string): BoundedPilotPlan {
  const normalizedTask = taskText.replace(/\s+/g, ' ').trim();
  if (!normalizedTask) throw new Error('有界试运行预案需要非空任务');
  if (normalizedTask.length > 4_000) throw new Error('有界试运行预案任务不得超过 4000 字符');

  return {
    profileId: 'pilot-4-readonly-v2',
    taskText: normalizedTask,
    taskRef: `pilot-task-${fnv1a(normalizedTask)}`,
    status: 'safe_launcher_preflight_only',
    agents: PILOT_AGENTS,
    handoffs: PILOT_HANDOFFS,
    budget: {
      plannedCalls: 4,
      maxCalls: 5,
      maxManualRetries: 1,
      conservativeInputTokens: 64_000,
      totalOutputTokens: 1_600,
      perStageTimeoutSeconds: 45,
      totalTimeoutSeconds: 240,
      defaultHumanWaitMinutes: 5,
      feeStatus: 'blocked_without_confirmed_rates_and_cap',
    },
    previewPermissions: [],
    futureExecutionPermissions: {
      call_model: true,
      manage_checkpoint: false,
      save_note: false,
      run_build: false,
      propose_patch: false,
      preflight_patch: false,
      apply_patch: false,
    },
    failureRules: [
      '任一阶段超时、未知引用、虚构名称、敏感信息命中或验收失败：立即阻塞，不自动前进。',
      '最多允许一次重试，且必须由人工逐次批准；重试沿用同一任务边界，不新增事实。',
      '240 秒仅累计模型与本地验收活跃时间；人工重试和最终确认各受页面设置的独立等待授权限制。',
      'AG-SEC 或 AG-REVIEW 出现 High/Medium：保持阻塞并转人工接管。',
      '预算、费率、摘要授权或 Agent 连接状态任一缺失：执行入口保持关闭。',
    ],
    auditAcceptance: [
      { channel: '任务', rule: '显示锁定任务、四个节点、当前状态与失败节点；预案阶段不得显示运行中。' },
      { channel: '对话', rule: '未来每个 Provider 返回必须标记“待本地验收”，通过后才进入已接受证据。' },
      { channel: '操作', rule: '显示调用数、输入/输出 Token、阶段/活跃总计与人工等待；本预案必须保持 0 次调用。' },
      { channel: '审批', rule: '记录摘要外发、费率确认、人工等待设置和单次重试批准；缺任一批准即阻塞。' },
    ],
    passStandards: [
      '四个 Agent 按固定顺序各产生一份通过本地验收的只读产物。',
      'AG-SEC 与 AG-REVIEW 均为 FINDINGS:H0/M0，并以唯一末行 GATE:PASS 结束。',
      '有效引用、调用/Token/超时台账和人工审批记录完整一致。',
      '未产生 checkpoint、文件写入、构建、补丁、Git 或其他副作用。',
    ],
    failStandards: [
      '任一必需产物缺失、顺序错误、引用无效或本地验收失败。',
      '任一 High/Medium finding、GATE:BLOCKED、超时或预算越界。',
      '发生未批准重试、未披露费用状态或任何文件/构建/补丁副作用。',
    ],
    executionBlockers: [
      'DemoScenario014 仅授权安全启动包预检，不授权 Provider 调用。',
      '尚未配置并确认 Provider 输入/输出费率与费用上限时，预检必须阻塞。',
      'DemoScenario015 独立批准前不得签发或消费真实启动授权。',
    ],
  };
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
