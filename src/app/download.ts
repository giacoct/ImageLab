/** Save produced files: one at a time, or all together as a ZIP. */

import { uniqueNames } from '../core/files';
import { crc32, zipParts, type ZipEntry } from '../core/zip';

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Give the browser time to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadZip(
  files: readonly { name: string; blob: Blob }[],
  name: string,
): Promise<void> {
  const names = uniqueNames(files.map((file) => file.name));
  // Only the checksums need the bytes, one file at a time; the archive
  // reuses the Blobs, so a large batch is never copied into one buffer.
  const entries: ZipEntry<Blob>[] = [];
  for (const [i, file] of files.entries()) {
    const crc = crc32(new Uint8Array(await file.blob.arrayBuffer()));
    entries.push({ name: names[i], data: file.blob, size: file.blob.size, crc });
  }
  downloadBlob(new Blob(zipParts(entries), { type: 'application/zip' }), name);
}
