import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { BackendService } from '../../services/backend.service';
import { ToolSessionService } from '../../services/tool-session.service';
import { ImageToolDefinition } from '../../tool-registry';
import { FileList } from '../file-list/file-list';
import { Icon } from '../icon/icon';
import { ToolHeader } from '../tool-header/tool-header';

/**
 * Chrome for a tool's **settings** page: header, the input column (an optional
 * projected preview plus the selected-file list) and the settings panel with
 * Back / action buttons. A tool projects its preview into the `[preview]` slot
 * and its form fields into the default slot. Backend tools set `uploadCheck`
 * to list the images the backend would reject before anything is sent.
 */
@Component({
  selector: 'app-tool-shell',
  imports: [RouterLink, Icon, ToolHeader, FileList],
  templateUrl: './tool-shell.html',
  styleUrl: './tool-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolShell {
  private readonly session = inject(ToolSessionService);
  private readonly backend = inject(BackendService);

  readonly tool = input.required<ImageToolDefinition>();
  readonly canSubmit = input(false);
  readonly actionLabel = input.required<string>();
  /** File rows are buttons that choose the previewed image. */
  readonly selectable = input(false);
  readonly selectedIndex = input(0);
  /** Check the files against the backend's upload limits (`upscale` also checks dimensions). */
  readonly uploadCheck = input<'none' | 'size' | 'upscale'>('none');

  readonly action = output<void>();
  readonly fileSelected = output<number>();

  protected readonly files = this.session.files;
  protected readonly error = this.session.error;
  /** Why each rejected image would fail (empty when all are fine). */
  protected readonly uploadProblems = signal<string[]>([]);

  constructor() {
    effect((onCleanup) => {
      const files = this.files();
      const check = this.uploadCheck();
      this.uploadProblems.set([]);
      if (check === 'none' || files.length === 0) {
        return;
      }
      let current = true;
      onCleanup(() => (current = false));
      void this.backend.uploadProblems(files, check === 'upscale').then((problems) => {
        if (current) this.uploadProblems.set(problems);
      });
    });
  }
}
