/**
 * Dependency-free raster → SVG vectorizer.
 *
 * The image is posterized to a small palette (median-cut quantization), and
 * each color region is traced into exact, axis-aligned vector outlines along
 * the pixel lattice. Outer boundaries wind counter-clockwise and holes wind
 * clockwise, so the default non-zero fill rule subtracts holes correctly.
 *
 * The logic is pure (it takes raw RGBA bytes, not a DOM `ImageData`) so it can
 * be unit tested without a canvas.
 */

export interface VectorImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface VectorizeOptions {
  /** Number of palette colors to posterize to (clamped to 2..16). */
  colors: number;
  /** Intrinsic SVG size; the traced grid is scaled up to fill it. */
  displayWidth: number;
  displayHeight: number;
}

type Rgb = [number, number, number];

/** Pixels with alpha below this are treated as background (left untraced). */
const ALPHA_THRESHOLD = 128;

export function imageToSvg(image: VectorImageData, options: VectorizeOptions): string {
  const { width, height } = image;
  const colorCount = Math.max(2, Math.min(16, Math.round(options.colors)));
  const { palette, indices } = quantize(image, colorCount);

  const paths: string[] = [];
  for (let color = 0; color < palette.length; color++) {
    const d = traceColor(indices, color, width, height);
    if (d) {
      paths.push(`<path fill="${toHex(palette[color])}" d="${d}"/>`);
    }
  }

  const viewBox = `0 0 ${width} ${height}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.displayWidth}" ` +
    `height="${options.displayHeight}" viewBox="${viewBox}" ` +
    `shape-rendering="crispEdges">${paths.join('')}</svg>`
  );
}

/**
 * Median-cut color quantization. Returns the palette plus, for every pixel, the
 * index of its nearest palette color (or -1 when the pixel is transparent).
 */
export function quantize(
  image: VectorImageData,
  colorCount: number,
): { palette: Rgb[]; indices: Int32Array } {
  const { data, width, height } = image;
  const pixelCount = width * height;
  const opaque: Rgb[] = [];

  for (let i = 0; i < pixelCount; i++) {
    if (data[i * 4 + 3] >= ALPHA_THRESHOLD) {
      opaque.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
    }
  }

  const palette = medianCut(opaque, colorCount);
  const indices = new Int32Array(pixelCount).fill(-1);

  if (palette.length === 0) {
    return { palette, indices };
  }

  for (let i = 0; i < pixelCount; i++) {
    if (data[i * 4 + 3] < ALPHA_THRESHOLD) {
      continue;
    }
    indices[i] = nearestColor(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], palette);
  }

  return { palette, indices };
}

function medianCut(pixels: Rgb[], maxColors: number): Rgb[] {
  if (pixels.length === 0) {
    return [];
  }

  let buckets: Rgb[][] = [pixels];

  while (buckets.length < maxColors) {
    let target = -1;
    let widestRange = -1;
    let splitChannel = 0;

    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length < 2) {
        continue;
      }
      const { range, channel } = widestChannel(buckets[i]);
      if (range > widestRange) {
        widestRange = range;
        target = i;
        splitChannel = channel;
      }
    }

    if (target === -1 || widestRange === 0) {
      break; // every bucket holds a single color; nothing left to split
    }

    const bucket = buckets[target];
    bucket.sort((a, b) => a[splitChannel] - b[splitChannel]);
    const mid = bucket.length >> 1;
    buckets.splice(target, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  return buckets.map(averageColor);
}

function widestChannel(bucket: Rgb[]): { range: number; channel: number } {
  const min: Rgb = [255, 255, 255];
  const max: Rgb = [0, 0, 0];

  for (const pixel of bucket) {
    for (let c = 0; c < 3; c++) {
      if (pixel[c] < min[c]) min[c] = pixel[c];
      if (pixel[c] > max[c]) max[c] = pixel[c];
    }
  }

  let channel = 0;
  let range = -1;
  for (let c = 0; c < 3; c++) {
    const spread = max[c] - min[c];
    if (spread > range) {
      range = spread;
      channel = c;
    }
  }

  return { range, channel };
}

function averageColor(bucket: Rgb[]): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const pixel of bucket) {
    r += pixel[0];
    g += pixel[1];
    b += pixel[2];
  }
  const count = bucket.length;
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

function nearestColor(r: number, g: number, b: number, palette: Rgb[]): number {
  let best = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < palette.length; i++) {
    const dr = r - palette[i][0];
    const dg = g - palette[i][1];
    const db = b - palette[i][2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }

  return best;
}

/**
 * Trace every region of a single palette color into SVG path data. Each filled
 * pixel contributes the lattice edges where it meets a different color (or the
 * image border), oriented so the filled side is always on the edge's left. Those
 * unit edges are then stitched into closed loops.
 */
export function traceColor(
  indices: Int32Array,
  colorIndex: number,
  width: number,
  height: number,
): string {
  const stride = width + 1;
  // Directed edges keyed by their start lattice vertex (y * stride + x).
  const edges = new Map<number, number[]>();
  const addEdge = (ax: number, ay: number, bx: number, by: number): void => {
    const from = ay * stride + ax;
    const to = by * stride + bx;
    const list = edges.get(from);
    if (list) {
      list.push(to);
    } else {
      edges.set(from, [to]);
    }
  };

  const isColor = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && indices[y * width + x] === colorIndex;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (indices[y * width + x] !== colorIndex) {
        continue;
      }
      // Walk each boundary edge so the filled pixel stays on the left.
      if (!isColor(x, y - 1)) addEdge(x, y, x + 1, y); // top  → +x
      if (!isColor(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1); // right → +y
      if (!isColor(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1); // bottom → -x
      if (!isColor(x - 1, y)) addEdge(x, y + 1, x, y); // left → -y
    }
  }

  if (edges.size === 0) {
    return '';
  }

  return loopsToPath(buildLoops(edges, stride), stride);
}

function buildLoops(edges: Map<number, number[]>, stride: number): number[][] {
  const loops: number[][] = [];

  for (const start of edges.keys()) {
    let outgoing = edges.get(start);
    while (outgoing && outgoing.length > 0) {
      const loop: number[] = [start];
      let current = start;

      do {
        const next = edges.get(current);
        if (!next || next.length === 0) {
          break; // unreachable on a balanced boundary graph
        }
        current = next.pop()!;
        loop.push(current);
      } while (current !== start);

      loops.push(simplifyLoop(loop, stride));
      outgoing = edges.get(start);
    }
  }

  return loops;
}

/** Drop interior points that are collinear with their neighbors. */
function simplifyLoop(loop: number[], stride: number): number[] {
  if (loop.length < 4) {
    return loop;
  }

  // `loop` is a closed ring whose first and last vertices coincide.
  const ring = loop.slice(0, -1);
  const kept: number[] = [];
  const count = ring.length;

  for (let i = 0; i < count; i++) {
    const prev = ring[(i - 1 + count) % count];
    const curr = ring[i];
    const next = ring[(i + 1) % count];

    const ax = prev % stride;
    const ay = (prev / stride) | 0;
    const bx = curr % stride;
    const by = (curr / stride) | 0;
    const cx = next % stride;
    const cy = (next / stride) | 0;

    // Keep the vertex only where the edge changes direction (a corner).
    const collinear = (bx - ax) * (cy - by) === (by - ay) * (cx - bx);
    if (!collinear) {
      kept.push(curr);
    }
  }

  return kept;
}

function loopsToPath(loops: number[][], stride: number): string {
  const parts: string[] = [];

  for (const loop of loops) {
    if (loop.length < 3) {
      continue;
    }
    const segments: string[] = [];
    for (let i = 0; i < loop.length; i++) {
      const x = loop[i] % stride;
      const y = (loop[i] / stride) | 0;
      segments.push(`${i === 0 ? 'M' : 'L'}${x} ${y}`);
    }
    parts.push(`${segments.join('')}Z`);
  }

  return parts.join('');
}

function toHex([r, g, b]: Rgb): string {
  return `#${componentHex(r)}${componentHex(g)}${componentHex(b)}`;
}

function componentHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}
