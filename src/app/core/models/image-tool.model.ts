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
}
