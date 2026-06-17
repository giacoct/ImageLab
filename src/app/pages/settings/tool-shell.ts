import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ImageToolDefinition } from '../../core/models/image-tool.model';
import { ToolSessionService } from '../../core/services/tool-session.service';
import { Icon } from '../../shared/icon/icon';
import { Reorderable } from '../../shared/reorderable/reorderable';
import { StepIndicator } from '../../shared/step-indicator/step-indicator';

/**
 * Chrome for a tool's **settings** page: step indicator, header, the input
 * column (an optional projected preview plus the selected-file list) and the
 * settings panel with Back / action controls. A tool projects its preview into
 * the `[preview]` slot and its form fields into the default slot.
 */
@Component({
  selector: 'app-tool-shell',
  imports: [RouterLink, Icon, StepIndicator, Reorderable],
  templateUrl: './tool-shell.html',
  styleUrl: '../tool-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolShell {
  private readonly session = inject(ToolSessionService);

  readonly tool = input.required<ImageToolDefinition>();
  readonly files = input.required<readonly File[]>();
  readonly error = input('');
  readonly canSubmit = input(false);
  readonly actionLabel = input.required<string>();
  /** When true the file list is a set of buttons that drive the preview. */
  readonly selectable = input(false);
  readonly selectedIndex = input(0);

  readonly action = output<void>();
  readonly fileSelected = output<number>();

  /** Drag-reorder is offered (only) when the plain list holds 2+ files. */
  readonly canReorder = computed(() => !this.selectable() && this.files().length > 1);

  protected moveFile(from: number, to: number): void {
    this.session.moveFile(from, to);
  }
}
