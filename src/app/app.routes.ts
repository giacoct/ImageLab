import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent),
    title: 'ImageLab',
  },
  {
    path: 'tools/resize',
    loadComponent: () => import('./tools/resize/resize.component').then((m) => m.ResizeComponent),
    title: 'Resize images | ImageLab',
  },
  {
    path: 'tools/convert',
    loadComponent: () =>
      import('./tools/convert/convert.component').then((m) => m.ConvertComponent),
    title: 'Convert format | ImageLab',
  },
  {
    path: 'tools/compress',
    loadComponent: () =>
      import('./tools/compress/compress.component').then((m) => m.CompressComponent),
    title: 'Compress images | ImageLab',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
