import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, interval, takeUntil, timeout, catchError, of, startWith } from 'rxjs';
import { PassStateService, PassRecord, WorkflowStatus } from '../services/pass-state.service';
import { API_CONFIG } from '../core/api.config';

const REFRESH_INTERVAL_MS = 30_000;
const HTTP_TIMEOUT_MS     = 12_000;

/** Maps raw DB status string → WorkflowStatus used by PassStateService */
function dbStatusToWorkflow(dbStatus: string): WorkflowStatus {
  switch ((dbStatus || '').toLowerCase()) {
    case 'submitted'  : return 'Submitted';
    case 'confirmed'  : return 'Confirmed';
    case 'active'     : return 'Approved';
    case 'rejected'   : return 'Confirmation_Rejected';
    case 'surrendered': return 'Approval_Rejected';
    case 'expired'    : return 'Approval_Rejected';
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

  private readonly destroy$  = new Subject<void>();
  private readonly HEADERS   = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
  });

  // ── Live sync state ───────────────────────────────────────────────────────
  protected isSyncing    = signal(false);
  protected lastSyncedAt = signal<string>('');
  protected syncError    = signal('');

  // ── Data sources ──────────────────────────────────────────────────────────
  protected readonly submittedPasses = this.svc.submittedPasses;
  protected readonly savedDrafts     = this.svc.savedDrafts;

  // ── UI State ──────────────────────────────────────────────────────────────
  protected searchTerm      = signal('');
  protected activeTab       = signal<'submitted' | 'drafts'>('submitted');
  protected expandedId      = signal<string | null>(null);
  protected confirmDeleteId = signal<string | null>(null);

  // ── NEW: Status filter signal ─────────────────────────────────────────────
  protected filterStatus = signal<string>('ALL');

  // ── Status filter options shown as chips ─────────────────────────────────
  protected readonly statusOptions: { value: string; label: string }[] = [
    { value: 'ALL',                   label: 'All Statuses'          },
    { value: 'Submitted',             label: 'Pending Confirmation'  },
    { value: 'Confirmed',             label: 'Pending Approval'      },
    { value: 'Approved',              label: 'Approved'              },
    { value: 'Confirmation_Rejected', label: 'Returned by Confirmer' },
    { value: 'Approval_Rejected',     label: 'Returned by Approver'  },
  ];

  // ── Per-status counts for chips ───────────────────────────────────────────
  protected statusCounts = computed(() => {
    const passes = this.submittedPasses();
    const counts: Record<string, number> = { ALL: passes.length };
    for (const p of passes) {
      const ws = p.workflowStatus ?? 'Submitted';
      counts[ws] = (counts[ws] ?? 0) + 1;
    }
    return counts;
  });

  // ── Filtered submitted passes (search + status filter) ───────────────────
  protected filteredSubmitted = computed(() => {
    const term   = this.searchTerm().toLowerCase().trim();
    const status = this.filterStatus();

    return this.submittedPasses().filter(p => {
      const matchSearch = !term || (
        p.passId.toLowerCase().includes(term)         ||
        p.vehicleNo.toLowerCase().includes(term)      ||
        p.empName.toLowerCase().includes(term)        ||
        p.ecNo.toLowerCase().includes(term)           ||
        p.gateNo.toLowerCase().includes(term)         ||
        (p.contractorFirm || '').toLowerCase().includes(term)
      );
      const matchStatus = status === 'ALL' || (p.workflowStatus ?? 'Submitted') === status;
      return matchSearch && matchStatus;
    });
  });

  // ── Filtered drafts (search only) ────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    interval(REFRESH_INTERVAL_MS)
      .pipe(startWith(0), takeUntil(this.destroy$))
      .subscribe(() => this.syncStatusFromDB());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REAL-TIME DB SYNC
  // ─────────────────────────────────────────────────────────────────────────

  protected refreshNow(): void {
    this.syncStatusFromDB();
  }

  private syncStatusFromDB(): void {
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

        for (const local of localPasses) {
          const dbMatch = this.findDbMatch(local, dbPasses);
          if (!dbMatch) continue;

          const dbStatus       = dbMatch.status as string;
          const workflowStatus = dbStatusToWorkflow(dbStatus);

          const updated: PassRecord = {
            ...local,
            workflowStatus,
            ...(
              ['confirmed', 'rejected'].includes(dbStatus.toLowerCase()) && {
                confirmedBy    : dbMatch.enterBy   || local.confirmedBy,
                confirmedAt    : dbMatch.enterDate  || local.confirmedAt,
                confirmerRemark: dbMatch.remarks    || local.confirmerRemark,
              }
            ),
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

  private findDbMatch(local: PassRecord, dbPasses: any[]): any | null {
    const numericId = parseInt(local.passId.replace(/\D/g, ''), 10);
    if (!isNaN(numericId)) {
      const byId = dbPasses.find(d => d.passId === numericId);
      if (byId) return byId;
    }
    return dbPasses.find(d =>
      (d.vehicle?.vehicleNo || '').toUpperCase() === (local.vehicleNo || '').toUpperCase() &&
      (d.employeeNo || '') === (local.ecNo || '')
    ) ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NEW: DOWNLOAD PASS — opens a printable slip in a new tab
  // ─────────────────────────────────────────────────────────────────────────

  protected downloadPass(pass: PassRecord, event: Event): void {
    event.stopPropagation();

    const slip = `<!DOCTYPE html>
<html>
<head>
  <title>Vehicle Pass — ${pass.passId}</title>
  <style>
    body  { font-family: Arial, sans-serif; padding: 32px; max-width: 640px; margin: auto; color: #1a1a1a; }
    h2    { text-align: center; margin-bottom: 4px; font-size: 20px; color: #1a237e; }
    .sub  { text-align: center; color: #666; font-size: 13px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    td    { padding: 8px 12px; border: 1px solid #ddd; font-size: 13px; }
    td:first-child { background: #f5f5f5; font-weight: 600; width: 40%; }
    .status-wrap { text-align: center; margin: 20px 0 8px; }
    .status { padding: 6px 20px; border-radius: 20px; font-weight: 700;
              font-size: 14px; background: #22c55e; color: #fff;
              display: inline-block; letter-spacing: .04em; }
    .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h2>HEG Limited — Vehicle Pass</h2>
  <p class="sub">Pass Management System &middot; Official Copy</p>
  <table>
    <tr><td>Pass ID</td><td><strong>${pass.passId}</strong></td></tr>
    <tr><td>Vehicle No</td><td>${pass.vehicleNo}</td></tr>
    <tr><td>Vehicle Type</td><td>${pass.vehicleType || '—'}</td></tr>
    <tr><td>Vehicle Class</td><td>${pass.vehicleClass}</td></tr>
    <tr><td>Brand / Model</td><td>${pass.brandModel || '—'}</td></tr>
    <tr><td>Employee Name</td><td>${pass.empName || '—'}</td></tr>
    <tr><td>EC No</td><td>${pass.ecNo || '—'}</td></tr>
    ${pass.contractorFirm ? `<tr><td>Contractor Firm</td><td>${pass.contractorFirm}</td></tr>` : ''}
    <tr><td>Department / Agency</td><td>${pass.empDept || '—'}</td></tr>
    <tr><td>Gate No</td><td>${pass.gateNo}</td></tr>
    <tr><td>Parking Area</td><td>${pass.parkingArea || '—'}</td></tr>
    <tr><td>Issue Date</td><td>${this.formatDate(pass.issueDate)}</td></tr>
    <tr><td>Valid Till</td><td>${this.formatDate(pass.validityDate)}</td></tr>
    <tr><td>Status</td><td>${this.workflowLabel(pass)}</td></tr>
    ${pass.remark ? `<tr><td>Remark</td><td>${pass.remark}</td></tr>` : ''}
  </table>
  <div class="status-wrap">
    <span class="status">${this.workflowLabel(pass).toUpperCase()}</span>
  </div>
  <div class="footer">
    Generated on ${new Date().toLocaleString('en-IN')} &middot; HEG Limited Vehicle Pass Management System
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(slip);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    }
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

  // NEW handler for filter chip clicks
  protected onFilterStatus(value: string): void {
    this.filterStatus.set(value);
  }

  protected setTab(tab: 'submitted' | 'drafts'): void {
    this.activeTab.set(tab);
    this.expandedId.set(null);
    this.searchTerm.set('');
    this.filterStatus.set('ALL'); // reset filter on tab switch
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

  // ── Workflow helpers ──────────────────────────────────────────────────────
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

    trail.push({
      label : 'Submitted',
      by    : p.submittedBy  ?? 'REQUESTER',
      at    : p.submittedAt  ? this.formatDateTime(p.submittedAt) : p.createdAt,
      remark: '',
    });

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