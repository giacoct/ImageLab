import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { ImageOutput } from '../../core/models/image-output.model';
import { RenderTransform } from '../../core/services/image-processing.service';
import { BaseToolComponent } from '../shared/base-tool.component';
import { ToolShellComponent } from '../shared/tool-shell.component';
import { outputFormatForFile, renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-rotate-tool',
  imports: [ToolShellComponent, ReactiveFormsModule],
  template: `
    <app-tool-shell
      [tool]="tool"
      [selectedFiles]="selectedFiles()"
      [outputs]="outputs()"
      [isProcessing]="isProcessing()"
      [error]="error()"
      [canProcess]="canProcess()"
      actionLabel="Transform images"
      (filesSelected)="setFiles($event)"
      (process)="process()"
    >
      <div class="tool-fields" [formGroup]="form">
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
      </div>
    </app-tool-shell>
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RotateComponent extends BaseToolComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'rotate';
  protected readonly form = this.fb.group({
    rotateDegrees: [90],
    flipHorizontal: [false],
    flipVertical: [false],
  });

  protected override async processFile(file: File): Promise<ImageOutput> {
    const value = this.form.getRawValue();
    const transform: RenderTransform = {
      rotateDegrees: coerceRotation(value.rotateDegrees),
      flipHorizontal: value.flipHorizontal,
      flipVertical: value.flipVertical,
    };
    const dimensions = await this.processing.getDimensions(file);
    const format = outputFormatForFile(file);

    return this.processing.renderToBlob(file, {
      ...dimensions,
      quality: 1,
      format,
      transform,
      fileName: renameFile(file.name, 'transformed', format),
    });
  }
}

function coerceRotation(value: number): 0 | 90 | 180 | 270 {
  return value === 0 || value === 90 || value === 180 || value === 270 ? value : 0;
}
