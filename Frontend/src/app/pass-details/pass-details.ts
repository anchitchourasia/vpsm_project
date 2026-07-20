import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, interval, takeUntil, timeout, catchError, of, startWith } from 'rxjs';
import { PassStateService, PassRecord, WorkflowStatus } from '../services/pass-state.service';
import { API_CONFIG } from '../core/api.config';
import { AuthService } from '../core/auth.service';

const REFRESH_INTERVAL_MS = 30_000;
const HTTP_TIMEOUT_MS     = 12_000;

function dbStatusToWorkflow(dbStatus: string): WorkflowStatus {
  switch ((dbStatus || '').toLowerCase()) {
    case 'submitted'         : return 'Submitted';
    case 'confirmed'         : return 'Confirmed';
    case 'active'            : return 'Approved';
    case 'rejected'          : return 'Confirmation_Rejected';
    case 'surrendered'       : return 'Approval_Rejected';
    case 'expired'           : return 'Approval_Rejected';
    case 'needs_modification': return 'Submitted';
    default                  : return 'Submitted';
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
  selector   : 'app-pass-details',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './pass-details.html',
  styleUrl   : './pass-details.css',
})
export class PassDetails implements OnInit, OnDestroy {

  private svc    = inject(PassStateService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);
  private http   = inject(HttpClient);
  private auth   = inject(AuthService);         // ✅ replaces localStorage.getItem('vpsm_userName')

  private readonly destroy$ = new Subject<void>();

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
  });

  protected isSyncing    = signal(false);
  protected lastSyncedAt = signal<string>('');
  protected syncError    = signal('');
  protected pdfLoading   = signal<number | null>(null);
  protected pdfError     = signal<string>('');

  protected isLoadingPasses = signal(false);
  protected passLoadError   = signal('');

  protected liveDocuments = signal<LiveDocRecord[]>([]);
  protected isLoadingDocs = signal(false);
  protected docLoadError  = signal('');
  protected docPassId     = signal<string | null>(null);

  protected modLiveDocuments = signal<LiveDocRecord[]>([]);
  protected modIsLoadingDocs = signal(false);
  protected modDocLoadError  = signal('');
  protected modDocPassId     = signal<number | null>(null);

  protected resumingPassId = signal<number | null>(null);

  // ✅ DB-first signals — no localStorage dependency
  protected submittedPasses = signal<PassRecord[]>([]);
  protected savedDrafts     = signal<PassRecord[]>([]);

  modificationPasses = signal<any[]>([]);
  isLoadingMod       = signal(false);
  modLoadError       = signal('');

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

  ngOnInit(): void {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        if (params['tab'] === 'submitted')         this.activeTab.set('submitted');
        else if (params['tab'] === 'drafts')       this.activeTab.set('drafts');
        else if (params['tab'] === 'modification') this.activeTab.set('modification');
        if (params['filter']) this.filterStatus.set(params['filter']);
      });

    interval(REFRESH_INTERVAL_MS)
      .pipe(startWith(0), takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadAllPassesFromDB();
        this.loadModificationPasses();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadAllPassesFromDB(): void {
    this.isLoadingPasses.set(true);
    this.isSyncing.set(true);
    this.syncError.set('');

    this.http.get<any[]>(API_CONFIG.PASS_LIST, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
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
        const submitted = data
          .filter(p => {
            const s = (p.status || '').toLowerCase();
            return s !== 'draft' && s !== 'needs_modification';
          })
          .map(p => this.mapDbPassToRecord(p))
          .sort((a, b) => {
            const aId = parseInt(a.passId.replace(/\D/g, ''), 10) || 0;
            const bId = parseInt(b.passId.replace(/\D/g, ''), 10) || 0;
            return bId - aId;
          });

        const drafts = data
          .filter(p => (p.status || '').toLowerCase() === 'draft')
          .map(p => this.mapDbPassToRecord(p))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        this.submittedPasses.set(submitted);
        this.savedDrafts.set(drafts);

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

  private mapDbPassToRecord(p: any): PassRecord {
    return {
      passId        : (p.remarks && String(p.remarks).startsWith('DRAFT-'))
                        ? String(p.remarks)
                        : `PASS-HEG-${String(p.passId).padStart(4, '0')}`,
      empType       : p.empType              ?? 'Company_Employee',
      vehicleNo     : p.vehicle?.vehicleNo   ?? p.typeOfVehicle   ?? '',
      vehicleType   : p.vehicle?.vehicleType ?? p.typeOfVehicle   ?? '',
      vehicleClass  : p.vehicle?.vehicleClass ?? '',
      brandModel    : p.vehicle?.brandModel   ?? '',
      ecNo          : p.employeeNo           ?? '',
      empName : p.empName ?? p.employeeName ?? p.name ?? '',
      empDept       : p.dept                 ?? p.department      ?? '',
      contractorFirm: p.contractorCode       ?? '',
      issueDate     : p.enterDate            ? p.enterDate.split('T')[0]    : '',
      validityDate  : p.validityDate         ? p.validityDate.split('T')[0] : '',
      gateNo        : p.gateNo              ?? p.assignedGate     ?? '',
      parkingArea   : p.parkingToBeUsed     ?? '',
      remark        : p.remarks             ?? '',
      docs          : [],
      status        : 'Submitted' as const,
      createdAt     : p.enterDate
        ? new Date(p.enterDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : '',
      workflowStatus : dbStatusToWorkflow(p.status ?? ''),
      submittedBy    : p.enterBy    ?? '',
      submittedAt    : p.enterDate  ?? '',
      mobileNo       : p.mobileNo   ?? '',
      confirmedBy    : p.confirmedBy    ?? undefined,
      confirmedAt    : p.confirmedAt    ?? undefined,
      confirmerRemark: p.confirmerRemark ?? p.remarks ?? undefined,
      approvedBy     : p.approvedBy     ?? undefined,
      approvedAt     : p.approvedAt     ?? undefined,
      approverRemark : p.approverRemark ?? undefined,
    } as PassRecord;
  }

  // ✅ loadModificationPasses — localStorage.getItem REMOVED, uses auth.empCode()
  loadModificationPasses(): void {
    this.isLoadingMod.set(true);
    this.modLoadError.set('');
    // const myCode = this.auth.empCode().trim().toLowerCase();
    

    this.http.get<any[]>(API_CONFIG.PASS_LIST, { headers: this.HEADERS })
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
          (p.status || '').toLowerCase() === 'needs_modification'
        );
        this.modificationPasses.set(list);
        this.isLoadingMod.set(false);
      });
  }

  protected refreshNow(): void {
    this.loadAllPassesFromDB();
    this.loadModificationPasses();
  }

  private loadLiveDocs(passId: string): void {
    this.isLoadingDocs.set(true);
    this.docLoadError.set('');
    this.liveDocuments.set([]);
    // DRAFT-ids have no real DB passId yet — skip doc fetch for drafts
    if (passId.startsWith('DRAFT-')) {
      this.docLoadError.set('Documents will be available after submission.');
      this.isLoadingDocs.set(false);
      return;
    }
    const numericId = parseInt(passId.replace(/\D/g, ''), 10);
      this.fetchDocsByNumericPassId(
      numericId,
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
    this.http.get<any[]>(API_CONFIG.PASS_LIST, { headers: this.HEADERS })
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
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
      });
  }

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

  // ✅ resumeModification — localStorage.setItem REMOVED, uses PassStateService signal
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
      // ✅ Store in service signal — no localStorage
      this.svc.setResumeMod(resumeData);
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
      this.http.get<any[]>(API_CONFIG.PASS_LIST, { headers: this.HEADERS })
        .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$), catchError(() => of([])))
        .subscribe(dbPasses => {
          const matched = (dbPasses || []).find((d: any) => d.passId === Number(p.passId));
          const vid     = matched?.vehicle?.vehicleId ?? null;
          if (vid) doFetch(vid);
          else     buildAndNavigate([]);
        });
    }
  }

  // ✅ resumeDraft — localStorage.setItem REMOVED, uses PassStateService signal
  protected resumeDraft(pass: PassRecord): void {
    this.svc.setResumeDraft(pass);
    this.router.navigate(['/pass-entry']);
  }

  protected askDelete(passId: string):     void { this.confirmDeleteId.set(passId); }
  protected cancelDelete():                void { this.confirmDeleteId.set(null);   }
  protected confirmDelete(passId: string): void {
    this.svc.deleteDraft(passId);
    this.savedDrafts.update(list => list.filter(p => p.passId !== passId));
    this.confirmDeleteId.set(null);
  }

  protected classLabel(cls: string): string {
    const map: Record<string, string> = {
      'Two_Wheeler'    : ' Two Wheeler',
      'Four_Wheeler'   : ' Four Wheeler',
      'Heavy_Machinery': ' Heavy Machinery',
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