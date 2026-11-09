/**
 * The app state: the images and their history, the tool that's open, and
 * the results of a final tool (OCR, SVG). One shared instance, so a running
 * tool keeps going whatever the components do.
 *
 * Applying a tool replaces the images with its results as a new entry of the
 * history, so the results are what the next tool works on; undo and redo
 * move through the entries. Each entry holds its images as the engine left
 * them (`Version`: lossless pixels plus how they'll be saved).
 */

import { isImageFile } from '../core/files';
import { defaults } from '../core/params';
import { Cancelled, engine } from '../engine/client';
import type { Output, Version } from '../engine/pipeline';
import { getOp } from '../ops';
import type { Action } from '../ops/op';
import { downloadBlob, downloadZip } from './download';

/** One image of a history entry. */
export interface Item {
  /** Unique per version, so previews cache it and lists key it. */
  id: string;
  version: Version;
}

interface Entry {
  /** What made it, e.g. "Scale" or "Add 3 images". */
  label: string;
  items: Item[];
}

export interface Failure {
  name: string;
  message: string;
}

let nextId = 0;
const uid = () => `id${++nextId}`;

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const START: Entry = { label: 'Start', items: [] };

class Session {
  // Entries never change once made: raw state, replaced as a whole.
  private history = $state.raw<Entry[]>([START]);
  private at = $state(0);
  /** Bumped by "Start over", so files still being read are dropped. */
  private generation = 0;
  private controller: AbortController | null = null;

  /** The current images. */
  readonly items = $derived(this.history[this.at].items);
  /** Position of the image shown in the preview; kept across undo and tools. */
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
  /** What the last final tool (OCR, SVG) made. */
  outputs = $state.raw<{ id: string; output: Output }[]>([]);

  running = $state(false);
  progress = $state({ done: 0, total: 0 });
  saving = $state(false);

  /** The history, oldest first, and where we are in it. */
  readonly entries = $derived(this.history.map((entry) => entry.label));
  readonly position = $derived(this.at);
  readonly canUndo = $derived(!this.running && this.at > 0);
  readonly canRedo = $derived(
    !this.running && this.at < this.history.length - 1,
  );

  // --- history -----------------------------------------------------------------

  goTo(index: number): void {
    if (this.running) return;
    this.at = Math.max(0, Math.min(this.history.length - 1, index));
  }

  undo(): void {
    this.goTo(this.at - 1);
  }

  redo(): void {
    this.goTo(this.at + 1);
  }

  /** Add an entry after the current one, dropping what undo left to redo. */
  private commit(label: string, items: Item[]): void {
    this.history = [...this.history.slice(0, this.at + 1), { label, items }];
    this.at = this.history.length - 1;
  }

  // --- images ----------------------------------------------------------------

  async addFiles(files: Iterable<File>): Promise<void> {
    const images = [...files].filter(isImageFile);
    if (images.length === 0) return;
    const generation = this.generation;
    const failures: Failure[] = [];
    this.reading += images.length;
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
        } finally {
          if (generation === this.generation) this.reading -= 1;
        }
      }),
    );
    if (generation !== this.generation) return;
    const added = opened.filter((item) => item !== null);
    if (failures.length) this.failures = [...this.failures, ...failures];
    if (added.length === 0) return;
    const label =
      added.length === 1
        ? `Add ${added[0].version.name}`
        : `Add ${added.length} images`;
    this.commit(label, [...this.items, ...added]);
  }

  remove(id: string): void {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) return;
    this.commit(
      `Remove ${item.version.name}`,
      this.items.filter((other) => other !== item),
    );
  }

  /** Forget everything: images, history, results. */
  clear(): void {
    this.cancel();
    this.generation += 1;
    this.history = [START];
    this.at = 0;
    this.selectedIndex = 0;
    this.reading = 0;
    this.failures = [];
    this.outputs = [];
  }

  dismissFailures(): void {
    this.failures = [];
  }

  // --- tools -----------------------------------------------------------------

  openTool(opId: string): void {
    this.tool = { op: opId, params: defaults(getOp(opId).params) };
    this.outputs = [];
  }

  closeTool(): void {
    this.tool = null;
  }

  setParam(key: string, value: unknown): void {
    if (this.tool) this.tool.params[key] = value;
  }

  /**
   * Apply the open tool to every image (all together for a merge). The
   * results become a new history entry and the tool closes; a final tool
   * (OCR, SVG) leaves the images as they are and lists what it made. The
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

    this.controller = controller;
    this.running = true;
    this.progress = { done: 0, total: jobs.length };
    this.failures = [];
    this.outputs = [];
    // Keyed by each job's first image; outputs keep the order of the images.
    const made = new Map<string, Version[]>();
    const outputs: Output[] = [];
    const failures: Failure[] = [];

    const runJob = async (index: number) => {
      const job = jobs[index];
      try {
        if (op.kind === 'final') {
          const input = job[0].version;
          outputs[index] = await engine.run(
            'finish',
            { input, action },
            signal,
          );
        } else {
          const inputs = job.map((item) => item.version);
          made.set(
            job[0].id,
            await engine.run('apply', { inputs, action }, signal),
          );
        }
      } catch (error) {
        if (error instanceof Cancelled) return;
        const name =
          job.length === 1 ? job[0].version.name : `${job.length} images`;
        failures.push({ name, message: messageOf(error) });
      }
      if (!signal.aborted) this.progress.done += 1;
    };

    let next = 0;
    const lane = async () => {
      while (next < jobs.length && !signal.aborted) await runJob(next++);
    };
    const lanes = op.heavy ? 1 : jobs.length;
    await Promise.all(Array.from({ length: lanes }, lane));
    // After a cancel, the state belongs to whatever came next.
    if (signal.aborted) return;
    this.controller = null;
    this.running = false;
    this.failures = failures;

    if (op.kind === 'final') {
      this.outputs = outputs
        .filter(Boolean)
        .map((output) => ({ id: uid(), output }));
      return;
    }
    if (made.size === 0) return;
    // Built on the images as they are now: some may have been added or
    // removed while the tool ran. A merge replaces all its inputs.
    const used = new Set(jobs.flat().map((item) => item.id));
    const results: Item[] = [];
    for (const item of this.items) {
      const versions = made.get(item.id);
      if (versions) {
        results.push(...versions.map((version) => ({ id: uid(), version })));
      } else if (op.kind !== 'combine' || !used.has(item.id)) {
        results.push(item);
      }
    }
    this.commit(op.title, results);
    this.tool = null;
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.running = false;
  }

  // --- saving ----------------------------------------------------------------

  /** Download one image, or all of them (one ZIP when there are several). */
  async download(items: Item[] = this.items): Promise<void> {
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
