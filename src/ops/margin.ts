import { marginPixels } from '../core/geometry';
import { p, type AnyValues } from '../core/params';
import { hexToRgb } from '../core/pixels';
import { context2d, createCanvas } from '../engine/canvas';
import { mapOp } from './op';

const unit = (v: AnyValues) => (v.unit === 'percent' ? '%' : 'px');
const side = (label: string) =>
  p.number({
    label,
    default: 40,
    min: 0,
    max: 2000,
    unit,
    slider: false,
    when: (v) => !v.linked,
  });

export const margin = mapOp({
  id: 'margin',
  kind: 'map',
  title: 'Add margin',
  description: 'Surround the image with a colored or transparent border.',
  suffix: 'margin',
  params: {
    unit: p.choice({
      label: 'Measured in',
      default: 'px',
      options: [
        { value: 'px', label: 'Pixels' },
        { value: 'percent', label: '% of shorter side' },
      ],
    }),
    linked: p.boolean({ label: 'Same on all sides', default: true }),
    all: p.number({
      label: 'Thickness',
      default: 40,
      min: 0,
      max: 2000,
      unit,
      slider: false,
      when: (v) => Boolean(v.linked),
    }),
    top: side('Top'),
    right: side('Right'),
    bottom: side('Bottom'),
    left: side('Left'),
    color: p.color({ label: 'Color', default: '#000000' }),
    opacity: p.number({ label: 'Opacity', default: 100, min: 0, max: 100, unit: '%' }),
  },
  run(image, values, context) {
    const sides = values.linked
      ? { top: values.all, right: values.all, bottom: values.all, left: values.all }
      : values;
    const full = marginPixels(sides, values.unit, {
      width: image.width / context.scale,
      height: image.height / context.scale,
    });
    const px = (n: number) => Math.round(n * context.scale);
    const [top, right, bottom, left] = [
      px(full.top),
      px(full.right),
      px(full.bottom),
      px(full.left),
    ];

    const out = createCanvas(image.width + left + right, image.height + top + bottom);
    const ctx = context2d(out);
    const { r, g, b } = hexToRgb(values.color);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${values.opacity / 100})`;
    // Fill only the bands, so a semi-transparent margin never tints the image.
    ctx.fillRect(0, 0, out.width, top);
    ctx.fillRect(0, out.height - bottom, out.width, bottom);
    ctx.fillRect(0, top, left, image.height);
    ctx.fillRect(out.width - right, top, right, image.height);
    ctx.drawImage(image, left, top);
    return out;
  },
});
