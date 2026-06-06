import { Directive, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';

import { ImageOutput } from '../../core/models/image-output.model';
import { ImageToolDefinition } from '../../core/models/image-tool.model';
import { ImagePipelineService } from '../../core/services/image-pipeline.service';
import { ImageProcessingService } from '../../core/services/image-processing.service';
import { ToolRegistryService } from '../../core/services/tool-registry.service';

/**
 * Shared state, lifecycle, and batch loop for every image tool.
 *
 * A concrete tool only needs to declare its `toolId` and implement
 * `processFile`. Optional hooks (`isFormValid`, `onFilesSelected`,
 * `errorMessage`) cover the few places tools differ.
 */
@Directive()
export abstract class BaseToolComponent implements OnInit, OnDestroy {
  protected readonly processing = inject(ImageProcessingService);
  private readonly pipeline = inject(ImagePipelineService);
  private readonly registry = inject(ToolRegistryService);

  /** Registry id of the tool, e.g. `'resize'`. */
  protected abstract readonly toolId: string;

  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly outputs = signal<ImageOutput[]>([]);
  protected readonly isProcessing = signal(false);
  protected readonly error = signal('');
  protected readonly canProcess = computed(
    () => this.selectedFiles().length > 0 && !this.isProcessing() && this.isFormValid(),
  );

  private cachedTool?: ImageToolDefinition;
  protected get tool(): ImageToolDefinition {
    return (this.cachedTool ??= this.registry.findById(this.toolId)!);
  }

  ngOnInit(): void {
    const files = this.pipeline.consume(this.tool.id, this.tool.acceptedTypes);

    if (files.length > 0) {
      void this.setFiles(files);
    }
  }

  protected async setFiles(files: File[]): Promise<void> {
    this.replaceOutputs([]);
    this.error.set('');
    this.selectedFiles.set(files);

    if (files.length > 0) {
      await this.onFilesSelected(files);
    }
  }

  protected async process(): Promise<void> {
    if (!this.canProcess()) {
      return;
    }

    this.isProcessing.set(true);
    this.error.set('');
    this.replaceOutputs([]);

    try {
      const nextOutputs: ImageOutput[] = [];

      for (const file of this.selectedFiles()) {
        nextOutputs.push(await this.processFile(file));
      }

      this.outputs.set(nextOutputs);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.errorMessage);
    } finally {
      this.isProcessing.set(false);
    }
  }

  ngOnDestroy(): void {
    this.processing.revoke(this.outputs());
  }

  private replaceOutputs(outputs: ImageOutput[]): void {
    this.processing.revoke(this.outputs());
    this.outputs.set(outputs);
  }

  /** Produce one output for a single input file. */
  protected abstract processFile(file: File): Promise<ImageOutput>;

  /** Whether the settings form (if any) is valid. Override when a form exists. */
  protected isFormValid(): boolean {
    return true;
  }

  /** Hook to react to a new selection, e.g. to prefill the form. */
  protected onFilesSelected(_files: File[]): void | Promise<void> {}

  /** Fallback error message when processing throws a non-Error value. */
  protected get errorMessage(): string {
    return 'The images could not be processed.';
  }
}
