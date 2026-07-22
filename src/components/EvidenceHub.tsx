import { Archive, FolderSearch } from 'lucide-react';
import type { EvidenceCategoryViewModel } from '../types';

interface EvidenceHubProps {
  categories: readonly EvidenceCategoryViewModel[];
}

const AUDIENCE_LABELS = { user: '用户', developer: '开发', auditor: '审计' } as const;

/**
 * v0.2 分类证据中心（DemoScenario012-E）：替代 v0.1 的整页倾倒式抽屉。
 * 按类别折叠、摘要优先，只展示当前数据源能够说明的证据元数据。
 */
export function EvidenceHub({ categories }: EvidenceHubProps) {
  return (
    <section className="evidence-hub" id="sec-evidence" aria-label="证据归档中心">
      <div className="agent-evidence-heading">
        <div>
          <span>证据归档</span>
          <h2>分类证据中心</h2>
          <p>摘要优先、按类别折叠；数据源声明与本轮现场验证分开标注。</p>
        </div>
        <Archive aria-hidden="true" />
      </div>

      <div className="evidence-category-grid">
        {categories.map((category) => (
          <details key={category.id} className={`evidence-category is-${category.audience}`}>
            <summary>
              <FolderSearch aria-hidden="true" />
              <span className="evidence-category-label">{category.label}</span>
              <span className="evidence-category-status">{category.status}</span>
              <span className="evidence-audience-chip">{AUDIENCE_LABELS[category.audience]}</span>
            </summary>
            <p className="evidence-category-summary">{category.summary}</p>
            <ul className="evidence-item-list">
              {category.items.map((item, index) => (
                <li key={`${category.id}-${index}`}>{item}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
