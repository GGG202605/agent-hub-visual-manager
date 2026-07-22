import { describe, expect, it } from 'vitest';
import { agentFirstDashboardView } from '../../data/mockAgentHub';
import { buildTaskDag, createTaskCheckpoint, prepareRecoveredPipeline, summarizeCheckpoint } from '../taskGraph';
import { buildPipelinePlan, INITIAL_PIPELINE_STATE, pipelineReducer } from '../taskPipeline';

function runningPipeline() {
  const stages = buildPipelinePlan(agentFirstDashboardView.agents, '实现可恢复协同');
  return pipelineReducer(INITIAL_PIPELINE_STATE, {
    type: 'start',
    runId: 'run-graph-test',
    mode: 'simulation',
    taskText: '实现可恢复协同',
    stages,
  });
}

describe('task DAG and checkpoint contract', () => {
  it('builds canonical dependencies with UI and development branches after coordination', () => {
    const graph = buildTaskDag(runningPipeline());
    expect(graph.nodes).toHaveLength(8);
    const coordinator = graph.nodes.find((node) => node.agentCode === 'AG-COORD')!;
    const ui = graph.nodes.find((node) => node.agentCode === 'UI-PRODUCT')!;
    const dev = graph.nodes.find((node) => node.agentCode === 'AG-DEV')!;
    const security = graph.nodes.find((node) => node.agentCode === 'AG-SEC')!;
    expect(coordinator.dependencies).toEqual([]);
    expect(ui.dependencies).toEqual([coordinator.id]);
    expect(dev.dependencies).toEqual([coordinator.id]);
    expect(security.dependencies).toHaveLength(2);
  });

  it('creates a versioned checkpoint and summarizes progress', () => {
    const pipeline = pipelineReducer(runningPipeline(), { type: 'advance' });
    const checkpoint = createTaskCheckpoint(pipeline, {}, 1, '2099-01-01T00:00:00.000Z');
    expect(checkpoint.version).toBe('1.1.0');
    expect(checkpoint.dag.nodes[0].status).toBe('simulated');
    expect(summarizeCheckpoint(checkpoint)).toMatchObject({ revision: 1, completedNodes: 1, totalNodes: 8 });
  });

  it('restores an in-flight checkpoint as paused and requires explicit resume', () => {
    const checkpoint = createTaskCheckpoint(runningPipeline(), {}, 2);
    const restored = prepareRecoveredPipeline(checkpoint);
    expect(restored.status).toBe('paused');
    expect(restored.failure?.retryable).toBe(true);
    expect(pipelineReducer(restored, { type: 'resume' }).status).toBe('running');
  });

  it('retries only retryable failures and removes the failed stage placeholder', () => {
    const failed = pipelineReducer(runningPipeline(), {
      type: 'stageFailed',
      stageIndex: 0,
      message: 'temporary failure',
      retryable: true,
    });
    const retried = pipelineReducer(failed, { type: 'retry' });
    expect(retried.status).toBe('running');
    expect(retried.receipts).toHaveLength(0);
    expect(retried.failure).toBeNull();
  });
});
