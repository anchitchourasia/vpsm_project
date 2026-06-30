// Frontend/src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [

  // LOGIN — public, no guard
  { path: 'login', loadComponent: () => import('./login/login').then(m => m.Login) },

  // HOME — protected
  { path: '', canActivate: [authGuard], loadComponent: () => import('./home/home').then(m => m.Home) },

  // MY PASS — protected
  // { path: 'my-pass', canActivate: [authGuard], loadComponent: () => import('./my-pass/my-pass').then(m => m.MyPass) },

  // VEHICLES MASTER — protected
  { path: 'vehicles/all', canActivate: [authGuard], loadComponent: () => import('./vehicles/vehicles').then(m => m.Vehicles) },
  { path: 'vehicles/active', canActivate: [authGuard], loadComponent: () => import('./vehicles/vehicles').then(m => m.Vehicles) },
  { path: 'vehicles/blacklisted', canActivate: [authGuard], loadComponent: () => import('./vehicles/blacklisted').then(m => m.Blacklisted) },

  // PASS REGISTRY — protected
  { path: 'passes/all', canActivate: [authGuard], loadComponent: () => import('./passes/passes').then(m => m.Passes) },
  { path: 'passes/active', canActivate: [authGuard], loadComponent: () => import('./passes/passes').then(m => m.Passes) },
  { path: 'passes/expiring', canActivate: [authGuard], loadComponent: () => import('./passes/expiring-passes').then(m => m.ExpiringPasses) },
  { path: 'passes/expired', canActivate: [authGuard], loadComponent: () => import('./passes/expired-passes').then(m => m.ExpiredPasses) },
  { path: 'passes/surrendered', canActivate: [authGuard], loadComponent: () => import('./passes/surrendered-passes').then(m => m.SurrenderedPasses) },

  // COMPLIANCE DOCUMENTS — protected
  { path: 'docs/all', canActivate: [authGuard], loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'ALL' } },
  { path: 'docs/rc', canActivate: [authGuard], loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'RC' } },
  { path: 'docs/puc', canActivate: [authGuard], loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'PUC' } },
  { path: 'docs/insurance', canActivate: [authGuard], loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'Insurance' } },
  { path: 'docs/fitness', canActivate: [authGuard], loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'Fitness' } },
  { path: 'docs/load-test', canActivate: [authGuard], loadComponent: () => import('./documents/documents').then(m => m.Documents), data: { docType: 'Load_Test' } },

  // AUDIT — protected
  { path: 'history', canActivate: [authGuard], loadComponent: () => import('./history/history').then(m => m.History) },

  // ADMIN / AUTHORITY — protected
  { path: 'authority/company', canActivate: [authGuard], loadComponent: () => import('./authority/authority').then(m => m.Authority) },
  { path: 'authority/confirmer', canActivate: [authGuard], loadComponent: () => import('./authority/confirmer/confirmer').then(m => m.Confirmer) },
  { path: 'authority/approval', canActivate: [authGuard], loadComponent: () => import('./authority/approval/approval').then(m => m.Approval) },

  // PASS MANAGEMENT — protected
  { path: 'pass-entry', canActivate: [authGuard], loadComponent: () => import('./pass-entry/pass-entry').then(m => m.PassEntry) },
  { path: 'pass-details', canActivate: [authGuard], loadComponent: () => import('./pass-details/pass-details').then(m => m.PassDetails) },
  { path: 'pass-list', canActivate: [authGuard], loadComponent: () => import('./my-pass/my-pass').then(m => m.MyPass) },

  // VEHICLE PERMISSION — protected
  { path: 'vehicle-permission/add', canActivate: [authGuard], loadComponent: () => import('./vehicle-permission/vehicle-permission-form/vehicle-permission-form').then(m => m.VehiclePermissionForm) },
  { path: 'vehicle-permission/list', canActivate: [authGuard], loadComponent: () => import('./vehicle-permission/vehicle-permission-list/vehicle-permission-list').then(m => m.VehiclePermissionList) },
  { path: 'vehicle-permission/confirmer', canActivate: [authGuard], loadComponent: () => import('./vehicle-permission/contractor-confirmer/contractor-confirmer').then(m => m.ContractorConfirmerComponent) },
  // ✅ NEW route added by colleague — add this to your v6.4 app.routes.ts
  {
    path: 'vehicle-permission/confirmer',
    canActivate: [authGuard],
    loadComponent: () => import('./vehicle-permission/contractor-confirmer/contractor-confirmer')
      .then(m => m.ContractorConfirmerComponent)
  },
  // FALLBACK — redirect to home (guard will catch unauthenticated → login)
  { path: '**', redirectTo: '' },
];