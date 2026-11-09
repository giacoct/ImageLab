import { fitInside, roundSize, type Size } from '../core/geometry';
import { p, type Values } from '../core/params';
import { downscaled, resized } from '../engine/canvas';
import { mapOp } from './op';

const PIXEL_MODES = new Set(['fit', 'width', 'height', 'exact']);

const PARAMS = {
  mode: p.choice({
    label: 'Scale',
    default: 'percent',
    display: 'select',
    options: [
      { value: 'percent', label: 'By percentage' },
      { value: 'fit', label: 'Fit inside a box' },
      { value: 'width', label: 'To a width' },
      { value: 'height', label: 'To a height' },
      { value: 'exact', label: 'Exact size (may stretch)' },
    ],
  }),
  percent: p.number({
    label: 'Percentage',
    default: 50,
    min: 1,
    max: 400,
    unit: '%',
    when: (v) => v.mode === 'percent',
  }),
  width: p.number({
    label: 'Width',
    default: 1920,
    min: 1,
    max: 16_000,
    unit: 'px',
    slider: false,
    when: (v) => v.mode !== 'percent' && v.mode !== 'height',
  }),
  height: p.number({
    label: 'Height',
    default: 1080,
    min: 1,
    max: 16_000,
    unit: 'px',
    slider: false,
    when: (v) => v.mode === 'fit' || v.mode === 'height' || v.mode === 'exact',
  }),
  enlarge: p.boolean({
    label: 'Enlarge smaller images',
    default: false,
    when: (v) => v.mode === 'fit' || v.mode === 'width' || v.mode === 'height',
  }),
};

/** The output size for an input of `size`; `scale` is the preview factor (see RunContext). */
function scaledSize(
  size: Size,
  values: Values<typeof PARAMS>,
  scale = 1,
): Size {
  const width = values.width * scale;
  const height = values.height * scale;
  switch (values.mode) {
    case 'percent':
      return roundSize({
        width: (size.width * values.percent) / 100,
        height: (size.height * values.percent) / 100,
      });
    case 'fit':
      return fitInside(size, { width, height }, values.enlarge);
    case 'width':
      return fitInside(
        size,
        { width, height: Number.POSITIVE_INFINITY },
        values.enlarge,
      );
    case 'height':
      return fitInside(
        size,
        { width: Number.POSITIVE_INFINITY, height },
        values.enlarge,
      );
    default:
      return roundSize({ width, height });
  }
}

export const scale = mapOp({
  id: 'scale',
  kind: 'map',
  title: 'Scale',
  description:
    'Resize by a percentage, to fit a box, or to an exact width/height.',
  suffix: 'scaled',
  params: PARAMS,
  run(image, values, context) {
    // Pixel targets are relative to the full-size image; previews are smaller.
    const target = scaledSize(
      image,
      values,
      PIXEL_MODES.has(values.mode) ? context.scale : 1,
    );
    if (target.width === image.width && target.height === image.height)
      return image;
    return target.width < image.width && target.height < image.height
      ? downscaled(image, target.width, target.height)
      : resized(image, target.width, target.height);
  },
});
