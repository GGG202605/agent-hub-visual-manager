import { ArrowRight, GitBranch, ScrollText, Sparkles } from 'lucide-react';
import type { ProductNextDecisionRoute, ProductNextDecisionView } from '../types';

interface NextDecisionCardProps {
  decision: ProductNextDecisionView;
}

const routeIcons = {
  A: Sparkles,
  B: GitBranch,
  C: ScrollText,
} as const;

const routeTitles: Record<ProductNextDecisionRoute['route'], string> = {
  A: '继续 UI / 产品体验优化',
  B: 'remote approval / push gate',
  C: 'private knowledge base / docs gate',
};

export function NextDecisionCard({ decision }: NextDecisionCardProps) {
  return (
    <section className="console-card next-decision-card" aria-label="NextDecisionCard">
      <div className="console-card-heading">
        <span className="console-card-kicker">下一步决策</span>
        <ArrowRight aria-hidden="true" />
      </div>
      <h2>推荐继续产品体验优化</h2>
      <p>低风险路线优先改善中文总控台体验；远端发布和 Wiki/docs 都需要独立审批。</p>

      <div className="decision-route-stack" aria-label="product next decision routes">
        {decision.routes.map((route) => (
          <RouteCard key={route.route} route={route} />
        ))}
      </div>
    </section>
  );
}

function RouteCard({ route }: { route: ProductNextDecisionRoute }) {
  const Icon = routeIcons[route.route];

  return (
    <article className={`decision-route-card ${route.recommended ? 'is-recommended' : ''}`}>
      <div className="decision-route-icon">
        <Icon aria-hidden="true" />
      </div>
      <div>
        <span>{route.recommended ? '推荐路线' : '备选路线'}</span>
        <h3>{routeTitles[route.route]}</h3>
        <p>{getRouteSummary(route)}</p>
      </div>
      <dl>
        <div>
          <dt>风险</dt>
          <dd>{route.risk}</dd>
        </div>
        <div>
          <dt>审批</dt>
          <dd>{route.approvalRequired ? '需要' : '不需要'}</dd>
        </div>
      </dl>
    </article>
  );
}

function getRouteSummary(route: ProductNextDecisionRoute) {
  if (route.route === 'A') {
    return '继续整理首屏、中文文案、证据折叠与交接体验。';
  }

  if (route.route === 'B') {
    return '规划远端目标、分支和网络策略；仍不自动推送。';
  }

  return '文档或 Wiki 发布需独立审批，本轮不执行。';
}
