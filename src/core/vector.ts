/**
 * Settings for tracing an image into SVG with VTracer (`vtracer-wasm`). The
 * UI speaks in simple terms; {@link tracerConfig} turns them into the
 * converter's own units, the way VTracer's CLI does.
 */

export interface TraceSettings {
  colors: 'color' | 'bw';
  /** 1–8: significant bits kept per color channel; more keeps more colors apart. */
  detail: number;
  /** Patches smaller than this many pixels per side are dropped. */
  speckle: number;
  corners: 'sharp' | 'balanced' | 'round';
  curves: 'spline' | 'polygon';
}

/** Corner angle threshold in degrees, and minimum segment length, per style. */
const CORNERS = {
  sharp: { angle: 30, length: 3.5 },
  balanced: { angle: 60, length: 4 },
  round: { angle: 100, length: 6 },
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The config object `to_svg` expects. */
export function tracerConfig(settings: TraceSettings) {
  const corners = CORNERS[settings.corners];
  return {
    binary: settings.colors === 'bw',
    mode: settings.curves,
    hierarchical: 'stacked',
    cornerThreshold: radians(corners.angle),
    lengthThreshold: corners.length,
    maxIterations: 10,
    spliceThreshold: radians(45),
    // The converter takes the speckle *area* and the precision *loss*.
    filterSpeckle: settings.speckle * settings.speckle,
    colorPrecision: 8 - Math.min(8, Math.max(1, settings.detail)),
    layerDifference: 16,
    pathPrecision: 2,
  };
}

/** Show a trace made on an enlarged copy at the original size (width/height + viewBox). */
export function restoreSize(
  svg: string,
  original: { width: number; height: number },
  traced: { width: number; height: number },
): string {
  if (original.width === traced.width && original.height === traced.height) return svg;
  return svg.replace(
    `width="${traced.width}" height="${traced.height}"`,
    `width="${original.width}" height="${original.height}" viewBox="0 0 ${traced.width} ${traced.height}"`,
  );
}
