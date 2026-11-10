import { describe, expect, it } from "vitest";

import { readMetadata, stripMetadata } from "./metadata";

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
const u16 = (n: number) => [n >> 8, n & 255];
const u32 = (n: number) => [...u16(n >>> 16), ...u16(n & 0xffff)];
const u32le = (n: number) => [
  n & 255,
  (n >> 8) & 255,
  (n >> 16) & 255,
  n >>> 24,
];

/** A big-endian TIFF: Make "Cam", orientation, and a GPS IFD with one tag. */
function tiff(orientation: number): number[] {
  const entry = (tag: number, type: number, count: number, value: number[]) => [
    ...u16(tag),
    ...u16(type),
    ...u32(count),
    ...value,
  ];
  const ifd0 = 8;
  const gpsAt = ifd0 + 2 + 3 * 12 + 4;
  return [
    ...text("MM"),
    ...u16(42),
    ...u32(ifd0),
    ...u16(3),
    ...entry(0x010f, 2, 4, text("Cam\0")),
    ...entry(0x0112, 3, 1, [...u16(orientation), 0, 0]),
    ...entry(0x8825, 4, 1, u32(gpsAt)),
    ...u32(0),
    ...u16(1),
    ...entry(0x0001, 2, 2, [...text("N\0"), 0, 0]),
    ...u32(0),
  ];
}

const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  ...u16(payload.length + 2),
  ...payload,
];
const scan = [0xff, 0xda, ...u16(4), 1, 2, 9, 9, 0xff, 0xd9];

function jpeg(orientation = 6): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe0, [...text("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, [...text("Exif\0\0"), ...tiff(orientation)]),
    ...segment(0xfe, text("hello")),
    ...segment(0xe2, [...text("ICC_PROFILE\0"), 1, 1]),
    ...scan,
  ]);
}

describe("metadata", () => {
  it("summarizes a JPEG", () => {
    expect(readMetadata(jpeg())).toEqual({
      found: ["Camera: Cam", "GPS location", "Comment"],
      orientation: 6,
    });
  });

  it("strips a JPEG, keeping the image data, color profile and orientation", () => {
    const stripped = stripMetadata(jpeg())!;
    // Only the orientation is left, which isn't listed.
    expect(readMetadata(stripped)).toEqual({ found: [], orientation: 6 });
    const bytes = [...stripped];
    expect(bytes.slice(-scan.length)).toEqual(scan);
    expect(String.fromCharCode(...bytes)).toContain("ICC_PROFILE");
    expect(String.fromCharCode(...bytes.slice(6, 10))).toBe("JFIF"); // still first
    expect(readMetadata(stripMetadata(jpeg(1))!).found).toEqual([]);
  });

  it("reads who, where and how a photo was taken", () => {
    // A little-endian TIFF laid out by hand: IFD0, then the EXIF and GPS
    // IFDs, then the values that don't fit in an entry.
    const le16 = (n: number) => [n & 255, n >> 8];
    const entries: number[][] = [];
    const data: number[] = [];
    const ifds: { at: number; tags: [number, number, number, number[]][] }[] =
      [];
    const ifd = (tags: [number, number, number, number[]][]) => {
      ifds.push({ at: 0, tags });
      return ifds.length - 1;
    };
    const ascii = (s: string) => text(s + "\0");
    const rationals = (...values: [number, number][]) =>
      values.flatMap(([n, d]) => [...u32le(n), ...u32le(d)]);
    const exif = ifd([
      [0x9003, 2, 20, ascii("2026:08:14 18:42:07")],
      [0xa434, 2, 5, ascii("Lens")],
      [0x829a, 5, 1, rationals([1, 120])], // exposure time
    ]);
    const gps = ifd([
      [0x0001, 2, 2, ascii("N")],
      [0x0002, 5, 3, rationals([45, 1], [27, 1], [5123, 100])],
      [0x0003, 2, 2, ascii("E")],
      [0x0004, 5, 3, rationals([9, 1], [11, 1], [2844, 100])],
    ]);
    const ifd0 = ifd([
      [0x010f, 2, 6, ascii("Canon")],
      [0x0110, 2, 13, ascii("Canon EOS R6")],
      [0x013b, 2, 4, ascii("Ada")],
      [0x8769, 4, 1, [0, 0, 0, 0]],
      [0x8825, 4, 1, [0, 0, 0, 0]],
    ]);
    // IFD0 first, then the others; values after all of them.
    const order = [ifd0, exif, gps];
    let at = 8;
    for (const i of order) {
      ifds[i].at = at;
      at += 2 + ifds[i].tags.length * 12 + 4;
    }
    ifds[ifd0].tags[3][3] = u32le(ifds[exif].at);
    ifds[ifd0].tags[4][3] = u32le(ifds[gps].at);
    for (const i of order) {
      const bytes = [...le16(ifds[i].tags.length)];
      for (const [tag, type, count, value] of ifds[i].tags) {
        let field = value;
        if (value.length > 4) {
          field = u32le(at + data.length);
          data.push(...value);
        }
        bytes.push(...le16(tag), ...le16(type), ...u32le(count), ...field);
        while (bytes.length % 12 !== 2) bytes.push(0); // pad short values
      }
      entries.push([...bytes, ...u32le(0)]);
    }
    const tiffLe = [...text("II"), ...le16(42), ...u32le(8)];
    const payload = [...tiffLe, ...entries.flat(), ...data];
    const file = new Uint8Array([
      0xff,
      0xd8,
      ...segment(0xe1, [...text("Exif\0\0"), ...payload]),
      ...scan,
    ]);
    expect(readMetadata(file).found).toEqual([
      "Camera: Canon EOS R6",
      "Lens: Lens",
      "Taken: 2026-08-14 18:42",
      "Location: 45.46423° N, 9.19123° E",
      "Author: Ada",
      "Camera settings (exposure, flash…)",
    ]);
  });

  it("strips text chunks from a PNG", () => {
    const chunk = (type: string, data: number[]) => [
      ...u32(data.length),
      ...text(type),
      ...data,
      0,
      0,
      0,
      0,
    ];
    const png = new Uint8Array([
      0x89,
      ...text("PNG\r\n\x1a\n"),
      ...chunk("IHDR", Array(13).fill(0)),
      ...chunk("tEXt", text("Author\0me")),
      ...chunk("IDAT", [1, 2, 3]),
      ...chunk("IEND", []),
    ]);
    expect(readMetadata(png).found).toEqual(["Text notes"]);
    const stripped = stripMetadata(png)!;
    expect(stripped.length).toBe(png.length - (12 + 9));
    expect(readMetadata(stripped).found).toEqual([]);
  });

  it("strips EXIF and XMP from a WebP and fixes its header", () => {
    const chunk = (type: string, data: number[]) => [
      ...text(type),
      ...u32le(data.length),
      ...data,
    ];
    const body = [
      ...text("WEBP"),
      ...chunk("VP8X", [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ...chunk("VP8 ", [1, 2]),
      ...chunk("EXIF", tiff(1)),
      ...chunk("XMP ", text("<x/>")),
    ];
    const webp = new Uint8Array([
      ...text("RIFF"),
      ...u32le(body.length),
      ...body,
    ]);
    expect(readMetadata(webp).found).toEqual([
      "Camera: Cam",
      "GPS location",
      "XMP (editing history, ratings…)",
    ]);
    const stripped = stripMetadata(webp)!;
    expect(readMetadata(stripped).found).toEqual([]);
    expect(stripped[20] & 0x0c).toBe(0);
    expect(new DataView(stripped.buffer).getUint32(4, true)).toBe(
      stripped.length - 8,
    );
  });

  it("leaves other and malformed files alone", () => {
    expect(stripMetadata(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(stripMetadata(jpeg().subarray(0, 30))).toBeNull();
    expect(readMetadata(new Uint8Array([0xff, 0xd8, 0, 0]))).toEqual({
      found: [],
      orientation: 1,
    });
  });
});
