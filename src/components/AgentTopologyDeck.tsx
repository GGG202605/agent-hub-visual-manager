import { useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type NodeMouseHandler,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion } from 'motion/react';
import type { AgentId, FixtureAgentRecord, FixtureDecisionRecord, ImportedAgentHubProject } from '../types';
import { createActionEnvelopeDraft } from '../lib/agentHubActionEnvelope';
import { AgentTopologyNode, type AgentTopologyFlowNode, type AgentTopologyNodeData } from './AgentTopologyNode';

interface AgentTopologyDeckProps {
  project: ImportedAgentHubProject;
  selectedOptionId: string;
}

const nodeTypes: NodeTypes = {
  agentTopologyNode: AgentTopologyNode,
};

const agentPositions: Record<AgentId, { x: number; y: number }> = {
  'AG-ARCH': { x: 300, y: 70 },
  'AG-SEC': { x: 300, y: 270 },
  'AG-CODE': { x: 620, y: 70 },
  'AG-REVIEW': { x: 930, y: 170 },
  'AG-DOCS': { x: 620, y: 360 },
  'AG-GIT': { x: 1240, y: 170 },
};

export function AgentTopologyDeck({ project, selectedOptionId }: AgentTopologyDeckProps) {
  const recommendedDecision = selectDecision(project.decisions, selectedOptionId);
  const actionEnvelope = useMemo(
    () => createActionEnvelopeDraft(project, recommendedDecision),
    [project, recommendedDecision],
  );
  const { nodes, edges } = useMemo(
    () => buildTopology(project, recommendedDecision, actionEnvelope.envelope_hash_preview),
    [project, recommendedDecision, actionEnvelope.envelope_hash_preview],
  );
  const [selectedNodeId, setSelectedNodeId] = useState('current-goal');
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];

  const handleNodeClick: NodeMouseHandler<AgentTopologyFlowNode> = (_event, node) => {
    setSelectedNodeId(node.id);
  };

  return (
    <motion.section
      className="topology-deck"
      aria-labelledby="topology-deck-title"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: 'easeOut' }}
    >
      <div className="topology-deck-header">
        <div>
          <p className="eyebrow">TOPO1 / Agent 拓扑图 / React Flow</p>
          <h2 id="topology-deck-title">AgentHub 指挥台拓扑图</h2>
          <p>
            从当前 fixture / ImportedAgentHubProject 派生节点与边；仅做全功能 mock 展示，不连接执行器。
          </p>
        </div>
        <div className="topology-safety-strip" aria-label="topology safety gates">
          <span>数据源：{sourceLabel(project.importStatus.source)}</span>
          <span>状态：{project.importStatus.state}</span>
          <span>warnings：{project.importStatus.warnings.length}</span>
          <span>本地只读</span>
          <span>不上传</span>
          <span>不写入</span>
          <span>不自动执行</span>
          <span>simulator_mode=fixture_only_mock</span>
          <span>receipt_review=not_executed_template</span>
          <span>需要用户审批</span>
        </div>
      </div>

      <div className="topology-command-grid">
        <div className="topology-flow-shell" aria-label="agent topology graph">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            fitView
            fitViewOptions={{ padding: 0.16 }}
            minZoom={0.55}
            maxZoom={1.3}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Lines} gap={28} color="rgba(125, 211, 252, 0.16)" />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        </div>

        <motion.aside
          key={selectedNode?.id}
          className="topology-detail-panel"
          aria-label="selected node command status"
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
          <span className="topology-panel-label">选中节点 / Selected node</span>
          <h3>{selectedNode?.data.label ?? '当前推荐下一步'}</h3>
          <p>{selectedNode?.data.roleLabel ?? recommendedDecision.title}</p>

          <dl className="topology-detail-list">
            <div>
              <dt>当前状态</dt>
              <dd>{selectedNode ? localizeStatus(selectedNode.data.status) : '待用户决策'}</dd>
            </div>
            <div>
              <dt>当前任务</dt>
              <dd>{selectedNode?.data.task ?? recommendedDecision.reason}</dd>
            </div>
            <div>
              <dt>风险等级</dt>
              <dd>{selectedNode?.data.riskLevel ?? 'Low'}</dd>
            </div>
            <div>
              <dt>需要审批？</dt>
              <dd>{selectedNode?.data.needsUserDecision ? '是 / yes' : '否 / no'}</dd>
            </div>
            <div>
              <dt>下游下一步</dt>
              <dd>{selectedNode?.data.downstream ?? recommendedDecision.optionId}</dd>
            </div>
            <div>
              <dt>来源记录</dt>
              <dd>{selectedNode?.data.sourceRefs.join(', ') || recommendedDecision.sourceRef}</dd>
            </div>
            <div>
              <dt>导入状态</dt>
              <dd>
                {sourceLabel(project.importStatus.source)} / {project.importStatus.state} / imported{' '}
                {project.importStatus.importedFiles.length}
              </dd>
            </div>
            <div>
              <dt>warnings</dt>
              <dd>{project.importStatus.warnings.length > 0 ? project.importStatus.warnings.join('; ') : 'none'}</dd>
            </div>
            <div>
              <dt>Action Envelope</dt>
              <dd>{actionEnvelope.envelope_hash_preview} / L1 draft-only</dd>
            </div>
            <div>
              <dt>Execution</dt>
              <dd>locked / executorConnected=false</dd>
            </div>
            <div>
              <dt>Dry-run mock</dt>
              <dd>simulator_mode=fixture_only_mock / real_dry_run_approved=false</dd>
            </div>
            <div>
              <dt>Receipt review</dt>
              <dd>receipt_status=not_executed_template / execution not occurred</dd>
            </div>
          </dl>

          <div className="topology-approval-note">
            <strong>审批边界</strong>
            <span>
              本面板不会触发 Codex / Git / npm / Wiki action。Action Envelope、Dry-run mock plan 与 Receipt review 均为草案/模板。
            </span>
          </div>

          <div className="topology-next-option">
            <span>推荐下一步 / Recommended</span>
            <strong>{recommendedDecision.optionId}</strong>
            <p>{recommendedDecision.title}</p>
          </div>
        </motion.aside>
      </div>
    </motion.section>
  );
}

function buildTopology(project: ImportedAgentHubProject, decision: FixtureDecisionRecord, envelopeHashPreview: string) {
  const agentById = new Map(project.agents.map((agent) => [agent.agentId, agent]));
  const nodes: AgentTopologyFlowNode[] = [
    makeWorkflowNode({
      id: 'current-goal',
      label: '当前目标',
      roleLabel: 'Current Goal',
      status: 'Working',
      task: project.project.currentGoal,
      evidenceHint: project.project.stableBaseline,
      downstream: 'AG-ARCH',
      nodeKind: 'goal',
      sourceRefs: project.importStatus.importedFiles.includes('project-state.md')
        ? ['project-state.md']
        : ['project-state / fixture'],
    }),
    ...(['AG-ARCH', 'AG-SEC', 'AG-CODE', 'AG-REVIEW', 'AG-DOCS', 'AG-GIT'] as AgentId[]).map((agentId) =>
      makeAgentNode(agentById.get(agentId), agentId),
    ),
    makeWorkflowNode({
      id: 'human-approval',
      label: '用户审批',
      roleLabel: 'Human Approval',
      status: 'Needs User Decision',
      task: decision.title,
      evidenceHint: decision.sourceRef,
      downstream: '等待用户明确批准',
      nodeKind: 'human-approval',
      sourceRefs: [decision.sourceRef],
      needsUserDecision: true,
      position: { x: 930, y: 420 },
    }),
    makeWorkflowNode({
      id: 'action-envelope',
      label: '动作草案',
      roleLabel: 'Action Envelope',
      status: 'Needs User Decision',
      task: '从 selected next decision 生成执行信封草案；仅复制，不审批，不执行。',
      evidenceHint: envelopeHashPreview,
      downstream: 'Execution Locked',
      nodeKind: 'human-approval',
      sourceRefs: [decision.sourceRef, envelopeHashPreview],
      needsUserDecision: true,
      position: { x: 1240, y: 420 },
    }),
    makeWorkflowNode({
      id: 'evidence-return',
      label: '执行回流',
      roleLabel: 'Evidence Return',
      status: 'Idle',
      task: '等待外部执行结果回流；当前仅占位展示。',
      evidenceHint: 'no executor connected',
      downstream: 'Dashboard Refresh',
      nodeKind: 'evidence-return',
      sourceRefs: ['runs / reviews / build evidence'],
      position: { x: 1540, y: 170 },
    }),
    makeWorkflowNode({
      id: 'dry-run-mock',
      label: 'Dry-run 模拟',
      roleLabel: 'Dry-run Mock Plan',
      status: 'Idle',
      task: 'fixture_only_mock；不读取文件系统，不运行 shell/npm/Git/Codex action。',
      evidenceHint: 'real_dry_run_approved=false',
      downstream: 'Receipt Review',
      nodeKind: 'dry-run-mock',
      sourceRefs: ['DryRunMockPanel', envelopeHashPreview],
      position: { x: 1540, y: 420 },
    }),
    makeWorkflowNode({
      id: 'receipt-review',
      label: '回执审计',
      roleLabel: 'Operation Receipt Review',
      status: 'Idle',
      task: 'not_executed_template；不会伪造真实执行结果。',
      evidenceHint: 'receipt_status=not_executed_template',
      downstream: 'Dashboard Refresh',
      nodeKind: 'receipt-review',
      sourceRefs: ['ReceiptReviewPanel'],
      position: { x: 1850, y: 420 },
    }),
    makeWorkflowNode({
      id: 'dashboard-refresh',
      label: '面板刷新',
      roleLabel: 'Dashboard Refresh',
      status: 'Idle',
      task: '根据 fixture 或浏览器导入 state 刷新拓扑和状态面板。',
      evidenceHint: project.importStatus.source,
      downstream: '下一轮 needs_user_decision',
      nodeKind: 'dashboard-refresh',
      sourceRefs: ['ImportedAgentHubProject'],
      position: { x: 2160, y: 170 },
    }),
  ];

  const edges: Edge[] = [
    makeEdge('current-goal', 'AG-ARCH', '目标 -> 架构'),
    makeEdge('AG-ARCH', 'AG-CODE', '架构 -> 代码'),
    makeEdge('AG-CODE', 'AG-REVIEW', '代码 -> 复核'),
    makeEdge('AG-SEC', 'AG-REVIEW', '安全 -> 总审'),
    makeEdge('AG-SEC', 'human-approval', '安全门禁 -> 审批'),
    makeEdge('AG-DOCS', 'human-approval', '文档 -> 审批'),
    makeEdge('human-approval', 'action-envelope', '审批门禁 -> 草案'),
    makeEdge('action-envelope', 'dry-run-mock', '草案 -> 模拟'),
    makeEdge('dry-run-mock', 'receipt-review', '模拟 -> 回执审计'),
    makeEdge('AG-REVIEW', 'AG-GIT', '复核 -> 提交门禁'),
    makeEdge('AG-GIT', 'evidence-return', '提交证据 -> 回流'),
    makeEdge('receipt-review', 'dashboard-refresh', '审计 -> 刷新'),
    makeEdge('evidence-return', 'dashboard-refresh', '回流 -> 刷新'),
  ];

  return { nodes, edges };
}

function makeAgentNode(agent: FixtureAgentRecord | undefined, agentId: AgentId): AgentTopologyFlowNode {
  const fallback: FixtureAgentRecord = {
    agentId,
    agentName: agentId,
    roleTitle: agentRoleLabel(agentId),
    visualRole: 'fixture-derived agent',
    status: 'Idle',
    currentTask: '等待 fixture 或导入状态更新。',
    riskLevel: 'None',
    reviewCount: 0,
    lastActivity: 'no recent activity',
    needsUserDecision: false,
    activityIndicator: 'idle',
    sourceRefs: ['fixture-generated'],
  };
  const record = agent ?? fallback;

  return {
    id: agentId,
    type: 'agentTopologyNode',
    position: agentPositions[agentId],
    data: {
      id: agentId,
      label: agentId,
      roleLabel: record.roleTitle || agentRoleLabel(agentId),
      status: record.status,
      task: record.currentTask,
      riskLevel: record.riskLevel,
      reviewCount: record.reviewCount,
      sourceRefs: record.sourceRefs.length > 0 ? record.sourceRefs : ['fixture-generated'],
      needsUserDecision: record.needsUserDecision,
      evidenceHint: record.lastActivity,
      downstream: downstreamForAgent(agentId),
      nodeKind: agentId,
    },
  };
}

function makeWorkflowNode(config: {
  id: string;
  label: string;
  roleLabel: string;
  status: AgentTopologyNodeData['status'];
  task: string;
  evidenceHint: string;
  downstream: string;
  nodeKind: AgentTopologyNodeData['nodeKind'];
  sourceRefs: string[];
  needsUserDecision?: boolean;
  position?: { x: number; y: number };
}): AgentTopologyFlowNode {
  return {
    id: config.id,
    type: 'agentTopologyNode',
    position: config.position ?? { x: 0, y: 170 },
    data: {
      id: config.id,
      label: config.label,
      roleLabel: config.roleLabel,
      status: config.status,
      task: config.task,
      riskLevel: 'Low',
      reviewCount: 0,
      sourceRefs: config.sourceRefs,
      needsUserDecision: config.needsUserDecision ?? false,
      evidenceHint: config.evidenceHint,
      downstream: config.downstream,
      nodeKind: config.nodeKind,
    },
  };
}

function makeEdge(source: string, target: string, label: string): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    label,
    type: 'smoothstep',
    animated: target === 'human-approval' || target === 'dashboard-refresh',
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#5eead4' },
    style: { stroke: '#5eead4', strokeWidth: 1.6 },
    labelStyle: { fill: '#cbd5e1', fontSize: 11, fontWeight: 700 },
    labelBgStyle: { fill: 'rgba(15, 23, 42, 0.88)' },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 6,
  };
}

function selectDecision(decisions: FixtureDecisionRecord[], selectedOptionId: string) {
  return (
    decisions.find((decision) => decision.optionId === selectedOptionId) ??
    decisions.find((decision) => decision.optionId === 'LOOP3') ??
    decisions.find((decision) => decision.optionId === 'IMPORT4') ??
    decisions.find((decision) => decision.optionId === 'IMPORT3') ??
    decisions.find((decision) => decision.optionId === 'IMPORT1') ??
    decisions[0] ?? {
      optionId: 'IMPORT3',
      title: 'manual validation with selected .agent-hub',
      status: 'needs_user_decision' as const,
      reason: 'Topology deck fallback recommendation.',
      sourceRef: 'topology-generated-fallback',
    }
  );
}

function sourceLabel(source: ImportedAgentHubProject['importStatus']['source']) {
  return source === 'fixture' ? 'fixture' : 'browser-selected-agent-hub';
}

function localizeStatus(status: AgentTopologyNodeData['status']) {
  const map: Record<AgentTopologyNodeData['status'], string> = {
    Working: '工作中 / Working',
    Blocked: '已阻塞 / Blocked',
    'Review Ready': '待复核 / Review Ready',
    'Needs User Decision': '待用户决策 / Needs User Decision',
    Done: '已完成 / Done',
    Idle: '待命 / Idle',
  };

  return map[status];
}

function agentRoleLabel(agentId: AgentId) {
  const labels: Record<AgentId, string> = {
    'AG-ARCH': '架构规划 / Architect',
    'AG-SEC': '安全守卫 / Shield Guardian',
    'AG-CODE': '代码执行 / Tech Engineer',
    'AG-REVIEW': '总审复核 / Elder Reviewer',
    'AG-DOCS': '文档整理 / Knowledge Scholar',
    'AG-GIT': '提交门禁 / Repo Gatekeeper',
  };

  return labels[agentId];
}

function downstreamForAgent(agentId: AgentId) {
  const downstream: Record<AgentId, string> = {
    'AG-ARCH': 'AG-CODE',
    'AG-SEC': 'AG-REVIEW / 用户审批',
    'AG-CODE': 'AG-REVIEW',
    'AG-REVIEW': 'AG-GIT',
    'AG-DOCS': 'Human Approval',
    'AG-GIT': 'Evidence Return',
  };

  return downstream[agentId];
}
