import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { CvpsService, CreateRequestDTO } from '../../services/cvps.service';
import { AuthService } from '../../core/auth.service';
interface WorkflowActionPayload {
  action: 'APPROVE' | 'REJECT' | 'HOLD';
  empNo: string;
  remarks: string;
}

interface ApproverRecord {
  requestNo: number;
  contractorId: string;
  natureOfJob: string;
  vehicleNo: string;
  vehicleType: string;
  permissionFrom: string;
  permissionTo: string;
  reqStatus: string;
  createdBy: string;
  createdDate: string;
  employeeDetails?: any[];
  vehicleDocuments?: any[];
}
@Component({
  selector: 'app-contractor-approver',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contractor-approver.html',
  styleUrl: './contractor-approver.css'
})
export class ContractorApproverComponent implements OnInit, OnDestroy {
  private cvps = inject(CvpsService);
  private auth = inject(AuthService);
  private destroy$ = new Subject<void>();

  readonly approverName = computed(() => this.auth.empName() || 'APPROVER');
  readonly empCode = computed(() => this.auth.empCode());

  // ── List Queue State ──────────────────────────────────────────
  allRecords = signal<ApproverRecord[]>([]);
  isLoading = signal(true);
  errorMsg = signal('');
  searchText = signal('');
  currentPage = signal(1);
  readonly pageSize = 10;

  // ── Selected Details Drawer State ─────────────────────────────
selectedRecord = signal<ApproverRecord | null>(null);
  panelOpen = signal(false);
  actionRemark = signal('');
  actionError = signal('');
  actionSuccess = signal('');
  isActing = signal(false);
  activeAction = signal<'modify' | 'approve' | 'reject' | null>(null);

  ngOnInit(): void {
    this.loadPendingQueue();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Load Requests matching CONFIRMED stage ────────────────────
 loadPendingQueue(): void {
  this.isLoading.set(true);
  this.errorMsg.set('');

  this.cvps.getAllRequests().pipe(
    takeUntil(this.destroy$),
    finalize(() => this.isLoading.set(false)),
    catchError(err => {
      this.errorMsg.set(err?.error?.message || 'Failed to load Approver Queue.');
      return of([]);
    })
  ).subscribe((records: CreateRequestDTO[]) => {
    const pendingApprovals = (records || [])
      .map(dto => this.mapDtoToRecord(dto))
      .filter(r => (r.reqStatus || '').toUpperCase() === 'CONFIRMED');

    this.allRecords.set(pendingApprovals);
  });
}
private mapDtoToRecord(dto: CreateRequestDTO): ApproverRecord {
  const req = dto.request || ({} as any);

  return {
    requestNo: Number(req.requestNo || 0),
    contractorId: req.contractorId || '',
    natureOfJob: req.natureOfJob || '',
    vehicleNo: req.vehicleNo || '',
    vehicleType: req.vehicleType || '',
    permissionFrom: req.permissionFrom || '',
    permissionTo: req.permissionTo || '',
    reqStatus: (req.reqStatus || '').toUpperCase(),
    createdBy: req.createdBy || '',
    createdDate: req.createdDate || '',
    employeeDetails: (dto.employees || []).map((emp: any) => ({
      id: emp.empNo || 0,
      empJob: emp.empJob || emp.empType || '',
      empType: emp.empType || '',
      name: emp.name || '',
      mobileNo: emp.mobileNo || '',
      aadharNo: (emp.documents || []).find((d: any) =>
        ['AADHAAR', 'AADHAR', 'ADHAR', 'AADHAAR_CARD'].includes(
          String(d.documentType || '').trim().toUpperCase().replace(/\s+/g, '_')
        )
      )?.documentNo || ''
    })),
    vehicleDocuments: (dto.vehicleDocuments || []).map((doc: any) => ({
      id: doc.id,
      documentType: doc.documentType || '',
      documentNo: doc.documentNo || '',
      validFrom: doc.validFrom || '',
      validTill: doc.validTill || '',
      filename: doc.filename || doc.fileName || doc.documentName || ''
    }))
  };
}

  // ── Search & Pagination Computeds ─────────────────────────────
  pendingList = computed(() => {
    const q = this.searchText().toLowerCase().trim();
    if (!q) return this.allRecords();
    return this.allRecords().filter(r =>
      String(r.requestNo).includes(q) ||
      (r.contractorId || '').toLowerCase().includes(q) ||
      (r.vehicleNo || '').toLowerCase().includes(q) ||
      (r.natureOfJob || '').toLowerCase().includes(q)
    );
  });

  pagedList = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.pendingList().slice(start, start + this.pageSize);
  });

  get totalPages() { return Math.max(1, Math.ceil(this.pendingList().length / this.pageSize)); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  // ── Side Panel Controls ───────────────────────────────────────
  openDetails(record: ApproverRecord): void {
    this.selectedRecord.set(record);
    this.actionRemark.set('');
    this.actionError.set('');
    this.actionSuccess.set('');
    this.activeAction.set(null);
    this.panelOpen.set(true);
  }

  closeDetails(): void {
    this.panelOpen.set(false);
    this.selectedRecord.set(null);
  }

  setAction(action: 'modify' | 'approve' | 'reject'): void {
    this.activeAction.set(this.activeAction() === action ? null : action);
    this.actionError.set('');
    this.actionSuccess.set('');
  }

  // ── Execute Workflow Actions ──────────────────────────────────
  doWorkflow(action: 'APPROVE' | 'REJECT' | 'HOLD'): void {
    const rec = this.selectedRecord();
    if (!rec?.requestNo) return;

    if (!this.actionRemark().trim()) {
      this.actionError.set(`Remarks are required to perform this action.`);
      return;
    }

    this.isActing.set(true);
    this.actionError.set('');
    this.actionSuccess.set('');

    const payload: WorkflowActionPayload = {
      action,
      empNo: this.empCode() || 'SYSTEM',
      remarks: this.actionRemark().trim()
    };
    this.actionError.set(
  `Workflow service method is not added in CvpsService yet for action "${action}" on request #${rec.requestNo}.`
);
this.isActing.set(false);
console.log('Approver workflow payload:', payload);
  }

  // ── Document Downloader ───────────────────────────────────────
downloadDoc(docId: number | undefined, filename: string): void {
  this.actionError.set(
    `Document download is not wired in CvpsService yet${docId ? ' for doc #' + docId : ''}.`
  );
}

  // ── Helper Utility Maps ───────────────────────────────────────
getDriverName(r: ApproverRecord): string {
  const d = r.employeeDetails?.find((e: any) => e.empJob?.toUpperCase() === 'DRIVER');
  return d?.name || '—';
}

  formatDate(d: string | undefined): string {
    if (!d || d.length < 10) return d ?? '—';
    const [y, m, day] = d.split('T')[0].split('-');
    return `${day}/${m}/${y}`;
  }
}