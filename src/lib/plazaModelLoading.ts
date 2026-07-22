export const PLAZA_CRITICAL_MODEL_COUNT = 1;

export interface PlazaModelLoadPlan {
  critical: number[];
  background: number[];
}

/** 孔子模型是唯一首要资源；其余角色在轻量席位可用后进入后台加载。 */
export function createPlazaModelLoadPlan(modelCount: number): PlazaModelLoadPlan {
  const total = Number.isFinite(modelCount) ? Math.max(0, Math.floor(modelCount)) : 0;
  const indexes = Array.from({ length: total }, (_, index) => index);
  return {
    critical: indexes.slice(0, PLAZA_CRITICAL_MODEL_COUNT),
    background: indexes.slice(PLAZA_CRITICAL_MODEL_COUNT),
  };
}
