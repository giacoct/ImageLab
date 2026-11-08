/** Convert format: write the image as JPEG, PNG, WebP or AVIF. */

import type { ImageFormat } from '../core/files';
import { p } from '../core/params';
import { writeNow } from '../engine/encode';
import { fileOp } from './op';

const FORMATS: Record<string, ImageFormat> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

export const convert = fileOp({
  kind: 'file',
  id: 'convert',
  title: 'Convert format',
  description: 'Save as JPEG, PNG, WebP or AVIF.',
  suffix: 'converted',
  params: {
    format: p.choice({
      label: 'Format',
      default: 'webp',
      options: [
        { value: 'jpeg', label: 'JPEG' },
        { value: 'png', label: 'PNG (lossless)' },
        { value: 'webp', label: 'WebP' },
        { value: 'avif', label: 'AVIF' },
      ],
    }),
    quality: p.number({
      label: 'Quality',
      default: 90,
      min: 10,
      max: 100,
      unit: '%',
      when: (v) => v.format !== 'png',
    }),
  },
  run: (picture, values) =>
    writeNow(picture, {
      ...picture.encoding,
      format: FORMATS[values.format],
      chosen: true,
      quality: values.quality,
      targetBytes: null,
    }),
});
