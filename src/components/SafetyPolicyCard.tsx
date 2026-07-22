import { LockKeyhole, ShieldCheck } from 'lucide-react';
import type { SafetyBoundarySummaryView } from '../types';

interface SafetyPolicyCardProps {
  safety: SafetyBoundarySummaryView;
}

const safetyPoints = ['未配置远端目标', '未绑定上游分支', '未读取凭据', '未执行 push'] as const;

export function SafetyPolicyCard({ safety }: SafetyPolicyCardProps) {
  return (
    <section className="console-card safety-policy-card" aria-label="SafetyPolicyCard">
      <div className="console-card-heading">
        <span className="console-card-kicker">安全策略</span>
        <ShieldCheck aria-hidden="true" />
      </div>
      <h2>不推送安全收口</h2>
      <p>push / no remote 是产品护栏，不是失败。远端目标未授权时，系统保持本地完成、远端暂停。</p>

      <ul className="console-check-list" aria-label="no push safety policy">
        {safetyPoints.map((point) => (
          <li key={point}>
            <LockKeyhole aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <div className="console-code-pill-row" aria-label="no push finalization flags">
        <span>no_push_finalization=true</span>
        <span>push_execution_excluded=true</span>
        <span>remote_configured=false</span>
        <span>upstream_configured=false</span>
      </div>

      <div className="console-soft-note">
        <strong>安全边界</strong>
        <span>{safety.preservedBoundaries[0] ?? 'No Remote / No Push / No Real Data / No private knowledge base'}</span>
      </div>
    </section>
  );
}
