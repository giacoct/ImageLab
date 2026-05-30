import { describe, expect, it } from 'vitest';

import {
  clampQuality,
  dimensionsForMaxSize,
  extensionForFormat,
  formatBytes,
  renameFile,
} from './image-tool-utils';

describe('image-tool-utils', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB');
  });

  it('renames files for output formats', () => {
    expect(extensionForFormat('image/jpeg')).toBe('jpg');
    expect(renameFile('photo.large.png', 'resized', 'image/webp')).toBe('photo.large-resized.webp');
  });

  it('clamps image quality to a browser-safe range', () => {
    expect(clampQuality(5)).toBe(0.1);
    expect(clampQuality(75)).toBe(0.75);
    expect(clampQuality(120)).toBe(1);
  });

  it('keeps aspect ratio when constraining dimensions', () => {
    expect(dimensionsForMaxSize(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 });
    expect(dimensionsForMaxSize(800, 600, 1000)).toEqual({ width: 800, height: 600 });
  });
});
