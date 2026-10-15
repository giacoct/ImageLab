import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { renameFile } from '../../domain/image-files';
import { OutputFormat } from '../../domain/image-output.model';
import { supportsAvifOutput } from '../../services/canvas';
import { JobProcessor } from '../../services/tool-session.service';
import { ToolShell } from '../../shared/tool-shell/tool-shell';
import { BaseTool } from '../base-tool';

/** Convert format: re-encode as JPEG, PNG, WebP, AVIF, or a single-size ICO icon. */
@Component({
  selector: 'app-convert-tool',
  imports: [ToolShell, ReactiveFormsModule],
  templateUrl: './convert.html',
  styleUrl: './convert.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Convert extends BaseTool {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly toolId = 'convert';
  protected readonly form = this.fb.group({
    format: this.fb.control<OutputFormat>('image/webp'),
    size: this.fb.control(256),
  });

  /** AVIF encoding is Chromium-only; the option is shown when supported. */
  protected readonly avifSupported = signal(false);

  constructor() {
    super();
    this.registerForm(this.form);
    void supportsAvifOutput().then((supported) => this.avifSupported.set(supported));
  }

  protected override createProcessor(): JobProcessor {
    const { format, size } = this.form.getRawValue();

    return (file) =>
      format === 'image/x-icon'
        ? this.processing.renderIco(file, {
            size,
            fileName: renameFile(file.name, 'icon', format),
          })
        : this.processing.resize(file, {
            quality: 1,
            format,
            fileName: renameFile(file.name, 'converted', format),
          });
  }
}
