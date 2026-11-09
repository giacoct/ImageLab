/** Compress: write the image in its current format at a lower quality, or to fit a file size. */

import { p } from '../core/params';
import { write } from '../engine/encode';
import { fileOp } from './op';

export const compress = fileOp({
  kind: 'file',
  id: 'compress',
  title: 'Compress',
  description: 'Shrink the file at a chosen quality, or to fit a target size.',
  suffix: 'compressed',
  params: {
    mode: p.choice({
      label: 'Compress to',
      default: 'quality',
      options: [
        { value: 'quality', label: 'A quality' },
        { value: 'target', label: 'A file size' },
      ],
    }),
    quality: p.number({
      label: 'Quality',
      default: 75,
      min: 10,
      max: 100,
      unit: '%',
      hint: 'PNG is lossless and ignores it: compress to a file size, or convert first.',
      when: (v) => v.mode === 'quality',
    }),
    targetKb: p.number({
      label: 'Target size',
      default: 500,
      min: 10,
      max: 50_000,
      step: 10,
      unit: 'KB',
      slider: false,
      hint: 'Lowers the quality (PNG: the dimensions) until each file fits.',
      when: (v) => v.mode === 'target',
    }),
  },
  run: (picture, values, context) =>
    write(picture, {
      ...picture.encoding,
      quality:
        values.mode === 'quality' ? values.quality : picture.encoding.quality,
      // A preview has fewer pixels: scale the budget with the area.
      targetBytes:
        values.mode === 'target'
          ? values.targetKb * 1024 * context.scale ** 2
          : null,
    }),
});
