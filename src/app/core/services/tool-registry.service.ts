import { Injectable } from '@angular/core';

import { ImageToolDefinition } from '../models/image-tool.model';

export const IMAGE_TOOLS: readonly ImageToolDefinition[] = [
  {
    id: 'resize',
    title: 'Resize images',
    description:
      'Change dimensions for one or more images while preserving quality and aspect ratio.',
    route: '/tools/resize',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
  },
  {
    id: 'convert',
    title: 'Convert format',
    description: 'Export images as JPEG, PNG, or WebP using browser-native conversion.',
    route: '/tools/convert',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
  },
  {
    id: 'compress',
    title: 'Compress images',
    description: 'Reduce file size while keeping the original image format.',
    route: '/tools/compress',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
  },
  {
    id: 'icon',
    title: 'Create ICO icons',
    description: 'Convert images into browser and desktop-friendly .ico files.',
    route: '/tools/icon',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
  },
  {
    id: 'rotate',
    title: 'Rotate and flip',
    description: 'Rotate, mirror, or flip images without changing their source format.',
    route: '/tools/rotate',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
  },
  {
    id: 'strip-metadata',
    title: 'Strip metadata',
    description: 'Rebuild images without embedded metadata while preserving their format.',
    route: '/tools/strip-metadata',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
  },
  {
    id: 'remove-background',
    title: 'Remove background',
    description: 'Key out a selected background color and export transparent PNG files.',
    route: '/tools/remove-background',
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles: null,
    batch: true,
  },
];

@Injectable({ providedIn: 'root' })
export class ToolRegistryService {
  readonly tools = IMAGE_TOOLS;

  findById(id: string): ImageToolDefinition | undefined {
    return this.tools.find((tool) => tool.id === id);
  }
}
