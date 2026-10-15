import { Route, Routes } from '@angular/router';

import { TOOLS } from './tool-registry';

/**
 * Home, plus one 3-step workflow per tool: `/tools/<id>/import` →
 * `/tools/<id>/settings` (the tool's own page) → `/tools/<id>/output`. The
 * import and output pages are shared by every tool; they read the tool id from
 * the route's `data.toolId`.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    title: 'ImageLab',
  },
  ...TOOLS.map((tool): Route => ({
    path: tool.route.slice(1),
    data: { toolId: tool.id },
    title: `${tool.title} | ImageLab`,
    children: [
      { path: '', redirectTo: 'import', pathMatch: 'full' },
      {
        path: 'import',
        loadComponent: () => import('./pages/import/import').then((m) => m.ImportPage),
      },
      { path: 'settings', loadComponent: tool.loadComponent },
      {
        path: 'output',
        loadComponent: () => import('./pages/output/output').then((m) => m.OutputPage),
      },
      { path: '**', redirectTo: 'import' },
    ],
  })),
  { path: '**', redirectTo: '' },
];
