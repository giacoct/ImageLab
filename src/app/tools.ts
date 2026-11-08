/**
 * The tools on the home page. Each is a preset recipe — starting steps and
 * export settings — opened in the same workspace, where steps can be added,
 * removed and reordered.
 */

import type { ExportSettings } from '../core/recipe';

export interface ToolStep {
  op: string;
  params?: Record<string, unknown>;
}

export interface Tool {
  id: string;
  title: string;
  description: string;
  steps: ToolStep[];
  export?: Partial<ExportSettings>;
  /** Output file name suffix (default: the last step's). */
  suffix?: string;
}

const PRESETS: Tool[] = [
  {
    id: 'resize',
    title: 'Resize & transform',
    description: 'Rotate, flip, crop and resize, with a live preview.',
    steps: [{ op: 'transform' }, { op: 'scale', params: { mode: 'percent', percent: 100 } }],
    suffix: 'edited',
  },
  {
    id: 'scale',
    title: 'Scale',
    description: 'Scale images by percentage, or fit each one inside a box.',
    steps: [{ op: 'scale' }],
  },
  {
    id: 'convert',
    title: 'Convert format',
    description: 'Save images as JPEG, PNG, WebP, AVIF, or ICO icons.',
    steps: [],
    export: { format: 'webp', quality: 90 },
    suffix: 'converted',
  },
  {
    id: 'compress',
    title: 'Compress',
    description: 'Shrink file size at a chosen quality, or to fit a target size.',
    steps: [{ op: 'scale', params: { mode: 'fit', width: 2048, height: 2048, enlarge: false } }],
    export: { format: 'same', quality: 75 },
    suffix: 'compressed',
  },
  {
    id: 'strip-metadata',
    title: 'Strip metadata',
    description: 'See what a photo reveals (camera, date, GPS) and remove it without quality loss.',
    steps: [],
    export: { format: 'keep' },
    suffix: 'clean',
  },
  {
    id: 'remove-background',
    title: 'Remove background',
    description: 'Key out a background color and export transparent images.',
    steps: [{ op: 'remove-background' }],
    export: { format: 'png' },
  },
  {
    id: 'adjust',
    title: 'Adjust & filters',
    description: 'Brightness, contrast, color, blur, sharpen, and tints.',
    steps: [{ op: 'adjust' }],
  },
  {
    id: 'margin',
    title: 'Add margin',
    description: 'Surround images with a colored or transparent margin.',
    steps: [{ op: 'margin' }],
  },
  {
    id: 'merge',
    title: 'Merge images',
    description: 'Combine several images into one, stacked or side by side.',
    steps: [{ op: 'merge' }],
    export: { format: 'png' },
  },
  {
    id: 'upscale',
    title: 'Upscale 4×',
    description: 'Enlarge images 4× with AI super-resolution that rebuilds detail.',
    steps: [{ op: 'upscale' }],
    export: { format: 'png' },
  },
  {
    id: 'convert-svg',
    title: 'Convert to SVG',
    description: 'Trace images into scalable vector graphics.',
    steps: [{ op: 'vectorize' }],
  },
  {
    id: 'ocr',
    title: 'Extract text (OCR)',
    description: 'Recognize the text in images and select it right on the picture.',
    steps: [{ op: 'ocr' }],
  },
];

/** Every tool, sorted by title (the home page order). */
export const TOOLS: readonly Tool[] = [...PRESETS].sort((a, b) => a.title.localeCompare(b.title));

export function findTool(id: string): Tool | undefined {
  return TOOLS.find((tool) => tool.id === id);
}
