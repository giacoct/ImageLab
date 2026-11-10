/**
 * HEIC and AVIF files (ISO base media format, "ISOBMFF"): a tree of boxes.
 * Read without decoding the image: an item's bytes (the EXIF, see
 * `exif.ts`), located through the `meta` box (`iinf` names the items,
 * `iloc` places them), and the color the file declares (`colr` boxes).
 * AVIF files the app writes get their color tagged here.
 */

interface Box {
  type: string;
  /** Where its content starts (after the header) and where the box ends. */
  start: number;
  end: number;
}

/** The boxes between `from` and `to`. */
function boxes(view: DataView, from: number, to: number): Box[] {
  const found: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    let start = at + 8;
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8));
      start += 8;
    } else if (size === 0) size = to - at; // to the end
    if (size < 8 || at + size > to) break;
    const type = String.fromCharCode(
      ...new Uint8Array(view.buffer, view.byteOffset + at + 4, 4),
    );
    found.push({ type, start, end: at + size });
    at += size;
  }
  return found;
}

/** An unsigned number of 0, 4 or 8 bytes. */
function readSized(view: DataView, at: number, size: number): number {
  if (size === 4) return view.getUint32(at);
  if (size === 8) return Number(view.getBigUint64(at));
  return 0;
}

const viewOf = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** The `meta` box's children (after its version and flags). */
function metaBoxes(view: DataView): Box[] {
  const meta = boxes(view, 0, view.byteLength).find(
    (box) => box.type === "meta",
  );
  return meta ? boxes(view, meta.start + 4, meta.end) : [];
}

/** The bytes of the first item of this type (e.g. `Exif`), or null. */
export function itemOfType(
  bytes: Uint8Array,
  wanted: string,
): Uint8Array | null {
  try {
    const view = viewOf(bytes);
    const children = metaBoxes(view);
    const iinf = children.find((box) => box.type === "iinf");
    const iloc = children.find((box) => box.type === "iloc");
    const idat = children.find((box) => box.type === "idat");
    if (!iinf || !iloc) return null;

    // The item's id.
    const iinfVersion = view.getUint8(iinf.start);
    const infeFrom = iinf.start + 4 + (iinfVersion === 0 ? 2 : 4);
    let id: number | null = null;
    for (const infe of boxes(view, infeFrom, iinf.end)) {
      const version = view.getUint8(infe.start);
      if (infe.type !== "infe" || version < 2) continue;
      const itemId =
        version === 2
          ? view.getUint16(infe.start + 4)
          : view.getUint32(infe.start + 4);
      const typeAt = infe.start + 4 + (version === 2 ? 2 : 4) + 2;
      const type = String.fromCharCode(...bytes.subarray(typeAt, typeAt + 4));
      if (type === wanted && id === null) id = itemId;
    }
    if (id === null) return null;

    // Where its bytes are.
    const version = view.getUint8(iloc.start);
    let at = iloc.start + 4;
    const sizes = view.getUint8(at);
    const offsetSize = sizes >> 4;
    const lengthSize = sizes & 15;
    const sizes2 = view.getUint8(at + 1);
    const baseSize = sizes2 >> 4;
    const indexSize = version === 1 || version === 2 ? sizes2 & 15 : 0;
    at += 2;
    const count = version < 2 ? view.getUint16(at) : view.getUint32(at);
    at += version < 2 ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const itemId = version < 2 ? view.getUint16(at) : view.getUint32(at);
      at += version < 2 ? 2 : 4;
      let method = 0;
      if (version === 1 || version === 2) {
        method = view.getUint16(at) & 15;
        at += 2;
      }
      at += 2; // data reference index
      const base = readSized(view, at, baseSize);
      at += baseSize;
      const extents = view.getUint16(at);
      at += 2;
      // Extents of no bytes, or more than the box holds: malformed (and,
      // read one by one, a file could keep this busy for hours).
      const extentSize = indexSize + offsetSize + lengthSize;
      if (extentSize === 0 || at + extents * extentSize > iloc.end) return null;
      const parts: Uint8Array[] = [];
      for (let e = 0; e < extents; e++) {
        at += indexSize;
        const offset = readSized(view, at, offsetSize);
        at += offsetSize;
        const length = readSized(view, at, lengthSize);
        at += lengthSize;
        const from = (method === 1 && idat ? idat.start : 0) + base + offset;
        parts.push(bytes.subarray(from, from + length));
      }
      if (itemId !== id) continue;
      if (parts.length === 1) return parts[0];
      const item = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
      let into = 0;
      for (const part of parts) {
        item.set(part, into);
        into += part.length;
      }
      return item;
    }
    return null;
  } catch {
    return null;
  }
}

/** A `colr` box: coded primaries (ITU-T H.273), or an ICC profile. */
export type DeclaredColor = { primaries: number } | { icc: Uint8Array };

/** The colors the file's images declare (`colr` boxes, in `iprp`/`ipco`). */
export function declaredColors(bytes: Uint8Array): DeclaredColor[] {
  try {
    const view = viewOf(bytes);
    const iprp = metaBoxes(view).find((box) => box.type === "iprp");
    const ipco =
      iprp && boxes(view, iprp.start, iprp.end).find((b) => b.type === "ipco");
    if (!ipco) return [];
    const colors: DeclaredColor[] = [];
    for (const box of boxes(view, ipco.start, ipco.end)) {
      if (box.type !== "colr") continue;
      const kind = String.fromCharCode(
        ...bytes.subarray(box.start, box.start + 4),
      );
      if (kind === "nclx")
        colors.push({ primaries: view.getUint16(box.start + 4) });
      else if (kind === "prof" || kind === "rICC")
        colors.push({ icc: bytes.subarray(box.start + 4, box.end) });
    }
    return colors;
  } catch {
    return [];
  }
}

/**
 * Set the primaries and transfer function an AVIF's `nclx` box declares, in
 * place (same size). False if it has none to set.
 */
export function tagNclx(
  bytes: Uint8Array,
  primaries: number,
  transfer: number,
): boolean {
  try {
    const view = viewOf(bytes);
    const iprp = metaBoxes(view).find((box) => box.type === "iprp");
    const ipco =
      iprp && boxes(view, iprp.start, iprp.end).find((b) => b.type === "ipco");
    if (!ipco) return false;
    let tagged = false;
    for (const box of boxes(view, ipco.start, ipco.end)) {
      const kind = String.fromCharCode(
        ...bytes.subarray(box.start, box.start + 4),
      );
      if (box.type !== "colr" || kind !== "nclx") continue;
      view.setUint16(box.start + 4, primaries);
      view.setUint16(box.start + 6, transfer);
      tagged = true;
    }
    return tagged;
  } catch {
    return false;
  }
}
