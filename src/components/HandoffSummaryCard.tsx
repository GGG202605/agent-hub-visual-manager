import { ClipboardList } from 'lucide-react';
import type { NewChatHandoffView } from '../types';

interface HandoffSummaryCardProps {
  handoff: NewChatHandoffView;
  controlHead: string;
  secondProjectHead: string;
}

export function HandoffSummaryCard({ handoff, controlHead, secondProjectHead }: HandoffSummaryCardProps) {
  return (
    <section className="console-card handoff-summary-card" aria-label="NewChatHandoffPanel">
      <div className="console-card-heading">
        <span className="console-card-kicker">交接摘要</span>
        <ClipboardList aria-hidden="true" />
      </div>
      <h2>下一轮可以安全接手</h2>
      <p>保留 HEAD、禁区和推荐路线；权限不自动继承，remote / push / Wiki 仍需新审批。</p>

      <dl className="handoff-head-grid">
        <div>
          <dt>控制项目 HEAD</dt>
          <dd>{controlHead.slice(0, 7)}</dd>
        </div>
        <div>
          <dt>第二项目 HEAD</dt>
          <dd>{secondProjectHead.slice(0, 7)}</dd>
        </div>
        <div>
          <dt>当前能力</dt>
          <dd>中文产品总控台实现中</dd>
        </div>
      </dl>

      <div className="handoff-boundary-list">
        {handoff.neverInheritPermissions.slice(0, 5).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}
