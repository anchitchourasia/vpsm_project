import { Routes } from '@angular/router';

export const routes: Routes = [

  // HOME
  { path: '', loadComponent: () => import('./home/home').then(m => m.Home) },

  // VEHICLES MASTER
  { path: 'vehicles/all',         loadComponent: () => import('./vehicles/vehicles').then(m => m.Vehicles) },
  { path: 'vehicles/active',      loadComponent: () => import('./vehicles/vehicles').then(m => m.Vehicles) },
  { path: 'vehicles/blacklisted', loadComponent: () => import('./vehicles/blacklisted').then(m => m.Blacklisted) },

  // PASS REGISTRY
  { path: 'passes/active',      loadComponent: () => import('./passes/passes').then(m => m.Passes) },
  { path: 'passes/expiring',    loadComponent: () => import('./passes/expiring-passes').then(m => m.ExpiringPasses) },
  { path: 'passes/expired',     loadComponent: () => import('./passes/expired-passes').then(m => m.ExpiredPasses) },
  { path: 'passes/surrendered', loadComponent: () => import('./passes/surrendered-passes').then(m => m.SurrenderedPasses) },

  // COMPLIANCE DOCUMENTS — one component, docType via route data
  { path: 'docs/all',       loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'ALL' } },
  { path: 'docs/rc',        loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'RC' } },
  { path: 'docs/puc',       loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'PUC' } },
  { path: 'docs/insurance', loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'Insurance' } },
  { path: 'docs/fitness',   loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'Fitness' } },
  { path: 'docs/load-test', loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'Load_Test' } },

  // AUDIT HISTORY — one component, eventType via route data
  { path: 'history/all',       loadComponent: () => import('./history/history').then(m => m.History), data: { eventType: 'ALL'       } },
  { path: 'history/create',    loadComponent: () => import('./history/history').then(m => m.History), data: { eventType: 'CREATED'   } },
  { path: 'history/approve',   loadComponent: () => import('./history/history').then(m => m.History), data: { eventType: 'APPROVED'  } },
  { path: 'history/surrender', loadComponent: () => import('./history/history').then(m => m.History), data: { eventType: 'SURRENDERED'} },
  { path: 'history/expiry',    loadComponent: () => import('./history/history').then(m => m.History), data: { eventType: 'EXPIRED'   } },
  { path: 'history/gate',      loadComponent: () => import('./history/history').then(m => m.History), data: { eventType: 'GATE'       } },
  // ADMIN
  { path: 'authority/company', loadComponent: () => import('./authority/authority').then(m => m.Authority) },
    // PASS MANAGEMENT
  // PASS ENTRY — Raise new pass request
    // PASS MANAGEMENT
  { path: 'pass-entry',   loadComponent: () => import('./pass-entry/pass-entry').then(m => m.PassEntry) },
  {
  path: 'pass-details',
  loadComponent: () =>
    import('./pass-details/pass-details').then(m => m.PassDetails),
  },
];