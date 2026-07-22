import { useMemo, useRef, useState } from 'react';
import { Ban, CheckCircle2, Fingerprint, Gauge, PlayCircle, RotateCcw, ShieldCheck, UsersRound, X } from 'lucide-react';
import { buildBoundedPilotPlan } from '../../lib/boundedPilot';
import { preflightSafePilot } from '../../lib/serverBridge';
import type { ChatMessage, ProjectGroundingContext } from '../../lib/agentConnectors';
import {
  buildProductizedHandoff,
  buildProductizedRetryFeedback,
  buildProductizedStageMessages,
  canOfferProductizedRetry,
  isProductizedTerminalFailure,
  productizedConservativeMaxCostCny,
  DemoScenario018_AGENT_IDENTITIES,
  validateProductizedRetryOutcome,
  validateProductizedProviderCompletion,
  validateProductizedStageOutput,
  type ProductizedAcceptanceSpec,
  type ProductizedRetryFeedback,
} from '../../lib/safePilotExecution';
import type { ModelCallEvidence, ModelHandoffEnvelope, OrchestratedModelResult, OrchestrationPolicy, OrchestrationRunSummary } from '../../lib/orchestration';
import {
  SAFE_PILOT_AGENT_ORDER,
  buildSafePilotExecutionProfile,
  listSafePilotBlockers,
  type SafePilotAgentCode,
  type SafePilotAuthorizationGrant,
  type SafePilotAuthorizationReference,
  type SafePilotAuthorizationSnapshot,
  type SafePilotCurrency,
  type SafePilotModelBinding,
  type SafePilotPricingInput,
  type SafePilotPreflightResult,
} from '../../lib/safePilotLauncher';

export interface SafePilotExecutionActions {
  issue: (request: Parameters<typeof preflightSafePilot>[1]) => Promise<SafePilotAuthorizationGrant>;
  runStage: (
    agentCode: SafePilotAgentCode,
    messages: ChatMessage[],
    options: {
      runId: string;
      policy: OrchestrationPolicy;
      maxTokens: number;
      handoff?: ModelHandoffEnvelope;
      authorization: SafePilotAuthorizationReference;
    },
  ) => Promise<OrchestratedModelResult | null>;
  accept: (input: {
    runId: string;
    agentCode: SafePilotAgentCode;
    evidence: ModelCallEvidence;
    decision: 'accepted' | 'rejected';
    authorization: SafePilotAuthorizationReference;
  }) => Promise<{
    evidence: ModelCallEvidence;
    run: OrchestrationRunSummary;
    authorization?: SafePilotAuthorizationSnapshot;
  }>;
  retry: (
    authorization: Pick<SafePilotAuthorizationReference, 'authorizationId' | 'authorizationToken'>,
  ) => Promise<SafePilotAuthorizationSnapshot>;
  humanAccept: (
    authorization: Pick<SafePilotAuthorizationReference, 'authorizationId' | 'authorizationToken'>,
  ) => Promise<{ authorization: SafePilotAuthorizationSnapshot; run: OrchestrationRunSummary }>;
}

type PilotExecutionPhase = 'idle' | 'issuing' | 'running' | 'waiting_retry' | 'awaiting_human' | 'completed' | 'failed';

interface PilotStageRecord {
  agentCode: SafePilotAgentCode;
  status: 'pending' | 'running' | 'provider_returned' | 'accepted' | 'rejected' | 'failed';
  text?: string;
  evidence?: ModelCallEvidence;
  problem?: string;
}

export interface BoundedPilotPlanProps {
  taskText: string;
  onClose: () => void;
  serverUrl?: string;
  serverConnected?: boolean;
  contextText?: string;
  grounding?: ProjectGroundingContext;
  modelBindings?: readonly SafePilotModelBinding[];
  approvedPricing?: SafePilotPricingInput;
  acceptanceSpec?: ProductizedAcceptanceSpec;
  issuanceEnabled?: boolean;
  executionActions?: SafePilotExecutionActions;
}
export function BoundedPilotPlan({
  taskText,
  onClose,
  serverUrl = '',
  serverConnected = false,
  contextText = '本地预检上下文；未向 Provider 发送。',
  grounding,
  modelBindings = [],
  approvedPricing,
  acceptanceSpec,
  issuanceEnabled = false,
  executionActions,
}: BoundedPilotPlanProps) {
  const plan = buildBoundedPilotPlan(taskText);
  const isExecutablePilot = Boolean(acceptanceSpec && approvedPricing && executionActions);
  const displayIdentities = acceptanceSpec?.agentIdentities ?? DemoScenario018_AGENT_IDENTITIES;
  const [currency, setCurrency] = useState<SafePilotCurrency>(approvedPricing?.currency ?? 'CNY');
  const [inputRate, setInputRate] = useState(approvedPricing?.inputRatePerMillion?.toString() ?? '');
  const [outputRate, setOutputRate] = useState(approvedPricing?.outputRatePerMillion?.toString() ?? '');
  const [maxCost, setMaxCost] = useState(approvedPricing?.maxCost?.toString() ?? '');
  const [humanWaitMinutes, setHumanWaitMinutes] = useState('5');
  const [humanApproved, setHumanApproved] = useState(false);
  const [contextApproved, setContextApproved] = useState(false);
  const [preflight, setPreflight] = useState<SafePilotPreflightResult | null>(null);
  const [preflightRequestKey, setPreflightRequestKey] = useState('');
  const [preflightError, setPreflightError] = useState('');
  const [preflightPending, setPreflightPending] = useState(false);
  const [executionPhase, setExecutionPhase] = useState<PilotExecutionPhase>('idle');
  const [executionError, setExecutionError] = useState('');
  const [authorizationGrant, setAuthorizationGrant] = useState<SafePilotAuthorizationGrant | null>(null);
  const [authorizationSnapshot, setAuthorizationSnapshot] = useState<SafePilotAuthorizationSnapshot | null>(null);
  const [stageRecords, setStageRecords] = useState<PilotStageRecord[]>(() =>
    SAFE_PILOT_AGENT_ORDER.map((agentCode) => ({ agentCode, status: 'pending' })),
  );
  const [retryStageIndex, setRetryStageIndex] = useState<number | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<ProductizedRetryFeedback | null>(null);
  const acceptedEvidenceRef = useRef<Partial<Record<SafePilotAgentCode, ModelCallEvidence>>>({});
  const parsedHumanWaitMinutes = Number(humanWaitMinutes);
  const humanWaitMinutesValid = Number.isInteger(parsedHumanWaitMinutes)
    && parsedHumanWaitMinutes >= 1
    && parsedHumanWaitMinutes <= 30;
  const effectiveGrounding = useMemo(
    () => acceptanceSpec
      ? acceptanceSpec.createGrounding(humanWaitMinutesValid ? parsedHumanWaitMinutes : 0)
      : grounding,
    [acceptanceSpec, grounding, humanWaitMinutesValid, parsedHumanWaitMinutes],
  );
  const profile = useMemo(
    () => buildSafePilotExecutionProfile(modelBindings, {
      currency,
      inputRatePerMillion: positiveNumber(inputRate),
      outputRatePerMillion: positiveNumber(outputRate),
      maxCost: positiveNumber(maxCost),
    }, {
      maxHumanWaitMs: humanWaitMinutesValid ? parsedHumanWaitMinutes * 60_000 : 0,
    }),
    [currency, humanWaitMinutesValid, inputRate, maxCost, modelBindings, outputRate, parsedHumanWaitMinutes],
  );
  const runId = `pilot-${acceptanceSpec?.runIdSegment ?? 'preflight'}-${plan.taskRef.replace('pilot-task-', '')}`;
  const resolvedContextText = effectiveGrounding?.text ?? contextText;
  const preflightRequest = useMemo(() => ({
    runId,
    taskText: acceptanceSpec?.taskText ?? plan.taskText,
    contextText: resolvedContextText.trim().slice(0, 20_000) || '空上下文边界',
    profile,
    humanApproval: {
      approved: humanApproved,
      approvalRef: humanApproved ? `${acceptanceSpec?.id ?? 'safe-pilot'}-user-approved-launch-package` : '',
    },
  }), [acceptanceSpec, humanApproved, plan.taskText, profile, resolvedContextText, runId]);
  const currentRequestKey = useMemo(() => JSON.stringify(preflightRequest), [preflightRequest]);
  const currentPreflight = preflightRequestKey === currentRequestKey ? preflight : null;
  const localBlockers = listSafePilotBlockers(preflightRequest);
  const pricingComplete = profile.budget.inputRateMicrosPerMillion !== null
    && profile.budget.outputRateMicrosPerMillion !== null
    && profile.budget.maxCostMicros !== null;
  const taskMatchesApproval = !acceptanceSpec || plan.taskText === acceptanceSpec.taskText;
  const bindingsMatchApproval = !acceptanceSpec || (
    modelBindings.length === SAFE_PILOT_AGENT_ORDER.length &&
    modelBindings.every((binding, index) =>
      binding.agentCode === SAFE_PILOT_AGENT_ORDER[index] &&
      binding.provider === acceptanceSpec.model.provider &&
      binding.model.trim().toLowerCase() === acceptanceSpec.model.modelId &&
      binding.ready,
    )
  );
  const canLaunchProductized = Boolean(
    isExecutablePilot &&
    executionActions &&
    acceptanceSpec &&
    effectiveGrounding &&
    issuanceEnabled &&
    currentPreflight?.ready &&
    contextApproved &&
    taskMatchesApproval &&
    bindingsMatchApproval &&
    executionPhase === 'idle',
  );
  const canRetryProductized = canOfferProductizedRetry(executionPhase, authorizationSnapshot);

  async function handlePreflight() {
    if (!serverConnected || !serverUrl || preflightPending) return;
    setPreflightPending(true);
    setPreflightError('');
    try {
      const result = await preflightSafePilot(serverUrl, preflightRequest);
      setPreflight(result);
      setPreflightRequestKey(currentRequestKey);
    } catch (error) {
      setPreflight(null);
      setPreflightRequestKey('');
      setPreflightError(error instanceof Error ? error.message : '安全启动包预检失败');
    } finally {
      setPreflightPending(false);
    }
  }

  function updateStage(index: number, patch: Partial<PilotStageRecord>) {
    setStageRecords((current) => current.map((record, recordIndex) =>
      recordIndex === index ? { ...record, ...patch } : record,
    ));
  }

  function authorizationReference(grant: SafePilotAuthorizationGrant): SafePilotAuthorizationReference {
    return {
      authorizationId: grant.authorization.authorizationId,
      authorizationToken: grant.authorizationToken,
      taskText: preflightRequest.taskText,
      contextText: preflightRequest.contextText,
    };
  }

  async function runProductizedStages(
    startIndex: number,
    grant: SafePilotAuthorizationGrant,
    manualRetryAttempt = false,
    repairFeedback?: ProductizedRetryFeedback,
  ) {
    if (!executionActions || !effectiveGrounding || !acceptanceSpec) throw new Error('四 Agent 执行动作、验收规格或冻结上下文缺失');
    const reference = authorizationReference(grant);
    const policy: OrchestrationPolicy = {
      expectedArtifacts: 4,
      maxCalls: 5,
      totalOutputTokens: 1_600,
      stageTimeoutMs: 45_000,
      groundingDisclosureApproved: true,
    };
    setExecutionPhase('running');
    setExecutionError('');
    setRetryStageIndex(null);
    for (let index = startIndex; index < SAFE_PILOT_AGENT_ORDER.length; index += 1) {
      const agentCode = SAFE_PILOT_AGENT_ORDER[index];
      const previousAgent = SAFE_PILOT_AGENT_ORDER[index - 1];
      const previousEvidence = previousAgent ? acceptedEvidenceRef.current[previousAgent] : undefined;
      const handoff = previousAgent && previousEvidence
        ? buildProductizedHandoff(runId, previousAgent, previousEvidence)
        : undefined;
      updateStage(index, { status: 'running', text: undefined, evidence: undefined, problem: undefined });
      try {
        const messages = buildProductizedStageMessages({
          spec: acceptanceSpec,
          agentCode,
          runId,
          grounding: effectiveGrounding,
          handoff,
          repair: manualRetryAttempt && index === startIndex ? repairFeedback : undefined,
        });
        const result = await executionActions.runStage(agentCode, messages, {
          runId,
          policy,
          maxTokens: acceptanceSpec.stageMaxTokens,
          handoff,
          authorization: reference,
        });
        if (!result?.text) throw new Error(`${agentCode} 未返回有效结果`);
        updateStage(index, {
          status: 'provider_returned',
          text: result.text,
          evidence: result.evidence,
        });
        const problem = validateProductizedProviderCompletion(result.evidence)
          ?? validateProductizedStageOutput(agentCode, result.text, effectiveGrounding)
          ?? (manualRetryAttempt && index === startIndex && repairFeedback
            ? validateProductizedRetryOutcome(result.text, repairFeedback)
            : null);
        const acceptance = await executionActions.accept({
          runId,
          agentCode,
          evidence: result.evidence,
          decision: problem ? 'rejected' : 'accepted',
          authorization: reference,
        });
        if (acceptance.authorization) setAuthorizationSnapshot(acceptance.authorization);
        if (problem) {
          const nextRepairFeedback = buildProductizedRetryFeedback({
            agentCode,
            problem,
            evidence: acceptance.evidence,
          });
          updateStage(index, { status: 'rejected', evidence: acceptance.evidence, problem });
          setRetryStageIndex(manualRetryAttempt ? null : index);
          setRetryFeedback(manualRetryAttempt ? null : nextRepairFeedback);
          setExecutionPhase(manualRetryAttempt ? 'failed' : 'waiting_retry');
          setExecutionError(problem);
          return;
        }
        acceptedEvidenceRef.current[agentCode] = acceptance.evidence;
        if (manualRetryAttempt && index === startIndex) setRetryFeedback(null);
        updateStage(index, { status: 'accepted', evidence: acceptance.evidence });
      } catch (error) {
        const problem = error instanceof Error ? error.message : `${agentCode} 调用失败`;
        updateStage(index, { status: 'failed', problem });
        const terminal = isProductizedTerminalFailure(problem, manualRetryAttempt);
        setRetryStageIndex(terminal ? null : index);
        setRetryFeedback(null);
        setExecutionPhase(terminal ? 'failed' : 'waiting_retry');
        setExecutionError(problem);
        return;
      }
    }
    setExecutionPhase('awaiting_human');
  }

  async function handleProductizedLaunch() {
    if (!canLaunchProductized || !executionActions) return;
    setExecutionPhase('issuing');
    setExecutionError('');
    setAuthorizationGrant(null);
    setAuthorizationSnapshot(null);
    setRetryFeedback(null);
    acceptedEvidenceRef.current = {};
    setStageRecords(SAFE_PILOT_AGENT_ORDER.map((agentCode) => ({ agentCode, status: 'pending' })));
    try {
      const grant = await executionActions.issue(preflightRequest);
      setAuthorizationGrant(grant);
      setAuthorizationSnapshot(grant.authorization);
      await runProductizedStages(0, grant);
    } catch (error) {
      setExecutionPhase('failed');
      setExecutionError(error instanceof Error ? error.message : '四 Agent 单 run 授权签发失败');
    }
  }

  async function handleProductizedRetry() {
    if (!executionActions || !authorizationGrant || retryStageIndex === null || !canRetryProductized) return;
    try {
      const snapshot = await executionActions.retry({
        authorizationId: authorizationGrant.authorization.authorizationId,
        authorizationToken: authorizationGrant.authorizationToken,
      });
      setAuthorizationSnapshot(snapshot);
      await runProductizedStages(retryStageIndex, authorizationGrant, true, retryFeedback ?? undefined);
    } catch (error) {
      setExecutionPhase('failed');
      setExecutionError(error instanceof Error ? error.message : '四 Agent 人工重试批准失败');
    }
  }

  async function handleProductizedHumanAcceptance() {
    if (!executionActions || !authorizationGrant || executionPhase !== 'awaiting_human') return;
    try {
      const result = await executionActions.humanAccept({
        authorizationId: authorizationGrant.authorization.authorizationId,
        authorizationToken: authorizationGrant.authorizationToken,
      });
      setAuthorizationSnapshot(result.authorization);
      setExecutionPhase('completed');
      setExecutionError('');
    } catch (error) {
      const problem = error instanceof Error ? error.message : '四 Agent 最终人工验收失败';
      if (/等待授权已过期|授权已过期/.test(problem)) setExecutionPhase('failed');
      setExecutionError(problem);
    }
  }

  function handleHumanWaitMinutesChange(value: string) {
    setHumanWaitMinutes(value);
    setContextApproved(false);
    setHumanApproved(false);
  }
  return (
    <div className="pilot-plan" role="dialog" aria-label="有界多 Agent 试运行预案">
      <header className="pilot-plan-header">
        <div>
          <span className="pilot-plan-kicker">{acceptanceSpec?.copy.kicker ?? 'SAFE LAUNCHER · PREFLIGHT ONLY'}</span>
          <h3>{acceptanceSpec?.copy.title ?? '四 Agent 安全启动包'}</h3>
          <p>{acceptanceSpec?.copy.subtitle ?? '仅预检授权边界 · 未签发 · 未执行 · 0 次模型调用'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭试运行预案"><X aria-hidden="true" /></button>
      </header>

      <div className="pilot-plan-task">
        <strong>锁定任务</strong>
        <span>{plan.taskText}</span>
        <small>{plan.taskRef} · {plan.profileId}</small>
      </div>

      <section>
        <h4><UsersRound aria-hidden="true" /> 最小参与集合与交接</h4>
        <div className="pilot-agent-grid">
          {plan.agents.map((agent, index) => (
            <article key={agent.code}>
              <span>{index + 1}</span>
              <strong>{displayIdentities[agent.code].displayLabel}</strong>
              <p>{agent.responsibility}</p>
              <small>完成证据：{agent.requiredEvidence}</small>
            </article>
          ))}
        </div>
        <ol className="pilot-handoffs">
          {plan.handoffs.map((handoff) => (
            <li key={`${handoff.from}-${handoff.to}`}>
              <strong>{displayIdentities[handoff.from].displayLabel} → {handoff.to === 'HUMAN' ? 'HUMAN（人工）' : displayIdentities[handoff.to].displayLabel}</strong><span>{handoff.evidence}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h4><Gauge aria-hidden="true" /> 调用、Token、超时与费用边界</h4>
        <dl className="pilot-budget-grid">
          <div><dt>计划 / 最大调用</dt><dd>{plan.budget.plannedCalls} / {plan.budget.maxCalls} 次</dd></div>
          <div><dt>人工重试</dt><dd>最多 {plan.budget.maxManualRetries} 次</dd></div>
          <div><dt>输入保守上界</dt><dd>{plan.budget.conservativeInputTokens.toLocaleString()} tokens</dd></div>
          <div><dt>输出总预算</dt><dd>{plan.budget.totalOutputTokens.toLocaleString()} tokens</dd></div>
          <div><dt>阶段 / 活跃总计</dt><dd>{plan.budget.perStageTimeoutSeconds}s / {plan.budget.totalTimeoutSeconds}s</dd></div>
          <div><dt>人工等待授权</dt><dd>{humanWaitMinutesValid ? `${parsedHumanWaitMinutes} 分钟 / 次` : '设置无效'}</dd></div>
          <div>
            <dt>费用</dt>
            <dd className={pricingComplete ? undefined : 'is-blocked'}>
              {currentPreflight?.ready
                ? `${currency} 费率与硬上限已通过预检`
                : pricingComplete
                  ? `${currency} 费率与硬上限已填写，待预检`
                  : '费率未确认，执行阻塞'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="pilot-launch-preflight" aria-label="安全启动包预检">
        <h4><Fingerprint aria-hidden="true" /> 服务端哈希与费用预检</h4>
        <p>只向本地 AgentHub 服务发送任务、只读摘要和不含 Key 的执行档案；不会签发可执行票据，也不会调用 Provider。</p>
        <div className="pilot-pricing-grid">
          <label><span>币种</span><select value={currency} disabled={isExecutablePilot} onChange={(event) => setCurrency(event.target.value as SafePilotCurrency)}><option value="CNY">CNY</option><option value="USD">USD</option></select></label>
          <label><span>输入费率 / 百万 Token</span><input inputMode="decimal" value={inputRate} disabled={isExecutablePilot} onChange={(event) => setInputRate(event.target.value)} placeholder="待确认" /></label>
          <label><span>输出费率 / 百万 Token</span><input inputMode="decimal" value={outputRate} disabled={isExecutablePilot} onChange={(event) => setOutputRate(event.target.value)} placeholder="待确认" /></label>
          <label><span>本次费用硬上限</span><input inputMode="decimal" value={maxCost} disabled={isExecutablePilot} onChange={(event) => setMaxCost(event.target.value)} placeholder="待确认" /></label>
          {isExecutablePilot ? <label><span>每次人工等待（分钟）</span><input type="number" inputMode="numeric" min="1" max="30" step="1" value={humanWaitMinutes} disabled={executionPhase !== 'idle'} onChange={(event) => handleHumanWaitMinutesChange(event.target.value)} aria-describedby="pilot-human-wait-help" /></label> : null}
        </div>
        {isExecutablePilot ? <small id="pilot-human-wait-help" className="pilot-human-wait-help">可设置 1–30 分钟，默认 5 分钟，签发后锁定。人工重试与最终确认分别计时；等待期间暂停 240 秒活跃时钟。</small> : null}
        {isExecutablePilot && acceptanceSpec && approvedPricing ? (
          <div className="pilot-approved-pricing">
            <strong>已批准费用证据</strong>
            <span>缓存未命中输入 ¥{approvedPricing.inputRatePerMillion}/M · 输出 ¥{approvedPricing.outputRatePerMillion}/M · 缓存命中 ¥{acceptanceSpec.pricingEvidence.cacheHitInputRatePerMillion}/M（仅信息）</span>
            <span>保守最大费用 ¥{productizedConservativeMaxCostCny(approvedPricing).toFixed(4)} / 硬上限 ¥{approvedPricing.maxCost?.toFixed(4)}</span>
            <small>证据 SHA-256 {acceptanceSpec.pricingEvidence.evidenceSha256.slice(0, 16)}…</small>
          </div>
        ) : null}
        {isExecutablePilot && effectiveGrounding ? (
          <details className="pilot-context-disclosure">
            <summary>查看将发送的完整脱敏上下文（{effectiveGrounding.text.length} 字符）</summary>
            <pre>{effectiveGrounding.text}</pre>
            <small>仅包含 P/A/T/R/V/K/N/E 八条冻结事实；不含源码、Key、路径或业务数据。</small>
          </details>
        ) : null}
        {isExecutablePilot ? (
          <label className="pilot-human-confirmation">
            <input type="checkbox" checked={contextApproved} onChange={(event) => setContextApproved(event.target.checked)} />
            <span>我已查看并批准上方完整脱敏上下文用于本次单 run。</span>
          </label>
        ) : null}
        <label className="pilot-human-confirmation">
          <input type="checkbox" checked={humanApproved} onChange={(event) => setHumanApproved(event.target.checked)} />
          <span>{isExecutablePilot
            ? '我确认任务、模型、预算、费用和一次人工重试策略，仅授权本次单 run。'
            : '我确认这里只校验启动包，不授权任何模型调用。'}</span>
        </label>
        <div className="pilot-preflight-actions">
          <button type="button" onClick={() => void handlePreflight()} disabled={!serverConnected || preflightPending}>
            {preflightPending ? '正在校验…' : '校验安全启动包'}
          </button>
          <small>{serverConnected ? `本地阻塞项 ${localBlockers.length} 个` : '本地服务未连接，保持阻塞'}</small>
        </div>
        {currentPreflight ? (
          <div className={currentPreflight.ready ? 'pilot-preflight-result is-ready' : 'pilot-preflight-result is-blocked'}>
            <strong>{currentPreflight.ready ? '预检通过，但仍未签发' : '预检阻塞'}</strong>
            <span>task {currentPreflight.taskSha256.slice(0, 12)} · context {currentPreflight.contextSha256.slice(0, 12)} · profile {currentPreflight.profileSha256.slice(0, 12)}</span>
            {currentPreflight.blockers.length ? <ul>{currentPreflight.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <small>仍需独立 Provider 与真实启动授权。</small>}
          </div>
        ) : null}
        {preflightError ? <p className="pilot-preflight-error" role="alert">{preflightError}</p> : null}
      </section>

      {isExecutablePilot && acceptanceSpec ? (
        <section className="pilot-execution-panel" aria-label={acceptanceSpec.copy.executionGateTitle}>
          <h4><PlayCircle aria-hidden="true" /> {acceptanceSpec.copy.executionGateTitle}</h4>
          <div className="pilot-execution-gates">
            <span className={taskMatchesApproval ? 'is-ready' : 'is-blocked'}>任务锁定：{taskMatchesApproval ? 'PASS' : 'FAIL'}</span>
            <span className={bindingsMatchApproval ? 'is-ready' : 'is-blocked'}>模型绑定：{bindingsMatchApproval ? `四个均为 ${acceptanceSpec.model.displayName}` : '与批准值不一致'}</span>
            <span className={issuanceEnabled ? 'is-ready' : 'is-blocked'}>授权签发：{issuanceEnabled ? '已启用' : '服务端仍关闭'}</span>
            <span className={contextApproved ? 'is-ready' : 'is-blocked'}>上下文：{contextApproved ? '已确认' : '待确认'}</span>
            <span className={currentPreflight?.ready ? 'is-ready' : 'is-blocked'}>预检：{currentPreflight?.ready ? 'PASS' : '未通过'}</span>
          </div>
          <button
            type="button"
            className="pilot-launch-button"
            onClick={() => void handleProductizedLaunch()}
            disabled={!canLaunchProductized}
          >
            <PlayCircle aria-hidden="true" />
            {executionPhase === 'issuing' ? '正在签发…' : acceptanceSpec.copy.launchButton}
          </button>
          <ol className="pilot-stage-results">
            {stageRecords.map((record) => (
              <li key={record.agentCode} className={`is-${record.status}`}>
                <header><strong>{acceptanceSpec.agentIdentities[record.agentCode].displayLabel}</strong><span>{stageStatusLabel(record.status)}</span></header>
                {record.text ? <p>{record.text}</p> : null}
                {record.evidence ? <small>{record.evidence.evidenceId} · {record.evidence.outputSha256.slice(0, 16)}…</small> : null}
                {record.problem ? <small className="is-problem">{record.problem}</small> : null}
              </li>
            ))}
          </ol>
          {authorizationSnapshot ? (
            <dl className="pilot-live-budget">
              <div><dt>调用</dt><dd>{authorizationSnapshot.usage.callsStarted}/5</dd></div>
              <div><dt>输入保守计数</dt><dd>{authorizationSnapshot.usage.reservedInputTokens}/64,000</dd></div>
              <div><dt>输出</dt><dd>{authorizationSnapshot.usage.observedOutputTokens}/1,600</dd></div>
              <div><dt>费用</dt><dd>¥{(authorizationSnapshot.usage.observedCostMicros / 1_000_000).toFixed(6)}/¥1</dd></div>
              <div><dt>活跃计时</dt><dd>{Math.ceil(authorizationSnapshot.usage.activeElapsedMs / 1_000)}/240 秒</dd></div>
              <div><dt>人工等待</dt><dd>{authorizationSnapshot.humanWaitDeadlineAt ? `授权至 ${formatClockTime(authorizationSnapshot.humanWaitDeadlineAt)}` : `${parsedHumanWaitMinutes} 分/次`}</dd></div>
            </dl>
          ) : null}
          {executionError ? <p className="pilot-execution-error" role="alert">{executionError}</p> : null}
          {canRetryProductized && retryFeedback ? (
            <div className="pilot-retry-feedback" aria-label="反馈绑定修复单">
              <strong>本次重试将执行定向修复</strong>
              <span>{retryFeedback.validationProblem}</span>
              <small>{retryFeedback.validationCode} · evidence {retryFeedback.evidenceId} · 不发送上一版正文</small>
            </div>
          ) : null}
          {canRetryProductized ? (
            <button type="button" className="pilot-retry-button" onClick={() => void handleProductizedRetry()}>
              <RotateCcw aria-hidden="true" /> 人工批准唯一一次重试
            </button>
          ) : null}
          {executionPhase === 'failed' ? <p className="pilot-complete-message is-failed">{acceptanceSpec.copy.failed}</p> : null}
          {executionPhase === 'awaiting_human' ? (
            <button type="button" className="pilot-human-accept-button" onClick={() => void handleProductizedHumanAcceptance()}>
              <CheckCircle2 aria-hidden="true" /> 最终人工验收并完成
            </button>
          ) : null}
          {executionPhase === 'completed' ? <p className="pilot-complete-message">{acceptanceSpec.copy.completed}</p> : null}
        </section>
      ) : null}

      <div className="pilot-plan-columns">
        <section>
          <h4><ShieldCheck aria-hidden="true" /> 权限与失败接管</h4>
          <p className="pilot-permission-line">预案权限：无。未来若获执行授权，仅允许 call_model；checkpoint、保存、构建、补丁均关闭。</p>
          <ul>{plan.failureRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </section>
        <section>
          <h4><CheckCircle2 aria-hidden="true" /> UI 验收记录</h4>
          <ul>{plan.auditAcceptance.map((item) => <li key={item.channel}><strong>{item.channel}：</strong>{item.rule}</li>)}</ul>
        </section>
      </div>

      <div className="pilot-plan-columns">
        <section className="pilot-pass-box">
          <h4>PASS</h4>
          <ul>{plan.passStandards.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </section>
        <section className="pilot-fail-box">
          <h4>FAIL</h4>
          <ul>{plan.failStandards.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </section>
      </div>

      <footer className="pilot-plan-footer">
        <Ban aria-hidden="true" />
        <div>
          <strong>{isExecutablePilot ? '产品化严格单 run 边界' : '真实执行入口未开放'}</strong>
          <span>{isExecutablePilot ? '未通过预检、上下文确认或服务端签发门时不能启动；最终完成仍需人工验收。' : plan.executionBlockers.join('；')}</span>
        </div>
        <button type="button" onClick={onClose}>关闭预案</button>
      </footer>
    </div>
  );
}

function positiveNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatClockTime(value: number): string {
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false });
}

function stageStatusLabel(status: PilotStageRecord['status']): string {
  return {
    pending: '待开始',
    running: '调用中',
    provider_returned: '已返回（待任务验收）',
    accepted: '已通过本地验收',
    rejected: '本地验收未通过',
    failed: '调用失败',
  }[status];
}
