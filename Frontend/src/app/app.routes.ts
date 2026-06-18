// Frontend/src/app/app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [

  // HOME
  { path: '', loadComponent: () => import('./home/home').then(m => m.Home) },

  // LOGIN
  { path: 'login', loadComponent: () => import('./login/login').then(m => m.Login) },

  // ✅ MY PASS — employee only view
  { path: 'my-pass', loadComponent: () => import('./my-pass/my-pass').then(m => m.MyPass) },

  // VEHICLES MASTER
  { path: 'vehicles/all',         loadComponent: () => import('./vehicles/vehicles').then(m => m.Vehicles) },
  { path: 'vehicles/active',      loadComponent: () => import('./vehicles/vehicles').then(m => m.Vehicles) },
  { path: 'vehicles/blacklisted', loadComponent: () => import('./vehicles/blacklisted').then(m => m.Blacklisted) },

  // PASS REGISTRY
  { path: 'passes/all',         loadComponent: () => import('./passes/passes').then(m => m.Passes) },
  { path: 'passes/active',      loadComponent: () => import('./passes/passes').then(m => m.Passes) },
  { path: 'passes/expiring',    loadComponent: () => import('./passes/expiring-passes').then(m => m.ExpiringPasses) },
  { path: 'passes/expired',     loadComponent: () => import('./passes/expired-passes').then(m => m.ExpiredPasses) },
  { path: 'passes/surrendered', loadComponent: () => import('./passes/surrendered-passes').then(m => m.SurrenderedPasses) },

  // COMPLIANCE DOCUMENTS
  { path: 'docs/all',       loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'ALL' } },
  { path: 'docs/rc',        loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'RC' } },
  { path: 'docs/puc',       loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'PUC' } },
  { path: 'docs/insurance', loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'Insurance' } },
  { path: 'docs/fitness',   loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'Fitness' } },
  { path: 'docs/load-test', loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'Load_Test' } },

  // AUDIT
  { path: 'history', loadComponent: () => import('./history/history').then(m => m.History) },

  // ADMIN / AUTHORITY
  { path: 'authority/company',   loadComponent: () => import('./authority/authority').then(m => m.Authority) },
  { path: 'authority/confirmer', loadComponent: () => import('./authority/confirmer/confirmer').then(m => m.Confirmer) },
  { path: 'authority/approval',  loadComponent: () => import('./authority/approval/approval').then(m => m.Approval) },

  // PASS MANAGEMENT
  { path: 'pass-entry',   loadComponent: () => import('./pass-entry/pass-entry').then(m => m.PassEntry) },
  { path: 'pass-details', loadComponent: () => import('./pass-details/pass-details').then(m => m.PassDetails) },

  // FALLBACK
  { path: '**', redirectTo: '' },
];