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
    description: 'Reduce file size with quality and maximum dimension controls.',
    route: '/tools/compress',
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
