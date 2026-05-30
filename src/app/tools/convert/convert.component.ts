import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ImageOutput, OutputFormat } from '../../core/models/image-output.model';
import { ImageProcessingService } from '../../core/services/image-processing.service';
import { ToolRegistryService } from '../../core/services/tool-registry.service';
import { FileDropzoneComponent } from '../../shared/file-dropzone/file-dropzone.component';
import { OutputListComponent } from '../../shared/output-list/output-list.component';
import { clampQuality, renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-convert-tool',
  imports: [FileDropzoneComponent, OutputListComponent, ReactiveFormsModule, RouterLink],
  template: `
    <a class="back-link" routerLink="/">Back to tools</a>

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

        <div class="field">
          <label for="format">Output format</label>
          <select id="format" formControlName="format">
            <option value="image/jpeg">JPEG</option>
            <option value="image/png">PNG</option>
            <option value="image/webp">WebP</option>
          </select>
        </div>

        <div class="field">
          <label for="quality">Quality: {{ form.controls.quality.value }}%</label>
          <input id="quality" type="range" min="10" max="100" step="5" formControlName="quality" />
          <span class="field-hint">Quality applies to JPEG and WebP outputs.</span>
        </div>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button class="button" type="submit" [disabled]="!canProcess()">
          {{ isProcessing() ? 'Processing...' : 'Convert images' }}
        </button>
      </form>
    </div>

    <app-output-list [outputs]="outputs()" />
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConvertComponent implements OnDestroy {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly processing = inject(ImageProcessingService);
  private readonly registry = inject(ToolRegistryService);

  protected readonly tool = this.registry.findById('convert')!;
  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly outputs = signal<ImageOutput[]>([]);
  protected readonly isProcessing = signal(false);
  protected readonly error = signal('');
  protected readonly canProcess = computed(
    () => this.selectedFiles().length > 0 && this.form.valid && !this.isProcessing(),
  );

  protected readonly form = this.fb.group({
    format: this.fb.control<OutputFormat>('image/webp'),
    quality: [90, [Validators.required, Validators.min(10), Validators.max(100)]],
  });

  protected setFiles(files: File[]): void {
    this.replaceOutputs([]);
    this.error.set('');
    this.selectedFiles.set(files);
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
      const quality = clampQuality(value.quality);
      const nextOutputs: ImageOutput[] = [];

      for (const file of this.selectedFiles()) {
        const dimensions = await this.processing.getDimensions(file);
        nextOutputs.push(
          await this.processing.renderToBlob(file, {
            ...dimensions,
            quality,
            format: value.format,
            fileName: renameFile(file.name, 'converted', value.format),
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
