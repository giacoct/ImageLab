import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Names this icon set knows how to draw. The tool-related names match the
 * tool ids in the registry so a tool card can render `<app-icon [name]="tool.id" />`.
 */
export type IconName =
  | 'resize'
  | 'convert'
  | 'convert-svg'
  | 'compress'
  | 'strip-metadata'
  | 'remove-background'
  | 'adjust'
  | 'scale'
  | 'watermark'
  | 'ocr'
  | 'upload'
  | 'download'
  | 'arrow-right'
  | 'arrow-left'
  | 'send'
  | 'sparkles'
  | 'check'
  | 'image'
  | 'folder'
  | 'close'
  | 'info'
  | 'edit';

/**
 * Single inline-SVG icon, drawn in a 24×24 viewBox with `currentColor`, so it
 * inherits the surrounding text color and scales with the `size` input. Unknown
 * names fall back to a neutral image glyph.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      align-items: center;
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
    }
    svg {
      display: block;
    }
  `,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('resize') {
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        }
        @case ('convert') {
          <path d="m17 2 4 4-4 4" />
          <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="m7 22-4-4 4-4" />
          <path d="M21 13v1a4 4 0 0 1-4 4H3" />
        }
        @case ('convert-svg') {
          <circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="19" r="2" />
          <path d="M5 17A12 12 0 0 1 17 5" />
        }
        @case ('scale') {
          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M16 3h5v5" />
          <path d="M14 10 21 3" />
        }
        @case ('watermark') {
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9" y1="20" x2="15" y2="20" />
          <line x1="12" y1="4" x2="12" y2="20" />
        }
        @case ('ocr') {
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <line x1="7" y1="8" x2="15" y2="8" />
          <line x1="7" y1="12" x2="17" y2="12" />
          <line x1="7" y1="16" x2="13" y2="16" />
        }
        @case ('compress') {
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        }
        @case ('strip-metadata') {
          <path
            d="m7 21-4.3-4.3a2.41 2.41 0 0 1 0-3.4l9.6-9.6a2.41 2.41 0 0 1 3.4 0l5.6 5.6a2.41 2.41 0 0 1 0 3.4L13 21"
          />
          <path d="M22 21H7" />
          <path d="m5 11 9 9" />
        }
        @case ('remove-background') {
          <circle cx="6" cy="6" r="3" />
          <path d="M8.12 8.12 12 12" />
          <path d="M20 4 8.12 15.88" />
          <circle cx="6" cy="18" r="3" />
          <path d="M14.8 14.8 20 20" />
        }
        @case ('adjust') {
          <line x1="21" y1="4" x2="14" y2="4" />
          <line x1="10" y1="4" x2="3" y2="4" />
          <line x1="21" y1="12" x2="12" y2="12" />
          <line x1="8" y1="12" x2="3" y2="12" />
          <line x1="21" y1="20" x2="16" y2="20" />
          <line x1="12" y1="20" x2="3" y2="20" />
          <line x1="14" y1="2" x2="14" y2="6" />
          <line x1="8" y1="10" x2="8" y2="14" />
          <line x1="16" y1="18" x2="16" y2="22" />
        }
        @case ('upload') {
          <path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2" />
          <path d="M12 12v9" />
          <path d="m16 16-4-4-4 4" />
        }
        @case ('download') {
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        }
        @case ('arrow-right') {
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        }
        @case ('arrow-left') {
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        }
        @case ('send') {
          <circle cx="12" cy="12" r="10" />
          <path d="m12 16 4-4-4-4" />
          <line x1="8" y1="12" x2="16" y2="12" />
        }
        @case ('sparkles') {
          <path
            d="M12 3 13.9 8.6a2 2 0 0 0 1.5 1.5L21 12l-5.6 1.9a2 2 0 0 0-1.5 1.5L12 21l-1.9-5.6a2 2 0 0 0-1.5-1.5L3 12l5.6-1.9a2 2 0 0 0 1.5-1.5z"
          />
        }
        @case ('check') {
          <polyline points="20 6 9 17 4 12" />
        }
        @case ('folder') {
          <path
            d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
          />
        }
        @case ('close') {
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        }
        @case ('edit') {
          <path
            d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
          />
        }
        @case ('info') {
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        }
        @default {
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        }
      }
    </svg>
  `,
})
export class Icon {
  /** Which glyph to draw. Accepts any string; unknown values use a fallback. */
  readonly name = input.required<string>();
  /** Pixel size of the (square) icon. */
  readonly size = input(20);
}
