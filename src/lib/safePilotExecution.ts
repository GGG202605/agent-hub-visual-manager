import {
  buildStagePrompt,
  countReadableWords,
  validateConnectedStageResult,
  type ChatMessage,
  type GroundingCategory,
  type ProjectGroundingContext,
} from './agentConnectors';
import type { ModelCallEvidence, ModelHandoffEnvelope } from './orchestration';
import {
  SAFE_PILOT_AGENT_ORDER,
  type SafePilotAgentCode,
  type SafePilotAuthorizationSnapshot,
  type SafePilotPricingInput,
} from './safePilotLauncher';

export const DemoScenario015_APPROVED_TASK =
  '基于只读项目摘要，评估 AgentHub Visual Manager 当前四 Agent 安全启动机制是否满足首次真实试运行条件；输出边界、风险、证据引用和最终验收结论，不提出或执行文件、构建、补丁或 checkpoint 动作。';

export const DemoScenario015_APPROVED_PRICING = {
  currency: 'CNY',
  inputRatePerMillion: 1,
  outputRatePerMillion: 2,
  maxCost: 1,
  cacheHitInputRatePerMillion: 0.02,
  evidenceSha256: '4df3b7210f0b2390d336b5118cb425958662dfed2207323180a1830517a37ea1',
} as const satisfies SafePilotPricingInput & {
  cacheHitInputRatePerMillion: number;
  evidenceSha256: string;
};

export const DemoScenario015_APPROVED_MODEL = {
  provider: 'deepseek',
  modelId: 'deepseek-v4-flash',
  displayName: 'DeepSeek V4 Flash',
} as const;

export const DemoScenario018_RECOMMENDED_TASK =
  '基于只读项目摘要，验证 AgentHub Visual Manager 在 DemoScenario017 产品化基线上的四 Agent 验收链是否满足一次受控产品验收条件；输出边界、风险、证据引用和最终验收结论，不提出或执行文件、构建、补丁或 checkpoint 动作。';

export const DemoScenario018_APPROVED_PRICING = {
  ...DemoScenario015_APPROVED_PRICING,
} as const satisfies SafePilotPricingInput & {
  cacheHitInputRatePerMillion: number;
  evidenceSha256: string;
};

export const DemoScenario018_APPROVED_MODEL = { ...DemoScenario015_APPROVED_MODEL } as const;

// Five possible calls (four planned plus one human-approved retry) must fit
// inside the fixed 1,600-token output budget.
export const DemoScenario015_STAGE_MAX_TOKENS = 320;
export const DemoScenario015_RETRY_REPAIR_MARKER = 'TRUSTED_LOCAL_VALIDATION_REPAIR_JSON:';
export const PRODUCTIZED_STAGE_MAX_READABLE_WORDS = 180;
export const PRODUCTIZED_STAGE_MAX_NONEMPTY_LINES = 6;
export const PRODUCTIZED_GATE_TERMINAL_RESERVE_TOKENS = 80;

function productizedSourceTags(grounding: ProjectGroundingContext, minimum: number): string[] {
  const validSourceTags = Array.from(new Set(
    grounding.sourceTags.filter((tag) => /^[A-Z]\d{1,4}$/.test(tag)),
  )).slice(0, 32);
  if (validSourceTags.length < minimum) {
    const label = minimum === 1 ? '一个' : '两个不同的';
    throw new Error(`产品化上下文至少需要${label}可验证来源标签`);
  }
  return validSourceTags;
}

function formatProductizedSourceTags(sourceTags: readonly string[]): string {
  return sourceTags.map((tag) => `[${tag}]`).join('、');
}

function buildProductizedStageTraceabilityContract(grounding: ProjectGroundingContext): string {
  return ` 完整产物必须包含至少一个有效来源标签，只能从 ${formatProductizedSourceTags(productizedSourceTags(grounding, 1))} 中选择；不得省略引用。`;
}

function buildProductizedGateOutputContract(grounding: ProjectGroundingContext): string {
  const validSourceTags = productizedSourceTags(grounding, 2);
  const allowedTags = validSourceTags
    .map((tag) => `[${tag}]`)
    .join('、');
  return ' 门禁输出必须一次满足完整合同，不得只修复其中一项。' +
    `仅输出 3 至 ${PRODUCTIZED_STAGE_MAX_NONEMPTY_LINES} 个非空行：` +
    `第 1 行是结论，并且必须包含至少两个不同的有效来源标签，只能从 ${allowedTags} 中选择；` +
    'H、M、L 合计不得超过 3；非零 finding 必须按 HIGH、MEDIUM、LOW 顺序逐项输出 HIGH:H序号:简要说明、MEDIUM:M序号:简要说明或 LOW:L序号:简要说明，' +
    '每个严重级别从 1 连续编号，每条明细至少包含一个上述有效来源标签；H0/M0/L0 时不得输出 finding 明细；' +
    '倒数第二行严格为 FINDINGS:H数字/M数字/L数字，例如 FINDINGS:H0/M0/L1，不得输出字母 n、空格、中文标点或省略分隔符；' +
    '最后一行严格且唯一为 GATE:PASS 或 GATE:BLOCKED，其他行不得出现 GATE 标记。';
}

function buildProductizedReviewScopeContract(): string {
  return ' AG-REVIEW 只审查当前冻结任务、可验证来源和服务端已验收的上一阶段 handoff 信封是否自洽。' +
    '固定链路只向下游提供紧邻上一阶段的验收信封，这是设计边界；不得因为没有更早阶段正文、更多 handoff 信封或尚未发生最终人工验收而记 finding。' +
    '“Provider 返回不等于任务完成”是既定本地护栏，不是缺陷。只有当前输入中有可引用证据的具体违规才能计入 H 或 M，不得用推测抬高严重级别。';
}

export type DemoScenario015RetryValidationCode =
  | 'output_truncated'
  | 'substantive_gate_blocked'
  | 'final_gate_contract'
  | 'findings_contract'
  | 'gate_finding_consistency'
  | 'traceability'
  | 'unknown_source_tag'
  | 'unsupported_name'
  | 'content_too_short'
  | 'local_validation';

export interface DemoScenario015RetryFeedback {
  version: '1.0.0';
  boundary: 'TRUSTED_LOCAL_VALIDATION_REPAIR';
  agentCode: SafePilotAgentCode;
  evidenceId: string;
  outputSha256: string;
  validationCode: DemoScenario015RetryValidationCode;
  validationProblem: string;
  repairRules: readonly string[];
}

export type ProductizedRetryFeedback = DemoScenario015RetryFeedback;

export const DemoScenario015_AGENT_IDENTITIES: Record<SafePilotAgentCode, {
  figure: string;
  platformRole: string;
  displayLabel: string;
}> = {
  'AG-COORD': { figure: '孔子', platformRole: '协调 Agent', displayLabel: 'AG-COORD（孔子 · 协调 Agent）' },
  PRO: { figure: '老子', platformRole: '专业评审 Agent', displayLabel: 'PRO（老子 · 专业评审 Agent）' },
  'AG-SEC': { figure: '韩非', platformRole: '安全 Agent', displayLabel: 'AG-SEC（韩非 · 安全 Agent）' },
  'AG-REVIEW': { figure: '惠子', platformRole: '复核 Agent', displayLabel: 'AG-REVIEW（惠子 · 复核 Agent）' },
};

export const DemoScenario018_AGENT_IDENTITIES = DemoScenario015_AGENT_IDENTITIES;
export const DemoScenario018_STAGE_MAX_TOKENS = DemoScenario015_STAGE_MAX_TOKENS;

export interface ProductizedAcceptanceSpec {
  id: string;
  runIdSegment: string;
  school: string;
  taskText: string;
  agentIdentities: typeof DemoScenario015_AGENT_IDENTITIES;
  model: typeof DemoScenario015_APPROVED_MODEL;
  stageMaxTokens: number;
  pricingEvidence: {
    cacheHitInputRatePerMillion: number;
    evidenceSha256: string;
  };
  copy: {
    kicker: string;
    title: string;
    subtitle: string;
    executionGateTitle: string;
    launchButton: string;
    failed: string;
    completed: string;
  };
  createGrounding: (maxHumanWaitMinutes?: number) => ProjectGroundingContext;
}

export function buildDemoScenario015SanitizedContextText(maxHumanWaitMinutes = 5): string {
  const waitMinutes = Number.isInteger(maxHumanWaitMinutes) && maxHumanWaitMinutes >= 1 && maxHumanWaitMinutes <= 30
    ? maxHumanWaitMinutes
    : 0;
  return [
  '[P1] AgentHub Visual Manager 的 DemoScenario014 安全启动器已完成并提交；本次只评估首次真实四 Agent 只读试运行条件。',
  '[A1] 固定协作顺序为 AG-COORD → PRO → AG-SEC → AG-REVIEW → HUMAN；下游只能消费上一阶段已验收证据。',
  '[T1] DemoScenario014 最终验证为聚焦 3 文件/52 测试、全量 19 文件/168 测试、Node 语法和生产构建通过。',
  '[R1] Provider 返回不等于任务完成；缺失 handoff、未知引用、虚构名称、无效标记、超时或预算越界均必须阻塞。',
  '[V1] 桌面与实际 390×844 浏览器路径通过，预案无横向溢出，完整滚动与旧预检失效均已验证。',
  `[K1] 本次预算为 4 次计划、5 次绝对上限、64,000 输入、1,600 输出、45 秒阶段、240 秒模型与本地验收活跃总计；人工重试和最终确认等待期间暂停活跃计时，每次人工等待授权为 ${waitMinutes || '无效'} 分钟。`,
  '[N1] checkpoint、纪要、文件、构建、补丁、源码写入和 Git 动作全部关闭；不得提出或执行这些动作。',
  '[E1] DeepSeek V4 Flash 费率按缓存未命中输入人民币 1 元/百万 Token、输出 2 元/百万 Token，费用硬上限 1 元。',
  ].join('\n');
}

export const DemoScenario015_SANITIZED_CONTEXT_TEXT = buildDemoScenario015SanitizedContextText();

export function buildDemoScenario018SanitizedContextText(maxHumanWaitMinutes = 5): string {
  const waitMinutes = normalizeHumanWaitMinutes(maxHumanWaitMinutes);
  return [
    '[P1] AgentHub Visual Manager 的 DemoScenario017 产品化本地运维已完成并提交；本次只评估四 Agent 产品化验收链。',
    '[A1] 固定协作顺序为 AG-COORD → PRO → AG-SEC → AG-REVIEW → HUMAN；下游只能消费上一阶段已验收证据。',
    '[T1] DemoScenario017 最终验证为 Node 语法 3/3、聚焦 3 文件/34 测试、全量 24 文件/212 测试和生产构建通过。',
    '[R1] Provider 返回不等于任务完成；缺失 handoff、未知引用、虚构名称、无效标记、超时或预算越界均必须阻塞。',
    '[V1] DemoScenario017 独立临时生命周期审计 6/6 通过；外来监听器、死记录和活记录失配均保持 fail-closed。',
    `[K1] 本次预算为 4 次计划、5 次绝对上限、64,000 输入、1,600 输出、45 秒阶段、240 秒模型与本地验收活跃总计；人工重试和最终确认等待期间暂停活跃计时，每次人工等待授权为 ${waitMinutes || '无效'} 分钟。`,
    '[N1] checkpoint、纪要、文件、构建、补丁、源码写入和 Git 动作全部关闭；不得提出或执行这些动作。',
    '[E1] DeepSeek V4 Flash 费率按缓存未命中输入人民币 1 元/百万 Token、输出 2 元/百万 Token，费用硬上限 1 元。',
  ].join('\n');
}

export const DemoScenario018_SANITIZED_CONTEXT_TEXT = buildDemoScenario018SanitizedContextText();

const ROLE_DETAILS: Record<SafePilotAgentCode, { roleTitle: string; phaseLabel: string }> = {
  'AG-COORD': { roleTitle: '协调与边界锁定', phaseLabel: '任务边界和证据清单' },
  PRO: { roleTitle: '专业方案评估', phaseLabel: '只读方案与关键取舍' },
  'AG-SEC': { roleTitle: '安全门禁', phaseLabel: '权限、数据外发和预算审查' },
  'AG-REVIEW': { roleTitle: '独立最终复核', phaseLabel: '引用、交接与验收结论' },
};

export function createDemoScenario015Grounding(maxHumanWaitMinutes = 5): ProjectGroundingContext {
  const contextText = buildDemoScenario015SanitizedContextText(maxHumanWaitMinutes);
  return createFrozenGrounding(contextText);
}

export function createDemoScenario018Grounding(maxHumanWaitMinutes = 5): ProjectGroundingContext {
  return createFrozenGrounding(buildDemoScenario018SanitizedContextText(maxHumanWaitMinutes));
}

export function createDemoScenario018AcceptanceSpec(taskText: string): ProductizedAcceptanceSpec {
  const normalizedTask = taskText.trim().slice(0, 4_000);
  return {
    id: 'DemoScenario018-productized-acceptance',
    runIdSegment: 'DemoScenario018',
    school: 'DemoScenario018 产品化验收',
    taskText: normalizedTask || DemoScenario018_RECOMMENDED_TASK,
    agentIdentities: DemoScenario018_AGENT_IDENTITIES,
    model: DemoScenario018_APPROVED_MODEL,
    stageMaxTokens: DemoScenario018_STAGE_MAX_TOKENS,
    pricingEvidence: {
      cacheHitInputRatePerMillion: DemoScenario018_APPROVED_PRICING.cacheHitInputRatePerMillion,
      evidenceSha256: DemoScenario018_APPROVED_PRICING.evidenceSha256,
    },
    copy: {
      kicker: '产品规格 DemoScenario018 · 已验收实测基线 DemoScenario020',
      title: '产品化四 Agent 受控验收',
      subtitle: '单 run · 人工验收 · checkpoint=false',
      executionGateTitle: '产品化单 run 执行门',
      launchButton: '签发并开始本次受控验收',
      failed: 'DemoScenario018 单 run 已终止，需人工接管。',
      completed: 'DemoScenario018 单 run 已通过最终人工验收。',
    },
    createGrounding: createDemoScenario018Grounding,
  };
}

function createFrozenGrounding(contextText: string): ProjectGroundingContext {
  const categories: GroundingCategory[] = ['project', 'agent', 'task', 'run', 'review', 'risk', 'nextAction', 'evidence'];
  return {
    text: contextText,
    sourceTags: ['P1', 'A1', 'T1', 'R1', 'V1', 'K1', 'N1', 'E1'],
    selection: {
      charBudget: 4_000,
      usedChars: contextText.length,
      candidateCount: 8,
      selectedCount: 8,
      omittedCount: 0,
      compressedCount: 0,
      byCategory: Object.fromEntries(
        categories.map((category) => [category, { candidates: 1, selected: 1, omitted: 0 }]),
      ) as ProjectGroundingContext['selection']['byCategory'],
    },
  };
}

function DemoScenario015CompatibilitySpec(): ProductizedAcceptanceSpec {
  return {
    id: 'DemoScenario015-readonly-pilot',
    runIdSegment: 'DemoScenario015',
    school: 'DemoScenario015 只读试运行',
    taskText: DemoScenario015_APPROVED_TASK,
    agentIdentities: DemoScenario015_AGENT_IDENTITIES,
    model: DemoScenario015_APPROVED_MODEL,
    stageMaxTokens: DemoScenario015_STAGE_MAX_TOKENS,
    pricingEvidence: {
      cacheHitInputRatePerMillion: DemoScenario015_APPROVED_PRICING.cacheHitInputRatePerMillion,
      evidenceSha256: DemoScenario015_APPROVED_PRICING.evidenceSha256,
    },
    copy: {
      kicker: 'DemoScenario015 · ONE-RUN PILOT',
      title: '首次真实四 Agent 只读试运行',
      subtitle: '单 run · 人工验收 · checkpoint=false',
      executionGateTitle: 'DemoScenario015 单 run 执行门',
      launchButton: '签发并开始唯一一次试运行',
      failed: 'DemoScenario015 单 run 已终止，需人工接管。',
      completed: 'DemoScenario015 单 run 已通过最终人工验收。',
    },
    createGrounding: createDemoScenario015Grounding,
  };
}

export function buildProductizedStageMessages(input: {
  spec: ProductizedAcceptanceSpec;
  agentCode: SafePilotAgentCode;
  runId: string;
  grounding: ProjectGroundingContext;
  handoff?: ModelHandoffEnvelope;
  repair?: ProductizedRetryFeedback;
}): ChatMessage[] {
  const details = ROLE_DETAILS[input.agentCode];
  const identity = input.spec.agentIdentities[input.agentCode];
  const messages = buildStagePrompt({
    agentCode: input.agentCode,
    figure: identity.figure,
    school: input.spec.school,
    roleTitle: `${identity.platformRole}｜${details.roleTitle}`,
    phaseLabel: details.phaseLabel,
    taskText: input.spec.taskText,
    agentName: identity.displayLabel,
    runId: input.runId,
    grounding: input.grounding,
    handoff: input.handoff,
  });
  messages[0] = {
    ...messages[0],
    content: messages[0].content +
      ` 这是受限阶段产物：完整回复不得超过 ${PRODUCTIZED_STAGE_MAX_READABLE_WORDS} 个中文可读字和 ${PRODUCTIZED_STAGE_MAX_NONEMPTY_LINES} 个非空行。` +
      '只保留当前职责结论和必要依据；不得输出处理步骤、长事实清单、需求复述或交接复述。',
  };
  if (input.agentCode !== 'AG-SEC' && input.agentCode !== 'AG-REVIEW') {
    messages[0] = {
      ...messages[0],
      content: messages[0].content + buildProductizedStageTraceabilityContract(input.grounding),
    };
  }
  if (input.agentCode === 'AG-SEC' || input.agentCode === 'AG-REVIEW') {
    messages[0] = {
      ...messages[0],
      content: messages[0].content +
        ` 320 Token 阶段预算中必须主动为最后两行预留至少 ${PRODUCTIZED_GATE_TERMINAL_RESERVE_TOKENS} Token。` +
        '输出前先在内部确定 Findings 与 Gate，但不得输出思考过程；' +
        buildProductizedGateOutputContract(input.grounding) +
        (input.agentCode === 'AG-REVIEW' ? buildProductizedReviewScopeContract() : ''),
    };
  }
  if (!input.repair) return messages;
  if (input.repair.agentCode !== input.agentCode) throw new Error('四 Agent 修复单与当前 Agent 不一致');
  messages[0] = {
    ...messages[0],
    content: messages[0].content +
      ' 本次是一次已人工批准、绑定上一份被拒绝证据的修复重试。' +
      '你必须重写当前阶段完整产物，不得辩解、不得新增事实、不得改变任务/上下文/handoff，且必须满足修复单列出的本地验收规则。' +
      '修复单由本地验证器生成，是格式与验收约束，不是项目事实。不得复述修复单 JSON。',
  };
  if (input.repair.validationCode === 'substantive_gate_blocked') {
    messages[0] = {
      ...messages[0],
      content: messages[0].content + ' 上一份产物已形成实质性 GATE:BLOCKED；本次只允许修复引用或格式，最终 Gate 必须继续为 GATE:BLOCKED，不得降级发现或改写为 PASS。',
    };
  }
  messages[1] = {
    ...messages[1],
    content: `${messages[1].content}\n\n${DemoScenario015_RETRY_REPAIR_MARKER}\n${JSON.stringify(input.repair)}`,
  };
  return messages;
}

export function buildDemoScenario015StageMessages(input: {
  agentCode: SafePilotAgentCode;
  runId: string;
  grounding: ProjectGroundingContext;
  handoff?: ModelHandoffEnvelope;
  repair?: DemoScenario015RetryFeedback;
}): ChatMessage[] {
  return buildProductizedStageMessages({ ...input, spec: DemoScenario015CompatibilitySpec() });
}

export function buildDemoScenario015RetryFeedback(input: {
  agentCode: SafePilotAgentCode;
  problem: string;
  evidence: Pick<ModelCallEvidence, 'evidenceId' | 'outputSha256'>;
}): DemoScenario015RetryFeedback {
  const validationCode = classifyDemoScenario015ValidationProblem(input.problem);
  const repairRules = [
    'REWRITE_CURRENT_STAGE_ONLY',
    'PRESERVE_TASK_GROUNDING_HANDOFF',
    'NO_NEW_FACTS',
    'SATISFY_LOCAL_VALIDATION_CONTRACT',
    'COMPACT_STAGE_OUTPUT',
    ...(validationCode === 'traceability' ? ['TRACEABLE_STAGE_CONTRACT'] : []),
    ...(input.agentCode === 'AG-SEC' || input.agentCode === 'AG-REVIEW' ? ['FINAL_GATE_CONTRACT'] : []),
    ...(input.agentCode === 'AG-SEC' || input.agentCode === 'AG-REVIEW' ? ['TRACEABLE_GATE_CONTRACT'] : []),
    ...(input.agentCode === 'AG-SEC' || input.agentCode === 'AG-REVIEW'
      ? ['RESERVE_FINAL_GATE_TOKENS_80']
      : []),
    ...(validationCode === 'substantive_gate_blocked' ? ['PRESERVE_BLOCKED_GATE'] : []),
  ];
  return {
    version: '1.0.0',
    boundary: 'TRUSTED_LOCAL_VALIDATION_REPAIR',
    agentCode: input.agentCode,
    evidenceId: input.evidence.evidenceId,
    outputSha256: input.evidence.outputSha256,
    validationCode,
    validationProblem: sanitizeDemoScenario015ValidationProblem(input.problem),
    repairRules,
  };
}

export function classifyDemoScenario015ValidationProblem(problem: string): DemoScenario015RetryValidationCode {
  if (/阶段 Token 上限截断/.test(problem)) return 'output_truncated';
  if (/返回 GATE:BLOCKED/.test(problem)) return 'substantive_gate_blocked';
  if (/最后一个非空行输出 GATE:PASS 或 GATE:BLOCKED/.test(problem)) return 'final_gate_contract';
  if (/倒数第二个非空行必须严格为 FINDINGS/.test(problem)) return 'findings_contract';
  if (/High\/Medium finding|无 High\/Medium finding/.test(problem)) return 'gate_finding_consistency';
  if (/缺少可追溯依据/.test(problem)) return 'traceability';
  if (/未知依据标签/.test(problem)) return 'unknown_source_tag';
  if (/上下文中不存在的名称/.test(problem)) return 'unsupported_name';
  if (/内容过短/.test(problem)) return 'content_too_short';
  return 'local_validation';
}

export function validateDemoScenario015RetryOutcome(resultText: string, repair: DemoScenario015RetryFeedback): string | null {
  if (repair.validationCode === 'substantive_gate_blocked' && !resultText.trim().endsWith('GATE:BLOCKED')) {
    return `${repair.agentCode} 修复重试不得把实质性 GATE:BLOCKED 改写为 PASS`;
  }
  return null;
}

function sanitizeDemoScenario015ValidationProblem(problem: string): string {
  return problem.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) || '本地验收未通过';
}

export function validateDemoScenario015StageOutput(
  agentCode: SafePilotAgentCode,
  resultText: string,
  grounding: ProjectGroundingContext,
): string | null {
  const problem = validateConnectedStageResult({ agentCode, resultText, grounding });
  if (problem) return problem;
  const nonEmptyLines = resultText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (nonEmptyLines.length > PRODUCTIZED_STAGE_MAX_NONEMPTY_LINES) {
    return `${agentCode} 阶段产物超过 ${PRODUCTIZED_STAGE_MAX_NONEMPTY_LINES} 个非空行，未满足紧凑输出合同`;
  }
  if (countReadableWords(resultText) > PRODUCTIZED_STAGE_MAX_READABLE_WORDS) {
    return `${agentCode} 阶段产物超过 ${PRODUCTIZED_STAGE_MAX_READABLE_WORDS} 个中文可读字，未满足紧凑输出合同`;
  }
  if (['AG-SEC', 'AG-REVIEW'].includes(agentCode) && resultText.trim().endsWith('GATE:BLOCKED')) {
    return `${agentCode} 返回 GATE:BLOCKED，四 Agent run 必须转人工接管`;
  }
  return null;
}

export function validateProductizedProviderCompletion(evidence: Pick<ModelCallEvidence, 'agentId' | 'terminationReason'>): string | null {
  return evidence.terminationReason === 'length' || evidence.terminationReason === 'max_tokens'
    ? `${evidence.agentId} 输出已达到阶段 Token 上限截断，未进入任务验收`
    : null;
}

export function buildDemoScenario015Handoff(
  runId: string,
  fromAgentId: SafePilotAgentCode,
  evidence: ModelCallEvidence,
): ModelHandoffEnvelope | undefined {
  const fromIndex = SAFE_PILOT_AGENT_ORDER.indexOf(fromAgentId);
  const toAgentId = SAFE_PILOT_AGENT_ORDER[fromIndex + 1];
  if (!toAgentId) return undefined;
  if (evidence.acceptanceStatus !== 'accepted' || !evidence.acceptanceId) {
    throw new Error('四 Agent handoff 只能由已验收证据生成');
  }
  return {
    version: '1.0.0',
    runId,
    fromAgentId,
    toAgentId,
    evidenceId: evidence.evidenceId,
    outputSha256: evidence.outputSha256,
    acceptanceId: evidence.acceptanceId,
  };
}

export function DemoScenario015ConservativeMaxCostCny(): number {
  return productizedConservativeMaxCostCny(DemoScenario015_APPROVED_PRICING);
}

export function productizedConservativeMaxCostCny(pricing: SafePilotPricingInput): number {
  return (64_000 * (pricing.inputRatePerMillion ?? 0) +
    1_600 * (pricing.outputRatePerMillion ?? 0)) / 1_000_000;
}

export const buildProductizedRetryFeedback = buildDemoScenario015RetryFeedback;
export const classifyProductizedValidationProblem = classifyDemoScenario015ValidationProblem;
export const validateProductizedRetryOutcome = validateDemoScenario015RetryOutcome;
export const validateProductizedStageOutput = validateDemoScenario015StageOutput;
export const buildProductizedHandoff = buildDemoScenario015Handoff;
export const isProductizedTerminalFailure = isDemoScenario015TerminalFailure;
export const canOfferProductizedRetry = canOfferDemoScenario015Retry;

function normalizeHumanWaitMinutes(value: number): number {
  return Number.isInteger(value) && value >= 1 && value <= 30 ? value : 0;
}

export function isDemoScenario015TerminalFailure(problem: string, manualRetryAttempt = false): boolean {
  return manualRetryAttempt || /总超时预算已耗尽|活跃超时预算已耗尽|等待授权已过期|调用预算已耗尽|输入 Token 保守预算不足|输出 Token 预算不足|费用硬上限不足|授权已过期|授权当前不可调用|run 已取消/.test(problem);
}

export function canOfferDemoScenario015Retry(
  executionPhase: string,
  authorization: Pick<SafePilotAuthorizationSnapshot, 'status' | 'usage'> | null,
): boolean {
  return executionPhase === 'waiting_retry'
    && authorization?.status === 'waiting_retry_approval'
    && authorization.usage.manualRetriesUsed < 1;
}
