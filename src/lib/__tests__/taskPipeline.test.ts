import { describe, expect, it } from 'vitest';
import {
  buildPipelinePlan,
  findCoordinator,
  INITIAL_PIPELINE_STATE,
  resolvePipelineLaunch,
  pipelineReducer,
  type PipelineState,
} from '../taskPipeline';
import { mockAgentHub } from '../../data/mockAgentHub';

const agents = mockAgentHub.agentFirstDashboard.agents;

describe('findCoordinator', () => {
  it('finds AG-COORD first', () => {
    expect(findCoordinator(agents)?.code).toBe('AG-COORD');
  });
});

describe('buildPipelinePlan', () => {
  const stages = buildPipelinePlan(agents, '为控制台增加权限矩阵');

  it('places the coordinator first and handoff last', () => {
    expect(stages[0]!.agentCode).toBe('AG-COORD');
    expect(stages[stages.length - 1]!.agentCode).toBe('HANDOFF');
  });

  it('keeps every visible role unique and maps canonical aliases', () => {
    expect(stages).toHaveLength(agents.length);
    expect(new Set(stages.map((stage) => stage.agentId)).size).toBe(agents.length);
    expect(stages.find((stage) => stage.agentCode === 'AG-DEV')?.canonicalAgentCode).toBe('AG-DEV');
  });

  it('does not predeclare security or review success', () => {
    expect(stages.find((stage) => stage.agentCode === 'AG-SEC')?.narration).toContain('不作通过结论');
    expect(stages.find((stage) => stage.agentCode === 'AG-REVIEW')?.narration).toContain('不放行');
  });

  it('truncates a long requirement summary', () => {
    const long = buildPipelinePlan(agents, 'x'.repeat(60));
    expect(long[0]!.narration).toContain('...');
  });
});

describe('resolvePipelineLaunch', () => {
  const stages = buildPipelinePlan(agents, '连接验证');

  it('starts a real single-Agent run with only the coordinator', () => {
    const result = resolvePipelineLaunch('single', stages, true, (agentId) => agentId === stages[0]!.agentId);
    expect(result).toMatchObject({ ok: true, mode: 'single' });
    expect(result.ok && result.stages).toHaveLength(1);
    expect(result.ok && result.stages[0]!.agentCode).toBe('AG-COORD');
  });

  it('never silently downgrades a real intent to simulation', () => {
    expect(resolvePipelineLaunch('single', stages, false, () => true)).toEqual({
      ok: false,
      error: '本地 AgentHub 网关未连接，不能启动真实任务',
    });
    expect(resolvePipelineLaunch('single', stages, true, () => false)).toEqual({
      ok: false,
      error: '协调 Agent 未绑定已测试模型，请先在“智能体接入”完成绑定',
    });
  });

  it('requires every connector for eight-Agent collaboration', () => {
    const result = resolvePipelineLaunch('full', stages, true, (agentId) => agentId === stages[0]!.agentId);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('尚缺 7 个可用连接器');
  });

  it('keeps simulation explicit and includes every stage', () => {
    const result = resolvePipelineLaunch('simulation', stages, false, () => false);
    expect(result).toMatchObject({ ok: true, mode: 'simulation' });
    expect(result.ok && result.stages).toHaveLength(stages.length);
  });
});

describe('pipelineReducer', () => {
  const stages = buildPipelinePlan(agents, '测试需求');

  function start(mode: 'simulation' | 'single' | 'connected'): PipelineState {
    return pipelineReducer(INITIAL_PIPELINE_STATE, {
      type: 'start',
      runId: `run-${mode}`,
      mode,
      taskText: '测试需求',
      stages,
    });
  }

  function runSimulationToEnd(initial: PipelineState) {
    let state = initial;
    let guard = 0;
    while (state.status === 'running' && guard < 200) {
      state = pipelineReducer(state, { type: 'advance' });
      guard += 1;
    }
    return state;
  }

  it('starts with a stable run id and explicit mode', () => {
    const state = start('simulation');
    expect(state.status).toBe('running');
    expect(state.runId).toBe('run-simulation');
    expect(state.mode).toBe('simulation');
    expect(state.currentIndex).toBe(0);
  });

  it('ends a template-only run as simulated, never completed', () => {
    const final = runSimulationToEnd(start('simulation'));
    expect(final.status).toBe('simulated');
    expect(final.receipts).toHaveLength(stages.length);
    expect(final.receipts.every((receipt) => receipt.status === 'simulated')).toBe(true);
  });

  it('holds a connected stage in enter until an agent result arrives', () => {
    const started = start('connected');
    expect(pipelineReducer(started, { type: 'advance' })).toEqual(started);
    const succeeded = pipelineReducer(started, {
      type: 'stageSucceeded',
      stageIndex: 0,
      summary: '结构化结果',
    });
    expect(succeeded.walkPhase).toBe('speak');
    expect(succeeded.receipts[0]).toMatchObject({ status: 'succeeded', source: 'agent' });
  });

  it('treats single-Agent mode as real and never advances without a model result', () => {
    const stages = buildPipelinePlan(agents, '单 Agent').slice(0, 1);
    const started = pipelineReducer(INITIAL_PIPELINE_STATE, {
      type: 'start',
      runId: 'run-single',
      mode: 'single',
      taskText: '单 Agent',
      stages,
    });
    expect(pipelineReducer(started, { type: 'advance' })).toEqual(started);
    const succeeded = pipelineReducer(started, { type: 'stageSucceeded', stageIndex: 0, summary: '真实结果' });
    expect(succeeded.receipts[0]).toMatchObject({ status: 'succeeded', source: 'agent' });
  });

  it('marks API failure as failed instead of silently continuing', () => {
    const failed = pipelineReducer(start('connected'), {
      type: 'stageFailed',
      stageIndex: 0,
      message: 'HTTP 500',
      retryable: true,
    });
    expect(failed.status).toBe('failed');
    expect(failed.failure).toMatchObject({ message: 'HTTP 500', retryable: true });
    expect(failed.receipts[0]?.status).toBe('failed');
  });

  it('marks missing capability as blocked', () => {
    const blocked = pipelineReducer(start('connected'), {
      type: 'stageBlocked',
      stageIndex: 0,
      message: 'connector missing',
    });
    expect(blocked.status).toBe('blocked');
    expect(blocked.receipts[0]?.status).toBe('blocked');
  });

  it('waits for artifact and review evidence after every connected stage succeeds', () => {
    let state = start('connected');
    for (let index = 0; index < stages.length; index += 1) {
      state = pipelineReducer(state, {
        type: 'stageSucceeded',
        stageIndex: index,
        summary: `result-${index}`,
      });
      state = pipelineReducer(state, { type: 'advance' });
      state = pipelineReducer(state, { type: 'advance' });
    }
    expect(state.status).toBe('awaiting_evidence');
    expect(state.receipts.every((receipt) => receipt.status === 'succeeded')).toBe(true);

    state = pipelineReducer(state, {
      type: 'finalize',
      evidence: {
        taskStatuses: ['accepted'],
        artifactCount: 1,
        artifactsVerified: true,
        approvalsSatisfied: true,
        highFindings: 0,
        mediumFindings: 0,
      },
    });
    expect(state.status).toBe('completed');
  });

  it('blocks final completion when evidence gates are incomplete', () => {
    let state = start('connected');
    for (let index = 0; index < stages.length; index += 1) {
      state = pipelineReducer(state, { type: 'stageSucceeded', stageIndex: index, summary: `result-${index}` });
      state = pipelineReducer(state, { type: 'advance' });
      state = pipelineReducer(state, { type: 'advance' });
    }
    state = pipelineReducer(state, {
      type: 'finalize',
      evidence: {
        taskStatuses: ['reviewing'],
        artifactCount: 0,
        artifactsVerified: false,
        approvalsSatisfied: false,
        highFindings: 0,
        mediumFindings: 1,
      },
    });
    expect(state.status).toBe('blocked');
    expect(state.failure?.message).toContain('完成门槛未满足');
  });

  it('supports stop and reset without inventing completion', () => {
    const stopped = pipelineReducer(start('connected'), { type: 'stop' });
    expect(stopped.status).toBe('stopped');
    expect(pipelineReducer(stopped, { type: 'reset' })).toEqual(INITIAL_PIPELINE_STATE);
  });

  it('rejects an empty start action', () => {
    expect(
      pipelineReducer(INITIAL_PIPELINE_STATE, {
        type: 'start',
        runId: '',
        mode: 'connected',
        taskText: 'x',
        stages,
      }),
    ).toEqual(INITIAL_PIPELINE_STATE);
  });
});
