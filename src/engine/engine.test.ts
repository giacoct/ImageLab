/**
 * Engine tests in a real browser (Vitest browser mode, Chromium): decoding,
 * encoding, every operation, applying tools one after another, previews,
 * and the worker round trip.
 * Images are drawn synthetically so the expected pixels are known.
 */

import { describe, expect, it } from "vitest";

import { initialEncoding, type Encoding } from "../core/encoding";
import type { ImageFormat } from "../core/files";
import { defaults } from "../core/params";
import { getOp } from "../ops";
import type { Action, RunContext } from "../ops/op";
import { cropForImage } from "../ops/transform";
import { context2d, createCanvas, readPixels, type Img } from "./canvas";
import { Cancelled, engine } from "./client";
import { decode } from "./decode";
import { encodeImage } from "./encode";
import heicUrl from "./fixtures/logo.heic?url";
import {
  apply,
  finish,
  open,
  renderPreview,
  save,
  type Version,
} from "./pipeline";

const context: RunContext = {
  scale: 1,
  asset: (path) => new URL(path, `${location.origin}/`).href,
};

/** A `width`×`height` image: left half red, right half blue. */
function twoTone(width = 40, height = 20): Img {
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, width / 2, height);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(width / 2, 0, width / 2, height);
  return canvas;
}

function pixel(image: Img, x: number, y: number): number[] {
  return [...context2d(image).getImageData(x, y, 1, 1).data];
}

function pngBlob(image: Img): Promise<Blob> {
  return image.convertToBlob({ type: "image/png" });
}

function action(op: string, params: Record<string, unknown> = {}): Action {
  return { op, params: { ...defaults(getOp(op).params), ...params } };
}

/** Save as `format`, as Convert format would. */
const as = (
  format: ImageFormat,
  settings: Partial<Encoding> = {},
): Encoding => ({
  ...initialEncoding("image/png"),
  format,
  chosen: true,
  ...settings,
});

/** A 300×300 image of noise, which compresses badly. */
function noise(): Img {
  const canvas = createCanvas(300, 300);
  const data = readPixels(canvas);
  for (let i = 0; i < data.data.length; i++)
    data.data[i] = i % 4 === 3 ? 255 : (i * 2654435761) % 256;
  context2d(canvas).putImageData(data.image, 0, 0);
  return canvas;
}

async function run(
  op: string,
  image: Img,
  params: Record<string, unknown> = {},
) {
  const definition = getOp(op);
  if (definition.kind !== "map") throw new Error("not a map op");
  return definition.run(image, action(op, params).params, context);
}

describe("decode", () => {
  it("decodes PNG and sniffs the type", async () => {
    const { image, type } = await decode(await pngBlob(twoTone()));
    expect(type).toBe("image/png");
    expect([image.width, image.height]).toEqual([40, 20]);
  });

  it("decodes HEIC through libheif", async () => {
    const blob = await (await fetch(heicUrl)).blob();
    const { image, type } = await decode(blob);
    expect(type).toBe("image/heic");
    expect([image.width, image.height]).toEqual([64, 64]);
  });

  it("rejects files that are not images", async () => {
    await expect(
      decode(new Blob(["hello"], { type: "text/plain" })),
    ).rejects.toThrow(/not an image/);
  });
});

describe("encode", () => {
  it.each(["jpeg", "png", "webp", "avif"] as const)(
    "writes %s",
    async (format) => {
      const { blob, width } = await encodeImage(
        twoTone(),
        as(`image/${format}`),
      );
      expect(blob.type).toBe(`image/${format}`);
      expect(width).toBe(40);
      const { image } = await decode(blob);
      expect(image.width).toBe(40);
    },
  );

  it("keeps the input format, switching JPEG to PNG for transparency", async () => {
    const kept = initialEncoding("image/jpeg");
    expect((await encodeImage(twoTone(), kept)).blob.type).toBe("image/jpeg");
    expect((await encodeImage(createCanvas(10, 10), kept)).blob.type).toBe(
      "image/png",
    );
  });

  it("meets a target size by lowering the quality", async () => {
    const best = await encodeImage(noise(), as("image/jpeg", { quality: 100 }));
    const { blob } = await encodeImage(
      noise(),
      as("image/jpeg", { targetBytes: 30 * 1024 }),
    );
    expect(blob.size).toBeLessThanOrEqual(30 * 1024);
    expect(best.blob.size).toBeGreaterThan(30 * 1024);
  });

  it("meets a target size for PNG by lowering the dimensions", async () => {
    const { blob, width } = await encodeImage(
      noise(),
      as("image/png", { targetBytes: 50 * 1024 }),
    );
    expect(blob.size).toBeLessThanOrEqual(50 * 1024);
    expect(width).toBeLessThan(300);
  });
});

describe("operations", () => {
  it("rotates, flips and crops", async () => {
    const rotated = await run("transform", twoTone(), { rotate: "90" });
    expect([rotated.width, rotated.height]).toEqual([20, 40]);
    expect(pixel(rotated, 10, 5)).toEqual([255, 0, 0, 255]); // red half now on top

    const flipped = await run("transform", twoTone(), { flipH: true });
    expect(pixel(flipped, 2, 2)).toEqual([0, 0, 255, 255]);

    const cropped = await run("transform", twoTone(), {
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
    });
    expect([cropped.width, cropped.height]).toEqual([20, 20]);
    expect(pixel(cropped, 5, 5)).toEqual([0, 0, 255, 255]);
  });

  it("adapts a ratio crop to each image", () => {
    const crop = cropForImage({ x: 0, y: 0, width: 1, height: 1 }, "1:1", {
      width: 400,
      height: 200,
    });
    expect(crop.width * 400).toBeCloseTo(crop.height * 200);
  });

  it("scales by percentage, box and width", async () => {
    expect(
      (await run("scale", twoTone(), { mode: "percent", percent: 50 })).width,
    ).toBe(20);
    const boxed = await run("scale", twoTone(400, 200), {
      mode: "fit",
      width: 100,
      height: 100,
    });
    expect([boxed.width, boxed.height]).toEqual([100, 50]);
    const small = await run("scale", twoTone(), { mode: "width", width: 400 });
    expect(small.width).toBe(40); // never enlarges unless asked
  });

  it("adds a margin, in pixels or percent, colored or transparent", async () => {
    const framed = await run("margin", twoTone(), {
      size: 5,
      color: "#00ff00",
    });
    expect([framed.width, framed.height]).toEqual([50, 30]);
    expect(pixel(framed, 1, 1)).toEqual([0, 255, 0, 255]);
    expect(pixel(framed, 6, 6)).toEqual([255, 0, 0, 255]);
    const sides = await run("margin", twoTone(), {
      unit: "percent",
      same: false,
      top: 50,
      right: 0,
      bottom: 0,
      left: 0,
      transparent: true,
    });
    expect([sides.width, sides.height]).toEqual([40, 30]); // 50% of the 20 px side on top
    expect(pixel(sides, 1, 1)[3]).toBe(0);
  });

  it("removes a detected background", async () => {
    const canvas = createCanvas(30, 30);
    const ctx = context2d(canvas);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 30, 30);
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(10, 10, 10, 10);
    const keyed = await run("remove-background", canvas);
    expect(pixel(keyed, 2, 2)[3]).toBe(0);
    expect(pixel(keyed, 15, 15)).toEqual([0, 0, 255, 255]);
  });

  it("adjusts colors", async () => {
    const gray = await run("adjust", twoTone(), { grayscale: 100 });
    const [r, g, b] = pixel(gray, 2, 2);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});

describe("pipeline", () => {
  const file = async (name = "photo.png", image = twoTone()) =>
    open(await pngBlob(image), name);

  /** Apply one tool to one image. */
  async function applyOne(
    input: Version,
    op: string,
    params: Record<string, unknown> = {},
  ): Promise<Version> {
    const outputs = await apply([input], action(op, params), context);
    expect(outputs).toHaveLength(1);
    return outputs[0];
  }

  it("opens a file: size, format, thumbnail and metadata", async () => {
    const version = await file();
    expect(version).toMatchObject({
      name: "photo.png",
      width: 40,
      height: 20,
      suffix: null,
      metadata: [],
      encoding: { format: "image/png" },
      file: { original: true },
    });
    expect(version.thumbnail.type).toBe("image/webp");
  });

  it("takes results further, and names the file after the last tool", async () => {
    const scaled = await applyOne(await file(), "scale", { percent: 50 });
    const rotated = await applyOne(scaled, "transform", { rotate: "90" });
    expect([rotated.width, rotated.height]).toEqual([10, 20]);
    const saved = await save(rotated);
    expect(saved.name).toBe("photo-edited.png");
    expect(saved.blob.type).toBe("image/png");
  });

  it("applies a tool to each image on its own", async () => {
    const outputs = await apply(
      [await file("a.png"), await file("b.png", twoTone(20, 10))],
      action("scale", { percent: 50 }),
      context,
    );
    expect(outputs.map((v) => [v.name, v.width])).toEqual([
      ["a.png", 20],
      ["b.png", 10],
    ]);
  });

  it("keeps a converted format through later tools", async () => {
    const converted = await applyOne(await file(), "convert", {
      format: "jpeg",
    });
    const adjusted = await applyOne(converted, "adjust", { brightness: 120 });
    const saved = await save(adjusted);
    expect(saved.name).toBe("photo-adjusted.jpg");
    expect(saved.blob.type).toBe("image/jpeg");
  });

  it("takes the untouched pixels further, not the compressed file", async () => {
    const input = await file();
    const compressed = await applyOne(input, "compress", { quality: 10 });
    expect(compressed.pixels).toBe(input.pixels);
    expect(compressed.file?.blob.type).toBe("image/png");
    const jpeg = await applyOne(input, "convert", {
      format: "jpeg",
      quality: 10,
    });
    const scaled = await applyOne(jpeg, "scale", { percent: 50 });
    // A JPEG at quality 10 would have smeared red into blue.
    const { image } = await decode(scaled.pixels);
    expect(pixel(image, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(pixel(image, 17, 7)).toEqual([0, 0, 255, 255]);
  });

  it("compresses to a file size, and still fits after later tools", async () => {
    const jpeg = await applyOne(await file("noise.png", noise()), "convert", {
      format: "jpeg",
      quality: 100,
    });
    const compressed = await applyOne(jpeg, "compress", {
      mode: "target",
      targetKb: 30,
    });
    expect(compressed.file!.blob.size).toBeLessThanOrEqual(30 * 1024);
    const adjusted = await applyOne(compressed, "adjust", { contrast: 120 });
    const saved = await save(adjusted);
    expect(saved.blob.type).toBe("image/jpeg");
    expect(saved.blob.size).toBeLessThanOrEqual(30 * 1024);
  });

  it("saves the file Convert format wrote", async () => {
    const image = noise();
    const written = await encodeImage(image, as("image/webp", { quality: 50 }));
    const converted = await applyOne(
      await file("noise.png", image),
      "convert",
      {
        format: "webp",
        quality: 50,
      },
    );
    // Re-encoding would give a different file.
    expect((await save(converted)).blob.size).toBe(written.blob.size);
  });

  it("saves an untouched file as it is, or as JPEG if the app cannot write it", async () => {
    const jpeg = (await encodeImage(twoTone(), as("image/jpeg"))).blob;
    const kept = await save(await open(jpeg, "photo.jpg"));
    expect(kept.name).toBe("photo.jpg");
    expect(kept.blob.size).toBe(jpeg.size);
    const heic = await (await fetch(heicUrl)).blob();
    const converted = await save(await open(heic, "logo.heic"));
    expect(converted.name).toBe("logo.jpg");
    expect(converted.blob.type).toBe("image/jpeg");
  });

  it("makes small thumbnails", async () => {
    const version = await file("big.png", twoTone(2000, 1000));
    const { image } = await decode(version.thumbnail);
    expect([image.width, image.height]).toEqual([480, 240]);
  });

  it("merges all the images into one", async () => {
    const outputs = await apply(
      [await file("a.png"), await file("b.png", twoTone(20, 10))],
      action("merge", { gap: 4 }),
      context,
    );
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({ name: "a.png", width: 40, height: 34 });
    expect((await save(outputs[0])).name).toBe("a-merged.png");
  });

  it("strips metadata without re-encoding", async () => {
    const jpeg = (await encodeImage(twoTone(), as("image/jpeg"))).blob;
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    const comment = [
      0xff,
      0xfe,
      0,
      7,
      ...[..."hello"].map((c) => c.charCodeAt(0)),
    ];
    const tagged = new Blob(
      [bytes.subarray(0, 2), new Uint8Array(comment), bytes.subarray(2)],
      { type: "image/jpeg" },
    );
    const input = await open(tagged, "photo.jpg");
    expect(input.metadata.length).toBeGreaterThan(0);
    const clean = await applyOne(input, "strip-metadata");
    expect(clean.metadata).toEqual([]);
    const saved = await save(clean);
    expect(saved.name).toBe("photo-clean.jpg");
    expect(new Uint8Array(await saved.blob.arrayBuffer())).toEqual(bytes);
  });

  it("reads the text in an image, dark on light or light on dark", async () => {
    const textImage = (text: string, ink: string, paper: string) => {
      const canvas = createCanvas(640, 120);
      const ctx = context2d(canvas);
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, 640, 120);
      ctx.fillStyle = ink;
      ctx.font = "bold 56px sans-serif";
      ctx.fillText(text, 20, 85);
      return canvas;
    };
    const dark = await finish(
      await file("note.png", textImage("HELLO WORLD", "#000000", "#ffffff")),
      action("ocr"),
      context,
    );
    expect(dark).toMatchObject({ name: "note-text.txt", text: "HELLO WORLD" });
    expect(await dark.blob.text()).toBe("HELLO WORLD");
    const light = await finish(
      await file("sign.png", textImage("INVERTED", "#ffffff", "#1a3a8a")),
      action("ocr", { layout: "sparse" }),
      context,
    );
    expect(light.text).toBe("INVERTED");
  });

  it("traces an image to SVG at its original size", async () => {
    const output = await finish(await file(), action("vectorize"), context);
    expect(output.name).toBe("photo-vector.svg");
    const svg = await output.blob.text();
    expect(svg).toMatch(/<svg[^>]*width="40" height="20" viewBox/);
    expect(svg).toContain("<path");
    const bw = await finish(
      await file(),
      action("vectorize", { colors: "bw" }),
      context,
    );
    expect(await bw.blob.text()).toContain("<path");
  });

  it("keeps image tools and final tools apart", async () => {
    await expect(apply([await file()], action("ocr"), context)).rejects.toThrow(
      /doesn't make images/,
    );
    await expect(
      finish(await file(), action("scale"), context),
    ).rejects.toThrow(/makes images/);
  });
});

describe("preview", () => {
  const shown = async (key: string, image: Img) => ({
    key,
    version: await open(await pngBlob(image), `${key}.png`),
  });

  it("previews on a downscaled copy, scaling pixel settings", async () => {
    const images = [await shown("a", twoTone(400, 200))];
    const tool = action("scale", { mode: "width", width: 200 });
    // 400×200 → 100×50 preview; 200 px wide at full size is 50 px at this scale.
    const { image: preview, scale } = await renderPreview(
      { images, action: tool, maxSide: 100 },
      context.asset,
    );
    expect([preview.width, preview.height]).toEqual([50, 25]);
    expect(scale).toBe(0.25);
    // Another size comes from the same cached copy, scaled the same way.
    const { image: larger } = await renderPreview(
      { images, action: tool, maxSide: 200 },
      context.asset,
    );
    expect([larger.width, larger.height]).toEqual([100, 50]);
  });

  it("shows the image as it is without a tool, or with a final tool", async () => {
    const images = [await shown("plain", twoTone())];
    for (const tool of [null, action("ocr")]) {
      const { image: preview } = await renderPreview(
        { images, action: tool, maxSide: 100 },
        context.asset,
      );
      expect([preview.width, preview.height]).toEqual([40, 20]);
    }
  });

  it("shows the file a file tool writes", async () => {
    // Transparent pixels saved as JPEG are flattened onto white.
    const clear = createCanvas(20, 20);
    context2d(clear); // a canvas needs a context to be encoded
    const images = [await shown("clear", clear)];
    const { image: preview } = await renderPreview(
      { images, action: action("convert", { format: "jpeg" }), maxSide: 100 },
      context.asset,
    );
    expect(pixel(preview, 5, 5)).toEqual([255, 255, 255, 255]);
  });

  it("previews a merge at one common scale", async () => {
    const images = [
      await shown("m1", twoTone(400, 200)),
      await shown("m2", twoTone(200, 100)),
    ];
    const { image: preview } = await renderPreview(
      { images, action: action("merge"), maxSide: 200 },
      context.asset,
    );
    // Both at the scale where the larger fits 200 px, smaller for two images (÷√2).
    expect(preview.width).toBe(Math.round(400 * (0.5 / Math.SQRT2)));
    expect(preview.height).toBeGreaterThan(preview.width / 2);
  });
});

describe("worker client", () => {
  it("opens, applies tools and saves in the engine worker", async () => {
    const blob = await pngBlob(twoTone());
    const version = await engine.run("open", { blob, name: "photo.png" });
    expect(version).toMatchObject({ width: 40, height: 20, metadata: [] });
    const [scaled] = await engine.run("apply", {
      inputs: [version],
      action: action("scale", { percent: 25 }),
    });
    const [converted] = await engine.run("apply", {
      inputs: [scaled],
      action: action("convert", { format: "jpeg" }),
    });
    const saved = await engine.run("save", { version: converted });
    expect(saved.name).toBe("photo-converted.jpg");
    expect((await decode(saved.blob)).image.width).toBe(10);
  });

  it("renders previews in the preview worker", async () => {
    const version = await engine.run("open", {
      blob: await pngBlob(twoTone()),
      name: "p.png",
    });
    const { bitmap } = await engine.preview({
      images: [{ key: "worker", version }],
      action: null,
      maxSide: 100,
    });
    expect([bitmap.width, bitmap.height]).toEqual([40, 20]);
  });

  it("reports errors from the worker", async () => {
    await expect(
      engine.run("open", { blob: new Blob(["nope"]), name: "nope.png" }),
    ).rejects.toThrow(/not an image/);
  });

  it("keeps serving requests that wait behind a cancelled batch", async () => {
    const blob = await pngBlob(noise());
    const version = await open(blob, "n.png");
    const tool = action("convert", { format: "avif", quality: 100 });
    const controller = new AbortController();
    // More jobs than workers, so some of them wait for a free one.
    const batch = Array.from({ length: 12 }, () =>
      engine.run(
        "apply",
        { inputs: [version], action: tool },
        controller.signal,
      ),
    );
    const waiting = engine.run("open", { blob, name: "n.png" });
    controller.abort();
    const settled = await Promise.allSettled(batch);
    expect(
      settled.every(
        (r) => r.status === "rejected" && r.reason instanceof Cancelled,
      ),
    ).toBe(true);
    expect((await waiting).width).toBe(300);
  });
});
