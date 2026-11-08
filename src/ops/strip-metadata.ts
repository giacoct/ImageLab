/**
 * Strip metadata: remove camera, date, GPS and other details from the file.
 * An untouched JPEG, PNG or WebP is cleaned without re-encoding; any file the
 * app writes itself (after a step that changes the pixels, or Convert format)
 * never carries metadata.
 */

import { stripMetadata as strip } from '../core/metadata';
import { fileOp } from './op';

export const stripMetadata = fileOp({
  id: 'strip-metadata',
  kind: 'file',
  title: 'Strip metadata',
  description: 'Remove camera, date and GPS details, without re-encoding the image.',
  suffix: 'clean',
  params: {},
  async run(picture) {
    if (!picture.file?.original) return picture;
    const { type } = picture.file.blob;
    const stripped = strip(new Uint8Array(await picture.file.blob.arrayBuffer()));
    // Not possible losslessly (e.g. HEIC): drop the file, so the pixels are
    // re-encoded at the end, at a quality high enough to look the same.
    if (!stripped) {
      return { ...picture, encoding: { ...picture.encoding, quality: 95 }, file: null };
    }
    return { ...picture, file: { blob: new Blob([stripped], { type }), original: false } };
  },
});
