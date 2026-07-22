import { describe, expect, it } from 'vitest';
import { createPlazaModelLoadPlan, PLAZA_CRITICAL_MODEL_COUNT } from '../plazaModelLoading';

describe('DemoScenario016 staged plaza model loading', () => {
  it('loads only the coordinator model in the critical batch', () => {
    expect(PLAZA_CRITICAL_MODEL_COUNT).toBe(1);
    expect(createPlazaModelLoadPlan(8)).toEqual({
      critical: [0],
      background: [1, 2, 3, 4, 5, 6, 7],
    });
  });

  it('partitions every model exactly once and handles empty input', () => {
    const plan = createPlazaModelLoadPlan(3);
    expect([...plan.critical, ...plan.background]).toEqual([0, 1, 2]);
    expect(new Set([...plan.critical, ...plan.background]).size).toBe(3);
    expect(createPlazaModelLoadPlan(0)).toEqual({ critical: [], background: [] });
    expect(createPlazaModelLoadPlan(Number.NaN)).toEqual({ critical: [], background: [] });
  });
});
