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

  

  // PASS REGISTRY — protected
  { path: 'passes/all', canActivate: [authGuard], loadComponent: () => import('./passes/passes').then(m => m.Passes) },
  { path: 'passes/active', canActivate: [authGuard], loadComponent: () => import('./passes/passes').then(m => m.Passes) },
    { path: 'passes/surrendered', canActivate: [authGuard], loadComponent: () => import('./passes/surrendered-passes').then(m => m.SurrenderedPasses) },

  
  // AUDIT — protected
  { path: 'history', canActivate: [authGuard], loadComponent: () => import('./history/history').then(m => m.History) },

  // ADMIN / AUTHORITY — protected
  { path: 'authority/company', canActivate: [authGuard], loadComponent: () => import('./authority/authority').then(m => m.Authority) },
  { path: 'authority/confirmer', canActivate: [authGuard], loadComponent: () => import('./authority/confirmer/confirmer').then(m => m.Confirmer) },
  { path: 'authority/approval', canActivate: [authGuard], loadComponent: () => import('./authority/approval/approval').then(m => m.Approval) },

  // PASS MANAGEMENT — protected
  { path: 'pass-entry', canActivate: [authGuard], loadComponent: () => import('./pass-entry/pass-entry').then(m => m.PassEntry) },

  // // VEHICLE PERMISSION — protected
  // {
  //   path: 'vehicle-permission/add',
  //   canActivate: [authGuard],
  //   loadComponent: () =>
  //     import('./vehicle-permission/vehicle-permission-form/vehicle-permission-form')
  //       .then(m => m.VehiclePermissionFormComponent)
  // },
  // {
  //   path: 'vehicle-permission/form',
  //   canActivate: [authGuard],
  //   loadComponent: () =>
  //     import('./vehicle-permission/vehicle-permission-form/vehicle-permission-form')
  //       .then(m => m.VehiclePermissionFormComponent)
  // },
  // {
  //   path: 'vehicle-permission/list',
  //   canActivate: [authGuard],
  //   loadComponent: () =>
  //     import('./vehicle-permission/vehicle-permission-list/vehicle-permission-list')
  //       .then(m => m.VehiclePermissionListComponent)
  // },
  // // ✅ NEW route added by colleague — add this to your v6.4 app.routes.ts
  // { path: 'vehicle-permission/confirmer', canActivate: [authGuard], loadComponent: () => import('./vehicle-permission/contractor-confirmer/contractor-confirmer').then(m => m.ContractorConfirmerComponent) },

  // // ── 🟢 ADDED: Contractor Approver Route — protected with AuthGuard ──
  // { path: 'vehicle-permission/approver', canActivate: [authGuard], loadComponent: () => import('./vehicle-permission/contractor-approver/contractor-approver').then(m => m.ContractorApproverComponent) },
  // {
  //   path: 'vehicle-permission/pass',
  //   canActivate: [authGuard],
  //   loadComponent: () =>
  //     import('./vehicle-permission/vehicle-permission-pass/vehicle-permission-pass')
  //       .then(m => m.VehiclePermissionPassComponent)
  // },
  // FALLBACK — redirect to home (guard will catch unauthenticated → login)
  { path: '**', redirectTo: '' },
];