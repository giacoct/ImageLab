import { Injectable } from '@angular/core';

import { ImageOutput } from '../models/image-output.model';

@Injectable({ providedIn: 'root' })
export class DownloadService {
  download(output: ImageOutput): void {
    this.triggerDownload(output.url, output.fileName);
  }

  /** Download an arbitrary blob (e.g. extracted text) under the given name. */
  downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    try {
      this.triggerDownload(url, fileName);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }

  /** Download a UTF-8 text file. */
  downloadText(text: string, fileName: string): void {
    this.downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), fileName);
  }

  /** Bundle every output into a single ZIP archive and download it. */
  async downloadZip(outputs: readonly ImageOutput[], zipName: string): Promise<void> {
    const blob = await createZip(dedupeNames(outputs));
    const url = URL.createObjectURL(blob);

    try {
      this.triggerDownload(url, zipName);
    } finally {
      // Defer revoke so the browser can start the download first.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }

  private triggerDownload(url: string, fileName: string): void {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  }
}

export interface ZipEntry {
  name: string;
  blob: Blob;
}

export function dedupeNames(outputs: readonly ImageOutput[]): ZipEntry[] {
  const seen = new Map<string, number>();

  return outputs.map((output) => {
    const count = seen.get(output.fileName) ?? 0;
    seen.set(output.fileName, count + 1);

    if (count === 0) {
      return { name: output.fileName, blob: output.blob };
    }

    const dot = output.fileName.lastIndexOf('.');
    const stem = dot === -1 ? output.fileName : output.fileName.slice(0, dot);
    const ext = dot === -1 ? '' : output.fileName.slice(dot);
    return { name: `${stem}-${count + 1}${ext}`, blob: output.blob };
  });
}

/** Minimal ZIP writer using the STORE method (no compression). */
export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (const entry of entries) {
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); // local file header signature
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, 0, true); // method: store
    localView.setUint16(10, 0, true); // mod time
    localView.setUint16(12, 0, true); // mod date
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true); // compressed size
    localView.setUint32(22, data.length, true); // uncompressed size
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); // central directory signature
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0, true); // flags
    centralView.setUint16(10, 0, true); // method: store
    centralView.setUint16(12, 0, true); // mod time
    centralView.setUint16(14, 0, true); // mod date
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true); // extra length
    centralView.setUint16(32, 0, true); // comment length
    centralView.setUint16(34, 0, true); // disk number
    centralView.setUint16(36, 0, true); // internal attrs
    centralView.setUint32(38, 0, true); // external attrs
    centralView.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + (part as Uint8Array).length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // end of central directory signature
  eocdView.setUint16(8, entries.length, true); // entries on this disk
  eocdView.setUint16(10, entries.length, true); // total entries
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true); // central directory offset

  return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
