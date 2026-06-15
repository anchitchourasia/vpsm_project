import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../../core/api.config';

const TIMEOUT_MS = 15000;

interface PassRecord {
  passId           : number;
  employeeNo       : string;
  employeeCompanyNo: string;
  dept             : string;
  contractorCode   : string;
  gateNo           : string;
  parkingToBeUsed  : string;
  typeOfVehicle    : string;
  mobileNo         : string;
  status           : string;
  remarks          : string;
  enterBy          : string;
  enterDate        : string;
  empType          : string;
  issueDate        : string;
  validityDate     : string;
  vehicle          : {
    vehicleId   : number;
    vehicleNo   : string;
    vehicleType : string;
    vehicleClass: string;
    brandModel ?: string;
  } | null;
}

interface DocumentRecord {
  documentId  : number;
  documentType: string;
  documentNo  : string;
  startDate   : string;
  expiryDate  : string;
  fileName   ?: string;
  vehicle    ?: { vehicleId: number };
}

@Component({
  selector   : 'app-confirmer',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './confirmer.html',
  styleUrl   : './confirmer.css'
})
export class Confirmer implements OnInit, OnDestroy {

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json'
  });
  private readonly destroy$ = new Subject<void>();

  readonly confirmerName = signal(
    localStorage.getItem('vpsm_userName') || 'CONFIRMER'
  );

  allPasses   = signal<PassRecord[]>([]);
  isLoading   = signal(true);
  hasError    = signal(false);
  searchText  = signal('');
  currentPage = signal(1);
  readonly pageSize = 10;

  selectedPass  = signal<PassRecord | null>(null);
  actionRemark  = signal('');
  actionError   = signal('');
  actionSuccess = signal('');
  isActing      = signal(false);

  // ── NEW: tracks which action is armed in the footer ───────────────────────
  // null = default state | 'modify' = Send for Modify is armed
  activeAction = signal<'modify' | null>(null);

  // ── Documents State ───────────────────────────────────────────────────────
  passDocuments  = signal<DocumentRecord[]>([]);
  isLoadingDocs  = signal(false);
  docLoadError   = signal('');

  pendingList = computed(() => {
    const q    = this.searchText().toLowerCase().trim();
    const list = this.allPasses().filter(p =>
      (p.status || '').toLowerCase() === 'submitted'
    );
    if (!q) return list;
    return list.filter(p =>
      String(p.passId).includes(q)                           ||
      (p.employeeNo         || '').toLowerCase().includes(q) ||
      (p.vehicle?.vehicleNo || '').toLowerCase().includes(q) ||
      (p.dept               || '').toLowerCase().includes(q) ||
      (p.empType            || '').toLowerCase().includes(q)
    );
  });

  pagedList = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.pendingList().slice(start, start + this.pageSize);
  });

  get totalPages()    { return Math.max(1, Math.ceil(this.pendingList().length / this.pageSize)); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  constructor(private http: HttpClient) {}

  ngOnInit()    { this.loadPasses(); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  loadPasses(): void {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.http.get<PassRecord[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(
        timeout(TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          console.error('[Confirmer] Load error:', err);
          this.hasError.set(true);
          this.isLoading.set(false);
          return of([]);
        })
      )
      .subscribe(data => {
        this.allPasses.set(Array.isArray(data) ? data : []);
        this.isLoading.set(false);
      });
  }

  openDetails(p: PassRecord): void {
    this.selectedPass.set(p);
    this.actionRemark.set('');
    this.actionError.set('');
    this.actionSuccess.set('');
    this.activeAction.set(null);          // ← reset armed state on open
    this.passDocuments.set([]);
    this.docLoadError.set('');

    if (p.vehicle?.vehicleId) {
      this.loadDocuments(p.vehicle.vehicleId);
    } else {
      this.docLoadError.set('No vehicle linked — cannot load documents.');
    }
  }

  closeDetails(): void {
    this.selectedPass.set(null);
    this.actionRemark.set('');
    this.actionError.set('');
    this.actionSuccess.set('');
    this.activeAction.set(null);          // ← reset armed state on close
    this.passDocuments.set([]);
    this.docLoadError.set('');
  }

  // ── NEW: toggle armed state for Send for Modify button ───────────────────
  setAction(action: 'modify'): void {
    // clicking same button again = cancel/disarm
    this.activeAction.set(this.activeAction() === action ? null : action);
    this.actionError.set('');
    this.actionSuccess.set('');
  }

  // ── GET /api/documents/list → filter by vehicleId ────────────────────────
  private loadDocuments(vehicleId: number): void {
    this.isLoadingDocs.set(true);
    this.docLoadError.set('');

    this.http.get<DocumentRecord[]>(API_CONFIG.DOCUMENTS, { headers: this.HEADERS })
      .pipe(
        timeout(TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          this.docLoadError.set(
            'Could not load documents (' + (err?.status || 'network error') + ')'
          );
          this.isLoadingDocs.set(false);
          return of([]);
        })
      )
      .subscribe(docs => {
        const filtered = (docs || []).filter(d => d.vehicle?.vehicleId === vehicleId);
        this.passDocuments.set(filtered);
        if (filtered.length === 0) {
          this.docLoadError.set('No documents found for this vehicle.');
        }
        this.isLoadingDocs.set(false);
      });
  }

  // ── View PDF in new tab ───────────────────────────────────────────────────
  viewDocument(doc: DocumentRecord): void {
    if (!doc?.documentId || !doc?.fileName) {
      alert('No file attached to this document.');
      return;
    }
    const url = `${API_CONFIG.DOCUMENTS_DOWNLOAD}?id=${doc.documentId}`;
    this.http.get(url, { responseType: 'blob', headers: this.HEADERS })
      .pipe(
        timeout(TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          console.error('❌ PDF download error:', err?.status);
          alert('Could not load file. It may not have been uploaded yet.');
          return of(null);
        })
      )
      .subscribe((blob: Blob | null) => {
        if (!blob) return;
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      });
  }

  // ── Confirm Pass ──────────────────────────────────────────────────────────
  confirm(pass: PassRecord): void {
    if (!this.actionRemark().trim()) {
      this.actionError.set('Remark is required before confirming.');
      return;
    }
    this.isActing.set(true);
    this.actionError.set('');
    const updatePayload = {
      status  : 'Confirmed',
      enterBy : this.confirmerName(),
      remarks : `Confirmed by ${this.confirmerName()}: ${this.actionRemark().trim()}`,
      vehicle : pass.vehicle ? { vehicleId: pass.vehicle.vehicleId } : null
    };
    this.http.put(`${API_CONFIG.PASSES_UPDATE}/${pass.passId}`, updatePayload, { headers: this.HEADERS })
      .pipe(timeout(TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          this.actionError.set('Confirmation failed: ' + (err?.error?.message || err?.message || 'Server error'));
          this.isActing.set(false);
          return of(null);
        })
      )
      .subscribe(res => {
        if (res === null) return;
        this.logHistory(pass.passId, pass.employeeNo, 'CONFIRMED',
          `Confirmed by Confirmer [${this.confirmerName()}]: ${this.actionRemark().trim()}`);
        this.actionSuccess.set(`✅ Pass #${pass.passId} confirmed and sent to Approver.`);
        this.isActing.set(false);
        this.loadPasses();
        setTimeout(() => this.closeDetails(), 2000);
      });
  }

  // ── Reject Pass ───────────────────────────────────────────────────────────
  reject(pass: PassRecord): void {
    if (!this.actionRemark().trim()) {
      this.actionError.set('Remark is required before rejecting.');
      return;
    }
    this.isActing.set(true);
    this.actionError.set('');
    const updatePayload = {
      status  : 'Rejected',
      enterBy : this.confirmerName(),
      remarks : `Rejected by Confirmer [${this.confirmerName()}]: ${this.actionRemark().trim()}`,
      vehicle : pass.vehicle ? { vehicleId: pass.vehicle.vehicleId } : null
    };
    this.http.put(`${API_CONFIG.PASSES_UPDATE}/${pass.passId}`, updatePayload, { headers: this.HEADERS })
      .pipe(timeout(TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          this.actionError.set('Rejection failed: ' + (err?.error?.message || err?.message || 'Server error'));
          this.isActing.set(false);
          return of(null);
        })
      )
      .subscribe(res => {
        if (res === null) return;
        this.logHistory(pass.passId, pass.employeeNo, 'REJECTED',
          `Rejected by Confirmer [${this.confirmerName()}]: ${this.actionRemark().trim()}`);
        this.actionSuccess.set(`❌ Pass #${pass.passId} rejected and returned to requester.`);
        this.isActing.set(false);
        this.loadPasses();
        setTimeout(() => this.closeDetails(), 2000);
      });
  }

  // ── NEW: Send for Modify ──────────────────────────────────────────────────
  sendForModify(pass: PassRecord): void {
    if (!this.actionRemark().trim()) {
      this.actionError.set('Remark is required — describe what needs to be modified.');
      return;
    }
    this.isActing.set(true);
    this.actionError.set('');
    const updatePayload = {
      status  : 'Needs_Modification',
      enterBy : this.confirmerName(),
      remarks : `Modification requested by Confirmer [${this.confirmerName()}]: ${this.actionRemark().trim()}`,
      vehicle : pass.vehicle ? { vehicleId: pass.vehicle.vehicleId } : null
    };
    this.http.put(`${API_CONFIG.PASSES_UPDATE}/${pass.passId}`, updatePayload, { headers: this.HEADERS })
      .pipe(timeout(TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          this.actionError.set('Send for Modify failed: ' + (err?.error?.message || err?.message || 'Server error'));
          this.isActing.set(false);
          this.activeAction.set(null);
          return of(null);
        })
      )
      .subscribe(res => {
        if (res === null) return;
        this.logHistory(pass.passId, pass.employeeNo, 'SENT_FOR_MODIFICATION',
          `Modification requested by Confirmer [${this.confirmerName()}]: ${this.actionRemark().trim()}`);
        this.actionSuccess.set(`🔄 Pass #${pass.passId} sent back to requester for modification.`);
        this.isActing.set(false);
        this.activeAction.set(null);
        this.loadPasses();
        setTimeout(() => this.closeDetails(), 2000);
      });
  }

  private logHistory(passId: number, empCode: string, action: string, remark: string): void {
    const payload = {
      passNo: String(passId), empCode: empCode || 'SYSTEM',
      action, remark: remark.substring(0, 200), dateOfEntry: new Date()
    };
    this.http.post(API_CONFIG.HISTORY_LOG, payload, { headers: this.HEADERS })
      .pipe(takeUntil(this.destroy$), catchError(() => of(null))).subscribe();
  }

  onSearch(value: string): void { this.searchText.set(value); this.currentPage.set(1); }
  goToPage(page: number): void  { if (page >= 1 && page <= this.totalPages) this.currentPage.set(page); }

  getStatusLabel(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'submitted'         : return 'Pending Confirmation';
      case 'confirmed'         : return 'Pending Approval';
      case 'active'            : return 'Approved & Active';
      case 'rejected'          : return 'Rejected';
      case 'surrendered'       : return 'Surrendered';
      case 'expired'           : return 'Expired';
      case 'needs_modification': return 'Needs Modification';  // ← NEW
      default                  : return status || '—';
    }
  }

  getStatusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'submitted'         : return 'badge-submitted';
      case 'confirmed'         : return 'badge-confirmed';
      case 'active'            : return 'badge-active';
      case 'rejected'          : return 'badge-rejected';
      case 'surrendered'       : return 'badge-surrendered';
      case 'expired'           : return 'badge-expired';
      case 'needs_modification': return 'badge-modify';         // ← NEW
      default                  : return 'badge-default';
    }
  }

  formatDate(d: string): string {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-GB'); } catch { return d; }
  }

  formatDocDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }

  getDocStatusClass(expiryDate: string): string {
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0)   return 'doc-expired';
    if (days <= 30) return 'doc-expiring';
    return 'doc-valid';
  }

  getDocStatusText(expiryDate: string): string {
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0)   return 'Expired';
    if (days <= 30) return `${days}d left`;
    return 'Valid';
  }
}