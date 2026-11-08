/** Pure helpers for file names, sizes and image formats. */

/** The formats the app can write. */
export type ImageFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

const EXTENSIONS: Record<ImageFormat, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export function extensionFor(format: ImageFormat): string {
  return EXTENSIONS[format];
}

/** Human-readable file size, e.g. `1.5 KB`. */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

/** `photo.png` + `scaled` + `webp` → `photo-scaled.webp`. */
export function outputName(fileName: string, suffix: string, extension: string): string {
  return `${fileName.replace(/\.[^/.]+$/, '')}-${suffix}.${extension}`;
}

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|avif|gif|bmp|heic|heif)$/i;

/** Whether a dropped/picked file looks like an image. HEIC often has an empty `type`. */
export function isImageFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith('image/') || IMAGE_EXTENSION.test(file.name);
}

/** The format an image read from a `sourceType` file is saved in, unless a step changes it. */
export function savedFormat(sourceType: string): ImageFormat {
  switch (sourceType) {
    case 'image/png':
    case 'image/webp':
    case 'image/avif':
      return sourceType;
    default:
      // JPEG stays JPEG; GIF, BMP, HEIC… become JPEG too (PNG if transparent, see encoding.ts).
      return 'image/jpeg';
  }
}

/** Number duplicate names before the extension (`a.png`, `a-2.png`), keeping order. */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf('.');
    return dot === -1 ? `${name}-${count}` : `${name.slice(0, dot)}-${count}${name.slice(dot)}`;
  });
}

/**
 * The image type from the file's first bytes; `fallback` (the declared type)
 * when unrecognized. Declared types are often empty or wrong (HEIC on
 * Windows, renamed files).
 */
export function sniffType(bytes: Uint8Array, fallback: string): string {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 2) === 'BM') return 'image/bmp';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return 'image/heic';
    }
  }
  return fallback;
}
