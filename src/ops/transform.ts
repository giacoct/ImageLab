import {
  FULL_CROP,
  aspectFactor,
  centeredCrop,
  cropPixels,
  rotatedSize,
  type AspectPreset,
  type Crop,
  type Rect,
  type Rotation,
  type Size,
} from "../core/geometry";
import { p, type Values } from "../core/params";
import { context2d, createCanvas } from "../engine/canvas";
import { mapOp } from "./op";

const PARAMS = {
  rotate: p.choice({
    label: "Rotate",
    default: "0",
    options: [
      { value: "0", label: "0°" },
      { value: "90", label: "90°" },
      { value: "180", label: "180°" },
      { value: "270", label: "270°" },
    ],
  }),
  angle: p.number({
    label: "Straighten",
    default: 0,
    min: -45,
    max: 45,
    step: 0.1,
    unit: "°",
  }),
  fill: p.boolean({
    label: "Crop the empty corners",
    default: true,
    hint: "Otherwise the corners are left transparent.",
    when: (v) => v.angle !== 0,
  }),
  flipH: p.boolean({ label: "Flip horizontally", default: false }),
  flipV: p.boolean({ label: "Flip vertically", default: false }),
  aspect: p.choice({
    label: "Crop ratio",
    default: "free",
    display: "select",
    options: [
      { value: "free", label: "Free" },
      { value: "original", label: "Original" },
      { value: "1:1", label: "Square (1:1)" },
      { value: "4:3", label: "4:3" },
      { value: "3:2", label: "3:2" },
      { value: "16:9", label: "16:9" },
    ],
  }),
  orientation: p.choice({
    label: "Orientation",
    default: "landscape",
    options: [
      { value: "landscape", label: "Landscape", icon: "rectangle-horizontal" },
      { value: "portrait", label: "Portrait", icon: "rectangle-vertical" },
    ],
    when: (v) => ["4:3", "3:2", "16:9"].includes(String(v.aspect)),
  }),
  // Edited on the image by the crop editor (ui/CropEditor.svelte).
  crop: p.custom<Crop>({ label: "Crop", default: FULL_CROP }),
};

/**
 * The crop adjusted to the ratio preset for an image of `size`: a ratio crop
 * saved on one image keeps its center and width on another, with the height
 * derived from the ratio (shrunk to fit if needed).
 */
export function cropForImage(
  crop: Crop,
  aspect: AspectPreset,
  size: { width: number; height: number },
  portrait = false,
): Crop {
  const k = aspectFactor(aspect, size, portrait);
  if (k === null || Math.abs(crop.height - crop.width * k) < 1e-6) return crop; // free, or already this ratio
  let width = crop.width;
  let height = width * k;
  if (height > 1) {
    height = 1;
    width = 1 / k;
  }
  const cx = crop.x + crop.width / 2;
  const cy = crop.y + crop.height / 2;
  const x = Math.min(1 - width, Math.max(0, cx - width / 2));
  const y = Math.min(1 - height, Math.max(0, cy - height / 2));
  return width === 1 && height === 1
    ? centeredCrop(k)
    : { x, y, width, height };
}

type TransformValues = Values<typeof PARAMS>;

/**
 * Where the result comes from, for an image of `size`: the turned image's
 * size (whole pixels, rounded down, so a filled frame never shows a corner)
 * and the crop in it. Also the result's size, for the crop editor.
 */
export function layout(
  size: Size,
  values: Pick<
    TransformValues,
    "rotate" | "angle" | "fill" | "aspect" | "orientation" | "crop"
  >,
): { oriented: Size; crop: Rect } {
  const rotate = Number(values.rotate) as Rotation;
  const turned = rotatedSize(size, rotate, values.angle, values.fill);
  const oriented = {
    width: Math.max(1, Math.floor(turned.width + 1e-6)),
    height: Math.max(1, Math.floor(turned.height + 1e-6)),
  };
  const crop = cropPixels(
    cropForImage(
      values.crop,
      values.aspect,
      oriented,
      values.orientation === "portrait",
    ),
    oriented,
  );
  return { oriented, crop };
}

export const transform = mapOp({
  id: "transform",
  kind: "map",
  title: "Rotate, flip & crop",
  description: "Turn or mirror the image and cut it to a region or ratio.",
  suffix: "edited",
  params: PARAMS,
  run(image, values) {
    const { oriented, crop } = layout(image, values);
    const out = createCanvas(crop.width, crop.height);
    const context = context2d(out);
    // Shift so the crop lands at the origin, then rotate/flip about the
    // oriented image's center.
    context.translate(-crop.x, -crop.y);
    context.translate(oriented.width / 2, oriented.height / 2);
    context.rotate(((Number(values.rotate) + values.angle) * Math.PI) / 180);
    context.scale(values.flipH ? -1 : 1, values.flipV ? -1 : 1);
    context.drawImage(image, -image.width / 2, -image.height / 2);
    return out;
  },
});
