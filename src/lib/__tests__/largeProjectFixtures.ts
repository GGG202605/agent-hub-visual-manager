import { basicAgentHubFixture } from '../../data/basicAgentHubFixture';
import { mockAgentHub } from '../../data/mockAgentHub';
import { parseBasicAgentHubFixture } from '../agentHubFixtureParser';
import type { RuntimeEvent } from '../serverBridge';

export const PERFORMANCE_FIXTURE_SEED = 234;

export const PERFORMANCE_TIERS = [
  { name: 'S', fileCount: 50, totalBytes: 256 * 1024, records: 48 },
  { name: 'M', fileCount: 200, totalBytes: 1024 * 1024, records: 200 },
  { name: 'L', fileCount: 400, totalBytes: 2 * 1024 * 1024, records: 400 },
] as const;

export interface MetricSummary {
  samplesMs: number[];
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  coefficientOfVariation: number;
}

export function createMarkdownFile(relativePath: string, text: string): File {
  const file = new File([text], relativePath.split('/').pop()!, { type: 'text/markdown' });
  Object.defineProperty(file, 'webkitRelativePath', {
    value: `fixture/.agent-hub/${relativePath}`,
    configurable: true,
  });
  return file;
}

export function createImportFiles(fileCount: number, totalBytes: number): File[] {
  const baseSize = Math.floor(totalBytes / fileCount);
  const remainder = totalBytes % fileCount;
  return Array.from({ length: fileCount }, (_, index) => {
    const ordinal = String(index + 1).padStart(4, '0');
    const header = `# Synthetic task ${ordinal} seed ${PERFORMANCE_FIXTURE_SEED}\n- Owner: AG-ARCH\n- Status: Done\n`;
    const targetSize = baseSize + (index < remainder ? 1 : 0);
    if (targetSize < header.length) throw new Error('Synthetic fixture byte budget is too small');
    return createMarkdownFile(`tasks/TASK-${ordinal}.md`, header + 'x'.repeat(targetSize - header.length));
  });
}

export function createGroundingFixture(totalRecords: number) {
  const base = parseBasicAgentHubFixture(basicAgentHubFixture);
  const beacon = `DemoScenario016-seed-${PERFORMANCE_FIXTURE_SEED}-beacon`;
  const count = Math.max(1, Math.floor(totalRecords / 4));
  const early = Math.floor((count - 1) * 0.1);
  const middle = Math.floor((count - 1) * 0.5);
  const late = Math.floor((count - 1) * 0.9);
  const taskTemplate = base.tasks[0]!;
  const runTemplate = base.runs[0]!;
  const reviewTemplate = base.reviews[0]!;
  const riskTemplate = base.risks[0]!;
  const dashboardBase = mockAgentHub.agentFirstDashboard;

  const project = {
    ...base,
    project: {
      ...base.project,
      projectName: `Synthetic project ${beacon}`,
      currentGoal: `Synthetic goal ${beacon}`,
      stableBaseline: `Synthetic baseline ${beacon}`,
    },
    tasks: Array.from({ length: count }, (_, index) => ({
      ...taskTemplate,
      taskId: `SYN-T-${index + 1}`,
      title: index === late ? `Late task ${beacon}` : `Task performance baseline distractor ${index + 1}`,
      sourceRef: `tasks/synthetic-${index + 1}.md`,
    })),
    runs: Array.from({ length: count }, (_, index) => ({
      ...runTemplate,
      runId: `SYN-R-${index + 1}`,
      summary: index === middle ? `Middle run ${beacon}` : `Run performance history ${index + 1}`,
      sourceRef: `runs/synthetic-${index + 1}.md`,
    })),
    reviews: Array.from({ length: count }, (_, index) => ({
      ...reviewTemplate,
      reviewId: `SYN-V-${index + 1}`,
      sourceRef: index === early ? `reviews/${beacon}.md` : `reviews/synthetic-${index + 1}.md`,
    })),
    risks: Array.from({ length: count }, (_, index) => ({
      ...riskTemplate,
      riskId: `SYN-K-${index + 1}`,
      description: index === late ? `Late risk ${beacon}` : `Risk performance baseline ${index + 1}`,
      sourceRef: `risks/synthetic-${index + 1}.md`,
    })),
  };
  const dashboard = {
    ...dashboardBase,
    nextStep: `Synthetic next step ${beacon}`,
    agents: dashboardBase.agents.map((agent, index) => index === dashboardBase.agents.length - 1
      ? { ...agent, taskSummary: `Agent task ${beacon}` }
      : agent),
    nextActions: dashboardBase.nextActions.map((action, index) => index === dashboardBase.nextActions.length - 1
      ? { ...action, summary: `Next action ${beacon}` }
      : action),
    evidenceSummary: dashboardBase.evidenceSummary.map((evidence, index) => index === dashboardBase.evidenceSummary.length - 1
      ? `${evidence} ${beacon}`
      : evidence),
  };

  return {
    project,
    dashboard,
    beacon,
    expectedTags: [
      'P1',
      'P2',
      'P3',
      'P4',
      `A${dashboard.agents.length}`,
      `T${late + 1}`,
      `R${middle + 1}`,
      `V${early + 1}`,
      `K${late + 1}`,
      `N${dashboard.nextActions.length}`,
      `E${dashboard.evidenceSummary.length}`,
    ],
  };
}

export function createRuntimeEvents(count: number): RuntimeEvent[] {
  return Array.from({ length: count }, (_, index) => {
    const seq = index + 1;
    return {
      id: `synthetic-event-${seq}`,
      seq,
      at: new Date(Date.UTC(2026, 6, 12) + seq).toISOString(),
      workspaceId: 'DemoScenario016-synthetic',
      category: 'operation',
      type: 'performance-baseline',
      status: 'info',
      title: `Synthetic event ${seq}`,
      summary: `seed=${PERFORMANCE_FIXTURE_SEED}`,
    };
  });
}

export function measureSync<T>(operation: () => T, warmups = 2, runs = 10, batchSize = 1) {
  const runBatch = () => {
    let value!: T;
    for (let index = 0; index < batchSize; index += 1) value = operation();
    return value;
  };
  for (let index = 0; index < warmups; index += 1) runBatch();
  let value!: T;
  const samplesMs = Array.from({ length: runs }, () => {
    const started = performance.now();
    value = runBatch();
    return (performance.now() - started) / batchSize;
  });
  return { value, metric: summarize(samplesMs) };
}

export async function measureAsync<T>(operation: () => Promise<T>, warmups = 2, runs = 10, batchSize = 1) {
  const runBatch = async () => {
    let value!: T;
    for (let index = 0; index < batchSize; index += 1) value = await operation();
    return value;
  };
  for (let index = 0; index < warmups; index += 1) await runBatch();
  let value!: T;
  const samplesMs: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    value = await runBatch();
    samplesMs.push((performance.now() - started) / batchSize);
  }
  return { value, metric: summarize(samplesMs) };
}

function summarize(samplesMs: number[]): MetricSummary {
  const sorted = [...samplesMs].sort((left, right) => left - right);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
  const percentile = (ratio: number) => sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
  return {
    samplesMs,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
    coefficientOfVariation: mean === 0 ? 0 : Math.sqrt(variance) / mean,
  };
}
