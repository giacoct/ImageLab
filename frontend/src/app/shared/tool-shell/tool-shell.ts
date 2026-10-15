import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ToolSessionService } from '../../services/tool-session.service';
import { ImageToolDefinition } from '../../tool-registry';
import { FileList } from '../file-list/file-list';
import { Icon } from '../icon/icon';
import { ToolHeader } from '../tool-header/tool-header';

/**
 * Chrome for a tool's **settings** page: header, the input column (an optional
 * projected preview plus the selected-file list) and the settings panel with
 * Back / action buttons. A tool projects its preview into the `[preview]` slot
 * and its form fields into the default slot.
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

  readonly tool = input.required<ImageToolDefinition>();
  readonly canSubmit = input(false);
  readonly actionLabel = input.required<string>();
  /** File rows are buttons that choose the previewed image. */
  readonly selectable = input(false);
  readonly selectedIndex = input(0);

  readonly action = output<void>();
  readonly fileSelected = output<number>();

  protected readonly files = this.session.files;
  protected readonly error = this.session.error;
}
