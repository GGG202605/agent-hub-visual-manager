import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  callConnector,
  adoptFirstTestedProvider,
  connectorConfigsMatch,
  createConnectorReadinessId,
  createDefaultSlot,
  INITIAL_BINDINGS,
  isSlotReady,
  planAgentProviderPreparation,
  resolveAgentProvider,
  selectUnambiguousUnifiedProvider,
  testConnector,
  validateConnectorApiKey,
  type ChatMessage,
  type ConnectorBindings,
  type ConnectorConfig,
  type ConnectorSlot,
  type ProviderKind,
  type ReadyConnectorConfig,
} from '../lib/agentConnectors';
import {
  acceptModelEvidence,
  acceptSafePilotHumanFinal,
  approveSafePilotRetry,
  callViaServer,
  issueSafePilotAuthorization,
  type DevelopmentModelAuthorization,
  type ModelResponseFormat,
} from '../lib/serverBridge';
import {
  createOrchestrationPolicy,
  type ModelCallEvidence,
  type ModelHandoffEnvelope,
  type OrchestratedModelResult,
  type OrchestrationPolicy,
  type OrchestrationRunSummary,
} from '../lib/orchestration';
import type {
  SafePilotAuthorizationGrant,
  SafePilotAuthorizationReference,
  SafePilotAuthorizationSnapshot,
  SafePilotPreflightRequest,
} from '../lib/safePilotLauncher';
import { useProjectData } from './ProjectDataContext';

/**
 * v0.4 智能体接入状态层。
 * 四个 provider 槽位（claude/openai/deepseek/custom）+ Agent 绑定表 + 统一接入开关。
 * 所有状态（含 API Key）仅存内存：刷新页面即清空，不落任何持久化存储。
 */

interface ConnectorContextValue {
  slots: Record<ProviderKind, ConnectorSlot>;
  bindings: ConnectorBindings;
  updateConfig: (kind: ProviderKind, patch: Partial<ConnectorConfig>) => void;
  runTest: (kind: ProviderKind) => Promise<boolean>;
  ensureAgentProviders: (
    agentIds: string[],
    options?: { signal?: AbortSignal; onActiveRunId?: (runId: string) => void },
  ) => Promise<{
    testedKinds: ProviderKind[];
    failedKinds: ProviderKind[];
    missingAgents: string[];
    ambiguousKinds: ProviderKind[];
  }>;
  setUnified: (unified: boolean, kind?: ProviderKind) => void;
  bindAgent: (agentId: string, kind: ProviderKind | 'none') => void;
  /** 推演调用入口：返回该 Agent 生效且就绪的连接配置，未接入则为 null */
  resolveReadyConfig: (agentId: string) => ReadyConnectorConfig | null;
  /**
   * 统一对话入口（v0.5）：本地服务已连接时自动经服务端转发（免 CORS），
   * 否则浏览器直连。Agent 未接入/未就绪返回 null。
   */
  chat: (
    agentId: string,
    messages: ChatMessage[],
    options?: {
      runId?: string;
      maxTokens?: number;
      groundingDisclosureApproved?: boolean;
      modelOverride?: string;
      developmentAuthorization?: DevelopmentModelAuthorization;
      responseFormat?: ModelResponseFormat;
      signal?: AbortSignal;
    },
  ) => Promise<string | null>;
  /** 真实协同入口：仅经本地服务执行，并返回预算账本与哈希证据。 */
  orchestrate: (
    agentId: string,
    messages: ChatMessage[],
    options: {
      runId: string;
      policy: OrchestrationPolicy;
      maxTokens?: number;
      handoff?: ModelHandoffEnvelope;
      safePilotAuthorization?: SafePilotAuthorizationReference;
      signal?: AbortSignal;
    },
  ) => Promise<OrchestratedModelResult | null>;
  acceptOrchestration: (input: {
    runId: string;
    agentId: string;
    evidence: ModelCallEvidence;
    decision: 'accepted' | 'rejected';
    safePilotAuthorization?: Pick<SafePilotAuthorizationReference, 'authorizationId' | 'authorizationToken'>;
  }) => Promise<{
    evidence: ModelCallEvidence;
    run: OrchestrationRunSummary;
    authorization?: SafePilotAuthorizationSnapshot;
  }>;
  issueSafePilot: (request: SafePilotPreflightRequest) => Promise<SafePilotAuthorizationGrant>;
  approveSafePilotRetry: (
    reference: Pick<SafePilotAuthorizationReference, 'authorizationId' | 'authorizationToken'>,
  ) => Promise<SafePilotAuthorizationSnapshot>;
  acceptSafePilotHumanFinal: (
    reference: Pick<SafePilotAuthorizationReference, 'authorizationId' | 'authorizationToken'>,
  ) => Promise<{ authorization: SafePilotAuthorizationSnapshot; run: OrchestrationRunSummary }>;
  /** 当前是否经本地服务转发 */
  viaServer: boolean;
}

const ConnectorContext = createContext<ConnectorContextValue | null>(null);

const PROVIDER_KINDS: ProviderKind[] = ['claude', 'openai', 'deepseek', 'custom'];

export function ConnectorProvider({ children }: { children: ReactNode }) {
  const { server, runtime } = useProjectData();
  const [slots, setSlots] = useState<Record<ProviderKind, ConnectorSlot>>(() => ({
    claude: createDefaultSlot('claude'),
    openai: createDefaultSlot('openai'),
    deepseek: createDefaultSlot('deepseek'),
    custom: createDefaultSlot('custom'),
  }));
  const [bindings, setBindings] = useState<ConnectorBindings>(INITIAL_BINDINGS);
  /** 供异步回调读取最新 slots，避免 setState-updater 反模式 */
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const testPromisesRef = useRef<Partial<Record<ProviderKind, Promise<boolean>>>>({});

  const updateSlot = useCallback((kind: ProviderKind, update: (slot: ConnectorSlot) => ConnectorSlot) => {
    const next = { ...slotsRef.current, [kind]: update(slotsRef.current[kind]) };
    slotsRef.current = next;
    setSlots(next);
  }, []);

  const commitBindings = useCallback((next: ConnectorBindings) => {
    bindingsRef.current = next;
    setBindings(next);
  }, []);

  const updateConfig = useCallback((kind: ProviderKind, patch: Partial<ConnectorConfig>) => {
    updateSlot(kind, (slot) => ({
      ...slot,
      config: { ...slot.config, ...patch, kind },
      testState: 'untested',
      testMessage: '配置已修改，未测试',
      readinessId: null,
    }));
    if (bindingsRef.current.unified) {
      const unifiedKind = selectUnambiguousUnifiedProvider(
        slotsRef.current,
        bindingsRef.current.unifiedKind,
      );
      if (unifiedKind !== bindingsRef.current.unifiedKind) {
        commitBindings({ ...bindingsRef.current, unifiedKind });
      }
    }
  }, [commitBindings, updateSlot]);

  const runTest = useCallback((
    kind: ProviderKind,
    options: { signal?: AbortSignal; onActiveRunId?: (runId: string) => void } = {},
  ): Promise<boolean> => {
    const existing = testPromisesRef.current[kind];
    if (existing) return existing;
    const task = (async () => {
      const config = { ...slotsRef.current[kind].config };
      updateSlot(kind, (slot) => ({ ...slot, testState: 'testing', testMessage: '测试中…', readinessId: null }));
      try {
        const apiKeyProblem = validateConnectorApiKey(config.apiKey);
        if (apiKeyProblem) throw new Error(apiKeyProblem);
        const testConfig = kind === 'deepseek' ? { ...config, thinkingEnabled: false } : config;
        const timeoutSignal = AbortSignal.timeout(15_000);
        const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
        let route = '浏览器直连';
        if (server.connected) {
          const runId = `connector-test-${kind}-${Date.now().toString(36)}`;
          options.onActiveRunId?.(runId);
          const result = await callViaServer(
            server.url,
            testConfig,
            [{ role: 'user', content: '连接测试。请仅回复：通' }],
            {
              agentId: 'AG-COORD',
              runId,
              orchestration: createOrchestrationPolicy(1, { totalOutputTokens: 64, stageTimeoutMs: 15_000 }),
              maxTokens: 64,
              signal,
            },
          );
          runtime.upsertOrchestrationRun(result.run);
          route = '本地 AgentHub 网关';
        } else {
          if (kind === 'deepseek' || kind === 'openai') {
            throw new Error('请先连接本地服务，避免云端接口的浏览器 CORS 限制');
          }
          await testConnector(testConfig, signal);
        }
        if (!connectorConfigsMatch(slotsRef.current[kind].config, config)) {
          updateSlot(kind, (slot) => ({ ...slot, testState: 'untested', testMessage: '配置在测试期间已修改，未采用旧测试结果', readinessId: null }));
          return false;
        }
        updateSlot(kind, (slot) => ({
          ...slot,
          testState: 'ok',
          testMessage: `连接成功（${route}）`,
          readinessId: createConnectorReadinessId(),
        }));
        const nextBindings = adoptFirstTestedProvider(bindingsRef.current, kind);
        if (nextBindings !== bindingsRef.current) commitBindings(nextBindings);
        return true;
      } catch (error) {
        if (!connectorConfigsMatch(slotsRef.current[kind].config, config)) {
          updateSlot(kind, (slot) => ({ ...slot, testState: 'untested', testMessage: '配置在测试期间已修改，未采用旧测试结果', readinessId: null }));
          return false;
        }
        const reason = error instanceof Error ? error.message : '未知错误';
        updateSlot(kind, (slot) => ({ ...slot, testState: 'error', testMessage: `连接失败：${reason}`, readinessId: null }));
        return false;
      } finally {
        options.onActiveRunId?.('');
      }
    })();
    testPromisesRef.current[kind] = task;
    void task.then(
      () => { if (testPromisesRef.current[kind] === task) delete testPromisesRef.current[kind]; },
      () => { if (testPromisesRef.current[kind] === task) delete testPromisesRef.current[kind]; },
    );
    return task;
  }, [commitBindings, runtime, server.connected, server.url, updateSlot]);

  const setUnified = useCallback((unified: boolean, kind?: ProviderKind) => {
    const current = bindingsRef.current;
    const unifiedKind = kind
      ?? (unified
        ? selectUnambiguousUnifiedProvider(slotsRef.current, current.unifiedKind)
        : current.unifiedKind);
    commitBindings({
      ...current,
      unified,
      unifiedKind,
    });
  }, [commitBindings]);

  const bindAgent = useCallback((agentId: string, kind: ProviderKind | 'none') => {
    commitBindings({
      ...bindingsRef.current,
      perAgent: { ...bindingsRef.current.perAgent, [agentId]: kind },
    });
  }, [commitBindings]);

  const resolveReadyConfig = useCallback(
    (agentId: string): ReadyConnectorConfig | null => {
      const kind = resolveAgentProvider(bindingsRef.current, agentId);
      if (kind === 'none') return null;
      const slot = slotsRef.current[kind];
      return isSlotReady(slot) ? { ...slot.config, readinessId: slot.readinessId as string } : null;
    },
    [],
  );

  const ensureAgentProviders = useCallback(async (
    agentIds: string[],
    options: { signal?: AbortSignal; onActiveRunId?: (runId: string) => void } = {},
  ) => {
    const plan = planAgentProviderPreparation(slotsRef.current, bindingsRef.current, agentIds);
    if (plan.candidateKind && isSlotReady(slotsRef.current[plan.candidateKind])) {
      const nextBindings = adoptFirstTestedProvider(bindingsRef.current, plan.candidateKind);
      if (nextBindings !== bindingsRef.current) commitBindings(nextBindings);
    }
    const testedKinds: ProviderKind[] = [];
    const failedKinds: ProviderKind[] = [];
    for (const kind of plan.kindsToTest) {
      if (options.signal?.aborted) break;
      if (await runTest(kind, options)) testedKinds.push(kind);
      else failedKinds.push(kind);
    }
    return {
      testedKinds,
      failedKinds,
      missingAgents: agentIds.filter((agentId) => !resolveReadyConfig(agentId)),
      ambiguousKinds: plan.ambiguousKinds,
    };
  }, [commitBindings, resolveReadyConfig, runTest]);

  const viaServer = server.connected;

  const chat = useCallback(
    async (
      agentId: string,
      messages: ChatMessage[],
      options?: {
        runId?: string;
        maxTokens?: number;
        groundingDisclosureApproved?: boolean;
        modelOverride?: string;
        developmentAuthorization?: DevelopmentModelAuthorization;
        responseFormat?: ModelResponseFormat;
        signal?: AbortSignal;
      },
    ): Promise<string | null> => {
      const config = resolveReadyConfig(agentId);
      if (!config) return null;
      const { modelOverride, ...requestOptions } = options ?? {};
      if (modelOverride !== undefined && !/^[a-zA-Z0-9._:/-]{1,160}$/.test(modelOverride)) {
        throw new Error('自主模型路由给出了非法 model ID');
      }
      const routedConfig = modelOverride ? { ...config, model: modelOverride } : config;
      if (viaServer) {
        const result = await callViaServer(server.url, routedConfig, messages, {
          ...requestOptions,
          agentId,
          runId: requestOptions.runId ?? `adhoc-${Date.now()}`,
          orchestration: createOrchestrationPolicy(1, {
            totalOutputTokens: requestOptions.maxTokens,
            stageTimeoutMs: 120_000,
            groundingDisclosureApproved: requestOptions.groundingDisclosureApproved,
          }),
        });
        runtime.upsertOrchestrationRun(result.run);
        return result.text;
      }
      if (requestOptions.developmentAuthorization) {
        throw new Error('独立开发模型调用必须经本地服务执行预算门禁');
      }
      return callConnector(routedConfig, messages, requestOptions);
    },
    [resolveReadyConfig, viaServer, server.url, runtime],
  );

  const orchestrate = useCallback(
    async (
      agentId: string,
      messages: ChatMessage[],
      options: {
        runId: string;
        policy: OrchestrationPolicy;
        maxTokens?: number;
        handoff?: ModelHandoffEnvelope;
        safePilotAuthorization?: SafePilotAuthorizationReference;
        signal?: AbortSignal;
      },
    ): Promise<OrchestratedModelResult | null> => {
      if (!viaServer) return null;
      const config = resolveReadyConfig(agentId);
      if (!config) return null;
      const result = await callViaServer(server.url, config, messages, {
        agentId,
        runId: options.runId,
        orchestration: options.policy,
        maxTokens: options.maxTokens,
        handoff: options.handoff,
        safePilotAuthorization: options.safePilotAuthorization,
        signal: options.signal,
      });
      runtime.upsertOrchestrationRun(result.run);
      return result;
    },
    [resolveReadyConfig, runtime, server.url, viaServer],
  );

  const acceptOrchestration = useCallback(
    async (input: {
      runId: string;
      agentId: string;
      evidence: ModelCallEvidence;
      decision: 'accepted' | 'rejected';
      safePilotAuthorization?: Pick<SafePilotAuthorizationReference, 'authorizationId' | 'authorizationToken'>;
    }): Promise<{
      evidence: ModelCallEvidence;
      run: OrchestrationRunSummary;
      authorization?: SafePilotAuthorizationSnapshot;
    }> => {
      if (!viaServer) throw new Error('本地 AgentHub 网关未连接');
      const accepted = await acceptModelEvidence(server.url, {
        runId: input.runId,
        agentId: input.agentId,
        evidenceId: input.evidence.evidenceId,
        outputSha256: input.evidence.outputSha256,
        decision: input.decision,
        safePilotAuthorization: input.safePilotAuthorization,
      });
      runtime.upsertOrchestrationRun(accepted.run);
      return accepted;
    },
    [runtime, server.url, viaServer],
  );

  const issueSafePilot = useCallback(
    async (request: SafePilotPreflightRequest): Promise<SafePilotAuthorizationGrant> => {
      if (!viaServer) throw new Error('本地 AgentHub 网关未连接');
      return issueSafePilotAuthorization(server.url, request);
    },
    [server.url, viaServer],
  );

  const approvePilotRetry = useCallback(
    async (
      reference: Pick<SafePilotAuthorizationReference, 'authorizationId' | 'authorizationToken'>,
    ): Promise<SafePilotAuthorizationSnapshot> => {
      if (!viaServer) throw new Error('本地 AgentHub 网关未连接');
      return approveSafePilotRetry(server.url, reference);
    },
    [server.url, viaServer],
  );

  const acceptPilotHumanFinal = useCallback(
    async (
      reference: Pick<SafePilotAuthorizationReference, 'authorizationId' | 'authorizationToken'>,
    ): Promise<{ authorization: SafePilotAuthorizationSnapshot; run: OrchestrationRunSummary }> => {
      if (!viaServer) throw new Error('本地 AgentHub 网关未连接');
      const result = await acceptSafePilotHumanFinal(server.url, reference);
      runtime.upsertOrchestrationRun(result.run);
      return result;
    },
    [runtime, server.url, viaServer],
  );

  const value = useMemo<ConnectorContextValue>(
    () => ({
      slots,
      bindings,
      updateConfig,
      runTest,
      ensureAgentProviders,
      setUnified,
      bindAgent,
      resolveReadyConfig,
      chat,
      orchestrate,
      acceptOrchestration,
      issueSafePilot,
      approveSafePilotRetry: approvePilotRetry,
      acceptSafePilotHumanFinal: acceptPilotHumanFinal,
      viaServer,
    }),
    [
      slots,
      bindings,
      updateConfig,
      runTest,
      ensureAgentProviders,
      setUnified,
      bindAgent,
      resolveReadyConfig,
      chat,
      orchestrate,
      acceptOrchestration,
      issueSafePilot,
      approvePilotRetry,
      acceptPilotHumanFinal,
      viaServer,
    ],
  );

  return <ConnectorContext.Provider value={value}>{children}</ConnectorContext.Provider>;
}

export function useConnectors(): ConnectorContextValue {
  const value = useContext(ConnectorContext);
  if (!value) throw new Error('useConnectors 必须在 ConnectorProvider 内使用');
  return value;
}

export { PROVIDER_KINDS };
