import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ImageOutput } from '../../core/models/image-output.model';
import { BaseToolComponent } from '../shared/base-tool.component';
import { ToolShellComponent } from '../shared/tool-shell.component';
import { renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-remove-background-tool',
  imports: [ToolShellComponent, ReactiveFormsModule],
  template: `
    <app-tool-shell
      [tool]="tool"
      [selectedFiles]="selectedFiles()"
      [outputs]="outputs()"
      [isProcessing]="isProcessing()"
      [error]="error()"
      [canProcess]="canProcess()"
      actionLabel="Remove background"
      (filesSelected)="setFiles($event)"
      (process)="process()"
    >
      <div class="tool-fields" [formGroup]="form">
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
      </div>
    </app-tool-shell>
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoveBackgroundComponent extends BaseToolComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'remove-background';
  protected readonly form = this.fb.group({
    keyColor: ['#ffffff', [Validators.required]],
    tolerance: [18, [Validators.required, Validators.min(1), Validators.max(100)]],
    edgeSmoothing: [8, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  protected override get errorMessage(): string {
    return 'The background could not be removed.';
  }

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override processFile(file: File): Promise<ImageOutput> {
    const value = this.form.getRawValue();

    return this.processing.renderBackgroundRemoved(file, {
      color: value.keyColor,
      tolerance: value.tolerance,
      edgeSmoothing: value.edgeSmoothing,
      fileName: renameFile(file.name, 'transparent', 'image/png'),
    });
  }
}
