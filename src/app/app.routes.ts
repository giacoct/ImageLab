import { Route, Routes } from '@angular/router';

import { IMAGE_TOOLS } from './core/services/tool-registry.service';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    title: 'ImageLab',
  },
  ...IMAGE_TOOLS.map(
    (tool): Route => ({
      path: tool.route.replace(/^\//, ''),
      data: { toolId: tool.id },
      title: `${tool.title} | ImageLab`,
      children: [
        { path: '', redirectTo: 'import', pathMatch: 'full' },
        {
          path: 'import',
          loadComponent: () => import('./pages/import/import-page').then((m) => m.ImportPage),
        },
        { path: 'settings', loadComponent: tool.loadComponent },
        {
          path: 'output',
          loadComponent: () => import('./pages/output/output-page').then((m) => m.OutputPage),
        },
        { path: '**', redirectTo: 'import' },
      ],
    }),
  ),
  {
    path: '**',
    redirectTo: '',
  },
];
