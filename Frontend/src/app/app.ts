// Frontend/src/app/app.ts
import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PassStateService } from './services/pass-state.service';

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

  // ── Sidebar ──────────────────────────────────────
  sidebarCollapsed = signal(false);

  toggleSidebar()  { this.sidebarCollapsed.set(!this.sidebarCollapsed()); }
  expandSidebar()  { this.sidebarCollapsed.set(false); }

  // ── Multi-menu ────────────────────────────────────
  openMenus = signal<Set<string>>(new Set());

  toggleMenu(menu: string, event: Event) {
    event.stopPropagation();
    const current = new Set(this.openMenus());
    current.has(menu) ? current.delete(menu) : current.add(menu);
    this.openMenus.set(current);
  }

  isMenuOpen(menu: string): boolean { return this.openMenus().has(menu); }

  // ── Pass Entry — open standalone in new tab ───────
  openPassEntry(): void { window.open('/pass-entry', '_blank'); }

  // ── Detect if THIS tab is the bare pass-entry tab ─
  isPassEntryMode = false;

  // ── BroadcastChannel: navigate to pass-details when pass submitted ──
  private navChannel = new BroadcastChannel('pass_nav_channel');

  ngOnInit(): void {
    // Detect current route on every navigation
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) {
        this.isPassEntryMode = e.urlAfterRedirects.startsWith('/pass-entry');
      }
    });
    // Set initial state (in case page loaded directly on /pass-entry)
    this.isPassEntryMode = window.location.pathname.startsWith('/pass-entry');

    // When pass-entry tab broadcasts "navigate to pass-details", do it here
    this.navChannel.onmessage = (event) => {
      if (event.data?.type === 'NAVIGATE_PASS_DETAILS') {
        this.router.navigate(['/pass-details']);
      }
    };
  }

  ngOnDestroy(): void { this.navChannel.close(); }
}