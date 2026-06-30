import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, catchError, of } from 'rxjs'; // 🟢 Added catchError and of for clean stream fallback
import { CvpsService, WorkflowAction } from '../../services/cvps.service';
import { AuthService } from '../../core/auth.service';

interface CvpsRequestRecord {
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
  employeeDetails?: Array<{
    id: number;
    empJob: string;
    empType: string;
    aadharNo?: string;
    name?: string;
  }>;
  vehicleDocuments?: Array<{
    id: number;
    requestNo: number;
    documentType: string;
    documentNo: string;
    validFrom: string;
    validTill: string;
    filename?: string;
  }>;
}

@Component({
  selector: 'app-contractor-confirmer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contractor-confirmer.html',
  styleUrl: './contractor-confirmer.css'
})
export class ContractorConfirmerComponent implements OnInit, OnDestroy {
  private cvps = inject(CvpsService);
  private auth = inject(AuthService);
  private destroy$ = new Subject<void>();

  // Signals for state management
  confirmerName = signal<string>('Confirmer Panel');
  pendingList = signal<CvpsRequestRecord[]>([]);
  isLoading = signal<boolean>(false);
  hasError = signal<boolean>(false);
  searchText = signal<string>('');

  // Pagination details
  currentPage = signal<number>(1);
  pageSize = 10;

  // Selection modal trackers
  selectedPass = signal<CvpsRequestRecord | null>(null);
  activeAction = signal<string | null>(null); // 'modify' | 'reject' | null
  actionRemark = signal<string>('');
  isActing = signal<boolean>(false);
  actionSuccess = signal<string>('');
  actionError = signal<string>('');

  ngOnInit(): void {
    this.confirmerName.set(this.auth.empName() || 'Contractor Confirmer');
    this.loadRequests();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadRequests(): void {
    this.isLoading.set(true);
    this.hasError.set(false);

    // Fetching requests in 'CREATED' status for Confirmer approval queue
    this.cvps.getByStatus('CREATED')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          const sorted = (data || []).sort((a, b) => b.requestNo - a.requestNo);
          this.pendingList.set(sorted);
          this.isLoading.set(false);
        },
        error: (err: any) => {
          console.error('Error loading confirmer queue:', err);
          this.hasError.set(true);
          this.isLoading.set(false);
        }
      });
  }

  // Live client-side keyword criteria filtering signal rules
  filteredList = computed(() => {
    const q = this.searchText().trim().toLowerCase();
    const raw = this.pendingList();
    if (!q) return raw;

    return raw.filter(r =>
      r.requestNo.toString().includes(q) ||
      r.contractorId.toLowerCase().includes(q) ||
      r.vehicleNo.toLowerCase().includes(q) ||
      r.natureOfJob.toLowerCase().includes(q)
    );
  });

  // Pagination data splice window computations
  pagedList = computed(() => {
    const idx = (this.currentPage() - 1) * this.pageSize;
    return this.filteredList().slice(idx, idx + this.pageSize);
  });

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredList().length / this.pageSize));
  }

  get totalPagesArr(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  onSearch(v: string): void {
    this.searchText.set(v);
    this.currentPage.set(1);
  }

  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages) {
      this.currentPage.set(p);
    }
  }

  openDetails(p: CvpsRequestRecord): void {
    this.selectedPass.set(p);
    this.activeAction.set(null);
    this.actionRemark.set('');
    this.actionSuccess.set('');
    this.actionError.set('');
  }

  closeDetails(): void {
    if (!this.isActing()) {
      this.selectedPass.set(null);
    }
  }

  setAction(type: string): void {
    this.activeAction.set(type);
    this.actionError.set('');
  }

  confirm(p: CvpsRequestRecord): void {
    if (!this.actionRemark().trim()) {
      this.actionError.set('⚠️ Review action remark is required to confirm.');
      return;
    }
    this.submitAction(p.requestNo, 'CONFIRM');
  }

  sendForModify(p: CvpsRequestRecord): void {
    if (!this.actionRemark().trim()) {
      this.actionError.set('⚠️ Please state modification requirements in the remarks.');
      return;
    }
    this.submitAction(p.requestNo, 'HOLD'); // 'HOLD' sends back to Uploader state queues
  }

  reject(p: CvpsRequestRecord): void {
    if (!this.actionRemark().trim()) {
      this.actionError.set('⚠️ Explicit rejection justification comment is mandatory.');
      return;
    }
    this.submitAction(p.requestNo, 'REJECT');
  }

  private submitAction(requestNo: number, targetAction: 'CONFIRM' | 'APPROVE' | 'REJECT' | 'HOLD'): void {
    this.isActing.set(true);
    this.actionError.set('');

    const payload: WorkflowAction = {
      action: targetAction,
      remarks: this.actionRemark().trim(),
      empNo: this.auth.empCode() || 'SYSTEM'
    };

    this.cvps.doWorkflowAction(requestNo, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionSuccess.set(`✅ Request #${requestNo} processed as ${targetAction}.`);
          this.isActing.set(false);
          this.loadRequests();
          setTimeout(() => this.closeDetails(), 1500);
        },
        error: (err: any) => {
          this.actionError.set(err?.error?.message || 'Workflow execution error encountered.');
          this.isActing.set(false);
        }
      });
  }

  getDriverName(r: CvpsRequestRecord): string {
    const driver = r.employeeDetails?.find(e => e.empJob?.toUpperCase() === 'DRIVER');
    return driver ? driver.name || '—' : '—';
  }

  getDriverAadhar(r: CvpsRequestRecord): string {
    const driver = r.employeeDetails?.find(e => e.empJob?.toUpperCase() === 'DRIVER');
    return driver ? driver.aadharNo || '—' : '—';
  }

  formatDate(d: string | undefined): string {
    if (!d || d.length < 10) return d ?? '—';
    const cleanDate = d.split('T')[0];
    const [y, m, day] = cleanDate.split('-');
    return `${day}/${m}/${y}`;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🟢 ADDED: Unified Document Download Handler for Confirmer Dashboard
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  downloadDoc(docId: number | undefined, filename: string): void {
    if (!docId) return;
    this.cvps.downloadDocument(docId).pipe(
      takeUntil(this.destroy$),
      catchError((err) => {
        console.error('File streaming failed:', err);
        this.actionError.set('Could not fetch the attachment binary from storage.');
        return of(null);
      })
    ).subscribe(blob => {
      if (blob) {
        this.cvps.triggerBlobDownload(blob, filename || `document_${docId}.pdf`);
      }
    });
  }
}