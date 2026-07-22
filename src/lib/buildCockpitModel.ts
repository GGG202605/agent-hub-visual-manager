import type {
  AgentFirstDashboardView,
  AgentRelationStatus,
  AgentRelationType,
  AgentRelationViewModel,
  CockpitViewModel,
  EvidenceCategoryViewModel,
  ImportedAgentHubProject,
  NavSectionViewModel,
  ProjectDataSourceKind,
} from '../types';

/**
 * v0.2 驾驶舱模型构建器（DemoScenario012-E 选项 B）。
 * 输入：Agent 大厅数据 + 项目档案 + 数据源类型；输出：诚实导航、类型化关系边、分类证据中心。
 * 纯函数、可单测。
 */

export const SECTION_IDS = {
  overview: 'sec-overview',
  agents: 'sec-agents',
  relations: 'sec-relations',
  decisions: 'sec-decisions',
  datasource: 'sec-datasource',
  evidence: 'sec-evidence',
} as const;

const RELATION_TYPE_LABELS: Record<AgentRelationType, string> = {
  dispatch: '调度',
  execution: '执行',
  review: '审查',
  approval: '审批',
  handoff: '交接',
  information: '信息',
};

export function buildCockpitModel(
  dashboard: AgentFirstDashboardView,
  project: ImportedAgentHubProject,
  sourceKind: ProjectDataSourceKind,
): CockpitViewModel {
  const sourceLabels: Record<ProjectDataSourceKind, string> = {
    mock: '演示数据（内置 mock）',
    imported: '真实项目档案（只读导入）',
    server: '本地服务（实时同步）',
  };

  return {
    sourceKind,
    sourceLabel: sourceLabels[sourceKind],
    nav: buildNavSections(),
    relations: buildTypedRelations(dashboard),
    evidence: buildEvidenceCategories(dashboard, project, sourceKind),
  };
}

/** 诚实导航：available 均对应真实页内锚点；planned 一律禁用并标注"待实现" */
function buildNavSections(): NavSectionViewModel[] {
  return [
    { id: SECTION_IDS.overview, label: '总览', state: 'active', description: '产品状态与指标' },
    { id: SECTION_IDS.agents, label: 'Agent 视图', state: 'available', description: '分层 Agent 卡片' },
    { id: SECTION_IDS.relations, label: '协作关系', state: 'available', description: '关系车道图' },
    { id: SECTION_IDS.decisions, label: '决策中心', state: 'available', description: '下一步路由' },
    { id: SECTION_IDS.datasource, label: '数据接入', state: 'available', description: '导入真实 .agent-hub' },
    { id: SECTION_IDS.evidence, label: '证据归档', state: 'available', description: '分类证据中心' },
    { id: 'planned-multi-project', label: '多项目管理', state: 'planned', description: '待实现（v0.3 规划）' },
    { id: 'planned-settings', label: '设置', state: 'planned', description: '待实现（v0.3 规划）' },
  ];
}

/** 把 dashboard.relations 归一为带类型/状态的关系边，供关系车道渲染 */
function buildTypedRelations(dashboard: AgentFirstDashboardView): AgentRelationViewModel[] {
  return dashboard.relations.map((relation, index) => {
    const type = inferRelationType(relation.label);
    const status: AgentRelationStatus =
      relation.state === 'paused' ? 'blocked' : relation.state === 'review' ? 'waiting' : 'active';

    return {
      id: `rel-${index}-${relation.from}-${relation.to}`,
      fromAgent: relation.from,
      toAgent: relation.to,
      type,
      typeLabel: RELATION_TYPE_LABELS[type],
      status,
      label: relation.label,
    };
  });
}

export function inferRelationType(label: string): AgentRelationType {
  if (/调度|拆解|分发|指派/.test(label)) return 'dispatch';
  if (/实现|执行|构建|产出/.test(label)) return 'execution';
  if (/审查|复核|送审|检查/.test(label)) return 'review';
  if (/审批|授权|收口|批准/.test(label)) return 'approval';
  if (/交接|接力|移交|回传/.test(label)) return 'handoff';
  return 'information';
}

/** 分类证据中心：替代"整页倾倒"，七大类、默认折叠、摘要优先 */
function buildEvidenceCategories(
  dashboard: AgentFirstDashboardView,
  project: ImportedAgentHubProject,
  sourceKind: ProjectDataSourceKind,
): EvidenceCategoryViewModel[] {
  const evidenceSourceShort = evidenceSourceShortLabel(sourceKind);
  const runs = project.runs.map((run) => ({
    status: run.status,
    searchable: `${run.runId} ${run.summary} ${run.activity} ${run.sourceRef}`,
    display: `${run.runId} · ${run.status} · ${run.summary} · 来源 ${run.sourceRef}`,
  }));
  const buildRunRecords = prioritizeAdverse(
    runs.filter((run) => /build|构建|preview|预览/i.test(run.searchable)),
    (run) => hasAdverseStatus(run.status),
  );
  const smokeRunRecords = prioritizeAdverse(
    runs.filter((run) => /\bsmoke\b|浏览器\s*smoke|视口|viewport|控制台(?:警告|错误)|console\s*(?:warn|error)/i.test(run.searchable)),
    (run) => hasAdverseStatus(run.status),
  );
  const smokeRuns = smokeRunRecords.map((run) => run.display);
  const securityReviewRecords = prioritizeAdverse(
    project.reviews.filter((review) => review.kind === 'AG-SEC'),
    hasAdverseReview,
  );
  const qualityReviewRecords = prioritizeAdverse(
    project.reviews.filter((review) => review.kind !== 'AG-SEC'),
    hasAdverseReview,
  );
  const reviewsSec = securityReviewRecords
    .map(
      (review) =>
        `${review.reviewId} · ${review.status} · High ${review.high} / Medium ${review.medium} / Low ${review.low} · 来源 ${review.sourceRef}`,
    );
  const reviewsQuality = qualityReviewRecords
    .map(
      (review) =>
        `${review.reviewId} (${review.kind}) · ${review.status} · High ${review.high} / Medium ${review.medium} / Low ${review.low} · 来源 ${review.sourceRef}`,
    );
  const receipts = prioritizeAdverse(
    dashboard.recentReceipts,
    (receipt) => hasAdverseText(`${receipt.time} ${receipt.summary}`),
  ).map((receipt) => `${receipt.title} · ${receipt.time} · ${receipt.summary}`);
  const provenance = project.provenance.map(
    (item) =>
      `${item.sourcePath} · 哈希 ${item.sourceHash || '未提供'} · 读取方式 ${item.readMode} · 声明置信度 ${item.confidence} · 限制 ${item.limitation || '未提供'}`,
  );
  const buildStatus = provided(project.project.buildStatus);
  const repoStatus = provided(project.project.repoStatus);
  const commitGate = provided(project.project.commitGate);
  const adverseBuildRuns = buildRunRecords.filter((run) => hasAdverseStatus(run.status)).map((run) => run.display);
  const otherBuildRuns = buildRunRecords.filter((run) => !hasAdverseStatus(run.status)).map((run) => run.display);
  const buildItems = [
    ...adverseBuildRuns,
    ...(buildStatus ? [`项目档案 buildStatus 声明：${buildStatus}`] : []),
    ...otherBuildRuns,
  ];
  const commitItems = [
    ...(repoStatus ? [`项目档案 repoStatus 声明：${repoStatus}`] : []),
    ...(commitGate ? [`项目档案 commitGate 声明：${commitGate}`] : []),
  ];

  return [
    {
      id: 'ev-build',
      label: '构建与预览',
      status: buildItems.length > 0
        ? compactEvidenceStatus(evidenceSourceShort, buildItems.length, '未复验')
        : '未提供 · 未验证',
      summary: '仅展示档案中的构建声明和匹配运行记录，不代表本页面执行过构建或预览。',
      items: capped(buildItems, ['未提供构建或预览记录；构建结果未验证。']),
      audience: 'developer',
    },
    {
      id: 'ev-smoke',
      label: '浏览器 Smoke',
      status: smokeRuns.length > 0
        ? compactEvidenceStatus(evidenceSourceShort, smokeRuns.length, '未复验')
        : '未提供 · 未验证',
      summary: '仅收录明确提及浏览器、视口或控制台的运行记录；不从其他运行记录推断 Smoke 已通过。',
      items: capped(smokeRuns, ['未提供浏览器 Smoke 记录；未验证视口、控制台或禁止动作按钮。']),
      audience: 'developer',
    },
    {
      id: 'ev-security',
      label: '安全复核',
      status: reviewsSec.length > 0
        ? compactEvidenceStatus(`${evidenceSourceShort} · AG-SEC`, reviewsSec.length)
        : '未提供 · 未验证',
      summary: '展示数据源提供的 AG-SEC 状态与分级计数；记录存在不等同于本轮安全批准。',
      items: capped(reviewsSec, ['未提供 AG-SEC 记录；安全结论未验证。']),
      audience: 'auditor',
    },
    {
      id: 'ev-quality',
      label: '质量复核',
      status: reviewsQuality.length > 0
        ? compactEvidenceStatus(`${evidenceSourceShort} · 复核`, reviewsQuality.length)
        : '未提供 · 未验证',
      summary: '展示非 AG-SEC 评审记录的原始状态与分级计数；不把草稿或待复核状态表述为最终批准。',
      items: capped(reviewsQuality, ['未提供质量复核记录；质量结论未验证。']),
      audience: 'auditor',
    },
    {
      id: 'ev-commit',
      label: '提交记录',
      status: commitItems.length > 0 ? `${evidenceSourceShort} · 未读取实时 Git` : '未提供 · 未验证',
      summary: '仅展示项目档案中的仓库与提交门禁声明；不是当前工作区 Git preflight 结果。',
      items: capped(commitItems, ['未提供仓库状态或提交门禁声明；Git 状态未验证。']),
      audience: 'developer',
    },
    {
      id: 'ev-receipts',
      label: '近期记录摘要',
      status: receipts.length > 0
        ? compactEvidenceStatus(`${evidenceSourceShort} · 派生摘要`, receipts.length)
        : '未提供',
      summary: '由当前面板的近期运行与评审摘要派生，仅供定位；不等同于原始操作回执或执行证明。',
      items: capped(receipts, ['当前数据源未提供可展示的近期记录摘要。']),
      audience: 'user',
    },
    {
      id: 'ev-provenance',
      label: '来源凭证',
      status: provenance.length > 0
        ? compactEvidenceStatus(`${evidenceSourceShort} · 来源`, provenance.length)
        : '未提供',
      summary: '展示数据源声明的路径、读取方式、置信度和限制；不把路径记录当作内容真实性证明。',
      items: capped(provenance, ['当前数据源未提供来源凭证元数据。']),
      audience: 'auditor',
    },
  ];
}

function capped(primary: string[], fallback: string[]): string[] {
  const list = primary.length > 0 ? primary : fallback;
  return list.slice(0, EVIDENCE_ITEM_LIMIT);
}

const EVIDENCE_ITEM_LIMIT = 6;

function compactEvidenceStatus(prefix: string, total: number, suffix?: string): string {
  const count = total > EVIDENCE_ITEM_LIMIT
    ? `总 ${total} / 展示 ${EVIDENCE_ITEM_LIMIT}`
    : `${total} 条`;
  return [prefix, count, suffix].filter(Boolean).join(' · ');
}

function prioritizeAdverse<T>(items: readonly T[], isAdverse: (item: T) => boolean): T[] {
  return [
    ...items.filter(isAdverse),
    ...items.filter((item) => !isAdverse(item)),
  ];
}

function hasAdverseStatus(status: string): boolean {
  return /failed|blocked|失败|阻塞/i.test(status);
}

function hasAdverseReview(review: ImportedAgentHubProject['reviews'][number]): boolean {
  return hasAdverseStatus(review.status) || review.high > 0 || review.medium > 0;
}

function hasAdverseText(text: string): boolean {
  return /failed|blocked|失败|阻塞/i.test(text) || /(?:High|Medium)\s+[1-9]\d*/i.test(text);
}

function evidenceSourceShortLabel(sourceKind: ProjectDataSourceKind): string {
  if (sourceKind === 'mock') return '演示';
  if (sourceKind === 'imported') return '导入';
  return '同步';
}

function provided(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || /^unknown(?:-|$)/i.test(normalized)) return null;
  return normalized;
}
