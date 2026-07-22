import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Circle,
  CircleStop,
  Download,
  FileDiff,
  GitBranch,
  LockKeyhole,
  MessageSquare,
  PanelRightClose,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useProjectData } from '../datasource/ProjectDataContext';
import { AGENT_ROLE_CONTRACTS } from '../lib/coordinationContract';
import { DEFAULT_SERVER_URL, fetchOperatorEvidenceExport } from '../lib/serverBridge';
import type {
  AgentCapability,
  OperatorEvidenceExportV1,
  OperatorEvidenceOrchestrationRunSummary,
  RuntimeEvent,
} from '../lib/serverBridge';
import type { TaskCheckpointSummary } from '../lib/taskGraph';

type DockTab = 'tasks' | 'conversation' | 'operation' | 'approval' | 'permissions';

const TABS = [
  { id: 'tasks', label: '任务', icon: GitBranch },
  { id: 'conversation', label: '对话', icon: MessageSquare },
  { id: 'operation', label: '操作', icon: Activity },
  { id: 'approval', label: '审批', icon: ShieldCheck },
  { id: 'permissions', label: '权限', icon: SlidersHorizontal },
] as const;

const LOCKED_CAPABILITIES = ['通用 Shell', 'Git 暂存', 'Git 提交', '远端推送'];
export const OPERATOR_EVIDENCE_TRUTH =
  '导出当前 run 的脱敏证据。服务端源 run 状态在重启后会丢失，届时可能无法再次导出；已经下载的 JSON 文件仍由你保管，但它仅供审阅，不能恢复 run。不会写入项目，下载文件由浏览器和你自行保管或删除。';

export function RuntimeActivityDock({ onClose }: { onClose: () => void }) {
  const {
    server,
    runtime,
    setAgentCapability,
    listTaskCheckpoints,
    requestTaskRecovery,
    cancelOrchestrationRun,
    preflightPatchProposal,
    applyPatchProposal,
  } = useProjectData();
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const [activeTab, setActiveTab] = useState<DockTab>('conversation');
  const [pendingKey, setPendingKey] = useState('');
  const [checkpoints, setCheckpoints] = useState<TaskCheckpointSummary[]>([]);
  const [checkpointBusy, setCheckpointBusy] = useState('');
  const [checkpointMessage, setCheckpointMessage] = useState('');
  const [cancelBusy, setCancelBusy] = useState('');
  const [patchBusy, setPatchBusy] = useState('');
  const [patchMessage, setPatchMessage] = useState('');
  const [selectedEvidenceRunId, setSelectedEvidenceRunId] = useState('');
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceMessage, setEvidenceMessage] = useState('');
  const evidenceRequestInFlight = useRef(false);

  const visibleEvents = useMemo(() => {
    const events = snapshot.events.filter((event) => {
      if (activeTab === 'conversation') return event.category === 'conversation';
      if (activeTab === 'approval') return event.category === 'approval';
      if (activeTab === 'operation') return ['operation', 'security', 'system'].includes(event.category);
      return false;
    });
    return events.slice(-120).reverse();
  }, [activeTab, snapshot.events]);
  const activeOrchestration = useMemo(
    () =>
      snapshot.orchestrationRuns.find((run) => run.runId === snapshot.taskDag?.runId) ??
      snapshot.orchestrationRuns[0] ??
      null,
    [snapshot.orchestrationRuns, snapshot.taskDag?.runId],
  );
  const eligibleEvidenceRuns = useMemo(
    () => eligibleOperatorEvidenceRuns(snapshot.orchestrationRuns),
    [snapshot.orchestrationRuns],
  );

  async function toggleCapability(agentId: string, capability: AgentCapability, allowed: boolean) {
    const key = `${agentId}:${capability}`;
    setPendingKey(key);
    await setAgentCapability(agentId, capability, allowed);
    setPendingKey('');
  }

  async function refreshCheckpoints() {
    if (!server.connected) return;
    setCheckpointBusy('refresh');
    setCheckpointMessage('');
    try {
      setCheckpoints(await listTaskCheckpoints());
    } catch (error) {
      setCheckpointMessage(error instanceof Error ? error.message : '检查点读取失败');
    } finally {
      setCheckpointBusy('');
    }
  }

  async function restoreCheckpoint(runId: string) {
    setCheckpointBusy(runId);
    const error = await requestTaskRecovery(runId);
    setCheckpointMessage(error ?? '检查点已送入舞台，等待继续');
    setCheckpointBusy('');
  }

  async function handlePatchAction(proposalId: string) {
    const proposal = snapshot.patchProposals.find((item) => item.proposalId === proposalId);
    if (!proposal) return;
    setPatchBusy(proposalId);
    setPatchMessage('');
    if (proposal.status === 'preflight_passed_locked') {
      const error = await applyPatchProposal(proposal);
      setPatchMessage(error ?? '补丁事务已应用；未执行任何 Git 操作');
    } else {
      const error = await preflightPatchProposal(proposal);
      setPatchMessage(error ?? '原文件路径与 SHA-256 已匹配；等待独立应用批准');
    }
    setPatchBusy('');
  }

  async function cancelRun(runId: string) {
    setCancelBusy(runId);
    const error = await cancelOrchestrationRun(runId);
    setCheckpointMessage(error ?? '模型编排已取消');
    setCancelBusy('');
  }

  async function exportOperatorEvidence() {
    if (
      evidenceRequestInFlight.current
      || !eligibleEvidenceRuns.some((run) => run.runId === selectedEvidenceRunId)
    ) return;
    evidenceRequestInFlight.current = true;
    setEvidenceBusy(true);
    setEvidenceMessage('');
    try {
      const exportDocument = await fetchOperatorEvidenceExport(DEFAULT_SERVER_URL, selectedEvidenceRunId);
      const fileName = downloadOperatorEvidenceDocument(exportDocument);
      setEvidenceMessage(`已下载 ${fileName} · SHA-256 ${exportDocument.integrity.payloadSha256.slice(0, 16)}`);
    } catch (error) {
      setEvidenceMessage(error instanceof Error ? error.message : '脱敏证据导出失败');
    } finally {
      evidenceRequestInFlight.current = false;
      setEvidenceBusy(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'tasks' && server.connected) void refreshCheckpoints();
  }, [activeTab, server.connected]);

  useEffect(() => {
    if (selectedEvidenceRunId && !eligibleEvidenceRuns.some((run) => run.runId === selectedEvidenceRunId)) {
      setSelectedEvidenceRunId('');
      setEvidenceMessage('');
    }
  }, [eligibleEvidenceRuns, selectedEvidenceRunId]);

  return (
    <aside className="runtime-dock" aria-label="Agent 协同实况">
      <header className="runtime-dock-head">
        <div>
          <span className={`runtime-live-dot${server.connected ? ' is-on' : ''}`} aria-hidden="true" />
          <strong>协同实况</strong>
          <small>{server.connected ? '本地事件流' : '服务未连接'}</small>
        </div>
        <button type="button" onClick={onClose} aria-label="隐藏协同实况" title="隐藏协同实况">
          <PanelRightClose aria-hidden="true" />
          <span>收起</span>
        </button>
      </header>

      <div className="runtime-tabs" role="tablist" aria-label="协同实况分类">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'is-active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'tasks' ? (
        <div className="runtime-task-view" role="tabpanel">
          <section className="runtime-dag-section" aria-label="当前任务 DAG">
            <header>
              <div>
                <strong>当前任务 DAG</strong>
                <span>{snapshot.taskDag ? `${snapshot.taskDag.nodes.length} 个节点` : '暂无活动任务'}</span>
              </div>
            </header>
            {snapshot.taskDag ? (
              <ol className="runtime-dag-list">
                {snapshot.taskDag.nodes.map((node) => (
                  <li key={node.id} className={`status-${node.status}`}>
                    <span className="runtime-dag-status" aria-hidden="true" />
                    <div>
                      <strong>{node.label}</strong>
                      <small>
                        {node.status} · 尝试 {node.attempt}/{node.maxAttempts}
                        {node.dependencies.length ? ` · 依赖 ${node.dependencies.length}` : ''}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="runtime-empty">暂无活动任务</p>
            )}
          </section>

          <section className="runtime-orchestration-section" aria-label="模型编排预算">
            <header>
              <div>
                <strong>模型编排</strong>
                <span>{activeOrchestration ? activeOrchestration.status : '暂无真实 run'}</span>
              </div>
              {activeOrchestration?.status === 'active' ? (
                <button
                  type="button"
                  onClick={() => void cancelRun(activeOrchestration.runId)}
                  disabled={cancelBusy === activeOrchestration.runId}
                  aria-label="取消模型编排"
                  title="取消模型编排"
                >
                  <CircleStop aria-hidden="true" />
                </button>
              ) : null}
            </header>
            {activeOrchestration ? (
              <div className="runtime-orchestration-body">
                <div>
                  <span>产物证据</span>
                  <strong>
                    {activeOrchestration.evidence.length}/{activeOrchestration.policy.expectedArtifacts}
                  </strong>
                </div>
                <div>
                  <span>调用次数</span>
                  <strong>
                    {activeOrchestration.callsStarted}/{activeOrchestration.policy.maxCalls}
                  </strong>
                </div>
                <div>
                  <span>输出预算</span>
                  <strong>
                    {activeOrchestration.reservedOutputTokens}/{activeOrchestration.policy.totalOutputTokens}
                  </strong>
                </div>
                <progress
                  max={activeOrchestration.policy.totalOutputTokens}
                  value={activeOrchestration.reservedOutputTokens}
                  aria-label="输出 token 预算使用量"
                />
              </div>
            ) : (
              <p className="runtime-empty">连接模型并从舞台提交需求后显示</p>
            )}
          </section>

          <section className="runtime-checkpoint-section" aria-label="脱敏运行证据导出">
            <header>
              <div>
                <strong>脱敏运行证据</strong>
                <span>{eligibleEvidenceRuns.length} 个已验收 run</span>
              </div>
              <Download aria-hidden="true" />
            </header>
            {eligibleEvidenceRuns.length ? (
              <div className="runtime-checkpoint-list">
                <article>
                  <div>
                    <strong>选择一个已验收 run</strong>
                    <small>
                      <select
                        aria-label="选择要导出脱敏证据的 run"
                        value={selectedEvidenceRunId}
                        disabled={evidenceBusy}
                        onChange={(event) => {
                          setSelectedEvidenceRunId(event.target.value);
                          setEvidenceMessage('');
                        }}
                      >
                        <option value="">请选择</option>
                        {eligibleEvidenceRuns.map((run) => (
                          <option key={run.runId} value={run.runId}>{shortRunId(run.runId)}</option>
                        ))}
                      </select>
                    </small>
                  </div>
                  {selectedEvidenceRunId ? (
                    <button
                      type="button"
                      onClick={() => void exportOperatorEvidence()}
                      disabled={evidenceBusy || !server.connected}
                      aria-label="导出当前 run 的脱敏证据"
                      title="显式下载审阅用 JSON；不写入项目且不能恢复 run"
                    >
                      <Download aria-hidden="true" />
                    </button>
                  ) : null}
                </article>
              </div>
            ) : (
              <p className="runtime-empty">暂无满足最终人工验收条件的 run</p>
            )}
            <p className="runtime-task-message">{OPERATOR_EVIDENCE_TRUTH}</p>
            {evidenceMessage ? <p className="runtime-task-message" aria-live="polite">{evidenceMessage}</p> : null}
          </section>

          <section className="runtime-checkpoint-section" aria-label="可恢复检查点">
            <header>
              <div>
                <strong>可恢复检查点</strong>
                <span>{checkpoints.length} 个 run</span>
              </div>
              <button
                type="button"
                onClick={() => void refreshCheckpoints()}
                disabled={!server.connected || checkpointBusy === 'refresh'}
                aria-label="刷新检查点"
                title="刷新检查点"
              >
                <RefreshCw aria-hidden="true" />
              </button>
            </header>
            <div className="runtime-checkpoint-list">
              {checkpoints.map((checkpoint) => (
                <article key={checkpoint.runId}>
                  <div>
                    <strong>{checkpoint.taskText}</strong>
                    <small>
                      {checkpoint.status} · {checkpoint.completedNodes}/{checkpoint.totalNodes} · r{checkpoint.revision}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => void restoreCheckpoint(checkpoint.runId)}
                    disabled={checkpointBusy === checkpoint.runId}
                    aria-label={`恢复检查点 ${checkpoint.taskText}`}
                    title="恢复检查点"
                  >
                    <RotateCcw aria-hidden="true" />
                  </button>
                </article>
              ))}
              {!checkpoints.length && checkpointBusy !== 'refresh' ? <p className="runtime-empty">暂无检查点</p> : null}
            </div>
            {checkpointMessage ? <p className="runtime-task-message">{checkpointMessage}</p> : null}
          </section>

          <section className="runtime-patch-section" aria-label="补丁提案">
            <header>
              <div>
                <strong>补丁提案</strong>
                <span>{snapshot.patchProposals.length} 个已校验</span>
              </div>
              <LockKeyhole aria-hidden="true" />
            </header>
            <div className="runtime-patch-list">
              {snapshot.patchProposals.slice(0, 5).map((proposal) => (
                <article key={proposal.proposalId}>
                  <FileDiff aria-hidden="true" />
                  <div>
                    <strong>{proposal.title}</strong>
                    <small>
                      {proposal.files.length} 个文件 · {patchStatusLabel(proposal.status)} · {proposal.proposalSha256.slice(0, 12)}
                    </small>
                    <span>{proposal.files.map((file) => `${file.path} (+${file.addedLines}/-${file.removedLines})`).join(' · ')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handlePatchAction(proposal.proposalId)}
                    disabled={
                      !server.connected ||
                      !['validated_locked', 'preflight_passed_locked'].includes(proposal.status) ||
                      patchBusy === proposal.proposalId
                    }
                    aria-label={
                      proposal.status === 'preflight_passed_locked'
                        ? `批准事务应用 ${proposal.title}`
                        : `批准只读预检 ${proposal.title}`
                    }
                    title={
                      proposal.status === 'preflight_passed_locked'
                        ? '签发独立一次性票据并事务应用补丁；不执行 Git 操作'
                        : '签发一次性票据并只读校验原文件；不应用补丁'
                    }
                  >
                    <ShieldCheck aria-hidden="true" />
                  </button>
                </article>
              ))}
              {!snapshot.patchProposals.length ? <p className="runtime-empty">暂无已校验提案</p> : null}
            </div>
            {patchMessage ? <p className="runtime-task-message">{patchMessage}</p> : null}
          </section>
        </div>
      ) : activeTab === 'permissions' ? (
        <div className="runtime-permission-view" role="tabpanel">
          <div className="runtime-permission-grid" role="table" aria-label="逐 Agent 权限矩阵">
            <div
              className="runtime-permission-row is-head"
              role="row"
              style={permissionGridColumns(snapshot.definitions.length)}
            >
              <span role="columnheader">Agent</span>
              {snapshot.definitions.map((definition) => (
                <span key={definition.id} role="columnheader" title={definition.summary}>
                  {capabilityHeaderLabel(definition.id)}
                </span>
              ))}
            </div>
            {snapshot.profiles.map((profile) => {
              const role = AGENT_ROLE_CONTRACTS.find((item) => item.code === profile.agentId);
              return (
                <div
                  className="runtime-permission-row"
                  role="row"
                  key={profile.agentId}
                  style={permissionGridColumns(snapshot.definitions.length)}
                >
                  <span role="rowheader">
                    <strong>{role?.name ?? profile.agentId}</strong>
                    <small>{profile.agentId}</small>
                  </span>
                  {snapshot.definitions.map((definition) => {
                    const key = `${profile.agentId}:${definition.id}`;
                    return (
                      <label key={definition.id} title={`${role?.name ?? profile.agentId} · ${definition.summary}`}>
                        <input
                          type="checkbox"
                          checked={profile.capabilities[definition.id]}
                          disabled={!server.connected || pendingKey === key}
                          onChange={(event) =>
                            void toggleCapability(profile.agentId, definition.id, event.target.checked)
                          }
                          aria-label={`${role?.name ?? profile.agentId} ${definition.label}`}
                        />
                        <span aria-hidden="true" />
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="runtime-locked-capabilities">
            <LockKeyhole aria-hidden="true" />
            <div>
              <strong>未开放能力</strong>
              <span>{LOCKED_CAPABILITIES.join(' · ')}</span>
            </div>
          </div>
          {snapshot.error ? <p className="runtime-error">{snapshot.error}</p> : null}
        </div>
      ) : (
        <div className="runtime-event-list" role="tabpanel" aria-live="polite">
          {snapshot.loading ? <p className="runtime-empty">正在同步…</p> : null}
          {!snapshot.loading && visibleEvents.length === 0 ? (
            <p className="runtime-empty">{server.connected ? '暂无对应记录' : '连接本地服务后显示实时记录'}</p>
          ) : null}
          {visibleEvents.map((event) => (
            <RuntimeEventRow key={event.id} event={event} />
          ))}
        </div>
      )}

      <footer className="runtime-dock-foot">
        <span>{snapshot.events.length} 条会话内记录</span>
        <span>事件/编排/补丁提案仅内存 · 检查点受控持久化</span>
      </footer>
    </aside>
  );
}

export function eligibleOperatorEvidenceRuns(
  runs: readonly OperatorEvidenceOrchestrationRunSummary[],
): OperatorEvidenceOrchestrationRunSummary[] {
  return runs.filter((run) => run.status === 'completed' && run.operatorEvidenceEligible === true);
}

export interface OperatorEvidenceDownloadEnvironment {
  createBlob(parts: BlobPart[], options: BlobPropertyBag): Blob;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  createAnchor(): HTMLAnchorElement;
  appendAnchor(anchor: HTMLAnchorElement): void;
}

export function operatorEvidenceFileName(exportDocument: OperatorEvidenceExportV1): string {
  const payloadSha256 = exportDocument.integrity.payloadSha256;
  const exportedAt = new Date(exportDocument.exportedAt);
  if (!/^[a-f0-9]{64}$/.test(payloadSha256) || Number.isNaN(exportedAt.getTime())) {
    throw new Error('脱敏证据文件元数据无效');
  }
  const timestamp = `${exportedAt.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
  return `agenthub-operator-evidence-v1-${payloadSha256.slice(0, 16)}-${timestamp}.json`;
}

export function downloadOperatorEvidenceDocument(
  exportDocument: OperatorEvidenceExportV1,
  environment: OperatorEvidenceDownloadEnvironment = {
    createBlob: (parts, options) => new Blob(parts, options),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement('a'),
    appendAnchor: (anchor) => document.body.append(anchor),
  },
): string {
  const fileName = operatorEvidenceFileName(exportDocument);
  const blob = environment.createBlob(
    [`${JSON.stringify(exportDocument)}\n`],
    { type: 'application/json;charset=utf-8' },
  );
  const objectUrl = environment.createObjectURL(blob);
  let anchor: HTMLAnchorElement | null = null;
  try {
    anchor = environment.createAnchor();
    anchor.href = objectUrl;
    anchor.download = fileName;
    environment.appendAnchor(anchor);
    anchor.click();
    return fileName;
  } finally {
    anchor?.remove();
    environment.revokeObjectURL(objectUrl);
  }
}

function patchStatusLabel(
  status: 'validated_locked' | 'preflight_passed_locked' | 'preflight_failed_locked' | 'applied',
): string {
  if (status === 'applied') return '事务已应用';
  if (status === 'preflight_passed_locked') return '原件匹配，待独立批准';
  if (status === 'preflight_failed_locked') return '原件不匹配，应用锁定';
  return '待人工预检，应用锁定';
}

function capabilityHeaderLabel(capability: AgentCapability): string {
  const labels: Record<AgentCapability, string> = {
    call_model: '模型',
    save_note: '纪要',
    run_build: '构建',
    manage_checkpoint: '检查点',
    propose_patch: '提案',
    preflight_patch: '预检',
    apply_patch: '应用',
  };
  return labels[capability];
}

function permissionGridColumns(capabilityCount: number): { gridTemplateColumns: string } {
  return { gridTemplateColumns: `minmax(70px, 1fr) repeat(${capabilityCount}, minmax(30px, 38px))` };
}

function RuntimeEventRow({ event }: { event: RuntimeEvent }) {
  const StatusIcon =
    event.status === 'succeeded'
      ? CheckCircle2
      : event.status === 'failed' || event.status === 'blocked'
        ? AlertCircle
        : Circle;
  return (
    <article className={`runtime-event status-${event.status}`}>
      <StatusIcon aria-hidden="true" />
      <div>
        <header>
          <strong>{event.title}</strong>
          <time dateTime={event.at}>{formatEventTime(event.at)}</time>
        </header>
        <p>{event.summary}</p>
        <footer>
          {event.agentId ? <span>{event.agentId}</span> : null}
          {event.runId ? <span>{shortRunId(event.runId)}</span> : null}
        </footer>
      </div>
    </article>
  );
}

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortRunId(runId: string): string {
  return runId.length > 18 ? `${runId.slice(0, 8)}…${runId.slice(-6)}` : runId;
}
