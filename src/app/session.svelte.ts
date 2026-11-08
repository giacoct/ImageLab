/**
 * The workspace state: the imported files, the chain being edited, and the
 * results of the last run. It lives outside the components so files survive
 * moving between tools (drop photos once, try several tools), and a running
 * batch keeps going while the user looks around.
 */

import { isImageFile } from '../core/files';
import type { Step } from '../core/recipe';
import { Cancelled, engine } from '../engine/client';
import type { Inspection, Output } from '../engine/pipeline';
import { OPS, getOp } from '../ops';
import { isTerminal, type Op } from '../ops/op';
import { newStep } from './recipes.svelte';

export interface Item {
  id: string;
  file: File;
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

const CHAINABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

let nextId = 0;
const uid = () => `f${++nextId}`;

class Session {
  items = $state<Item[]>([]);
  selected = $state(0);
  steps = $state<Step[]>([]);

  results = $state<Result[]>([]);
  failures = $state<Failure[]>([]);
  running = $state(false);
  progress = $state({ done: 0, total: 0 });
  /** What the results were produced from, to tell when they are out of date. */
  private ranWith = $state<string | null>(null);
  private controller: AbortController | null = null;

  readonly selectedItem = $derived(this.items[Math.min(this.selected, this.items.length - 1)]);
  readonly ops = $derived(this.steps.map((step) => getOp(step.op)));
  /** The SVG or text step that ends the recipe, if any. */
  readonly terminal = $derived(this.ops.find(isTerminal));
  readonly merges = $derived(this.ops.some((op) => op.kind === 'combine'));
  /** Results that can feed another tool (not SVG, ICO or text). */
  readonly chainable = $derived(
    this.results.filter((result) => CHAINABLE.has(result.output.blob.type)),
  );
  readonly signature = $derived(JSON.stringify([this.items.map((item) => item.id), this.steps]));
  readonly stale = $derived(this.ranWith !== null && this.ranWith !== this.signature);

  /** Why the chain can't run yet, or null. */
  readonly blocker = $derived.by(() => {
    if (this.steps.length === 0) return 'Add a step to start.';
    const usable = this.items.filter((item) => !item.error).length;
    if (usable === 0) return 'Add images to start.';
    const combine = this.ops.find((op) => op.kind === 'combine');
    if (combine?.kind === 'combine' && usable < combine.minInputs) {
      return `${combine.title} needs at least ${combine.minInputs} images.`;
    }
    return null;
  });

  /** Load a chain into the workspace (files stay; old results go). */
  open(steps: Step[]): void {
    this.cancel();
    this.steps = steps;
    this.clearResults();
  }

  // --- files ---------------------------------------------------------------

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
      found = { error: error instanceof Error ? error.message : String(error) };
    }
    // The file may have been removed meanwhile.
    const item = this.items.find((candidate) => candidate.id === id);
    if (item) Object.assign(item, found);
  }

  removeItem(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
    this.selected = Math.min(this.selected, Math.max(0, this.items.length - 1));
  }

  moveItem(from: number, to: number): void {
    if (to < 0 || to >= this.items.length || from === to) return;
    const [item] = this.items.splice(from, 1);
    this.items.splice(to, 0, item);
    if (this.selected === from) this.selected = to;
  }

  clearFiles(): void {
    this.cancel();
    this.items = [];
    this.selected = 0;
    this.clearResults();
  }

  /**
   * A problem the first step reports for the file before running (e.g. too
   * large to upscale). Later steps can't tell: their input size is only known
   * once the steps before them have run.
   */
  warning(item: Item): string | null {
    const op = this.ops[0];
    if (!item.info || !op?.check) return null;
    return op.check(item.info, this.steps[0].params as never);
  }

  // --- steps -----------------------------------------------------------------

  addStep(opId: string): void {
    const op = getOp(opId);
    const step = newStep(opId);
    // Terminal steps go last; anything else goes before an existing terminal step.
    const terminalAt = this.ops.findIndex(isTerminal);
    if (isTerminal(op) || terminalAt === -1) this.steps.push(step);
    else this.steps.splice(terminalAt, 0, step);
  }

  removeStep(index: number): void {
    this.steps.splice(index, 1);
  }

  moveStep(index: number, delta: number): void {
    const to = index + delta;
    if (to < 0 || to >= this.steps.length) return;
    if (isTerminal(this.ops[index]) || isTerminal(this.ops[to])) return; // terminal stays last
    const [step] = this.steps.splice(index, 1);
    this.steps.splice(to, 0, step);
  }

  /**
   * Tools that can be added: any number of each, except that a chain ends
   * with at most one SVG or text step, and merges at most once.
   */
  availableOps(): Op[] {
    return OPS.filter(
      (op) => !(isTerminal(op) && this.terminal) && !(op.kind === 'combine' && this.merges),
    );
  }

  setParam(index: number, key: string, value: unknown): void {
    this.steps[index].params[key] = value;
  }

  // --- running -----------------------------------------------------------------

  async run(): Promise<void> {
    if (this.running || this.blocker) return;
    const items = this.items.filter((item) => !item.error);
    const steps = $state.snapshot(this.steps);
    const jobs = this.merges ? [items] : items.map((item) => [item]);
    const concurrency = this.ops.some((op) => op.heavy) ? 1 : engine.poolSize;

    this.clearResults();
    this.ranWith = this.signature;
    this.running = true;
    this.progress = { done: 0, total: jobs.length };
    const controller = new AbortController();
    this.controller = controller;
    const slots: (Result[] | undefined)[] = [];
    const failures: Failure[] = [];

    let next = 0;
    const worker = async () => {
      while (next < jobs.length && !controller.signal.aborted) {
        const index = next++;
        const job = jobs[index];
        try {
          const outputs = await engine.run(
            'process',
            { inputs: job.map((item) => ({ name: item.file.name, blob: item.file })), steps },
            controller.signal,
          );
          const inputSize = job.reduce((sum, item) => sum + item.file.size, 0);
          slots[index] = outputs.map((output) => ({ id: uid(), output, inputSize }));
        } catch (error) {
          if (error instanceof Cancelled) return;
          failures.push({
            name: job.length === 1 ? job[0].file.name : `${job.length} images`,
            message: error instanceof Error ? error.message : String(error),
          });
          this.failures = [...failures];
        }
        if (controller.signal.aborted) return;
        this.progress.done += 1;
        this.results = slots.flatMap((slot) => slot ?? []);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
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

  renameResult(id: string, name: string): void {
    const result = this.results.find((candidate) => candidate.id === id);
    if (result && name.trim()) result.output.name = name.trim();
  }

  /** Raster results become the input files, to carry on with other tools. */
  useResultsAsInput(): void {
    const files = this.chainable.map(
      ({ output }) => new File([output.blob], output.name, { type: output.blob.type }),
    );
    this.clearFiles();
    this.addFiles(files);
  }
}

export const session = new Session();
