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
  remarks          : string;  // carries confirmer's remark from previous stage
  enterBy          : string;  // carries confirmer's name from previous stage
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

@Component({
  selector   : 'app-approval',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './approval.html',
  styleUrl   : './approval.css'
})
export class Approval implements OnInit, OnDestroy {

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json'
  });
  private readonly destroy$ = new Subject<void>();

  // ── Session ──────────────────────────────────────────────────────────────
  readonly approverName = signal(
    localStorage.getItem('vpsm_userName') || 'APPROVER'
  );

  // ── List State ───────────────────────────────────────────────────────────
  allPasses   = signal<PassRecord[]>([]);
  isLoading   = signal(true);
  hasError    = signal(false);
  searchText  = signal('');
  currentPage = signal(1);
  readonly pageSize = 10;

  // ── Action State ─────────────────────────────────────────────────────────
  selectedPass  = signal<PassRecord | null>(null);
  actionRemark  = signal('');
  actionError   = signal('');
  actionSuccess = signal('');
  isActing      = signal(false);

  // ── Computed: Only status === 'Confirmed' passes shown ───────────────────
  pendingList = computed(() => {
    const q    = this.searchText().toLowerCase().trim();
    const list = this.allPasses().filter(p =>
      (p.status || '').toLowerCase() === 'confirmed'
    );
    if (!q) return list;
    return list.filter(p =>
      String(p.passId).includes(q)                        ||
      (p.employeeNo         || '').toLowerCase().includes(q) ||
      (p.vehicle?.vehicleNo || '').toLowerCase().includes(q) ||
      (p.dept               || '').toLowerCase().includes(q) ||
      (p.enterBy            || '').toLowerCase().includes(q)
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

  // ── Load All Passes from Real Backend DB ─────────────────────────────────
  loadPasses(): void {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.http.get<PassRecord[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(
        timeout(TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('[Approval] Load error:', err);
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

  // ── Modal Controls ───────────────────────────────────────────────────────
  openDetails(p: PassRecord): void {
    this.selectedPass.set(p);
    this.actionRemark.set('');
    this.actionError.set('');
    this.actionSuccess.set('');
  }

  closeDetails(): void {
    this.selectedPass.set(null);
    this.actionRemark.set('');
    this.actionError.set('');
    this.actionSuccess.set('');
  }

  // ── Approve Pass → status: 'Active' → Pass is now fully approved ──────────
  approve(pass: PassRecord): void {
    if (!this.actionRemark().trim()) {
      this.actionError.set('Remark is required before approving.');
      return;
    }
    this.isActing.set(true);
    this.actionError.set('');

    const updatePayload = {
      status  : 'Active',
      enterBy : this.approverName(),
      remarks : `Approved by Approver [${this.approverName()}]: ${this.actionRemark().trim()}`,
      vehicle : pass.vehicle ? { vehicleId: pass.vehicle.vehicleId } : null
    };

    this.http.put(
      `${API_CONFIG.PASSES_UPDATE}/${pass.passId}`,
      updatePayload,
      { headers: this.HEADERS }
    )
    .pipe(
      timeout(TIMEOUT_MS),
      takeUntil(this.destroy$),
      catchError(err => {
        this.actionError.set(
          'Approval failed: ' + (err?.error?.message || err?.message || 'Server error')
        );
        this.isActing.set(false);
        return of(null);
      })
    )
    .subscribe(res => {
      if (res === null) return;
      this.logHistory(
        pass.passId,
        pass.employeeNo,
        'APPROVED',
        `Pass activated by Approver [${this.approverName()}]: ${this.actionRemark().trim()}`
      );
      this.actionSuccess.set(`✅ Pass #${pass.passId} APPROVED. Pass is now Active.`);
      this.isActing.set(false);
      this.loadPasses();
      setTimeout(() => this.closeDetails(), 2000);
    });
  }

  // ── Return to Confirmer → status: 'Submitted' → back in Confirmer queue ──
  returnToConfirmer(pass: PassRecord): void {
    if (!this.actionRemark().trim()) {
      this.actionError.set('Remark is required before returning.');
      return;
    }
    this.isActing.set(true);
    this.actionError.set('');

    const updatePayload = {
      status  : 'Submitted',
      enterBy : this.approverName(),
      remarks : `Returned by Approver [${this.approverName()}]: ${this.actionRemark().trim()}`,
      vehicle : pass.vehicle ? { vehicleId: pass.vehicle.vehicleId } : null
    };

    this.http.put(
      `${API_CONFIG.PASSES_UPDATE}/${pass.passId}`,
      updatePayload,
      { headers: this.HEADERS }
    )
    .pipe(
      timeout(TIMEOUT_MS),
      takeUntil(this.destroy$),
      catchError(err => {
        this.actionError.set(
          'Return failed: ' + (err?.error?.message || err?.message || 'Server error')
        );
        this.isActing.set(false);
        return of(null);
      })
    )
    .subscribe(res => {
      if (res === null) return;
      this.logHistory(
        pass.passId,
        pass.employeeNo,
        'RETURNED',
        `Returned to Confirmer by Approver [${this.approverName()}]: ${this.actionRemark().trim()}`
      );
      this.actionSuccess.set(`↩️ Pass #${pass.passId} returned to Confirmer queue.`);
      this.isActing.set(false);
      this.loadPasses();
      setTimeout(() => this.closeDetails(), 2000);
    });
  }

  // ── Post to History Audit Log Table ──────────────────────────────────────
  private logHistory(
    passId : number,
    empCode: string,
    action : string,
    remark : string
  ): void {
    const payload = {
      passNo      : String(passId),
      empCode     : empCode || 'SYSTEM',
      action,
      remark      : remark.substring(0, 200),
      dateOfEntry : new Date()
    };
    this.http.post(API_CONFIG.HISTORY_LOG, payload, { headers: this.HEADERS })
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe();
  }

  // ── Pagination & Search ───────────────────────────────────────────────────
  onSearch(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage.set(page);
    }
  }

  // ── Status Label — human readable ────────────────────────────────────────
  getStatusLabel(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'submitted'  : return 'Pending Confirmation';
      case 'confirmed'  : return 'Pending Approval';
      case 'active'     : return 'Approved & Active';
      case 'rejected'   : return 'Rejected';
      case 'surrendered': return 'Surrendered';
      case 'expired'    : return 'Expired';
      default           : return status || '—';
    }
  }

  // ── Status CSS Badge Class ────────────────────────────────────────────────
  getStatusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'submitted'  : return 'badge-submitted';
      case 'confirmed'  : return 'badge-confirmed';
      case 'active'     : return 'badge-active';
      case 'rejected'   : return 'badge-rejected';
      case 'surrendered': return 'badge-surrendered';
      case 'expired'    : return 'badge-expired';
      default           : return 'badge-default';
    }
  }

  // ── Date Formatter ────────────────────────────────────────────────────────
  formatDate(d: string): string {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-GB'); } catch { return d; }
  }
}