/** Merge images: combine all the images into one, stacked or side by side. */

import { mergeLayout } from '../core/geometry';
import { p } from '../core/params';
import { context2d, createCanvas } from '../engine/canvas';
import { combineOp } from './op';

export const merge = combineOp({
  id: 'merge',
  kind: 'combine',
  title: 'Merge images',
  description: 'Combine all the images into one, in the order of the list.',
  suffix: 'merged',
  params: {
    direction: p.choice({
      label: 'Direction',
      default: 'vertical',
      options: [
        { value: 'vertical', label: 'Stacked' },
        { value: 'horizontal', label: 'Side by side' },
      ],
    }),
    align: p.choice({
      label: 'Alignment',
      default: 'center',
      options: [
        { value: 'start', label: 'Left / top' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'Right / bottom' },
      ],
    }),
    match: p.boolean({
      label: 'Make them the same width (stacked) or height (side by side)',
      default: false,
    }),
    gap: p.number({ label: 'Gap', default: 0, min: 0, max: 1000, unit: 'px', slider: false }),
    transparent: p.boolean({ label: 'Transparent background', default: false }),
    background: p.color({
      label: 'Background',
      default: '#ffffff',
      when: (v) => !v.transparent,
    }),
  },
  run(images, values, context) {
    const layout = mergeLayout(images, { ...values, gap: values.gap * context.scale });
    const out = createCanvas(layout.width, layout.height);
    const ctx = context2d(out);
    if (!values.transparent) {
      ctx.fillStyle = values.background;
      ctx.fillRect(0, 0, out.width, out.height);
    }
    layout.places.forEach((place, i) =>
      ctx.drawImage(images[i], place.x, place.y, place.width, place.height),
    );
    return out;
  },
});
