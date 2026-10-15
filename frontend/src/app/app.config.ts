import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { WorkflowReuseStrategy } from './services/workflow-reuse.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Route data (e.g. `toolId`) is bound straight to component inputs.
    provideRouter(routes, withComponentInputBinding()),
    // Keeps a tool's import/settings/output pages alive while moving between steps.
    { provide: RouteReuseStrategy, useExisting: WorkflowReuseStrategy },
  ],
};
