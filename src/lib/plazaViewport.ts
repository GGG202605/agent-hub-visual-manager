export interface PlazaViewportLayout {
  mode: 'desktop' | 'narrow' | 'portrait';
  layoutScaleX: number;
  modelScale: number;
  cameraY: number;
  cameraZ: number;
  cameraFov: number;
  labelInset: number;
}

/** 依据舞台真实宽高比取景，避免桌面页面切到竖屏后仍沿用横屏相机常量。 */
export function resolvePlazaViewportLayout(width: number, height: number): PlazaViewportLayout {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const aspect = safeWidth / safeHeight;
  if (safeWidth < 640 && aspect < 0.55) {
    return {
      mode: 'portrait',
      layoutScaleX: 0.4,
      modelScale: 0.78,
      cameraY: 7.7,
      cameraZ: 16,
      cameraFov: 40,
      labelInset: 32,
    };
  }
  if (safeWidth < 640) {
    return {
      mode: 'narrow',
      layoutScaleX: 0.33,
      modelScale: 0.68,
      cameraY: 6.6,
      cameraZ: 15.8,
      cameraFov: 38,
      labelInset: 52,
    };
  }
  return {
    mode: 'desktop',
    layoutScaleX: 1,
    modelScale: 1,
    cameraY: 5.9,
    cameraZ: 11.6,
    cameraFov: 38,
    labelInset: safeWidth < 1_000 ? 104 : 76,
  };
}
