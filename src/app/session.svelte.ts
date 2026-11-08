/**
 * The app state: the loaded images, the chain of steps, and the results of
 * the last run. One shared instance, so a running batch keeps going whatever
 * the components do.
 */

import { isImageFile } from '../core/files';
import { defaults } from '../core/params';
import { Cancelled, engine } from '../engine/client';
import type { Inspection, Output } from '../engine/pipeline';
import { getOp } from '../ops';
import type { Step } from '../ops/op';

export interface Item {
  id: string;
  file: File;
  /** Set once the file has been read. */
  info?: Inspection;
  /** Why the file can't be opened (e.g. not an image). */
  error?: string;
}

export interface Result {
  id: string;
  output: Output;
  /** Size of the input file, to show how much the output grew or shrank. */
  inputSize: number;
}

export interface Failure {
  name: string;
  message: string;
}

let nextId = 0;
const uid = () => `id${++nextId}`;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

class Session {
  items = $state<Item[]>([]);
  selectedId = $state<string | null>(null);
  steps = $state<Step[]>([]);

  results = $state<Result[]>([]);
  failures = $state<Failure[]>([]);
  running = $state(false);
  progress = $state({ done: 0, total: 0 });
  /** What the results were produced from, to tell when they are out of date. */
  private ranWith = $state<string | null>(null);
  private controller: AbortController | null = null;

  /** The image shown in the preview. */
  readonly selected = $derived(
    this.items.find((item) => item.id === this.selectedId) ?? this.items[0],
  );
  readonly usable = $derived(this.items.filter((item) => !item.error));
  private readonly signature = $derived(
    JSON.stringify([this.items.map((item) => item.id), this.steps]),
  );
  readonly stale = $derived(this.ranWith !== null && this.ranWith !== this.signature);

  /** Why the chain can't run yet, or null. */
  readonly blocker = $derived(
    this.steps.length === 0
      ? 'Add a step to start.'
      : this.usable.length === 0
        ? 'Add images to start.'
        : null,
  );

  // --- images ----------------------------------------------------------------

  addFiles(files: Iterable<File>): void {
    for (const file of files) {
      if (!isImageFile(file)) continue;
      const id = uid();
      this.items.push({ id, file });
      void this.inspect(id, file);
    }
  }

  private async inspect(id: string, file: File): Promise<void> {
    let found: Pick<Item, 'info' | 'error'>;
    try {
      found = { info: await engine.run('inspect', { blob: file }) };
    } catch (error) {
      found = { error: messageOf(error) };
    }
    // The file may have been removed meanwhile.
    const item = this.items.find((candidate) => candidate.id === id);
    if (item) Object.assign(item, found);
  }

  removeItem(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
  }

  clearFiles(): void {
    this.cancel();
    this.items = [];
    this.clearResults();
  }

  // --- steps -----------------------------------------------------------------

  addStep(opId: string): void {
    this.steps.push({ id: uid(), op: opId, params: defaults(getOp(opId).params) });
  }

  removeStep(index: number): void {
    this.steps.splice(index, 1);
  }

  moveStep(index: number, delta: number): void {
    const to = index + delta;
    if (to < 0 || to >= this.steps.length) return;
    const [step] = this.steps.splice(index, 1);
    this.steps.splice(to, 0, step);
  }

  setParam(index: number, key: string, value: unknown): void {
    this.steps[index].params[key] = value;
  }

  // --- running -----------------------------------------------------------------

  /** Process every usable image; the engine runs as many at once as it has workers. */
  async run(): Promise<void> {
    if (this.running || this.blocker) return;
    const items = this.usable;
    const steps = $state.snapshot(this.steps);
    const controller = new AbortController();

    this.clearResults();
    this.ranWith = this.signature;
    this.running = true;
    this.progress = { done: 0, total: items.length };
    this.controller = controller;
    // Results keep the order of the images, whichever finishes first.
    const slots: (Result | undefined)[] = [];

    await Promise.all(
      items.map(async (item, index) => {
        let failure: Failure | undefined;
        try {
          const output = await engine.run(
            'process',
            { input: { name: item.file.name, blob: item.file }, steps },
            controller.signal,
          );
          slots[index] = { id: uid(), output, inputSize: item.file.size };
        } catch (error) {
          if (error instanceof Cancelled) return;
          failure = { name: item.file.name, message: messageOf(error) };
        }
        // After a cancel, the state belongs to whatever came next.
        if (controller.signal.aborted) return;
        if (failure) this.failures.push(failure);
        this.results = slots.filter((slot) => slot !== undefined);
        this.progress.done += 1;
      }),
    );

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
    this.failures = [];
    this.ranWith = null;
  }
}

export const session = new Session();
