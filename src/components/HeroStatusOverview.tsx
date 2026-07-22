import { CheckCircle2, GitCommitHorizontal, ShieldCheck } from 'lucide-react';
import type { ProductOverviewDashboardView } from '../types';

interface HeroStatusOverviewProps {
  dashboard: ProductOverviewDashboardView;
  secondProjectHead: string;
}

export function HeroStatusOverview({ dashboard, secondProjectHead }: HeroStatusOverviewProps) {
  const shortHead = secondProjectHead.slice(0, 7);

  return (
    <section className="console-card hero-status-overview" aria-label="HeroStatusOverview">
      <div className="console-card-heading">
        <span className="console-card-kicker">主状态</span>
        <CheckCircle2 aria-hidden="true" />
      </div>
      <h2>本地执行链已完成</h2>
      <p>
        AgentHub Visual Manager v0.1 已完成本地闭环验证。当前页面先回答“完成了什么、是否安全、下一步做什么”。
      </p>

      <div className="hero-status-maturity">
        <div>
          <span>当前成熟度</span>
          <strong>local v0.1 readiness high</strong>
        </div>
        <div>
          <span>第二项目 HEAD</span>
          <strong>{shortHead}</strong>
        </div>
      </div>

      <div className="console-code-pill-row" aria-label="local execution flags">
        <span>{dashboard.localExecutionFinalFlag}</span>
        <span>{dashboard.noPushFinalizationFlag}</span>
      </div>

      <dl className="console-compact-list">
        <div>
          <dt>
            <GitCommitHorizontal aria-hidden="true" />
            本地链路
          </dt>
          <dd>只读元数据、构建、文件写入、回滚/恢复、Stage、Commit 已形成本地 v0.1 证据链。</dd>
        </div>
        <div>
          <dt>
            <ShieldCheck aria-hidden="true" />
            发布状态
          </dt>
          <dd>发布目标未授权，因此安全暂停；本地 v0.1 不执行推送。</dd>
        </div>
      </dl>
    </section>
  );
}
