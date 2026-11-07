/**
 * Settings for VTracer (raster → SVG). The UI speaks in VTracer's documented
 * units; the WASM build (`vtracer-wasm`) takes the converter's internal ones,
 * which {@link tracerConfig} derives the way VTracer's own CLI does.
 */

export interface TraceSettings {
  mode: 'spline' | 'polygon';
  /** Significant bits per RGB channel (1–8); more keeps more distinct colors. */
  colorPrecision: number;
  /** Discard patches smaller than this many pixels per side. */
  filterSpeckle: number;
  /** Color difference between layers; higher merges more layers. */
  layerDifference: number;
  /** Angle in degrees under which a corner is kept; higher = rounder. */
  cornerThreshold: number;
  /** Minimum segment length; higher discards jitter. */
  lengthThreshold: number;
  /** Decimal places in path coordinates. */
  pathPrecision: number;
}

/** The object `vtracer-wasm`'s `to_svg` expects. */
export interface TracerConfig {
  binary: boolean;
  mode: 'spline' | 'polygon';
  hierarchical: 'stacked';
  cornerThreshold: number;
  lengthThreshold: number;
  maxIterations: number;
  spliceThreshold: number;
  filterSpeckle: number;
  colorPrecision: number;
  layerDifference: number;
  pathPrecision: number;
}

const radians = (degrees: number) => (degrees / 180) * Math.PI;

export function tracerConfig(settings: TraceSettings): TracerConfig {
  return {
    binary: false,
    mode: settings.mode,
    hierarchical: 'stacked',
    cornerThreshold: radians(settings.cornerThreshold),
    lengthThreshold: settings.lengthThreshold,
    maxIterations: 10,
    spliceThreshold: radians(45),
    // The converter works with the speckle *area* and the precision *loss*.
    filterSpeckle: settings.filterSpeckle * settings.filterSpeckle,
    colorPrecision: 8 - Math.min(8, Math.max(1, settings.colorPrecision)),
    layerDifference: settings.layerDifference,
    pathPrecision: settings.pathPrecision,
  };
}

/** Present a trace made on an enlarged copy at the original size (width/height + viewBox). */
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
