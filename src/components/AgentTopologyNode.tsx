import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  Archive,
  Bot,
  CheckCircle2,
  CircleDashed,
  Code2,
  FileCheck2,
  GitBranch,
  GitCommit,
  Goal,
  LayoutDashboard,
  RefreshCw,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import type { AgentId, AgentStatus, Severity } from '../types';

export interface AgentTopologyNodeData extends Record<string, unknown> {
  id: string;
  label: string;
  roleLabel: string;
  status: AgentStatus;
  task: string;
  riskLevel: Severity | 'None';
  reviewCount: number;
  sourceRefs: string[];
  needsUserDecision: boolean;
  evidenceHint: string;
  downstream: string;
  nodeKind: AgentId | 'goal' | 'human-approval' | 'dry-run-mock' | 'receipt-review' | 'evidence-return' | 'dashboard-refresh';
}

export type AgentTopologyFlowNode = Node<AgentTopologyNodeData, 'agentTopologyNode'>;

const statusLabels: Record<AgentStatus, string> = {
  Working: '工作中 / Working',
  Blocked: '已阻塞 / Blocked',
  'Review Ready': '待复核 / Review Ready',
  'Needs User Decision': '待用户决策 / Needs User Decision',
  Done: '已完成 / Done',
  Idle: '待命 / Idle',
};

const statusTone: Record<AgentStatus, string> = {
  Working: 'working',
  Blocked: 'blocked',
  'Review Ready': 'review',
  'Needs User Decision': 'decision',
  Done: 'done',
  Idle: 'idle',
};

const roleIcons = {
  goal: Goal,
  'AG-ARCH': Bot,
  'AG-SEC': ShieldAlert,
  'AG-CODE': Code2,
  'AG-REVIEW': FileCheck2,
  'AG-DOCS': Archive,
  'AG-GIT': GitCommit,
  'human-approval': UserCheck,
  'dry-run-mock': Code2,
  'receipt-review': FileCheck2,
  'evidence-return': GitBranch,
  'dashboard-refresh': RefreshCw,
} satisfies Record<AgentTopologyNodeData['nodeKind'], typeof Bot>;

export function AgentTopologyNode({ data, selected, isConnectable }: NodeProps<AgentTopologyFlowNode>) {
  const Icon = roleIcons[data.nodeKind];
  const tone = statusTone[data.status];
  const StatusIcon = data.status === 'Done' ? CheckCircle2 : data.status === 'Idle' ? CircleDashed : undefined;

  return (
    <article className={`topology-node topology-node-${tone} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} />
      <div className="topology-node-header">
        <span className="topology-node-icon" aria-hidden="true">
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <div>
          <strong>{data.label}</strong>
          <small>{data.roleLabel}</small>
        </div>
      </div>

      <span className={`topology-status-badge topology-status-${tone}`}>
        {StatusIcon ? <StatusIcon size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
        {statusLabels[data.status]}
      </span>

      <p className="topology-node-task">{data.task}</p>

      <div className="topology-node-signals">
        <span>风险：{data.riskLevel === 'None' ? '无 / None' : data.riskLevel}</span>
        <span>复核：{data.reviewCount}</span>
        <span>{data.needsUserDecision ? '需要审批' : '无需当前审批'}</span>
      </div>

      <div className="topology-node-source">
        <span>来源记录</span>
        <strong>{data.sourceRefs[0] ?? 'fixture-generated'}</strong>
      </div>
      <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
    </article>
  );
}
