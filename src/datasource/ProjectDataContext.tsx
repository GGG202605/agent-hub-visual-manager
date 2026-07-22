import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { basicAgentHubFixture } from '../data/basicAgentHubFixture';
import { mockAgentHub } from '../data/mockAgentHub';
import { importAgentHubFiles } from '../lib/agentHubBrowserImport';
import { parseBasicAgentHubFixture } from '../lib/agentHubFixtureParser';
import { buildCockpitModel } from '../lib/buildCockpitModel';
import { deriveAgentFirstDashboard } from '../lib/deriveAgentFirstDashboard';
import {
  DEFAULT_SERVER_URL,
  cancelModelOrchestration,
  executePatchApplication,
  executePatchPreflight,
  fetchHealth,
  fetchProjectFiles,
  fetchRuntimeState,
  fetchTaskCheckpoint,
  fetchTaskCheckpoints,
  saveTaskCheckpoint,
  resumeModelOrchestration,
  submitPatchProposal,
  subscribeEvents,
  switchWorkspaceApi,
  updateAgentPermission,
  type AgentCapability,
} from '../lib/serverBridge';
import { RuntimeActivityStore } from '../lib/runtimeActivity';
import type { PatchProposal, PatchProposalSummary } from '../lib/patchProposal';
import type { TaskCheckpoint, TaskCheckpointSummary } from '../lib/taskGraph';
import type {
  AgentFirstDashboardView,
  CockpitViewModel,
  ImportedAgentHubProject,
  ProjectDataSourceKind,
} from '../types';

/**
 * v0.5 数据接入层（ProjectDataSource）。
 *
 * 三种数据源（优先级 server > imported > mock）：
 *  - mock：内置演示数据
 *  - imported：浏览器目录只读导入（一次性快照）
 *  - server：本地零依赖 Node 服务实时同步（SSE 推送 .agent-hub 变化，自动刷新）
 *
 * 安全边界：读取只读；纪要/构建经一次性审批；检查点经独立权限写入固定 ai-output 子目录。
 */

export interface ServerState {
  connected: boolean;
  url: string;
  workspace: string;
  message: string;
  safePilotIssuanceEnabled: boolean;
  serviceInstanceId: string;
}

export interface ProjectDataValue {
  sourceKind: ProjectDataSourceKind;
  project: ImportedAgentHubProject;
  dashboard: AgentFirstDashboardView;
  cockpit: CockpitViewModel;
  isImporting: boolean;
  importMessage: string;
  importFromFiles: (files: FileList | File[]) => Promise<void>;
  resetToMock: () => void;
  /** v0.5 本地服务 */
  server: ServerState;
  connectServer: (url?: string) => Promise<void>;
  disconnectServer: () => void;
  /** v1.0 多项目：切换工作区（需服务已连接） */
  switchWorkspace: (path: string) => Promise<string | null>;
  /** v1.3 高频运行实况使用稳定 store，避免事件流触发 3D 舞台重渲染。 */
  runtime: RuntimeActivityStore;
  setAgentCapability: (agentId: string, capability: AgentCapability, allowed: boolean) => Promise<string | null>;
  listTaskCheckpoints: () => Promise<TaskCheckpointSummary[]>;
  requestTaskRecovery: (runId: string) => Promise<string | null>;
  checkpointRecovery: TaskCheckpoint | null;
  clearTaskRecovery: () => void;
  persistTaskCheckpoint: (checkpoint: TaskCheckpoint) => Promise<string | null>;
  cancelOrchestrationRun: (runId: string) => Promise<string | null>;
  registerPatchProposal: (proposal: PatchProposal) => Promise<PatchProposalSummary>;
  preflightPatchProposal: (proposal: PatchProposalSummary) => Promise<string | null>;
  applyPatchProposal: (proposal: PatchProposalSummary) => Promise<string | null>;
}

const ProjectDataContext = createContext<ProjectDataValue | null>(null);

export function ProjectDataProvider({ children }: { children: ReactNode }) {
  const fixtureProject = useMemo(() => parseBasicAgentHubFixture(basicAgentHubFixture), []);
  const [importedProject, setImportedProject] = useState<ImportedAgentHubProject | null>(null);
  const [serverProject, setServerProject] = useState<ImportedAgentHubProject | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('当前为演示数据；可在"数据接入"选择目录导入或连接本地服务。');
  const [server, setServer] = useState<ServerState>(() => ({
    connected: false,
    url: readStoredServerUrl(),
    workspace: '',
    message: '未连接',
    safePilotIssuanceEnabled: false,
    serviceInstanceId: '',
  }));
  const [checkpointRecovery, setCheckpointRecovery] = useState<TaskCheckpoint | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const autoConnectAttemptedRef = useRef(false);
  const runtimeStoreRef = useRef<RuntimeActivityStore | null>(null);
  if (!runtimeStoreRef.current) runtimeStoreRef.current = new RuntimeActivityStore();
  const runtime = runtimeStoreRef.current;

  const sourceKind: ProjectDataSourceKind = serverProject ? 'server' : importedProject ? 'imported' : 'mock';
  const project = serverProject ?? importedProject ?? fixtureProject;

  const dashboard = useMemo(() => {
    if (serverProject) return deriveAgentFirstDashboard(serverProject, 'server');
    if (importedProject) return deriveAgentFirstDashboard(importedProject, 'imported');
    return mockAgentHub.agentFirstDashboard;
  }, [serverProject, importedProject]);

  const cockpit = useMemo(
    () => buildCockpitModel(dashboard, project, sourceKind),
    [dashboard, project, sourceKind],
  );

  const importFromFiles = useCallback(async (files: FileList | File[]) => {
    setIsImporting(true);
    setImportMessage('正在浏览器内只读解析所选目录…');
    try {
      const nextProject = await importAgentHubFiles(files);
      setImportedProject(nextProject);
      setImportMessage(
        `导入完成：${nextProject.importStatus.importedFiles.length} 导入 / ` +
          `${nextProject.importStatus.skippedFiles.length} 跳过 / ` +
          `${nextProject.importStatus.blockedFiles.length} 阻断。`,
      );
    } catch {
      setImportMessage('导入失败：未修改任何文件，可重试或回到演示数据。');
    } finally {
      setIsImporting(false);
    }
  }, []);

  /** 刷新序号守卫：并发拉取时只接受最新一次的结果，防止旧数据覆盖新数据 */
  const refreshSeqRef = useRef(0);
  const refreshFromServer = useCallback(async (url: string) => {
    const seq = ++refreshSeqRef.current;
    const files = await fetchProjectFiles(url);
    const nextProject = await importAgentHubFiles(files);
    if (seq === refreshSeqRef.current) setServerProject(nextProject);
  }, []);

  const refreshRuntimeFromServer = useCallback(
    async (url: string) => {
      runtime.setLoading(true);
      try {
        runtime.replace(await fetchRuntimeState(url));
      } catch (error) {
        runtime.setError(error instanceof Error ? error.message : '运行实况同步失败');
      }
    },
    [runtime],
  );

  const connectServer = useCallback(
    async (rawUrl?: string) => {
      const url = (rawUrl ?? server.url).trim() || DEFAULT_SERVER_URL;
      // 先清掉上一次订阅，失败路径也不残留旧事件流。
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setServer((prev) => ({ ...prev, url, message: '连接中…' }));
      try {
        const health = await fetchHealth(url);
        await Promise.all([refreshFromServer(url), refreshRuntimeFromServer(url)]);
        unsubscribeRef.current = subscribeEvents(
          url,
          () => {
            void refreshFromServer(url).catch(() => undefined);
          },
          () =>
            setServer((prev) => ({
              ...prev,
              connected: false,
              safePilotIssuanceEnabled: false,
              serviceInstanceId: '',
              message: '服务连接已断开：数据保留最后一次同步，可在数据接入面板重连',
            })),
          (workspace) => {
            setServer((prev) => ({ ...prev, workspace, message: '工作区已切换，同步中…' }));
            void refreshFromServer(url).catch(() => undefined);
            void refreshRuntimeFromServer(url);
          },
          (event) => {
            runtime.append(event);
            if (event.type.startsWith('orchestration_') || event.type.startsWith('patch_')) {
              void refreshRuntimeFromServer(url);
            }
          },
          () => {
            void fetchHealth(url).then(async (nextHealth) => {
              setServer((prev) => ({
                ...prev,
                connected: true,
                workspace: nextHealth.workspace,
                safePilotIssuanceEnabled: nextHealth.safePilotIssuanceEnabled === true,
                serviceInstanceId: nextHealth.serviceInstanceId,
                message: '已连接，文件变化实时同步',
              }));
              await refreshRuntimeFromServer(url);
            }).catch(() => undefined);
          },
        );
        setServer({
          connected: true,
          url,
          workspace: health.workspace,
          message: '已连接，文件变化实时同步',
          safePilotIssuanceEnabled: health.safePilotIssuanceEnabled === true,
          serviceInstanceId: health.serviceInstanceId,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : '未知错误';
        setServer((prev) => ({
          ...prev,
          connected: false,
          safePilotIssuanceEnabled: false,
          serviceInstanceId: '',
          message: `连接失败：${reason}（请先运行 start-server.bat）`,
        }));
      }
    },
    [server.url, refreshFromServer, refreshRuntimeFromServer, runtime],
  );

  useEffect(() => {
    if (autoConnectAttemptedRef.current) return;
    const hostedUrl = readHostedServerUrl();
    if (!hostedUrl) return;
    autoConnectAttemptedRef.current = true;
    void connectServer(hostedUrl);
  }, [connectServer]);

  const disconnectServer = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setServerProject(null);
    runtime.reset();
    setCheckpointRecovery(null);
    setServer((prev) => ({
      ...prev,
      connected: false,
      workspace: '',
      message: '已断开',
      safePilotIssuanceEnabled: false,
      serviceInstanceId: '',
    }));
  }, [runtime]);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  const switchWorkspace = useCallback(
    async (targetPath: string): Promise<string | null> => {
      if (!server.connected) return '本地服务未连接';
      try {
        const result = await switchWorkspaceApi(server.url, targetPath);
        if (!result.ok) return result.error ?? '切换失败';
        setServer((prev) => ({ ...prev, workspace: result.workspace ?? targetPath, message: '工作区已切换' }));
        await refreshFromServer(server.url);
        await refreshRuntimeFromServer(server.url);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : '切换失败';
      }
    },
    [server.connected, server.url, refreshFromServer, refreshRuntimeFromServer],
  );

  const setAgentCapability = useCallback(
    async (agentId: string, capability: AgentCapability, allowed: boolean): Promise<string | null> => {
      if (!server.connected) return '本地服务未连接';
      try {
        const payload = await updateAgentPermission(server.url, agentId, capability, allowed);
        runtime.replacePermissions(payload.definitions, payload.profiles);
        return null;
      } catch (error) {
        const reason = error instanceof Error ? error.message : '权限更新失败';
        runtime.setError(reason);
        return reason;
      }
    },
    [server.connected, server.url, runtime],
  );

  const listTaskCheckpoints = useCallback(async (): Promise<TaskCheckpointSummary[]> => {
    if (!server.connected) return [];
    return fetchTaskCheckpoints(server.url);
  }, [server.connected, server.url]);

  const requestTaskRecovery = useCallback(
    async (runId: string): Promise<string | null> => {
      if (!server.connected) return '本地服务未连接';
      try {
        const checkpoint = await fetchTaskCheckpoint(server.url, runId);
        if (checkpoint.pipeline.mode === 'connected') {
          runtime.upsertOrchestrationRun(await resumeModelOrchestration(server.url, runId));
        }
        setCheckpointRecovery(checkpoint);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : '检查点恢复失败';
      }
    },
    [runtime, server.connected, server.url],
  );

  const clearTaskRecovery = useCallback(() => setCheckpointRecovery(null), []);

  const persistTaskCheckpoint = useCallback(
    async (checkpoint: TaskCheckpoint): Promise<string | null> => {
      if (!server.connected) return '本地服务未连接';
      try {
        await saveTaskCheckpoint(server.url, checkpoint);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : '检查点保存失败';
      }
    },
    [server.connected, server.url],
  );

  const cancelOrchestrationRun = useCallback(
    async (runId: string): Promise<string | null> => {
      if (!server.connected) return '本地服务未连接';
      try {
        runtime.upsertOrchestrationRun(await cancelModelOrchestration(server.url, runId));
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : '模型编排取消失败';
      }
    },
    [runtime, server.connected, server.url],
  );

  const registerPatchProposal = useCallback(
    async (proposal: PatchProposal): Promise<PatchProposalSummary> => {
      if (!server.connected) throw new Error('本地服务未连接');
      const summary = await submitPatchProposal(server.url, proposal);
      runtime.upsertPatchProposal(summary);
      return summary;
    },
    [runtime, server.connected, server.url],
  );

  const preflightPatchProposal = useCallback(
    async (proposal: PatchProposalSummary): Promise<string | null> => {
      if (!server.connected) return '本地服务未连接';
      try {
        const result = await executePatchPreflight(server.url, proposal);
        if (result.proposal) runtime.upsertPatchProposal(result.proposal);
        return result.ok ? null : result.error ?? '原文件只读预检未通过';
      } catch (error) {
        return error instanceof Error ? error.message : '原文件只读预检失败';
      }
    },
    [runtime, server.connected, server.url],
  );

  const applyPatchProposal = useCallback(
    async (proposal: PatchProposalSummary): Promise<string | null> => {
      if (!server.connected) return '本地服务未连接';
      try {
        const result = await executePatchApplication(server.url, proposal);
        if (result.proposal) runtime.upsertPatchProposal(result.proposal);
        return result.ok ? null : result.error ?? '补丁事务应用失败';
      } catch (error) {
        return error instanceof Error ? error.message : '补丁事务应用失败';
      }
    },
    [runtime, server.connected, server.url],
  );

  const resetToMock = useCallback(() => {
    setImportedProject(null);
    setImportMessage('已回到演示数据。');
  }, []);

  const value = useMemo<ProjectDataValue>(
    () => ({
      sourceKind,
      project,
      dashboard,
      cockpit,
      isImporting,
      importMessage,
      importFromFiles,
      resetToMock,
      server,
      connectServer,
      disconnectServer,
      switchWorkspace,
      runtime,
      setAgentCapability,
      listTaskCheckpoints,
      requestTaskRecovery,
      checkpointRecovery,
      clearTaskRecovery,
      persistTaskCheckpoint,
      cancelOrchestrationRun,
      registerPatchProposal,
      preflightPatchProposal,
      applyPatchProposal,
    }),
    [
      sourceKind,
      project,
      dashboard,
      cockpit,
      isImporting,
      importMessage,
      importFromFiles,
      resetToMock,
      server,
      connectServer,
      disconnectServer,
      switchWorkspace,
      runtime,
      setAgentCapability,
      listTaskCheckpoints,
      requestTaskRecovery,
      checkpointRecovery,
      clearTaskRecovery,
      persistTaskCheckpoint,
      cancelOrchestrationRun,
      registerPatchProposal,
      preflightPatchProposal,
      applyPatchProposal,
    ],
  );

  return <ProjectDataContext.Provider value={value}>{children}</ProjectDataContext.Provider>;
}

/** 设置项：默认服务地址（非敏感，允许本地保存） */
function readStoredServerUrl(): string {
  try {
    return readHostedServerUrl() ?? window.localStorage.getItem('ahvm.serverUrl') ?? DEFAULT_SERVER_URL;
  } catch {
    return DEFAULT_SERVER_URL;
  }
}

function readHostedServerUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const isLocalHost = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  const isStandaloneFrontend = ['5173', '4173'].includes(window.location.port);
  return isLocalHost && !isStandaloneFrontend ? window.location.origin : null;
}

export function useProjectData(): ProjectDataValue {
  const value = useContext(ProjectDataContext);
  if (!value) {
    throw new Error('useProjectData 必须在 ProjectDataProvider 内使用');
  }
  return value;
}
