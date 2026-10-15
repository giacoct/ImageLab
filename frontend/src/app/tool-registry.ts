import { Type } from '@angular/core';

/**
 * The single list of tools. Routes (app.routes.ts), the home dashboard, and
 * tool chaining are all generated from it. To add a tool: create its settings
 * page in `tools/<id>/` (extending BaseTool) and add an entry here.
 */
export interface ImageToolDefinition {
  id: string;
  title: string;
  description: string;
  /** Base route of the tool's 3-step workflow, `/tools/<id>`. */
  route: string;
  /** Batch tools take any number of images; single-image tools (Resize) take exactly one. */
  batch: boolean;
  /** Lazily loads the tool's settings page. */
  loadComponent: () => Promise<Type<unknown>>;
}

/** Image types every tool accepts (decodable by every browser's canvas). */
export const ACCEPTED_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

function tool(definition: Omit<ImageToolDefinition, 'route'>): ImageToolDefinition {
  return { ...definition, route: `/tools/${definition.id}` };
}

/** Every tool, sorted by title (the order the dashboard and chain picker show them). */
export const TOOLS: readonly ImageToolDefinition[] = [
  tool({
    id: 'resize',
    title: 'Resize & transform',
    description: 'Rotate, flip, crop, and resize a single image with a live preview.',
    batch: false,
    loadComponent: () => import('./tools/resize/resize').then((m) => m.Resize),
  }),
  tool({
    id: 'scale',
    title: 'Batch scale',
    description: 'Scale many images by percentage, or fit each one inside a bounding box.',
    batch: true,
    loadComponent: () => import('./tools/scale/scale').then((m) => m.Scale),
  }),
  tool({
    id: 'convert',
    title: 'Convert format',
    description:
      'Export images as JPEG, PNG, WebP, AVIF, or ICO icons using browser-native conversion.',
    batch: true,
    loadComponent: () => import('./tools/convert/convert').then((m) => m.Convert),
  }),
  tool({
    id: 'convert-svg',
    title: 'Convert to SVG',
    description:
      'Trace images into scalable SVG vectors by posterizing them into flat color shapes.',
    batch: true,
    loadComponent: () => import('./tools/convert-svg/convert-svg').then((m) => m.ConvertSvg),
  }),
  tool({
    id: 'compress',
    title: 'Compress images',
    description: 'Reduce file size while keeping the original image format.',
    batch: true,
    loadComponent: () => import('./tools/compress/compress').then((m) => m.Compress),
  }),
  tool({
    id: 'strip-metadata',
    title: 'Strip metadata',
    description: 'Rebuild images without embedded metadata while preserving their format.',
    batch: true,
    loadComponent: () =>
      import('./tools/strip-metadata/strip-metadata').then((m) => m.StripMetadata),
  }),
  tool({
    id: 'remove-background',
    title: 'Remove background',
    description: 'Key out a selected background color and export transparent PNG files.',
    batch: true,
    loadComponent: () =>
      import('./tools/remove-background/remove-background').then((m) => m.RemoveBackground),
  }),
  tool({
    id: 'adjust',
    title: 'Adjust & filters',
    description: 'Tune brightness, contrast, and color, or apply blur, sharpen, and tints.',
    batch: true,
    loadComponent: () => import('./tools/adjust/adjust').then((m) => m.Adjust),
  }),
  tool({
    id: 'margin',
    title: 'Add margin',
    description: 'Surround images with a colored or transparent margin.',
    batch: true,
    loadComponent: () => import('./tools/margin/margin').then((m) => m.Margin),
  }),
  tool({
    id: 'merge',
    title: 'Merge images',
    description: 'Combine several images into one, stacked vertically or side by side.',
    batch: true,
    loadComponent: () => import('./tools/merge/merge').then((m) => m.Merge),
  }),
  tool({
    id: 'upscale',
    title: 'Upscale image',
    description: 'Enlarge images 4× with AI super-resolution that rebuilds real detail.',
    batch: true,
    loadComponent: () => import('./tools/upscale/upscale').then((m) => m.Upscale),
  }),
  tool({
    id: 'ocr',
    title: 'Extract text (OCR)',
    description: 'Recognize the text in images and select it directly on the picture.',
    batch: true,
    loadComponent: () => import('./tools/ocr/ocr').then((m) => m.Ocr),
  }),
].sort((a, b) => a.title.localeCompare(b.title));

/** Look up a tool by id. Ids come from the route config, so an unknown id is a bug. */
export function findTool(id: string): ImageToolDefinition {
  const found = TOOLS.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`Unknown tool: ${id}`);
  }
  return found;
}
