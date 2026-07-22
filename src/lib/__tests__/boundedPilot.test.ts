import { describe, expect, it } from 'vitest';
import { buildBoundedPilotPlan } from '../boundedPilot';

describe('bounded multi-Agent pilot preview', () => {
  it('locks the smallest review-complete four-Agent chain', () => {
    const plan = buildBoundedPilotPlan('  评估一个只读方案\n并给出结论  ');
    expect(plan.taskText).toBe('评估一个只读方案 并给出结论');
    expect(plan.agents.map((agent) => agent.code)).toEqual(['AG-COORD', 'PRO', 'AG-SEC', 'AG-REVIEW']);
    expect(plan.handoffs.map((item) => `${item.from}->${item.to}`)).toEqual([
      'AG-COORD->PRO', 'PRO->AG-SEC', 'AG-SEC->AG-REVIEW', 'AG-REVIEW->HUMAN',
    ]);
    expect(plan.taskRef).toMatch(/^pilot-task-[a-f0-9]{8}$/);
    expect(plan.profileId).toBe('pilot-4-readonly-v2');
    expect(plan.status).toBe('safe_launcher_preflight_only');
  });

  it('uses fixed budgets and fail-closed permissions', () => {
    const plan = buildBoundedPilotPlan('验证预算');
    expect(plan.budget).toEqual({
      plannedCalls: 4,
      maxCalls: 5,
      maxManualRetries: 1,
      conservativeInputTokens: 64_000,
      totalOutputTokens: 1_600,
      perStageTimeoutSeconds: 45,
      totalTimeoutSeconds: 240,
      defaultHumanWaitMinutes: 5,
      feeStatus: 'blocked_without_confirmed_rates_and_cap',
    });
    expect(plan.previewPermissions).toEqual([]);
    expect(plan.futureExecutionPermissions).toEqual({
      call_model: true,
      manage_checkpoint: false,
      save_note: false,
      run_build: false,
      propose_patch: false,
      preflight_patch: false,
      apply_patch: false,
    });
    expect(plan.executionBlockers).toHaveLength(3);
  });

  it('defines exact audit channels and pass/fail gates', () => {
    const plan = buildBoundedPilotPlan('检查验收');
    expect(plan.auditAcceptance.map((item) => item.channel)).toEqual(['任务', '对话', '操作', '审批']);
    expect(plan.passStandards.join(' ')).toContain('GATE:PASS');
    expect(plan.failStandards.join(' ')).toContain('High/Medium');
    expect(plan.failureRules.join(' ')).toContain('人工接管');
    expect(plan.auditAcceptance.map((item) => item.rule).join(' ')).toContain('阶段/活跃总计与人工等待');
  });

  it('rejects empty and oversized tasks before preview creation', () => {
    expect(() => buildBoundedPilotPlan('   ')).toThrow('非空任务');
    expect(() => buildBoundedPilotPlan('x'.repeat(4_001))).toThrow('4000 字符');
  });
});
