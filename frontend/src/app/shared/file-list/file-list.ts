import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ToolSessionService } from '../../services/tool-session.service';
import { Icon } from '../icon/icon';
import { Reorderable } from '../reorderable/reorderable';

/**
 * The list of selected images, shared by the import step and every settings
 * page. Rows can be drag-reordered (the order carries through to the output),
 * and optionally clicked to choose the previewed image or removed.
 */
@Component({
  selector: 'app-file-list',
  imports: [Icon, Reorderable],
  templateUrl: './file-list.html',
  styleUrl: './file-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileList {
  private readonly session = inject(ToolSessionService);

  readonly files = input.required<readonly File[]>();
  /** Rows are buttons that choose the previewed image. */
  readonly selectable = input(false);
  readonly selectedIndex = input(0);
  /** Rows get a ✕ button. */
  readonly removable = input(false);

  readonly fileSelected = output<number>();
  readonly fileRemoved = output<number>();

  protected readonly canReorder = computed(() => this.files().length > 1);

  protected move(from: number, to: number): void {
    this.session.moveFile(from, to);
  }
}
