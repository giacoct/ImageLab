declare module 'imagetracerjs' {
  /** A subset of imagetracerjs trace options; see the package's options.md. */
  export interface ImageTracerOptions {
    /** Palette size when no custom palette is supplied. */
    numberofcolors?: number;
    /** Error threshold for fitting straight lines (higher = smoother, fewer nodes). */
    ltres?: number;
    /** Error threshold for fitting quadratic splines (higher = smoother). */
    qtres?: number;
    /** Discard paths shorter than this many points (removes speckle). */
    pathomit?: number;
    /** Snap near-right angles; helps crisp corners. */
    rightangleenhance?: boolean;
    /** Color sampling strategy: 0 = disabled, 1 = random, 2 = deterministic. */
    colorsampling?: 0 | 1 | 2;
    /** Passes of palette refinement. */
    colorquantcycles?: number;
    /** Gaussian pre-blur radius (0 disables). */
    blurradius?: number;
    blurdelta?: number;
    /** Coordinate decimals in the output path data. */
    roundcoords?: number;
    /** Multiplies all output coordinates. */
    scale?: number;
    /** Emit a viewBox instead of width/height. */
    viewbox?: boolean;
  }

  /** Minimal shape of a canvas `ImageData` (so callers needn't depend on the DOM lib). */
  export interface ImageTracerImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  export interface ImageTracer {
    /** Synchronously trace raw image data into an SVG document string. */
    imagedataToSVG(imagedata: ImageTracerImageData, options?: ImageTracerOptions | string): string;
  }

  const instance: ImageTracer;
  export default instance;
}
