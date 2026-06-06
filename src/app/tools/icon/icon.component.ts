import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ImageOutput } from '../../core/models/image-output.model';
import { BaseToolComponent } from '../shared/base-tool.component';
import { ToolShellComponent } from '../shared/tool-shell.component';
import { renameFile } from '../shared/image-tool-utils';

@Component({
  selector: 'app-icon-tool',
  imports: [ToolShellComponent, ReactiveFormsModule],
  template: `
    <app-tool-shell
      [tool]="tool"
      [selectedFiles]="selectedFiles()"
      [outputs]="outputs()"
      [isProcessing]="isProcessing()"
      [error]="error()"
      [canProcess]="canProcess()"
      actionLabel="Create icons"
      (filesSelected)="setFiles($event)"
      (process)="process()"
    >
      <div class="tool-fields" [formGroup]="form">
        <div class="field">
          <label for="size">Icon size</label>
          <select id="size" formControlName="size">
            <option [value]="16">16 x 16</option>
            <option [value]="32">32 x 32</option>
            <option [value]="48">48 x 48</option>
            <option [value]="64">64 x 64</option>
            <option [value]="128">128 x 128</option>
            <option [value]="256">256 x 256</option>
          </select>
        </div>
      </div>
    </app-tool-shell>
  `,
  styleUrl: '../shared/tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent extends BaseToolComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'icon';
  protected readonly form = this.fb.group({
    size: [256, [Validators.required, Validators.min(16), Validators.max(256)]],
  });

  protected override get errorMessage(): string {
    return 'The icons could not be created.';
  }

  protected override isFormValid(): boolean {
    return this.form.valid;
  }

  protected override processFile(file: File): Promise<ImageOutput> {
    return this.processing.renderIco(file, {
      size: this.form.getRawValue().size,
      fileName: renameFile(file.name, 'icon', 'image/x-icon'),
    });
  }
}
