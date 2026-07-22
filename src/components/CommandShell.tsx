import { useEffect, useState, type ReactNode } from 'react';
import {
  Boxes,
  Code2,
  DatabaseZap,
  FolderSearch,
  GitBranch,
  Info,
  LayoutDashboard,
  Milestone,
  PanelRightOpen,
  Plug,
  Settings,
  UsersRound,
  X,
} from 'lucide-react';
import { useProjectData } from '../datasource/ProjectDataContext';
import { AgentNextActionPanel } from './AgentNextActionPanel';
import { AgentProjectProgressPanel } from './AgentProjectProgressPanel';
import { AgentRelationLanes } from './AgentRelationLanes';
import { AgentRosterPanel } from './AgentRosterPanel';
import { ConnectorPanel } from './ConnectorPanel';
import { DataSourcePanel } from './DataSourcePanel';
import {
  DEFAULT_DEVELOPMENT_MODE_DRAFT,
  DevelopmentModePanel,
  type DevelopmentModeDraft,
} from './DevelopmentModePanel';
import { EvidenceHub } from './EvidenceHub';
import { ExecutionReceipts } from './ExecutionReceipts';
import { PlazaStage } from './plaza/PlazaStage';
import { ProjectsPanel } from './ProjectsPanel';
import { RuntimeActivityDock } from './RuntimeActivityDock';
import { SettingsPanel } from './SettingsPanel';

type PanelId =
  | 'development'
  | 'overview'
  | 'agents'
  | 'relations'
  | 'decisions'
  | 'connectors'
  | 'datasource'
  | 'projects'
  | 'settings'
  | 'evidence';

interface PanelDef {
  id: PanelId;
  label: string;
  icon: typeof LayoutDashboard;
  wide?: boolean;
}

const PANELS: PanelDef[] = [
  { id: 'development', label: '独立开发', icon: Code2, wide: true },
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'agents', label: 'Agent 视图', icon: UsersRound },
  { id: 'relations', label: '协作关系', icon: GitBranch, wide: true },
  { id: 'decisions', label: '决策中心', icon: Milestone },
  { id: 'connectors', label: '智能体接入', icon: Plug },
  { id: 'datasource', label: '数据接入', icon: DatabaseZap },
  { id: 'projects', label: '多项目', icon: Boxes },
  { id: 'evidence', label: '证据归档', icon: FolderSearch, wide: true },
  { id: 'settings', label: '设置', icon: Settings },
];

function workspaceDisplayName(workspace: string): string {
  return workspace.split(/[\\/]/).filter(Boolean).pop() ?? 'local-workspace';
}

/**
 * v0.3 单屏横版壳层：
 * 顶部极简状态条（产品信息藏进 ⓘ 弹层）+ 左侧图标任务栏（点击开合抽屉）+ 中央百家广场。
 * 整屏 100vh 无滚动，信息面板全部通过抽屉按需呈现。
 */
export function CommandShell() {
  const { dashboard, cockpit, server } = useProjectData();
  const [activePanel, setActivePanel] = useState<PanelId | null>('development');
  const [developmentRunning, setDevelopmentRunning] = useState(false);
  const [developmentDraft, setDevelopmentDraft] = useState<DevelopmentModeDraft>(
    DEFAULT_DEVELOPMENT_MODE_DRAFT,
  );
  const [infoOpen, setInfoOpen] = useState(false);
  const [runtimeOpen, setRuntimeOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1100px)').matches : true,
  );

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1100px)');
    const closeDockOnNarrowViewport = (event: MediaQueryListEvent) => {
      if (!event.matches) setRuntimeOpen(false);
    };
    desktopQuery.addEventListener('change', closeDockOnNarrowViewport);
    return () => desktopQuery.removeEventListener('change', closeDockOnNarrowViewport);
  }, []);

  function togglePanel(id: PanelId) {
    if (developmentRunning) return;
    setActivePanel((prev) => (prev === id ? null : id));
  }

  const activeDef = PANELS.find((panel) => panel.id === activePanel);

  return (
    <div className="command-app">
      {/* 顶部极简状态条 */}
      <header className="command-topbar">
        <div className="command-brand">
          <span className="agent-logo-mark">AH</span>
          <strong>AgentHub Visual Manager</strong>
          <span className="command-source-chip">{cockpit.sourceLabel}</span>
          <span
            className={`command-server-dot${server.connected ? ' is-on' : ''}`}
            title={server.connected ? `本地服务已连接：${workspaceDisplayName(server.workspace)}` : '本地服务未连接'}
          />
        </div>
        <div className="command-topbar-right">
          <button
            type="button"
            className={`command-info-button${runtimeOpen ? ' is-on' : ''}`}
            onClick={() => setRuntimeOpen((prev) => !prev)}
            aria-label={runtimeOpen ? '隐藏协同实况' : '显示协同实况'}
            title={runtimeOpen ? '隐藏协同实况' : '显示协同实况'}
          >
            <PanelRightOpen aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`command-info-button${infoOpen ? ' is-on' : ''}`}
            onClick={() => setInfoOpen((prev) => !prev)}
            aria-label="产品信息"
            title="产品信息与安全边界"
          >
            <Info aria-hidden="true" />
          </button>
        </div>
        {infoOpen ? (
          <div className="command-info-pop" role="dialog" aria-label="产品信息">
            <header>
              <strong>{dashboard.productName}</strong>
              <button type="button" onClick={() => setInfoOpen(false)} aria-label="关闭">
                <X aria-hidden="true" />
              </button>
            </header>
            <dl>
              <div>
                <dt>当前项目</dt>
                <dd>{dashboard.projectName}</dd>
              </div>
              <div>
                <dt>系统模式</dt>
                <dd>{dashboard.mode}</dd>
              </div>
              <div>
                <dt>能力层级</dt>
                <dd>{dashboard.capabilityLevel}</dd>
              </div>
              <div>
                <dt>下一步</dt>
                <dd>{dashboard.nextStep}</dd>
              </div>
            </dl>
            <div className="command-info-safety">
              <strong>安全护栏</strong>
              <ul>
                {dashboard.safetyBar.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </header>

      <div className={`command-body${runtimeOpen ? ' has-runtime-dock' : ''}${activeDef ? ' has-drawer' : ''}`}>
        {/* 左侧任务栏 */}
        <nav className="command-rail" aria-label="功能导航">
          {PANELS.map((panel) => {
            const Icon = panel.icon;
            return (
              <button
                key={panel.id}
                type="button"
                className={activePanel === panel.id ? 'is-active' : ''}
                onClick={() => togglePanel(panel.id)}
                disabled={developmentRunning && panel.id !== 'development'}
                aria-label={panel.label}
                title={developmentRunning ? '独立开发运行中，请先安全停止' : panel.label}
              >
                <Icon aria-hidden="true" />
                <span>{panel.label}</span>
              </button>
            );
          })}
          <div className="command-rail-spacer" />
        </nav>

        {/* 中央广场舞台 */}
        <main className="command-stage">
          <PlazaStage onPilotPreviewOpen={() => setRuntimeOpen(false)} />
        </main>

        {/* 抽屉面板 */}
        {activeDef ? (
          <aside className={`command-drawer${activeDef.wide ? ' is-wide' : ''}`} aria-label={activeDef.label}>
            <header className="command-drawer-head">
              <strong>{activeDef.label}</strong>
              <button
                type="button"
                onClick={() => setActivePanel(null)}
                aria-label="关闭面板"
                title={developmentRunning ? '独立开发运行中，请先安全停止' : '关闭面板'}
                disabled={developmentRunning}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="command-drawer-body">{renderDrawerContent(activeDef.id)}</div>
          </aside>
        ) : null}
        {runtimeOpen ? <RuntimeActivityDock onClose={() => setRuntimeOpen(false)} /> : null}
      </div>
    </div>
  );

  /** 注意：普通函数调用而非内联组件（<X/>），避免每次渲染子树卸载重挂丢状态 */
  function renderDrawerContent(panel: PanelId): ReactNode {
    switch (panel) {
      case 'development':
        return (
          <DevelopmentModePanel
            onRunningChange={setDevelopmentRunning}
            onOpenConnectors={() => togglePanel('connectors')}
            draft={developmentDraft}
            onDraftChange={setDevelopmentDraft}
          />
        );
      case 'overview':
        return (
          <>
            <section className="agent-metric-strip" aria-label="Agent 状态指标">
              {dashboard.topMetrics.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </section>
            <AgentProjectProgressPanel dashboard={dashboard} />
            <ExecutionReceipts />
            <section className="agent-side-panel" aria-label="最近操作回执">
              <div className="agent-side-heading">
                <span>最近操作回执</span>
                <strong>只显示摘要</strong>
              </div>
              <div className="agent-receipt-list">
                {dashboard.recentReceipts.map((receipt) => (
                  <article key={receipt.title}>
                    <span>{receipt.time}</span>
                    <strong>{receipt.title}</strong>
                    <p>{receipt.summary}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        );
      case 'agents':
        return <AgentRosterPanel dashboard={dashboard} />;
      case 'relations':
        return <AgentRelationLanes dashboard={dashboard} relations={cockpit.relations} />;
      case 'decisions':
        return <AgentNextActionPanel dashboard={dashboard} />;
      case 'connectors':
        return <ConnectorPanel />;
      case 'datasource':
        return <DataSourcePanel />;
      case 'projects':
        return <ProjectsPanel />;
      case 'settings':
        return <SettingsPanel />;
      case 'evidence':
        return <EvidenceHub categories={cockpit.evidence} />;
      default:
        return null;
    }
  }
}
