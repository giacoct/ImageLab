import { mergeLayout, type MergeAlignment, type MergeDirection } from '../core/geometry';
import { p, type AnyValues } from '../core/params';
import { context2d, createCanvas } from '../engine/canvas';
import { combineOp } from './op';

const vertical = (v: AnyValues) => v.direction === 'vertical';

export const merge = combineOp({
  id: 'merge',
  kind: 'combine',
  title: 'Merge images',
  description: 'Combine all images into one, stacked or side by side.',
  suffix: 'merged',
  minInputs: 2,
  params: {
    direction: p.choice({
      label: 'Direction',
      default: 'vertical',
      options: [
        { value: 'vertical', label: 'Top to bottom' },
        { value: 'horizontal', label: 'Side by side' },
      ],
    }),
    alignment: p.choice({
      label: (v) => (vertical(v) ? 'Horizontal alignment' : 'Vertical alignment'),
      default: 'center',
      options: [
        { value: 'start', label: (v) => (vertical(v) ? 'Left' : 'Top') },
        { value: 'center', label: (v) => (vertical(v) ? 'Center' : 'Middle') },
        { value: 'end', label: (v) => (vertical(v) ? 'Right' : 'Bottom') },
      ],
    }),
    resize: p.choice({
      label: 'Sizes',
      default: 'none',
      options: [
        { value: 'none', label: 'Keep natural sizes' },
        { value: 'fill', label: (v) => (vertical(v) ? 'Match widths' : 'Match heights') },
      ],
    }),
    gap: p.number({ label: 'Gap', default: 0, min: 0, max: 500, unit: 'px', slider: false }),
    transparent: p.boolean({ label: 'Transparent background', default: true }),
    background: p.color({
      label: 'Background',
      default: '#ffffff',
      when: (v) => !v.transparent,
    }),
  },
  run(images, values, context) {
    const layout = mergeLayout(images, {
      direction: values.direction as MergeDirection,
      alignment: values.alignment as MergeAlignment,
      resize: values.resize,
      gap: values.gap * context.scale,
    });
    const out = createCanvas(layout.width, layout.height);
    const ctx = context2d(out);
    if (!values.transparent) {
      ctx.fillStyle = values.background;
      ctx.fillRect(0, 0, out.width, out.height);
    }
    layout.placements.forEach((place, i) =>
      ctx.drawImage(images[i], place.x, place.y, place.width, place.height),
    );
    return out;
  },
});
