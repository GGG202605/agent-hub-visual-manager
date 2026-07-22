import { describe, expect, it } from 'vitest';
import { resolvePlazaViewportLayout } from '../plazaViewport';

describe('Plaza viewport layout', () => {
  it('uses the portrait fit for the real 390px stage after the mobile rail', () => {
    expect(resolvePlazaViewportLayout(334, 796)).toEqual({
      mode: 'portrait',
      layoutScaleX: 0.4,
      modelScale: 0.78,
      cameraY: 7.7,
      cameraZ: 16,
      cameraFov: 40,
      labelInset: 32,
    });
  });

  it('keeps a separate narrow-landscape/tablet fit', () => {
    expect(resolvePlazaViewportLayout(600, 700)).toMatchObject({ mode: 'narrow', cameraZ: 15.8 });
  });

  it('preserves the established desktop camera', () => {
    expect(resolvePlazaViewportLayout(1_280, 720)).toMatchObject({
      mode: 'desktop', layoutScaleX: 1, modelScale: 1, cameraY: 5.9, cameraZ: 11.6, cameraFov: 38,
    });
  });
});
