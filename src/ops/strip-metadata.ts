/**
 * Strip metadata: remove camera, date, GPS and other metadata. An untouched
 * input file is cleaned without re-encoding; every file the app writes
 * itself already carries none.
 */

import { stripMetadata as strip } from '../core/metadata';
import { fileOp } from './op';

export const stripMetadata = fileOp({
  kind: 'file',
  id: 'strip-metadata',
  title: 'Strip metadata',
  description: 'Remove camera, date and GPS details, without re-encoding when possible.',
  suffix: 'clean',
  params: {},
  async run(picture) {
    if (!picture.file?.original) return picture;
    const { type } = picture.file.blob;
    const stripped = strip(new Uint8Array(await picture.file.blob.arrayBuffer()), type);
    if (stripped)
      return { ...picture, file: { blob: new Blob([stripped], { type }), original: false } };
    // Can't be cleaned in place (e.g. HEIC): re-encode, near-losslessly.
    return {
      ...picture,
      encoding: { ...picture.encoding, quality: Math.max(picture.encoding.quality, 95) },
      file: null,
    };
  },
});
