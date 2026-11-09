/** Remove background: make a background color transparent. */

import { edgeColor, removeBackground as remove } from '../core/background';
import { p } from '../core/params';
import { editPixels } from '../engine/canvas';
import { mapOp } from './op';

export const removeBackground = mapOp({
  id: 'remove-background',
  kind: 'map',
  title: 'Remove background',
  description: 'Make a plain background transparent: logos, products, scans.',
  suffix: 'nobg',
  params: {
    detect: p.boolean({ label: 'Detect the background color', default: true }),
    color: p.color({
      label: 'Background color',
      default: '#ffffff',
      when: (v) => !v.detect,
    }),
    connected: p.boolean({
      label: 'Only around the subject',
      default: true,
      hint: 'Keeps the same color inside the subject, e.g. the white of a logo on white.',
    }),
    tolerance: p.number({
      label: 'Tolerance',
      default: 10,
      min: 0,
      max: 60,
      unit: '%',
      hint: 'How different a color can be and still count as background.',
    }),
    softness: p.number({
      label: 'Edge softness',
      default: 10,
      min: 0,
      max: 40,
      unit: '%',
    }),
  },
  run(image, values) {
    return editPixels(image, (pixels) =>
      remove(pixels, {
        ...values,
        color: values.detect ? edgeColor(pixels) : values.color,
      }),
    );
  },
});
