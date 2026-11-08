import {
  FULL_CROP,
  aspectFactor,
  centeredCrop,
  cropPixels,
  isCrop,
  orientedSize,
  type AspectPreset,
  type Crop,
  type Rotation,
} from '../core/geometry';
import { p } from '../core/params';
import { context2d, createCanvas } from '../engine/canvas';
import { mapOp } from './op';

export const TRANSFORM_PARAMS = {
  rotate: p.choice({
    label: 'Rotate',
    default: '0',
    options: [
      { value: '0', label: '0°' },
      { value: '90', label: '90°' },
      { value: '180', label: '180°' },
      { value: '270', label: '270°' },
    ],
  }),
  flipH: p.boolean({ label: 'Flip horizontally', default: false }),
  flipV: p.boolean({ label: 'Flip vertically', default: false }),
  aspect: p.choice({
    label: 'Crop ratio',
    default: 'free',
    display: 'select',
    options: [
      { value: 'free', label: 'Free' },
      { value: 'original', label: 'Original' },
      { value: '1:1', label: 'Square (1:1)' },
      { value: '4:3', label: '4:3' },
      { value: '3:2', label: '3:2' },
      { value: '16:9', label: '16:9' },
    ],
  }),
  crop: p.custom<Crop>({
    label: 'Crop',
    default: FULL_CROP,
    sanitize: (raw) => (isCrop(raw) ? { ...raw } : FULL_CROP),
  }),
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
): Crop {
  const k = aspectFactor(aspect, size);
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
  return width === 1 && height === 1 ? centeredCrop(k) : { x, y, width, height };
}

export const transform = mapOp({
  id: 'transform',
  kind: 'map',
  title: 'Rotate, flip & crop',
  description: 'Turn or mirror the image and cut it to a region or ratio.',
  suffix: 'edited',
  params: TRANSFORM_PARAMS,
  run(image, values) {
    const rotate = Number(values.rotate) as Rotation;
    const oriented = orientedSize(image, rotate);
    const crop = cropPixels(cropForImage(values.crop, values.aspect, oriented), oriented);
    const out = createCanvas(crop.width, crop.height);
    const context = context2d(out);
    // Shift so the crop lands at the origin, then rotate/flip about the
    // oriented image's center.
    context.translate(-crop.x, -crop.y);
    context.translate(oriented.width / 2, oriented.height / 2);
    context.rotate((rotate * Math.PI) / 180);
    context.scale(values.flipH ? -1 : 1, values.flipV ? -1 : 1);
    context.drawImage(image, -image.width / 2, -image.height / 2);
    return out;
  },
});
