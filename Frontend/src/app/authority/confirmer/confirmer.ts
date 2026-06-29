import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../../core/api.config';
// ADD this import alongside the existing imports:
import { PassStateService } from '../../services/pass-state.service';

const TIMEOUT_MS = 15000;

interface PassRecord {
  passId: number;
  employeeNo: string;
  employeeCompanyNo: string;
  employeeName: string;
  empName?: string;   // ← ADD THIS
  name?: string;   // ← ADD THIS 
  dept: string;
  contractorCode: string;
  contractorName?: string;   // ✅ ADD THIS
  aadhaarNo?: string;   // ✅ ADD THIS
  aadharNo?: string;   // ✅ ADD THIS
  gateNo: string;
  parkingToBeUsed: string;
  typeOfVehicle: string;
  mobileNo: string;
  status: string;
  remarks: string;
  enterBy: string;
  enterDate: string;
  empType: string;
  issueDate: string;
  validityDate: string;
  vehicle: {
    vehicleId: number;
    vehicleNo: string;
    vehicleType: string;
    vehicleClass: string;
    brandModel?: string;
  } | null;
}


interface DocumentRecord {
  documentId: number;
  documentType: string;
  documentNo: string;
  startDate: string;
  expiryDate: string;
  fileName?: string;
  vehicle?: { vehicleId: number };
}
interface HistoryRecord {
  id?: number;
  passNo: string;
  empCode: string;
  action: string;
  remark: string;
  dateOfEntry: string;
}

@Component({
  selector: 'app-confirmer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './confirmer.html',
  styleUrl: './confirmer.css'
})
export class Confirmer implements OnInit, OnDestroy {

  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  });
  private readonly destroy$ = new Subject<void>();

  readonly confirmerName = signal(
    localStorage.getItem('vpsm_userName') || 'CONFIRMER'
  );

  allPasses = signal<PassRecord[]>([]);
  isLoading = signal(true);
  hasError = signal(false);
  searchText = signal('');
  currentPage = signal(1);
  readonly pageSize = 10;

  selectedPass = signal<PassRecord | null>(null);
  // ✅ NEW — holds live-enriched employee details fetched on modal open
  selectedPassExtra = signal<{
    deptCode: string;
    contractorName: string;
    contractorCode: string;
    aadhaarNo: string;
    empName: string;
    empType: string;
  } | null>(null);
  isLoadingExtra = signal(false);

  actionRemark = signal('');
  actionError = signal('');
  actionSuccess = signal('');
  isActing = signal(false);

  // ── NEW: tracks which action is armed in the footer ───────────────────────
  // null = default state | 'modify' = Send for Modify is armed
  activeAction = signal<'modify' | 'reject' | null>(null);

  // ── Documents State ───────────────────────────────────────────────────────
  passDocuments = signal<DocumentRecord[]>([]);
  isLoadingDocs = signal(false);
  docLoadError = signal('');
  // ── Employee Pass History ─────────────────────────────────────────────────
  empPassHistory = signal<HistoryRecord[]>([]);
  isLoadingHistory = signal(false);
  historyLoadError = signal('');
  showHistory = signal(false);

  pendingList = computed(() => {
    const q = this.searchText().toLowerCase().trim();
    const list = this.allPasses().filter(p =>
      (p.status || '').toLowerCase() === 'submitted'
    );
    if (!q) return list;
    return list.filter(p =>
      String(p.passId).includes(q) ||
      (p.employeeNo || '').toLowerCase().includes(q) ||
      (p.vehicle?.vehicleNo || '').toLowerCase().includes(q) ||
      (p.dept || '').toLowerCase().includes(q) ||
      (p.empType || '').toLowerCase().includes(q)
    );
  });

  pagedList = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.pendingList().slice(start, start + this.pageSize);
  });

  get totalPages() { return Math.max(1, Math.ceil(this.pendingList().length / this.pageSize)); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  protected svc = inject(PassStateService);
  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.svc.loadEmployeeNames();  // ← fetch employee name map once
    this.loadPasses();
  }
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
        const enriched = (Array.isArray(data) ? data : []).map(p => ({
          ...p,
          employeeName: p.employeeName ?? p.empName ?? p.name
            ?? this.svc.resolveEmpName(p.employeeNo ?? '')
        }));
        this.allPasses.set(enriched);
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
    this.showHistory.set(false);
    this.enrichPassWithEmployeeData(p);

    if (p.vehicle?.vehicleId) {
      this.loadDocuments(p.vehicle.vehicleId);
    } else {
      this.docLoadError.set('No vehicle linked — cannot load documents.');
    }
    this.empPassHistory.set([]);
    this.historyLoadError.set('');
    this.loadEmpPassHistory(p.passId);
  }

  closeDetails(): void {
    this.selectedPass.set(null);
    this.isLoadingExtra.set(false);
    this.actionRemark.set('');
    this.actionError.set('');
    this.actionSuccess.set('');
    this.activeAction.set(null);          // ← reset armed state on close
    this.passDocuments.set([]);
    this.docLoadError.set('');
    this.empPassHistory.set([]);
    this.historyLoadError.set('');
    this.showHistory.set(false);


  }

  // ── NEW: toggle armed state for Send for Modify button ───────────────────
  setAction(action: 'modify' | 'reject'): void {
    // clicking same button again = cancel/disarm
    this.activeAction.set(this.activeAction() === action ? null : action);
    this.actionError.set('');
    this.actionSuccess.set('');
  }
  // ─────────────────────────────────────────────────────────────────
  // enrichPassWithEmployeeData — fetches live employee/contractor
  // details and stores them in selectedPassExtra signal.
  //
  // 📍 WHEN  → Called inside openDetails() every time a pass is opened
  // 📍 WHERE → confirmer.ts → private method, called from openDetails()
  // 📍 HOW   →
  //   1. Calls GET /api/reports/employee-department (same API as pass-entry)
  //   2. Matches by employeeNo (Company_Employee) OR contractorNo (Contractor)
  //   3. Picks: deptCode, contractorName, aadhaarNo, empName
  //   4. Stores result in selectedPassExtra signal
  //   5. HTML reads from selectedPassExtra — never from raw pass object for these fields
  //   6. Falls back to pass object values if API has no match
  // ─────────────────────────────────────────────────────────────────
  private enrichPassWithEmployeeData(pass: PassRecord): void {
    this.isLoadingExtra.set(true);
    this.selectedPassExtra.set(null);

    this.http
      .get<any[]>(`${API_CONFIG.BASE_URL}/api/reports/employee-department`, { headers: this.HEADERS })
      .pipe(
        timeout(TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(() => {
          // Silent fail — modal still works, just shows raw pass data
          this.isLoadingExtra.set(false);
          return of([]);
        })
      )
      .subscribe((rows: any[]) => {
        this.isLoadingExtra.set(false);
        if (!rows || rows.length === 0) return;

        // ✅ FIX: Do NOT trust pass.empType from DB — it may be wrong for old records.
        // Try BOTH lookups simultaneously. Whichever finds a row wins.
        // Priority: contractorCode match first (more specific), then employeeNo match.

        // Try 1: Match as Contractor — by contractorNo field
        let match: any = null;
        if (pass.contractorCode) {
          match = rows.find(r =>
            r.contractorNo &&
            String(r.contractorNo).toUpperCase() === String(pass.contractorCode).toUpperCase()
          );
        }

        // Try 2: Match as Company Employee — by numeric id
        if (!match && pass.employeeNo) {
          match = rows.find(r => String(r.id) === String(pass.employeeNo));
        }

        // Try 3: Match employeeNo against contractorNo (edge case: old pass saved ecNo in employeeNo for a contractor)
        if (!match && pass.employeeNo) {
          match = rows.find(r =>
            r.contractorNo &&
            String(r.contractorNo).toUpperCase() === String(pass.employeeNo).toUpperCase()
          );
        }

        if (match) {
          const isContractor = !!(match.contractorNo);
          this.selectedPassExtra.set({
            deptCode: String(match.deptCode || '—'),
            contractorName: isContractor ? String(match.name || '—') : '—',
            contractorCode: isContractor ? String(match.contractorNo || match.contractorCode || '—') : '—',
            aadhaarNo: String(match.aadhaarNo || match.aadharNo || pass.aadhaarNo || '—'),
            empName: String(match.name || pass.employeeName || '—'),
            // ✅ FIX: empType from employee API match — overrides whatever was wrong in DB
            empType: isContractor ? 'Contractor' : String(match.empType || pass.empType || '—'),
          });
        } else {
          // No API match — fall back to pass row values
          this.selectedPassExtra.set({
            deptCode: '—',
            contractorName: pass.contractorName || '—',
            contractorCode: pass.contractorCode || '—',
            aadhaarNo: pass.aadhaarNo || pass.aadharNo || '—',
            empName: pass.employeeName || pass.empName || '—',
            empType: pass.empType || '—',   // fallback only if API returned no rows
          });
        }
      });
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
      status: 'Confirmed',
      enterBy: this.confirmerName(),
      remarks: `Confirmed by ${this.confirmerName()}: ${this.actionRemark().trim()}`,
      vehicle: pass.vehicle ? { vehicleId: pass.vehicle.vehicleId } : null
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
      status: 'Rejected',
      enterBy: this.confirmerName(),
      remarks: `Rejected by Confirmer [${this.confirmerName()}]: ${this.actionRemark().trim()}`,
      vehicle: pass.vehicle ? { vehicleId: pass.vehicle.vehicleId } : null
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
      status: 'Needs_Modification',
      enterBy: this.confirmerName(),
      remarks: `Modification requested by Confirmer [${this.confirmerName()}]: ${this.actionRemark().trim()}`,
      vehicle: pass.vehicle ? { vehicleId: pass.vehicle.vehicleId } : null
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
  // ✅ FIXED — calls /api/history/list and filters by passId
  private loadEmpPassHistory(passId: number): void {
    this.isLoadingHistory.set(true);
    this.historyLoadError.set('');
    this.empPassHistory.set([]);

    this.http.get<HistoryRecord[]>(API_CONFIG.HISTORY_LIST, { headers: this.HEADERS })
      .pipe(
        timeout(TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          this.historyLoadError.set(
            'Could not load pass history (' + (err?.status || 'network error') + ')'
          );
          this.isLoadingHistory.set(false);
          return of([]);
        })
      )
      .subscribe(data => {
        const history = (Array.isArray(data) ? data : [])
          .filter(h => String(h.passNo) === String(passId))
          .sort((a: any, b: any) =>
            new Date(b.dateOfEntry).getTime() - new Date(a.dateOfEntry).getTime()
          ); // newest first
        this.empPassHistory.set(history);
        if (history.length === 0) {
          this.historyLoadError.set('No audit history found for this pass.');
        }
        this.isLoadingHistory.set(false);
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
  goToPage(page: number): void { if (page >= 1 && page <= this.totalPages) this.currentPage.set(page); }

  getStatusLabel(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'submitted': return 'Pending Confirmation';
      case 'confirmed': return 'Pending Approval';
      case 'active': return 'Approved';
      case 'rejected': return 'Rejected';
      case 'surrendered': return 'Surrendered';
      case 'expired': return 'Expired';
      case 'needs_modification': return 'Needs Modification';  // ← NEW
      default: return status || '—';
    }
  }
  getActionClass(action: string): string {
    switch ((action || '').toUpperCase()) {
      case 'CONFIRMED': return 'badge-confirmed';
      case 'APPROVED': return 'badge-active';
      case 'REJECTED': return 'badge-rejected';
      case 'SENT_FOR_MODIFICATION': return 'badge-modify';
      case 'RETURNED': return 'badge-submitted';
      default: return 'badge-default';
    }
  }
  getActionIcon(action: string): string {
    switch ((action || '').toUpperCase()) {
      case 'CONFIRMED': return 'bi-check-circle-fill';
      case 'APPROVED': return 'bi-patch-check-fill';
      case 'REJECTED': return 'bi-x-circle-fill';
      case 'SENT_FOR_MODIFICATION': return 'bi-pencil-square';
      case 'RETURNED': return 'bi-arrow-return-left';
      default: return 'bi-dot';
    }
  }

  getActionRowClass(action: string): string {
    switch ((action || '').toUpperCase()) {
      case 'APPROVED': return 'hist-row-approved';
      case 'REJECTED': return 'hist-row-rejected';
      case 'CONFIRMED': return 'hist-row-confirmed';
      case 'SENT_FOR_MODIFICATION': return 'hist-row-modify';
      default: return '';
    }
  }

  getStatusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'submitted': return 'badge-submitted';
      case 'confirmed': return 'badge-confirmed';
      case 'active': return 'badge-active';
      case 'rejected': return 'badge-rejected';
      case 'surrendered': return 'badge-surrendered';
      case 'expired': return 'badge-expired';
      case 'needs_modification': return 'badge-modify';         // ← NEW
      default: return 'badge-default';
    }
  }

  formatDate(d: string): string {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-GB'); } catch { return d; }
  }

  formatDocDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getDocStatusClass(expiryDate: string): string {
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'doc-expired';
    if (days <= 30) return 'doc-expiring';
    return 'doc-valid';
  }

  getDocStatusText(expiryDate: string): string {
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'Expired';
    if (days <= 30) return `${days}d left`;
    return 'Valid';
  }
}