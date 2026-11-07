/** Save produced files: one at a time, or all together as a ZIP. */

import { uniqueNames } from '../core/files';
import { createZip } from '../core/zip';

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
  const entries = await Promise.all(
    files.map(async (file, i) => ({
      name: names[i],
      data: new Uint8Array(await file.blob.arrayBuffer()),
    })),
  );
  downloadBlob(new Blob([createZip(entries)], { type: 'application/zip' }), name);
}
