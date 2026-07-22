import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EvidenceHub } from '../../components/EvidenceHub';
import { basicAgentHubFixture } from '../../data/basicAgentHubFixture';
import { mockAgentHub } from '../../data/mockAgentHub';
import { buildCockpitModel } from '../buildCockpitModel';
import { parseBasicAgentHubFixture } from '../agentHubFixtureParser';

describe('EvidenceHub', () => {
  it('仅渲染分类证据，不挂载 Legacy 子树或动作按钮', () => {
    const project = parseBasicAgentHubFixture(basicAgentHubFixture);
    const categories = buildCockpitModel(mockAgentHub.agentFirstDashboard, project, 'mock').evidence;

    const html = renderToStaticMarkup(<EvidenceHub categories={categories} />);

    expect(html.match(/<details/g)).toHaveLength(7);
    expect(html.match(/<summary/g)).toHaveLength(7);
    expect(html.match(/<ul/g)).toHaveLength(7);
    for (const category of categories) {
      expect(html).toContain(category.label);
      expect(html).toContain(category.status);
      expect(html).toContain(category.summary);
      expect(html).toContain(category.items[0]!);
    }
    expect(html).not.toMatch(/Legacy 工程面板|ProductControlConsole|<button/i);
    expect(html).not.toMatch(/>\s*(Run|Execute|Write|Commit|Push|Rollback|Stage)\s*</i);
  });

  it('390px 所在断点保留真实性状态，并允许短状态换行', () => {
    const styles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

    expect(styles).not.toMatch(/\.evidence-category-status\s*\{\s*display:\s*none/);
    expect(styles).toMatch(/\.evidence-category-status\s*\{[\s\S]*?white-space:\s*normal/);
    expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.evidence-category-status\s*\{[\s\S]*?display:\s*block/);
    expect(styles).toMatch(/grid-column:\s*2 \/ -1/);
  });
});
