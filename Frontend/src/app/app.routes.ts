import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home').then(m => m.Home) },
  { path: 'vehicles/all', loadComponent: () => import('./vehicles/vehicles').then(m => m.Vehicles) },
  { path: 'passes/active', loadComponent: () => import('./passes/passes').then(m => m.Passes) },
  { path: 'docs/puc', loadComponent: () => import('./documents/documents').then(m => m.Documents) },
  { path: 'history/create', loadComponent: () => import('./history/history').then(m => m.History) },
  { path: 'authority/company', loadComponent: () => import('./authority/authority').then(m => m.Authority) },
];