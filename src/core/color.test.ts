import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { isWideDeclared, isWideProfile } from "./color";
import { embedMetadata } from "./embed";
import { declaredColors, tagNclx } from "./isobmff";
import { profileOf } from "./metadata";

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
const u16 = (n: number) => [n >> 8, n & 255];
const u32 = (n: number) => [...u16(n >>> 16), ...u16(n & 0xffff)];
const fixed = (v: number) => u32(Math.round(v * 65536) >>> 0);

/** A matrix ICC profile with these red, green and blue (XYZ, D50). */
function profile(primaries: number[][]): Uint8Array {
  const header = new Array(128).fill(0);
  header.splice(36, 4, ...text("acsp"));
  const names = ["rXYZ", "gXYZ", "bXYZ"];
  const tableEnd = 128 + 4 + names.length * 12;
  const table = [...u32(names.length)];
  const data: number[] = [];
  names.forEach((name, i) => {
    table.push(...text(name), ...u32(tableEnd + data.length), ...u32(20));
    data.push(...text("XYZ "), 0, 0, 0, 0, ...primaries[i].flatMap(fixed));
  });
  return new Uint8Array([...header, ...table, ...data]);
}

const SRGB = [
  [0.4361, 0.2225, 0.0139],
  [0.3851, 0.7169, 0.0971],
  [0.1431, 0.0606, 0.7141],
];
const DISPLAY_P3 = [
  [0.5151, 0.2412, -0.0011],
  [0.292, 0.6922, 0.0419],
  [0.1571, 0.0666, 0.7841],
];

describe("wide gamut", () => {
  it("tells a Display P3 profile from an sRGB one", () => {
    expect(isWideProfile(profile(DISPLAY_P3))).toBe(true);
    expect(isWideProfile(profile(SRGB))).toBe(false);
    expect(isWideProfile(new Uint8Array(200))).toBe(false); // not a profile
  });

  it("tells wide primaries a HEIC or AVIF codes", () => {
    expect(isWideDeclared([{ primaries: 12 }])).toBe(true); // Display P3
    expect(isWideDeclared([{ primaries: 1 }])).toBe(false); // sRGB
    expect(isWideDeclared([{ icc: profile(DISPLAY_P3) }])).toBe(true);
    expect(isWideDeclared([])).toBe(false);
  });
});

describe("embedding a profile", () => {
  const icc = profile(DISPLAY_P3);

  it("puts it in a JPEG, a PNG and a WebP, where it's read back", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
    expect(profileOf(embedMetadata(jpeg, { icc })!)).toEqual({
      data: icc,
      deflated: false,
    });

    const ihdr = [...u32(13), ...text("IHDR"), ...new Array(17).fill(0)];
    const iend = [...u32(0), ...text("IEND"), 0, 0, 0, 0];
    const png = new Uint8Array([
      0x89,
      ...text("PNG\r\n\x1a\n"),
      ...ihdr,
      ...iend,
    ]);
    const read = profileOf(embedMetadata(png, { icc })!)!;
    expect(read.deflated).toBe(true);
    expect(new Uint8Array(inflateSync(read.data))).toEqual(icc);

    const le32 = (n: number) => [
      n & 255,
      (n >> 8) & 255,
      (n >> 16) & 255,
      n >>> 24,
    ];
    const vp8l = [0x2f, ...le32(9 | (9 << 14)), 0];
    const chunk = [...text("VP8L"), ...le32(vp8l.length), ...vp8l];
    const webp = new Uint8Array([
      ...text("RIFF"),
      ...le32(4 + chunk.length),
      ...text("WEBP"),
      ...chunk,
    ]);
    const tagged = embedMetadata(webp, { icc })!;
    expect(tagged[20] & 0x20).toBe(0x20); // VP8X says it has a profile
    expect(String.fromCharCode(...tagged.subarray(30, 34))).toBe("ICCP");
    expect(profileOf(tagged)!.data).toEqual(icc);
  });
});

describe("HEIC and AVIF colors", () => {
  /** A `meta` box with an `iprp`/`ipco` holding these `colr` boxes. */
  function heif(...colrs: number[][]): Uint8Array {
    const box = (type: string, content: number[]) => [
      ...u32(8 + content.length),
      ...text(type),
      ...content,
    ];
    const ipco = box(
      "ipco",
      colrs.flatMap((colr) => box("colr", colr)),
    );
    const meta = box("meta", [0, 0, 0, 0, ...box("iprp", ipco)]);
    return new Uint8Array([...box("ftyp", text("avif")), ...meta]);
  }
  const nclx = (primaries: number, transfer: number) => [
    ...text("nclx"),
    ...u16(primaries),
    ...u16(transfer),
    ...u16(6),
    0x80,
  ];

  it("reads the primaries and profiles they declare", () => {
    const icc = profile(DISPLAY_P3);
    expect(
      declaredColors(heif(nclx(1, 13), [...text("prof"), ...icc])),
    ).toEqual([{ primaries: 1 }, { icc }]);
  });

  it("tags an AVIF as Display P3, in place", () => {
    const file = heif(nclx(2, 2));
    expect(tagNclx(file, 12, 13)).toBe(true);
    expect(declaredColors(file)).toEqual([{ primaries: 12 }]);
    expect(tagNclx(heif(), 12, 13)).toBe(false);
  });
});
