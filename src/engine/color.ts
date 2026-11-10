/**
 * The color space of the files the engine reads and writes (`core/color.ts`
 * tells wide-gamut ones apart): which one to work on a file in, and the
 * profile that tells the files it writes are in Display P3.
 */

import { isWideDeclared, isWideProfile, type ColorSpace } from "../core/color";
import { declaredColors } from "../core/isobmff";
import { profileOf } from "../core/metadata";
import { canHoldP3 } from "./canvas";

/** Display P3 for a file whose colors reach past sRGB, where canvases can hold it. */
export async function colorSpaceOf(bytes: Uint8Array): Promise<ColorSpace> {
  if (!canHoldP3) return "srgb";
  const profile = profileOf(bytes);
  let wide: boolean;
  if (profile) {
    const icc = profile.deflated ? await inflate(profile.data) : profile.data;
    wide = icc !== null && isWideProfile(icc);
  } else wide = isWideDeclared(declaredColors(bytes));
  return wide ? "display-p3" : "srgb";
}

async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([data as Uint8Array<ArrayBuffer>])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

let p3Profile: Promise<Uint8Array | null> | undefined;

/**
 * A Display P3 ICC profile, for the files the codecs write: the browser's
 * own, from a JPEG it writes from a Display P3 canvas. Null if it writes
 * none (then the image is saved in sRGB).
 */
export function displayP3Profile(): Promise<Uint8Array | null> {
  p3Profile ??= (async () => {
    if (!canHoldP3) return null;
    try {
      const canvas = new OffscreenCanvas(1, 1);
      canvas
        .getContext("2d", { colorSpace: "display-p3" })!
        .fillRect(0, 0, 1, 1);
      const jpeg = await canvas.convertToBlob({ type: "image/jpeg" });
      const profile = profileOf(new Uint8Array(await jpeg.arrayBuffer()));
      return profile && isWideProfile(profile.data) ? profile.data : null;
    } catch {
      return null;
    }
  })();
  return p3Profile;
}
