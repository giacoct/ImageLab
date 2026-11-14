/** Pure helpers for file names, sizes and image formats. */

/** The formats the app can write. */
export type ImageFormat =
  "image/jpeg" | "image/png" | "image/webp" | "image/avif";

const FORMATS: Record<ImageFormat, { extension: string; name: string }> = {
  "image/jpeg": { extension: "jpg", name: "JPEG" },
  "image/png": { extension: "png", name: "PNG" },
  "image/webp": { extension: "webp", name: "WebP" },
  "image/avif": { extension: "avif", name: "AVIF" },
};

export function extensionFor(format: ImageFormat): string {
  return FORMATS[format].extension;
}

/**
 * What lists show of an image: its size, the format it saves to and, once
 * known, its file's size (the file is written, or is the input in that
 * format).
 */
export function imageDetails(image: {
  width: number;
  height: number;
  encoding: { format: ImageFormat };
  file: { blob: Blob } | null;
}): string[] {
  const { format } = image.encoding;
  const details = [`${image.width} × ${image.height}`, FORMATS[format].name];
  if (image.file?.blob.type === format)
    details.push(formatBytes(image.file.blob.size));
  return details;
}

/** Human-readable file size, e.g. `1.5 KB`. */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * `photo.png` + `scaled` + `webp` → `photo-scaled.webp`; without a suffix
 * (no tool changed it) → `photo.webp`.
 */
export function outputName(
  fileName: string,
  suffix: string | null,
  extension: string,
): string {
  const stem = stemOf(fileName);
  return `${stem}${suffix ? `-${suffix}` : ""}.${extension}`;
}

/** `photo.final.png` → `photo.final`. */
export function stemOf(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "");
}

/**
 * A file's name (typed, or the name an opened file came with), made safe
 * for any file system and for the ZIPs the app writes: no path
 * separators or characters Windows refuses, no leading dots, not too long.
 * Empty when nothing usable is left.
 */
export function cleanFileName(typed: string): string {
  return typed
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 200)
    .trim();
}

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|avif|gif|bmp|heic|heif)$/i;

/** Whether a dropped/picked file looks like an image. HEIC often has an empty `type`. */
export function isImageFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith("image/") || IMAGE_EXTENSION.test(file.name);
}

/** The format an image read from a `sourceType` file is saved in, unless a tool changes it. */
export function savedFormat(sourceType: string): ImageFormat {
  switch (sourceType) {
    case "image/png":
    case "image/webp":
    case "image/avif":
      return sourceType;
    default:
      // JPEG stays JPEG; GIF, BMP, HEIC… become JPEG too (PNG if transparent, see encoding.ts).
      return "image/jpeg";
  }
}

/** Number duplicate names before the extension (`a.png`, `a-2.png`), keeping order. */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf(".");
    return dot === -1
      ? `${name}-${count}`
      : `${name.slice(0, dot)}-${count}${name.slice(dot)}`;
  });
}

/**
 * The image type from the file's first bytes; `fallback` (the declared type)
 * when unrecognized. Declared types are often empty or wrong (HEIC on
 * Windows, renamed files).
 */
export function sniffType(bytes: Uint8Array, fallback: string): string {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 2) === "BM") return "image/bmp";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (
      ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(
        brand,
      )
    ) {
      return "image/heic";
    }
  }
  return fallback;
}
