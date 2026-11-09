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

import { isImageFile } from '../core/files';
import { defaults } from '../core/params';
import { Cancelled, engine } from '../engine/client';
import type { Output, Version } from '../engine/pipeline';
import { getOp } from '../ops';
import type { Action } from '../ops/op';
import { downloadBlob, downloadZip } from './download';

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
  progress = $state({ done: 0, total: 0 });
  saving = $state(false);

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
          const version = await engine.run('open', {
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
    this.clearResults();
  }

  closeTool(): void {
    this.cancel();
    this.tool = null;
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
    const jobs = op.kind === 'combine' ? [items] : items.map((item) => [item]);
    const controller = new AbortController();
    const { signal } = controller;

    this.clearResults();
    this.ranWith = this.signature;
    this.controller = controller;
    this.running = true;
    this.progress = { done: 0, total: jobs.length };
    this.failures = [];
    // Results keep the order of the images, whichever finishes first.
    const made: Item[][] = [];
    const outputs: { id: string; output: Output }[] = [];
    const failures: Failure[] = [];

    const runJob = async (index: number) => {
      const job = jobs[index];
      try {
        if (op.kind === 'final') {
          const input = job[0].version;
          const output = await engine.run('finish', { input, action }, signal);
          outputs[index] = { id: uid(), output };
        } else {
          const inputs = job.map((item) => item.version);
          const versions = await engine.run(
            'apply',
            { inputs, action },
            signal,
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
  }

  /** Make the results the images, for another tool. */
  useResults(): void {
    if (this.results.length === 0 || this.running) return;
    this.items = this.results;
    this.selectedIndex = 0;
    this.tool = null;
    this.clearResults();
  }

  // --- saving ----------------------------------------------------------------

  /** Download images: one file, or a ZIP when there are several. */
  async download(items: Item[]): Promise<void> {
    if (items.length === 0 || this.saving) return;
    this.saving = true;
    try {
      const saved = await Promise.all(
        items.map((item) => engine.run('save', { version: item.version })),
      );
      if (saved.length === 1) downloadBlob(saved[0].blob, saved[0].name);
      else await downloadZip(saved, 'imagelab.zip');
    } catch (error) {
      this.failures = [
        ...this.failures,
        { name: 'Download', message: messageOf(error) },
      ];
    } finally {
      this.saving = false;
    }
  }
}

export const session = new Session();
