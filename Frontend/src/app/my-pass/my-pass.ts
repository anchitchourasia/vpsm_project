import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, interval, takeUntil, timeout, catchError, of, startWith } from 'rxjs';
import { PassStateService, PassRecord, WorkflowStatus } from '../services/pass-state.service';
import { API_CONFIG } from '../core/api.config';
import { AuthService } from '../core/auth.service';
import { ActivatedRoute } from '@angular/router';

const REFRESH_INTERVAL_MS = 30_000;
const HTTP_TIMEOUT_MS     = 12_000;

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

interface LiveDocRecord {
  documentId  : number;
  documentType: string;
  documentNo  : string;
  expiryDate  : string;
  fileName   ?: string;
  vehicle    ?: { vehicleId: number };
}

@Component({
  selector   : 'app-my-pass',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './my-pass.html',
  styleUrl   : './my-pass.css',
})
export class MyPass implements OnInit, OnDestroy {

  private svc    = inject(PassStateService);
  private router = inject(Router);
  private http   = inject(HttpClient);
  private auth   = inject(AuthService);
  private route  = inject(ActivatedRoute);

  private readonly destroy$ = new Subject<void>();

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
  });

  // ── Live sync state ────────────────────────────────────────────────
  protected isSyncing    = signal(false);
  protected lastSyncedAt = signal<string>('');
  protected syncError    = signal('');
  protected pdfLoading   = signal<number | null>(null);
  protected pdfError     = signal<string>('');

  // ── Live document state ────────────────────────────────────────────
  protected liveDocuments = signal<LiveDocRecord[]>([]);
  protected isLoadingDocs = signal(false);
  protected docLoadError  = signal('');
  protected docPassId     = signal<string | null>(null);

  // ── Modification card doc state ────────────────────────────────────
  protected modLiveDocuments = signal<LiveDocRecord[]>([]);
  protected modIsLoadingDocs = signal(false);
  protected modDocLoadError  = signal('');
  protected modDocPassId     = signal<number | null>(null);

  protected resumingPassId = signal<number | null>(null);

  // ── Logged-in empCode helper ───────────────────────────────────────
  protected myCode = computed(() => this.auth.empCode().trim().toLowerCase());

  // ── Data sources filtered to logged-in user ────────────────────────
  protected readonly submittedPasses = computed(() =>
    this.svc.submittedPasses().filter(p =>
      (p.ecNo || '').toLowerCase() === this.myCode() ||
      (p.submittedBy || '').toLowerCase() === this.myCode()
    )
  );

  protected readonly savedDrafts = computed(() =>
    this.svc.savedDrafts().filter(p =>
      (p.ecNo || '').toLowerCase() === this.myCode() ||
      (p.submittedBy || '').toLowerCase() === this.myCode()
    )
  );

  // ── Modification passes from DB ─────────────────────────────────────
  modificationPasses = signal<any[]>([]);
  isLoadingMod       = signal(false);
  modLoadError       = signal('');

  // ── UI State ───────────────────────────────────────────────────────
  protected searchTerm      = signal('');
  protected activeTab       = signal<'submitted' | 'drafts' | 'modification'>('submitted');
  protected expandedId      = signal<string | null>(null);
  protected confirmDeleteId = signal<string | null>(null);
  protected filterStatus    = signal<string>('ALL');

  protected readonly statusOptions: { value: string; label: string }[] = [
    { value: 'ALL',                   label: 'All Statuses'          },
    { value: 'Submitted',             label: 'Pending Confirmation'  },
    { value: 'Confirmed',             label: 'Pending Approval'      },
    { value: 'Approved',              label: 'Approved'              },
    { value: 'Confirmation_Rejected', label: 'Returned by Confirmer' },
    { value: 'Approval_Rejected',     label: 'Returned by Approver'  },
  ];

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

  // ── Lifecycle ──────────────────────────────────────────────────────
  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['tab'] === 'submitted')         this.activeTab.set('submitted');
      else if (params['tab'] === 'drafts')       this.activeTab.set('drafts');
      else if (params['tab'] === 'modification') this.activeTab.set('modification');
      if (params['filter']) this.filterStatus.set(params['filter']);
    });

    interval(REFRESH_INTERVAL_MS)
      .pipe(startWith(0), takeUntil(this.destroy$))
      .subscribe(() => {
        this.syncStatusFromDB();
        this.loadModificationPasses();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── DB Sync ────────────────────────────────────────────────────────
  protected refreshNow(): void { this.syncStatusFromDB(); }

  private syncStatusFromDB(): void {
    const localPasses = this.submittedPasses();
    if (!localPasses.length) { this.isSyncing.set(false); return; }
    this.isSyncing.set(true);
    this.syncError.set('');

    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          this.syncError.set('Could not reach server. Showing last known status.');
          this.isSyncing.set(false);
          return of([]);
        })
      )
      .subscribe(dbPasses => {
        if (!dbPasses?.length) { this.isSyncing.set(false); return; }
        for (const local of localPasses) {
          const dbMatch = this.findDbMatch(local, dbPasses);
          if (!dbMatch) continue;
          const updated: PassRecord = {
            ...local,
            workflowStatus: dbStatusToWorkflow(dbMatch.status),
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

  // ── Modification Passes ────────────────────────────────────────────
  loadModificationPasses(): void {
    this.isLoadingMod.set(true);
    this.modLoadError.set('');
    const myCode = this.auth.empCode().trim().toLowerCase();

    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          this.modLoadError.set('Could not load modification requests.');
          this.isLoadingMod.set(false);
          return of([]);
        })
      )
      .subscribe(data => {
        const list = (Array.isArray(data) ? data : []).filter(p =>
          (p.status || '').toLowerCase() === 'needs_modification' &&
          (p.enterBy || '').toLowerCase() === myCode
        );
        this.modificationPasses.set(list);
        this.isLoadingMod.set(false);
      });
  }

  // ── Live Document Fetch ────────────────────────────────────────────
  private loadLiveDocs(passId: string): void {
    this.isLoadingDocs.set(true);
    this.docLoadError.set('');
    this.liveDocuments.set([]);
    const numericId = parseInt(passId.replace(/\D/g, ''), 10);
    this.fetchDocsByNumericPassId(numericId,
      (docs) => { this.liveDocuments.set(docs); this.isLoadingDocs.set(false); },
      (err)  => { this.docLoadError.set(err);   this.isLoadingDocs.set(false); }
    );
  }

  loadModLiveDocs(p: any): void {
    const numericId = Number(p.passId);
    if (this.modDocPassId() === numericId) return;
    this.modIsLoadingDocs.set(true);
    this.modDocLoadError.set('');
    this.modLiveDocuments.set([]);
    this.modDocPassId.set(numericId);
    const vehicleId = p.vehicle?.vehicleId ?? null;
    if (vehicleId) {
      this.fetchDocsByVehicleId(vehicleId,
        (docs) => { this.modLiveDocuments.set(docs); this.modIsLoadingDocs.set(false); },
        (err)  => { this.modDocLoadError.set(err);   this.modIsLoadingDocs.set(false); }
      );
    } else {
      this.fetchDocsByNumericPassId(numericId,
        (docs) => { this.modLiveDocuments.set(docs); this.modIsLoadingDocs.set(false); },
        (err)  => { this.modDocLoadError.set(err);   this.modIsLoadingDocs.set(false); }
      );
    }
  }

  private fetchDocsByVehicleId(
    vehicleId: number,
    onSuccess: (docs: LiveDocRecord[]) => void,
    onError  : (msg: string) => void
  ): void {
    this.http.get<LiveDocRecord[]>(API_CONFIG.DOCUMENTS, { headers: this.HEADERS })
      .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$), catchError(err => {
        onError('Could not load documents.');
        return of([]);
      }))
      .subscribe(docs => {
        const filtered = (docs || []).filter(d => d.vehicle?.vehicleId === vehicleId);
        filtered.length ? onSuccess(filtered) : onError('No documents found for this vehicle.');
      });
  }

  private fetchDocsByNumericPassId(
    numericId: number,
    onSuccess: (docs: LiveDocRecord[]) => void,
    onError  : (msg: string) => void
  ): void {
    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$), catchError(err => {
        onError('Could not load documents.');
        return of([]);
      }))
      .subscribe(dbPasses => {
        const matched   = (dbPasses || []).find((d: any) => d.passId === numericId);
        const vehicleId = matched?.vehicle?.vehicleId ?? null;
        if (!vehicleId) { onError('No vehicle linked to this pass.'); return; }
        this.fetchDocsByVehicleId(vehicleId, onSuccess, onError);
      });
  }

  // ── View PDF ───────────────────────────────────────────────────────
  protected viewDocumentPdf(doc: { documentId?: number; fileName?: string }, event: Event): void {
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
      .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(() => {
          this.pdfError.set('Could not load file.');
          this.pdfLoading.set(null);
          return of(null);
        })
      )
      .subscribe((blob: Blob | null) => {
        this.pdfLoading.set(null);
        if (!blob) return;
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
      });
  }

  // ── Download Pass ──────────────────────────────────────────────────
  protected downloadPass(pass: PassRecord, event: Event): void {
    event.stopPropagation();
    const slip = `<!DOCTYPE html><html><head><title>Pass ${pass.passId}</title>
<style>body{font-family:Arial,sans-serif;padding:32px;max-width:640px;margin:auto}
h2{text-align:center;color:#1a237e}table{width:100%;border-collapse:collapse}
td{padding:8px 12px;border:1px solid #ddd;font-size:13px}
td:first-child{background:#f5f5f5;font-weight:600;width:40%}
.status{text-align:center;margin:20px 0}
.badge{padding:6px 20px;border-radius:20px;background:#22c55e;color:#fff;font-weight:700;font-size:14px;display:inline-block}
</style></head><body>
<h2>HEG Limited — Vehicle Pass</h2>
<table>
<tr><td>Pass ID</td><td><b>${pass.passId}</b></td></tr>
<tr><td>Vehicle No</td><td>${pass.vehicleNo}</td></tr>
<tr><td>Vehicle Class</td><td>${pass.vehicleClass}</td></tr>
<tr><td>Employee Name</td><td>${pass.empName || '—'}</td></tr>
<tr><td>EC No</td><td>${pass.ecNo || '—'}</td></tr>
<tr><td>Department</td><td>${pass.empDept || '—'}</td></tr>
<tr><td>Gate No</td><td>${pass.gateNo}</td></tr>
<tr><td>Parking Area</td><td>${pass.parkingArea || '—'}</td></tr>
<tr><td>Issue Date</td><td>${this.formatDate(pass.issueDate)}</td></tr>
<tr><td>Valid Till</td><td>${this.formatDate(pass.validityDate)}</td></tr>
</table>
<div class="status"><span class="badge">APPROVED</span></div>
</body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(slip); win.document.close(); setTimeout(() => win.print(), 500); }
  }

  // ── UI Handlers ────────────────────────────────────────────────────
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
    if (isOpening) { this.modDocPassId.set(null); this.loadModLiveDocs(p); }
  }

  protected onSearch(e: Event): void { this.searchTerm.set((e.target as HTMLInputElement).value); }
  protected onFilterStatus(v: string): void { this.filterStatus.set(v); }

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

  resumeModification(p: any): void {
    this.resumingPassId.set(Number(p.passId));
    const vehicleId = p.vehicle?.vehicleId ?? null;
    const buildAndNavigate = (docs: LiveDocRecord[]) => {
      const resumeData = {
        passId: p.passId, empType: p.empType || '',
        vehicleNo: p.vehicle?.vehicleNo || '', vehicleType: p.vehicle?.vehicleType || '',
        vehicleClass: p.vehicle?.vehicleClass || '', brandModel: p.vehicle?.brandModel || '',
        ecNo: p.employeeNo || '', empName: p.empName || '', empDept: p.dept || '',
        contractorFirm: p.contractorCode || '',
        validityDate: p.validityDate ? p.validityDate.split('T')[0] : '',
        gateNo: p.gateNo || '', parkingArea: p.parkingToBeUsed || '',
        remark: p.remarks || '', confirmerRemark: p.remarks || '',
        docs: docs.map(d => ({
          docType: (d.documentType || '').toUpperCase().trim(),
          docNo: d.documentNo || '', validUpto: d.expiryDate ? d.expiryDate.split('T')[0] : '',
          fileName: d.fileName || '', documentId: d.documentId,
        })),
        status: 'Needs_Modification', createdAt: p.enterDate || '', mobileNo: p.mobileNo || '',
      };
      localStorage.setItem('vpsm_resume_modification', JSON.stringify(resumeData));
      this.resumingPassId.set(null);
      this.router.navigate(['/pass-entry']);
    };

    if (vehicleId) {
      this.fetchDocsByVehicleId(vehicleId, buildAndNavigate, () => buildAndNavigate([]));
    } else {
      this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
        .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$), catchError(() => of([])))
        .subscribe(dbPasses => {
          const vid = (dbPasses || []).find((d: any) => d.passId === Number(p.passId))?.vehicle?.vehicleId ?? null;
          vid ? this.fetchDocsByVehicleId(vid, buildAndNavigate, () => buildAndNavigate([])) : buildAndNavigate([]);
        });
    }
  }

  protected resumeDraft(pass: PassRecord): void {
    try { localStorage.setItem('vpsm_resume_draft', JSON.stringify(pass)); } catch {}
    this.router.navigate(['/pass-entry']);
  }

  protected askDelete(passId: string):     void { this.confirmDeleteId.set(passId); }
  protected cancelDelete():                void { this.confirmDeleteId.set(null);   }
  protected confirmDelete(passId: string): void { this.svc.deleteDraft(passId); this.confirmDeleteId.set(null); }

  // ── Label helpers ──────────────────────────────────────────────────
  protected classLabel(cls: string): string {
    const map: Record<string, string> = {
      'Two_Wheeler': '🏍️ Two Wheeler', 'Four_Wheeler': '🚗 Four Wheeler', 'Heavy_Machinery': '🏗️ Heavy Machinery',
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

  protected workflowLabel(p: PassRecord): string { return this.svc.getStatusLabel(p.workflowStatus); }
  protected workflowClass(p: PassRecord): string { return this.svc.getStatusClass(p.workflowStatus); }

  protected workflowTrail(p: PassRecord): { label: string; by: string; at: string; remark: string }[] {
    const trail = [{ label: 'Submitted', by: p.submittedBy ?? 'REQUESTER', at: p.submittedAt ? this.formatDateTime(p.submittedAt) : p.createdAt, remark: '' }];
    if (p.confirmedAt) trail.push({ label: p.workflowStatus === 'Confirmation_Rejected' ? 'Returned by Confirmer' : 'Confirmed', by: p.confirmedBy ?? '—', at: this.formatDateTime(p.confirmedAt), remark: p.confirmerRemark ?? '' });
    if (p.approvedAt)  trail.push({ label: p.workflowStatus === 'Approval_Rejected' ? 'Returned by Approver' : 'Approved', by: p.approvedBy ?? '—', at: this.formatDateTime(p.approvedAt), remark: p.approverRemark ?? '' });
    return trail;
  }

  private formatDateTime(iso: string): string {
    try { return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); } catch { return iso; }
  }
}