import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ImageOutput } from '../../core/models/image-output.model';
import { ImagePipelineService } from '../../core/services/image-pipeline.service';
import {
  ImageProcessingService,
  RenderTransform,
} from '../../core/services/image-processing.service';
import { ToolRegistryService } from '../../core/services/tool-registry.service';
import { FileDropzoneComponent } from '../../shared/file-dropzone/file-dropzone.component';
import { OutputListComponent } from '../../shared/output-list/output-list.component';
import { outputFormatForFile, renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-rotate-tool',
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

        <div class="field">
          <label for="rotateDegrees">Rotation</label>
          <select id="rotateDegrees" formControlName="rotateDegrees">
            <option [value]="0">0 degrees</option>
            <option [value]="90">90 degrees</option>
            <option [value]="180">180 degrees</option>
            <option [value]="270">270 degrees</option>
          </select>
        </div>

        <label class="check-row">
          <input type="checkbox" formControlName="flipHorizontal" />
          Mirror horizontal
        </label>

        <label class="check-row">
          <input type="checkbox" formControlName="flipVertical" />
          Flip vertical
        </label>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button class="button" type="submit" [disabled]="!canProcess()">
          {{ isProcessing() ? 'Processing...' : 'Transform images' }}
        </button>
      </form>
    </div>

    <app-output-list [outputs]="outputs()" [currentToolId]="tool.id" />
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RotateComponent implements OnInit, OnDestroy {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly pipeline = inject(ImagePipelineService);
  private readonly processing = inject(ImageProcessingService);
  private readonly registry = inject(ToolRegistryService);

  protected readonly tool = this.registry.findById('rotate')!;
  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly outputs = signal<ImageOutput[]>([]);
  protected readonly isProcessing = signal(false);
  protected readonly error = signal('');
  protected readonly canProcess = computed(
    () => this.selectedFiles().length > 0 && this.form.valid && !this.isProcessing(),
  );

  protected readonly form = this.fb.group({
    rotateDegrees: [90],
    flipHorizontal: [false],
    flipVertical: [false],
  });

  ngOnInit(): void {
    const files = this.pipeline.consume(this.tool.id, this.tool.acceptedTypes);

    if (files.length > 0) {
      this.setFiles(files);
    }
  }

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
      const transform: RenderTransform = {
        rotateDegrees: coerceRotation(value.rotateDegrees),
        flipHorizontal: value.flipHorizontal,
        flipVertical: value.flipVertical,
      };
      const nextOutputs: ImageOutput[] = [];

      for (const file of this.selectedFiles()) {
        const dimensions = await this.processing.getDimensions(file);
        const format = outputFormatForFile(file);
        nextOutputs.push(
          await this.processing.renderToBlob(file, {
            ...dimensions,
            quality: 1,
            format,
            transform,
            fileName: renameFile(file.name, 'transformed', format),
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

function coerceRotation(value: number): 0 | 90 | 180 | 270 {
  return value === 0 || value === 90 || value === 180 || value === 270 ? value : 0;
}
