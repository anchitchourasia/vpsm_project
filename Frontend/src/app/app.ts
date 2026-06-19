// Frontend/src/app/app.ts
import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { CommonModule }    from '@angular/common';
import { PassStateService } from './services/pass-state.service';
import { AuthService }      from './core/auth.service';

@Component({
  selector   : 'app-root',
  standalone : true,
  imports    : [RouterLink, RouterLinkActive, RouterOutlet, CommonModule],
  templateUrl: './app.html',
  styleUrl   : './app.css',
})
export class App implements OnInit, OnDestroy {

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

  // ── Pass Entry ────────────────────────────────────
  // ── Pass Entry ────────────────────────────────────
  // Interview Term: "SPA Navigation vs window.open"
  // window.open opens a NEW browser tab — Angular re-bootstraps from scratch
  // so session signal is lost and authGuard blocks access.
  // router.navigate stays in the SAME Angular app — session signal is alive.
  openPassEntry(): void { this.router.navigate(['/pass-entry']); }

  isPassEntryMode = false;

  private navChannel = new BroadcastChannel('pass_nav_channel');

  ngOnInit(): void {
    // ✅ sessionReady.set(true) immediately — no localStorage, no API call
    // authGuard handles redirect to /login if not logged in
    this.auth.tryRestoreSession();

    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) {
        this.isPassEntryMode = e.urlAfterRedirects.startsWith('/pass-entry');
      }
    });

    this.isPassEntryMode = window.location.pathname.startsWith('/pass-entry');

    this.navChannel.onmessage = (event) => {
      if (event.data?.type === 'NAVIGATE_PASS_DETAILS') {
        this.router.navigate(['/pass-details']);
      }
    };
  }

  ngOnDestroy(): void { this.navChannel.close(); }
}