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





  // VEHICLE PERMISSION — protected
  {
    path: 'vehicle-permission/add',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./vehicle-permission/vehicle-permission-form/vehicle-permission-form')
        .then(m => m.VehiclePermissionFormComponent)
  },
  {
    path: 'vehicle-permission/form',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./vehicle-permission/vehicle-permission-form/vehicle-permission-form')
        .then(m => m.VehiclePermissionFormComponent)
  },
  {
    path: 'vehicle-permission/list',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./vehicle-permission/vehicle-permission-list/vehicle-permission-list')
        .then(m => m.VehiclePermissionListComponent)
  },
  // ✅ NEW route added by colleague — add this to your v6.4 app.routes.ts
  { path: 'vehicle-permission/confirmer', canActivate: [authGuard], loadComponent: () => import('./vehicle-permission/contractor-confirmer/contractor-confirmer').then(m => m.ContractorConfirmerComponent) },
  {
    path: 'vehicle-permission/confirmer',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./vehicle-permission/contractor-confirmer/contractor-confirmer')
        .then(m => m.ContractorConfirmerComponent)
  },

  {
    path: 'vehicle-permission/verifier',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./vehicle-permission/contractor-verifier/contractor-verifier')
        .then(m => m.ContractorVerifierComponent)
  },

  {
    path: 'vehicle-permission/approver',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./vehicle-permission/contractor-approver/contractor-approver')
        .then(m => m.ContractorApproverComponent)
  },

  // ── 🟢 ADDED: Contractor Approver Route — protected with AuthGuard ──
  { path: 'vehicle-permission/approver', canActivate: [authGuard], loadComponent: () => import('./vehicle-permission/contractor-approver/contractor-approver').then(m => m.ContractorApproverComponent) },
  {
    path: 'vehicle-permission/pass',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./vehicle-permission/vehicle-permission-pass/vehicle-permission-pass')
        .then(m => m.VehiclePermissionPassComponent)
  },


  // FALLBACK — redirect to home (guard will catch unauthenticated → login)
  { path: '**', redirectTo: '' },
];