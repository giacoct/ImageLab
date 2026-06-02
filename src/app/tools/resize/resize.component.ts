import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ImageOutput } from '../../core/models/image-output.model';
import { ImagePipelineService } from '../../core/services/image-pipeline.service';
import { ImageProcessingService } from '../../core/services/image-processing.service';
import { ToolRegistryService } from '../../core/services/tool-registry.service';
import { FileDropzoneComponent } from '../../shared/file-dropzone/file-dropzone.component';
import { OutputListComponent } from '../../shared/output-list/output-list.component';
import { outputFormatForFile, renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-resize-tool',
  imports: [FileDropzoneComponent, OutputListComponent, ReactiveFormsModule, RouterLink],
  template: `
    <a class="back-link" routerLink="/"> « Back to tools</a>

    <section class="tool-header">
      <div>
        <p class="eyebrow">Tool</p>
        <h1>{{ tool.title }}</h1>
      </div>
      <p>{{ tool.description }}</p>
    </section>

    <div class="tool-workspace">
      <div class="input-column">
        <app-file-dropzone
          [acceptedTypes]="tool.acceptedTypes"
          [multiple]="true"
          (filesSelected)="setFiles($event)"
        />

        @if (selectedFiles().length > 0) {
          <section class="file-list panel" aria-label="Selected files">
            <h2>Selected files</h2>
            @for (file of selectedFiles(); track file.name + file.size) {
              <p>{{ file.name }}</p>
            }
          </section>
        }
      </div>

      <form class="settings panel" [formGroup]="form" (ngSubmit)="process()">
        <h2>Settings</h2>

        <div class="settings-grid">
          <div class="field">
            <label for="width">Width</label>
            <input id="width" type="number" min="1" formControlName="width" />
          </div>

          <div class="field">
            <label for="height">Height</label>
            <input id="height" type="number" min="1" formControlName="height" />
          </div>
        </div>

        <label class="check-row">
          <input type="checkbox" formControlName="preserveAspect" />
          Preserve aspect ratio from width
        </label>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button class="button" type="submit" [disabled]="!canProcess()">
          {{ isProcessing() ? 'Processing...' : 'Resize images' }}
        </button>
      </form>
    </div>

    <app-output-list [outputs]="outputs()" [currentToolId]="tool.id" />
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResizeComponent implements OnInit, OnDestroy {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly pipeline = inject(ImagePipelineService);
  private readonly processing = inject(ImageProcessingService);
  private readonly registry = inject(ToolRegistryService);

  protected readonly tool = this.registry.findById('resize')!;
  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly outputs = signal<ImageOutput[]>([]);
  protected readonly isProcessing = signal(false);
  protected readonly error = signal('');
  protected readonly canProcess = computed(
    () => this.selectedFiles().length > 0 && this.form.valid && !this.isProcessing(),
  );

  protected readonly form = this.fb.group({
    width: [1200, [Validators.required, Validators.min(1)]],
    height: [900, [Validators.required, Validators.min(1)]],
    preserveAspect: [true],
  });

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

    if (files.length === 0) {
      return;
    }

    try {
      const firstImage = await this.processing.getDimensions(files[0]);
      this.form.patchValue({
        width: firstImage.width,
        height: firstImage.height,
      });
    } catch {
      this.error.set('The selected image could not be read.');
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
      const value = this.form.getRawValue();
      const nextOutputs: ImageOutput[] = [];

      for (const file of this.selectedFiles()) {
        const original = await this.processing.getDimensions(file);
        const format = outputFormatForFile(file);
        const width = Math.max(1, Math.round(value.width));
        const height = value.preserveAspect
          ? Math.max(1, Math.round(width * (original.height / original.width)))
          : Math.max(1, Math.round(value.height));

        nextOutputs.push(
          await this.processing.renderToBlob(file, {
            width,
            height,
            quality: 1,
            format,
            fileName: renameFile(file.name, 'resized', format),
          }),
        );
      }

      this.outputs.set(nextOutputs);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The images could not be processed.');
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
}
