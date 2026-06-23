import { Component, signal, computed, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { CvpsService, CvpsRequest, CvpsPersonnel, WorkflowAction, CVPS_STATUS } from '../../services/cvps.service';

@Component({
  selector   : 'app-vehicle-permission-list',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './vehicle-permission-list.html',
  styleUrl   : './vehicle-permission-list.css',
})
export class VehiclePermissionList implements OnInit, OnDestroy {

  private router   = inject(Router);
  private auth     = inject(AuthService);
  private cvps     = inject(CvpsService);
  private destroy$ = new Subject<void>();

  // ── List State ────────────────────────────────────────────────
  searchText   = signal('');
  statusFilter = signal('ALL');
  currentPage  = signal(1);
  readonly pageSize = 10;
  isLoading    = signal(false);
  errorMsg     = signal('');
  allRecords   = signal<CvpsRequest[]>([]);

  // Status options aligned with backend CVPS_STATUS constants
  readonly statusOptions = [
    { value: 'ALL',                    label: 'All Statuses'   },
    { value: CVPS_STATUS.CREATED,      label: 'Created'        },
    { value: CVPS_STATUS.CONFIRMED,    label: 'Confirmed'      },
    { value: CVPS_STATUS.APPROVED,     label: 'Approved'       },
    { value: CVPS_STATUS.REJECTED,     label: 'Rejected'       },
    { value: CVPS_STATUS.HOLD,         label: 'On Hold'        },
  ];

  // ── Computed Filters + Pagination ─────────────────────────────
  filteredRecords = computed(() => {
    const q = this.searchText().toLowerCase().trim();
    const s = this.statusFilter();
    return this.allRecords().filter(r =>
      (s === 'ALL' || r.reqStatus === s) &&
      (!q ||
        r.contractorId.toLowerCase().includes(q) ||
        r.vehicleNo.toLowerCase().includes(q)    ||
        r.natureOfJob.toLowerCase().includes(q)  ||
        String(r.requestNo).includes(q)          ||
        this.getDriverName(r).toLowerCase().includes(q)
      )
    );
  });

  pagedRecords = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredRecords().slice(start, start + this.pageSize);
  });

  get totalPages()    { return Math.max(1, Math.ceil(this.filteredRecords().length / this.pageSize)); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  // ── Phase B — Side Panel State ─────────────────────────────────
  selectedRecord   = signal<CvpsRequest | null>(null);
  panelOpen        = signal(false);
  workflowRemarks  = signal('');
  workflowLoading  = signal(false);
  workflowMsg      = signal('');
  workflowError    = signal('');

  // Role helpers exposed to template
  readonly isUploader  = computed(() => this.auth.isUploader());
  readonly isConfirmer = computed(() => this.auth.isConfirmer());
  readonly isApprover  = computed(() => this.auth.isApprover());
  readonly isEmployee  = computed(() => this.auth.isRegularUser()); // ← NEW
  readonly empCode     = computed(() => this.auth.empCode());

  // ── Phase C — Gate Validation State ────────────────────────────
  gateVehicleNo    = signal('');
  gateResult       = signal<CvpsRequest | null>(null);
  gateChecking     = signal(false);
  gateError        = signal('');
  showGatePanel    = signal(false);

  // ── Excel download ─────────────────────────────────────────────
  excelLoading = signal(false);

  ngOnInit(): void { this.loadRecords(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ── Load records — filtered by contractorId for non-authority users ──
  loadRecords(): void {
    this.isLoading.set(true);
    this.errorMsg.set('');
    this.cvps.getAllRequests().pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading.set(false)),
      catchError(err => {
        this.errorMsg.set(err?.error?.message || 'Failed to load records. Check network connection.');
        return of([]);
      })
    ).subscribe(records => {
      // ── CONTRACTOR SCOPE FILTER ─────────────────────────────
      // UPLOADER / CONFIRMER / APPROVER / ADMIN → see ALL records
      // EMPLOYEE (Regular)                      → see ONLY their own contractorId records
      const canSeeAll = this.auth.isConfirmer() || this.auth.isApprover() || this.auth.isUploader();
      if (canSeeAll) {
        this.allRecords.set(records);
      } else {
        const myCode = this.auth.empCode().trim().toUpperCase();
        this.allRecords.set(
          records.filter(r => r.contractorId.trim().toUpperCase() === myCode)
        );
      }
    });
  }

  // ── Navigation ─────────────────────────────────────────────────
  addNew()            { this.router.navigate(['/vehicle-permission/add']); }
  goToPage(p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }
  onSearch(v: string) { this.searchText.set(v); this.currentPage.set(1); }

  onStatusFilterChange(val: string): void {
    this.statusFilter.set(val);
    this.currentPage.set(1);
  }

  // ── Phase B: Open / Close Action Panel ────────────────────────
  openPanel(record: CvpsRequest): void {
    this.selectedRecord.set(record);
    this.workflowRemarks.set('');
    this.workflowMsg.set('');
    this.workflowError.set('');
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
    this.selectedRecord.set(null);
  }

  // ── Phase B: Execute Workflow Action ──────────────────────────
  doAction(action: 'CONFIRM' | 'APPROVE' | 'REJECT' | 'HOLD'): void {
    const rec = this.selectedRecord();
    if (!rec?.requestNo) return;
    if (!this.workflowRemarks().trim()) {
      this.workflowError.set('Remarks are required before taking action.');
      return;
    }
    this.workflowLoading.set(true);
    this.workflowError.set('');
    this.workflowMsg.set('');

    const payload: WorkflowAction = {
      action,
      empNo  : this.empCode(),
      remarks: this.workflowRemarks().trim(),
    };

    this.cvps.doWorkflowAction(rec.requestNo, payload).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.workflowLoading.set(false)),
      catchError(err => {
        this.workflowError.set(err?.error?.message || `Failed to ${action.toLowerCase()} request.`);
        return of(null);
      })
    ).subscribe(updated => {
      if (updated) {
        this.workflowMsg.set(`✅ Request ${action.toLowerCase()}ed successfully!`);
        // Update the row in the list in-place — no full reload
        this.allRecords.update(list =>
          list.map(r => r.requestNo === updated.requestNo ? updated : r)
        );
        this.selectedRecord.set(updated);
        setTimeout(() => { this.workflowMsg.set(''); this.closePanel(); }, 1800);
      }
    });
  }

  // ── Phase B: Download a document from the panel ───────────────
  downloadDoc(docId: number | undefined, filename: string): void {
    if (!docId) return;
    this.cvps.downloadDocument(docId).pipe(
      takeUntil(this.destroy$),
      catchError(() => of(null))
    ).subscribe(blob => {
      if (blob) this.cvps.triggerBlobDownload(blob, filename || `document_${docId}.pdf`);
    });
  }

  // ── Phase C: Gate Validation ──────────────────────────────────
  toggleGatePanel(): void {
    this.showGatePanel.update(v => !v);
    this.gateVehicleNo.set('');
    this.gateResult.set(null);
    this.gateError.set('');
  }

  checkGatePass(): void {
    const vno = this.gateVehicleNo().trim().toUpperCase();
    if (!vno) { this.gateError.set('Enter a vehicle number.'); return; }
    this.gateChecking.set(true);
    this.gateResult.set(null);
    this.gateError.set('');
    this.cvps.validateGatePass(vno).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.gateChecking.set(false)),
      catchError(err => {
        this.gateError.set(
          err?.status === 404
            ? `❌ ACCESS DENIED — Vehicle ${vno} has no APPROVED gate pass on file.`
            : err?.error?.message || 'Validation check failed.'
        );
        return of(null);
      })
    ).subscribe(result => { if (result) this.gateResult.set(result); });
  }

  // ── Excel Download ─────────────────────────────────────────────
  downloadExcel(): void {
    this.excelLoading.set(true);
    this.cvps.downloadExcelReport().pipe(
      takeUntil(this.destroy$),
      finalize(() => this.excelLoading.set(false)),
      catchError(() => of(null))
    ).subscribe(blob => {
      if (blob) this.cvps.triggerBlobDownload(blob, 'cvps_master_report.xlsx');
    });
  }

  // ── Helpers ────────────────────────────────────────────────────
  getDriverName(r: CvpsRequest): string {
    const driver = r.employeeDetails?.find(e => e.empJob?.toUpperCase() === 'DRIVER');
    return driver?.name || '—';
  }

  formatDate(d: string | undefined): string {
    if (!d || d.length < 10) return d ?? '—';
    const dateOnly = d.split('T')[0];
    const [y, m, day] = dateOnly.split('-');
    return `${day}/${m}/${y}`;
  }

  getStatusClass(s: string | undefined): string {
    switch ((s || '').toUpperCase()) {
      case 'APPROVED' : return 'vpl-badge-approved';
      case 'CONFIRMED': return 'vpl-badge-confirmed';
      case 'CREATED'  : return 'vpl-badge-submitted';
      case 'HOLD'     : return 'vpl-badge-pending';
      case 'REJECTED' : return 'vpl-badge-rejected';
      default         : return 'vpl-badge-draft';
    }
  }

  getStatusLabel(s: string | undefined): string {
    switch ((s || '').toUpperCase()) {
      case 'CREATED'  : return 'Created';
      case 'CONFIRMED': return 'Confirmed';
      case 'APPROVED' : return 'Approved';
      case 'REJECTED' : return 'Rejected';
      case 'HOLD'     : return 'On Hold';
      default         : return s || '—';
    }
  }

  canModify(r: CvpsRequest): boolean {
    const s = (r.reqStatus || '').toUpperCase();
    return this.isUploader() && (s === 'CREATED' || s === 'HOLD');
  }
}