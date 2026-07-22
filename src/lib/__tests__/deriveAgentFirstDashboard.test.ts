import { describe, expect, it } from 'vitest';
import { deriveAgentFirstDashboard } from '../deriveAgentFirstDashboard';
import type { ImportedAgentHubProject } from '../../types';

function makeProject(): ImportedAgentHubProject {
  return {
    project: {
      projectId: 'proj-test',
      projectName: '测试项目',
      currentGoal: 'Goal-X',
      currentPhase: 'phase-1',
      stableBaseline: 'abc123',
      buildStatus: 'build pass',
      repoStatus: 'clean',
      commitGate: 'exact-path only',
    },
    gates: [
      { gateId: 'g1', label: '导入门', state: 'open', requiredApproval: '', blockingReason: '' },
      { gateId: 'g2', label: '推送门', state: 'blocked', requiredApproval: 'Pro', blockingReason: '未配置远端' },
      { gateId: 'g3', label: '决策门', state: 'needs_user_decision', requiredApproval: '用户', blockingReason: '' },
    ],
    agents: [
      {
        agentId: 'AG-ARCH',
        agentName: 'Architect',
        roleTitle: '架构规划',
        visualRole: 'v',
        status: 'Done',
        currentTask: '映射 dashboard state',
        riskLevel: 'Low',
        reviewCount: 0,
        lastActivity: '5 个文件解析',
        needsUserDecision: false,
        activityIndicator: 'x',
        sourceRefs: [],
      },
      {
        agentId: 'AG-SEC',
        agentName: 'Sentinel',
        roleTitle: '安全守卫',
        visualRole: 'v',
        status: 'Blocked',
        currentTask: '阻断敏感文件',
        riskLevel: 'High',
        reviewCount: 1,
        lastActivity: '2 个文件被阻断',
        needsUserDecision: true,
        blockedReason: '发现阻断项',
        activityIndicator: 'x',
        sourceRefs: [],
      },
      {
        agentId: 'AG-CODE',
        agentName: 'Mechanist',
        roleTitle: '代码执行',
        visualRole: 'v',
        status: 'Idle',
        currentTask: '无执行连接',
        riskLevel: 'None',
        reviewCount: 0,
        lastActivity: 'browser only',
        needsUserDecision: false,
        activityIndicator: 'x',
        sourceRefs: [],
      },
    ],
    tasks: [
      { taskId: 't1', title: 'T', owner: 'AG-ARCH', status: 'Done', sourceRef: 's' },
    ],
    runs: [
      { runId: 'RUN-1', summary: 'build 验证通过', status: 'Done', activity: 'a', sourceRef: 's' },
    ],
    reviews: [
      { reviewId: 'REV-SEC-1', kind: 'AG-SEC', status: 'Done', high: 0, medium: 0, low: 1, sourceRef: 's' },
      { reviewId: 'REV-Q-1', kind: 'AG-REVIEW', status: 'Done', high: 0, medium: 1, low: 0, sourceRef: 's' },
    ],
    decisions: [
      {
        optionId: 'UX4',
        title: '视觉与可用性升级',
        status: 'needs_user_decision',
        reason: '继续优化产品体验',
        sourceRef: 's',
        approvalRequired: true,
        proRequired: false,
      },
    ],
    risks: [],
    provenance: [],
    importStatus: {
      state: 'ready',
      source: 'browser-selected-agent-hub',
      readMode: 'browser-selected-agent-hub',
      importedFiles: ['a.md', 'b.md'],
      skippedFiles: [],
      blockedFiles: [],
      warnings: [],
      unsupportedFiles: [],
      lastImportedAt: '2099-01-01T00:00:00.000Z',
      readOnly: true,
      executionConnected: false,
      totalBytes: 1024,
    } as ImportedAgentHubProject['importStatus'],
  };
}

describe('deriveAgentFirstDashboard', () => {
  it('把导入的 Agent 记录映射为大厅卡片，状态与风险正确归一', () => {
    const dashboard = deriveAgentFirstDashboard(makeProject());

    expect(dashboard.agents).toHaveLength(8);
    expect(dashboard.agents.map((agent) => agent.code)).toEqual([
      'AG-COORD',
      'PRO',
      'UI-PRODUCT',
      'AG-DEV',
      'EXECUTOR',
      'AG-SEC',
      'AG-REVIEW',
      'HANDOFF',
    ]);

    const sec = dashboard.agents.find((agent) => agent.code === 'AG-SEC');
    expect(sec).toBeDefined();
    expect(sec!.status).toBe('blocked');
    expect(sec!.statusLabel).toBe('安全暂停');
    expect(sec!.riskLevel).toBe('high');
    expect(sec!.layer).toBe('audit');
    expect(sec!.nextAction).toContain('等待用户决策');
  });

  it('顶部指标按状态计数', () => {
    const dashboard = deriveAgentFirstDashboard(makeProject());
    const metric = (label: string) => dashboard.topMetrics.find((item) => item.label === label)?.value;

    expect(metric('Agent 数量')).toBe('8');
    expect(metric('已完成')).toBe('1');
    expect(metric('安全暂停')).toBe('1');
  });

  it('门禁映射为进度项：open→complete，blocked→paused，needs_user_decision→next', () => {
    const dashboard = deriveAgentFirstDashboard(makeProject());
    expect(dashboard.progress.map((item) => item.status)).toEqual(['complete', 'paused', 'next']);
  });

  it('关系边使用八角色规范拓扑，且阻断端导致 paused', () => {
    const dashboard = deriveAgentFirstDashboard(makeProject());
    expect(dashboard.relations.length).toBe(9);
    const secEdge = dashboard.relations.find((relation) => relation.label === '安全送审');
    expect(secEdge?.state).toBe('paused');
  });

  it('决策映射为下一步路由：approvalRequired→medium 风险', () => {
    const dashboard = deriveAgentFirstDashboard(makeProject());
    expect(dashboard.nextActions[0]).toMatchObject({ id: 'UX4', risk: 'medium', recommended: true });
  });

  it('安全护栏与证据摘要包含导入计数', () => {
    const dashboard = deriveAgentFirstDashboard(makeProject());
    expect(dashboard.safetyBar.join(' ')).toContain('导入 2 个');
    expect(dashboard.evidenceSummary).toContain('审查记录 2 条');
  });
});
