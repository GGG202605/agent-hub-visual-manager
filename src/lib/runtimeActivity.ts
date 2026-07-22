import type {
  AgentPermissionProfile,
  CapabilityDefinition,
  RuntimeEvent,
  RuntimeStatePayload,
} from './serverBridge';
import type { TaskDag } from './taskGraph';
import type { OrchestrationRunSummary } from './orchestration';
import type { PatchProposalSummary } from './patchProposal';

export interface RuntimeActivitySnapshot {
  events: readonly RuntimeEvent[];
  definitions: readonly CapabilityDefinition[];
  profiles: readonly AgentPermissionProfile[];
  loading: boolean;
  error: string;
  taskDag: TaskDag | null;
  orchestrationRuns: readonly OrchestrationRunSummary[];
  patchProposals: readonly PatchProposalSummary[];
}

const EMPTY_SNAPSHOT: RuntimeActivitySnapshot = {
  events: [],
  definitions: [],
  profiles: [],
  loading: false,
  error: '',
  taskDag: null,
  orchestrationRuns: [],
  patchProposals: [],
};

/** 高频事件存放在 Context 外部的稳定 store，避免每条日志触发 Three.js 舞台重渲染。 */
export class RuntimeActivityStore {
  private snapshot: RuntimeActivitySnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  readonly getSnapshot = (): RuntimeActivitySnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setLoading(loading: boolean): void {
    this.publish({ ...this.snapshot, loading, error: loading ? '' : this.snapshot.error });
  }

  replace(payload: RuntimeStatePayload): void {
    this.publish({
      events: dedupeRuntimeEvents(payload.events),
      definitions: payload.definitions,
      profiles: payload.profiles,
      loading: false,
      error: '',
      taskDag: this.snapshot.taskDag,
      orchestrationRuns: payload.orchestrationRuns ?? [],
      patchProposals: payload.patchProposals ?? [],
    });
  }

  append(event: RuntimeEvent): void {
    this.publish({
      ...this.snapshot,
      events: dedupeRuntimeEvents([...this.snapshot.events, event]),
      loading: false,
    });
  }

  replacePermissions(definitions: CapabilityDefinition[], profiles: AgentPermissionProfile[]): void {
    this.publish({ ...this.snapshot, definitions, profiles, loading: false, error: '' });
  }

  setError(error: string): void {
    this.publish({ ...this.snapshot, loading: false, error });
  }

  setTaskDag(taskDag: TaskDag | null): void {
    this.publish({ ...this.snapshot, taskDag });
  }

  upsertOrchestrationRun(run: OrchestrationRunSummary): void {
    const runs = [run, ...this.snapshot.orchestrationRuns.filter((item) => item.runId !== run.runId)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 100);
    this.publish({ ...this.snapshot, orchestrationRuns: runs });
  }

  upsertPatchProposal(proposal: PatchProposalSummary): void {
    const proposals = [
      proposal,
      ...this.snapshot.patchProposals.filter((item) => item.proposalId !== proposal.proposalId),
    ]
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
      .slice(0, 20);
    this.publish({ ...this.snapshot, patchProposals: proposals });
  }

  reset(): void {
    this.publish(EMPTY_SNAPSHOT);
  }

  private publish(next: RuntimeActivitySnapshot): void {
    if (next === this.snapshot) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

export function dedupeRuntimeEvents(events: readonly RuntimeEvent[], limit = 200): RuntimeEvent[] {
  const byId = new Map<string, RuntimeEvent>();
  for (const event of events) byId.set(event.id, event);
  return [...byId.values()]
    .sort((left, right) => left.at.localeCompare(right.at) || left.seq - right.seq)
    .slice(-limit);
}
