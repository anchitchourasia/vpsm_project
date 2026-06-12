import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PassStateService, PassRecord, WorkflowStatus } from '../services/pass-state.service';

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

  // ── Data sources (existing — unchanged) ──────────────────────────────────
  protected readonly submittedPasses = this.svc.submittedPasses;
  protected readonly savedDrafts     = this.svc.savedDrafts;

  // ── UI State (existing — unchanged) ───────────────────────────────────────
  protected searchTerm      = signal('');
  protected activeTab       = signal<'submitted' | 'drafts'>('submitted');
  protected expandedId      = signal<string | null>(null);
  protected confirmDeleteId = signal<string | null>(null);

  // ── Filtered submitted passes (existing — unchanged) ──────────────────────
  protected filteredSubmitted = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    return this.submittedPasses().filter(p => {
      if (!term) return true;
      return (
        p.passId.toLowerCase().includes(term)         ||
        p.vehicleNo.toLowerCase().includes(term)      ||
        p.empName.toLowerCase().includes(term)        ||
        p.ecNo.toLowerCase().includes(term)           ||
        p.gateNo.toLowerCase().includes(term)         ||
        (p.contractorFirm || '').toLowerCase().includes(term)
      );
    });
  });

  // ── Filtered drafts (existing — unchanged) ────────────────────────────────
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

  // ── Active list based on tab (existing — unchanged) ───────────────────────
  protected activeList = computed(() =>
    this.activeTab() === 'submitted'
      ? this.filteredSubmitted()
      : this.filteredDrafts()
  );

  // ── Handlers (existing — unchanged) ───────────────────────────────────────
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

  protected resumeDraft(pass: PassRecord): void {
    try {
      localStorage.setItem('vpsm_resume_draft', JSON.stringify(pass));
    } catch { /* silent */ }
    this.router.navigate(['/pass-entry']);
  }

  protected askDelete(passId: string): void {
    this.confirmDeleteId.set(passId);
  }

  protected cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  protected confirmDelete(passId: string): void {
    this.svc.deleteDraft(passId);
    this.confirmDeleteId.set(null);
  }

  // ── Labels (existing — unchanged) ─────────────────────────────────────────
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

  // ── NEW: Workflow helpers ──────────────────────────────────────────────────

  /** Human-readable status label for badge */
  protected workflowLabel(p: PassRecord): string {
    return this.svc.getStatusLabel(p.workflowStatus);
  }

  /** CSS class for status badge */
  protected workflowClass(p: PassRecord): string {
    return this.svc.getStatusClass(p.workflowStatus);
  }

  /**
   * Build a timeline trail for a pass record.
   * Only includes stages that have actually happened.
   * Purely computed — no state mutation.
   */
  protected workflowTrail(p: PassRecord): { label: string; by: string; at: string; remark: string }[] {
    const trail: { label: string; by: string; at: string; remark: string }[] = [];

    // Stage 1 — always present if record exists
    trail.push({
      label : 'Submitted',
      by    : p.submittedBy  ?? 'ADMIN',
      at    : p.submittedAt  ? this.formatDateTime(p.submittedAt) : p.createdAt,
      remark: '',
    });

    // Stage 2 — confirmer acted
    if (p.confirmedAt) {
      trail.push({
        label : p.workflowStatus === 'Confirmation_Rejected' ? 'Returned by Confirmer' : 'Confirmed',
        by    : p.confirmedBy    ?? '—',
        at    : this.formatDateTime(p.confirmedAt),
        remark: p.confirmerRemark ?? '',
      });
    }

    // Stage 3 — approver acted
    if (p.approvedAt) {
      trail.push({
        label : p.workflowStatus === 'Approval_Rejected' ? 'Returned by Approver' : 'Approved',
        by    : p.approvedBy    ?? '—',
        at    : this.formatDateTime(p.approvedAt),
        remark: p.approverRemark ?? '',
      });
    }

    return trail;
  }

  private formatDateTime(iso: string): string {
    try {
      return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    } catch {
      return iso;
    }
  }
}