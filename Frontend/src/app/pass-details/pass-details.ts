import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PassStateService, PassRecord } from '../services/pass-state.service';

@Component({
  selector   : 'app-pass-details',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './pass-details.html',
  styleUrl   : './pass-details.css',
})
export class PassDetails {

  private svc    = inject(PassStateService);
  private router = inject(Router);

  // ── Data sources ──────────────────────────────────────────────────────────
  /** Submitted passes — permanent records */
  protected readonly submittedPasses = this.svc.submittedPasses;

  /** Saved drafts — user can resume these if session was interrupted */
  protected readonly savedDrafts = this.svc.savedDrafts;

  // ── UI State ──────────────────────────────────────────────────────────────
  protected searchTerm   = signal('');
  protected activeTab    = signal<'submitted' | 'drafts'>('submitted');
  protected expandedId   = signal<string | null>(null);
  protected confirmDeleteId = signal<string | null>(null);

  // ── Filtered submitted passes ─────────────────────────────────────────────
  protected filteredSubmitted = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    return this.submittedPasses().filter(p => {
      if (!term) return true;
      return (
        p.passId.toLowerCase().includes(term)    ||
        p.vehicleNo.toLowerCase().includes(term) ||
        p.empName.toLowerCase().includes(term)   ||
        p.ecNo.toLowerCase().includes(term)      ||
        p.gateNo.toLowerCase().includes(term)    ||
        (p.contractorFirm || '').toLowerCase().includes(term)
      );
    });
  });

  // ── Filtered drafts ───────────────────────────────────────────────────────
  protected filteredDrafts = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    return this.savedDrafts().filter(p => {
      if (!term) return true;
      return (
        p.passId.toLowerCase().includes(term)    ||
        p.vehicleNo.toLowerCase().includes(term) ||
        p.empName.toLowerCase().includes(term)   ||
        p.ecNo.toLowerCase().includes(term)
      );
    });
  });

  // ── Active list based on tab ──────────────────────────────────────────────
  protected activeList = computed(() =>
    this.activeTab() === 'submitted'
      ? this.filteredSubmitted()
      : this.filteredDrafts()
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  protected toggle(passId: string): void {
    this.expandedId.update(cur => cur === passId ? null : passId);
  }

  protected onSearch(e: Event): void {
    this.searchTerm.set((e.target as HTMLInputElement).value);
  }

  protected setTab(tab: 'submitted' | 'drafts'): void {
    this.activeTab.set(tab);
    this.expandedId.set(null);
    this.searchTerm.set('');
  }

  /** Resume a draft — navigate back to pass-entry with the draft pre-loaded */
  protected resumeDraft(pass: PassRecord): void {
    // Store draft to resume in localStorage so pass-entry can pick it up
    try {
      localStorage.setItem('vpsm_resume_draft', JSON.stringify(pass));
    } catch { /* silent */ }
    this.router.navigate(['/pass-entry']);
  }

  /** Ask for delete confirmation */
  protected askDelete(passId: string): void {
    this.confirmDeleteId.set(passId);
  }

  /** Cancel delete */
  protected cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  /** Confirm delete a draft */
  protected confirmDelete(passId: string): void {
    this.svc.deleteDraft(passId);
    this.confirmDeleteId.set(null);
  }

  // ── Labels ────────────────────────────────────────────────────────────────
  protected classLabel(cls: string): string {
    const map: Record<string, string> = {
      'Two_Wheeler'    : '🏍️ Two Wheeler',
      'Four_Wheeler'   : '🚗 Four Wheeler',
      'Heavy_Machinery': '🏗️ Heavy Machinery',
    };
    return map[cls] ?? cls;
  }

  protected empTypeLabel(t: string): string {
    return t === 'Contractor' ? '🔧 Contractor' : '🏢 Company Employee';
  }

  protected formatDate(iso: string): string {
    if (!iso || iso.length < 10) return iso ?? '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
}