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
import type { Op, Step } from '../ops/op';

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
  /** Size of the input file(s), to show how much the output grew or shrank. */
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
  readonly ops = $derived(this.steps.map((step) => getOp(step.op)));
  /** Whether a step combines all the images into one. */
  readonly merges = $derived(this.ops.some((op) => op.kind === 'combine'));
  /** The OCR or SVG step that ends the chain, if any. */
  readonly final = $derived(this.ops.find((op) => op.kind === 'final'));
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

  /** Whether `op` can be added: a chain ends with at most one OCR or SVG step. */
  canAdd(op: Op): boolean {
    return op.kind !== 'final' || !this.final;
  }

  /** Add a step at the end, or just before the OCR or SVG step that must stay last. */
  addStep(opId: string): void {
    const op = getOp(opId);
    if (!this.canAdd(op)) return;
    const step = { id: uid(), op: opId, params: defaults(op.params) };
    const at = op.kind === 'final' || !this.final ? this.steps.length : this.steps.length - 1;
    this.steps.splice(at, 0, step);
  }

  removeStep(index: number): void {
    this.steps.splice(index, 1);
  }

  /** Whether the step at `index` can move by `delta`; the final step stays last. */
  canMove(index: number, delta: number): boolean {
    const to = index + delta;
    if (to < 0 || to >= this.steps.length) return false;
    return this.ops[index].kind !== 'final' && this.ops[to].kind !== 'final';
  }

  moveStep(index: number, delta: number): void {
    if (!this.canMove(index, delta)) return;
    const [step] = this.steps.splice(index, 1);
    this.steps.splice(index + delta, 0, step);
  }

  setParam(index: number, key: string, value: unknown): void {
    this.steps[index].params[key] = value;
  }

  // --- running -----------------------------------------------------------------

  /**
   * Process the images: each on its own, or all together when the chain
   * merges. The engine runs as many jobs at once as it has workers, except
   * slow steps (OCR), which go one at a time.
   */
  async run(): Promise<void> {
    if (this.running || this.blocker) return;
    const items = this.usable;
    const jobs = this.merges ? [items] : items.map((item) => [item]);
    const steps = $state.snapshot(this.steps);
    const parallel = this.ops.some((op) => op.heavy) ? 1 : jobs.length;
    const controller = new AbortController();

    this.clearResults();
    this.ranWith = this.signature;
    this.running = true;
    this.progress = { done: 0, total: jobs.length };
    this.controller = controller;
    // Results keep the order of the images, whichever finishes first.
    const slots: Result[][] = [];

    const runJob = async (index: number) => {
      const job = jobs[index];
      let failure: Failure | undefined;
      try {
        const inputs = job.map((item) => ({ name: item.file.name, blob: item.file }));
        const outputs = await engine.run('process', { inputs, steps }, controller.signal);
        const inputSize = job.reduce((sum, item) => sum + item.file.size, 0);
        slots[index] = outputs.map((output) => ({ id: uid(), output, inputSize }));
      } catch (error) {
        if (error instanceof Cancelled) return;
        const name = job.length === 1 ? job[0].file.name : `${job.length} images`;
        failure = { name, message: messageOf(error) };
      }
      // After a cancel, the state belongs to whatever came next.
      if (controller.signal.aborted) return;
      if (failure) this.failures.push(failure);
      this.results = slots.flat();
      this.progress.done += 1;
    };

    let next = 0;
    const lane = async () => {
      while (next < jobs.length && !controller.signal.aborted) await runJob(next++);
    };
    await Promise.all(Array.from({ length: parallel }, lane));

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
