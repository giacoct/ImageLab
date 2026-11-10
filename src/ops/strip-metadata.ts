/**
 * Strip metadata: remove camera, date, GPS and other details from the file.
 * A JPEG, PNG or WebP file (the input's, or one Convert format or Compress
 * wrote) is cleaned without re-encoding; the pixels the other tools leave are
 * written at the end without the EXIF they'd otherwise carry.
 */

import { stripMetadata as strip } from "../core/metadata";
import { fileOp } from "./op";

export const stripMetadata = fileOp({
  id: "strip-metadata",
  kind: "file",
  title: "Strip metadata",
  description:
    "Remove camera, date and GPS details, without re-encoding the image.",
  suffix: "clean",
  params: {},
  async run(picture) {
    const cleaned = { ...picture, exif: null };
    const { file } = picture;
    if (!file) return cleaned;
    const { type } = file.blob;
    const stripped = strip(new Uint8Array(await file.blob.arrayBuffer()));
    if (stripped)
      return {
        ...cleaned,
        file: {
          ...file,
          blob: new Blob([stripped], { type }),
          original: false,
        },
      };
    // The app's own AVIF files carry none.
    if (!file.original) return cleaned;
    // Not possible losslessly (e.g. HEIC): drop the file, so the pixels are
    // re-encoded at the end, at a quality high enough to look the same.
    return {
      ...cleaned,
      encoding: { ...picture.encoding, quality: 95 },
      file: null,
    };
  },
});
