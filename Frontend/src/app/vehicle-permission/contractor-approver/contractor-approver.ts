import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { CvpsService, CvpsRequest, WorkflowAction, CVPS_STATUS } from '../../services/cvps.service';
import { AuthService } from '../../core/auth.service';

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
  allRecords = signal<CvpsRequest[]>([]);
  isLoading = signal(true);
  errorMsg = signal('');
  searchText = signal('');
  currentPage = signal(1);
  readonly pageSize = 10;

  // ── Selected Details Drawer State ─────────────────────────────
  selectedRecord = signal<CvpsRequest | null>(null);
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
    ).subscribe(records => {
      // Approver strictly handles requests confirmed by the Confirmer
      const pendingApprovals = (records || []).filter(r => 
        (r.reqStatus || '').toUpperCase() === 'CONFIRMED'
      );
      this.allRecords.set(pendingApprovals);
    });
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
  openDetails(record: CvpsRequest): void {
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

    const payload: WorkflowAction = {
      action,
      empNo: this.empCode() || 'SYSTEM',
      remarks: this.actionRemark().trim()
    };

    this.cvps.doWorkflowAction(rec.requestNo, payload).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isActing.set(false)),
      catchError(err => {
        this.actionError.set(err?.error?.message || `Workflow failed for action: ${action}`);
        return of(null);
      })
    ).subscribe(updated => {
      if (updated) {
        let actionLabel = action === 'HOLD' ? 'sent for modification' : action.toLowerCase() + 'd';
        this.actionSuccess.set(`✅ Request #${rec.requestNo} has been ${actionLabel} successfully!`);
        
        // Remove item from active confirmed list view
        this.allRecords.update(list => list.filter(r => r.requestNo !== rec.requestNo));
        
        setTimeout(() => {
          this.closeDetails();
          this.loadPendingQueue();
        }, 1800);
      }
    });
  }

  // ── Document Downloader ───────────────────────────────────────
  downloadDoc(docId: number | undefined, filename: string): void {
    if (!docId) return;
    this.cvps.downloadDocument(docId).pipe(
      takeUntil(this.destroy$),
      catchError(() => of(null))
    ).subscribe(blob => {
      if (blob) this.cvps.triggerBlobDownload(blob, filename || `document_${docId}.pdf`);
    });
  }

  // ── Helper Utility Maps ───────────────────────────────────────
  getDriverName(r: CvpsRequest): string {
    const d = r.employeeDetails?.find(e => e.empJob?.toUpperCase() === 'DRIVER');
    return d?.name || '—';
  }

  formatDate(d: string | undefined): string {
    if (!d || d.length < 10) return d ?? '—';
    const [y, m, day] = d.split('T')[0].split('-');
    return `${day}/${m}/${y}`;
  }
}