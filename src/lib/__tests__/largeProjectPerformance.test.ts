import { describe, expect, it } from 'vitest';
import { buildProjectGroundingContext } from '../agentConnectors';
import { importAgentHubFiles } from '../agentHubBrowserImport';
import { RuntimeActivityStore } from '../runtimeActivity';
import {
  createGroundingFixture,
  createImportFiles,
  createRuntimeEvents,
  measureAsync,
  measureSync,
  PERFORMANCE_FIXTURE_SEED,
  PERFORMANCE_TIERS,
} from './largeProjectFixtures';

const MEASUREMENT_BATCHES = {
  S: { import: 80, grounding: 400 },
  M: { import: 24, grounding: 200 },
  L: { import: 12, grounding: 120 },
} as const;

describe('DemoScenario016 deterministic large-project baseline', () => {
  it.each(PERFORMANCE_TIERS)('records import and grounding evidence for tier $name', async (tier) => {
    const batch = MEASUREMENT_BATCHES[tier.name];
    const files = createImportFiles(tier.fileCount, tier.totalBytes);
    const imported = await measureAsync(() => importAgentHubFiles(files), 2, 10, batch.import);
    expect(imported.value.importStatus.state).toBe('ready');
    expect(imported.value.importStatus.importedFiles).toHaveLength(tier.fileCount);
    expect(imported.value.importStatus.totalBytes).toBe(tier.totalBytes);

    const fixture = createGroundingFixture(tier.records);
    const grounded = measureSync(() => buildProjectGroundingContext(
      fixture.project,
      fixture.dashboard,
      'mock',
      { taskText: `核对 ${fixture.beacon}`, charBudget: 6_000, perRecordCharLimit: 180 },
    ), 2, 10, batch.grounding);
    expect(grounded.value.text.length).toBeLessThanOrEqual(6_000);
    expect(grounded.value.selection.selectedCount + grounded.value.selection.omittedCount).toBe(
      grounded.value.selection.candidateCount,
    );
    for (const tag of fixture.expectedTags) expect(grounded.value.sourceTags).toContain(tag);
    const renderedTags = [...grounded.value.text.matchAll(/^\[([A-Z]\d+)\]/gm)].map((match) => match[1]);
    expect(new Set(renderedTags)).toEqual(new Set(grounded.value.sourceTags));

    const relevantSelected = renderedTags.filter((tag) => fixture.expectedTags.includes(tag)).length;
    const recall = relevantSelected / fixture.expectedTags.length;
    const selectedPrecision = relevantSelected / Math.max(1, renderedTags.length);
    expect(recall).toBe(1);
    expect(selectedPrecision).toBeGreaterThanOrEqual(0.95);
    console.info('DemoScenario016_BASELINE', JSON.stringify({
      seed: PERFORMANCE_FIXTURE_SEED,
      tier: tier.name,
      files: tier.fileCount,
      bytes: tier.totalBytes,
      candidates: grounded.value.selection.candidateCount,
      selected: grounded.value.selection.selectedCount,
      batch,
      recall,
      selectedPrecision,
      import: imported.metric,
      grounding: grounded.metric,
    }));
  }, 30_000);

  it('records bounded client runtime replacement and append evidence', () => {
    const events = createRuntimeEvents(300);
    const appendCandidates = createRuntimeEvents(301);
    const appendedEvent = appendCandidates[appendCandidates.length - 1]!;
    const batchSize = 250;
    const measured = measureSync(() => {
      const store = new RuntimeActivityStore();
      store.replace({ events, definitions: [], profiles: [], orchestrationRuns: [], patchProposals: [] });
      store.append(appendedEvent);
      return store.getSnapshot();
    }, 2, 10, batchSize);
    expect(measured.value.events).toHaveLength(200);
    expect(measured.value.events[0]?.seq).toBe(102);
    expect(measured.value.events[measured.value.events.length - 1]?.seq).toBe(301);
    console.info('DemoScenario016_RUNTIME_BASELINE', JSON.stringify({
      seed: PERFORMANCE_FIXTURE_SEED,
      serverSnapshotEvents: 300,
      retainedEvents: measured.value.events.length,
      batchSize,
      replaceAndAppend: measured.metric,
    }));
  });
});
