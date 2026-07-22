import type { ReactNode } from 'react';
import type { ImportedAgentHubProject } from '../types';
import { AgentSquadCard } from './AgentSquadCard';

interface AgentSquadDashboardProps {
  project: ImportedAgentHubProject;
}

export function AgentSquadDashboard({ project }: AgentSquadDashboardProps) {
  const blockedRisks = project.risks.filter((risk) => risk.blocking);
  const needsDecision = project.decisions.filter((decision) => decision.status === 'needs_user_decision');
  const recentActivity = project.runs.map((run) => run.activity).slice(0, 3);
  const statusTiles = [
    ['当前目标 / Current Goal', project.project.currentGoal],
    ['当前阶段 / Phase', project.project.currentPhase],
    ['稳定基线 / Stable Baseline', project.project.stableBaseline],
    ['构建状态 / Build', project.project.buildStatus],
    ['仓库状态 / Repo', project.project.repoStatus],
    ['提交门禁 / Commit Gate', project.project.commitGate],
  ] as const;

  return (
    <section className="agent-squad-section" aria-labelledby="agent-squad-title">
      <div className="squad-command-strip">
        <div>
          <p className="eyebrow">本地只读指挥台 / read-only command deck</p>
          <h2 id="agent-squad-title">Agent Squad Dashboard</h2>
          <p className="squad-command-copy">
            六个 Agent 卡片展示当前协同状态。真实导入仅来自浏览器选择文件；filesystem 读取、上传和执行控件均未连接。
          </p>
        </div>
        <div className="squad-command-badges">
          <span className={`import-state import-${project.importStatus.state}`}>
            导入来源：{sourceLabel(project.importStatus.source)} / {project.importStatus.state}
          </span>
          <span className="import-state">imported {project.importStatus.importedFiles.length}</span>
          <span className="import-state import-partial">skipped {project.importStatus.skippedFiles.length}</span>
          <span className="import-state import-blocked">blocked {project.importStatus.blockedFiles.length}</span>
          <span className="import-state import-locked">无 executor / no executor</span>
          <span className="import-state import-locked">currentActionLevel=L1 draft-only</span>
          <span className="import-state import-locked">dryRunApproved=false</span>
          <span className="import-state import-locked">realDryRunImplemented=false</span>
          <span className="import-state import-locked">simulator_mode=fixture_only_mock</span>
          <span className="import-state import-locked">receipt_status=not_executed_template</span>
          <span className="import-state import-locked">writeApproved=false</span>
          <span className="import-state import-locked">pushApproved=false</span>
        </div>
      </div>

      <div className="squad-command-matrix">
        <div className="squad-hero-summary" aria-label="agent squad summary">
          <span>{project.agents.length} 个 Agent 在线</span>
          <span>{needsDecision.length} 个待用户决策</span>
          <span>{blockedRisks.length} 个阻塞风险监控中</span>
        </div>
        <div className="squad-status-grid" aria-label="project status strip">
          {statusTiles.map(([label, value]) => (
            <StatusTile key={label} label={label} value={value} />
          ))}
        </div>
      </div>

      <div className="agent-localization-strip" aria-label="agent card label translations">
        <span>状态：工作中 / Working</span>
        <span>已阻塞 / Blocked</span>
        <span>待复核 / Review Ready</span>
        <span>待用户决策 / Needs User Decision</span>
        <span>已完成 / Done</span>
        <span>待命 / Idle</span>
        <span>字段：当前任务 / Current task，风险 / Risk，复核 / Reviews，来源记录 / Source refs</span>
      </div>

      <div className="squad-main-grid">
        <div className="agent-card-grid">
          {project.agents.map((agent) => (
            <AgentSquadCard key={agent.agentId} agent={agent} />
          ))}
        </div>

        <aside className="squad-side-panel">
          <PanelBlock title="待用户决策 / Needs User Decision" tone="decision">
            {needsDecision.map((decision, index) => (
              <div key={stableListKey('decision', decision.optionId, decision.sourceRef, index)} className="side-row">
                <strong>{decision.optionId}</strong>
                <span>{decision.title}</span>
                <small>{decision.reason}</small>
              </div>
            ))}
          </PanelBlock>

          <PanelBlock title="风险与阻塞项 / Risk" tone="risk">
            {blockedRisks.map((risk, index) => (
              <div key={stableListKey('risk', risk.riskId, risk.sourceRef, index)} className="side-row">
                <strong>{risk.riskId}</strong>
                <span>{risk.description}</span>
                <small>{risk.mitigation}</small>
              </div>
            ))}
          </PanelBlock>

          <PanelBlock title="最近活动 / Recent Activity" tone="activity">
            {recentActivity.map((activity, index) => (
              <div key={stableListKey('activity', activity, 'run-activity', index)} className="side-row">
                <span>{activity}</span>
              </div>
            ))}
          </PanelBlock>
        </aside>
      </div>

      <div className="squad-loop-note">
        <strong>导入边界：</strong>
        <span>
          只展示浏览器解析摘要；不读取本机路径，不上传文件，不连接 Git/npm/Wiki action，也没有 executor controls。
          ACTION1+RECEIPT1+RECEIPT2+ACTION3-ARCH 仅生成 Action Envelope 草案、Operation Receipt 模板、回执审计与 fixture-only dry-run mock，copy-only。
        </span>
      </div>
    </section>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="squad-status-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelBlock({ title, tone, children }: { title: string; tone: string; children: ReactNode }) {
  return (
    <section className={`side-panel-block side-${tone}`}>
      <h3>{title}</h3>
      <div className="side-panel-content">{children}</div>
    </section>
  );
}

function sourceLabel(source: ImportedAgentHubProject['importStatus']['source']) {
  return source === 'fixture' ? 'fixture sample' : 'browser-selected-agent-hub';
}

function stableListKey(scope: string, id: string, sourceRef: string, index: number) {
  return `${scope}-${index}-${id}-${sourceRef}`.slice(0, 160);
}
