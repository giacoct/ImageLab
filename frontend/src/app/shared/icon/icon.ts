import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Single inline-SVG icon, drawn in a 24×24 viewBox with `currentColor`, so it
 * inherits the surrounding text color and scales with the `size` input. The
 * available names are the `@case` labels in icon.html; tool glyphs are named
 * after the tool id, so a card can render `<app-icon [name]="tool.id" />`.
 * Unknown names fall back to a neutral image glyph.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './icon.css',
  templateUrl: './icon.html',
})
export class Icon {
  /** Which glyph to draw. Accepts any string; unknown values use a fallback. */
  readonly name = input.required<string>();
  /** Pixel size of the (square) icon. */
  readonly size = input(20);
}
