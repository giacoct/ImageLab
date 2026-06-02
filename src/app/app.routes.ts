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
    path: 'tools/icon',
    loadComponent: () => import('./tools/icon/icon.component').then((m) => m.IconComponent),
    title: 'Create ICO icons | ImageLab',
  },
  {
    path: 'tools/rotate',
    loadComponent: () => import('./tools/rotate/rotate.component').then((m) => m.RotateComponent),
    title: 'Rotate and flip | ImageLab',
  },
  {
    path: 'tools/strip-metadata',
    loadComponent: () =>
      import('./tools/strip-metadata/strip-metadata.component').then(
        (m) => m.StripMetadataComponent,
      ),
    title: 'Strip metadata | ImageLab',
  },
  {
    path: 'tools/remove-background',
    loadComponent: () =>
      import('./tools/remove-background/remove-background.component').then(
        (m) => m.RemoveBackgroundComponent,
      ),
    title: 'Remove background | ImageLab',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
