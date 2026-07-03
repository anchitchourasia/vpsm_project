



import { Component, signal, inject, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule }     from '@angular/common';
import { PassStateService } from './services/pass-state.service';
import { AuthService }      from './core/auth.service';

@Component({
  selector   : 'app-root',
  standalone : true,
  imports    : [RouterLink, RouterLinkActive, RouterOutlet, CommonModule],
  templateUrl: './app.html',
  styleUrl   : './app.css',
})
export class App implements OnInit {

  private router    = inject(Router);
  private passState = inject(PassStateService);

  auth = inject(AuthService);

  pendingForConfirmer = signal(0);
  pendingForApprover  = signal(0);

  // ── Sidebar ──────────────────────────────────────
  sidebarCollapsed = signal(false);
  toggleSidebar()  { this.sidebarCollapsed.set(!this.sidebarCollapsed()); }
  expandSidebar()  { this.sidebarCollapsed.set(false); }

  // ── Multi-menu ────────────────────────────────────
  openMenus = signal<Set<string>>(new Set());

  toggleMenu(menu: string, event: Event): void {
    event.stopPropagation();
    const s = new Set(this.openMenus());
    s.has(menu) ? s.delete(menu) : s.add(menu);
    this.openMenus.set(s);
  }

  isMenuOpen(menu: string): boolean { return this.openMenus().has(menu); }

  openPassEntry(): void { this.router.navigate(['/pass-entry']); }

  ngOnInit(): void {
    this.auth.tryRestoreSession();
  }
}