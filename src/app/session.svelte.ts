/**
 * The workspace state: the imported files, the recipe being edited, and the
 * results of the last run. It lives outside the components so files survive
 * moving between tools (drop photos once, try several tools), and a running
 * batch keeps going while the user looks around.
 */

import { isImageFile } from '../core/files';
import { applyContext, sanitize, type AnyValues } from '../core/params';
import { EXPORT_PARAMS, exportContext, type ExportSettings, type Step } from '../core/recipe';
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

/** Results that can feed another tool (not SVG, ICO or text). */
const CHAINABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

let nextId = 0;
const uid = () => `f${++nextId}`;

class Session {
  items = $state<Item[]>([]);
  selected = $state(0);
  steps = $state<Step[]>([]);
  exportSettings = $state<ExportSettings>(sanitize(EXPORT_PARAMS, {}, exportContext([])));
  /** Output file name suffix of the current tool. */
  suffix = $state<string | undefined>(undefined);

  results = $state<Result[]>([]);
  failures = $state<Failure[]>([]);
  running = $state(false);
  progress = $state({ done: 0, total: 0 });
  /** What the results were produced from, to tell when they are out of date. */
  private ranWith = $state<string | null>(null);
  private controller: AbortController | null = null;

  readonly selectedItem = $derived(this.items[Math.min(this.selected, this.items.length - 1)]);
  readonly ops = $derived(this.steps.map((step) => getOp(step.op)));
  readonly terminal = $derived(this.ops.some(isTerminal));
  readonly merges = $derived(this.ops.some((op) => op.kind === 'combine'));
  readonly signature = $derived(
    JSON.stringify([this.items.map((item) => item.id), this.steps, this.exportSettings]),
  );
  readonly stale = $derived(this.ranWith !== null && this.ranWith !== this.signature);

  /** Why the recipe can't run yet, or null. */
  readonly blocker = $derived.by(() => {
    const usable = this.items.filter((item) => !item.error).length;
    if (usable === 0) return 'Add images to start.';
    const combine = this.ops.find((op) => op.kind === 'combine');
    if (combine?.kind === 'combine' && usable < combine.minInputs) {
      return `${combine.title} needs at least ${combine.minInputs} images.`;
    }
    return null;
  });

  /** Load a recipe into the workspace (files stay; old results go). */
  open(steps: Step[], settings: ExportSettings, suffix?: string): void {
    this.cancel();
    this.steps = steps;
    this.exportSettings = settings;
    this.suffix = suffix;
    this.clearResults();
  }

  // --- files ---------------------------------------------------------------

  addFiles(files: Iterable<File>): void {
    const added: Item[] = [];
    for (const file of files) {
      if (!isImageFile(file)) continue;
      added.push({ id: uid(), file });
    }
    if (added.length === 0) return;
    this.items.push(...added);
    for (const item of added) void this.inspect(item.id);
  }

  private async inspect(id: string): Promise<void> {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) return;
    try {
      const info = await engine.run('inspect', { blob: item.file });
      const current = this.items.find((candidate) => candidate.id === id);
      if (current) current.info = info;
    } catch (error) {
      const current = this.items.find((candidate) => candidate.id === id);
      if (current) current.error = error instanceof Error ? error.message : String(error);
    }
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

  /** Problems an operation reports for an item before running (e.g. too large to upscale). */
  warnings(item: Item): string[] {
    if (!item.info) return [];
    // Sizes are only known before any step changes them, so check up to the first change.
    const messages: string[] = [];
    for (const [index, op] of this.ops.entries()) {
      const problem = op.check?.(item.info, this.steps[index].params as never);
      if (problem) messages.push(problem);
      break;
    }
    return messages;
  }

  // --- steps -----------------------------------------------------------------

  addStep(opId: string): void {
    const op = getOp(opId);
    const step = newStep(opId);
    // Terminal steps go last; anything else goes before an existing terminal step.
    const terminalAt = this.ops.findIndex(isTerminal);
    if (isTerminal(op) || terminalAt === -1) this.steps.push(step);
    else this.steps.splice(terminalAt, 0, step);
    this.syncExport();
  }

  removeStep(index: number): void {
    this.steps.splice(index, 1);
    this.syncExport();
  }

  moveStep(index: number, delta: number): void {
    const to = index + delta;
    if (to < 0 || to >= this.steps.length) return;
    if (isTerminal(this.ops[index]) || isTerminal(this.ops[to])) return; // terminal stays last
    const [step] = this.steps.splice(index, 1);
    this.steps.splice(to, 0, step);
  }

  /** Operations that can be added: terminal ones only while there's none yet, one merge at most. */
  availableOps(): Op[] {
    return OPS.filter(
      (op) => !(isTerminal(op) && this.terminal) && !(op.kind === 'combine' && this.merges),
    );
  }

  setParam(index: number, key: string, value: unknown): void {
    this.steps[index].params[key] = value;
  }

  setExport(key: string, value: unknown): void {
    (this.exportSettings as AnyValues as Record<string, unknown>)[key] = value;
  }

  /** "Original file" export only makes sense without steps. */
  private syncExport(): void {
    this.exportSettings = applyContext(
      EXPORT_PARAMS,
      this.exportSettings,
      exportContext(this.steps),
    );
  }

  // --- running -----------------------------------------------------------------

  async run(): Promise<void> {
    if (this.running || this.blocker) return;
    const items = this.items.filter((item) => !item.error);
    const recipe = {
      steps: $state.snapshot(this.steps),
      export: $state.snapshot(this.exportSettings),
      suffix: this.suffix,
    };
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
            { inputs: job.map((item) => ({ name: item.file.name, blob: item.file })), recipe },
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

  /** Raster results become the input files for the next tool. */
  useResultsAsInput(): void {
    const files = this.results
      .filter((result) => CHAINABLE.has(result.output.blob.type))
      .map(
        (result) =>
          new File([result.output.blob], result.output.name, { type: result.output.blob.type }),
      );
    this.clearFiles();
    this.addFiles(files);
  }
}

export const session = new Session();
