/**
 * Wide-gamut images: whether the colors a file declares reach past sRGB's,
 * from its ICC profile (the area of the triangle its red, green and blue
 * make) or the primaries a HEIC or AVIF codes. Such an image is worked on in
 * Display P3, so its colors survive the tools (see `engine/canvas.ts`).
 */

import type { DeclaredColor } from "./isobmff";

/** The color spaces canvases offer. */
export type ColorSpace = "srgb" | "display-p3";

/** Coded primaries (ITU-T H.273) wider than sRGB's: BT.2020, DCI-P3, Display P3. */
const WIDE_PRIMARIES = new Set([9, 11, 12]);

/** sRGB's red, green and blue in an ICC profile (XYZ, adapted to D50). */
const SRGB: [number, number, number][] = [
  [0.4361, 0.2225, 0.0139],
  [0.3851, 0.7169, 0.0971],
  [0.1431, 0.0606, 0.7141],
];

/** Wider than sRGB by this much: Display P3 is ~1.35×, Adobe RGB ~1.4×. */
const WIDER = 1.1;

/** The area of the triangle the primaries make on the chromaticity diagram. */
function gamutArea(primaries: [number, number, number][]): number {
  const [r, g, b] = primaries.map(([x, y, z]) => {
    const sum = x + y + z || 1;
    return [x / sum, y / sum];
  });
  return (
    Math.abs((g[0] - r[0]) * (b[1] - r[1]) - (b[0] - r[0]) * (g[1] - r[1])) / 2
  );
}

/**
 * Whether an ICC profile's colors reach past sRGB's. Only matrix profiles
 * tell (by their `rXYZ`, `gXYZ`, `bXYZ` tags); for others, it's taken as
 * not.
 */
export function isWideProfile(icc: Uint8Array): boolean {
  try {
    const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength);
    const tag = (at: number) =>
      String.fromCharCode(...icc.subarray(at, at + 4));
    if (tag(36) !== "acsp") return false;
    const found: Record<string, [number, number, number]> = {};
    const count = view.getUint32(128);
    for (let i = 0; i < count; i++) {
      const entry = 132 + i * 12;
      const name = tag(entry);
      if (name !== "rXYZ" && name !== "gXYZ" && name !== "bXYZ") continue;
      const at = view.getUint32(entry + 4);
      if (tag(at) !== "XYZ ") continue;
      const fixed = (k: number) => view.getInt32(at + 8 + k * 4) / 65536;
      found[name] = [fixed(0), fixed(1), fixed(2)];
    }
    const { rXYZ, gXYZ, bXYZ } = found;
    if (!rXYZ || !gXYZ || !bXYZ) return false;
    return gamutArea([rXYZ, gXYZ, bXYZ]) > gamutArea(SRGB) * WIDER;
  } catch {
    return false;
  }
}

/** Whether what a HEIC or AVIF declares reaches past sRGB. */
export function isWideDeclared(colors: readonly DeclaredColor[]): boolean {
  return colors.some((color) =>
    "icc" in color
      ? isWideProfile(color.icc)
      : WIDE_PRIMARIES.has(color.primaries),
  );
}

/** Display P3's coded primaries and transfer (the sRGB curve), for AVIF. */
export const DISPLAY_P3_CODES = { primaries: 12, transfer: 13 };
