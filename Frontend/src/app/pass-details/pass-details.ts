import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, interval, takeUntil, timeout, catchError, of, startWith } from 'rxjs';
import { PassStateService, PassRecord, WorkflowStatus } from '../services/pass-state.service';
import { API_CONFIG } from '../core/api.config';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// Interview Term: "Magic Numbers" — extract constants so they are easy to change
// and explain during code review
// ─────────────────────────────────────────────────────────────────────────────
const REFRESH_INTERVAL_MS = 30_000;  // Poll DB every 30 seconds
const HTTP_TIMEOUT_MS     = 12_000;  // Abort HTTP call if > 12 seconds

// ─────────────────────────────────────────────────────────────────────────────
// PURE FUNCTION — DB Status → Workflow Status mapping
// Interview Term: "Pure Function" — no side effects, same input = same output
// Keeps component logic clean and testable
// ─────────────────────────────────────────────────────────────────────────────
function dbStatusToWorkflow(dbStatus: string): WorkflowStatus {
  switch ((dbStatus || '').toLowerCase()) {
    case 'submitted'         : return 'Submitted';
    case 'confirmed'         : return 'Confirmed';
    case 'active'            : return 'Approved';
    case 'rejected'          : return 'Confirmation_Rejected';
    case 'surrendered'       : return 'Approval_Rejected';
    case 'expired'           : return 'Approval_Rejected';
    case 'needs_modification': return 'Submitted'; // treat as re-submitted
    default                  : return 'Submitted';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACE — shape of a raw document record from the backend API
// Interview Term: "Interface / Type Contract" — enforces the shape of data
// TypeScript uses this at compile-time, not runtime
// ─────────────────────────────────────────────────────────────────────────────
interface LiveDocRecord {
  documentId  : number;
  documentType: string;
  documentNo  : string;
  expiryDate  : string;
  fileName   ?: string;
  vehicle    ?: { vehicleId: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// Interview Term: "Standalone Component" — no NgModule needed, self-contained
// templateUrl/styleUrl = external files (separation of concerns)
// ─────────────────────────────────────────────────────────────────────────────
@Component({
  selector   : 'app-pass-details',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './pass-details.html',
  styleUrl   : './pass-details.css',
})
export class PassDetails implements OnInit, OnDestroy {

  // ── DEPENDENCY INJECTION ──────────────────────────────────────────────────
  // Interview Term: inject() = function-based DI (Angular 14+)
  // Alternative is constructor injection — both achieve the same result
  private svc    = inject(PassStateService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);
  private http   = inject(HttpClient);

  // Interview Term: "Subject" = RxJS manual trigger
  // destroy$ is used with takeUntil() to cancel all subscriptions when
  // component is destroyed — PREVENTS MEMORY LEAKS
  private readonly destroy$ = new Subject<void>();

  // Interview Term: "HttpHeaders" — sent with every API request
  // x-api-key is a common API authentication strategy (API Key Auth)
  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
  });

  // ── SYNC STATE SIGNALS ────────────────────────────────────────────────────
  // Interview Term: "signal()" = Angular Signals (introduced in Angular 17)
  // Signals are synchronous, fine-grained reactive state — no Zone.js needed
  protected isSyncing    = signal(false);
  protected lastSyncedAt = signal<string>('');
  protected syncError    = signal('');
  protected pdfLoading   = signal<number | null>(null);
  protected pdfError     = signal<string>('');

  // ── LOADING STATE FOR PASSES ──────────────────────────────────────────────
  protected isLoadingPasses = signal(false);
  protected passLoadError   = signal('');

  // ── DOCUMENT STATE ────────────────────────────────────────────────────────
  protected liveDocuments = signal<LiveDocRecord[]>([]);
  protected isLoadingDocs = signal(false);
  protected docLoadError  = signal('');
  protected docPassId     = signal<string | null>(null);

  // Separate doc state for modification cards — prevents conflict with
  // submitted tab docs when both tabs are toggled
  protected modLiveDocuments = signal<LiveDocRecord[]>([]);
  protected modIsLoadingDocs = signal(false);
  protected modDocLoadError  = signal('');
  protected modDocPassId     = signal<number | null>(null);

  protected resumingPassId = signal<number | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ DB-FIRST DATA SIGNALS
  // Interview Term: "DB-First Architecture"
  // Data comes from the API (your Spring Boot backend at 192.168.8.28)
  // Works on ANY PC on the same network — not tied to browser localStorage
  // Old: this.svc.submittedPasses  ← localStorage (only works on 1 PC)
  // New: signal([]) filled by HTTP ← DB (works on all PCs on same network)
  // ─────────────────────────────────────────────────────────────────────────
  protected submittedPasses = signal<PassRecord[]>([]);
  protected savedDrafts     = signal<PassRecord[]>([]);

  // Modification passes — already DB-driven, no change needed
  modificationPasses = signal<any[]>([]);
  isLoadingMod       = signal(false);
  modLoadError       = signal('');

  // ── UI STATE ──────────────────────────────────────────────────────────────
  protected searchTerm      = signal('');
  protected activeTab       = signal<'submitted' | 'drafts' | 'modification'>('submitted');
  protected expandedId      = signal<string | null>(null);
  protected confirmDeleteId = signal<string | null>(null);
  protected filterStatus    = signal<string>('ALL');

  // ── STATUS FILTER OPTIONS ─────────────────────────────────────────────────
  protected readonly statusOptions: { value: string; label: string }[] = [
    { value: 'ALL',                   label: 'All Statuses'          },
    { value: 'Submitted',             label: 'Pending Confirmation'  },
    { value: 'Confirmed',             label: 'Pending Approval'      },
    { value: 'Approved',              label: 'Approved'              },
    { value: 'Confirmation_Rejected', label: 'Returned by Confirmer' },
    { value: 'Approval_Rejected',     label: 'Returned by Approver'  },
  ];

  // ── COMPUTED SIGNALS ──────────────────────────────────────────────────────
  // Interview Term: "computed()" = derived state
  // Recalculates automatically when any signal it reads changes
  // Zero manual subscriptions needed — Angular tracks dependencies
  protected statusCounts = computed<Record<string, number>>(() => {
    const passes = this.submittedPasses();
    const counts: Record<string, number> = { ALL: passes.length };
    for (const p of passes) {
      const ws = p.workflowStatus ?? 'Submitted';
      counts[ws] = (counts[ws] ?? 0) + 1;
    }
    return counts;
  });

  protected filteredSubmitted = computed(() => {
    const term   = this.searchTerm().toLowerCase().trim();
    const status = this.filterStatus();
    return this.submittedPasses().filter(p => {
      const matchSearch = !term || (
        p.passId.toLowerCase().includes(term)                    ||
        p.vehicleNo.toLowerCase().includes(term)                 ||
        p.empName.toLowerCase().includes(term)                   ||
        p.ecNo.toLowerCase().includes(term)                      ||
        p.gateNo.toLowerCase().includes(term)                    ||
        (p.contractorFirm || '').toLowerCase().includes(term)
      );
      const matchStatus = status === 'ALL' || (p.workflowStatus ?? 'Submitted') === status;
      return matchSearch && matchStatus;
    });
  });

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

  protected activeList = computed(() =>
    this.activeTab() === 'submitted'
      ? this.filteredSubmitted()
      : this.filteredDrafts()
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE HOOKS
  // Interview Term: "ngOnInit" = runs after component is created & inputs set
  // Interview Term: "ngOnDestroy" = cleanup before component is removed from DOM
  // ─────────────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    // Read query params — e.g. ?tab=modification&filter=Approved
    // Interview Term: "ActivatedRoute" = gives access to current URL params
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        if (params['tab'] === 'submitted')         this.activeTab.set('submitted');
        else if (params['tab'] === 'drafts')       this.activeTab.set('drafts');
        else if (params['tab'] === 'modification') this.activeTab.set('modification');
        if (params['filter']) this.filterStatus.set(params['filter']);
      });

    // Interview Term: "Polling with interval + startWith(0)"
    // startWith(0) fires immediately so first load doesn't wait 30 seconds
    // interval(30_000) then fires every 30s for live updates
    // takeUntil(destroy$) cancels polling when component is destroyed
    interval(REFRESH_INTERVAL_MS)
      .pipe(startWith(0), takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadAllPassesFromDB();
        this.loadModificationPasses();
      });
  }

  ngOnDestroy(): void {
    // Interview Term: "Memory Leak Prevention"
    // next() triggers all takeUntil() operators to unsubscribe
    // complete() closes the Subject permanently
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ DB-FIRST PASS LOADER — replaces syncStatusFromDB()
  // Interview Term: "Single Source of Truth" — only DB has the real data
  // Loads submitted passes AND drafts from API in one call
  // Works on any PC that can reach http://192.168.8.28:<port>
  // ─────────────────────────────────────────────────────────────────────────
  private loadAllPassesFromDB(): void {
    this.isLoadingPasses.set(true);
    this.isSyncing.set(true);
    this.syncError.set('');

    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(
        // Interview Term: "timeout operator" — RxJS operator that throws
        // TimeoutError if the observable doesn't emit within given ms
        timeout(HTTP_TIMEOUT_MS),
        // Interview Term: "takeUntil" — unsubscribes when destroy$ fires
        takeUntil(this.destroy$),
        // Interview Term: "catchError" — intercepts errors, returns safe fallback
        // of([]) creates an Observable that immediately emits empty array
        catchError(err => {
          this.syncError.set(
            'Could not reach server (' + (err?.status || 'network error') + '). Retrying in 30s.'
          );
          this.isLoadingPasses.set(false);
          this.isSyncing.set(false);
          return of([]);
        })
      )
      .subscribe(data => {
        if (!Array.isArray(data)) {
          this.isLoadingPasses.set(false);
          this.isSyncing.set(false);
          return;
        }

        // Interview Term: "Array.filter + Array.map" = functional programming
        // filter: keeps only matching items
        // map: transforms each item — here DB row → PassRecord
        // Interview Term: "Method Chaining" — filter → map → sort in one pipeline
        // sort((a, b) => b - a) = descending order (latest passId / date at top)
        const submitted = data
          .filter(p => {
            const s = (p.status || '').toLowerCase();
            return s !== 'draft' && s !== 'needs_modification';
          })
          .map(p => this.mapDbPassToRecord(p))
          // ✅ Sort by passId descending — highest passId = most recently created
          .sort((a, b) => {
            const aId = parseInt(a.passId.replace(/\D/g, ''), 10) || 0;
            const bId = parseInt(b.passId.replace(/\D/g, ''), 10) || 0;
            return bId - aId; // descending — latest pass at top
          });

        const drafts = data
          .filter(p => (p.status || '').toLowerCase() === 'draft')
          .map(p => this.mapDbPassToRecord(p))
          // ✅ Same sort for drafts
          .sort((a, b) => {
            const aId = parseInt(a.passId.replace(/\D/g, ''), 10) || 0;
            const bId = parseInt(b.passId.replace(/\D/g, ''), 10) || 0;
            return bId - aId;
          });

        this.submittedPasses.set(submitted);
        this.savedDrafts.set(drafts);

        // Also upsert into PassStateService so other components (KPI cards etc.)
        // stay in sync — keeps backward compatibility with BroadcastChannel
        for (const record of submitted) {
          this.svc.upsert(record);
        }

        this.isLoadingPasses.set(false);
        this.isSyncing.set(false);
        this.lastSyncedAt.set(
          new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
        );
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ DB → PassRecord MAPPER
  // Interview Term: "DTO Mapping / Data Transformation Layer"
  // DTO = Data Transfer Object — the raw API response shape
  // PassRecord = your frontend model shape
  // Separating this into its own method = Single Responsibility Principle (SRP)
  // ─────────────────────────────────────────────────────────────────────────
  private mapDbPassToRecord(p: any): PassRecord {
    return {
      passId        : `PASS-HEG-${String(p.passId).padStart(4, '0')}`,
      empType       : p.empType              ?? 'Company_Employee',
      vehicleNo     : p.vehicle?.vehicleNo   ?? p.typeOfVehicle   ?? '',
      vehicleType   : p.vehicle?.vehicleType ?? p.typeOfVehicle   ?? '',
      vehicleClass  : p.vehicle?.vehicleClass ?? '',
      brandModel    : p.vehicle?.brandModel   ?? '',
      ecNo          : p.employeeNo           ?? '',
      empName       : p.empName              ?? p.employeeName    ?? '',
      empDept       : p.dept                 ?? p.department      ?? '',
      contractorFirm: p.contractorCode       ?? '',
      // issueDate from enterDate (when record was created in DB)
      issueDate     : p.enterDate            ? p.enterDate.split('T')[0]    : '',
      validityDate  : p.validityDate         ? p.validityDate.split('T')[0] : '',
      gateNo        : p.gateNo              ?? p.assignedGate     ?? '',
      parkingArea   : p.parkingToBeUsed     ?? '',
      remark        : p.remarks             ?? '',
      docs          : [],  // docs loaded separately on card expand (lazy load)
      // status kept for backward compat with PassStateService
      status        : 'Submitted' as const,
      createdAt     : p.enterDate
        ? new Date(p.enterDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : '',
      workflowStatus : dbStatusToWorkflow(p.status ?? ''),
      submittedBy    : p.enterBy    ?? '',
      submittedAt    : p.enterDate  ?? '',
      mobileNo       : p.mobileNo   ?? '',
      // confirmer / approver info from DB
      confirmedBy    : p.confirmedBy    ?? undefined,
      confirmedAt    : p.confirmedAt    ?? undefined,
      confirmerRemark: p.confirmerRemark ?? p.remarks ?? undefined,
      approvedBy     : p.approvedBy     ?? undefined,
      approvedAt     : p.approvedAt     ?? undefined,
      approverRemark : p.approverRemark ?? undefined,
    } as PassRecord;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODIFICATION REQUESTS LOADER — already DB-driven, kept exactly as before
  // Only fix: use AuthService pattern (localStorage fallback kept for compat)
  // ─────────────────────────────────────────────────────────────────────────
  loadModificationPasses(): void {
    this.isLoadingMod.set(true);
    this.modLoadError.set('');
    const userName = localStorage.getItem('vpsm_userName') || '';

    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          this.modLoadError.set(
            'Could not load modification requests (' + (err?.status || 'network error') + ')'
          );
          this.isLoadingMod.set(false);
          return of([]);
        })
      )
      .subscribe(data => {
        const list = (Array.isArray(data) ? data : []).filter(p =>
          (p.status || '').toLowerCase() === 'needs_modification' &&
          (p.enterBy || '').toLowerCase() === userName.toLowerCase()
        );
        this.modificationPasses.set(list);
        this.isLoadingMod.set(false);
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MANUAL REFRESH — called by Refresh button in template
  // ─────────────────────────────────────────────────────────────────────────
  protected refreshNow(): void {
    this.loadAllPassesFromDB();
    this.loadModificationPasses();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE DOCUMENT FETCH — Submitted tab (string passId e.g. PASS-HEG-0092)
  // Interview Term: "Lazy Loading" — docs are only fetched when card is opened
  // not loaded upfront for all passes (saves bandwidth and API calls)
  // ─────────────────────────────────────────────────────────────────────────
  private loadLiveDocs(passId: string): void {
    this.isLoadingDocs.set(true);
    this.docLoadError.set('');
    this.liveDocuments.set([]);
    const numericId = parseInt(passId.replace(/\D/g, ''), 10);
    this.fetchDocsByNumericPassId(
      numericId,
      (docs) => { this.liveDocuments.set(docs); this.isLoadingDocs.set(false); },
      (err)  => { this.docLoadError.set(err);   this.isLoadingDocs.set(false); }
    );
  }

  // LIVE DOCUMENT FETCH — Modification tab (numeric passId from DB)
  loadModLiveDocs(p: any): void {
    const numericId = Number(p.passId);
    if (this.modDocPassId() === numericId) return; // already loaded — skip
    this.modIsLoadingDocs.set(true);
    this.modDocLoadError.set('');
    this.modLiveDocuments.set([]);
    this.modDocPassId.set(numericId);
    const vehicleId = p.vehicle?.vehicleId ?? null;
    if (vehicleId) {
      this.fetchDocsByVehicleId(
        vehicleId,
        (docs) => { this.modLiveDocuments.set(docs); this.modIsLoadingDocs.set(false); },
        (err)  => { this.modDocLoadError.set(err);   this.modIsLoadingDocs.set(false); }
      );
    } else {
      this.fetchDocsByNumericPassId(
        numericId,
        (docs) => { this.modLiveDocuments.set(docs); this.modIsLoadingDocs.set(false); },
        (err)  => { this.modDocLoadError.set(err);   this.modIsLoadingDocs.set(false); }
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED DOCUMENT FETCH HELPERS
  // Interview Term: "DRY Principle" = Don't Repeat Yourself
  // Both submitted & modification tabs reuse these private helpers
  // Callbacks (onSuccess/onError) = "Strategy Pattern" for different handlers
  // ─────────────────────────────────────────────────────────────────────────
  private fetchDocsByVehicleId(
    vehicleId: number,
    onSuccess: (docs: LiveDocRecord[]) => void,
    onError  : (msg: string) => void
  ): void {
    this.http.get<LiveDocRecord[]>(API_CONFIG.DOCUMENTS, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          onError('Could not load documents (' + (err?.status || 'network error') + ')');
          return of([]);
        })
      )
      .subscribe(docs => {
        const filtered = (docs || []).filter(d => d.vehicle?.vehicleId === vehicleId);
        filtered.length
          ? onSuccess(filtered)
          : onError('No documents found for this vehicle.');
      });
  }

  private fetchDocsByNumericPassId(
    numericId: number,
    onSuccess: (docs: LiveDocRecord[]) => void,
    onError  : (msg: string) => void
  ): void {
    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          onError('Could not load documents (' + (err?.status || 'network error') + ')');
          return of([]);
        })
      )
      .subscribe(dbPasses => {
        const matched   = (dbPasses || []).find((d: any) => d.passId === numericId);
        const vehicleId = matched?.vehicle?.vehicleId ?? null;
        if (!vehicleId) { onError('No vehicle linked to this pass.'); return; }
        this.fetchDocsByVehicleId(vehicleId, onSuccess, onError);
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW DOCUMENT PDF — unchanged from original
  // Interview Term: "Blob + createObjectURL" — downloads binary data from API
  // and creates a temporary browser URL to open PDF without saving to disk
  // ─────────────────────────────────────────────────────────────────────────
  protected viewDocumentPdf(
    doc: { documentId?: number; fileName?: string },
    event: Event
  ): void {
    event.stopPropagation();
    if (!doc?.documentId || !doc?.fileName) {
      this.pdfError.set('No file attached to this document.');
      setTimeout(() => this.pdfError.set(''), 3500);
      return;
    }
    this.pdfLoading.set(doc.documentId);
    this.pdfError.set('');
    const url = `${API_CONFIG.DOCUMENTS_DOWNLOAD}?id=${doc.documentId}`;
    this.http.get(url, { responseType: 'blob', headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(() => {
          this.pdfError.set('Could not load file. It may not have been uploaded yet.');
          this.pdfLoading.set(null);
          setTimeout(() => this.pdfError.set(''), 4000);
          return of(null);
        })
      )
      .subscribe((blob: Blob | null) => {
        this.pdfLoading.set(null);
        if (!blob) return;
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        // Interview Term: "setTimeout for cleanup" — revoke URL after 30s
        // to free browser memory (createObjectURL holds reference in memory)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DOWNLOAD PASS — unchanged from original
  // Interview Term: "window.open + document.write" — programmatic print dialog
  // Generates an HTML slip in memory and opens browser print preview
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
    .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #999;
              border-top: 1px solid #eee; padding-top: 12px; }
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
    ${pass.contractorFirm
      ? `<tr><td>Contractor Firm</td><td>${pass.contractorFirm}</td></tr>` : ''}
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
  // UI HANDLERS — unchanged from original
  // ─────────────────────────────────────────────────────────────────────────
  protected toggle(passId: string): void {
    const isOpening = this.expandedId() !== passId;
    this.expandedId.update(cur => cur === passId ? null : passId);
    if (isOpening) {
      this.liveDocuments.set([]);
      this.docLoadError.set('');
      this.docPassId.set(passId);
      this.loadLiveDocs(passId);
    }
  }

  toggleMod(p: any): void {
    const key       = String(p.passId);
    const isOpening = this.expandedId() !== key;
    this.expandedId.update(cur => cur === key ? null : key);
    if (isOpening) {
      this.modDocPassId.set(null);
      this.loadModLiveDocs(p);
    }
  }

  protected onSearch(e: Event): void {
    this.searchTerm.set((e.target as HTMLInputElement).value);
  }

  protected onFilterStatus(value: string): void {
    this.filterStatus.set(value);
  }

  protected setTab(tab: 'submitted' | 'drafts' | 'modification'): void {
    this.activeTab.set(tab);
    this.expandedId.set(null);
    this.searchTerm.set('');
    this.filterStatus.set('ALL');
    this.liveDocuments.set([]);
    this.docLoadError.set('');
    this.docPassId.set(null);
    this.modLiveDocuments.set([]);
    this.modDocLoadError.set('');
    this.modDocPassId.set(null);
    if (tab === 'modification') this.loadModificationPasses();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESUME MODIFICATION — unchanged from original
  // Interview Term: "localStorage as temporary navigation state"
  // Stores pre-fill data temporarily so pass-entry form can read it on load
  // ─────────────────────────────────────────────────────────────────────────
  resumeModification(p: any): void {
    this.resumingPassId.set(Number(p.passId));
    const vehicleId = p.vehicle?.vehicleId ?? null;

    const buildAndNavigate = (docs: LiveDocRecord[]) => {
      const docMeta = docs.map(d => ({
        docType   : (d.documentType || '').toUpperCase().trim(),
        docNo     : d.documentNo   || '',
        validUpto : d.expiryDate   ? d.expiryDate.split('T')[0] : '',
        fileName  : d.fileName     || '',
        documentId: d.documentId,
      }));
      const resumeData = {
        passId         : p.passId,
        empType        : p.empType              || '',
        vehicleNo      : p.vehicle?.vehicleNo   || '',
        vehicleType    : p.vehicle?.vehicleType  || p.typeOfVehicle || '',
        vehicleClass   : p.vehicle?.vehicleClass || '',
        brandModel     : p.vehicle?.brandModel   || '',
        ecNo           : p.employeeNo            || '',
        empName        : p.empName               || '',
        empDept        : p.dept                  || '',
        contractorFirm : p.contractorCode        || '',
        validityDate   : p.validityDate          ? p.validityDate.split('T')[0] : '',
        gateNo         : p.gateNo                || '',
        parkingArea    : p.parkingToBeUsed        || '',
        remark         : p.remarks               || '',
        confirmerRemark: p.remarks               || '',
        docs           : docMeta,
        status         : 'Needs_Modification',
        createdAt      : p.enterDate             || '',
        mobileNo       : p.mobileNo              || '',
      };
      localStorage.setItem('vpsm_resume_modification', JSON.stringify(resumeData));
      this.resumingPassId.set(null);
      this.router.navigate(['/pass-entry']);
    };

    const doFetch = (vId: number) => {
      this.fetchDocsByVehicleId(
        vId,
        (docs) => buildAndNavigate(docs),
        (_err) => buildAndNavigate([])
      );
    };

    if (vehicleId) {
      doFetch(vehicleId);
    } else {
      this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
        .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$), catchError(() => of([])))
        .subscribe(dbPasses => {
          const matched = (dbPasses || []).find((d: any) => d.passId === Number(p.passId));
          const vid     = matched?.vehicle?.vehicleId ?? null;
          if (vid) doFetch(vid);
          else     buildAndNavigate([]);
        });
    }
  }

  protected resumeDraft(pass: PassRecord): void {
    try { localStorage.setItem('vpsm_resume_draft', JSON.stringify(pass)); } catch {}
    this.router.navigate(['/pass-entry']);
  }

  protected askDelete(passId: string):     void { this.confirmDeleteId.set(passId); }
  protected cancelDelete():                void { this.confirmDeleteId.set(null);   }
  protected confirmDelete(passId: string): void {
    this.svc.deleteDraft(passId);
    // Also remove from local signal so UI updates instantly
    this.savedDrafts.update(list => list.filter(p => p.passId !== passId));
    this.confirmDeleteId.set(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LABEL / FORMAT HELPERS — pure functions, unchanged from original
  // Interview Term: "Helper/Utility Methods" — stateless, reusable, testable
  // ─────────────────────────────────────────────────────────────────────────
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

  protected workflowLabel(p: PassRecord): string {
    return this.svc.getStatusLabel(p.workflowStatus);
  }

  protected workflowClass(p: PassRecord): string {
    return this.svc.getStatusClass(p.workflowStatus);
  }

  protected workflowTrail(
    p: PassRecord
  ): { label: string; by: string; at: string; remark: string }[] {
    const trail: { label: string; by: string; at: string; remark: string }[] = [];
    trail.push({
      label : 'Submitted',
      by    : p.submittedBy ?? 'REQUESTER',
      at    : p.submittedAt ? this.formatDateTime(p.submittedAt) : p.createdAt,
      remark: '',
    });
    if (p.confirmedAt) {
      trail.push({
        label : p.workflowStatus === 'Confirmation_Rejected'
                  ? 'Returned by Confirmer' : 'Confirmed',
        by    : p.confirmedBy    ?? '—',
        at    : this.formatDateTime(p.confirmedAt),
        remark: p.confirmerRemark ?? '',
      });
    }
    if (p.approvedAt) {
      trail.push({
        label : p.workflowStatus === 'Approval_Rejected'
                  ? 'Returned by Approver' : 'Approved',
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