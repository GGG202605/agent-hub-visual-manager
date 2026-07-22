import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { FastForward, ScrollText, Send, Sparkles, Square, X } from 'lucide-react';
import {
  buildProjectGroundingContext,
  buildSingleAgentPrompt,
  buildStagePrompt,
  resolveSingleAgentAcceptanceContract,
  validateConnectedStageResult,
  validateSingleAgentResult,
} from '../../lib/agentConnectors';
import { getAgentPersona } from '../../lib/agentPersonas';
import { normalizeAgentCode } from '../../lib/coordinationContract';
import {
  createOrchestrationPolicy,
  deriveModelClosureEvidence,
  type ModelCallEvidence,
  type OrchestrationPolicy,
} from '../../lib/orchestration';
import { buildTaskDag, createTaskCheckpoint, prepareRecoveredPipeline } from '../../lib/taskGraph';
import {
  buildPipelinePlan,
  findCoordinator,
  INITIAL_PIPELINE_STATE,
  isRealPipelineMode,
  PHASE_DURATION_MS,
  pipelineReducer,
  resolvePipelineLaunch,
  type PipelineLaunchIntent,
} from '../../lib/taskPipeline';
import { useConnectors } from '../../datasource/ConnectorContext';
import { useProjectData } from '../../datasource/ProjectDataContext';
import { readStoredSpeed } from '../SettingsPanel';
import type { AgentRoleCardView } from '../../types';
import { BoundedPilotPlan, type SafePilotExecutionActions } from './BoundedPilotPlan';
import { SAFE_PILOT_AGENT_ORDER, type SafePilotModelBinding } from '../../lib/safePilotLauncher';
import { createDemoScenario018AcceptanceSpec, DemoScenario018_APPROVED_PRICING } from '../../lib/safePilotExecution';

const PlazaScene = lazy(async () => {
  const module = await import('../../plaza3d/PlazaScene');
  return { default: module.PlazaScene };
});

/**
 * v0.3 百家广场舞台：
 * 众 Agent 围坐中式广场圆坛；轮到谁，谁走到圆心讲解，讲毕归位。
 * 点击协调 Agent（孔子位）输入需求，职责链自动闭环推进（模拟推演，不执行真实操作）。
 */
export function PlazaStage({ onPilotPreviewOpen }: { onPilotPreviewOpen?: () => void }) {
  const {
    dashboard,
    project,
    sourceKind,
    server,
    runtime,
    checkpointRecovery,
    clearTaskRecovery,
    persistTaskCheckpoint,
    cancelOrchestrationRun,
  } = useProjectData();
  const {
    orchestrate,
    acceptOrchestration,
    issueSafePilot,
    approveSafePilotRetry,
    acceptSafePilotHumanFinal,
    resolveReadyConfig,
    viaServer,
  } = useConnectors();
  const agents = dashboard.agents;

  const [pipeline, dispatch] = useReducer(pipelineReducer, INITIAL_PIPELINE_STATE);
  const [speed, setSpeed] = useState<1 | 2>(readStoredSpeed);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState('');
  const [launchIntent, setLaunchIntent] = useState<PipelineLaunchIntent>('single');
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  /** 智能体生成的讲解词（按阶段下标；失败/未接入则回退模板） */
  const [genTexts, setGenTexts] = useState<Record<number, string>>({});
  const [genPending, setGenPending] = useState(false);
  /** 运行反馈；真实协同本页不开放保存、构建或补丁动作。 */
  const [execMessage, setExecMessage] = useState('');
  const [checkpointMessage, setCheckpointMessage] = useState('');
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [tokenBudgetDraft, setTokenBudgetDraft] = useState(3520);
  const [timeoutDraft, setTimeoutDraft] = useState(60_000);
  const [groundingApproved, setGroundingApproved] = useState(false);
  const [runPolicy, setRunPolicy] = useState<OrchestrationPolicy | null>(null);
  const [modelEvidence, setModelEvidence] = useState<Record<number, ModelCallEvidence>>({});
  const [singleRepairs, setSingleRepairs] = useState<Record<number, { problem: string; previousText: string }>>({});
  const [pilotTaskSnapshot, setPilotTaskSnapshot] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkpointTimerRef = useRef<number | null>(null);
  const checkpointRevisionRef = useRef(0);
  const publishedReceiptIdsRef = useRef(new Set<string>());

  const coordinator = useMemo(() => findCoordinator(agents), [agents]);
  const taskDag = useMemo(() => buildTaskDag(pipeline, attempts), [pipeline, attempts]);
  // 大型项目候选选择仅在真实运行开始后按锁定任务重算，避免用户每次输入都扫描全量记录。
  const groundingTaskText = pipeline.status === 'running' ? pipeline.taskText : '';
  const projectGrounding = useMemo(
    () => buildProjectGroundingContext(project, dashboard, sourceKind, { taskText: groundingTaskText }),
    [dashboard, groundingTaskText, project, sourceKind],
  );
  const pilotModelBindings = useMemo<SafePilotModelBinding[]>(
    () => SAFE_PILOT_AGENT_ORDER.map((agentCode) => {
      const agent = agents.find((item) => normalizeAgentCode(item.code) === agentCode);
      const config = agent ? resolveReadyConfig(agent.id) : null;
      return {
        agentCode,
        provider: config?.kind ?? 'none',
        model: config?.model ?? '',
        ready: Boolean(config),
      };
    }),
    [agents, resolveReadyConfig],
  );
  const DemoScenario018AcceptanceSpec = useMemo(
    () => pilotTaskSnapshot ? createDemoScenario018AcceptanceSpec(pilotTaskSnapshot) : undefined,
    [pilotTaskSnapshot],
  );
  const safePilotExecutionActions = useMemo<SafePilotExecutionActions>(() => ({
    issue: issueSafePilot,
    runStage: async (agentCode, messages, options) => {
      const agent = agents.find((item) => normalizeAgentCode(item.code) === agentCode);
      if (!agent) throw new Error(`${agentCode} 未映射到当前 Agent`);
      return orchestrate(agent.id, messages, {
        runId: options.runId,
        policy: options.policy,
        maxTokens: options.maxTokens,
        handoff: options.handoff,
        safePilotAuthorization: options.authorization,
      });
    },
    accept: async (input) => acceptOrchestration({
      runId: input.runId,
      agentId: input.agentCode,
      evidence: input.evidence,
      decision: input.decision,
      safePilotAuthorization: {
        authorizationId: input.authorization.authorizationId,
        authorizationToken: input.authorization.authorizationToken,
      },
    }),
    retry: approveSafePilotRetry,
    humanAccept: acceptSafePilotHumanFinal,
  }), [
    acceptOrchestration,
    acceptSafePilotHumanFinal,
    agents,
    approveSafePilotRetry,
    issueSafePilot,
    orchestrate,
  ]);
  const launchStages = useMemo(() => buildPipelinePlan(agents, taskDraft.trim() || '任务预检'), [agents, taskDraft]);
  const launchDecision = useMemo(
    () => resolvePipelineLaunch(launchIntent, launchStages, viaServer, (agentId) => Boolean(resolveReadyConfig(agentId))),
    [launchIntent, launchStages, resolveReadyConfig, viaServer],
  );

  useEffect(() => {
    setGroundingApproved(false);
  }, [server.workspace, sourceKind]);

  const activeStage = pipeline.status === 'running' ? pipeline.stages[pipeline.currentIndex] : undefined;
  const activePersonaAgent = activeStage ? agents.find((agent) => agent.id === activeStage.agentId) : undefined;
  const isTerminal = ['paused', 'simulated', 'awaiting_evidence', 'completed', 'stopped', 'blocked', 'failed'].includes(
    pipeline.status,
  );
  const terminalTitle =
    pipeline.status === 'completed'
      ? pipeline.mode === 'single' ? '单 Agent 实测完成' : '真实智能体协同完成'
      : pipeline.status === 'paused'
        ? '检查点已恢复，等待继续'
        : pipeline.status === 'awaiting_evidence'
        ? 'Agent 阶段已结束，等待产物与复核证据'
        : pipeline.status === 'simulated'
          ? '模拟推演结束（未执行真实协同）'
          : pipeline.status === 'blocked'
            ? '协同已阻塞'
            : pipeline.status === 'failed'
              ? '协同执行失败'
              : '协同已停止';

  /* 推进定时器：enter → speak → exit → 下一位 */
  useEffect(() => {
    if (pipeline.status !== 'running') return;
    if (isRealPipelineMode(pipeline.mode) && pipeline.walkPhase === 'enter') return;
    const duration = PHASE_DURATION_MS[pipeline.walkPhase] / speed;
    timerRef.current = setTimeout(() => dispatch({ type: 'advance' }), duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pipeline.status, pipeline.walkPhase, pipeline.currentIndex, speed]);

  /* Connected runs wait for a real result; animation cannot advance a failed request. */
  useEffect(() => {
    if (pipeline.status !== 'running' || !isRealPipelineMode(pipeline.mode) || pipeline.walkPhase !== 'enter') return;
    const stage = pipeline.stages[pipeline.currentIndex];
    if (!stage) return;
    const agent = agents.find((item) => item.id === stage.agentId);
    if (!agent || !resolveReadyConfig(stage.agentId) || !runPolicy || !viaServer) {
      dispatch({
        type: 'stageBlocked',
        stageIndex: pipeline.currentIndex,
        message: `${stage.agentName} 未配置可用连接器`,
      });
      return;
    }

    const controller = new AbortController();
    const persona = getAgentPersona(agent.code, agent.layer);
    const index = pipeline.currentIndex;
    const previousEvidence = index > 0 ? modelEvidence[index - 1] : undefined;
    const handoff = pipeline.mode === 'connected' && index > 0
      ? previousEvidence?.acceptanceStatus === 'accepted' && previousEvidence.acceptanceId
        ? {
            version: '1.0.0' as const,
            runId: pipeline.runId,
            fromAgentId: pipeline.stages[index - 1].canonicalAgentCode,
            toAgentId: stage.canonicalAgentCode,
            evidenceId: previousEvidence.evidenceId,
            outputSha256: previousEvidence.outputSha256,
            acceptanceId: previousEvidence.acceptanceId,
          }
        : null
      : undefined;
    if (handoff === null) {
      dispatch({ type: 'stageBlocked', stageIndex: index, message: '上一阶段缺少已验收 handoff，已阻断后续 Agent。' });
      return;
    }
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, runPolicy.stageTimeoutMs + 5_000);
    setGenPending(true);
    const singleRepair = pipeline.mode === 'single' ? singleRepairs[index] : undefined;
    const singleAcceptance = resolveSingleAgentAcceptanceContract(pipeline.taskText);
    const stageGrounding = pipeline.mode === 'connected'
      ? buildProjectGroundingContext(project, dashboard, sourceKind, {
          taskText: `${pipeline.taskText}\n当前 Agent=${stage.canonicalAgentCode}；阶段=${stage.phaseLabel}；职责=${agent.roleTitle}`,
          charBudget: 6_000,
        })
      : undefined;
    let messages: ReturnType<typeof buildStagePrompt>;
    try {
      messages = pipeline.mode === 'single'
        ? buildSingleAgentPrompt({
            figure: persona.figure,
            school: persona.school,
            roleTitle: agent.roleTitle,
            taskText: pipeline.taskText,
            agentName: agent.nameZh,
            grounding: projectGrounding,
            acceptance: singleAcceptance,
            repair: singleRepair,
          })
        : buildStagePrompt({
            agentCode: stage.canonicalAgentCode,
            figure: persona.figure,
            school: persona.school,
            roleTitle: agent.roleTitle,
            phaseLabel: stage.phaseLabel,
            taskText: pipeline.taskText,
            agentName: agent.nameZh,
            runId: pipeline.runId,
            grounding: stageGrounding,
            handoff,
          });
    } catch (error) {
      window.clearTimeout(timeout);
      setGenPending(false);
      dispatch({
        type: 'stageFailed',
        stageIndex: index,
        message: error instanceof Error ? error.message : '项目摘要安全检查失败',
        retryable: false,
      });
      return;
    }
    orchestrate(
      agent.id,
      messages,
      {
        runId: pipeline.runId,
        policy: runPolicy,
        maxTokens: pipeline.mode === 'single' ? 800 : stage.canonicalAgentCode === 'AG-DEV' ? 1000 : 220,
        handoff,
        signal: controller.signal,
      },
    )
      .then(async (result) => {
        if (controller.signal.aborted) return;
        if (!result?.text) {
          dispatch({ type: 'stageFailed', stageIndex: index, message: '智能体未返回有效结果', retryable: true });
          return;
        }
        if (pipeline.mode === 'single') {
          const acceptanceProblem = validateSingleAgentResult(
            pipeline.taskText,
            result.text,
            projectGrounding,
            singleAcceptance,
          );
          if (acceptanceProblem) {
            await acceptOrchestration({
              runId: pipeline.runId,
              agentId: stage.canonicalAgentCode,
              evidence: result.evidence,
              decision: 'rejected',
            });
            setSingleRepairs((current) => ({
              ...current,
              [index]: { problem: acceptanceProblem, previousText: result.text },
            }));
            dispatch({ type: 'stageFailed', stageIndex: index, message: acceptanceProblem, retryable: true });
            return;
          }
          setSingleRepairs((current) => {
            if (!current[index]) return current;
            const next = { ...current };
            delete next[index];
            return next;
          });
        } else if (stageGrounding) {
          const acceptanceProblem = validateConnectedStageResult(
            {
              agentCode: stage.canonicalAgentCode,
              resultText: result.text,
              grounding: stageGrounding,
            },
          );
          if (acceptanceProblem) {
            await acceptOrchestration({
              runId: pipeline.runId,
              agentId: stage.canonicalAgentCode,
              evidence: result.evidence,
              decision: 'rejected',
            });
            dispatch({ type: 'stageFailed', stageIndex: index, message: acceptanceProblem, retryable: true });
            return;
          }
        }
        const accepted = await acceptOrchestration({
          runId: pipeline.runId,
          agentId: stage.canonicalAgentCode,
          evidence: result.evidence,
          decision: 'accepted',
        });
        const stageSummary = result.text;
        setGenTexts((prev) => ({ ...prev, [index]: stageSummary }));
        setModelEvidence((prev) => ({ ...prev, [index]: accepted.evidence }));
        dispatch({ type: 'stageSucceeded', stageIndex: index, summary: stageSummary });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted && !timedOut) return;
        const reason = timedOut
          ? `智能体请求超时（${Math.round(runPolicy.stageTimeoutMs / 1000)} 秒）`
          : error instanceof Error
            ? error.message
            : '智能体请求失败';
        dispatch({ type: 'stageFailed', stageIndex: index, message: reason, retryable: true });
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted || timedOut) setGenPending(false);
      });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    pipeline.status,
    pipeline.mode,
    pipeline.currentIndex,
    pipeline.stages,
    pipeline.taskText,
    modelEvidence,
    projectGrounding,
    project,
    dashboard,
    sourceKind,
    singleRepairs,
    agents,
    acceptOrchestration,
    orchestrate,
    resolveReadyConfig,
    runPolicy,
    viaServer,
  ]);

  useEffect(() => {
    if (pipeline.status !== 'awaiting_evidence' || !runPolicy) return;
    const evidence = Object.values(modelEvidence);
    if (evidence.length < pipeline.stages.length) return;
    dispatch({ type: 'finalize', evidence: deriveModelClosureEvidence(pipeline, evidence) });
  }, [modelEvidence, pipeline, runPolicy]);

  /* 推演结束自动弹出纪要 */
  useEffect(() => {
    if (isTerminal && pipeline.status !== 'idle') setReceiptsOpen(true);
  }, [pipeline.status]);

  useEffect(() => {
    runtime.setTaskDag(pipeline.runId ? taskDag : null);
  }, [pipeline.runId, runtime, taskDag]);

  useEffect(() => {
    if (!checkpointRecovery) return;
    checkpointRevisionRef.current = checkpointRecovery.revision;
    setAttempts(checkpointRecovery.attempts);
    setRunPolicy(checkpointRecovery.orchestration?.policy ?? null);
    setModelEvidence(
      Object.fromEntries(
        checkpointRecovery.pipeline.stages.flatMap((stage, index) => {
          const artifact = checkpointRecovery.orchestration?.evidence.find(
            (item) => item.agentId === stage.canonicalAgentCode,
          );
          return artifact ? [[index, artifact] as const] : [];
        }),
      ),
    );
    dispatch({ type: 'restore', state: prepareRecoveredPipeline(checkpointRecovery) });
    setConsoleOpen(false);
    setInspectedId(null);
    setReceiptsOpen(true);
    setCheckpointMessage(`已恢复检查点 r${checkpointRecovery.revision}`);
    clearTaskRecovery();
  }, [checkpointRecovery, clearTaskRecovery]);

  useEffect(() => {
    if (!server.connected || pipeline.mode !== 'connected' || !pipeline.runId || pipeline.status === 'idle') return;
    if (checkpointTimerRef.current) window.clearTimeout(checkpointTimerRef.current);
    checkpointTimerRef.current = window.setTimeout(() => {
      const revision = checkpointRevisionRef.current + 1;
      checkpointRevisionRef.current = revision;
      const orchestration = runtime
        .getSnapshot()
        .orchestrationRuns.find((run) => run.runId === pipeline.runId);
      const checkpoint = createTaskCheckpoint(pipeline, attempts, revision, new Date().toISOString(), orchestration);
      void persistTaskCheckpoint(checkpoint).then((error) => {
        setCheckpointMessage(error ? `检查点未保存：${error}` : `检查点 r${revision} 已保存`);
      });
    }, 180);
    return () => {
      if (checkpointTimerRef.current) window.clearTimeout(checkpointTimerRef.current);
    };
  }, [
    attempts,
    persistTaskCheckpoint,
    pipeline.currentIndex,
    pipeline.failure,
    pipeline.mode,
    pipeline.receipts.length,
    pipeline.runId,
    pipeline.status,
    pipeline.walkPhase,
    server.connected,
  ]);

  useEffect(() => {
    if (pipeline.mode !== 'simulation' || !pipeline.runId) return;
    for (const receipt of pipeline.receipts) {
      const id = `local:${pipeline.runId}:receipt:${receipt.seq}`;
      if (publishedReceiptIdsRef.current.has(id)) continue;
      publishedReceiptIdsRef.current.add(id);
      runtime.append({
        id,
        seq: receipt.seq,
        at: new Date().toISOString(),
        workspaceId: 'local-simulation',
        category: 'conversation',
        type: 'simulation_message',
        status: receipt.status === 'blocked' ? 'blocked' : receipt.status === 'failed' ? 'failed' : 'info',
        title: `${receipt.agentName} · ${receipt.phaseLabel}`,
        summary: receipt.summary,
        agentId: normalizeAgentCode(receipt.agentCode) ?? receipt.agentCode,
        runId: pipeline.runId,
      });
    }
  }, [pipeline.mode, pipeline.receipts, pipeline.runId, runtime]);

  function handleCharacterClick(agent: AgentRoleCardView) {
    if (pipeline.status === 'running') return;
    if (coordinator && agent.id === coordinator.id) {
      setConsoleOpen(true);
      setInspectedId(null);
    } else {
      setInspectedId((prev) => (prev === agent.id ? null : agent.id));
      setConsoleOpen(false);
    }
  }

  function handleSubmitTask() {
    const text = taskDraft.trim();
    if (!text) return;
    const allStages = buildPipelinePlan(agents, text);
    const launch = resolvePipelineLaunch(
      launchIntent,
      allStages,
      viaServer,
      (agentId) => Boolean(resolveReadyConfig(agentId)),
    );
    if (!launch.ok) return;
    const { mode, stages } = launch;
    if (isRealPipelineMode(mode) && !groundingApproved) {
      setExecMessage('请先确认本次将只读、脱敏的项目摘要发送给已绑定 Provider。');
      return;
    }
    setConsoleOpen(false);
    setInspectedId(null);
    setReceiptsOpen(false);
    setGenTexts({});
    setExecMessage('');
    setCheckpointMessage('');
    setAttempts({});
    setModelEvidence({});
    setSingleRepairs({});
    checkpointRevisionRef.current = 0;
    setRunPolicy(
      isRealPipelineMode(mode)
          ? createOrchestrationPolicy(stages.length, {
              totalOutputTokens: mode === 'single' ? 1600 : tokenBudgetDraft,
              stageTimeoutMs: timeoutDraft,
              groundingDisclosureApproved: true,
            })
        : null,
    );
    const runId = globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}`;
    publishedReceiptIdsRef.current.clear();
    runtime.append({
      id: `local:${runId}:request`,
      seq: 0,
      at: new Date().toISOString(),
      workspaceId: server.workspace || 'local-simulation',
      category: 'conversation',
      type: isRealPipelineMode(mode) ? 'run_requested' : 'simulation_requested',
      status: 'info',
      title: '用户需求 → 协调 Agent',
      summary: text,
      agentId: 'AG-COORD',
      runId,
    });
    dispatch({
      type: 'start',
      runId,
      mode,
      taskText: text,
      stages,
    });
    setGroundingApproved(false);
  }

  const inspected = inspectedId ? agents.find((agent) => agent.id === inspectedId) : undefined;
  const currentDagNode = taskDag.nodes[pipeline.currentIndex];

  function retryCurrentStage() {
    if (
      !currentDagNode ||
      currentDagNode.attempt >= currentDagNode.maxAttempts ||
      (pipeline.mode === 'single' && currentDagNode.attempt >= 2)
    ) return;
    setAttempts((current) => ({
      ...current,
      [currentDagNode.id]: (current[currentDagNode.id] ?? currentDagNode.attempt) + 1,
    }));
    dispatch({ type: 'retry' });
    setReceiptsOpen(false);
  }

  function resumeRecoveredRun() {
    if (!currentDagNode || currentDagNode.attempt >= currentDagNode.maxAttempts) return;
    setAttempts((current) => ({
      ...current,
      [currentDagNode.id]: (current[currentDagNode.id] ?? currentDagNode.attempt) + 1,
    }));
    dispatch({ type: 'resume' });
    setReceiptsOpen(false);
  }

  return (
    <div className="plaza-stage" aria-label="百家广场">
      {/* 与 GLB 角色统一的当代东方协同云台背景。 */}
      <div className="plaza-ground" aria-hidden="true" />

      {/* 三维层按需拆包，主界面先完成布局，再载入 8 个独立 GLB。 */}
      <Suspense fallback={<div className="plaza3d-shell-status" role="status">正在准备 Agent 舞台</div>}>
        <PlazaScene
          agents={agents}
          coordinatorId={coordinator?.id}
          active={activeStage ? { agentId: activeStage.agentId, phase: pipeline.walkPhase } : null}
          onCharacterClick={(agentId) => {
            const agent = agents.find((item) => item.id === agentId);
            if (agent) handleCharacterClick(agent);
          }}
        />
      </Suspense>

      {coordinator && pipeline.status === 'idle' && !consoleOpen && !pilotTaskSnapshot ? (
        <button
          type="button"
          className="plaza-mobile-coordinator-button"
          onClick={() => handleCharacterClick(coordinator)}
        >
          <Send aria-hidden="true" />
          向孔子呈递任务
        </button>
      ) : null}

      {/* 讲解气泡（优先展示智能体生成词） */}
      {activeStage && pipeline.walkPhase === 'speak' && activePersonaAgent ? (
        <div className="plaza-bubble" role="status">
          <header>
            <strong>
              {getAgentPersona(activePersonaAgent.code, activePersonaAgent.layer).figure} · {activeStage.phaseLabel}
            </strong>
            <span className="plaza-bubble-meta">
              {genTexts[pipeline.currentIndex] ? (
                <em className="plaza-gen-chip">
                  <Sparkles aria-hidden="true" />
                  智能体
                </em>
              ) : genPending ? (
                <em className="plaza-gen-chip is-pending">生成中…</em>
              ) : null}
              第 {pipeline.currentIndex + 1} / {pipeline.stages.length} 步
            </span>
          </header>
          <p>{genTexts[pipeline.currentIndex] ?? activeStage.narration}</p>
          <footer>—— {getAgentPersona(activePersonaAgent.code, activePersonaAgent.layer).motto}</footer>
        </div>
      ) : null}

      {/* 协调 Agent 的需求输入台 */}
      {consoleOpen && coordinator ? (
        <div className="plaza-console" role="dialog" aria-label="需求输入">
          <header>
            <strong>向 {getAgentPersona(coordinator.code, coordinator.layer).figure}（{coordinator.nameZh}）陈述需求</strong>
            <button type="button" onClick={() => setConsoleOpen(false)} aria-label="关闭">
              <X aria-hidden="true" />
            </button>
          </header>
           <textarea
             value={taskDraft}
             onChange={(event) => { setTaskDraft(event.target.value); setGroundingApproved(false); }}
             placeholder="请输入你的需求或想聊的内容，例如：为控制台增加暗色主题…"
             rows={3}
             maxLength={4000}
             autoFocus
           />
          <small className="plaza-task-length">任务文本 {taskDraft.length}/4000 字符</small>
          <div className="plaza-run-mode" aria-label="运行方式">
            <span>运行方式</span>
            <div className="plaza-run-mode-options" role="group" aria-label="选择运行方式">
              {([
                ['single', '单 Agent 实测'],
                ['full', '八 Agent 协同'],
                ['simulation', '模拟预览'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={launchIntent === value}
                  className={launchIntent === value ? 'is-active' : ''}
                   onClick={() => { setLaunchIntent(value); setGroundingApproved(false); }}
                >
                  {label}
                </button>
              ))}
            </div>
            <small className={launchDecision.ok ? 'is-ready' : 'is-blocked'}>
              {launchDecision.ok
                ? launchIntent === 'single'
                  ? '仅调用协调 Agent；发送限长只读项目摘要，不进入其他阶段，不保存检查点。'
                  : launchIntent === 'full'
                    ? '八个 Agent 均已绑定已测试模型，将执行完整证据链。'
                    : '仅播放模板，不调用模型，不保存检查点。'
                : launchDecision.error}
            </small>
          </div>
          <div className="plaza-pilot-preview-entry">
            <div>
              <strong>产品化有界多 Agent 验收</strong>
              <small>四 Agent 只读预案；任务、脱敏上下文与阶段提示使用同一冻结规格。</small>
            </div>
            <button
              type="button"
              disabled={!taskDraft.trim()}
              onClick={() => {
                onPilotPreviewOpen?.();
                setPilotTaskSnapshot(taskDraft.trim());
              }}
            >
              生成试运行预案
            </button>
          </div>
          {server.connected && launchIntent !== 'simulation' ? (
            <div className="plaza-policy-grid" aria-label="模型编排约束">
              <label>
                <span>输入预算</span>
                <input
                  type="number"
                  value={launchIntent === 'single' ? 32000 : 128000}
                  readOnly
                />
                <small>保守估算上界</small>
              </label>
              <label>
                <span>输出预算</span>
                <input
                  type="number"
                  min={64}
                  max={32768}
                  step={220}
                  value={launchIntent === 'single' ? 1600 : tokenBudgetDraft}
                  disabled={launchIntent === 'single'}
                  onChange={(event) => setTokenBudgetDraft(Number(event.target.value))}
                />
                <small>tokens</small>
              </label>
              <label>
                <span>最大调用</span>
                <input
                  type="number"
                  value={launchIntent === 'single' ? 2 : launchStages.length * 2}
                  readOnly
                />
                <small>次</small>
              </label>
              <label>
                <span>阶段超时</span>
                <input
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  value={Math.round(timeoutDraft / 1000)}
                  onChange={(event) => setTimeoutDraft(Number(event.target.value) * 1000)}
                />
                <small>秒</small>
              </label>
              <div className="plaza-policy-note">
                <span>费用预算</span>
                <strong>未估算</strong>
                <small>未配置 Provider 费率，本页不声称费用封顶</small>
              </div>
            </div>
          ) : null}
          {launchIntent !== 'simulation' ? (
            <label className="plaza-grounding-consent">
              <input
                type="checkbox"
                checked={groundingApproved}
                onChange={(event) => setGroundingApproved(event.target.checked)}
              />
              <span>
                我确认本次向已绑定 Provider 发送只读、脱敏的项目摘要；摘要按任务相关性限长，模型返回仍需本地验收。
              </span>
            </label>
          ) : null}
          <footer>
            <small>
              {launchIntent === 'simulation'
                ? '模板预览仅产生当前页面内存事件，不调用模型、不保存检查点、不产生文件或 Git 副作用。'
                : launchIntent === 'single'
                  ? '单 Agent 实测只调用协调 Agent；向模型发送目标、任务、风险与证据摘要，不含源码或 Key；不开放文件动作。'
                  : '八 Agent 模式按权限调用模型并持久化恢复检查点；纪要、构建和补丁仍需独立人工批准。'}
            </small>
            <button
              type="button"
              className="plaza-submit"
              onClick={handleSubmitTask}
              disabled={!taskDraft.trim() || !launchDecision.ok || (launchIntent !== 'simulation' && !groundingApproved)}
            >
              <Send aria-hidden="true" />
              {launchIntent === 'single' ? '启动实测' : launchIntent === 'full' ? '启动协同' : '开始预览'}
            </button>
          </footer>
        </div>
      ) : null}

      {pilotTaskSnapshot ? (
        <BoundedPilotPlan
          taskText={pilotTaskSnapshot}
          onClose={() => setPilotTaskSnapshot(null)}
          serverUrl={server.url}
          serverConnected={server.connected}
          modelBindings={pilotModelBindings}
          approvedPricing={DemoScenario018_APPROVED_PRICING}
          acceptanceSpec={DemoScenario018AcceptanceSpec}
          issuanceEnabled={server.safePilotIssuanceEnabled}
          executionActions={safePilotExecutionActions}
        />
      ) : null}

      {/* 点击其他 Agent 的信息卡 */}
      {inspected && !consoleOpen && pipeline.status !== 'running' ? (
        <div className="plaza-inspect-card" role="dialog" aria-label={`${inspected.nameZh} 信息`}>
          <header>
            <strong>
              {getAgentPersona(inspected.code, inspected.layer).school}·{getAgentPersona(inspected.code, inspected.layer).figure}
            </strong>
            <span>{inspected.nameZh} · {inspected.statusLabel}</span>
            <button type="button" onClick={() => setInspectedId(null)} aria-label="关闭">
              <X aria-hidden="true" />
            </button>
          </header>
          <p className="plaza-inspect-role">{inspected.roleTitle}</p>
          <p>{inspected.taskSummary}</p>
          <dl>
            <div>
              <dt>最近证据</dt>
              <dd>{inspected.recentEvidence}</dd>
            </div>
            <div>
              <dt>下一步</dt>
              <dd>{inspected.nextAction}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {/* 运行控制 */}
      {pipeline.status === 'running' ? (
        <div className="plaza-controls" aria-label="推演控制">
          <span className="plaza-controls-task">
            {pipeline.mode === 'single' ? '单 Agent 实测中' : pipeline.mode === 'connected' ? '真实协同中' : '模拟预览中'}：{pipeline.taskText.slice(0, 18)}
            {pipeline.taskText.length > 18 ? '…' : ''}
          </span>
          <button
            type="button"
            className={speed === 2 ? 'is-on' : ''}
            onClick={() => setSpeed((prev) => (prev === 1 ? 2 : 1))}
            title="加速"
          >
            <FastForward aria-hidden="true" />
            ×{speed}
          </button>
          <button
            type="button"
            onClick={() => {
              if (isRealPipelineMode(pipeline.mode)) {
                void cancelOrchestrationRun(pipeline.runId).then((error) => {
                  if (error) setExecMessage(`取消失败：${error}`);
                });
              }
              dispatch({ type: 'stop' });
              setReceiptsOpen(true);
            }}
            title="停止推演并查看已完成步骤"
          >
            <Square aria-hidden="true" />
            停止
          </button>
        </div>
      ) : null}

      {/* 推演纪要 */}
      {receiptsOpen && isTerminal ? (
        <div className="plaza-receipts" role="dialog" aria-label="推演纪要">
          <header>
            <ScrollText aria-hidden="true" />
            <strong>{terminalTitle}</strong>
            <button type="button" onClick={() => { setReceiptsOpen(false); dispatch({ type: 'reset' }); }} aria-label="关闭">
              <X aria-hidden="true" />
            </button>
          </header>
          <p className="plaza-receipts-task">需求：{pipeline.taskText}</p>
          {pipeline.failure ? (
            <p className="plaza-exec-msg">
              {pipeline.failure.agentCode}：{pipeline.failure.message}
              {pipeline.failure.retryable ? '（可在问题修复后重试）' : ''}
            </p>
          ) : null}
          {pipeline.status === 'paused' ? (
            <button
              type="button"
              className="plaza-recovery-button"
              disabled={
                !currentDagNode ||
                currentDagNode.attempt >= currentDagNode.maxAttempts ||
                (pipeline.mode === 'single' && currentDagNode.attempt >= 2)
              }
              onClick={resumeRecoveredRun}
            >
              从检查点继续
            </button>
          ) : null}
          {pipeline.status === 'failed' && pipeline.failure?.retryable ? (
            <button
              type="button"
              className="plaza-recovery-button"
              disabled={!currentDagNode || currentDagNode.attempt >= currentDagNode.maxAttempts}
              onClick={retryCurrentStage}
            >
              {pipeline.mode === 'single' ? '压缩改写' : '重试当前阶段'}（{currentDagNode?.attempt ?? 0}/{currentDagNode?.maxAttempts ?? 3}）
            </button>
          ) : null}
          <ol>
            {pipeline.receipts.map((receipt) => (
              <li key={receipt.seq}>
                <strong>
                  {receipt.agentName} · {receipt.phaseLabel}
                  {receipt.source === 'agent' ? <em className="plaza-gen-chip">智能体</em> : null}
                </strong>
                <span>{receipt.summary}</span>
              </li>
            ))}
          </ol>
          {execMessage ? <p className="plaza-exec-msg">{execMessage}</p> : null}
          <footer>
            {pipeline.mode === 'single'
              ? '本次为单 Agent 只读实测；验收失败后仅在你点击“压缩改写”时调用同一 Agent 一次，不开放文件动作。'
              : pipeline.mode === 'connected'
                ? '本页只接收只读分析结果，不提供保存、构建或补丁操作；完整协同以本地安全与复核验收为准。'
                : '以上为模板模拟预览，仅供查看，不代表真实 Agent 已完成任务。'}
          </footer>
          {checkpointMessage ? <p className="plaza-checkpoint-msg">{checkpointMessage}</p> : null}
        </div>
      ) : null}

      {/* 空闲提示 */}
      {pipeline.status === 'idle' && !consoleOpen && !inspected ? (
        <div className="plaza-hint" aria-hidden="true">
          点击{coordinator ? `「${getAgentPersona(coordinator.code, coordinator.layer).figure}」` : '协调 Agent'}呈递需求，开始协同推演 · 点击其他小人查看职责
        </div>
      ) : null}
    </div>
  );
}
