/**
 * The app state: the images loaded, the tool that's open, and what it made.
 * One shared instance, so a running tool keeps going whatever the
 * components do.
 *
 * There's no history: a tool turns the images into results, which can be
 * downloaded or used as the images for the next tool (a shortcut for
 * downloading and loading them again, without the loss of saving them in
 * between: see `Version`).
 */

import { isImageFile, uniqueNames } from "../core/files";
import { defaults } from "../core/params";
import { Cancelled, engine } from "../engine/client";
import type { Output, Saved, Version } from "../engine/pipeline";
import { getOp } from "../ops";
import type { Action } from "../ops/op";
import { downloadBlob, downloadZip } from "./download";
import { shareFiles } from "./share";

/** One image, loaded or made by a tool. */
export interface Item {
  /** Unique per image, so previews cache it and lists key it. */
  id: string;
  version: Version;
}

export interface Failure {
  name: string;
  message: string;
}

let nextId = 0;
const uid = () => `id${++nextId}`;

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

class Session {
  /** Bumped by "Clear", so files still being read are dropped. */
  private generation = 0;
  private controller: AbortController | null = null;

  // Items never change once made: raw state, replaced as a whole.
  /** The images the tool works on. */
  items = $state.raw<Item[]>([]);
  /** Position of the image shown in the preview. */
  selectedIndex = $state(0);
  readonly selected = $derived(
    this.items[Math.min(this.selectedIndex, this.items.length - 1)],
  );
  /** How many dropped files are still being read. */
  reading = $state(0);
  /** Files that couldn't be opened, images a tool failed on. */
  failures = $state.raw<Failure[]>([]);

  /** The tool that's open, with its settings. */
  tool = $state<Action | null>(null);
  readonly op = $derived(this.tool ? getOp(this.tool.op) : null);
  /** The color setting being picked from the image in the preview, if any. */
  picking = $state<string | null>(null);
  /**
   * The file Convert format or Compress will write for the picked image:
   * its size, the quality it's written at, and (a PNG shrunk to fit a file
   * size) its width / the image's. `pending` while it's worked out.
   */
  estimate = $state.raw<{
    bytes: number;
    quality: number | null;
    shrink: number;
    name: string;
    pending: boolean;
  } | null>(null);
  private estimating: AbortController | null = null;

  /** The images the last run made. */
  results = $state.raw<Item[]>([]);
  /** What the last run of a final tool (OCR, SVG) made. */
  outputs = $state.raw<{ id: string; output: Output }[]>([]);
  /** What the results were made from, to tell when they're out of date. */
  private ranWith = $state<string | null>(null);
  private readonly signature = $derived(
    JSON.stringify([this.items.map((item) => item.id), this.tool]),
  );
  readonly stale = $derived(
    this.ranWith !== null && this.ranWith !== this.signature,
  );

  running = $state(false);
  /**
   * Images done, of how many; and how far the ones running are (0–1 each,
   * by job), for the tools that report it.
   */
  progress = $state({ done: 0, total: 0, parts: {} as Record<number, number> });
  /** Whether the progress can be shown as a bar: a batch, or a tool that reports it. */
  readonly measured = $derived(
    this.progress.total > 1 || Object.keys(this.progress.parts).length > 0,
  );
  /** How much is done, in images (fractions included). */
  readonly done = $derived(
    this.progress.done +
      Object.values(this.progress.parts).reduce((sum, part) => sum + part, 0),
  );
  saving = $state(false);
  /**
   * The share sheet only opens right after a tap. When saving the files
   * took longer than that, they're "ready" and the next tap shares them.
   */
  sharing = $state<"idle" | "saving" | "ready">("idle");
  /** Results saved to files, by item id: saved once for downloads and shares. */
  private saved = new Map<string, Saved>();

  // --- images ----------------------------------------------------------------

  async addFiles(files: Iterable<File>): Promise<void> {
    const images = [...files].filter(isImageFile);
    if (images.length === 0) return;
    const generation = this.generation;
    this.reading += images.length;
    const failures: Failure[] = [];
    const opened = await Promise.all(
      images.map(async (file): Promise<Item | null> => {
        try {
          const version = await engine.run("open", {
            blob: file,
            name: file.name,
          });
          return { id: uid(), version };
        } catch (error) {
          failures.push({ name: file.name, message: messageOf(error) });
          return null;
        }
      }),
    );
    if (generation !== this.generation) return;
    this.reading -= images.length;
    // Added together once all are read, in the order they were chosen
    // (which is also the order Merge images follows).
    const added = opened.filter((item) => item !== null);
    if (added.length) this.items = [...this.items, ...added];
    if (failures.length) this.failures = [...this.failures, ...failures];
  }

  remove(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
  }

  /** Remove every image and result. */
  clear(): void {
    this.cancel();
    this.generation += 1;
    this.items = [];
    this.selectedIndex = 0;
    this.reading = 0;
    this.failures = [];
    this.clearResults();
  }

  dismissFailures(): void {
    this.failures = [];
  }

  // --- tools -----------------------------------------------------------------

  openTool(opId: string): void {
    this.cancel();
    this.tool = { op: opId, params: defaults(getOp(opId).params) };
    this.picking = null;
    this.estimating?.abort();
    this.estimate = null;
    this.clearResults();
    if (opId === "remove-background") void this.detectBackground();
  }

  /**
   * Work out the file the open tool will write for the picked image, on the
   * full-size image (so it's exact), once the settings rest for a moment.
   */
  async updateEstimate(): Promise<void> {
    this.estimating?.abort();
    const tool = this.tool;
    const item = this.selected;
    if (!tool || !item) {
      this.estimate = null;
      return;
    }
    const controller = new AbortController();
    this.estimating = controller;
    if (this.estimate) this.estimate = { ...this.estimate, pending: true };
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (controller.signal.aborted) return;
    try {
      const action = $state.snapshot(tool);
      const [version] = await engine.estimate(
        { inputs: [item.version], action },
        controller.signal,
      );
      const file = version.file;
      if (!file) {
        this.estimate = null;
        return;
      }
      // A PNG fits a file size by shrinking: how much is in the file.
      let shrink = 1;
      if (file.quality === null && file.blob.type === "image/png") {
        const bitmap = await createImageBitmap(file.blob);
        shrink = bitmap.width / version.width;
        bitmap.close();
      }
      if (controller.signal.aborted) return;
      this.estimate = {
        bytes: file.blob.size,
        quality: file.quality ?? null,
        shrink,
        name: item.version.name,
        pending: false,
      };
    } catch {
      if (!controller.signal.aborted) this.estimate = null;
    }
  }

  /**
   * Set Remove background's color to the picked image's background. Unless
   * the color was changed meanwhile: the user's choice wins.
   */
  async detectBackground(): Promise<void> {
    const tool = this.tool;
    const version = this.selected?.version;
    if (!tool || !version) return;
    const before = tool.params.color;
    try {
      const color = await engine.run("background", { version });
      if (this.tool === tool && tool.params.color === before)
        tool.params.color = color;
    } catch {
      // Not detected: the color stays as it was.
    }
  }

  closeTool(): void {
    this.cancel();
    this.tool = null;
    this.picking = null;
    this.clearResults();
  }

  setParam(key: string, value: unknown): void {
    if (this.tool) this.tool.params[key] = value;
  }

  /**
   * Run the open tool on every image (on all together for a merge). The
   * engine runs as many images at once as it has workers, except slow tools
   * (OCR), which go one at a time.
   */
  async apply(): Promise<void> {
    const op = this.op;
    const items = this.items;
    if (!op || !this.tool || this.running || items.length === 0) return;
    const action = $state.snapshot(this.tool);
    const jobs = op.kind === "combine" ? [items] : items.map((item) => [item]);
    const controller = new AbortController();
    const { signal } = controller;

    this.clearResults();
    this.ranWith = this.signature;
    this.controller = controller;
    this.running = true;
    this.progress = { done: 0, total: jobs.length, parts: {} };
    this.failures = [];
    // Results keep the order of the images, whichever finishes first.
    const made: Item[][] = [];
    const outputs: { id: string; output: Output }[] = [];
    const failures: Failure[] = [];

    const runJob = async (index: number) => {
      const job = jobs[index];
      const report = (fraction: number) => {
        if (!signal.aborted) this.progress.parts[index] = fraction;
      };
      try {
        if (op.kind === "final") {
          const input = job[0].version;
          const output = await engine.run(
            "finish",
            { input, action },
            signal,
            report,
          );
          outputs[index] = { id: uid(), output };
        } else {
          const inputs = job.map((item) => item.version);
          const versions = await engine.run(
            "apply",
            { inputs, action },
            signal,
            report,
          );
          made[index] = versions.map((version) => ({ id: uid(), version }));
        }
      } catch (error) {
        if (error instanceof Cancelled) return;
        const name =
          job.length === 1 ? job[0].version.name : `${job.length} images`;
        failures.push({ name, message: messageOf(error) });
      }
      // After a cancel, the state belongs to whatever came next.
      if (signal.aborted) return;
      this.results = made.flat();
      this.outputs = outputs.filter(Boolean);
      this.failures = [...failures];
      delete this.progress.parts[index];
      this.progress.done += 1;
    };

    let next = 0;
    const lane = async () => {
      while (next < jobs.length && !signal.aborted) await runJob(next++);
    };
    const lanes = op.heavy ? 1 : jobs.length;
    await Promise.all(Array.from({ length: lanes }, lane));
    if (this.controller === controller) {
      this.controller = null;
      this.running = false;
    }
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.running = false;
  }

  clearResults(): void {
    this.results = [];
    this.outputs = [];
    this.ranWith = null;
    this.saved.clear();
    this.sharing = "idle";
  }

  /** Make the results the images, for another tool (the caller goes back to the tools). */
  useResults(): void {
    if (this.results.length === 0 || this.running) return;
    this.items = this.results;
    this.selectedIndex = 0;
    this.clearResults();
  }

  // --- saving ----------------------------------------------------------------

  /** Download images: one file, or a ZIP when there are several. */
  async download(items: Item[]): Promise<void> {
    if (items.length === 0 || this.saving) return;
    this.saving = true;
    try {
      const saved = await this.save(items);
      if (saved.length === 1) downloadBlob(saved[0].blob, saved[0].name);
      else await downloadZip(saved, "imagelab.zip");
    } catch (error) {
      this.failures = [
        ...this.failures,
        { name: "Download", message: messageOf(error) },
      ];
    } finally {
      this.saving = false;
    }
  }

  /** Open the share sheet with the images' files. */
  async share(items: Item[]): Promise<void> {
    if (items.length === 0 || this.sharing === "saving") return;
    const ready = items.every((item) => this.saved.has(item.id));
    let saved: Saved[];
    try {
      if (!ready) this.sharing = "saving";
      saved = await this.save(items);
    } catch (error) {
      this.sharing = "idle";
      this.failures = [
        ...this.failures,
        { name: "Share", message: messageOf(error) },
      ];
      return;
    }
    const names = uniqueNames(saved.map((file) => file.name));
    const files = saved.map(
      ({ blob }, i) => new File([blob], names[i], { type: blob.type }),
    );
    try {
      await shareFiles(files);
      this.sharing = "idle";
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      // Saving took too long for the tap to count: the next one will do.
      if (name === "NotAllowedError" && !ready) this.sharing = "ready";
      else {
        this.sharing = "idle";
        if (name !== "AbortError")
          this.failures = [
            ...this.failures,
            { name: "Share", message: messageOf(error) },
          ];
      }
    }
  }

  /** The images' files, saved once each. */
  private save(items: Item[]): Promise<Saved[]> {
    return Promise.all(
      items.map(async (item) => {
        const known = this.saved.get(item.id);
        if (known) return known;
        const saved = await engine.run("save", { version: item.version });
        this.saved.set(item.id, saved);
        return saved;
      }),
    );
  }
}

export const session = new Session();
