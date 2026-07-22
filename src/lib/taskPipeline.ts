import type { AgentRoleCardView } from '../types';
import {
  evaluateRunCompletion,
  normalizeAgentCode,
  type CompletionEvidence,
} from './coordinationContract';

export type PipelineMode = 'simulation' | 'single' | 'connected';
export type PipelineLaunchIntent = 'single' | 'full' | 'simulation';
export type PipelineRunStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'simulated'
  | 'awaiting_evidence'
  | 'completed'
  | 'stopped'
  | 'blocked'
  | 'failed';

export interface PipelineStage {
  agentId: string;
  agentCode: string;
  canonicalAgentCode: string;
  agentName: string;
  phaseLabel: string;
  narration: string;
}

export type PipelineWalkPhase = 'enter' | 'speak' | 'exit';
export type PipelineReceiptStatus = 'simulated' | 'succeeded' | 'failed' | 'blocked';

export interface PipelineReceipt {
  seq: number;
  agentCode: string;
  agentName: string;
  phaseLabel: string;
  summary: string;
  status: PipelineReceiptStatus;
  source: 'template' | 'agent';
}

export interface PipelineFailure {
  stageIndex: number;
  agentCode: string;
  message: string;
  retryable: boolean;
}

export interface PipelineState {
  runId: string;
  mode: PipelineMode;
  status: PipelineRunStatus;
  taskText: string;
  stages: PipelineStage[];
  currentIndex: number;
  walkPhase: PipelineWalkPhase;
  receipts: PipelineReceipt[];
  failure: PipelineFailure | null;
}

export type PipelineLaunchDecision =
  | { ok: true; mode: PipelineMode; stages: PipelineStage[] }
  | { ok: false; error: string };

export type PipelineAction =
  | { type: 'start'; runId: string; mode: PipelineMode; taskText: string; stages: PipelineStage[] }
  | { type: 'advance' }
  | { type: 'stageSucceeded'; stageIndex: number; summary: string }
  | { type: 'stageFailed'; stageIndex: number; message: string; retryable: boolean }
  | { type: 'stageBlocked'; stageIndex: number; message: string }
  | { type: 'retry' }
  | { type: 'resume' }
  | { type: 'restore'; state: PipelineState }
  | { type: 'finalize'; evidence: CompletionEvidence }
  | { type: 'stop' }
  | { type: 'reset' };

export const INITIAL_PIPELINE_STATE: PipelineState = {
  runId: '',
  mode: 'simulation',
  status: 'idle',
  taskText: '',
  stages: [],
  currentIndex: -1,
  walkPhase: 'enter',
  receipts: [],
  failure: null,
};

export const PHASE_DURATION_MS: Record<PipelineWalkPhase, number> = {
  enter: 1200,
  speak: 4200,
  exit: 1000,
};

export function isRealPipelineMode(mode: PipelineMode): boolean {
  return mode !== 'simulation';
}

export function resolvePipelineLaunch(
  intent: PipelineLaunchIntent,
  stages: readonly PipelineStage[],
  viaServer: boolean,
  isAgentReady: (agentId: string) => boolean,
): PipelineLaunchDecision {
  if (stages.length === 0) return { ok: false, error: '未找到协调 Agent，无法创建任务' };
  if (intent === 'simulation') return { ok: true, mode: 'simulation', stages: [...stages] };
  if (!viaServer) return { ok: false, error: '本地 AgentHub 网关未连接，不能启动真实任务' };

  if (intent === 'single') {
    const coordinator = stages[0];
    if (!isAgentReady(coordinator.agentId)) {
      return { ok: false, error: '协调 Agent 未绑定已测试模型，请先在“智能体接入”完成绑定' };
    }
    return { ok: true, mode: 'single', stages: [coordinator] };
  }

  const missing = stages.filter((stage) => !isAgentReady(stage.agentId));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `八 Agent 协同尚缺 ${missing.length} 个可用连接器：${missing.slice(0, 3).map((stage) => stage.agentName).join('、')}${missing.length > 3 ? '等' : ''}`,
    };
  }
  return { ok: true, mode: 'connected', stages: [...stages] };
}

function receiptFor(
  stage: PipelineStage,
  index: number,
  status: PipelineReceiptStatus,
  summary: string,
  source: PipelineReceipt['source'],
): PipelineReceipt {
  return {
    seq: index + 1,
    agentCode: stage.agentCode,
    agentName: stage.agentName,
    phaseLabel: stage.phaseLabel,
    summary,
    status,
    source,
  };
}

export function pipelineReducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case 'start': {
      if (!action.runId.trim() || !action.taskText.trim() || action.stages.length === 0) return state;
      return {
        runId: action.runId,
        mode: action.mode,
        status: 'running',
        taskText: action.taskText,
        stages: action.stages,
        currentIndex: 0,
        walkPhase: 'enter',
        receipts: [],
        failure: null,
      };
    }

    case 'advance': {
      if (state.status !== 'running') return state;

      if (state.walkPhase === 'enter') {
        if (isRealPipelineMode(state.mode)) return state;
        const stage = state.stages[state.currentIndex];
        if (!stage) return { ...state, status: 'failed' };
        return {
          ...state,
          walkPhase: 'speak',
          receipts: [
            ...state.receipts,
            receiptFor(stage, state.currentIndex, 'simulated', stage.narration, 'template'),
          ],
        };
      }

      if (state.walkPhase === 'speak') return { ...state, walkPhase: 'exit' };

      const nextIndex = state.currentIndex + 1;
      if (nextIndex >= state.stages.length) {
        const connectedStagesSucceeded =
          isRealPipelineMode(state.mode) &&
          state.receipts.length === state.stages.length &&
          state.receipts.every((receipt) => receipt.status === 'succeeded');
        return {
          ...state,
          status: state.mode === 'simulation' ? 'simulated' : connectedStagesSucceeded ? 'awaiting_evidence' : 'failed',
          walkPhase: 'exit',
        };
      }
      return { ...state, currentIndex: nextIndex, walkPhase: 'enter' };
    }

    case 'stageSucceeded': {
      if (
        state.status !== 'running' ||
        !isRealPipelineMode(state.mode) ||
        state.walkPhase !== 'enter' ||
        action.stageIndex !== state.currentIndex
      ) {
        return state;
      }
      const stage = state.stages[state.currentIndex];
      if (!stage || !action.summary.trim()) return state;
      return {
        ...state,
        walkPhase: 'speak',
        receipts: [
          ...state.receipts,
          receiptFor(stage, state.currentIndex, 'succeeded', action.summary.trim(), 'agent'),
        ],
      };
    }

    case 'stageFailed': {
      if (state.status !== 'running' || action.stageIndex !== state.currentIndex) return state;
      const stage = state.stages[state.currentIndex];
      if (!stage) return { ...state, status: 'failed' };
      return {
        ...state,
        status: 'failed',
        receipts: [
          ...state.receipts,
          receiptFor(stage, state.currentIndex, 'failed', action.message, 'agent'),
        ],
        failure: {
          stageIndex: action.stageIndex,
          agentCode: stage.agentCode,
          message: action.message,
          retryable: action.retryable,
        },
      };
    }

    case 'stageBlocked': {
      if (state.status !== 'running' || action.stageIndex !== state.currentIndex) return state;
      const stage = state.stages[state.currentIndex];
      if (!stage) return { ...state, status: 'blocked' };
      return {
        ...state,
        status: 'blocked',
        receipts: [
          ...state.receipts,
          receiptFor(stage, state.currentIndex, 'blocked', action.message, 'agent'),
        ],
        failure: {
          stageIndex: action.stageIndex,
          agentCode: stage.agentCode,
          message: action.message,
          retryable: false,
        },
      };
    }

    case 'retry': {
      if (state.status !== 'failed' || !state.failure?.retryable) return state;
      return {
        ...state,
        status: 'running',
        walkPhase: 'enter',
        receipts: state.receipts.filter((receipt) => receipt.seq !== state.currentIndex + 1),
        failure: null,
      };
    }

    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'running', failure: null } : state;

    case 'restore':
      return action.state;

    case 'finalize': {
      if (state.status !== 'awaiting_evidence') return state;
      const completion = evaluateRunCompletion(action.evidence);
      if (completion.allowed) return { ...state, status: 'completed', failure: null };
      return {
        ...state,
        status: 'blocked',
        failure: {
          stageIndex: state.currentIndex,
          agentCode: 'AG-REVIEW',
          message: `完成门槛未满足：${completion.reasons.join(', ')}`,
          retryable: false,
        },
      };
    }

    case 'stop':
      return state.status === 'running' ? { ...state, status: 'stopped' } : state;

    case 'reset':
      return INITIAL_PIPELINE_STATE;

    default:
      return state;
  }
}

export function findCoordinator(agents: readonly AgentRoleCardView[]): AgentRoleCardView | undefined {
  return (
    agents.find((agent) => agent.code === 'AG-COORD') ??
    agents.find((agent) => agent.code === 'AG-ARCH') ??
    agents.find((agent) => agent.layer === 'decision')
  );
}

const NARRATION_BY_CODE: Record<string, { phase: string; line: string }> = {
  'AG-COORD': {
    phase: '需求拆解',
    line: '已收到「{task}」。我将拆解目标、依赖和验收条件，再按职责分派；当前只记录计划，不代表任务已完成。',
  },
  'AG-ARCH': {
    phase: '架构规划',
    line: '我将为「{task}」建立结构方案、边界和取舍，方案须经复核后才能进入执行。',
  },
  'UI-PRODUCT': {
    phase: '体验方案',
    line: '我将从用户流程、布局和反馈状态审视「{task}」，并给出可验证的体验标准。',
  },
  'AG-DEV': {
    phase: '方案实现',
    line: '我将依据已批准范围实现「{task}」，产出代码、测试和变更摘要；未执行前不声明完成。',
  },
  'AG-CODE': {
    phase: '方案实现',
    line: '我将依据已批准范围实现「{task}」，产出代码、测试和变更摘要；未执行前不声明完成。',
  },
  EXECUTOR: {
    phase: '受控执行',
    line: '我只执行与工作区、run 和一次性审批票据绑定的允许动作；当前没有有效票据时保持锁定。',
  },
  'AG-GIT': {
    phase: '受控执行',
    line: '我只执行与工作区、run 和一次性审批票据绑定的允许动作；当前没有有效票据时保持锁定。',
  },
  'AG-SEC': {
    phase: '安全边界检查',
    line: '我将检查路径、权限、凭据和输入污染；未取得完整证据前不作通过结论。',
  },
  'AG-REVIEW': {
    phase: '质量复核',
    line: '我将逐条核验验收标准、测试和产物；High 与 Medium 发现未清零时不放行。',
  },
  'AG-DOCS': {
    phase: '档案交接',
    line: '我将整理可追溯记录、产物引用和未决事项；记录完成不等于项目完成。',
  },
  PRO: {
    phase: '专业收口',
    line: '我将给出专业评审和收口建议，但建议不能代替用户授权，也不会自动开启下一阶段。',
  },
  HANDOFF: {
    phase: '归档交接',
    line: '我将校验基线、产物和未决问题，等待接收方确认接管；权限不会随交接继承。',
  },
};

function truncateTask(taskText: string): string {
  const clean = taskText.replace(/\s+/g, ' ').trim();
  return clean.length > 24 ? `${clean.slice(0, 24)}...` : clean || '本次需求';
}

export function buildPipelinePlan(agents: readonly AgentRoleCardView[], taskText: string): PipelineStage[] {
  const coordinator = findCoordinator(agents);
  if (!coordinator) return [];

  const rest = agents.filter((agent) => agent.id !== coordinator.id);
  const executionAgents = rest.filter((agent) => agent.layer === 'execution');
  const auditAgents = rest.filter((agent) => agent.layer === 'audit' && agent.code !== 'HANDOFF');
  const closers = rest.filter((agent) => agent.layer === 'decision');
  const handoff = rest.filter((agent) => agent.code === 'HANDOFF');
  const ordered = [coordinator, ...executionAgents, ...auditAgents, ...closers, ...handoff];
  const task = truncateTask(taskText);

  return ordered.map((agent) => {
    const known = NARRATION_BY_CODE[agent.code];
    return {
      agentId: agent.id,
      agentCode: agent.code,
      canonicalAgentCode: normalizeAgentCode(agent.code) ?? agent.code,
      agentName: agent.nameZh,
      phaseLabel: known?.phase ?? agent.roleTitle,
      narration: known
        ? known.line.replace('{task}', task)
        : `我负责${agent.roleTitle}。本次将围绕「${task}」产出可验证结果，未取得证据前不声明完成。`,
    };
  });
}
