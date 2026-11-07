import { p } from '../core/params';
import { keyColor } from '../core/pixels';
import { editPixels } from '../engine/canvas';
import { mapOp } from './op';

export const removeBackground = mapOp({
  id: 'remove-background',
  kind: 'map',
  title: 'Remove background',
  description: 'Key out a background color to transparency.',
  icon: 'scissors',
  suffix: 'nobg',
  pickColor: 'color',
  params: {
    color: p.color({
      label: 'Background color',
      default: '#ffffff',
      hint: 'Or click the preview to pick it.',
    }),
    tolerance: p.number({
      label: 'Tolerance',
      default: 18,
      min: 1,
      max: 100,
      unit: '%',
      hint: 'How different a color can be and still be removed.',
    }),
    smoothing: p.number({
      label: 'Edge smoothing',
      default: 8,
      min: 0,
      max: 100,
      unit: '%',
    }),
  },
  run(image, values) {
    return editPixels(image, (pixels) => keyColor(pixels.data, values));
  },
});
