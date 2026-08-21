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
  { path: 'authority/approval', canActivate: [authGuard], loadComponent: () => import('./authority/approval/approval').then(m => m.Approval) },

  // PASS MANAGEMENT — protected
  { path: 'pass-entry', canActivate: [authGuard], loadComponent: () => import('./pass-entry/pass-entry').then(m => m.PassEntry) },

 
  // ================================
  // NEW STICKER ROUTE
  // ================================
  {
    path: 'pass-sticker',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pass-sticker/pass-sticker')
        .then(m => m.PassSticker)
  },

  // FALLBACK — redirect to home (guard will catch unauthenticated → login)
  { path: '**', redirectTo: '' },
];