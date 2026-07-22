import { describe, expect, it } from 'vitest';
import { buildCockpitModel, inferRelationType, SECTION_IDS } from '../buildCockpitModel';
import { deriveAgentFirstDashboard } from '../deriveAgentFirstDashboard';
import { parseBasicAgentHubFixture } from '../agentHubFixtureParser';
import { basicAgentHubFixture } from '../../data/basicAgentHubFixture';
import { mockAgentHub } from '../../data/mockAgentHub';

const fixtureProject = parseBasicAgentHubFixture(basicAgentHubFixture);

describe('inferRelationType', () => {
  it('按关键词归类关系类型', () => {
    expect(inferRelationType('任务调度')).toBe('dispatch');
    expect(inferRelationType('前端实现')).toBe('execution');
    expect(inferRelationType('安全送审')).toBe('review');
    expect(inferRelationType('最终收口审批')).toBe('approval');
    expect(inferRelationType('跨会话交接')).toBe('handoff');
    expect(inferRelationType('日常同步')).toBe('information');
  });
});

describe('buildCockpitModel', () => {
  const cockpit = buildCockpitModel(mockAgentHub.agentFirstDashboard, fixtureProject, 'mock');

  it('诚实导航：available 均有真实锚点，planned 一律标注待实现', () => {
    const available = cockpit.nav.filter((item) => item.state !== 'planned');
    const planned = cockpit.nav.filter((item) => item.state === 'planned');

    expect(available.map((item) => item.id)).toEqual(
      expect.arrayContaining([SECTION_IDS.overview, SECTION_IDS.agents, SECTION_IDS.evidence]),
    );
    expect(planned.length).toBeGreaterThan(0);
    for (const item of planned) {
      expect(item.description).toContain('待实现');
    }
  });

  it('关系边全部带类型与状态', () => {
    expect(cockpit.relations.length).toBe(mockAgentHub.agentFirstDashboard.relations.length);
    for (const relation of cockpit.relations) {
      expect(['dispatch', 'execution', 'review', 'approval', 'handoff', 'information']).toContain(relation.type);
      expect(['active', 'waiting', 'blocked', 'complete']).toContain(relation.status);
    }
  });

  it('证据中心只保留有明确用途的七类，不再暴露 Legacy 工程面板', () => {
    expect(cockpit.evidence.map((category) => category.id)).toEqual([
      'ev-build',
      'ev-smoke',
      'ev-security',
      'ev-quality',
      'ev-commit',
      'ev-receipts',
      'ev-provenance',
    ]);
    expect(JSON.stringify(cockpit.evidence)).not.toMatch(/legacy|旧产品控制台/i);
  });

  it('逐类区分数据源声明与现场验证，不用无关运行记录填充证据', () => {
    const byId = Object.fromEntries(cockpit.evidence.map((category) => [category.id, category]));

    expect(byId['ev-build']!.status).toBe('演示 · 1 条 · 未复验');
    expect(byId['ev-build']!.items[0]).toContain('fixture 占位展示');
    expect(byId['ev-smoke']!.status).toBe('未提供 · 未验证');
    expect(byId['ev-smoke']!.items).toEqual([
      '未提供浏览器 Smoke 记录；未验证视口、控制台或禁止动作按钮。',
    ]);
    expect(byId['ev-security']!.items[0]).toContain('Blocked');
    expect(byId['ev-security']!.items[0]).toContain('来源 reviews/');
    expect(byId['ev-quality']!.items[0]).toContain('Review Ready');
    expect(byId['ev-commit']!.status).toContain('未读取实时 Git');
    expect(byId['ev-commit']!.items.every((item) => item.includes('声明：'))).toBe(true);
    expect(byId['ev-receipts']!.label).toBe('近期记录摘要');
    expect(byId['ev-receipts']!.summary).toContain('不等同于原始操作回执');
    expect(byId['ev-provenance']!.items[0]).toContain('限制 synthetic fixture only');
    expect(byId['ev-provenance']!.status).toContain(`${fixtureProject.provenance.length} 条`);
  });

  it('不会把普通 browser import 运行误当成 Smoke 证据', () => {
    const browserImportOnly = {
      ...fixtureProject,
      runs: [{
        ...fixtureProject.runs[0]!,
        runId: 'RUN-BROWSER-IMPORT',
        summary: '浏览器导入运行摘要',
        activity: 'browser selected files',
        sourceRef: 'browser-selected-files',
      }],
    };
    const model = buildCockpitModel(mockAgentHub.agentFirstDashboard, browserImportOnly, 'imported');
    const smoke = model.evidence.find((item) => item.id === 'ev-smoke')!;

    expect(smoke.status).toBe('未提供 · 未验证');
    expect(smoke.items).toEqual([
      '未提供浏览器 Smoke 记录；未验证视口、控制台或禁止动作按钮。',
    ]);
  });

  it('来源凭证超过界面上限时披露总数与实际展示数', () => {
    const manyProvenance = {
      ...fixtureProject,
      provenance: Array.from({ length: 9 }, (_, index) => ({
        ...fixtureProject.provenance[0]!,
        sourcePath: `proof-${index + 1}.md`,
      })),
    };
    const model = buildCockpitModel(mockAgentHub.agentFirstDashboard, manyProvenance, 'imported');
    const provenance = model.evidence.find((item) => item.id === 'ev-provenance')!;

    expect(provenance.status).toContain('总 9 / 展示 6');
    expect(provenance.items).toHaveLength(6);
  });

  it('所有超过六条的类别披露总数/展示数，并把尾部不利记录提前', () => {
    const manyRuns = Array.from({ length: 8 }, (_, index) => ({
      ...fixtureProject.runs[0]!,
      runId: `RUN-${index + 1}`,
      summary: `build smoke viewport 记录 ${index + 1}`,
      status: (index === 7 ? 'Blocked' : 'Done') as 'Blocked' | 'Done',
      sourceRef: `runs/run-${index + 1}.md`,
    }));
    const securityReviews = Array.from({ length: 8 }, (_, index) => ({
      ...fixtureProject.reviews[0]!,
      reviewId: `SEC-${index + 1}`,
      kind: 'AG-SEC' as const,
      status: (index === 7 ? 'Blocked' : 'Review Ready') as 'Blocked' | 'Review Ready',
      high: index === 7 ? 1 : 0,
      medium: 0,
      sourceRef: `reviews/sec-${index + 1}.md`,
    }));
    const qualityReviews = Array.from({ length: 8 }, (_, index) => ({
      ...fixtureProject.reviews[1]!,
      reviewId: `QUALITY-${index + 1}`,
      kind: 'AG-REVIEW' as const,
      status: 'Review Ready' as const,
      high: 0,
      medium: index === 7 ? 1 : 0,
      sourceRef: `reviews/quality-${index + 1}.md`,
    }));
    const manyProject = {
      ...fixtureProject,
      runs: manyRuns,
      reviews: [...securityReviews, ...qualityReviews],
      provenance: Array.from({ length: 9 }, (_, index) => ({
        ...fixtureProject.provenance[0]!,
        sourcePath: `proof-${index + 1}.md`,
      })),
    };
    const manyDashboard = {
      ...mockAgentHub.agentFirstDashboard,
      recentReceipts: Array.from({ length: 9 }, (_, index) => ({
        title: `RECEIPT-${index + 1}`,
        time: index === 8 ? 'Failed' : 'Done',
        summary: `记录 ${index + 1}`,
      })),
    };
    const model = buildCockpitModel(manyDashboard, manyProject, 'imported');
    const byId = Object.fromEntries(model.evidence.map((category) => [category.id, category]));
    const expectedTotals: Record<string, number> = {
      'ev-build': 9,
      'ev-smoke': 8,
      'ev-security': 8,
      'ev-quality': 8,
      'ev-receipts': 9,
      'ev-provenance': 9,
    };

    for (const [id, total] of Object.entries(expectedTotals)) {
      expect(byId[id]!.status).toContain(`总 ${total} / 展示 6`);
      expect(byId[id]!.items).toHaveLength(6);
    }
    expect(byId['ev-build']!.items[0]).toContain('RUN-8 · Blocked');
    expect(byId['ev-smoke']!.items[0]).toContain('RUN-8 · Blocked');
    expect(byId['ev-security']!.items[0]).toContain('SEC-8 · Blocked');
    expect(byId['ev-quality']!.items[0]).toContain('QUALITY-8');
    expect(byId['ev-quality']!.items[0]).toContain('Medium 1');
    expect(byId['ev-receipts']!.items[0]).toContain('RECEIPT-9 · Failed');
  });

  it('mock 与 imported 两种数据源都能构建完整驾驶舱', () => {
    const importedDashboard = deriveAgentFirstDashboard(fixtureProject);
    const importedCockpit = buildCockpitModel(importedDashboard, fixtureProject, 'imported');

    expect(importedCockpit.sourceKind).toBe('imported');
    expect(importedCockpit.nav.length).toBe(cockpit.nav.length);
    expect(importedCockpit.evidence.length).toBe(cockpit.evidence.length);
    expect(importedCockpit.evidence.find((item) => item.id === 'ev-build')!.status).toContain('导入');
  });

  it('缺少证据时逐类明确显示未提供或未验证', () => {
    const emptyProject = {
      ...fixtureProject,
      project: { ...fixtureProject.project, buildStatus: '', repoStatus: '', commitGate: '' },
      runs: [],
      reviews: [],
      provenance: [],
    };
    const emptyDashboard = { ...mockAgentHub.agentFirstDashboard, recentReceipts: [] };
    const emptyCockpit = buildCockpitModel(emptyDashboard, emptyProject, 'imported');

    for (const category of emptyCockpit.evidence) {
      expect(`${category.status} ${category.items.join(' ')}`).toMatch(/未提供|未验证/);
    }
  });
});
