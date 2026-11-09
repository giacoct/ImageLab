/**
 * The engine's work, inside a worker: open a file, apply a tool to images,
 * turn an image into text or SVG (`finish`), save an image to its file, and
 * render live previews on downscaled copies with the same operations.
 *
 * An image is a `Version`: plain data the main thread keeps and sends back,
 * e.g. when a result is used as the input of another tool. Its pixels are
 * kept losslessly (the input file, or a PNG once a tool changed them), so
 * that never compounds compression; its file is written when it's saved,
 * unless Convert format or Compress already wrote it.
 */

import { initialEncoding, type Encoding } from "../core/encoding";
import { extensionFor, outputName, type ImageFormat } from "../core/files";
import { downscaleFactor } from "../core/geometry";
import { readMetadata } from "../core/metadata";
import { getOp } from "../ops";
import type { Action, Op, RunContext } from "../ops/op";
import { downscaled, type Img } from "./canvas";
import { decode } from "./decode";
import { encodeImage, type Picture } from "./encode";

/** One image as a tool left it. */
export interface Version {
  /** The name of the file it comes from (for a merge, the first image's). */
  name: string;
  /** The pixels: the input file, or a lossless PNG once a tool changed them. */
  pixels: Blob;
  width: number;
  height: number;
  /** A small WebP, for lists. */
  thumbnail: Blob;
  encoding: Encoding;
  /** The file it saves to, if already written (see `Picture`). */
  file: Picture["file"];
  /** The last tool's suffix for the saved name, or null if no tool changed it. */
  suffix: string | null;
  /** The metadata the saved file carries, in words. */
  metadata: string[];
}

/** What a final tool (OCR, SVG) makes of an image. */
export interface Output {
  name: string;
  /** An SVG or a text file. */
  blob: Blob;
  /** The SVG itself, or the image the text was read from. */
  thumbnail: Blob;
  /** The recognized text, for OCR. */
  text?: string;
}

export interface Saved {
  name: string;
  blob: Blob;
}

/** Longest side of the thumbnails. */
const THUMBNAIL_SIDE = 480;

const EXTENSIONS: Record<string, string> = {
  "image/svg+xml": "svg",
  "text/plain": "txt",
};

const WRITABLE = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

/** Read a file: its pixels, size, format and metadata. */
export async function open(blob: Blob, name: string): Promise<Version> {
  const { image, type, bytes } = await decode(blob);
  // Labelled with the sniffed type: the declared one may be missing or wrong.
  const file = new Blob([blob], { type });
  return {
    name,
    pixels: file,
    width: image.width,
    height: image.height,
    thumbnail: await thumbnailOf(image),
    encoding: initialEncoding(type),
    file: { blob: file, original: true },
    suffix: null,
    metadata: readMetadata(bytes).found,
  };
}

/**
 * Apply an image tool: to each input on its own, or to all of them at once
 * for a merge, which gives one image. Inputs are decoded one at a time, so
 * the full-size images don't all wait in memory.
 */
export async function apply(
  inputs: Version[],
  action: Action,
  context: RunContext,
): Promise<Version[]> {
  const op = getOp(action.op);
  if (op.kind === "final") throw new Error(`${op.title} doesn't make images.`);
  if (inputs.length === 0) throw new Error("Add images first.");

  if (op.kind === "combine") {
    const images: Img[] = [];
    for (const input of inputs) images.push(await pixelsOf(input));
    const image = await op.run(images, action.params, context);
    const picture = { image, encoding: inputs[0].encoding, file: null };
    return [await store(inputs[0], picture, op, true)];
  }

  const outputs: Version[] = [];
  for (const input of inputs) {
    const picture = {
      image: await pixelsOf(input),
      encoding: input.encoding,
      file: input.file,
    };
    if (op.kind === "map") {
      // New pixels: no file holds them yet.
      const image = await op.run(picture.image, action.params, context);
      outputs.push(
        await store(input, { ...picture, image, file: null }, op, true),
      );
    } else {
      const written = await op.run(picture, action.params, context);
      outputs.push(await store(input, written, op, false));
    }
  }
  return outputs;
}

async function pixelsOf(version: Version): Promise<Img> {
  return (await decode(version.pixels)).image;
}

/** The version a tool made from `from`; its pixels are only written again if they changed. */
async function store(
  from: Version,
  picture: Picture,
  op: Op,
  changed: boolean,
): Promise<Version> {
  const { image } = picture;
  return {
    name: from.name,
    pixels: changed
      ? await image.convertToBlob({ type: "image/png" })
      : from.pixels,
    width: image.width,
    height: image.height,
    thumbnail: changed ? await thumbnailOf(image) : from.thumbnail,
    encoding: picture.encoding,
    file: picture.file,
    suffix: op.suffix,
    // Files the app writes never carry metadata; only the input file does.
    metadata: picture.file?.original ? from.metadata : [],
  };
}

/** Run a final tool (OCR, SVG) on one image. */
export async function finish(
  input: Version,
  action: Action,
  context: RunContext,
): Promise<Output> {
  const op = getOp(action.op);
  if (op.kind !== "final") throw new Error(`${op.title} makes images.`);
  const blob = await op.run(await pixelsOf(input), action.params, context);
  const type = blob.type.split(";")[0];
  const isText = type.startsWith("text/");
  return {
    name: outputName(input.name, op.suffix, EXTENSIONS[type] ?? "bin"),
    blob,
    thumbnail: isText ? input.thumbnail : blob,
    text: isText ? await blob.text() : undefined,
  };
}

/**
 * The file to download: the one already written, unless it's an input file
 * the app can't write (HEIC, GIF…), else the pixels encoded now.
 */
export async function save(version: Version): Promise<Saved> {
  const written =
    version.file && WRITABLE.has(version.file.blob.type)
      ? version.file.blob
      : null;
  const blob =
    written ??
    (await encodeImage(await pixelsOf(version), version.encoding)).blob;
  const extension = extensionFor(blob.type as ImageFormat);
  return { name: outputName(version.name, version.suffix, extension), blob };
}

/** A small WebP of the image. */
function thumbnailOf(image: Img): Promise<Blob> {
  const factor = downscaleFactor(image, THUMBNAIL_SIDE);
  const small = downscaled(image, image.width * factor, image.height * factor);
  return small.convertToBlob({ type: "image/webp", quality: 0.8 });
}

// --- preview -------------------------------------------------------------------

export interface PreviewRequest {
  /** The images shown: the selected one, or all of them for a merge. */
  images: {
    /** Stable id of this version, used to cache its downscaled copy. */
    key: string;
    version: Version;
  }[];
  /** The tool to preview, or null to show the image as it is. */
  action: Action | null;
  /** Longest side of each image in the preview, in pixels. */
  maxSide: number;
}

interface Proxy {
  image: Img;
  /** Proxy size / full size. */
  scale: number;
}

/**
 * Previews start from a downscaled copy of each version, decoded once at the
 * largest size a preview shows; smaller previews are derived from it. The
 * most recently used copies are kept.
 */
const PROXY_SIDE = 1600;
const PROXY_CACHE = 12;
const proxies = new Map<string, Promise<Proxy>>();

function proxyFor(key: string, pixels: Blob): Promise<Proxy> {
  let proxy = proxies.get(key);
  if (proxy) {
    proxies.delete(key); // re-inserted below: most recently used last
  } else {
    proxy = decode(pixels).then(({ image }) => {
      const scale = downscaleFactor(image, PROXY_SIDE);
      return {
        image:
          scale < 1
            ? downscaled(image, image.width * scale, image.height * scale)
            : image,
        scale,
      };
    });
    proxy.catch(() => proxies.delete(key));
  }
  proxies.set(key, proxy);
  if (proxies.size > PROXY_CACHE) proxies.delete(proxies.keys().next().value!);
  return proxy;
}

/**
 * Render the tool on downscaled copies of the images. All of them share one
 * scale, so a merge keeps their relative sizes; it's smaller with many
 * images, so a merged preview stays light. A final tool (OCR, SVG) shows the
 * image it starts from; a file tool, the file it writes.
 */
export async function renderPreview(
  request: PreviewRequest,
  asset: RunContext["asset"],
): Promise<Preview> {
  const { image, scale } = await render(request, asset);
  return { image: await image, scale };
}

export interface Preview {
  image: Img;
  /** Preview size / full size, to show the zoom of the real image. */
  scale: number;
}

async function render(
  request: PreviewRequest,
  asset: RunContext["asset"],
): Promise<{ image: Img | Promise<Img>; scale: number }> {
  const loaded = await Promise.all(
    request.images.map(({ key, version }) => proxyFor(key, version.pixels)),
  );
  if (loaded.length === 0) throw new Error("Nothing to preview.");
  const scale =
    Math.min(
      ...loaded.map(
        (proxy) => proxy.scale * downscaleFactor(proxy.image, request.maxSide),
      ),
    ) / Math.max(1, Math.sqrt(loaded.length));
  // Operations may edit their input in place: each render starts from fresh copies.
  const images = loaded.map((proxy) => {
    const factor = scale / proxy.scale;
    return downscaled(
      proxy.image,
      proxy.image.width * factor,
      proxy.image.height * factor,
    );
  });

  const op = request.action && getOp(request.action.op);
  if (!op || op.kind === "final") return { image: images[0], scale };
  const values = request.action!.params;
  const context = { scale, asset };
  switch (op.kind) {
    case "map":
      return { image: op.run(images[0], values, context), scale };
    case "combine":
      return { image: op.run(images, values, context), scale };
    case "file": {
      const picture = {
        image: images[0],
        encoding: request.images[0].version.encoding,
        file: null,
      };
      const written = await op.run(picture, values, context);
      const image = written.file
        ? (await decode(written.file.blob)).image
        : images[0];
      return { image, scale };
    }
  }
}
