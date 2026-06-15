import { Type } from '@angular/core';

export interface ImageToolDefinition {
  id: string;
  title: string;
  description: string;
  route: string;
  acceptedTypes: string[];
  maxFiles: number | null;
  batch: boolean;
  /** Lazily loads the tool's page component (used for both routing and chaining). */
  loadComponent: () => Promise<Type<unknown>>;
  /**
   * Optional custom component for the output step. Tools whose result isn't a
   * set of downloadable images (e.g. OCR text) provide their own page; the rest
   * fall back to the generic output page.
   */
  outputComponent?: () => Promise<Type<unknown>>;
}
