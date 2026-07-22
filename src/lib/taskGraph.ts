import { normalizeAgentCode, type CanonicalAgentCode } from './coordinationContract';
import type { PipelineReceipt, PipelineState } from './taskPipeline';
import type { OrchestrationRunSummary } from './orchestration';

export const TASK_CHECKPOINT_VERSION = '1.1.0' as const;

export type TaskDagNodeStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'paused'
  | 'simulated'
  | 'succeeded'
  | 'failed'
  | 'blocked';

export interface TaskDagNode {
  id: string;
  stageIndex: number;
  agentId: string;
  agentCode: string;
  label: string;
  dependencies: string[];
  status: TaskDagNodeStatus;
  attempt: number;
  maxAttempts: number;
  summary: string;
}

export interface TaskDag {
  runId: string;
  taskText: string;
  status: PipelineState['status'];
  nodes: TaskDagNode[];
}

export interface TaskCheckpoint {
  version: typeof TASK_CHECKPOINT_VERSION;
  runId: string;
  revision: number;
  updatedAt: string;
  pipeline: PipelineState;
  attempts: Record<string, number>;
  dag: TaskDag;
  orchestration?: OrchestrationRunSummary;
}

export interface TaskCheckpointSummary {
  runId: string;
  revision: number;
  updatedAt: string;
  taskText: string;
  status: PipelineState['status'];
  completedNodes: number;
  totalNodes: number;
}

const DEPENDENCY_CODES: Record<CanonicalAgentCode, readonly CanonicalAgentCode[]> = {
  'AG-COORD': [],
  PRO: ['AG-REVIEW'],
  'UI-PRODUCT': ['AG-COORD'],
  'AG-DEV': ['AG-COORD'],
  EXECUTOR: ['AG-DEV'],
  'AG-SEC': ['EXECUTOR', 'UI-PRODUCT'],
  'AG-REVIEW': ['AG-SEC'],
  HANDOFF: ['PRO'],
};

export function buildTaskDag(pipeline: PipelineState, attempts: Readonly<Record<string, number>> = {}): TaskDag {
  const nodeIdByCode = new Map<string, string>();
  pipeline.stages.forEach((stage, index) => {
    const canonical = normalizeAgentCode(stage.agentCode) ?? stage.canonicalAgentCode;
    nodeIdByCode.set(canonical, nodeIdFor(index, canonical));
  });

  const receiptBySeq = new Map<number, PipelineReceipt>(pipeline.receipts.map((receipt) => [receipt.seq, receipt]));
  const nodes = pipeline.stages.map((stage, stageIndex): TaskDagNode => {
    const canonical = (normalizeAgentCode(stage.agentCode) ?? stage.canonicalAgentCode) as CanonicalAgentCode;
    const id = nodeIdFor(stageIndex, canonical);
    const dependencies = (DEPENDENCY_CODES[canonical] ?? [])
      .map((code) => nodeIdByCode.get(code))
      .filter((value): value is string => Boolean(value));
    const receipt = receiptBySeq.get(stageIndex + 1);
    return {
      id,
      stageIndex,
      agentId: stage.agentId,
      agentCode: canonical,
      label: `${stage.agentName} · ${stage.phaseLabel}`,
      dependencies,
      status: nodeStatus(pipeline, stageIndex, receipt),
      attempt: attempts[id] ?? (stageIndex <= pipeline.currentIndex && pipeline.status !== 'idle' ? 1 : 0),
      maxAttempts: 3,
      summary: receipt?.summary ?? '',
    };
  });

  const completed = new Set(
    nodes.filter((node) => ['simulated', 'succeeded'].includes(node.status)).map((node) => node.id),
  );
  for (const node of nodes) {
    if (node.status === 'pending' && node.dependencies.every((dependency) => completed.has(dependency))) {
      node.status = 'ready';
    }
  }

  return { runId: pipeline.runId, taskText: pipeline.taskText, status: pipeline.status, nodes };
}

export function createTaskCheckpoint(
  pipeline: PipelineState,
  attempts: Readonly<Record<string, number>>,
  revision: number,
  updatedAt = new Date().toISOString(),
  orchestration?: OrchestrationRunSummary,
): TaskCheckpoint {
  return {
    version: TASK_CHECKPOINT_VERSION,
    runId: pipeline.runId,
    revision,
    updatedAt,
    pipeline: structuredClone(pipeline),
    attempts: { ...attempts },
    dag: buildTaskDag(pipeline, attempts),
    ...(orchestration ? { orchestration: structuredClone(orchestration) } : {}),
  };
}

export function prepareRecoveredPipeline(checkpoint: TaskCheckpoint): PipelineState {
  const pipeline = structuredClone(checkpoint.pipeline);
  if (pipeline.status !== 'running') return pipeline;
  const stage = pipeline.stages[pipeline.currentIndex];
  return {
    ...pipeline,
    status: 'paused',
    failure: {
      stageIndex: pipeline.currentIndex,
      agentCode: stage?.agentCode ?? 'AG-COORD',
      message: '检查点已恢复；继续前需人工确认。',
      retryable: true,
    },
  };
}

export function summarizeCheckpoint(checkpoint: TaskCheckpoint): TaskCheckpointSummary {
  return {
    runId: checkpoint.runId,
    revision: checkpoint.revision,
    updatedAt: checkpoint.updatedAt,
    taskText: checkpoint.pipeline.taskText,
    status: checkpoint.pipeline.status,
    completedNodes: checkpoint.dag.nodes.filter((node) => ['simulated', 'succeeded'].includes(node.status)).length,
    totalNodes: checkpoint.dag.nodes.length,
  };
}

function nodeIdFor(stageIndex: number, canonicalCode: string): string {
  return `node-${stageIndex + 1}-${canonicalCode.toLowerCase()}`;
}

function nodeStatus(
  pipeline: PipelineState,
  stageIndex: number,
  receipt: PipelineReceipt | undefined,
): TaskDagNodeStatus {
  if (receipt?.status === 'simulated') return 'simulated';
  if (receipt?.status === 'succeeded') return 'succeeded';
  if (receipt?.status === 'failed') return 'failed';
  if (receipt?.status === 'blocked') return 'blocked';
  if (stageIndex !== pipeline.currentIndex) return 'pending';
  if (pipeline.status === 'running') return 'running';
  if (pipeline.status === 'paused') return 'paused';
  if (pipeline.status === 'failed') return 'failed';
  if (pipeline.status === 'blocked') return 'blocked';
  return 'pending';
}
