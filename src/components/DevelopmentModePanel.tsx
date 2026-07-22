import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Code2,
  LoaderCircle,
  LockKeyhole,
  MonitorSmartphone,
  Sparkles,
  Square,
} from 'lucide-react';
import { useConnectors } from '../datasource/ConnectorContext';
import { useProjectData } from '../datasource/ProjectDataContext';
import {
  compactDevelopmentFeedback,
  createAnalysisMessages,
  createBrowserAcceptanceMessages,
  createDevelopmentCommitDecisionPackage,
  createImplementationMessages,
  createDevelopmentModelRunId,
  createReviewMessages,
  describeDevelopmentModelRetry,
  developmentModelRouteSha256,
  developmentProviderReadinessSha256,
  extractDevelopmentPatchPaths,
  findDevelopmentAcceptanceGaps,
  findDevelopmentBrowserPlanGaps,
  findDevelopmentReviewGaps,
  formatDevelopmentAcceptanceFeedback,
  isDevelopmentAcceptancePlanFailure,
  mergeDevelopmentContexts,
  parseDevelopmentAgentAction,
  parseDevelopmentAcceptancePlan,
  parseDevelopmentAnalysis,
  rankDevelopmentTestCandidates,
  registerDevelopmentAgentAction,
  requiresDevelopmentBrowserAcceptance,
  reuseDevelopmentAcceptancePlan,
  routeDevelopmentModel,
  runDevelopmentModelWithTransientRetry,
  shouldPrepareDevelopmentProvidersBeforeSession,
  shouldRetryDevelopmentTestForStability,
  selectDevelopmentRepairContextPaths,
  selectDevelopmentUnreadPaths,
  selectDevelopmentEvidenceReuse,
  selectDevelopmentReviewContextPaths,
  selectDevelopmentExecutionStage,
  toDevelopmentTextReplacement,
  type DevelopmentAgentAction,
  type DevelopmentAnalysis,
  type DevelopmentChangeAction,
} from '../lib/developmentMode';
import {
  applyDevelopmentPatch as applyDevelopmentPatchRequest,
  applyDevelopmentTextReplacement as applyDevelopmentTextReplacementRequest,
  applyDevelopmentTextReplacementBatch as applyDevelopmentTextReplacementBatchRequest,
  cancelModelOrchestration,
  createDevelopmentSession,
  fetchDevelopmentDiff as fetchDevelopmentDiffRequest,
  fetchDevelopmentPreset,
  fetchDevelopmentSnapshot as fetchDevelopmentSnapshotRequest,
  finalizeDevelopmentSession as finalizeDevelopmentSessionRequest,
  issueDevelopmentModelCall,
  preflightDevelopmentSession,
  readDevelopmentFiles as readDevelopmentFilesRequest,
  resumeDevelopmentSession,
  runDevelopmentBrowserAcceptance,
  runDevelopmentCommand,
  searchDevelopmentFiles as searchDevelopmentFilesRequest,
  submitDevelopmentReview as submitDevelopmentReviewRequest,
  updateDevelopmentProgress,
  type DevelopmentCommandResult,
  type DevelopmentAcceptancePlan,
  type DevelopmentAcceptanceReceipt,
  type DevelopmentAcceptanceResult,
  type DevelopmentCostPolicy,
  type DevelopmentFileContext,
  type DevelopmentAgentPlan,
  type DevelopmentPreset,
  type DevelopmentSession,
  type DevelopmentSnapshot,
} from '../lib/serverBridge';

interface ActivityItem {
  id: number;
  state: 'working' | 'passed' | 'failed' | 'stopped';
  title: string;
  detail: string;
}

interface Delivery {
  ready: boolean;
  originalHead: string;
  worktreeEvidenceSha256: string;
  changedPaths: string[];
  requiredCommands: string[];
  missingOrFailed: string[];
  browserAcceptance: DevelopmentAcceptanceResult | null;
  browserAcceptanceRequired: boolean;
  browserAcceptancePassed: boolean;
  reviewPassed: boolean;
}

const FALLBACK_PRESET: DevelopmentPreset = {
  schema: 'agenthub.development-preset',
  schemaVersion: 1,
  id: 'local-autonomous-v1',
  label: '本地自主开发',
  isDefault: true,
  authorization: 'one-user-start-per-development-session',
  scope: {
    roots: 'one-explicit-clean-local-git-worktree',
    files: 'read-create-update-delete-within-root',
    commands: ['test', 'build', 'lint', 'typecheck', 'check', 'git-diff-check'],
    browser: 'localhost-only-autonomous-acceptance',
    providers: 'user-configured-memory-only-credentials',
    models: 'deepseek-flash-default-pro-quality-and-retry-escalation',
    agents: 'dynamic-2-4-5-sequential-role-pipeline',
    git: ['status', 'diff', 'diff-check'],
  },
  denied: ['arbitrary-shell', 'git-stage', 'git-commit-without-final-user-decision', 'git-push'],
};

const SCOPE_LABELS = ['单个 Git 工作区', '创建 / 修改 / 删除', 'Node / Python 固定验证', '测试 · 构建 · 浏览器', '2 / 4 / 5 角色顺序流水线', 'DeepSeek：Flash 首轮 · Pro 复审'];
const DENIED_LABELS = ['不开放任意 Shell', '不暂存', '不自动提交', '不推送 / 不碰生产'];
const MAX_IMPLEMENTATION_DISCOVERY_ACTIONS = 1;
const MAX_FORCED_WRITE_REJECTIONS = 2;

function parseYuanMicros(value: string, label: string) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,6})?$/.test(normalized)) {
    throw new Error(`${label}必须为 0.000001-1000 元，最多 6 位小数`);
  }
  const [whole, fraction = ''] = normalized.split('.');
  const micros = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
  if (!Number.isSafeInteger(micros) || micros < 1 || micros > 1_000_000_000) {
    throw new Error(`${label}必须为 0.000001-1000 元`);
  }
  return micros;
}

function formatYuanMicros(value: number) {
  return `¥${(value / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })}`;
}

export interface DevelopmentModeDraft {
  root: string;
  task: string;
  inputRateYuan: string;
  outputRateYuan: string;
  costLimitYuan: string;
  costPolicyConfirmed: boolean;
}

export const DEFAULT_DEVELOPMENT_MODE_DRAFT: DevelopmentModeDraft = {
  root: '',
  task: '',
  inputRateYuan: '1',
  outputRateYuan: '2',
  costLimitYuan: '50',
  costPolicyConfirmed: false,
};

interface DevelopmentModePanelProps {
  onRunningChange?: (running: boolean) => void;
  onOpenConnectors?: () => void;
  draft?: DevelopmentModeDraft;
  onDraftChange?: (draft: DevelopmentModeDraft) => void;
}

async function cancelDetachedDevelopmentRun(serverUrl: string, runId: string) {
  try {
    await cancelModelOrchestration(serverUrl, runId);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '';
    if (!message.includes('不存在')) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 120));
    await cancelModelOrchestration(serverUrl, runId).catch(() => undefined);
  }
}

export function DevelopmentModePanel({
  onRunningChange,
  onOpenConnectors,
  draft: controlledDraft,
  onDraftChange,
}: DevelopmentModePanelProps = {}) {
  const { server, cancelOrchestrationRun } = useProjectData();
  const connectors = useConnectors();
  const { resolveReadyConfig } = connectors;
  const [preset, setPreset] = useState<DevelopmentPreset>(FALLBACK_PRESET);
  const [localDraft, setLocalDraft] = useState<DevelopmentModeDraft>(DEFAULT_DEVELOPMENT_MODE_DRAFT);
  const draft = controlledDraft ?? localDraft;
  const {
    root,
    task,
    inputRateYuan,
    outputRateYuan,
    costLimitYuan,
    costPolicyConfirmed,
  } = draft;
  const updateDraft = (patch: Partial<DevelopmentModeDraft>) => {
    const next = { ...draft, ...patch };
    if (onDraftChange) onDraftChange(next);
    else setLocalDraft(next);
  };
  const [session, setSession] = useState<DevelopmentSession | null>(null);
  const [preflightPlan, setPreflightPlan] = useState<DevelopmentAgentPlan | null>(null);
  const [providerPreparationDeferred, setProviderPreparationDeferred] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [decisionCopyStatus, setDecisionCopyStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [acceptanceEvidence, setAcceptanceEvidence] = useState<DevelopmentAcceptanceResult | null>(null);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const canOpenProviderSettings = Boolean(
    !running
    && onOpenConnectors
    && error
    && (
      error.includes('Provider')
      || error.includes('连接测试')
    ),
  );
  const runAbortRef = useRef<AbortController | null>(null);
  const activeModelRunIdRef = useRef('');
  const providerPreparationRef = useRef<Promise<void> | null>(null);
  const executionAttemptRef = useRef('');
  const executionAttemptSequenceRef = useRef(0);
  const activityIdRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const serviceChangeStopRef = useRef(false);
  const runServiceInstanceIdRef = useRef('');
  const lifecycleServerRef = useRef({
    connected: server.connected,
    url: server.url,
    serviceInstanceId: server.serviceInstanceId,
  });
  const onRunningChangeRef = useRef(onRunningChange);
  onRunningChangeRef.current = onRunningChange;

  function currentRunSignal() {
    return runAbortRef.current?.signal;
  }

  async function copyCommitDecisionPackage() {
    if (!delivery?.ready) return;
    try {
      const payload = createDevelopmentCommitDecisionPackage({
        ready: delivery.ready,
        originalHead: delivery.originalHead,
        worktreeEvidenceSha256: delivery.worktreeEvidenceSha256,
        changedPaths: delivery.changedPaths,
        requiredCommands: delivery.requiredCommands,
        browserAcceptanceRequired: delivery.browserAcceptanceRequired,
        browserAcceptancePassed: delivery.browserAcceptancePassed,
        reviewPassed: delivery.reviewPassed,
      });
      if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持安全剪贴板');
      await navigator.clipboard.writeText(payload);
      setDecisionCopyStatus('success');
    } catch {
      setDecisionCopyStatus('failed');
    }
  }

  function fetchDevelopmentSnapshot(serverUrl: string, sessionId: string) {
    return fetchDevelopmentSnapshotRequest(serverUrl, sessionId, currentRunSignal());
  }

  function fetchDevelopmentDiff(serverUrl: string, sessionId: string) {
    return fetchDevelopmentDiffRequest(serverUrl, sessionId, currentRunSignal());
  }

  function readDevelopmentFiles(serverUrl: string, sessionId: string, paths: string[]) {
    return readDevelopmentFilesRequest(serverUrl, sessionId, paths, currentRunSignal());
  }

  function searchDevelopmentFiles(serverUrl: string, sessionId: string, query: string) {
    return searchDevelopmentFilesRequest(serverUrl, sessionId, query, currentRunSignal());
  }

  function applyDevelopmentPatch(serverUrl: string, input: Parameters<typeof applyDevelopmentPatchRequest>[1]) {
    return applyDevelopmentPatchRequest(serverUrl, input, currentRunSignal());
  }

  function applyDevelopmentTextReplacement(
    serverUrl: string,
    input: Parameters<typeof applyDevelopmentTextReplacementRequest>[1],
  ) {
    return applyDevelopmentTextReplacementRequest(serverUrl, input, currentRunSignal());
  }

  function applyDevelopmentTextReplacementBatch(
    serverUrl: string,
    input: Parameters<typeof applyDevelopmentTextReplacementBatchRequest>[1],
  ) {
    return applyDevelopmentTextReplacementBatchRequest(serverUrl, input, currentRunSignal());
  }

  function submitDevelopmentReview(serverUrl: string, input: Parameters<typeof submitDevelopmentReviewRequest>[1]) {
    return submitDevelopmentReviewRequest(serverUrl, input, currentRunSignal());
  }

  function finalizeDevelopmentSession(serverUrl: string, sessionId: string) {
    return finalizeDevelopmentSessionRequest(serverUrl, sessionId, currentRunSignal());
  }

  useEffect(() => {
    if (!server.connected) return;
    let cancelled = false;
    const controller = new AbortController();
    void fetchDevelopmentPreset(server.url, controller.signal)
      .then((nextPreset) => { if (!cancelled) setPreset(nextPreset); })
      .catch(() => undefined);
    return () => { cancelled = true; controller.abort('server_changed'); };
  }, [server.connected, server.serviceInstanceId, server.url]);

  const providerReady = useMemo(() => {
    const agents = session?.agentPlan.agents ?? preflightPlan?.agents ?? [];
    return agents.length > 0 && agents.every((agentId) => Boolean(resolveReadyConfig(agentId)));
  }, [preflightPlan, resolveReadyConfig, session]);

  function log(state: ActivityItem['state'], title: string, detail: string) {
    activityIdRef.current += 1;
    const activityId = activityIdRef.current;
    setActivity((current) => {
      const settled = [...current];
      if (state !== 'working') {
        let activeIndex = -1;
        for (let index = settled.length - 1; index >= 0; index -= 1) {
          if (settled[index].state !== 'working') continue;
          activeIndex = index;
          break;
        }
        if (activeIndex >= 0) settled[activeIndex] = { ...settled[activeIndex], state };
      }
      return [...settled, { id: activityId, state, title, detail }].slice(-18);
    });
  }

  useEffect(() => {
    const previous = lifecycleServerRef.current;
    const next = {
      connected: server.connected,
      url: server.url,
      serviceInstanceId: server.serviceInstanceId,
    };
    lifecycleServerRef.current = next;
    if (!runAbortRef.current || stopRequestedRef.current) return;
    if (
      previous.connected === next.connected
      && previous.url === next.url
      && previous.serviceInstanceId === next.serviceInstanceId
    ) return;
    const sameUrlReplacement = previous.url === next.url
      && Boolean(previous.serviceInstanceId)
      && Boolean(next.serviceInstanceId)
      && previous.serviceInstanceId !== next.serviceInstanceId;
    serviceChangeStopRef.current = true;
    stopRequestedRef.current = true;
    setStopping(true);
    log('working', '本地服务已变化，正在安全停止', '旧服务上的页面等待与活动模型 run 将被取消；完成独立落账后可重新连接');
    const runId = activeModelRunIdRef.current;
    activeModelRunIdRef.current = '';
    runAbortRef.current.abort('server_changed');
    if (runId && previous.connected && !sameUrlReplacement) {
      void cancelDetachedDevelopmentRun(previous.url, runId);
    }
  }, [server.connected, server.serviceInstanceId, server.url]);

  useEffect(() => () => {
    const controller = runAbortRef.current;
    if (controller && !controller.signal.aborted) {
      stopRequestedRef.current = true;
      const runId = activeModelRunIdRef.current;
      activeModelRunIdRef.current = '';
      controller.abort('panel_unmounted');
      if (runId && lifecycleServerRef.current.connected) {
        void cancelDetachedDevelopmentRun(lifecycleServerRef.current.url, runId);
      }
    }
    onRunningChangeRef.current?.(false);
  }, []);

  function stopIfRequested() {
    if (stopRequestedRef.current) throw new DOMException('用户请求安全停止', 'AbortError');
  }

  async function waitForConnectedLifecycleServer(signal: AbortSignal) {
    while (true) {
      const current = lifecycleServerRef.current;
      if (current.connected && current.url && current.serviceInstanceId) return current;
      await new Promise<void>((resolve, reject) => {
        const timer = globalThis.setTimeout(settle, 100);
        const onAbort = () => settle(signal.reason instanceof Error
          ? signal.reason
          : new DOMException('等待本地服务恢复已取消', 'AbortError'));
        function settle(reason?: Error) {
          globalThis.clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          if (reason) reject(reason);
          else resolve();
        }
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
      });
    }
  }

  async function ensureDevelopmentProviders(
    agentIds: string[],
    stage: 'before-session' | 'model-call',
  ) {
    if (agentIds.every((agentId) => Boolean(resolveReadyConfig(agentId)))) return;
    const pending = providerPreparationRef.current;
    if (pending) {
      await pending;
      if (agentIds.every((agentId) => Boolean(resolveReadyConfig(agentId)))) return;
      if (providerPreparationRef.current === pending) providerPreparationRef.current = null;
    }
    const preparation = (async () => {
      if (stage === 'model-call') setProviderPreparationDeferred(false);
      log(
        'working',
        '自动准备 Provider',
        stage === 'before-session'
          ? '新会话将在创建前测试动态编队实际需要的内存配置；同一 Provider 只调用一次'
          : '恢复证据已确认需要模型；现在才测试动态编队实际需要的内存配置',
      );
      const readiness = await connectors.ensureAgentProviders(agentIds, {
        signal: runAbortRef.current?.signal,
        onActiveRunId: (runId) => { activeModelRunIdRef.current = runId; },
      });
      stopIfRequested();
      if (readiness.testedKinds.length) {
        log('passed', 'Provider 自动就绪', `${readiness.testedKinds.join('、')} · 动态编队所需配置已通过测试`);
      }
      if (readiness.ambiguousKinds.length) {
        throw new Error(`已加载多个未绑定 Provider：${readiness.ambiguousKinds.join('、')}；请显式选择统一 Provider，系统不会替你猜测`);
      }
      if (readiness.missingAgents.length) {
        const failed = readiness.failedKinds.length ? `；未就绪：${readiness.failedKinds.join('、')}` : '';
        const stopSummary = stage === 'before-session'
          ? readiness.testedKinds.length || readiness.failedKinds.length
            ? '未写入开发会话，未开始任务调用'
            : '未写入会话且未调用模型'
          : '既有会话已安全保留，未开始本次任务模型调用';
        throw new Error(`以下 Agent 缺少已测试 Provider：${readiness.missingAgents.join('、')}${failed}；${stopSummary}`);
      }
    })();
    providerPreparationRef.current = preparation;
    try {
      await preparation;
    } finally {
      if (providerPreparationRef.current === preparation) providerPreparationRef.current = null;
    }
  }

  async function requestSafeStop() {
    if (!running || stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    setStopping(true);
    log('working', '正在安全停止', '活动模型调用将立即取消；已启动的固定操作会在当前有界步骤收束后停止');
    const runId = activeModelRunIdRef.current;
    runAbortRef.current?.abort('user_stop');
    let cancelError = runId ? await cancelOrchestrationRun(runId) : null;
    if (runId && cancelError?.includes('不存在')) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      cancelError = await cancelOrchestrationRun(runId);
    }
    if (cancelError && !cancelError.includes('不存在') && !cancelError.includes('已完成')) {
      log('failed', '模型取消回执未确认', `${cancelError}；客户端已中止，后续开发步骤不会继续`);
    }
  }

  async function start() {
    if (running) return;
    setError('');
    setDelivery(null);
    setDecisionCopyStatus('idle');
    setAcceptanceEvidence(null);
    setActivity([]);
    if (!server.connected) return setError('请先连接本地 AgentHub 服务。');
    if (!root.trim()) return setError('请提供一个本地 Git 工作树根目录。');
    if (!task.trim()) return setError('请写明这次要解决的问题。');
    setSession(null);
    setPreflightPlan(null);
    setProviderPreparationDeferred(false);
    stopRequestedRef.current = false;
    serviceChangeStopRef.current = false;
    runServiceInstanceIdRef.current = server.serviceInstanceId;
    activeModelRunIdRef.current = '';
    executionAttemptSequenceRef.current += 1;
    executionAttemptRef.current = `${Date.now().toString(36)}-${executionAttemptSequenceRef.current.toString(36)}`;
    runAbortRef.current = new AbortController();
    setStopping(false);
    setRunning(true);
    onRunningChange?.(true);
    let activeSession: DevelopmentSession | null = null;
    let executionStarted = false;
    let newSessionCostPolicy: DevelopmentCostPolicy | null = null;
    try {
      log('working', '启动预检', '只读校验 Git 根、动态编队与项目验证能力；尚不创建会话');
      const preflight = await preflightDevelopmentSession(server.url, {
        root: root.trim(),
        task: task.trim(),
        presetId: preset.id,
      }, currentRunSignal());
      stopIfRequested();
      setPreflightPlan(preflight.agentPlan);
      setProviderPreparationDeferred(preflight.mode === 'resume');
      const reopening = preflight.mode === 'reopen';
      const resuming = preflight.mode === 'resume';
      const resumable = resuming || reopening ? preflight.resume : null;
      if (!resumable) {
        if (!costPolicyConfirmed) {
          throw new Error('新会话开始前，请确认输入费率、输出费率与人民币费用硬上限。');
        }
        newSessionCostPolicy = {
          currency: 'CNY',
          inputMicrosPerMillionTokens: parseYuanMicros(inputRateYuan, '输入费率'),
          outputMicrosPerMillionTokens: parseYuanMicros(outputRateYuan, '输出费率'),
          maxCostMicros: parseYuanMicros(costLimitYuan, '费用硬上限'),
        };
      }
      const startMode = reopening ? '恢复交付' : resumable ? '自动续跑' : '新会话';
      log('passed', '启动预检通过', `${preflight.rootName} · ${preflight.agentPlan.size} Agent · ${preflight.packageManager} · ${startMode}`);
      if (shouldPrepareDevelopmentProvidersBeforeSession(preflight.mode)) {
        await ensureDevelopmentProviders(preflight.agentPlan.agents, 'before-session');
      }
      stopIfRequested();
      if (resumable) {
        log(
          'working',
          reopening ? '恢复已验收交付' : '恢复中断会话',
          '重新校验根指纹、HEAD、任务哈希与最后受控工作树状态',
        );
        activeSession = await resumeDevelopmentSession(server.url, {
          sessionId: resumable.sessionId,
          root: root.trim(),
          task: task.trim(),
        }, currentRunSignal());
        log(
          'passed',
          reopening ? '已验收会话已绑定' : '中断会话已恢复',
          `${activeSession.rootName} · ${activeSession.phase} · ${reopening ? '核对最终回执' : '继续自主执行'}`,
        );
      } else {
        log('working', '绑定工作区', 'Provider 已就绪；再次校验 Git 状态并建立会话级脱敏账本');
        activeSession = await createDevelopmentSession(
          server.url,
          {
            root: root.trim(),
            task: task.trim(),
            presetId: preset.id,
            costPolicy: newSessionCostPolicy!,
          },
          runAbortRef.current?.signal,
        );
        log('passed', '自主预设已生效', `${activeSession.rootName} · ${activeSession.agentPlan.size} 角色顺序流水线`);
      }
      if (!activeSession) throw new Error('开发会话未能建立或恢复，已安全停止');
      executionStarted = !reopening;
      stopIfRequested();
      setPreflightPlan(null);
      setSession(activeSession);
      if (reopening) {
        const finalized = await finalizeDevelopmentSession(server.url, activeSession.sessionId);
        stopIfRequested();
        if (!finalized.ready) throw new Error('已验收交付证据与当前工作树不再一致，已拒绝恢复');
        setSession(finalized.session);
        setDelivery(deliveryFromFinalized(finalized));
        log('passed', '最终交付已恢复', `${finalized.changedPaths.length} 个变更路径 · 无需重新加载 Key 或调用模型`);
        return;
      }
      const result = await runDevelopment(activeSession, task.trim());
      setSession(result.session);
      setDelivery(result.delivery);
    } catch (reason) {
      if (activeSession && executionStarted) {
        try {
          const failedSignal = AbortSignal.timeout(5_000);
          let failedServerUrl = server.url;
          let rebound = false;
          if (serviceChangeStopRef.current) {
            const recoveredServer = await waitForConnectedLifecycleServer(failedSignal);
            failedServerUrl = recoveredServer.url;
            if (recoveredServer.serviceInstanceId !== runServiceInstanceIdRef.current) {
              await resumeDevelopmentSession(failedServerUrl, {
                sessionId: activeSession.sessionId,
                root: root.trim(),
                task: task.trim(),
              }, failedSignal);
              rebound = true;
            }
          }
          let failedSession;
          try {
            failedSession = await updateDevelopmentProgress(
              failedServerUrl,
              activeSession.sessionId,
              'failed',
              failedSignal,
            );
          } catch (failureReason) {
            const failureMessage = failureReason instanceof Error ? failureReason.message : '';
            if (failureMessage !== '开发会话尚未绑定工作区；请先恢复该会话') throw failureReason;
            await resumeDevelopmentSession(failedServerUrl, {
              sessionId: activeSession.sessionId,
              root: root.trim(),
              task: task.trim(),
            }, failedSignal);
            rebound = true;
            failedSession = await updateDevelopmentProgress(
              failedServerUrl,
              activeSession.sessionId,
              'failed',
              failedSignal,
            );
          }
          if (rebound) log('passed', '服务重启后的会话已重新绑定', '根指纹、HEAD、任务哈希与工作树状态一致；failed 现场已继续落账');
          setSession(failedSession);
        } catch {
          // The visible error below remains the source of truth if the local service disappeared.
        }
      }
      if (stopRequestedRef.current) {
        setError('');
        log('stopped', '已安全停止并保留现场', '再次点击“开始独立开发”会校验同一任务与工作树，并从当前受控状态精确续跑');
      } else {
        const message = reason instanceof Error ? reason.message : '独立开发执行失败';
        setError(message);
        log('failed', '本阶段已停止', message);
      }
    } finally {
      runAbortRef.current = null;
      activeModelRunIdRef.current = '';
      stopRequestedRef.current = false;
      setStopping(false);
      setRunning(false);
      onRunningChange?.(false);
      serviceChangeStopRef.current = false;
      runServiceInstanceIdRef.current = '';
      setProviderPreparationDeferred(false);
    }
  }

  async function runDevelopment(initialSession: DevelopmentSession, userTask: string) {
    let currentSession = initialSession;
    let snapshot = await fetchDevelopmentSnapshot(server.url, currentSession.sessionId);
    stopIfRequested();
    currentSession = snapshot.session;
    const executionStage = selectDevelopmentExecutionStage(initialSession, snapshot.gitStatus);
    let analysis = defaultAnalysis(snapshot);
    let contexts = snapshot.seedFiles;
    if (executionStage === 'verify') {
      const resumeDiff = await fetchDevelopmentDiff(server.url, currentSession.sessionId);
      const resumePaths = [...new Set([
        ...extractDevelopmentPatchPaths(resumeDiff.diff),
        ...resumeDiff.newFiles.map((item) => item.path),
      ])].filter((item) => snapshot.files.includes(item)).slice(0, 12);
      analysis = {
        relevantPaths: resumePaths,
        plan: ['复用已应用的受控变更', '重新运行全部固定验证', '独立审查并仅修复证据问题'],
        risks: ['恢复路径不重复生成初始实现；验证或复审失败仍进入有界修复'],
      };
      contexts = mergeDevelopmentContexts(contexts, resumeDiff.newFiles);
      if (resumePaths.length) {
        contexts = mergeDevelopmentContexts(
          contexts,
          (await readDevelopmentFiles(server.url, currentSession.sessionId, resumePaths)).files,
        );
      }
      setSession(currentSession);
      log('passed', '按受控证据续跑', `${currentSession.changeSetCount} 个变更事务 · 跳过重复分析与实现 · 重新运行验证与独立复审`);
    } else {
      currentSession = await updateDevelopmentProgress(
        server.url,
        initialSession.sessionId,
        'analyzing',
        currentRunSignal(),
      );
      setSession(currentSession);
      log('working', '分析项目', '读取 Git 快照、入口文档和可用验证脚本');
      const plannedAnalysts = currentSession.agentPlan.agents.filter((item) => item === 'AG-COORD' || item === 'PRO');
      const analysts = plannedAnalysts.length ? plannedAnalysts : ['AG-DEV'];
      for (const agentId of analysts) {
        stopIfRequested();
        const text = await callAgent(agentId, createAnalysisMessages(userTask, snapshot, agentId), currentSession, `analysis-${agentId}`, 1_200);
        analysis = mergeAnalysis(analysis, parseDevelopmentAnalysis(text, snapshot.files));
      }
      log('passed', '实现路径已收敛', `${analysis.plan.length || 1} 个步骤 · ${analysis.relevantPaths.length} 个候选上下文`);

      if (analysis.relevantPaths.length) {
        const extra = await readDevelopmentFiles(server.url, currentSession.sessionId, analysis.relevantPaths);
        contexts = mergeDevelopmentContexts(contexts, extra.files);
      }

      currentSession = await updateDevelopmentProgress(
        server.url,
        currentSession.sessionId,
        'editing',
        currentRunSignal(),
      );
      setSession(currentSession);
      let searchMatches: string[] = [];
      let currentDiff = '';
      let applied = 0;
      let formatRejectsAfterChange = 0;
      let discoveryActionsWithoutChange = 0;
      let forcedWriteRejections = 0;
      let writeActionRequired = false;
      let implementationComplete = false;
      const actionSignatures = new Set<string>();
      const rejectDiscoveryAction = (feedback: string, title: string, detail: string) => {
        forcedWriteRejections += 1;
        writeActionRequired = true;
        searchMatches = [feedback];
        log('failed', title, detail);
        if (forcedWriteRejections < MAX_FORCED_WRITE_REJECTIONS) return false;
        if (applied > 0) {
          log('passed', '实现转入验证', '已有有效变更；AG-DEV 仍重复请求上下文，停止继续调用并交给测试与独立复审');
          implementationComplete = true;
          return true;
        }
        throw new Error('AG-DEV 在上下文发现预算耗尽后仍未返回代码变更，已提前停止以避免继续消耗 Provider');
      };
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        stopIfRequested();
        log('working', 'AG-DEV 实现', `自主动作 ${attempt}/10`);
        let text: string;
        try {
          text = await callAgent(
            'AG-DEV',
            createImplementationMessages({
              task: userTask,
              analysis,
              files: contexts,
              availablePaths: snapshot.files,
              searchMatches,
              currentDiff,
              discoveryActionsRemaining: MAX_IMPLEMENTATION_DISCOVERY_ACTIONS - discoveryActionsWithoutChange,
              writeActionRequired,
              attempt,
            }),
            currentSession,
            `implement-${attempt}`,
            1_800,
          );
        } catch (reason) {
          const rejection = reason instanceof Error ? reason.message : 'Provider 调用失败';
          if (!rejection.includes('8000 字符上限')) throw reason;
          searchMatches = ['OUTPUT_REJECTED: 输出超过本地 8000 字符上限。只返回一个有界动作或 2-4 项 batch；diff 不得重写整个文件。'];
          writeActionRequired = true;
          log('failed', '过大输出已拒绝', 'AG-DEV 将缩小为单个最小动作；工作树未发生变化');
          if (attempt === 10) throw new Error('AG-DEV 连续输出过大，10 个动作内未收敛');
          continue;
        }
        let action;
        try {
          action = parseDevelopmentAgentAction(text);
        } catch (reason) {
          const rejection = reason instanceof Error ? reason.message : '动作格式不符合协议';
          if (applied > 0 && (++formatRejectsAfterChange >= 2 || attempt === 10)) {
            log('passed', '实现转入验证', '代码已产生变更；动作格式或预算已收敛到验证门禁，由测试与独立审查判断完整性');
            implementationComplete = true;
            break;
          }
          searchMatches = [`ACTION_FORMAT_REJECTED: ${rejection.slice(0, 600)}。响应可能被截断；跨 5 个及以上文件必须拆成多轮，长 oldText/newText 每轮只返回一个最小 insert/replace，并保证 JSON 完整闭合。`];
          writeActionRequired = true;
          log('failed', 'Agent 动作格式已拒绝', 'AG-DEV 将按固定协议自行纠正；工作树未发生额外变化');
          if (attempt === 10) throw new Error(`Agent 动作格式连续未收敛：${rejection}`);
          continue;
        }
        formatRejectsAfterChange = 0;
        if (action.action === 'read') {
          if (writeActionRequired) {
            if (rejectDiscoveryAction(
              'WRITE_ACTION_REQUIRED: 已提供足够上下文或上一动作仅需格式纠正；下一步严禁 read/search，必须返回一个完整闭合的最小代码变更或客观 blocked。',
              '已强制收敛到代码变更',
              '未继续读取；AG-DEV 必须保持原编辑意图并返回最小 insert/replace/batch/diff',
            )) break;
            continue;
          }
          const allowed = action.paths.filter((item) => snapshot.files.includes(item));
          if (!allowed.length) {
            if (rejectDiscoveryAction(
              'READ_REJECTED: 请求路径不在当前 Git 文件清单；下一步必须从 availablePaths 选择，或直接基于已有上下文修改。',
              '无效读取请求已拒绝',
              '路径不存在；AG-DEV 必须基于真实文件清单收敛，不读取根外内容',
            )) break;
            continue;
          }
          const unread = selectDevelopmentUnreadPaths(allowed, snapshot.files, contexts);
          if (!unread.length) {
            if (rejectDiscoveryAction(
              'READ_ALREADY_AVAILABLE: 请求正文已在 files 中；下一步严禁继续 read/search，必须返回代码变更或客观 blocked。',
              '重复上下文读取已拦截',
              '目标正文已提供；未重复读取，AG-DEV 必须直接形成最小变更',
            )) break;
            continue;
          }
          if (discoveryActionsWithoutChange >= MAX_IMPLEMENTATION_DISCOVERY_ACTIONS) {
            if (rejectDiscoveryAction(
              'DISCOVERY_BUDGET_EXHAUSTED: read/search 硬预算已耗尽；下一步严禁继续发现动作，必须返回代码变更或客观 blocked。',
              '上下文发现预算已耗尽',
              '未继续读取；AG-DEV 必须使用已有 files/searchMatches 形成最小变更',
            )) break;
            continue;
          }
          registerDevelopmentAgentAction(action, actionSignatures);
          contexts = mergeDevelopmentContexts(
            contexts,
            (await readDevelopmentFiles(server.url, currentSession.sessionId, unread)).files,
          );
          discoveryActionsWithoutChange += 1;
          forcedWriteRejections = 0;
          writeActionRequired = true;
          searchMatches = [];
          continue;
        }
        if (action.action === 'search') {
          if (writeActionRequired) {
            if (rejectDiscoveryAction(
              'WRITE_ACTION_REQUIRED: 已提供足够上下文或上一动作仅需格式纠正；下一步严禁 read/search，必须返回一个完整闭合的最小代码变更或客观 blocked。',
              '已强制收敛到代码变更',
              '未继续搜索；AG-DEV 必须保持原编辑意图并返回最小 insert/replace/batch/diff',
            )) break;
            continue;
          }
          if (discoveryActionsWithoutChange >= MAX_IMPLEMENTATION_DISCOVERY_ACTIONS) {
            if (rejectDiscoveryAction(
              'DISCOVERY_BUDGET_EXHAUSTED: read/search 硬预算已耗尽；下一步严禁继续发现动作，必须返回代码变更或客观 blocked。',
              '上下文发现预算已耗尽',
              '未继续搜索；AG-DEV 必须使用已有 files/searchMatches 形成最小变更',
            )) break;
            continue;
          }
          if (registerDevelopmentAgentAction(action, actionSignatures)) {
            if (rejectDiscoveryAction(
              'DISCOVERY_ACTION_REPEATED: 相同 search 已执行；下一步严禁重复发现动作，必须返回代码变更或客观 blocked。',
              '重复无进展搜索已拦截',
              '相同搜索未重复执行；AG-DEV 必须基于已有结果形成最小变更',
            )) break;
            continue;
          }
          searchMatches = (await searchDevelopmentFiles(server.url, currentSession.sessionId, action.query)).matches;
          discoveryActionsWithoutChange += 1;
          forcedWriteRejections = 0;
          writeActionRequired = true;
          continue;
        }
        if (registerDevelopmentAgentAction(action, actionSignatures)) {
          searchMatches = duplicateDevelopmentActionFeedback(action);
          writeActionRequired = true;
          log('failed', '重复无进展动作已拦截', `${action.action} 未重复执行；AG-DEV 必须基于已有上下文换用下一步动作`);
          if (attempt === 10) throw new Error('AG-DEV 重复同一无进展动作，10 个动作内未收敛');
          continue;
        }
        if (action.action === 'blocked') throw new Error(action.reason);
        if (action.action === 'complete') {
          if (!applied) throw new Error('Agent 在未产生任何代码变更时宣告完成');
          log('passed', '实现完成', action.summary);
          implementationComplete = true;
          break;
        }
        const changePaths = developmentChangePaths(action);
        let result;
        try {
          result = await applyAgentChange(
            currentSession,
            `${currentSession.sessionId}:${currentSession.changeSetCount}:implementation:${attempt}`,
            action,
          );
        } catch (reason) {
          const rejection = reason instanceof Error ? reason.message : '变更校验失败';
          const refreshPaths = changePaths.filter((item) => snapshot.files.includes(item));
          if (refreshPaths.length) {
            contexts = mergeDevelopmentContexts(
              contexts,
              (await readDevelopmentFiles(server.url, currentSession.sessionId, refreshPaths)).files,
            );
          }
          searchMatches = [
            `CHANGE_REJECTED: ${rejection.slice(0, 1_200)}`,
            refreshPaths.length ? `CHANGE_TARGETS_REFRESHED: ${refreshPaths.join(', ')}` : 'CHANGE_TARGETS_REFRESHED: none',
          ];
          writeActionRequired = true;
          const detail = rejection.replace(/\s+/g, ' ').slice(0, 260);
          log('failed', '变更被安全拒绝', refreshPaths.length
            ? `已刷新真实目标文件；拒绝原因：${detail}`
            : `工作树未变化；拒绝原因：${detail}`);
          if (attempt === 10) throw new Error(`变更连续未收敛：${rejection}`);
          continue;
        }
        applied += 1;
        actionSignatures.clear();
        discoveryActionsWithoutChange = 0;
        forcedWriteRejections = 0;
        writeActionRequired = false;
        currentSession = result.session;
        setSession(currentSession);
        currentDiff = (await fetchDevelopmentDiff(server.url, currentSession.sessionId)).diff;
        snapshot = await fetchDevelopmentSnapshot(server.url, currentSession.sessionId);
        const appliedPaths = changePaths.filter((item) => snapshot.files.includes(item));
        if (appliedPaths.length) {
          contexts = mergeDevelopmentContexts(
            contexts,
            (await readDevelopmentFiles(server.url, currentSession.sessionId, appliedPaths)).files,
          );
        }
        searchMatches = [];
        log('passed', '变更事务已应用', `${result.fileCount} 个文件 · ${result.patchSha256.slice(0, 12)}`);
        if (attempt === 10) {
          log('passed', '实现转入验证', '自主动作预算已用完且已有有效变更；不继续生成代码，转入测试与独立审查');
          implementationComplete = true;
          break;
        }
      }
      if (!implementationComplete && applied > 0) {
        log('passed', '实现转入验证', '已有有效变更；由后续测试与独立审查决定是否需要修复');
        implementationComplete = true;
      }
      if (!implementationComplete) throw new Error('AG-DEV 超过 10 个自主动作且未产生有效变更');
    }

    stopIfRequested();
    let commandResults = await verifyAndRepair(currentSession, userTask, analysis, contexts, snapshot);
    currentSession = commandResults.session;
    let browserPlan: DevelopmentAcceptancePlan | null = null;
    let browserVerification = await verifyBrowserAndRepair(
      currentSession,
      userTask,
      analysis,
      contexts,
      snapshot,
      commandResults.results,
    );
    browserPlan = browserVerification.plan;
    currentSession = browserVerification.session;
    contexts = browserVerification.contexts;
    snapshot = browserVerification.snapshot;
    commandResults = { session: currentSession, results: browserVerification.commandResults };
    let browserAcceptance = browserVerification.result;
    let browserReviewAcceptance = browserVerification.reviewAcceptance;
    setSession(currentSession);

    currentSession = await updateDevelopmentProgress(
      server.url,
      currentSession.sessionId,
      'reviewing',
      currentRunSignal(),
    );
    setSession(currentSession);
    const reviewEvidence = selectDevelopmentEvidenceReuse(
      currentSession,
      [...snapshot.scripts.filter((item) => ['test', 'build', 'lint', 'typecheck', 'check'].includes(item)), 'git-diff-check'],
      snapshot.worktreeStateSha256,
      browserVerification.browserRequired,
    );
    if (reviewEvidence.review) {
      log(
        'passed',
        '独立审查证据已复用',
        `${reviewEvidence.reviews.map((entry) => entry.agentId).join(' + ')} · H0/M0 · 工作树哈希未变`,
      );
      return finalizeDevelopmentDelivery(currentSession, browserAcceptance);
    }
    if (!currentSession.agentPlan.agents.includes('AG-REVIEW')) {
      throw new Error('旧单角色会话只能形成同角色自审，不能用于正式交付；请新建开发会话以启用独立复审');
    }
    const reviewers: Array<'AG-SEC' | 'AG-REVIEW'> = currentSession.agentPlan.agents.includes('AG-SEC')
      ? ['AG-SEC', 'AG-REVIEW']
      : ['AG-REVIEW'];
    const reusableReviewerIds = new Set(reviewEvidence.reviews.map((entry) => entry.agentId));
    let reviewerIndex = reviewers.findIndex((reviewer) => !reusableReviewerIds.has(reviewer));
    if (reviewerIndex < 0) reviewerIndex = reviewers.length - 1;
    if (reviewerIndex > 0) {
      log('passed', '独立安全审查证据已复用', 'AG-SEC · H0/M0 · 当前工作树与验证顺序未变');
    }
    let reviewCycle = 1;
    while (reviewerIndex < reviewers.length) {
      const reviewer = reviewers[reviewerIndex];
      const reviewLabel = reviewer === 'AG-SEC' ? '独立安全审查' : '独立质量复审';
      const initialReviewDiff = await fetchDevelopmentDiff(server.url, currentSession.sessionId);
      const reviewContextPaths = selectDevelopmentReviewContextPaths(
        extractDevelopmentPatchPaths(initialReviewDiff.diff),
        initialReviewDiff.newFiles.map((item) => item.path),
        snapshot.files,
      );
      let reviewContexts: DevelopmentFileContext[] = reviewContextPaths.length
        ? (await readDevelopmentFiles(server.url, currentSession.sessionId, reviewContextPaths)).files
        : [];
      if (reviewContextPaths.length) {
        log('passed', `${reviewLabel}上下文已预装`, `${reviewContextPaths.length} 个最新变更文件 · 不消耗模型读取动作`);
      }
      const initialReviewGaps = findDevelopmentReviewGaps(
        userTask,
        initialReviewDiff.diff,
        mergeDevelopmentContexts(contexts, [...reviewContexts, ...initialReviewDiff.newFiles]),
      );
      let reviewFeedback = initialReviewGaps.map((item) => `REVIEW_PRECHECK_REJECTED: ${item}`);
      if (initialReviewGaps.length) {
        log('failed', '确定性审查预检发现缺口', initialReviewGaps.join('；'));
      }
      let reviewPassed = false;
      let reviewerChangedSource = false;
      const reviewActionSignatures = new Set<string>();
      for (let reviewAttempt = 1; reviewAttempt <= 7; reviewAttempt += 1) {
        stopIfRequested();
        const diff = reviewAttempt === 1
          ? initialReviewDiff
          : await fetchDevelopmentDiff(server.url, currentSession.sessionId);
        const reviewFiles = mergeDevelopmentContexts(contexts, [...reviewContexts, ...diff.newFiles]);
        log('working', `${reviewer} ${reviewLabel}`, `顺序复审第 ${reviewCycle} 轮 · 门禁动作 ${reviewAttempt}/7`);
        const reviewStage = `review-${reviewer.toLowerCase()}-${reviewCycle}-${reviewAttempt}`;
        let reviewModel = '';
        let reviewText: string;
        try {
          reviewText = await callAgent(
            reviewer,
            createReviewMessages({
              task: userTask,
              diff: diff.diff,
              newFiles: reviewFiles,
              availablePaths: snapshot.files,
              commandResults: commandResults.results,
              browserAcceptance: browserReviewAcceptance,
              feedback: reviewFeedback,
              agentId: reviewer,
            }),
            currentSession,
            reviewStage,
            1_600,
            (model) => { reviewModel = model; },
          );
        } catch (reason) {
          const rejection = reason instanceof Error ? reason.message : 'Provider 调用失败';
          if (!rejection.includes('8000 字符上限')) throw reason;
          reviewFeedback = ['OUTPUT_REJECTED: 输出超过本地 8000 字符上限。只返回最小修复 diff 或 complete JSON。'];
          log('failed', '审查过大输出已拒绝', '审查 Agent 将缩小输出；现有工作树保持不动');
          if (reviewAttempt === 7) throw new Error(`${reviewer} 连续输出过大，七轮内未收敛`);
          continue;
        }
        let action;
        try {
          action = parseDevelopmentAgentAction(reviewText);
        } catch (reason) {
          const rejection = reason instanceof Error ? reason.message : '审查动作格式不符合协议';
          reviewFeedback = [`ACTION_FORMAT_REJECTED: ${rejection.slice(0, 600)}。只返回 read、最小 insert/replace/batch/diff 或 complete JSON。`];
          log('failed', '审查动作格式已拒绝', '审查 Agent 将按固定协议自行纠正；现有变更保持不动');
          if (reviewAttempt === 7) throw new Error(`${reviewer} 未能在七轮内给出可执行审查动作`);
          continue;
        }
        if (registerDevelopmentAgentAction(action, reviewActionSignatures)) {
          reviewFeedback = duplicateDevelopmentActionFeedback(action);
          log('failed', '审查重复动作已拦截', `${action.action} 未重复执行；审查 Agent 必须基于已有证据继续`);
          if (reviewAttempt === 7) throw new Error(`${reviewer} 重复同一无进展动作，七轮内未收敛`);
          continue;
        }
        if (action.action === 'complete') {
          const reviewGaps = findDevelopmentReviewGaps(userTask, diff.diff, reviewFiles);
          if (reviewGaps.length) {
            reviewFeedback = reviewGaps.map((item) => `REVIEW_PRECHECK_REJECTED: ${item}`);
            log('failed', '确定性审查预检未通过', reviewGaps.join('；'));
            if (reviewAttempt === 7) throw new Error(`确定性审查预检未通过：${reviewGaps.join('；')}`);
            continue;
          }
          const acceptanceGaps = findDevelopmentAcceptanceGaps(userTask, [
            ...extractDevelopmentPatchPaths(diff.diff),
            ...diff.newFiles.map((item) => item.path),
          ]);
          if (acceptanceGaps.length) {
            const testCandidates = rankDevelopmentTestCandidates(userTask, snapshot.files);
            if (testCandidates.length) {
              reviewContexts = mergeDevelopmentContexts(
                reviewContexts,
                (await readDevelopmentFiles(server.url, currentSession.sessionId, [...testCandidates].reverse())).files,
              );
            }
            reviewFeedback = [
              ...acceptanceGaps.map((item) => `ACCEPTANCE_REJECTED: ${item}`),
              `TEST_PATH_CANDIDATES: ${testCandidates.join(', ') || 'none'}。必须实际修改匹配任务的测试路径，不得再次只改源文件。`,
            ];
            log('failed', '确定性验收未通过', acceptanceGaps.join('；'));
            if (reviewAttempt === 7) throw new Error(`确定性验收未通过：${acceptanceGaps.join('；')}`);
            continue;
          }
          if (!/FINDINGS:H0\/M0\/L\d+/.test(action.summary) || !/GATE:PASS/.test(action.summary)) {
            throw new Error(`${reviewer} 未给出 H0/M0 且 GATE:PASS 的最终门禁`);
          }
          const submitted = await submitDevelopmentReview(server.url, {
            sessionId: currentSession.sessionId,
            reviewId: `${currentSession.sessionId}:review:${reviewer.toLowerCase()}:${currentSession.changeSetCount}:${reviewCycle}:${reviewAttempt}`,
            agentId: reviewer,
            modelId: reviewModel,
            summary: action.summary,
          });
          currentSession = submitted.session;
          setSession(currentSession);
          log('passed', `${reviewer} ${reviewLabel}通过`, action.summary);
          reviewPassed = true;
          break;
        }
        if (action.action === 'blocked') throw new Error(action.reason);
        if (action.action === 'read') {
          const allowed = action.paths.filter((item) => snapshot.files.includes(item));
          if (!allowed.length) {
            log('failed', '审查读取请求已拒绝', '路径不存在；审查 Agent 将基于真实文件清单重新选择');
            reviewFeedback = [`READ_REJECTED: ${action.paths.join(', ')} 不在当前 Git 文件清单。`];
            if (reviewAttempt === 7) throw new Error(`${reviewer} 连续请求不存在的审查文件`);
            continue;
          }
          reviewContexts = mergeDevelopmentContexts(
            reviewContexts,
            (await readDevelopmentFiles(server.url, currentSession.sessionId, allowed)).files,
          );
          reviewFeedback = [];
          continue;
        }
        if (!isDevelopmentChangeAction(action)) throw new Error(`${reviewer} 审查未能在七轮门禁内收敛`);
        const changePaths = developmentChangePaths(action);
        let repaired;
        try {
          repaired = await applyAgentChange(
            currentSession,
            `${currentSession.sessionId}:${currentSession.changeSetCount}:review-fix:${reviewAttempt}`,
            action,
          );
        } catch (reason) {
          const rejection = reason instanceof Error ? reason.message : '审查变更校验失败';
          const refreshPaths = changePaths.filter((item) => snapshot.files.includes(item));
          if (refreshPaths.length) {
            reviewContexts = mergeDevelopmentContexts(
              reviewContexts,
              (await readDevelopmentFiles(server.url, currentSession.sessionId, refreshPaths)).files,
            );
          }
          reviewFeedback = [`CHANGE_REJECTED: ${rejection.slice(0, 1_200)}`];
          log('failed', '审查修复变更已拒绝', '已保留工作树并刷新真实上下文；审查 Agent 将自行纠正');
          if (reviewAttempt === 7) throw new Error(`${reviewer} 审查修复变更未能收敛`);
          continue;
        }
        currentSession = repaired.session;
        reviewerChangedSource = true;
        reviewActionSignatures.clear();
        setSession(currentSession);
        reviewFeedback = [];
        log('passed', '审查修复已应用', `${repaired.fileCount} 个文件；重新执行全部验证`);
        snapshot = await fetchDevelopmentSnapshot(server.url, currentSession.sessionId);
        const refreshedChangePaths = changePaths.filter((item) => snapshot.files.includes(item));
        if (refreshedChangePaths.length) {
          reviewContexts = mergeDevelopmentContexts(
            reviewContexts,
            (await readDevelopmentFiles(server.url, currentSession.sessionId, refreshedChangePaths)).files,
          );
        }
        commandResults = await verifyAndRepair(currentSession, userTask, analysis, contexts, snapshot);
        currentSession = commandResults.session;
        browserVerification = await verifyBrowserAndRepair(
          currentSession,
          userTask,
          analysis,
          contexts,
          snapshot,
          commandResults.results,
          true,
          2,
          browserPlan,
        );
        browserPlan = browserVerification.plan;
        currentSession = browserVerification.session;
        contexts = browserVerification.contexts;
        snapshot = browserVerification.snapshot;
        commandResults = { session: currentSession, results: browserVerification.commandResults };
        browserAcceptance = browserVerification.result;
        browserReviewAcceptance = browserVerification.reviewAcceptance;
        if (reviewAttempt === 7) throw new Error('独立审查修复七轮后仍未给出通过结论');
      }
      if (!reviewPassed) throw new Error('独立审查未给出 H0/M0 与 GATE:PASS，已安全停止');
      if (reviewerChangedSource && reviewerIndex > 0) {
        if (reviewCycle >= 3) throw new Error('后置质量复审连续改变源码，三轮顺序复审内未收敛');
        reviewCycle += 1;
        reviewerIndex = 0;
        log('working', '安全复审证据需要刷新', '后置质量复审改变了源码；重新执行 AG-SEC → AG-REVIEW 顺序门禁');
        continue;
      }
      reviewerIndex += 1;
    }

    return finalizeDevelopmentDelivery(currentSession, browserAcceptance);
  }

  async function finalizeDevelopmentDelivery(
    active: DevelopmentSession,
    browserAcceptance: DevelopmentAcceptanceResult | null,
  ) {
    stopIfRequested();
    const finalized = await finalizeDevelopmentSession(server.url, active.sessionId);
    stopIfRequested();
    if (!finalized.ready) {
      const blocker = finalized.blockedChangedPathCount
        ? `${finalized.blockedChangedPathCount} 个敏感或生成路径发生变化`
        : finalized.acceptanceBlockers.length
          ? `确定性验收未通过：${finalized.acceptanceBlockers.join('、')}`
          : finalized.reviewBlockers.length
            ? `独立复审未通过：${finalized.reviewBlockers.join('、')}`
            : finalized.missingOrFailed.join('、') || '工作树无有效变更';
      throw new Error(`最终交付门禁未通过：${blocker}`);
    }
    log('passed', '已到最终提交决策点', `${finalized.changedPaths.length} 个变更路径；未暂存、未提交、未推送`);
    return {
      session: finalized.session,
      delivery: {
        ready: finalized.ready,
        originalHead: finalized.session.head ?? '',
        worktreeEvidenceSha256: finalized.session.final?.statusSha256 ?? '',
        changedPaths: finalized.changedPaths,
        requiredCommands: finalized.requiredCommands,
        missingOrFailed: finalized.missingOrFailed,
        browserAcceptance,
        browserAcceptanceRequired: finalized.browserAcceptanceRequired,
        browserAcceptancePassed: finalized.session.final?.browserAcceptancePassed === true,
        reviewPassed: finalized.session.final?.reviewPassed === true,
      },
    };
  }

  async function verifyAndRepair(
    active: DevelopmentSession,
    userTask: string,
    analysis: DevelopmentAnalysis,
    contexts: DevelopmentFileContext[],
    snapshot: DevelopmentSnapshot,
    allowRepair = true,
    repairsRemaining = 2,
  ): Promise<{ session: DevelopmentSession; results: DevelopmentCommandResult[] }> {
    stopIfRequested();
    let current = await updateDevelopmentProgress(
      server.url,
      active.sessionId,
      'verifying',
      currentRunSignal(),
    );
    const commands = [...snapshot.scripts.filter((item) => ['test', 'build', 'lint', 'typecheck', 'check'].includes(item)), 'git-diff-check'];
    const reusable = selectDevelopmentEvidenceReuse(current, commands, snapshot.worktreeStateSha256, false);
    const results: DevelopmentCommandResult[] = [...reusable.commandResults];
    const stabilityRetriedStates = new Set([
      ...(current.stabilityRetriedSourceStates ?? []).map((item) => `test:${item}`),
      ...current.commands
        .filter((item) => Boolean(item.stabilityRetryOf))
        .map((item) => `${item.commandId}:${item.sourceStateSha256}`),
    ]);
    if (reusable.commandResults.length) {
      log('passed', '验证证据已复用', `${reusable.commandResults.length}/${commands.length} 个固定命令 · 工作树哈希未变`);
    }
    for (const commandId of reusable.pendingCommands) {
      stopIfRequested();
      log('working', `验证 ${commandId}`, '运行固定清单命令；不开放任意参数或 shell');
      let result = await runDevelopmentCommand(
        server.url,
        current.sessionId,
        commandId,
        runAbortRef.current?.signal,
      );
      stopIfRequested();
      current = result.session;
      results.push(result);
      const commandDetail = result.worktreeChanged
        ? `${result.durationMs}ms · 命令改变工作树，证据已拒绝`
        : result.timedOut
        ? `${result.durationMs}ms · 已终止受管进程树`
        : `${result.durationMs}ms · exit ${result.exitCode}`;
      log(result.status === 'passed' ? 'passed' : 'failed', `${commandId} ${result.status === 'passed' ? '通过' : '失败'}`, commandDetail);
      const stabilityRetryKey = `${commandId}:${result.sourceStateSha256}`;
      if (
        shouldRetryDevelopmentTestForStability(result, snapshot.worktreeStateSha256)
        && !stabilityRetriedStates.has(stabilityRetryKey)
      ) {
        stabilityRetriedStates.add(stabilityRetryKey);
        stopIfRequested();
        log('working', 'test 稳定性复验', '源码状态未变；固定测试仅再运行一次，不调用模型');
        result = await runDevelopmentCommand(
          server.url,
          current.sessionId,
          commandId,
          runAbortRef.current?.signal,
          { stabilityRetryOf: result.executionId },
        );
        stopIfRequested();
        current = result.session;
        results.push(result);
        const retryDetail = result.worktreeChanged
          ? `${result.durationMs}ms · 命令改变工作树，证据已拒绝`
          : result.timedOut
          ? `${result.durationMs}ms · 已终止受管进程树`
          : `${result.durationMs}ms · exit ${result.exitCode} · 未调用模型`;
        log(
          result.status === 'passed' ? 'passed' : 'failed',
          `test 稳定性复验${result.status === 'passed' ? '通过' : '失败'}`,
          retryDetail,
        );
      }
      if (result.worktreeChanged) break;
    }
    const orderedResults = commands.flatMap((commandId) => {
      const result = [...results].reverse().find((item) => item.commandId === commandId);
      return result ? [result] : [];
    });
    const failures = orderedResults.filter((item) => item.status === 'failed');
    if (!failures.length && orderedResults.length === commands.length) return { session: current, results: orderedResults };
    if (!failures.length) throw new Error('固定验证证据不完整，已安全停止');
    if (!allowRepair || repairsRemaining < 1) throw new Error(`验证失败：${failures.map((item) => item.commandId).join('、')}`);
    const diff = await fetchDevelopmentDiff(server.url, current.sessionId);
    const repairContextPaths = selectDevelopmentRepairContextPaths(
      extractDevelopmentPatchPaths(diff.diff),
      failures.map((item) => item.outputTail ?? ''),
      analysis.relevantPaths,
      failures.some((item) => item.commandId === 'test')
        ? rankDevelopmentTestCandidates(userTask, snapshot.files, 2)
        : [],
      snapshot.files,
    );
    let repairContexts = repairContextPaths.length
      ? mergeDevelopmentContexts(
        contexts,
        (await readDevelopmentFiles(server.url, current.sessionId, repairContextPaths)).files,
      )
      : contexts;
    if (repairContextPaths.length) {
      log('passed', '验证修复上下文已预装', `${repairContextPaths.length} 个证据相关文件 · 不消耗模型读取动作`);
    }
    let repairFeedback = failures.map((item) => `${item.commandId}: ${item.outputTail ?? ''}`);
    const repairCycle = 3 - repairsRemaining;
    const repairActionSignatures = new Set<string>();
    for (let repairAttempt = 1; repairAttempt <= 4; repairAttempt += 1) {
      stopIfRequested();
      log('working', 'AG-DEV 验证修复', `修复周期 ${repairCycle}/2 · 动作 ${repairAttempt}/4`);
      let repairText: string;
      try {
        repairText = await callAgent(
          'AG-DEV',
          createImplementationMessages({
            task: userTask,
            analysis,
            files: repairContexts,
            availablePaths: snapshot.files,
            searchMatches: repairFeedback,
            currentDiff: diff.diff,
            attempt: 10 + repairAttempt,
          }),
          current,
          `verification-repair-${repairCycle}-${repairAttempt}`,
          1_800,
        );
      } catch (reason) {
        const rejection = reason instanceof Error ? reason.message : 'Provider 调用失败';
        if (!rejection.includes('8000 字符上限')) throw reason;
        repairFeedback = ['OUTPUT_REJECTED: 只返回一个最小修复动作或 2-4 项 batch，不得重写完整文件。'];
        if (repairAttempt === 4) throw new Error('验证修复连续输出过大，已安全停止');
        continue;
      }
      let repair;
      try {
        repair = parseDevelopmentAgentAction(repairText);
      } catch (reason) {
        const rejection = reason instanceof Error ? reason.message : '修复动作格式错误';
        repairFeedback = [`ACTION_FORMAT_REJECTED: ${rejection.slice(0, 600)}。测试仍失败；响应可能被截断，长编辑每轮只返回一个最小 insert/replace，并保证 JSON 完整闭合。`];
        log('failed', '验证修复动作已拒绝', 'AG-DEV 将按固定协议自行纠正；工作树未发生变化');
        if (repairAttempt === 4) throw new Error('验证修复未能在四个动作内收敛');
        continue;
      }
      if (registerDevelopmentAgentAction(repair, repairActionSignatures)) {
        repairFeedback = duplicateDevelopmentActionFeedback(repair);
        log('failed', '验证修复重复动作已拦截', `${repair.action} 未重复执行；AG-DEV 必须改用已有证据支持的动作`);
        if (repairAttempt === 4) throw new Error('验证修复重复同一无进展动作，已安全停止');
        continue;
      }
      if (repair.action === 'read') {
        const allowed = repair.paths.filter((item) => snapshot.files.includes(item));
        if (!allowed.length) {
          repairFeedback = [`READ_REJECTED: ${repair.paths.join(', ')} 不在当前 Git 文件清单。`];
          if (repairAttempt === 4) throw new Error('验证修复连续请求不存在的文件');
          continue;
        }
        repairContexts = mergeDevelopmentContexts(
          repairContexts,
          (await readDevelopmentFiles(server.url, current.sessionId, allowed)).files,
        );
        repairFeedback = failures.map((item) => `${item.commandId}: ${item.outputTail ?? ''}`);
        continue;
      }
      if (repair.action === 'search') {
        repairFeedback = (await searchDevelopmentFiles(server.url, current.sessionId, repair.query)).matches;
        continue;
      }
      if (repair.action === 'blocked') throw new Error(repair.reason);
      if (repair.action === 'complete') {
        repairFeedback = ['REPAIR_REQUIRED: 测试仍失败，不能宣告完成；请返回最小 insert、replace、batch 或 diff。'];
        if (repairAttempt === 4) throw new Error('验证失败且 AG-DEV 未返回修复变更');
        continue;
      }
      const changePaths = developmentChangePaths(repair);
      let applied;
      try {
        applied = await applyAgentChange(
          current,
          `${current.sessionId}:${current.changeSetCount}:verification-fix:${repairCycle}:${repairAttempt}`,
          repair,
        );
      } catch (reason) {
        const rejection = reason instanceof Error ? reason.message : '验证修复变更校验失败';
        const refreshPaths = changePaths.filter((item) => snapshot.files.includes(item));
        if (refreshPaths.length) {
          repairContexts = mergeDevelopmentContexts(
            repairContexts,
            (await readDevelopmentFiles(server.url, current.sessionId, refreshPaths)).files,
          );
        }
        repairFeedback = [`CHANGE_REJECTED: ${rejection.slice(0, 1_200)}`];
        if (repairAttempt === 4) throw new Error(`验证修复变更未收敛：${rejection}`);
        continue;
      }
      log('passed', '验证修复已应用', `${applied.fileCount} 个文件；重新执行全部门禁`);
      const nextSnapshot = await fetchDevelopmentSnapshot(server.url, current.sessionId);
      const refreshedPaths = changePaths.filter((item) => nextSnapshot.files.includes(item));
      if (refreshedPaths.length) {
        repairContexts = mergeDevelopmentContexts(
          repairContexts,
          (await readDevelopmentFiles(server.url, current.sessionId, refreshedPaths)).files,
        );
      }
      return verifyAndRepair(
        applied.session,
        userTask,
        analysis,
        repairContexts,
        nextSnapshot,
        true,
        repairsRemaining - 1,
      );
    }
    throw new Error('验证修复未能在四个动作内收敛');
  }

  async function verifyBrowserAndRepair(
    active: DevelopmentSession,
    userTask: string,
    analysis: DevelopmentAnalysis,
    contexts: DevelopmentFileContext[],
    initialSnapshot: DevelopmentSnapshot,
    commandResults: DevelopmentCommandResult[],
    allowRepair = true,
    repairsRemaining = 2,
    previousPlan: DevelopmentAcceptancePlan | null = null,
    planRevisionsRemaining = 1,
    diagnosticRerunsRemaining = 1,
  ): Promise<{
    session: DevelopmentSession;
    result: DevelopmentAcceptanceResult | null;
    contexts: DevelopmentFileContext[];
    snapshot: DevelopmentSnapshot;
    commandResults: DevelopmentCommandResult[];
    plan: DevelopmentAcceptancePlan | null;
    reviewAcceptance: ReturnType<typeof compactBrowserAcceptance>;
    browserRequired: boolean;
  }> {
    stopIfRequested();
    let snapshot = await fetchDevelopmentSnapshot(server.url, active.sessionId).catch(() => initialSnapshot);
    const diff = await fetchDevelopmentDiff(server.url, active.sessionId);
    const browserRequired = active.requirements.browserAcceptance
      || requiresDevelopmentBrowserAcceptance(userTask, extractDevelopmentPatchPaths(diff.diff));
    if (!browserRequired) {
      return {
        session: active,
        result: null,
        contexts,
        snapshot,
        commandResults,
        plan: previousPlan,
        reviewAcceptance: null,
        browserRequired: false,
      };
    }
    if (!snapshot.acceptanceScripts.length) throw new Error('任务需要浏览器验收，但项目没有 Node 或 Python Web 固定入口');

    let current = await updateDevelopmentProgress(
      server.url,
      active.sessionId,
      'verifying',
      currentRunSignal(),
    );
    const commandIds = [
      ...snapshot.scripts.filter((item) => ['test', 'build', 'lint', 'typecheck', 'check'].includes(item)),
      'git-diff-check',
    ];
    const reusable = selectDevelopmentEvidenceReuse(current, commandIds, snapshot.worktreeStateSha256, true);
    if (reusable.pendingCommands.length === 0 && reusable.browserAcceptance) {
      log('passed', '浏览器证据已复用', `桌面 + 390px · 工作树哈希未变 · 证据 ${reusable.browserAcceptance.evidenceSha256.slice(0, 12)}`);
      return {
        session: current,
        result: null,
        contexts,
        snapshot,
        commandResults,
        plan: previousPlan,
        reviewAcceptance: compactBrowserAcceptance(reusable.browserAcceptance),
        browserRequired: true,
      };
    }
    const planner = current.agentPlan.agents.includes('AG-REVIEW') ? 'AG-REVIEW' : 'AG-DEV';
    const reusablePlan = reuseDevelopmentAcceptancePlan(previousPlan, snapshot.acceptanceScripts);
    let plan = reusablePlan;
    let planFeedback: string[] = [];
    let planSource: 'reused' | 'agent' = reusablePlan ? 'reused' : 'agent';
    let lastPlanError = '';
    if (!reusablePlan) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        stopIfRequested();
        try {
          const text = await callAgent(
            planner,
            createBrowserAcceptanceMessages({
              task: userTask,
              availableScripts: snapshot.acceptanceScripts,
              files: contexts,
              diff: diff.diff,
              feedback: planFeedback,
              agentId: planner,
            }),
            current,
            `browser-plan-${repairsRemaining}-${attempt}`,
            1_200,
          );
          const candidate = parseDevelopmentAcceptancePlan(text, snapshot.acceptanceScripts);
          const coverageGaps = findDevelopmentBrowserPlanGaps(userTask, candidate, contexts);
          if (coverageGaps.length) throw new Error(coverageGaps.join('；'));
          plan = candidate;
          planSource = 'agent';
          break;
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : '浏览器验收计划格式错误';
          lastPlanError = message;
          planFeedback = [`PLAN_REJECTED:${message.slice(0, 600)}。只返回固定 JSON 计划。`];
        }
      }
    }
    if (!plan) throw new Error(`浏览器验收计划两次未收敛，已安全停止：${lastPlanError || '缺少任务结果证据'}`);
    log(
      'working',
      '真实浏览器验收',
      planSource === 'reused'
        ? `${plan.scriptId} · 复用已编译的 ${plan.actions.length} 个受限动作 · 桌面与 390px`
        : `${plan.scriptId} · ${plan.actions.length} 个任务证据动作 · 桌面与 390px`,
    );
    stopIfRequested();
    const result = await runDevelopmentBrowserAcceptance(server.url, {
      sessionId: current.sessionId,
      acceptanceId: `${current.sessionId}:browser:${current.acceptances.length + 1}`,
      plan,
    }, runAbortRef.current?.signal);
    stopIfRequested();
    current = result.session;
    setSession(current);
    if (result.recovered && result.status === 'failed' && result.viewports.length === 0) {
      if (diagnosticRerunsRemaining < 1) {
        throw new Error('浏览器验收失败且瞬时诊断连续丢失，已安全停止');
      }
      setAcceptanceEvidence(null);
      log('working', '浏览器失败回执已恢复', '截图与失败诊断未持久化；以新 acceptanceId 自主重跑一次固定验收');
      return verifyBrowserAndRepair(
        current,
        userTask,
        analysis,
        contexts,
        snapshot,
        commandResults,
        allowRepair,
        repairsRemaining,
        plan,
        planRevisionsRemaining,
        diagnosticRerunsRemaining - 1,
      );
    }
    const visibleResult = result.recovered ? null : result;
    setAcceptanceEvidence(visibleResult);
    if (result.status === 'passed') {
      log(
        'passed',
        result.recovered ? '浏览器通过回执已恢复' : '浏览器验收通过',
        `桌面 + 390px · console ${result.consoleErrorCount}/${result.consoleWarningCount} · 请求失败 ${result.failedRequestCount}`,
      );
      return {
        session: current,
        result: visibleResult,
        contexts,
        snapshot,
        commandResults,
        plan,
        reviewAcceptance: compactBrowserAcceptance(result),
        browserRequired: true,
      };
    }

    const initialFeedback = formatDevelopmentAcceptanceFeedback(result);
    log('failed', '浏览器验收发现问题', initialFeedback.slice(0, 3).join('；') || `${result.failureCount} 项失败`);
    if (isDevelopmentAcceptancePlanFailure(result)) {
      if (planRevisionsRemaining < 1) throw new Error('浏览器验收计划连续包含无效 selector；项目代码未被修改');
      log('working', '验收计划自行纠正', '无效 selector 属于计划缺陷；不修改项目代码，重新编译一次计划');
      return verifyBrowserAndRepair(
        current,
        userTask,
        analysis,
        contexts,
        snapshot,
        commandResults,
        allowRepair,
        repairsRemaining,
        null,
        planRevisionsRemaining - 1,
        diagnosticRerunsRemaining,
      );
    }
    if (!allowRepair || repairsRemaining < 1) throw new Error(`浏览器验收失败：${initialFeedback.slice(0, 6).join('；')}`);

    const repairContextPaths = selectDevelopmentRepairContextPaths(
      extractDevelopmentPatchPaths(diff.diff),
      initialFeedback,
      analysis.relevantPaths,
      [],
      snapshot.files,
    );
    let repairContexts = repairContextPaths.length
      ? mergeDevelopmentContexts(
        contexts,
        (await readDevelopmentFiles(server.url, current.sessionId, repairContextPaths)).files,
      )
      : contexts;
    if (repairContextPaths.length) {
      log('passed', '浏览器修复上下文已预装', `${repairContextPaths.length} 个当前变更文件 · 不消耗模型读取动作`);
    }
    let repairFeedback = initialFeedback.length ? initialFeedback : ['BROWSER_ACCEPTANCE_REJECTED: 未通过确定性浏览器门禁'];
    const repairActionSignatures = new Set<string>();
    for (let repairAttempt = 1; repairAttempt <= 4; repairAttempt += 1) {
      stopIfRequested();
      log('working', 'AG-DEV 浏览器修复', `修复周期 ${3 - repairsRemaining}/2 · 动作 ${repairAttempt}/4`);
      let repairText: string;
      try {
        repairText = await callAgent(
          'AG-DEV',
          createImplementationMessages({
            task: userTask,
            analysis,
            files: repairContexts,
            availablePaths: snapshot.files,
            searchMatches: repairFeedback,
            currentDiff: diff.diff,
            attempt: 20 + repairAttempt,
          }),
          current,
          `browser-repair-${repairsRemaining}-${repairAttempt}`,
          1_800,
        );
      } catch (reason) {
        const rejection = reason instanceof Error ? reason.message : 'Provider 调用失败';
        if (!rejection.includes('8000 字符上限')) throw reason;
        repairFeedback = compactDevelopmentFeedback([
          ...initialFeedback,
          'OUTPUT_REJECTED: 浏览器验收仍失败；长编辑每轮只返回一个最小 insert/replace，不得输出可能被截断的长 batch。',
        ]);
        if (repairAttempt === 4) throw new Error('浏览器修复连续输出过大，已安全停止');
        continue;
      }
      let repair: DevelopmentAgentAction;
      try {
        repair = parseDevelopmentAgentAction(repairText);
      } catch (reason) {
        const rejection = reason instanceof Error ? reason.message : '修复动作格式错误';
        repairFeedback = compactDevelopmentFeedback([
          ...initialFeedback,
          `ACTION_FORMAT_REJECTED:${rejection.slice(0, 600)}。浏览器验收仍失败；响应可能被截断，长编辑每轮只返回一个最小 insert/replace，并保证 JSON 完整闭合。`,
        ]);
        if (repairAttempt === 4) throw new Error('浏览器修复未能在四个动作内收敛');
        continue;
      }
      if (registerDevelopmentAgentAction(repair, repairActionSignatures)) {
        repairFeedback = compactDevelopmentFeedback([...initialFeedback, ...duplicateDevelopmentActionFeedback(repair)]);
        log('failed', '浏览器修复重复动作已拦截', `${repair.action} 未重复执行；AG-DEV 必须改用已有证据支持的动作`);
        if (repairAttempt === 4) throw new Error('浏览器修复重复同一无进展动作，已安全停止');
        continue;
      }
      if (repair.action === 'read') {
        const allowed = repair.paths.filter((item) => snapshot.files.includes(item));
        if (!allowed.length) {
          repairFeedback = compactDevelopmentFeedback([
            ...initialFeedback,
            `READ_REJECTED:${repair.paths.join(', ')} 不在当前 Git 文件清单。`,
          ]);
          if (repairAttempt === 4) throw new Error('浏览器修复连续请求不存在的文件');
          continue;
        }
        repairContexts = mergeDevelopmentContexts(
          repairContexts,
          (await readDevelopmentFiles(server.url, current.sessionId, allowed)).files,
        );
        repairFeedback = initialFeedback;
        continue;
      }
      if (repair.action === 'search') {
        repairFeedback = compactDevelopmentFeedback([
          ...initialFeedback,
          ...(await searchDevelopmentFiles(server.url, current.sessionId, repair.query)).matches,
        ]);
        continue;
      }
      if (repair.action === 'blocked') throw new Error(repair.reason);
      if (repair.action === 'complete') {
        repairFeedback = compactDevelopmentFeedback([
          ...initialFeedback,
          'REPAIR_REQUIRED: 浏览器验收仍失败，不能宣告完成；请返回最小 insert、replace、batch 或 diff。',
        ]);
        if (repairAttempt === 4) throw new Error('浏览器验收失败且 AG-DEV 未返回修复变更');
        continue;
      }
      const changePaths = developmentChangePaths(repair);
      let applied;
      try {
        applied = await applyAgentChange(
          current,
          `${current.sessionId}:${current.changeSetCount}:browser-fix:${repairsRemaining}:${repairAttempt}`,
          repair,
        );
      } catch (reason) {
        const rejection = reason instanceof Error ? reason.message : '浏览器修复变更校验失败';
        const refreshPaths = changePaths.filter((item) => snapshot.files.includes(item));
        if (refreshPaths.length) {
          repairContexts = mergeDevelopmentContexts(
            repairContexts,
            (await readDevelopmentFiles(server.url, current.sessionId, refreshPaths)).files,
          );
        }
        repairFeedback = compactDevelopmentFeedback([
          ...initialFeedback,
          `CHANGE_REJECTED:${rejection.slice(0, 1_200)}`,
        ]);
        if (repairAttempt === 4) throw new Error(`浏览器修复变更未收敛：${rejection}`);
        continue;
      }
      log('passed', '浏览器修复已应用', `${applied.fileCount} 个文件；重跑项目门禁与真实浏览器`);
      snapshot = await fetchDevelopmentSnapshot(server.url, applied.session.sessionId);
      const refreshedPaths = changePaths.filter((item) => snapshot.files.includes(item));
      if (refreshedPaths.length) {
        repairContexts = mergeDevelopmentContexts(
          repairContexts,
          (await readDevelopmentFiles(server.url, applied.session.sessionId, refreshedPaths)).files,
        );
      }
      const verification = await verifyAndRepair(applied.session, userTask, analysis, repairContexts, snapshot);
      return verifyBrowserAndRepair(
        verification.session,
        userTask,
        analysis,
        repairContexts,
        snapshot,
        verification.results,
        true,
        repairsRemaining - 1,
        plan,
        planRevisionsRemaining,
        diagnosticRerunsRemaining,
      );
    }
    throw new Error('浏览器修复未能在四个动作内收敛');
  }

  async function callAgent(
    agentId: string,
    messages: Parameters<typeof connectors.chat>[1],
    active: DevelopmentSession,
    stage: string,
    maxTokens: number,
    onModelResolved?: (model: string) => void,
  ) {
    stopIfRequested();
    await ensureDevelopmentProviders(active.agentPlan.agents, 'model-call');
    stopIfRequested();
    const configured = resolveReadyConfig(agentId);
    if (!configured) throw new Error(`${agentId} 未绑定可用 Provider`);
    const route = routeDevelopmentModel(configured, agentId, stage);
    const responseFormat = configured.kind === 'deepseek' && !stage.startsWith('review-')
      ? 'json_object'
      : 'text';
    onModelResolved?.(route.model);
    if (route.reason !== 'configured') {
      log('working', '模型自主路由', `${agentId} · ${route.reason === 'quality-role' ? '质量角色' : '连续失败升级'} · ${route.model}`);
    }
    const modelRouteSha256 = await developmentModelRouteSha256(
      { ...configured, model: route.model },
      responseFormat,
    );
    const providerReadinessSha256 = await developmentProviderReadinessSha256(configured.readinessId);
    const signal = runAbortRef.current?.signal;
    let retryOfReservationId: string | undefined;
    return runDevelopmentModelWithTransientRetry(async (retryAttempt) => {
      stopIfRequested();
      if (retryAttempt > 0 && !retryOfReservationId) throw new Error('瞬时 Provider 补发缺少原始预算引用');
      const runId = createDevelopmentModelRunId(
        active.sessionId,
        executionAttemptRef.current,
        stage,
        retryAttempt,
      );
      const issued = await issueDevelopmentModelCall(server.url, {
        sessionId: active.sessionId,
        runId,
        agentId,
        messages,
        modelRouteSha256,
        providerReadinessSha256,
        maxOutputTokens: maxTokens,
        ...(retryAttempt > 0 ? { retryOfReservationId } : {}),
      }, signal);
      if (retryAttempt === 0) retryOfReservationId = issued.authorization.reservationId;
      setSession(issued.session);
      stopIfRequested();
      activeModelRunIdRef.current = runId;
      try {
        const text = await connectors.chat(agentId, messages, {
          runId,
          maxTokens,
          groundingDisclosureApproved: true,
          modelOverride: route.model,
          developmentAuthorization: issued.authorization,
          responseFormat,
          signal,
        });
        stopIfRequested();
        if (!text) throw new Error(`${agentId} 未绑定可用 Provider`);
        return text;
      } finally {
        if (activeModelRunIdRef.current === runId) activeModelRunIdRef.current = '';
      }
    }, {
      signal,
      onRetry: (kind) => log(
        'working',
        'Provider 瞬时失败，自动恢复',
        `${agentId} · ${describeDevelopmentModelRetry(kind)} · 1/1 · 重新签发并消耗一次会话硬预算`,
      ),
    });
  }

  async function applyAgentChange(
    active: DevelopmentSession,
    changeSetId: string,
    action: DevelopmentChangeAction,
  ) {
    stopIfRequested();
    let result;
    if (action.action === 'batch') {
      result = await applyDevelopmentTextReplacementBatch(server.url, {
        sessionId: active.sessionId,
        changeSetId,
        replacements: action.edits.map(toDevelopmentTextReplacement),
      });
    } else if (action.action === 'insert' || action.action === 'replace') {
      const replacement = toDevelopmentTextReplacement(action);
      result = await applyDevelopmentTextReplacement(server.url, {
        sessionId: active.sessionId,
        changeSetId,
        ...replacement,
      });
    } else {
      result = await applyDevelopmentPatch(server.url, {
        sessionId: active.sessionId,
        changeSetId,
        patch: action.patch,
      });
    }
    stopIfRequested();
    return result;
  }

  return (
    <div className="development-mode-panel">
      <section className="development-hero">
        <div>
          <span className="development-eyebrow"><Sparkles aria-hidden="true" /> 默认工作模式</span>
          <h2>独立开发</h2>
        <p>你只提供项目与问题。系统负责分析、修改、验证、浏览器验收和独立复审修复，最后停在提交决定。</p>
        </div>
        <span className="development-default-chip">{preset.label} v{preset.schemaVersion}</span>
      </section>

      <section className="development-preset-card" aria-label="本地自主开发预设">
        <header><LockKeyhole aria-hidden="true" /><strong>一次授权，绑定一个本地开发会话</strong></header>
        <div className="development-scope-grid">
          {SCOPE_LABELS.map((item) => <span key={item} className="is-allowed">{item}</span>)}
          {DENIED_LABELS.map((item) => <span key={item} className="is-denied">{item}</span>)}
        </div>
        <details className="development-safety-details">
          <summary>
            <span><ChevronDown aria-hidden="true" /><strong>安全与恢复细则</strong></span>
            <small>Key 与模型正文不落盘 · 不开放任意 Shell · 不自动暂存、提交或推送</small>
          </summary>
          <div className="development-safety-details-body">
            <p>Key、原始任务、Provider 正文与完整路径不写入持久账本；开发模型原始消息与正文也不复制到共享运行事件。新会话创建按一次性 creationId 单飞；响应丢失时只在根指纹、HEAD、任务哈希、用户确认的人民币费率/硬上限与受控工作树完全一致时自动取回已落账会话，不创建第二份，ID 换任务/根/费用合同或状态漂移固定拒绝。开发阶段转换按一次性 transitionId 落账；响应丢失只返回当前阶段，绝不把已前进的会话倒退。服务重启后以相同合同恢复，再按根指纹、HEAD、任务哈希与工作树状态自动续跑。每次模型调用先消耗会话级一次性硬预算，并按实际 messages 的 UTF-8 字节数作为输入 Token 安全上界、结合最大输出 Token 在 Provider 前保守占用人民币费用；完整 usage 回执后结算为实测费用，失败或缺回执不退款。签发同时绑定正文 SHA-256、非敏感模型路由 SHA-256 与最近连接测试代际；同长度换文、签发后换模型或换 Key 都会在 Provider 前被拒绝，Key 及其派生值仍不落盘。本地签发响应丢失只以同一 runId 幂等重放一次，不重复占用预算；Provider 完成后的本地响应丢失只在原进程 10 分钟内重放内存结果，不发第二次上游请求；过期、淘汰、切换 Observer 工作区或服务重启后明确要求新 runId。开发预检、快照和源码检查等只读本地请求断线时会同请求恢复一次；受控代码变更或独立复审回执丢失，只在原进程 10 分钟内分别按同一 changeSetId / reviewId 恢复一次，不重复写入或重新调用复审模型。会话恢复绑定与 Final 响应丢失会以同一请求重新校验一次，不复用旧终态。固定命令按一次性 executionId 单飞；成功或失败结果与输出尾只在原进程内最多 2 分钟 / 20 条恢复一次，不重复执行，持久账本只存脱敏执行占位而不存输出；缓存过期、工作区切换或服务重启后拒绝旧 ID，不猜测结果。浏览器验收按 acceptanceId 在途单飞；响应丢失时只以 plan SHA 与源码状态恢复无截图回执，通过则继续，失败只用新 ID 自主重跑一次取诊断，截图正文绝不缓存或落账。模型调用不借此命令或验收合同重放。只有服务端已归因的瞬时上游传输、临时 HTTP 或阶段超时可自动补发一次，并重新消耗预算。工作树哈希与当前门禁策略版本均一致时，才自动复用已通过的命令、浏览器和复审证据；文件或策略变化只重跑失效门禁及后续复审。Node 项目脚本、Python 已声明工具与固定 Web 入口按当前用户权限运行，仅对可信仓库启用。</p>
            <p>模型签发按同一 runId 在途单飞；并发断线重试只签发一份，完成后仍不缓存 token。用户取消、合同漂移或服务重启不会放宽为重复签发。</p>
            <p className="development-discovery-policy">实现阶段优先预装按修改优先级排列的多文件上下文；同一工作树状态最多执行 1 次补充 read/search，随后必须返回最小代码变更或客观阻塞。已经进入 files 的正文不重复读取，连续两次忽略写动作要求会提前安全停止。</p>
            <p>开发预设、会话列表、预检、快照与源码检查均为只读启动链；本地响应丢失时只恢复一次，服务切换会立即取消旧等待。</p>
            <p>安全停止会立即取消页面对已分类本地请求的等待，首次会话令牌补取也继承同一取消信号；模型取消回执与 failed 现场落账分别独立限时 5 秒。运行中锁定面板切换与关闭；本地服务断线、URL 变化或同端口进程重启会取消旧等待和旧服务上的活动模型 run，新进程仅在根指纹、HEAD、任务哈希与工作树状态一致时重新绑定并继续落 failed 现场。服务端已启动的原子变更、固定命令与浏览器验收仍按有界规则结算，不做危险强杀。</p>
          </div>
        </details>
      </section>

      <section className="development-intake">
        <label>
          <span>Git 工作树根目录</span>
          <p className="development-clean-note">
            <CircleAlert aria-hidden="true" />
            <span>新会话仅接受 <code>clean</code>；精确命中中断会话的 <code>dirty</code> 工作树可自动续跑。</span>
          </p>
          <input value={root} onChange={(event) => { updateDraft({ root: event.target.value }); setPreflightPlan(null); }} placeholder="D:\\Projects\\my-app" disabled={running} />
        </label>
        <label>
          <span>这次要解决的问题</span>
          <textarea value={task} onChange={(event) => { updateDraft({ task: event.target.value }); setPreflightPlan(null); }} placeholder="描述目标、验收结果和必须保留的边界" rows={5} disabled={running} />
        </label>
        <fieldset className="development-cost-policy">
          <legend>本会话人民币费用硬上限</legend>
          <div className="development-cost-grid">
            <label>
              <span>最高输入费率（元 / 百万 Token）</span>
              <input type="number" min="0.000001" max="1000" step="0.000001" value={inputRateYuan} onChange={(event) => updateDraft({ inputRateYuan: event.target.value, costPolicyConfirmed: false })} disabled={running} />
            </label>
            <label>
              <span>最高输出费率（元 / 百万 Token）</span>
              <input type="number" min="0.000001" max="1000" step="0.000001" value={outputRateYuan} onChange={(event) => updateDraft({ outputRateYuan: event.target.value, costPolicyConfirmed: false })} disabled={running} />
            </label>
            <label>
              <span>总上限（元）</span>
              <input type="number" min="0.000001" max="1000" step="0.000001" value={costLimitYuan} onChange={(event) => updateDraft({ costLimitYuan: event.target.value, costPolicyConfirmed: false })} disabled={running} />
            </label>
          </div>
          <label className="development-cost-confirmation">
            <input type="checkbox" checked={costPolicyConfirmed} onChange={(event) => updateDraft({ costPolicyConfirmed: event.target.checked })} disabled={running} />
            <span>我已确认费率覆盖本会话全部可能路由模型；失败或缺少完整 usage 回执按保守费用占用。</span>
          </label>
        </fieldset>
        <div className="development-intake-actions">
          <button type="button" className="development-start" onClick={() => void start()} disabled={running || !server.connected}>
            {running ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Code2 aria-hidden="true" />}
            {running ? '自主开发进行中' : '开始独立开发'}
          </button>
          {running ? (
            <button type="button" className="development-stop" onClick={() => void requestSafeStop()} disabled={stopping}>
              {stopping ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Square aria-hidden="true" />}
              {stopping ? '正在安全停止' : '安全停止并保留现场'}
            </button>
          ) : null}
        </div>
        <div className={`development-readiness${server.connected && (providerReady || delivery?.ready || providerPreparationDeferred) ? ' is-ready' : ''}`}>
          <span>{server.connected ? '本地服务已连接' : '本地服务未连接'}</span>
          <span>{delivery?.ready ? '交付已就绪，无需再次调用 Provider' : providerReady ? '角色流水线 Provider 已就绪' : providerPreparationDeferred ? '先复用本地证据；确需模型时才自动测试 Provider' : preflightPlan ? '需补齐该角色流水线的已测试 Provider' : '新会话启动前校验 Provider；恢复会话按需准备'}</span>
        </div>
      </section>

      {session ? (
        <section className="development-session-card">
          <header>
            <span>
              <Bot aria-hidden="true" />
              {session.agentPlan.agents.includes('AG-REVIEW')
                ? `${session.agentPlan.size} 角色 · 顺序流水线`
                : '同角色自审 · 不可正式交付'}
            </span>
            <strong>{phaseLabel(session.phase)}</strong>
          </header>
          <div className="development-agent-row">
            {session.agentPlan.agents.map((agentId) => <span key={agentId}>{agentId}</span>)}
          </div>
          <small>{session.rootName} · {session.branch} · {session.sessionId.slice(0, 18)}…</small>
          <small className="development-budget-usage">模型预算 {session.modelUsage.reservedCalls}/{session.modelUsage.maxCalls} 次 · 输入预留 {(session.modelUsage.reservedInputBytes / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}/{(session.modelUsage.maxInputBytes / 1_000).toLocaleString()} KB · 输出预留 {session.modelUsage.reservedOutputTokens.toLocaleString()}/{session.modelUsage.maxOutputTokens.toLocaleString()} tokens{session.modelUsage.unstartedReservedCalls ? ` · 未启动 ${session.modelUsage.unstartedReservedCalls} 次（未访问 Provider，仍占预留）` : ''}{session.modelUsage.untrackedLegacyInputCalls ? ` · ${session.modelUsage.untrackedLegacyInputCalls} 次旧调用无输入计量` : ''}</small>
          <small className="development-cost-usage">费用硬上限 {formatYuanMicros(session.modelUsage.maxCostMicros)} · 已占用 {formatYuanMicros(session.modelUsage.chargedCostMicros)}（实测 {formatYuanMicros(session.modelUsage.observedCostMicros)}{session.modelUsage.unsettledCostMicros ? ` + 未结算保守 ${formatYuanMicros(session.modelUsage.unsettledCostMicros)}` : ''}）· 剩余 {formatYuanMicros(session.modelUsage.remainingCostMicros)} · 费率 输入 {formatYuanMicros(session.modelUsage.inputMicrosPerMillionTokens)} / 输出 {formatYuanMicros(session.modelUsage.outputMicrosPerMillionTokens)} 每百万 Token</small>
          {session.modelUsage.startedCalls ? (
            <small className="development-observed-usage">Provider usage 回执 {session.modelUsage.usageReportedCalls}/{session.modelUsage.startedCalls} 次 · 实测输入 {session.modelUsage.observedInputTokens.toLocaleString()} / 输出 {session.modelUsage.observedOutputTokens.toLocaleString()} tokens{session.modelUsage.usageMissingStartedCalls ? ` · ${session.modelUsage.usageMissingStartedCalls} 次进行中、失败或无完整回执` : ''}{session.modelUsage.failureReportedCalls ? ` · 失败回执 ${session.modelUsage.failureReportedCalls}（瞬时 ${session.modelUsage.retryableFailureCalls}）` : ''}{session.modelUsage.transientRetryCalls ? ` · 自动补发 ${session.modelUsage.transientRetryCalls}` : ''}</small>
          ) : null}
        </section>
      ) : null}

      {activity.length ? (
        <section className="development-activity" aria-live="polite">
          {activity.map((item) => (
            <article key={item.id} className={`is-${item.state}`}>
              {item.state === 'working' ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : item.state === 'passed' ? <CheckCircle2 aria-hidden="true" /> : item.state === 'stopped' ? <Square aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
              <div><strong>{item.title}</strong><p>{item.detail}</p></div>
            </article>
          ))}
        </section>
      ) : null}

      {acceptanceEvidence ? (
        <section className={`development-browser-evidence is-${acceptanceEvidence.status}`} aria-label="真实浏览器验收证据">
          <header>
            <MonitorSmartphone aria-hidden="true" />
            <div>
              <strong>真实浏览器验收 · {acceptanceEvidence.status === 'passed' ? '通过' : '待修复'}</strong>
              <p>{acceptanceEvidence.scriptId} · {acceptanceEvidence.actionCount} 个受限动作 · 证据 {acceptanceEvidence.evidenceSha256.slice(0, 12)}</p>
            </div>
          </header>
          <div className="development-browser-grid">
            {acceptanceEvidence.viewports.map((viewport) => (
              <figure key={viewport.id}>
                <img src={viewport.screenshotDataUrl} alt={`${viewport.id === 'desktop' ? '桌面' : '390px'} 浏览器验收截图`} />
                <figcaption>
                  <strong>{viewport.id === 'desktop' ? '1440 × 900' : '390 × 844'}</strong>
                  <span>页面宽 {viewport.documentWidth}px · console {viewport.consoleErrorCount}/{viewport.consoleWarningCount} · 失败请求 {viewport.failedRequestCount}</span>
                  {viewport.failures.length ? <small>{viewport.failures.join(' · ')}</small> : <small>无溢出、无控制台告警、无失败请求</small>}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="development-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
          {canOpenProviderSettings ? (
            <button type="button" onClick={onOpenConnectors}>打开智能体接入</button>
          ) : null}
        </div>
      ) : null}

      {delivery ? (
        <section className={`development-delivery${delivery.ready ? ' is-ready' : ''}`}>
          <header><CheckCircle2 aria-hidden="true" /><div><strong>开发与独立复审已完成</strong><p>现在只剩最终精确提交决定；系统没有暂存、提交或推送。</p></div></header>
          <dl>
            <div><dt>变更路径</dt><dd>{delivery.changedPaths.length}</dd></div>
            <div><dt>验证门禁</dt><dd>{delivery.requiredCommands.length || 1}</dd></div>
            <div><dt>浏览器</dt><dd>{delivery.browserAcceptanceRequired && delivery.browserAcceptancePassed ? (delivery.browserAcceptance ? '2/2' : '已验证') : '—'}</dd></div>
            <div><dt>独立复审</dt><dd>{delivery.reviewPassed ? (session?.agentPlan.agents.includes('AG-SEC') ? 'AG-SEC + AG-REVIEW · H0/M0' : 'AG-REVIEW · H0/M0') : '—'}</dd></div>
          </dl>
          <ul>{delivery.changedPaths.map((item) => <li key={item}>{item}</li>)}</ul>
          {delivery.ready ? (
            <div className="development-decision-copy">
              <button type="button" onClick={copyCommitDecisionPackage}>
                {decisionCopyStatus === 'success' ? '已复制提交决策包' : '复制提交决策包'}
              </button>
              <span role="status">
                {decisionCopyStatus === 'success'
                  ? '已复制脱敏、版本化的精确提交证据；未执行暂存、提交或推送。'
                  : decisionCopyStatus === 'failed'
                    ? '复制失败；未写入剪贴板，也未执行任何 Git 操作。'
                    : '仅在你点击后写入剪贴板；不自动复制或持久化。'}
              </span>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function isDevelopmentChangeAction(action: DevelopmentAgentAction): action is DevelopmentChangeAction {
  return action.action === 'apply' || action.action === 'replace' || action.action === 'insert' || action.action === 'batch';
}

function developmentChangePaths(action: DevelopmentChangeAction) {
  if (action.action === 'apply') return extractDevelopmentPatchPaths(action.patch);
  if (action.action === 'batch') return [...new Set(action.edits.map((edit) => edit.path))];
  return [action.path];
}

function duplicateDevelopmentActionFeedback(action: DevelopmentAgentAction): string[] {
  return [`DUPLICATE_ACTION_REJECTED:${action.action} 已在当前工作树与证据状态执行；不得原样重复，必须使用已有结果继续。`];
}

function deliveryFromFinalized(
  finalized: Awaited<ReturnType<typeof finalizeDevelopmentSessionRequest>>,
): Delivery {
  return {
    ready: finalized.ready,
    originalHead: finalized.session.head ?? '',
    worktreeEvidenceSha256: finalized.session.final?.statusSha256 ?? '',
    changedPaths: finalized.changedPaths,
    requiredCommands: finalized.requiredCommands,
    missingOrFailed: finalized.missingOrFailed,
    browserAcceptance: null,
    browserAcceptanceRequired: finalized.browserAcceptanceRequired,
    browserAcceptancePassed: finalized.session.final?.browserAcceptancePassed === true,
    reviewPassed: finalized.session.final?.reviewPassed === true,
  };
}

function compactBrowserAcceptance(result: DevelopmentAcceptanceResult | DevelopmentAcceptanceReceipt | null) {
  if (!result) return null;
  const viewports = 'viewports' in result ? result.viewports : [];
  const recovered = 'recovered' in result && result.recovered === true;
  return {
    status: result.status,
    scriptId: result.scriptId,
    actionCount: result.actionCount,
    viewportCount: result.viewportCount,
    consoleErrorCount: result.consoleErrorCount,
    consoleWarningCount: result.consoleWarningCount,
    failedRequestCount: result.failedRequestCount,
    failureCount: result.failureCount,
    evidenceSha256: result.evidenceSha256,
    reused: recovered || !('viewports' in result),
    viewports: viewports.map((viewport) => ({
      id: viewport.id,
      width: viewport.width,
      height: viewport.height,
      documentWidth: viewport.documentWidth,
      documentHeight: viewport.documentHeight,
      failures: viewport.failures,
      screenshotSha256: viewport.screenshotSha256,
    })),
  };
}

function defaultAnalysis(snapshot: DevelopmentSnapshot): DevelopmentAnalysis {
  return {
    relevantPaths: snapshot.seedFiles.map((item) => item.path),
    plan: ['定位相关实现与测试', '最小变更', '全量验证与独立审查'],
    risks: snapshot.gitStatus ? ['工作树起点非 clean，必须保留既有变更'] : [],
  };
}

function mergeAnalysis(left: DevelopmentAnalysis, right: DevelopmentAnalysis): DevelopmentAnalysis {
  return {
    relevantPaths: [...new Set([...left.relevantPaths, ...right.relevantPaths])].slice(0, 6),
    plan: [...new Set([...left.plan, ...right.plan])].slice(0, 8),
    risks: [...new Set([...left.risks, ...right.risks])].slice(0, 6),
  };
}

function phaseLabel(phase: DevelopmentSession['phase']) {
  return ({
    ready: '等待启动 / 可交付',
    analyzing: '正在分析',
    editing: '正在实现',
    verifying: '正在验证',
    reviewing: '正在自审',
    failed: '已安全停止',
  } as const)[phase];
}
