import { describe, expect, it } from 'vitest';
import {
  buildSafePilotExecutionProfile,
  buildSafePilotHandoff,
  estimateSafePilotCostMicros,
  listSafePilotBlockers,
  SAFE_PILOT_AGENT_ORDER,
  type SafePilotAcceptanceReceipt,
} from '../safePilotLauncher';

const readyBindings = SAFE_PILOT_AGENT_ORDER.map((agentCode) => ({
  agentCode,
  provider: 'deepseek' as const,
  model: 'deepseek-v4-flash',
  ready: true,
}));

describe('safe pilot launcher v2', () => {
  it('builds the exact read-only profile and complete budget v2', () => {
    const profile = buildSafePilotExecutionProfile(readyBindings, {
      currency: 'CNY',
      inputRatePerMillion: 1,
      outputRatePerMillion: 2,
      maxCost: 0.5,
    });
    expect(profile.agentOrder).toEqual(['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW']);
    expect(profile.budget).toMatchObject({
      plannedCalls: 4,
      maxCalls: 5,
      maxManualRetries: 1,
      maxInputTokens: 64_000,
      maxOutputTokens: 1_600,
      stageTimeoutMs: 45_000,
      totalTimeoutMs: 240_000,
      maxHumanWaitMs: 300_000,
      inputRateMicrosPerMillion: 1_000_000,
      outputRateMicrosPerMillion: 2_000_000,
      maxCostMicros: 500_000,
    });
    expect(profile.checkpointEnabled).toBe(false);
    expect(profile.sideEffectsAllowed).toBe(false);
    for (const permissions of Object.values(profile.runCapabilities)) {
      expect(permissions.call_model).toBe(true);
      expect(Object.entries(permissions).filter(([key, value]) => key !== 'call_model' && value)).toEqual([]);
    }
  });

  it('binds a configurable 1-30 minute human wait into the execution profile', () => {
    const tenMinutes = buildSafePilotExecutionProfile(readyBindings, {
      inputRatePerMillion: 1,
      outputRatePerMillion: 2,
      maxCost: 1,
    }, { maxHumanWaitMs: 600_000 });
    expect(tenMinutes.budget.maxHumanWaitMs).toBe(600_000);
    expect(listSafePilotBlockers({
      runId: 'pilot-human-wait-valid',
      taskText: '评审只读方案',
      contextText: 'P1 项目摘要',
      profile: tenMinutes,
      humanApproval: { approved: true, approvalRef: 'approval-human-wait-valid' },
    })).toEqual([]);
    const invalid = buildSafePilotExecutionProfile(readyBindings, {
      inputRatePerMillion: 1,
      outputRatePerMillion: 2,
      maxCost: 1,
    }, { maxHumanWaitMs: 30_000 });
    expect(listSafePilotBlockers({
      runId: 'pilot-human-wait-invalid',
      taskText: '评审只读方案',
      contextText: 'P1 项目摘要',
      profile: invalid,
      humanApproval: { approved: true, approvalRef: 'approval-human-wait-invalid' },
    })).toContain('人工等待授权必须为 1-30 分钟整数');
  });

  it('fails closed until bindings, rates, cap and human approval are complete', () => {
    const request = {
      runId: 'pilot-DemoScenario014-test',
      taskText: '评审只读方案',
      contextText: 'P1 项目摘要',
      profile: buildSafePilotExecutionProfile([], {}),
      humanApproval: { approved: false, approvalRef: '' },
    };
    expect(listSafePilotBlockers(request)).toEqual(expect.arrayContaining([
      '四个 Agent 的 Provider/模型绑定未全部就绪',
      'Provider 输入/输出费率与费用上限尚未确认',
      '缺少本次启动包的人工作出确认',
    ]));
  });

  it('creates a handoff only from the previous accepted evidence', () => {
    const acceptance: SafePilotAcceptanceReceipt = {
      acceptanceId: 'accept-1',
      runId: 'pilot-DemoScenario014-test',
      agentId: 'AG-COORD',
      evidenceId: 'evidence-1',
      outputSha256: 'a'.repeat(64),
      decision: 'accepted',
      createdAt: '2099-01-01T00:00:00.000Z',
    };
    expect(buildSafePilotHandoff(
      acceptance.runId,
      'AG-COORD',
      'PRO',
      { evidenceId: acceptance.evidenceId, outputSha256: acceptance.outputSha256 },
      acceptance,
    )).toMatchObject({ fromAgentId: 'AG-COORD', toAgentId: 'PRO', acceptanceId: 'accept-1' });
    expect(() => buildSafePilotHandoff(
      acceptance.runId,
      'AG-COORD',
      'AG-SEC',
      { evidenceId: acceptance.evidenceId, outputSha256: acceptance.outputSha256 },
      acceptance,
    )).toThrow('顺序');
  });

  it('calculates a conservative monetary ledger in micro currency units', () => {
    const budget = buildSafePilotExecutionProfile(readyBindings, {
      inputRatePerMillion: 1,
      outputRatePerMillion: 2,
      maxCost: 1,
    }).budget;
    expect(estimateSafePilotCostMicros(budget, 64_000, 1_600)).toBe(67_200);
  });
});
