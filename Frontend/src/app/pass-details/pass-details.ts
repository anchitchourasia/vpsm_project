import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, interval, takeUntil, timeout, catchError, of, startWith } from 'rxjs';
import { PassStateService, PassRecord, WorkflowStatus } from '../services/pass-state.service';
import { API_CONFIG } from '../core/api.config';

const REFRESH_INTERVAL_MS = 30_000;  // auto-refresh every 30 seconds
const HTTP_TIMEOUT_MS     = 12_000;

/** Maps raw DB status string → WorkflowStatus used by PassStateService */
function dbStatusToWorkflow(dbStatus: string): WorkflowStatus {
  switch ((dbStatus || '').toLowerCase()) {
    case 'submitted'  : return 'Submitted';
    case 'confirmed'  : return 'Confirmed';
    case 'active'     : return 'Approved';
    case 'rejected'   : return 'Confirmation_Rejected';
    case 'surrendered': return 'Approval_Rejected';   // closest valid match
    case 'expired'    : return 'Approval_Rejected';   // closest valid match
    default           : return 'Submitted';
  }
}

@Component({
  selector   : 'app-pass-details',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './pass-details.html',
  styleUrl   : './pass-details.css',
})
export class PassDetails implements OnInit, OnDestroy {

  private svc    = inject(PassStateService);
  private router = inject(Router);
  private http   = inject(HttpClient);

  private readonly destroy$     = new Subject<void>();
  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
  });

  // ── NEW: Live sync state ──────────────────────────────────────────────────
  protected isSyncing       = signal(false);
  protected lastSyncedAt    = signal<string>('');
  protected syncError       = signal('');

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

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Immediate sync on page load + auto-refresh every 30s
    interval(REFRESH_INTERVAL_MS)
      .pipe(startWith(0), takeUntil(this.destroy$))
      .subscribe(() => this.syncStatusFromDB());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REAL-TIME DB SYNC — fetches all passes from backend, merges status into
  // local PassStateService records so badges update without page reload
  // ─────────────────────────────────────────────────────────────────────────

  protected refreshNow(): void {
    this.syncStatusFromDB();
  }

  private syncStatusFromDB(): void {
    // Nothing to sync if no submitted passes exist locally
    const localPasses = this.svc.submittedPasses();
    if (!localPasses.length) return;

    this.isSyncing.set(true);
    this.syncError.set('');

    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.warn('[PassDetails] Sync failed:', err?.status);
          this.syncError.set('Could not reach server. Showing last known status.');
          this.isSyncing.set(false);
          return of([]);
        })
      )
      .subscribe(dbPasses => {
        if (!dbPasses?.length) {
          this.isSyncing.set(false);
          return;
        }

        // For each local submitted pass, find matching DB record and sync status
        for (const local of localPasses) {
          const dbMatch = this.findDbMatch(local, dbPasses);
          if (!dbMatch) continue;

          const dbStatus       = dbMatch.status as string;
          const workflowStatus = dbStatusToWorkflow(dbStatus);

          // Build updated record — preserve ALL existing local fields
          const updated: PassRecord = {
            ...local,
            workflowStatus,
            // Sync confirmer info from DB remarks/enterBy when confirmed/rejected
            ...(
              ['confirmed', 'rejected'].includes(dbStatus.toLowerCase()) && {
                confirmedBy    : dbMatch.enterBy   || local.confirmedBy,
                confirmedAt    : dbMatch.enterDate  || local.confirmedAt,
                confirmerRemark: dbMatch.remarks    || local.confirmerRemark,
              }
            ),
            // Sync approver info from DB when active (approved)
            ...(
              dbStatus.toLowerCase() === 'active' && {
                approvedBy    : dbMatch.enterBy  || local.approvedBy,
                approvedAt    : dbMatch.enterDate || local.approvedAt,
                approverRemark: dbMatch.remarks   || local.approverRemark,
                confirmedBy   : local.confirmedBy || dbMatch.enterBy,
              }
            ),
          };

          this.svc.upsert(updated);
        }

        this.isSyncing.set(false);
        this.lastSyncedAt.set(
          new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
        );
      });
  }

  /**
   * Match local PassRecord to a DB record.
   * Strategy: match by numeric DB passId embedded in formatted passId string,
   * OR fallback match by vehicleNo + employeeNo.
   */
  private findDbMatch(local: PassRecord, dbPasses: any[]): any | null {
    // Primary: extract numeric id from "PASS-HEG-0058" → 58
    const numericId = parseInt(local.passId.replace(/\D/g, ''), 10);
    if (!isNaN(numericId)) {
      const byId = dbPasses.find(d => d.passId === numericId);
      if (byId) return byId;
    }

    // Fallback: match by vehicleNo + employeeNo
    return dbPasses.find(d =>
      (d.vehicle?.vehicleNo || '').toUpperCase() === (local.vehicleNo || '').toUpperCase() &&
      (d.employeeNo || '') === (local.ecNo || '')
    ) ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ALL EXISTING HANDLERS — completely unchanged
  // ─────────────────────────────────────────────────────────────────────────

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

  // ── Workflow helpers (existing — unchanged) ───────────────────────────────

  protected workflowLabel(p: PassRecord): string {
    return this.svc.getStatusLabel(p.workflowStatus);
  }

  protected workflowClass(p: PassRecord): string {
    return this.svc.getStatusClass(p.workflowStatus);
  }

  protected workflowTrail(p: PassRecord): {
    label: string; by: string; at: string; remark: string
  }[] {
    const trail: { label: string; by: string; at: string; remark: string }[] = [];

    // Stage 1 — always present
    trail.push({
      label : 'Submitted',
      by    : p.submittedBy  ?? 'REQUESTER',
      at    : p.submittedAt  ? this.formatDateTime(p.submittedAt) : p.createdAt,
      remark: '',
    });

    // Stage 2 — confirmer acted
    if (p.confirmedAt) {
      trail.push({
        label : p.workflowStatus === 'Confirmation_Rejected'
                  ? 'Returned by Confirmer'
                  : 'Confirmed',
        by    : p.confirmedBy    ?? '—',
        at    : this.formatDateTime(p.confirmedAt),
        remark: p.confirmerRemark ?? '',
      });
    }

    // Stage 3 — approver acted
    if (p.approvedAt) {
      trail.push({
        label : p.workflowStatus === 'Approval_Rejected'
                  ? 'Returned by Approver'
                  : 'Approved',
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