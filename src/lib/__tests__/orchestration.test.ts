import { describe, expect, it } from 'vitest';
import type { ModelCallEvidence, OrchestrationRunSummary } from '../orchestration';
import { createOrchestrationPolicy, deriveModelClosureEvidence, isRunReadyForClosure } from '../orchestration';
import { INITIAL_PIPELINE_STATE, pipelineReducer, type PipelineState } from '../taskPipeline';

function evidence(agentId: string): ModelCallEvidence {
  return {
    evidenceId: `evidence-${agentId}`,
    runId: 'run-orchestration-test',
    agentId,
    provider: 'custom',
    model: 'test-model',
    requestSha256: 'a'.repeat(64),
    outputSha256: 'b'.repeat(64),
    outputChars: 24,
    reservedOutputTokens: 64,
    observedOutputTokens: 12,
    authorization: 'session_capability',
    acceptanceStatus: 'accepted',
    acceptanceId: `accept-${agentId}`,
    acceptedAt: '2099-01-01T00:00:00.500Z',
    createdAt: '2099-01-01T00:00:00.000Z',
  };
}

function completedPipeline(): PipelineState {
  const stages = ['AG-COORD', 'AG-SEC', 'AG-REVIEW'].map((code, index) => ({
    agentId: code.toLowerCase(),
    agentCode: code,
    canonicalAgentCode: code,
    agentName: code,
    phaseLabel: `stage-${index}`,
    narration: '',
  }));
  let state = pipelineReducer(INITIAL_PIPELINE_STATE, {
    type: 'start',
    runId: 'run-orchestration-test',
    mode: 'connected',
    taskText: 'test closure',
    stages,
  });
  for (let index = 0; index < stages.length; index += 1) {
    const summary = ['AG-SEC', 'AG-REVIEW'].includes(stages[index].agentCode)
      ? 'review complete\nFINDINGS:H0/M0/L0\nGATE:PASS'
      : 'done';
    state = pipelineReducer(state, { type: 'stageSucceeded', stageIndex: index, summary });
    state = pipelineReducer(state, { type: 'advance' });
    state = pipelineReducer(state, { type: 'advance' });
  }
  return state;
}

describe('model orchestration policy', () => {
  it('bounds retries, output budget and timeout', () => {
    expect(createOrchestrationPolicy(8)).toEqual({
      expectedArtifacts: 8,
      maxCalls: 16,
      totalOutputTokens: 3520,
      stageTimeoutMs: 60_000,
      groundingDisclosureApproved: false,
    });
    expect(createOrchestrationPolicy(99, { totalOutputTokens: 1, stageTimeoutMs: 999_999 })).toEqual({
      expectedArtifacts: 16,
      maxCalls: 32,
      totalOutputTokens: 1024,
      stageTimeoutMs: 120_000,
      groundingDisclosureApproved: false,
    });
  });

  it('requires hashed artifacts and explicit security/review pass markers', () => {
    const pipeline = completedPipeline();
    const artifacts = pipeline.stages.map((stage) => evidence(stage.canonicalAgentCode));
    expect(deriveModelClosureEvidence(pipeline, artifacts)).toMatchObject({
      artifactCount: 3,
      artifactsVerified: true,
      approvalsSatisfied: true,
      highFindings: 0,
    });

    const blocked = structuredClone(pipeline);
    blocked.receipts[1].summary = 'review GATE:BLOCKED';
    expect(deriveModelClosureEvidence(blocked, artifacts).highFindings).toBe(1);
  });

  it('closes an explicitly scoped single-Agent pilot without impersonating a full review chain', () => {
    const stage = {
      agentId: 'ag-coord',
      agentCode: 'AG-COORD',
      canonicalAgentCode: 'AG-COORD',
      agentName: '协调 Agent',
      phaseLabel: '需求拆解',
      narration: '',
    };
    let pipeline = pipelineReducer(INITIAL_PIPELINE_STATE, {
      type: 'start',
      runId: 'run-single-agent',
      mode: 'single',
      taskText: '只读连接验证',
      stages: [stage],
    });
    pipeline = pipelineReducer(pipeline, { type: 'stageSucceeded', stageIndex: 0, summary: '只读分析完成' });
    expect(deriveModelClosureEvidence(pipeline, [evidence('AG-COORD')])).toMatchObject({
      artifactCount: 1,
      artifactsVerified: true,
      approvalsSatisfied: true,
      highFindings: 0,
    });
  });

  it('closes only a completed run with one artifact per stage', () => {
    const artifacts = ['AG-COORD', 'AG-SEC', 'AG-REVIEW'].map(evidence);
    const run: OrchestrationRunSummary = {
      runId: 'run-orchestration-test',
      status: 'completed',
      policy: createOrchestrationPolicy(3),
      callsStarted: 3,
      callsSucceeded: 3,
      callsFailed: 0,
      reservedOutputTokens: 192,
      observedOutputTokens: 36,
      evidence: artifacts,
      startedAt: '2099-01-01T00:00:00.000Z',
      updatedAt: '2099-01-01T00:00:01.000Z',
    };
    expect(isRunReadyForClosure(run, 3)).toBe(true);
    expect(isRunReadyForClosure({ ...run, status: 'active' }, 3)).toBe(false);
  });
});
