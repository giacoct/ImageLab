import { Injectable } from '@angular/core';

import { ImageToolDefinition } from '../models/image-tool.model';

export const IMAGE_TOOLS: readonly ImageToolDefinition[] = [
  {
    id: 'resize',
    title: 'Resize & transform',
    description: 'Rotate, flip, crop, and resize a single image with a live preview.',
    route: '/tools/resize',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: 1,
    batch: false,
    loadComponent: () => import('../../tools/resize/resize').then((m) => m.Resize),
  },
  {
    id: 'convert',
    title: 'Convert format',
    description:
      'Export images as JPEG, PNG, WebP, AVIF, or ICO icons using browser-native conversion.',
    route: '/tools/convert',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
    loadComponent: () => import('../../tools/convert/convert').then((m) => m.Convert),
  },
  {
    id: 'convert-svg',
    title: 'Convert to SVG',
    description:
      'Trace images into scalable SVG vectors by posterizing them into flat color shapes.',
    route: '/tools/convert-svg',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
    loadComponent: () => import('../../tools/convert-svg/convert-svg').then((m) => m.ConvertSvg),
  },
  {
    id: 'compress',
    title: 'Compress images',
    description: 'Reduce file size while keeping the original image format.',
    route: '/tools/compress',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
    loadComponent: () => import('../../tools/compress/compress').then((m) => m.Compress),
  },
  {
    id: 'strip-metadata',
    title: 'Strip metadata',
    description: 'Rebuild images without embedded metadata while preserving their format.',
    route: '/tools/strip-metadata',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
    loadComponent: () =>
      import('../../tools/strip-metadata/strip-metadata').then((m) => m.StripMetadata),
  },
  {
    id: 'remove-background',
    title: 'Remove background',
    description: 'Key out a selected background color and export transparent PNG files.',
    route: '/tools/remove-background',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
    loadComponent: () =>
      import('../../tools/remove-background/remove-background').then((m) => m.RemoveBackground),
  },
  {
    id: 'adjust',
    title: 'Adjust & filters',
    description: 'Tune brightness, contrast, and color, or apply blur, sharpen, and tints.',
    route: '/tools/adjust',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
    loadComponent: () => import('../../tools/adjust/adjust').then((m) => m.Adjust),
  },
];

@Injectable({ providedIn: 'root' })
export class ToolRegistryService {
  readonly tools = IMAGE_TOOLS;

  findById(id: string): ImageToolDefinition | undefined {
    return this.tools.find((tool) => tool.id === id);
  }
}
