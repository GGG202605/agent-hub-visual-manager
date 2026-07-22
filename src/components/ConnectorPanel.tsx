import { Cable, CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import {
  PROVIDER_PRESETS,
  resolveAgentProvider,
  validateConnectorApiKey,
  type ProviderKind,
} from '../lib/agentConnectors';
import { PROVIDER_KINDS, useConnectors } from '../datasource/ConnectorContext';
import { useProjectData } from '../datasource/ProjectDataContext';
import { getAgentPersona } from '../lib/agentPersonas';

/**
 * v0.4 智能体接入面板：
 * 上：四个 provider 槽位配置（端点/模型/Key + 连接测试）；
 * 中：统一接入开关；下：每 Agent 绑定表。
 * Key 仅存内存，刷新即失；推演时绑定的 Agent 用真实智能体生成讲解词。
 */
export function ConnectorPanel() {
  const { slots, bindings, updateConfig, runTest, setUnified, bindAgent } = useConnectors();
  const { dashboard, server } = useProjectData();
  const connectionRoute = server.connected
    ? '测试与调用通过本地 AgentHub 网关转发'
    : '本地服务未连接；DeepSeek/OpenAI 测试将保持禁用';

  return (
    <div className="connector-panel">
      <p className="connector-intro">
        在对应服务槽位输入 Key。你可以在这里手动测试和绑定；独立开发新会话会在只读预检后测试动态编队需要的唯一或显式绑定配置，恢复会话则先复用本地证据，只有确需模型时才自动测试。真实模型失败时不会伪装成功，任务会进入可见的失败或阻塞状态。
      </p>

      <div className="connector-safety">
        <ShieldAlert aria-hidden="true" />
        <span>
          API Key 仅保存在当前页面内存，刷新即清空；调用时只发送给本地网关和所选模型服务，不写入磁盘、日志、检查点或 Git。{connectionRoute}。
        </span>
      </div>

      {/* Provider 槽位 */}
      <section className="connector-slots" aria-label="智能体端点配置">
        {PROVIDER_KINDS.map((kind) => {
          const slot = slots[kind];
          const preset = PROVIDER_PRESETS[kind];
          const apiKeyProblem = slot.config.apiKey ? validateConnectorApiKey(slot.config.apiKey) : null;
          return (
            <details key={kind} className={`connector-slot test-${slot.testState}`}>
              <summary>
                <Cable aria-hidden="true" />
                <strong>{preset.label}</strong>
                <TestBadge state={slot.testState} />
              </summary>
              <div className="connector-slot-body">
                <label>
                  <span>端点 Base URL</span>
                  <input
                    type="text"
                    value={slot.config.baseUrl}
                    onChange={(event) => updateConfig(kind, { baseUrl: event.target.value })}
                    placeholder={preset.defaultBaseUrl}
                  />
                </label>
                <label>
                  <span>模型</span>
                  {preset.modelOptions ? (
                    <select
                      value={slot.config.model}
                      onChange={(event) => updateConfig(kind, { model: event.target.value })}
                      aria-label={`${preset.label} 模型`}
                    >
                      {preset.modelOptions.map((model) => (
                        <option key={model.id} value={model.id}>{model.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={slot.config.model}
                      onChange={(event) => updateConfig(kind, { model: event.target.value })}
                      placeholder={preset.defaultModel}
                    />
                  )}
                </label>
                <label>
                  <span>API Key</span>
                  <input
                    type="password"
                    value={slot.config.apiKey}
                    onChange={(event) => updateConfig(kind, { apiKey: event.target.value.trim() })}
                    placeholder="仅粘贴原始 Key，例如 sk-…"
                    autoComplete="off"
                    name={`agenthub-${kind}-api-key-memory-only`}
                    aria-label={`${preset.label} API Key（仅内存）`}
                  />
                </label>
                {kind === 'deepseek' ? (
                  <label className="connector-thinking-option">
                    <input
                      type="checkbox"
                      checked={Boolean(slot.config.thinkingEnabled)}
                      onChange={(event) => updateConfig(kind, { thinkingEnabled: event.target.checked })}
                    />
                    <span>启用思考模式（增加延迟与输出用量）</span>
                  </label>
                ) : null}
                <div className="connector-slot-foot">
                  <small>
                    {apiKeyProblem ?? `${preset.note} · ${slot.config.apiKey ? 'Key 已载入当前内存' : '等待输入 Key'}`}
                  </small>
                  <button
                    type="button"
                    onClick={() => void runTest(kind)}
                    disabled={slot.testState === 'testing' || !slot.config.apiKey || Boolean(apiKeyProblem) || (!server.connected && (kind === 'deepseek' || kind === 'openai'))}
                  >
                    {slot.testState === 'testing' ? '测试中…' : '测试连接'}
                  </button>
                </div>
                <p className={`connector-test-msg test-${slot.testState}`}>{slot.testMessage}</p>
              </div>
            </details>
          );
        })}
      </section>

      {/* 统一接入 */}
      <section className="connector-unified" aria-label="统一接入">
        <label className="connector-switch">
          <input
            type="checkbox"
            checked={bindings.unified}
            onChange={(event) => setUnified(event.target.checked)}
          />
          <span>全部 Agent 统一接入同一智能体</span>
        </label>
        {bindings.unified ? (
          <select
            value={bindings.unifiedKind}
            onChange={(event) => setUnified(true, event.target.value as ProviderKind)}
            aria-label="统一接入目标"
          >
            {PROVIDER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {PROVIDER_PRESETS[kind].label}
              </option>
            ))}
          </select>
        ) : null}
      </section>

      {/* 每 Agent 绑定 */}
      <section className="connector-bindings" aria-label="Agent 绑定">
        <header>逐个绑定{bindings.unified ? '（统一接入开启中，以下配置暂不生效）' : ''}</header>
        <ul className={bindings.unified ? 'is-muted' : ''}>
          {dashboard.agents.map((agent) => {
            const persona = getAgentPersona(agent.code, agent.layer);
            const bound = resolveAgentProvider(bindings, agent.id);
            return (
              <li key={agent.id}>
                <span className="connector-agent">
                  <strong>{persona.figure}</strong>
                  <small>{agent.nameZh}</small>
                </span>
                <select
                  value={bindings.unified ? bindings.unifiedKind : bindings.perAgent[agent.id] ?? 'none'}
                  disabled={bindings.unified}
                  onChange={(event) => bindAgent(agent.id, event.target.value as ProviderKind | 'none')}
                  aria-label={`${agent.nameZh} 接入`}
                >
                  <option value="none">不接入（模板话术）</option>
                  {PROVIDER_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {PROVIDER_PRESETS[kind].label}
                    </option>
                  ))}
                </select>
                <span className={`connector-bound-chip${bound !== 'none' ? ' is-on' : ''}`}>
                  {bound === 'none' ? '模板' : PROVIDER_PRESETS[bound].label.split('（')[0]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function TestBadge({ state }: { state: 'untested' | 'testing' | 'ok' | 'error' }) {
  if (state === 'ok') return <CheckCircle2 className="badge-ok" aria-label="连接正常" />;
  if (state === 'error') return <XCircle className="badge-err" aria-label="连接失败" />;
  if (state === 'testing') return <Loader2 className="badge-testing" aria-label="测试中" />;
  return <span className="badge-untested">未测试</span>;
}
