import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {

  // ── SIDEBAR COLLAPSE / EXPAND ──────────────────────
  sidebarCollapsed = signal(false);

  toggleSidebar() {
    this.sidebarCollapsed.set(!this.sidebarCollapsed());
  }

  expandSidebar() {
    this.sidebarCollapsed.set(false);
  }

  // ── MULTI-MENU OPEN (Set-based) ────────────────────
  openMenus = signal<Set<string>>(new Set());

  toggleMenu(menu: string, event: Event) {
    event.stopPropagation();
    const current = new Set(this.openMenus());
    if (current.has(menu)) {
      current.delete(menu);
    } else {
      current.add(menu);
    }
    this.openMenus.set(current);
  }

  isMenuOpen(menu: string): boolean {
    return this.openMenus().has(menu);
  }
    // ── PASS ENTRY — open in new browser tab ──────────
  openPassEntry(): void {
    window.open('/pass-entry', '_blank');
  }
}