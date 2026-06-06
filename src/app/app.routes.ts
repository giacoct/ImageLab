import { Routes } from '@angular/router';

import { IMAGE_TOOLS } from './core/services/tool-registry.service';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent),
    title: 'ImageLab',
  },
  ...IMAGE_TOOLS.map((tool) => ({
    path: tool.route.replace(/^\//, ''),
    loadComponent: tool.loadComponent,
    title: `${tool.title} | ImageLab`,
  })),
  {
    path: '**',
    redirectTo: '',
  },
];
