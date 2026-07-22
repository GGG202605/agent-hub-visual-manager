import type {
  AgentHubImportStatus,
  AgentId,
  FixtureAgentRecord,
  FixtureDecisionRecord,
  FixtureGateRecord,
  FixtureProvenanceRecord,
  FixtureReviewRecord,
  FixtureRiskRecord,
  FixtureRunRecord,
  FixtureTaskRecord,
  ImportedAgentHubProject,
  ImportFileNotice,
  ReviewKind,
  Severity,
} from '../types';

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 400;

type AllowedKind =
  | 'project-state'
  | 'task'
  | 'run'
  | 'review'
  | 'next-decision'
  | 'risk-register'
  | 'provenance'
  | 'build-validation';

interface ImportCandidate {
  file: File;
  relativePath: string;
  kind: AllowedKind;
}

interface ImportedDocument {
  relativePath: string;
  kind: AllowedKind;
  text: string;
  size: number;
}

const decisionCatalog: Record<string, string> = {
  IMPORT5: '另一个低风险项目的受控导入验证 / Controlled import validation with another low-risk project',
  IMPORT4: '更宽一轮受控导入验证 / Broader controlled import validation',
  IMPORT3: '真实导入手工验证 / Manual import validation',
  IMPORT2: '浏览器只读导入原型 / Browser import prototype',
  IMPORT1: '只读导入审批 / Import approval',
  LOOP4: '导入决策质量 refinement / Imported decision quality refinement',
  LOOP3: '导入 next decisions 驱动 topology + draft / Imported decision loop refinement',
  LOOP2: '半自动闭环 UX refinement / Semi-auto loop refinement',
  LOOP1: '半自动闭环原型 / Semi-auto loop prototype',
  ACTION0: 'action executor architecture only',
  HARDEN1: '导入安全加固 / Import hardening',
  UX4: '视觉与可用性升级 / UX refinement',
  DRAFT1: '指令草案 refinement / Instruction draft refinement',
  'PUSH-GATE': 'push policy review only',
  Pause: '暂停并等待用户决策 / Pause',
};

const importedDecisionOrder = [
  'LOOP3',
  'IMPORT4',
  'LOOP4',
  'IMPORT5',
  'ACTION0',
  'UX4',
  'HARDEN1',
  'IMPORT3',
  'IMPORT2',
  'IMPORT1',
  'LOOP2',
  'LOOP1',
  'DRAFT1',
  'PUSH-GATE',
  'Pause',
];

export async function importAgentHubFiles(inputFiles: FileList | File[]): Promise<ImportedAgentHubProject> {
  const files = Array.from(inputFiles);
  const evaluatedFiles = files.map((file) => evaluateFileCandidate(file));
  const allowedFileCount = evaluatedFiles.filter((candidate) => !('blocked' in candidate) && !('skipped' in candidate)).length;

  // 先计数再读正文；超限时整批阻断，避免浏览器通道绕过服务端 400 文件安全上限。
  if (allowedFileCount > MAX_FILES) {
    const importStatus: AgentHubImportStatus = {
      state: 'blocked',
      source: 'browser-selected-agent-hub',
      readMode: 'browser-selected-agent-hub',
      importedFiles: [],
      skippedFiles: [],
      blockedFiles: [{
        path: '(file-count limit)',
        reason: `allowlist Markdown 文件为 ${allowedFileCount} 个，超过 400 个上限；整次导入已阻断且未读取内容。`,
      }],
      warnings: ['浏览器导入文件数量超限。请缩小选择范围后重试。'],
      unsupportedFiles: [],
      lastImportedAt: new Date().toISOString(),
      readOnly: true,
      executionConnected: false,
      totalBytes: 0,
    };
    return buildImportedProject([], importStatus);
  }

  const importedFiles: string[] = [];
  const skippedFiles: ImportFileNotice[] = [];
  const blockedFiles: ImportFileNotice[] = [];
  const warnings: string[] = [];
  const documents: ImportedDocument[] = [];
  let totalBytes = 0;

  for (const [index, file] of files.entries()) {
    const candidate = evaluatedFiles[index]!;

    if ('blocked' in candidate) {
      blockedFiles.push(candidate.blocked);
      continue;
    }

    if ('skipped' in candidate) {
      skippedFiles.push(candidate.skipped);
      continue;
    }

    if (file.size > MAX_FILE_BYTES) {
      skippedFiles.push({
        path: candidate.relativePath,
        reason: '文件超过 256 KB 上限，已跳过且未读取内容。',
      });
      continue;
    }

    if (totalBytes + file.size > MAX_TOTAL_BYTES) {
      skippedFiles.push({
        path: candidate.relativePath,
        reason: '本次导入超过 2 MB 总量上限，后续文件已跳过。',
      });
      continue;
    }

    try {
      const text = await file.text();
      totalBytes += file.size;
      importedFiles.push(candidate.relativePath);
      documents.push({
        relativePath: candidate.relativePath,
        kind: candidate.kind,
        text,
        size: file.size,
      });
    } catch {
      blockedFiles.push({
        path: candidate.relativePath,
        reason: '浏览器读取失败，已按 blocked 记录且不展示内容。',
      });
    }
  }

  if (files.length === 0) {
    warnings.push('未选择文件，仍使用 fixture fallback。');
  }

  if (documents.length === 0) {
    warnings.push('没有可导入的 allowlist Markdown 文件。');
  }

  const importStatus: AgentHubImportStatus = {
    state: documents.length === 0 ? 'blocked' : skippedFiles.length > 0 || blockedFiles.length > 0 ? 'partial' : 'ready',
    source: 'browser-selected-agent-hub',
    readMode: 'browser-selected-agent-hub',
    importedFiles,
    skippedFiles,
    blockedFiles,
    warnings,
    unsupportedFiles: skippedFiles.map((notice) => notice.path),
    lastImportedAt: new Date().toISOString(),
    readOnly: true,
    executionConnected: false,
    totalBytes,
  };

  return buildImportedProject(documents, importStatus);
}

function evaluateFileCandidate(
  file: File,
): ImportCandidate | { skipped: ImportFileNotice } | { blocked: ImportFileNotice } {
  const browserPath = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name || '').replace(
    /\\/g,
    '/',
  );

  if (!browserPath) {
    return {
      skipped: {
        path: '(unknown)',
        reason: '浏览器未提供文件名，已跳过。',
      },
    };
  }

  if (browserPath.startsWith('/') || /^[a-zA-Z]:/.test(browserPath) || browserPath.includes('://')) {
    return {
      blocked: {
        path: '(absolute path blocked)',
        reason: '检测到绝对路径或 URL 形态，浏览器导入只接受相对路径。',
      },
    };
  }

  const segments = browserPath.split('/').filter(Boolean);
  const agentHubIndex = segments.findIndex((segment) => segment === '.agent-hub');

  if (agentHubIndex === -1) {
    return {
      skipped: {
        path: browserPath,
        reason: '不在 .agent-hub 目录下，已跳过。',
      },
    };
  }

  const relativeSegments = segments.slice(agentHubIndex + 1);

  if (relativeSegments.length === 0) {
    return {
      skipped: {
        path: browserPath,
        reason: '选择的是 .agent-hub 目录本身，不是文件。',
      },
    };
  }

  const relativePath = relativeSegments.join('/');
  const lowerSegments = relativeSegments.map((segment) => segment.toLowerCase());
  const fileName = relativeSegments[relativeSegments.length - 1] ?? '';
  const lowerFileName = fileName.toLowerCase();

  if (relativeSegments.some((segment) => segment === '..' || segment.includes('\0') || segment.trim() !== segment)) {
    return {
      blocked: {
        path: relativePath,
        reason: '路径包含可疑片段，已阻断。',
      },
    };
  }

  if (lowerSegments.some((segment) => [
    'cache',
    'exports',
    'screenshots',
    'ocr',
    'private-data',
    'private-knowledge-base',
  ].includes(segment))) {
    return {
      blocked: {
        path: relativePath,
        reason: '命中 cache/exports/screenshots/OCR/private-data/private-knowledge-base denylist，已阻断。',
      },
    };
  }

  if (
    lowerFileName === '.env' ||
    lowerFileName.endsWith('.key') ||
    lowerFileName.endsWith('.pem') ||
    lowerFileName.startsWith('credentials') ||
    lowerFileName.startsWith('secrets')
  ) {
    return {
      blocked: {
        path: relativePath,
        reason: '疑似密钥或凭据文件，已阻断。',
      },
    };
  }

  if (isLikelyBinaryOrImage(lowerFileName)) {
    return {
      blocked: {
        path: relativePath,
        reason: '图片或二进制文件不在导入范围，已阻断。',
      },
    };
  }

  if (!lowerFileName.endsWith('.md')) {
    return {
      skipped: {
        path: relativePath,
        reason: '仅支持 allowlist Markdown 文件。',
      },
    };
  }

  const kind = classifyAllowedPath(relativePath);

  if (!kind) {
    return {
      skipped: {
        path: relativePath,
        reason: 'Markdown 文件未命中本轮 allowlist。',
      },
    };
  }

  return {
    file,
    relativePath,
    kind,
  };
}

function classifyAllowedPath(relativePath: string): AllowedKind | null {
  if (relativePath === 'project-state.md') {
    return 'project-state';
  }

  if (/^tasks\/[^/]+\.md$/i.test(relativePath)) {
    return 'task';
  }

  if (/^runs\/[^/]+\.md$/i.test(relativePath)) {
    return 'run';
  }

  if (/^reviews\/[^/]+\.md$/i.test(relativePath)) {
    return 'review';
  }

  if (/(^|\/)NEXT-DECISION-PACKET\.md$/i.test(relativePath)) {
    return 'next-decision';
  }

  if (/(^|\/)RISK-REGISTER\.md$/i.test(relativePath)) {
    return 'risk-register';
  }

  if (/(^|\/)PROVENANCE\.md$/i.test(relativePath)) {
    return 'provenance';
  }

  if (/(^|\/)BUILD-VALIDATION\.md$/i.test(relativePath)) {
    return 'build-validation';
  }

  return null;
}

function isLikelyBinaryOrImage(fileName: string) {
  return /\.(png|jpe?g|gif|webp|avif|bmp|ico|pdf|zip|7z|rar|gz|tar|exe|dll|sqlite|db|bin)$/i.test(fileName);
}

function buildImportedProject(documents: ImportedDocument[], importStatus: AgentHubImportStatus): ImportedAgentHubProject {
  const projectState = documents.find((document) => document.kind === 'project-state');
  const buildValidation = documents.find((document) => document.kind === 'build-validation');
  const nextDecisionDocs = documents.filter((document) => document.kind === 'next-decision');
  const riskDocs = documents.filter((document) => document.kind === 'risk-register');

  const project = {
    projectId: readField(projectState?.text, ['Project ID']) || 'browser-selected-agent-hub',
    projectName:
      readField(projectState?.text, ['Project Name']) ||
      readField(projectState?.text, ['Project']) ||
      'Browser-selected AgentHub Project',
    currentGoal: summarizeSection(projectState?.text, 'Current Objective') || firstTaskTitle(documents) || '浏览器选择的 .agent-hub 摘要',
    currentPhase:
      readField(projectState?.text, ['Status', 'Current Status']) ||
      summarizeSection(projectState?.text, 'Current Status') ||
      'browser_read_only_import',
    stableBaseline:
      readField(projectState?.text, ['Last Verified Commit', 'Current Stable Baseline']) ||
      'unknown-browser-selected-baseline',
    buildStatus: summarizeBuildStatus(buildValidation?.text),
    repoStatus: '浏览器本地文件导入；未读取 Git 状态 / Browser local import only',
    commitGate: '只读导入；未连接 Git commit/push / Read-only, no Git action',
  };

  const tasks = parseTasks(documents.filter((document) => document.kind === 'task'));
  const runs = parseRuns(documents.filter((document) => document.kind === 'run'));
  const reviews = parseReviews(documents.filter((document) => document.kind === 'review'));
  const decisions = parseDecisions(nextDecisionDocs);
  const risks = parseRisks(riskDocs);
  const agents = buildAgents(tasks, reviews, risks, importStatus);
  const provenance = buildProvenance(documents);
  const gates = buildGates(importStatus);

  return {
    project,
    gates,
    agents,
    tasks,
    runs,
    reviews,
    decisions,
    risks,
    provenance,
    importStatus,
  };
}

function parseTasks(taskDocs: ImportedDocument[]): FixtureTaskRecord[] {
  const tasks = taskDocs.map((document, index) => ({
    taskId: importedRecordId('task', document, index),
    title: firstHeading(document.text) || readField(document.text, ['Task', 'Title']) || '导入任务摘要',
    owner: readAgentId(document.text) ?? 'AG-ARCH',
    status: readAgentStatus(document.text),
    sourceRef: document.relativePath,
  }));

  return tasks.length > 0
    ? tasks
    : [
        {
          taskId: 'TASK-BROWSER-IMPORT',
          title: '浏览器本地只读导入已完成',
          owner: 'AG-ARCH',
          status: 'Done',
          sourceRef: 'browser-selected-files',
        },
      ];
}

function parseRuns(runDocs: ImportedDocument[]): FixtureRunRecord[] {
  const runs = runDocs.map((document, index) => ({
    runId: importedRecordId('run', document, index),
    summary: firstHeading(document.text) || readField(document.text, ['Summary', 'Run']) || '导入运行记录摘要',
    status: readAgentStatus(document.text),
    activity: summarizeSection(document.text, 'Current Status') || summarizeSection(document.text, 'Status') || '已提取已知字段，原文按 tainted data 处理。',
    sourceRef: document.relativePath,
  }));

  return runs.length > 0
    ? runs
    : [
        {
          runId: 'RUN-BROWSER-IMPORT',
          summary: '浏览器导入运行摘要',
          status: 'Done',
          activity: '只读解析 allowlist Markdown；未连接执行能力。',
          sourceRef: 'browser-selected-files',
        },
      ];
}

function parseReviews(reviewDocs: ImportedDocument[]): FixtureReviewRecord[] {
  const reviews = reviewDocs.map((document, index) => ({
    reviewId: importedRecordId('review', document, index),
    kind: readReviewKind(document.text, document.relativePath),
    status: readAgentStatus(document.text),
    high: readSeverityCount(document.text, 'High'),
    medium: readSeverityCount(document.text, 'Medium'),
    low: readSeverityCount(document.text, 'Low'),
    sourceRef: document.relativePath,
  }));

  return reviews.length > 0
    ? reviews
    : [
        {
          reviewId: 'REVIEW-BROWSER-IMPORT-SAFETY',
          kind: 'AG-SEC',
          status: 'Review Ready',
          high: 0,
          medium: 0,
          low: 0,
          sourceRef: 'browser-import-safety-gate',
        },
      ];
}

function parseDecisions(nextDecisionDocs: ImportedDocument[]): FixtureDecisionRecord[] {
  const importedDecisions = nextDecisionDocs.flatMap((document) =>
    extractDecisionOptions(document).map((optionId) => {
      const optionBlock = extractOptionBlock(document.text, optionId);

      return {
        optionId,
        title: readDecisionTitle(document.text, optionId) ?? decisionTitle(optionId),
        status: 'needs_user_decision' as const,
        reason: readDecisionReason(optionBlock) ?? '从导入的 NEXT-DECISION-PACKET 生成；推荐不等于审批。',
        sourceRef: document.relativePath,
        approvalRequired: true,
        proRequired: !/\bPro_required\s*[:=]\s*false\b/i.test(optionBlock),
        commitAllowed: false,
        conditionalCommitAllowed: false,
      };
    }),
  );

  const fallbackSource = nextDecisionDocs[0]?.relativePath ?? 'browser-import-generated';
  const fallbackDecisions = ['LOOP3', 'IMPORT4', 'ACTION0', 'UX4', 'Pause'].map((optionId) => ({
    optionId,
    title: decisionTitle(optionId),
    status: 'needs_user_decision' as const,
    reason: '未提取到完整 option 字段，使用安全 fallback；推荐不等于审批。',
    sourceRef: fallbackSource,
    approvalRequired: true,
    proRequired: true,
    commitAllowed: false,
    conditionalCommitAllowed: false,
  }));

  return sortDecisionsByPriority(dedupeBy(importedDecisions.length > 0 ? importedDecisions : fallbackDecisions, (decision) => decision.optionId));
}

function parseRisks(riskDocs: ImportedDocument[]): FixtureRiskRecord[] {
  const risks = riskDocs.map((document, index) => {
    const severity = readSeverity(document.text);

    return {
      riskId: importedRecordId('risk', document, index),
      severity,
      description: firstHeading(document.text) || readField(document.text, ['Risk', 'Description']) || '导入风险摘要',
      mitigation: readField(document.text, ['Mitigation', 'Control']) || '仅展示摘要；原文视为 tainted data，不触发执行。',
      blocking: severity === 'High',
      owner: 'AG-SEC' as AgentId,
      sourceRef: document.relativePath,
    };
  });

  return risks.length > 0
    ? risks
    : [
        {
          riskId: 'RISK-BROWSER-IMPORT-BOUNDARY',
          severity: 'Low',
          description: '浏览器只读导入需要持续保持无上传、无写入、无执行边界。',
          mitigation: '所有文件来自用户选择；仅解析 allowlist Markdown 摘要。',
          blocking: false,
          owner: 'AG-SEC',
          sourceRef: 'browser-import-safety-gate',
        },
      ];
}

function buildAgents(
  tasks: FixtureTaskRecord[],
  reviews: FixtureReviewRecord[],
  risks: FixtureRiskRecord[],
  importStatus: AgentHubImportStatus,
): FixtureAgentRecord[] {
  const blockedRisk = risks.find((risk) => risk.blocking);
  const securityReview = reviews.find((review) => review.kind === 'AG-SEC');
  const generalReview = reviews.find((review) => review.kind === 'AG-REVIEW') ?? reviews[0];

  return [
    {
      agentId: 'AG-ARCH',
      agentName: 'Architect',
      roleTitle: '架构规划 / Architect',
      visualRole: '浏览器导入结构映射',
      status: tasks.length > 0 ? 'Done' : 'Idle',
      currentTask: '将 allowlist Markdown 摘要映射为 dashboard state',
      riskLevel: 'Low',
      reviewCount: 0,
      lastActivity: `${importStatus.importedFiles.length} 个文件进入只读解析`,
      needsUserDecision: false,
      activityIndicator: 'blue/cyan glow pulse',
      sourceRefs: importStatus.importedFiles.slice(0, 3),
    },
    {
      agentId: 'AG-SEC',
      agentName: 'Sentinel',
      roleTitle: '安全守卫 / Shield Guardian',
      visualRole: 'denylist 与 trust boundary',
      status: blockedRisk ? 'Blocked' : 'Review Ready',
      currentTask: '阻断 secrets/cache/exports/OCR/private-data 与二进制文件',
      riskLevel: blockedRisk ? 'High' : 'Low',
      reviewCount: securityReview ? 1 : 0,
      lastActivity: `${importStatus.blockedFiles.length} 个文件被阻断`,
      needsUserDecision: Boolean(blockedRisk),
      blockedReason: blockedRisk?.description,
      activityIndicator: blockedRisk ? 'red warning pulse' : 'gold seal glow',
      sourceRefs: importStatus.blockedFiles.slice(0, 3).map((notice) => notice.path),
    },
    {
      agentId: 'AG-REVIEW',
      agentName: 'Arbiter',
      roleTitle: '总审复核 / Elder Reviewer',
      visualRole: '导入摘要复核',
      status: 'Review Ready',
      currentTask: '确认导入结果仅展示摘要且不执行指令',
      riskLevel: 'None',
      reviewCount: generalReview ? 1 : 0,
      lastActivity: '导入内容按 tainted data 处理',
      needsUserDecision: false,
      activityIndicator: 'gold seal glow',
      sourceRefs: reviews.slice(0, 3).map((review) => review.sourceRef),
    },
    {
      agentId: 'AG-CODE',
      agentName: 'Mechanist',
      roleTitle: '代码执行 / Tech Engineer',
      visualRole: '无执行连接',
      status: 'Idle',
      currentTask: '未连接 filesystem / Git / npm / Wiki / Codex executor',
      riskLevel: 'None',
      reviewCount: 0,
      lastActivity: '浏览器 state only',
      needsUserDecision: false,
      activityIndicator: 'low-saturation idle float',
      sourceRefs: ['browser-import-read-only-state'],
    },
    {
      agentId: 'AG-DOCS',
      agentName: 'Archivist',
      roleTitle: '文档整理 / Knowledge Scholar',
      visualRole: '来源记录整理',
      status: 'Done',
      currentTask: '记录 imported/skipped/blocked 文件计数',
      riskLevel: 'Low',
      reviewCount: 0,
      lastActivity: `${importStatus.skippedFiles.length} 个文件被跳过`,
      needsUserDecision: false,
      activityIndicator: 'purple decision bubble',
      sourceRefs: importStatus.skippedFiles.slice(0, 3).map((notice) => notice.path),
    },
    {
      agentId: 'AG-GIT',
      agentName: 'Gatekeeper',
      roleTitle: '提交门禁 / Repo Gatekeeper',
      visualRole: 'Git action disconnected',
      status: 'Idle',
      currentTask: '浏览器导入不会 git add / commit / push',
      riskLevel: 'None',
      reviewCount: 0,
      lastActivity: 'executionConnected=false',
      needsUserDecision: false,
      activityIndicator: 'green stable aura',
      sourceRefs: ['no-git-action-connected'],
    },
  ];
}

function buildGates(importStatus: AgentHubImportStatus): FixtureGateRecord[] {
  return [
    {
      gateId: 'gate-browser-selected',
      label: '浏览器选择 / Browser selected',
      state: importStatus.importedFiles.length > 0 ? 'open' : 'blocked',
      requiredApproval: '用户手动选择 .agent-hub 文件夹或文件',
      blockingReason: importStatus.importedFiles.length > 0 ? 'none' : '没有 allowlist 文件进入导入',
    },
    {
      gateId: 'gate-read-only',
      label: '只读模式 / Read-only',
      state: 'open',
      requiredApproval: '无写入、无上传、无持久化',
      blockingReason: 'none',
    },
    {
      gateId: 'gate-executor',
      label: '执行能力 / Executor',
      state: 'blocked',
      requiredApproval: '本原型不连接 executor',
      blockingReason: 'filesystem / Git / npm / Wiki / Codex action 均未连接',
    },
    {
      gateId: 'gate-denylist',
      label: 'denylist',
      state: importStatus.blockedFiles.length > 0 ? 'needs_user_decision' : 'open',
      requiredApproval: 'blocked 文件只显示路径和原因，不显示内容',
      blockingReason: `${importStatus.blockedFiles.length} blocked`,
    },
  ];
}

function buildProvenance(documents: ImportedDocument[]): FixtureProvenanceRecord[] {
  return documents.map((document) => ({
    sourcePath: document.relativePath,
    sourceHash: lightweightHash(document.text),
    readMode: 'browser-selected-agent-hub',
    confidence: 'medium',
    limitation: 'browser-only summary parse; source text is treated as tainted data',
  }));
}

function summarizeBuildStatus(text?: string) {
  if (!text) {
    return '未导入 BUILD-VALIDATION.md / build evidence not selected';
  }

  if (/exit\s*code\s*`?0`?|build_passed|passed|success/i.test(text)) {
    return 'build 记录显示通过 / imported build passed';
  }

  if (/fail|error|exit\s*code\s*[1-9]/i.test(text)) {
    return 'build 记录含失败信号 / imported build warning';
  }

  return '已导入 BUILD-VALIDATION.md / build evidence summarized';
}

function firstTaskTitle(documents: ImportedDocument[]) {
  const taskDoc = documents.find((document) => document.kind === 'task');
  return taskDoc ? firstHeading(taskDoc.text) || readField(taskDoc.text, ['Task', 'Title']) : undefined;
}

function firstHeading(text?: string) {
  const match = text?.match(/^#{1,3}\s+(.+)$/m);
  return sanitizeSummary(match?.[1]);
}

function summarizeSection(text: string | undefined, heading: string) {
  if (!text) {
    return undefined;
  }

  const escaped = escapeRegExp(heading);
  const match = text.match(new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(\\n##\\s+|$)`, 'i'));
  return sanitizeSummary(match?.[1]);
}

function readField(text: string | undefined, labels: string[]) {
  if (!text) {
    return undefined;
  }

  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const match =
      text.match(new RegExp(`^-\\s*${escaped}:\\s*(.+)$`, 'im')) ??
      text.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'im'));

    const value = sanitizeSummary(match?.[1]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function readAgentId(text: string): AgentId | undefined {
  const match = text.match(/\bAG-(ARCH|SEC|REVIEW|CODE|DOCS|GIT)\b/);
  return match?.[0] as AgentId | undefined;
}

function readAgentStatus(text: string): FixtureTaskRecord['status'] {
  if (/blocked|阻塞|已阻塞/i.test(text)) {
    return 'Blocked';
  }

  if (/needs_user_decision|待用户|用户决策/i.test(text)) {
    return 'Needs User Decision';
  }

  if (/review_ready|复核|review/i.test(text)) {
    return 'Review Ready';
  }

  if (/done|closed|committed|complete|已完成|已提交/i.test(text)) {
    return 'Done';
  }

  if (/working|in_progress|进行中|工作中/i.test(text)) {
    return 'Working';
  }

  return 'Idle';
}

function readReviewKind(text: string, path: string): ReviewKind {
  const haystack = `${path}\n${text}`;

  if (/AG-SEC/i.test(haystack)) {
    return 'AG-SEC';
  }

  if (/PRO/i.test(haystack)) {
    return 'PRO';
  }

  return 'AG-REVIEW';
}

function readSeverity(text: string): Severity {
  if (/\bHigh\b|高/i.test(text)) {
    return 'High';
  }

  if (/\bMedium\b|中/i.test(text)) {
    return 'Medium';
  }

  return 'Low';
}

function readSeverityCount(text: string, label: Severity) {
  const match =
    text.match(new RegExp(`${label}\\s*[:：]\\s*(\\d+)`, 'i')) ??
    text.match(new RegExp(`${label}\\s*/\\s*Medium\\s*/\\s*Low\\s*[:：]?\\s*(\\d+)`, 'i'));

  return Number(match?.[1] ?? 0);
}

function decisionTitle(optionId: string) {
  return decisionCatalog[optionId] ?? optionId;
}

function fileStem(relativePath: string) {
  return relativePath.split('/').pop()?.replace(/\.md$/i, '');
}

function importedRecordId(prefix: 'task' | 'run' | 'review' | 'risk', document: ImportedDocument, index: number) {
  const normalizedId = normalizeIdentifier(fileStem(document.relativePath) ?? prefix);
  const sourceHash = lightweightHash(document.relativePath).replace('browser-fnv1a-', '');

  return `${prefix}-${normalizedId}-${String(index + 1).padStart(2, '0')}-${sourceHash}`;
}

function extractDecisionOptions(document: ImportedDocument) {
  const optionIds = new Set<string>();

  for (const optionId of Object.keys(decisionCatalog)) {
    if (new RegExp(`\\b${escapeRegExp(optionId)}\\b`, 'i').test(document.text)) {
      optionIds.add(optionId);
    }
  }

  const explicitOptionPattern = /(?:^|\n)\s*(?:#{1,4}\s*)?(?:[-*]\s*)?Option\s+([A-Z][A-Z0-9-]{1,24}|Pause)\b/gi;
  let optionMatch: RegExpExecArray | null;

  while ((optionMatch = explicitOptionPattern.exec(document.text))) {
    const optionId = normalizeOptionId(optionMatch[1]);

    if (isDecisionOption(optionId)) {
      optionIds.add(optionId);
    }
  }

  const bulletOptionPattern = /(?:^|\n)\s*[-*]\s*([A-Z][A-Z0-9-]{2,24}|Pause)\s*[：:]/g;
  let bulletMatch: RegExpExecArray | null;

  while ((bulletMatch = bulletOptionPattern.exec(document.text))) {
    const optionId = normalizeOptionId(bulletMatch[1]);

    if (isDecisionOption(optionId)) {
      optionIds.add(optionId);
    }
  }

  return sortOptionIds([...optionIds]);
}

function readDecisionTitle(text: string, optionId: string) {
  const line = text
    .split(/\r?\n/)
    .find((candidate) => new RegExp(`\\b(?:Option\\s+)?${escapeRegExp(optionId)}\\b`, 'i').test(candidate));

  if (!line) {
    return undefined;
  }

  const title = line
    .replace(/^#+\s*/, '')
    .replace(/^[-*]\s*/, '')
    .replace(new RegExp(`^Option\\s+${escapeRegExp(optionId)}\\s*[:：-]?\\s*`, 'i'), '')
    .replace(new RegExp(`^${escapeRegExp(optionId)}\\s*[:：-]?\\s*`, 'i'), '')
    .trim();

  return sanitizeSummary(title, 140) || undefined;
}

function readDecisionReason(optionBlock: string) {
  return (
    readField(optionBlock, ['Reason', 'reason', '推荐理由', '说明']) ??
    sanitizeSummary(
      optionBlock
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !/^#{1,4}\s*/.test(line) && !/^[-*]\s*Option\b/i.test(line)),
      150,
    )
  );
}

function extractOptionBlock(text: string, optionId: string) {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => new RegExp(`\\b(?:Option\\s+)?${escapeRegExp(optionId)}\\b`, 'i').test(line));

  if (startIndex === -1) {
    return text;
  }

  const nextIndex = lines.findIndex(
    (line, index) =>
      index > startIndex &&
      /^(\s*#{1,4}\s+|\s*[-*]\s*)?(Option\s+)?([A-Z][A-Z0-9-]{1,24}|Pause)\b/.test(line),
  );

  return lines.slice(startIndex, nextIndex === -1 ? startIndex + 10 : nextIndex).join('\n');
}

function sortDecisionsByPriority(decisions: FixtureDecisionRecord[]) {
  return [...decisions].sort(
    (left, right) =>
      optionPriority(left.optionId) - optionPriority(right.optionId) || left.sourceRef.localeCompare(right.sourceRef),
  );
}

function sortOptionIds(optionIds: string[]) {
  return [...optionIds].sort((left, right) => optionPriority(left) - optionPriority(right) || left.localeCompare(right));
}

function optionPriority(optionId: string) {
  const index = importedDecisionOrder.indexOf(optionId);
  return index === -1 ? importedDecisionOrder.length + 1 : index;
}

function normalizeOptionId(value: string) {
  return value.toLowerCase() === 'pause' ? 'Pause' : value.toUpperCase();
}

function isDecisionOption(optionId: string) {
  return /^(IMPORT|LOOP|UX|ACTION|PUSH|DRAFT|HARDEN)[A-Z0-9-]*$/.test(optionId) || optionId === 'Pause';
}

function normalizeIdentifier(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'imported'
  );
}

function sanitizeSummary(value: string | undefined, maxLength = 180) {
  const normalized = value
    ?.replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function lightweightHash(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `browser-fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function dedupeBy<T>(items: T[], keySelector: (item: T) => string) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = keySelector(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
