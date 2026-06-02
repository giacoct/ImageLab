import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
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
import { renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-remove-background-tool',
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
          <label for="keyColor">Key color</label>
          <input id="keyColor" type="color" formControlName="keyColor" />
        </div>

        <div class="field">
          <label for="tolerance">Tolerance: {{ form.controls.tolerance.value }}%</label>
          <input
            id="tolerance"
            type="range"
            min="1"
            max="100"
            step="1"
            formControlName="tolerance"
          />
        </div>

        <div class="field">
          <label for="edgeSmoothing"
            >Edge smoothing: {{ form.controls.edgeSmoothing.value }}%</label
          >
          <input
            id="edgeSmoothing"
            type="range"
            min="0"
            max="100"
            step="1"
            formControlName="edgeSmoothing"
          />
        </div>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button class="button" type="submit" [disabled]="!canProcess()">
          {{ isProcessing() ? 'Processing...' : 'Remove background' }}
        </button>
      </form>
    </div>

    <app-output-list [outputs]="outputs()" [currentToolId]="tool.id" />
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoveBackgroundComponent implements OnInit, OnDestroy {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly pipeline = inject(ImagePipelineService);
  private readonly processing = inject(ImageProcessingService);
  private readonly registry = inject(ToolRegistryService);

  protected readonly tool = this.registry.findById('remove-background')!;
  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly outputs = signal<ImageOutput[]>([]);
  protected readonly isProcessing = signal(false);
  protected readonly error = signal('');
  protected readonly canProcess = computed(
    () => this.selectedFiles().length > 0 && this.form.valid && !this.isProcessing(),
  );

  protected readonly form = this.fb.group({
    keyColor: ['#ffffff', [Validators.required]],
    tolerance: [18, [Validators.required, Validators.min(1), Validators.max(100)]],
    edgeSmoothing: [8, [Validators.required, Validators.min(0), Validators.max(100)]],
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
      const nextOutputs: ImageOutput[] = [];

      for (const file of this.selectedFiles()) {
        nextOutputs.push(
          await this.processing.renderBackgroundRemoved(file, {
            color: value.keyColor,
            tolerance: value.tolerance,
            edgeSmoothing: value.edgeSmoothing,
            fileName: renameFile(file.name, 'transparent', 'image/png'),
          }),
        );
      }

      this.outputs.set(nextOutputs);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'The background could not be removed.',
      );
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
