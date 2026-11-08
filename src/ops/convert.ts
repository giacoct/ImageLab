/** Convert format: write the image as JPEG, PNG, WebP, AVIF or an ICO icon. */

import type { FileFormat } from '../core/encoding';
import { p } from '../core/params';
import { writeNow } from '../engine/encode';
import { fileOp } from './op';

const FORMATS: Record<string, FileFormat> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
};

const LOSSY = new Set(['jpeg', 'webp', 'avif']);

export const convert = fileOp({
  kind: 'file',
  id: 'convert',
  title: 'Convert format',
  description: 'Save as JPEG, PNG, WebP, AVIF, or an ICO icon.',
  suffix: 'converted',
  params: {
    format: p.choice({
      label: 'Format',
      default: 'webp',
      display: 'select',
      options: [
        { value: 'jpeg', label: 'JPEG' },
        { value: 'png', label: 'PNG (lossless)' },
        { value: 'webp', label: 'WebP' },
        { value: 'avif', label: 'AVIF' },
        { value: 'ico', label: 'ICO icon' },
      ],
    }),
    quality: p.number({
      label: 'Quality',
      default: 90,
      min: 10,
      max: 100,
      unit: '%',
      when: (v) => LOSSY.has(v.format as string),
    }),
    icoSize: p.number({
      label: 'Icon size',
      default: 256,
      min: 16,
      max: 256,
      unit: 'px',
      hint: 'The image is fitted into a transparent square.',
      when: (v) => v.format === 'ico',
    }),
  },
  // The icon size isn't scaled for the preview: an icon is small, so the
  // preview shows it at its real size.
  run: (picture, values) =>
    writeNow(picture, {
      ...picture.encoding,
      format: FORMATS[values.format],
      chosen: true,
      quality: values.quality,
      targetBytes: null,
      icoSize: values.icoSize,
    }),
});
