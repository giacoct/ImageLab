import { describe, expect, it } from "vitest";

import {
  cleanFileName,
  formatBytes,
  imageDetails,
  isImageFile,
  outputName,
  savedFormat,
  sniffType,
  stemOf,
  uniqueNames,
} from "./files";

describe("files", () => {
  it("cleans a file name", () => {
    expect(stemOf("photo.final.png")).toBe("photo.final");
    expect(cleanFileName("  holiday: day 1/2  ")).toBe("holiday- day 1-2");
    expect(cleanFileName("..hidden")).toBe("hidden");
    expect(cleanFileName("../../.bashrc.png")).toBe("-..-.bashrc.png");
    expect(cleanFileName("C:\\Windows\\x.png")).toBe("C-Windows-x.png");
    expect(cleanFileName(' <>"| ')).toBe("-");
    expect(cleanFileName("   ")).toBe("");
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
  });

  it("describes an image, with its file's size once known", () => {
    const image = {
      width: 640,
      height: 480,
      encoding: { format: "image/webp" as const },
    };
    const webp = new Blob([new Uint8Array(2048)], { type: "image/webp" });
    const heic = new Blob([new Uint8Array(2048)], { type: "image/heic" });
    expect(imageDetails({ ...image, file: { blob: webp } })).toEqual([
      "640 × 480",
      "WebP",
      "2.0 KB",
    ]);
    // A file in another format (an input HEIC) isn't the one saved.
    expect(imageDetails({ ...image, file: { blob: heic } })).toEqual([
      "640 × 480",
      "WebP",
    ]);
    expect(imageDetails({ ...image, file: null })).toHaveLength(2);
  });

  it("names outputs", () => {
    expect(outputName("photo.final.png", "scaled", "webp")).toBe(
      "photo.final-scaled.webp",
    );
    expect(outputName("photo.heic", null, "jpg")).toBe("photo.jpg");
  });

  it("recognizes images, HEIC with or without a type", () => {
    expect(isImageFile({ name: "IMG_1.heic", type: "" })).toBe(true);
    expect(isImageFile({ name: "x", type: "image/heif" })).toBe(true);
    expect(isImageFile({ name: "notes.txt", type: "text/plain" })).toBe(false);
  });

  it("keeps the source format when it can write it", () => {
    expect(savedFormat("image/jpeg")).toBe("image/jpeg");
    expect(savedFormat("image/webp")).toBe("image/webp");
    expect(savedFormat("image/heic")).toBe("image/jpeg");
    expect(savedFormat("image/gif")).toBe("image/jpeg");
  });

  it("numbers duplicate names", () => {
    expect(uniqueNames(["a.png", "b.png", "a.png", "a.png", "c"])).toEqual([
      "a.png",
      "b.png",
      "a-2.png",
      "a-3.png",
      "c",
    ]);
  });
});

describe("sniffType", () => {
  const bytes = (...values: (number | string)[]) =>
    new Uint8Array(
      values.flatMap((v) =>
        typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v],
      ),
    );

  it("recognizes formats by their magic bytes", () => {
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0), "")).toBe("image/jpeg");
    expect(sniffType(bytes(0x89, "PNG"), "")).toBe("image/png");
    expect(sniffType(bytes("RIFF", 0, 0, 0, 0, "WEBP"), "")).toBe("image/webp");
    expect(sniffType(bytes(0, 0, 0, 0, "ftypheic"), "image/jpeg")).toBe(
      "image/heic",
    );
    expect(sniffType(bytes(0, 0, 0, 0, "ftypavif"), "")).toBe("image/avif");
    expect(sniffType(bytes(1, 2, 3), "image/x-weird")).toBe("image/x-weird");
  });
});
