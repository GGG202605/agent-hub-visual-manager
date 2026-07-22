import { describe, expect, it, vi } from 'vitest';
import {
  downloadOperatorEvidenceDocument,
  eligibleOperatorEvidenceRuns,
  OPERATOR_EVIDENCE_TRUTH,
  operatorEvidenceFileName,
} from '../../components/RuntimeActivityDock';
import { RuntimeActivityStore, dedupeRuntimeEvents } from '../runtimeActivity';
import type {
  OperatorEvidenceExportV1,
  OperatorEvidenceOrchestrationRunSummary,
  RuntimeEvent,
} from '../serverBridge';

function event(seq: number, id = `event-${seq}`): RuntimeEvent {
  return {
    id,
    seq,
    at: new Date(Date.UTC(2026, 6, 10) + seq).toISOString(),
    workspaceId: 'workspace',
    category: 'operation',
    type: 'test',
    status: 'info',
    title: `event ${seq}`,
    summary: 'test',
  };
}

function orchestrationRun(
  runId: string,
  status: 'active' | 'completed',
  operatorEvidenceEligible: boolean,
): OperatorEvidenceOrchestrationRunSummary {
  return {
    runId,
    status,
    policy: {
      expectedArtifacts: 4,
      maxCalls: 5,
      totalOutputTokens: 1_600,
      stageTimeoutMs: 45_000,
      groundingDisclosureApproved: true,
    },
    callsStarted: status === 'completed' ? 4 : 1,
    callsSucceeded: status === 'completed' ? 4 : 0,
    callsFailed: 0,
    reservedOutputTokens: status === 'completed' ? 1_200 : 300,
    observedOutputTokens: status === 'completed' ? 80 : 0,
    evidence: [],
    startedAt: '2099-01-01T00:01:00.000Z',
    updatedAt: '2099-01-01T00:03:00.000Z',
    operatorEvidenceEligible,
  } as OperatorEvidenceOrchestrationRunSummary;
}

function operatorEvidenceDocument(): OperatorEvidenceExportV1 {
  return {
    schema: 'agenthub.operator-evidence',
    schemaVersion: 1,
    exportedAt: '2099-01-01T00:04:00.000Z',
    integrity: {
      algorithm: 'sha256',
      canonicalization: 'agenthub-json-v1',
      payloadSha256: 'a'.repeat(64),
    },
  } as OperatorEvidenceExportV1;
}

describe('runtime activity store', () => {
  it('deduplicates, sorts and bounds events', () => {
    const result = dedupeRuntimeEvents([event(3), event(1), event(2), event(4, 'event-2')], 3);
    expect(result.map((item) => item.seq)).toEqual([1, 3, 4]);
    expect(result.map((item) => item.id)).toEqual(['event-1', 'event-3', 'event-2']);
  });

  it('publishes only to dock subscribers while retaining a stable store identity', () => {
    const store = new RuntimeActivityStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });
    store.append(event(1));
    store.append(event(2));
    expect(notifications).toBe(2);
    expect(store.getSnapshot().events).toHaveLength(2);
    unsubscribe();
    store.reset();
    expect(notifications).toBe(2);
  });

  it('replaces a 300-event server snapshot with the latest 200 and keeps append bounded', () => {
    const store = new RuntimeActivityStore();
    store.replace({
      events: Array.from({ length: 300 }, (_, index) => event(index + 1)),
      definitions: [],
      profiles: [],
      orchestrationRuns: [],
      patchProposals: [],
    });
    expect(store.getSnapshot().events).toHaveLength(200);
    expect(store.getSnapshot().events[0]?.seq).toBe(101);
    expect(store.getSnapshot().events[store.getSnapshot().events.length - 1]?.seq).toBe(300);

    store.append(event(301));
    expect(store.getSnapshot().events).toHaveLength(200);
    expect(store.getSnapshot().events[0]?.seq).toBe(102);
    expect(store.getSnapshot().events[store.getSnapshot().events.length - 1]?.seq).toBe(301);
  });
});

describe('DemoScenario021 explicit operator evidence download', () => {
  it('offers only server-validated completed runs and performs no work during selection', () => {
    const runs = [
      orchestrationRun('active-run', 'active', true),
      orchestrationRun('ordinary-completed-run', 'completed', false),
      orchestrationRun('accepted-safe-pilot', 'completed', true),
    ];
    const createBlob = vi.fn();
    const createObjectURL = vi.fn();

    expect(eligibleOperatorEvidenceRuns(runs).map((run) => run.runId)).toEqual(['accepted-safe-pilot']);
    expect(createBlob).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('creates exactly one JSON Blob and download, then always revokes the object URL', () => {
    const exportDocument = operatorEvidenceDocument();
    const blob = {} as Blob;
    const anchor = {
      href: '',
      download: '',
      click: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement;
    const createBlob = vi.fn(() => blob);
    const createObjectURL = vi.fn(() => 'blob:DemoScenario021-once');
    const revokeObjectURL = vi.fn();
    const createAnchor = vi.fn(() => anchor);
    const appendAnchor = vi.fn();

    const fileName = downloadOperatorEvidenceDocument(exportDocument, {
      createBlob,
      createObjectURL,
      revokeObjectURL,
      createAnchor,
      appendAnchor,
    });

    expect(fileName).toBe('agenthub-operator-evidence-v1-aaaaaaaaaaaaaaaa-20990101T000400Z.json');
    expect(createBlob).toHaveBeenCalledTimes(1);
    expect(createBlob).toHaveBeenCalledWith(
      [`${JSON.stringify(exportDocument)}\n`],
      { type: 'application/json;charset=utf-8' },
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createAnchor).toHaveBeenCalledTimes(1);
    expect(appendAnchor).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:DemoScenario021-once');
    expect(anchor.download).toBe(fileName);
  });

  it('fails before creating a Blob when filename metadata is invalid', () => {
    const invalid = operatorEvidenceDocument();
    invalid.integrity.payloadSha256 = 'not-a-hash';
    const createBlob = vi.fn(() => ({} as Blob));
    expect(() => downloadOperatorEvidenceDocument(invalid, {
      createBlob,
      createObjectURL: vi.fn(() => 'blob:must-not-exist'),
      revokeObjectURL: vi.fn(),
      createAnchor: vi.fn(() => ({} as HTMLAnchorElement)),
      appendAnchor: vi.fn(),
    })).toThrow('脱敏证据文件元数据无效');
    expect(createBlob).not.toHaveBeenCalled();
  });

  it('uses the frozen non-recovery truth and filename without run or workspace identity', () => {
    const fileName = operatorEvidenceFileName(operatorEvidenceDocument());
    expect(fileName).not.toContain('pilot-DemoScenario021');
    expect(fileName).not.toMatch(/[\\/]/);
    expect(OPERATOR_EVIDENCE_TRUTH).toContain('重启后会丢失');
    expect(OPERATOR_EVIDENCE_TRUTH).toContain('不能恢复 run');
    expect(OPERATOR_EVIDENCE_TRUTH).toContain('不会写入项目');
    expect(OPERATOR_EVIDENCE_TRUTH).toContain('自行保管或删除');
  });
});
