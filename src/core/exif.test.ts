import { describe, expect, it } from "vitest";

import { embedMetadata } from "./embed";
import { carriedExif, isobmffExif } from "./exif";
import { describeExif, exifOf, readMetadata } from "./metadata";

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
const u16 = (n: number) => [n >> 8, n & 255];
const u32 = (n: number) => [...u16(n >>> 16), ...u16(n & 0xffff)];

/** A value, or where something else is: another IFD, or the extra data at the end. */
type Value = number[] | { ifd: number } | { tail: number };
type Tag = [tag: number, type: number, count: number, value: Value];

/**
 * A big-endian TIFF: the IFDs one after another (IFD0 links to `next`),
 * then the long values, then `tail`.
 */
function tiff(ifds: Tag[][], next = 0, tail: number[] = []): Uint8Array {
  const starts: number[] = [];
  let at = 8;
  for (const ifd of ifds) {
    starts.push(at);
    at += 2 + ifd.length * 12 + 4;
  }
  const data: number[] = [];
  const longAt = at;
  const tailAt = () => longAt + data.length;
  const body: number[] = [];
  const pending: [number, number[]][] = [];
  ifds.forEach((ifd, index) => {
    body.push(...u16(ifd.length));
    for (const [tag, type, count, value] of ifd) {
      let field: number[];
      if ("ifd" in value) field = u32(starts[value.ifd]);
      else if ("tail" in value) field = [];
      else if (value.length > 4) {
        field = u32(longAt + data.length);
        data.push(...value);
      } else field = [...value, 0, 0, 0, 0].slice(0, 4);
      if ("tail" in value) pending.push([body.length + 8, []]);
      body.push(...u16(tag), ...u16(type), ...u32(count), ...field);
      if ("tail" in value) body.push(0, 0, 0, 0);
    }
    body.push(...u32(index === 0 && next ? starts[next] : 0));
  });
  const all = [...text("MM"), ...u16(42), ...u32(8), ...body];
  const tailStart = tailAt();
  for (const [offset] of pending) all.splice(8 + offset, 4, ...u32(tailStart));
  return new Uint8Array([...all, ...data, ...tail]);
}

const ascii = (s: string) => text(s + "\0");
const THUMBNAIL = text("THUMBNAIL JPEG");

/** A camera's EXIF: orientation, a thumbnail in IFD1, maker notes, GPS. */
const camera = tiff(
  [
    [
      [0x010f, 2, 6, ascii("Canon")],
      [0x0110, 2, 13, ascii("Canon EOS R6")],
      [0x0112, 3, 1, u16(6)],
      [0x8769, 4, 1, { ifd: 1 }],
      [0x8825, 4, 1, { ifd: 2 }],
    ],
    [
      [0x9003, 2, 20, ascii("2026:08:14 18:42:07")],
      [0x927c, 7, 12, text("MAKER SECRET")],
      [0xa002, 4, 1, u32(6000)],
    ],
    [
      [0x0001, 2, 2, ascii("N")],
      [
        0x0002,
        5,
        3,
        [...u32(45), ...u32(1), ...u32(27), ...u32(1), ...u32(0), ...u32(1)],
      ],
      [0x0003, 2, 2, ascii("E")],
      [
        0x0004,
        5,
        3,
        [...u32(9), ...u32(1), ...u32(11), ...u32(1), ...u32(0), ...u32(1)],
      ],
    ],
    [
      [0x0201, 4, 1, { tail: 0 }],
      [0x0202, 4, 1, u32(THUMBNAIL.length)],
    ],
  ],
  3,
  THUMBNAIL,
);

const contains = (bytes: Uint8Array, needle: number[]) =>
  String.fromCharCode(...bytes).includes(String.fromCharCode(...needle));

describe("carried EXIF", () => {
  it("keeps who, when and where, without the thumbnail, maker notes or orientation", () => {
    const carried = carriedExif(camera)!;
    expect(describeExif(carried)).toEqual([
      "Camera: Canon EOS R6",
      "Taken: 2026-08-14 18:42",
      "Location: 45.45000° N, 9.18333° E",
    ]);
    expect(contains(camera, THUMBNAIL)).toBe(true);
    expect(contains(carried, THUMBNAIL)).toBe(false);
    expect(contains(carried, text("MAKER SECRET"))).toBe(false);
    // Upright now: the file isn't turned again when it's shown.
    const jpeg = embedMetadata(bareJpeg(), { exif: carried })!;
    expect(readMetadata(jpeg).orientation).toBe(1);
  });

  it("carries nothing when there's nothing left, or the EXIF is malformed", () => {
    expect(carriedExif(null)).toBeNull();
    expect(carriedExif(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    const layoutOnly = tiff([[[0x0112, 3, 1, u16(6)]]]);
    expect(carriedExif(layoutOnly)).toBeNull();
  });
});

function bareJpeg(): Uint8Array {
  const jfif = [...text("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0];
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...u16(jfif.length + 2),
    ...jfif,
    0xff,
    0xda,
    ...u16(4),
    1,
    2,
    0xff,
    0xd9,
  ]);
}

describe("embedding EXIF", () => {
  const carried = carriedExif(camera)!;

  it("puts it in a JPEG, after the JFIF segment", () => {
    const file = embedMetadata(bareJpeg(), { exif: carried })!;
    expect(file[20]).toBe(0xff);
    expect(file[21]).toBe(0xe1); // right after SOI (2) + JFIF (2 + 16)
    expect(readMetadata(file).found).toEqual(describeExif(carried));
    expect(exifOf(file)).toEqual(carried);
  });

  it("puts it in a PNG, before the image data", () => {
    const ihdr = [
      ...u32(13),
      ...text("IHDR"),
      ...new Array(13).fill(0),
      0,
      0,
      0,
      0,
    ];
    const idat = [...u32(0), ...text("IDAT"), 0, 0, 0, 0];
    const iend = [...u32(0), ...text("IEND"), 0, 0, 0, 0];
    const png = new Uint8Array([
      0x89,
      ...text("PNG\r\n\x1a\n"),
      ...ihdr,
      ...idat,
      ...iend,
    ]);
    const file = embedMetadata(png, { exif: carried })!;
    expect(String.fromCharCode(...file.subarray(37, 41))).toBe("eXIf");
    expect(readMetadata(file).found).toEqual(describeExif(carried));
  });

  it("turns a simple WebP into an extended one, keeping its size and alpha", () => {
    const le32 = (n: number) => [
      n & 255,
      (n >> 8) & 255,
      (n >> 16) & 255,
      n >>> 24,
    ];
    // VP8L: signature, then width-1 and height-1 (14 bits each) and the alpha bit.
    const bits = (300 - 1) | ((200 - 1) << 14) | (1 << 28);
    const vp8l = [0x2f, ...le32(bits), 0];
    const chunk = [...text("VP8L"), ...le32(vp8l.length), ...vp8l];
    const webp = new Uint8Array([
      ...text("RIFF"),
      ...le32(4 + chunk.length),
      ...text("WEBP"),
      ...chunk,
    ]);
    const file = embedMetadata(webp, { exif: carried })!;
    const view = new DataView(file.buffer);
    expect(String.fromCharCode(...file.subarray(12, 16))).toBe("VP8X");
    expect(file[20]).toBe(0x08 | 0x10); // EXIF, alpha
    expect(view.getUint16(24, true) + 1).toBe(300);
    expect(view.getUint16(27, true) + 1).toBe(200);
    expect(view.getUint32(4, true)).toBe(file.length - 8);
    expect(readMetadata(file).found).toEqual(describeExif(carried));
  });

  it("leaves other formats alone", () => {
    expect(
      embedMetadata(new Uint8Array([0, 0, 0, 0, ...text("ftypavif")]), {
        exif: carried,
      }),
    ).toBeNull();
  });
});

describe("HEIC and AVIF", () => {
  /** A minimal HEIF: a `meta` box naming item 2 as Exif, its bytes in `mdat`. */
  function heif(payload: number[]): Uint8Array {
    const box = (type: string, content: number[]) => [
      ...u32(8 + content.length),
      ...text(type),
      ...content,
    ];
    const full = (type: string, version: number, content: number[]) =>
      box(type, [version, 0, 0, 0, ...content]);
    const item = [...u32(6), ...text("Exif\0\0"), ...payload];
    const ftyp = box("ftyp", [...text("heic"), 0, 0, 0, 0, ...text("mif1")]);
    const iinf = full("iinf", 0, [
      ...u16(2),
      ...full("infe", 2, [...u16(1), ...u16(0), ...text("hvc1"), 0]),
      ...full("infe", 2, [...u16(2), ...u16(0), ...text("Exif"), 0]),
    ]);
    const ilocFor = (mdatAt: number) =>
      full("iloc", 0, [
        0x44, // offsets and lengths: 4 bytes
        0x00, // no base offset
        ...u16(1),
        ...u16(2), // item 2
        ...u16(0), // data reference
        ...u16(1), // one extent
        ...u32(mdatAt + 8),
        ...u32(item.length),
      ]);
    const meta = (mdatAt: number) =>
      full("meta", 0, [
        ...box("hdlr", new Array(20).fill(0)),
        ...iinf,
        ...ilocFor(mdatAt),
      ]);
    const mdatAt = ftyp.length + meta(0).length;
    return new Uint8Array([...ftyp, ...meta(mdatAt), ...box("mdat", item)]);
  }

  it("reads the Exif item", () => {
    const file = heif([...camera]);
    expect(isobmffExif(file)).toEqual(camera);
    expect(exifOf(file)).toEqual(camera);
    expect(readMetadata(file).found).toContain("Camera: Canon EOS R6");
  });

  it("finds nothing in a file without one", () => {
    expect(isobmffExif(new Uint8Array(40))).toBeNull();
  });
});
