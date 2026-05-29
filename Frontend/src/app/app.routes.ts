import { Routes } from '@angular/router';

export const routes: Routes = [

  // HOME
  { path: '', loadComponent: () => import('./home/home').then(m => m.Home) },

  // VEHICLES MASTER
  { path: 'vehicles/all',         loadComponent: () => import('./vehicles/vehicles').then(m => m.Vehicles) },
  { path: 'vehicles/active',      loadComponent: () => import('./vehicles/active-vehicles').then(m => m.ActiveVehicles) },
  { path: 'vehicles/blacklisted', loadComponent: () => import('./vehicles/blacklisted').then(m => m.Blacklisted) },

  // PASS REGISTRY
  { path: 'passes/active',    loadComponent: () => import('./passes/passes').then(m => m.Passes) },

  // COMPLIANCE DOCUMENTS
  { path: 'docs/puc',         loadComponent: () => import('./documents/documents').then(m => m.Documents) },

  // AUDIT HISTORY
  { path: 'history/create',   loadComponent: () => import('./history/history').then(m => m.History) },

  // ADMIN
  { path: 'authority/company',loadComponent: () => import('./authority/authority').then(m => m.Authority) },

];