import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Subject, takeUntil, timeout, catchError, of, interval, switchMap } from 'rxjs';
import { API_CONFIG } from '../core/api.config';
import { AuthService } from '../core/auth.service';

const HTTP_TIMEOUT_MS = 12000;

interface DocRecord {
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

  private auth = inject(AuthService);
  private http = inject(HttpClient);

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });

  private readonly destroy$ = new Subject<void>();

  // ── Same signals as passes.ts ──
  private allPassesRaw = signal<any[]>([]);
  isLoading  = signal(true);
  hasError   = signal(false);

  searchText    = signal('');
  filterStatus  = signal('ALL');
  filterEmpType = signal('ALL');
  currentPage   = signal(1);
  pageSize      = signal(10);

  filteredPasses = computed(() => {
    const q  = this.searchText().toLowerCase();
    const st = this.filterStatus();
    const et = this.filterEmpType();
    return this.allPassesRaw().filter(p => {
      const matchSearch =
        !q ||
        (p.employeeNo         || '').toLowerCase().includes(q) ||
        (p.contractorCode     || '').toLowerCase().includes(q) ||
        (p.dept               || '').toLowerCase().includes(q) ||
        (p.mobileNo           || '').toLowerCase().includes(q) ||
        (p.vehicle?.vehicleNo || '').toLowerCase().includes(q) ||
        String(p.passId       || '').includes(q)              ||
        this.formatPassId(p.passId).toLowerCase().includes(q);
      const rowStatus    = p.status || p.passStatus || '';
      const matchStatus  = st === 'ALL' || rowStatus === st;
      const matchEmpType = et === 'ALL' || (p.empType || '') === et;
      return matchSearch && matchStatus && matchEmpType;
    });
  });

  pagedPasses = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredPasses().slice(start, start + this.pageSize());
  });

  get totalPages(): number      { return Math.max(1, Math.ceil(this.filteredPasses().length / this.pageSize())); }
  get totalPagesArr(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  // ── View modal signals (same as passes.ts) ──
  showViewModal     = signal(false);
  viewPass          = signal<any>(null);
  viewPassDocs      = signal<DocRecord[]>([]);
  isLoadingViewDocs = signal(false);
  viewDocLoadError  = signal('');
  viewPdfLoading    = signal<number | null>(null);
  viewPdfError      = signal('');

  ngOnInit()    { this.loadPasses(); this.startPolling(); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  loadPasses(): void {
    this.isLoading.set(true);
    this.hasError.set(false);
    const myCode = this.auth.empCode().trim().toLowerCase();

    this.http.get<any[]>(API_CONFIG.PASS_LIST, { headers: this.HEADERS, observe: 'response' })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          this.hasError.set(true);
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe((response: HttpResponse<any[]> | null) => {
        if (!response) return;
        const raw = (response.status === 204 || !response.body) ? [] : response.body!;

        // ── EMPLOYEE FILTER: only this person's passes, no drafts ──
        const mine = raw
          .filter(p => (p.status || '').toLowerCase() !== 'draft')
          .filter(p =>
            (p.enterBy    || '').toLowerCase() === myCode ||
            (p.employeeNo || '').toLowerCase() === myCode
          );

        this.allPassesRaw.set(mine);
        this.isLoading.set(false);
      });
  }

  private startPolling(): void {
    interval(30000)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() =>
          this.http.get<any[]>(API_CONFIG.PASS_LIST, { headers: this.HEADERS, observe: 'response' })
            .pipe(catchError(() => of(null)))
        )
      )
      .subscribe((response: HttpResponse<any[]> | null) => {
        if (!response) return;
        const raw = (response.status === 204 || !response.body) ? [] : response.body!;
        const myCode = this.auth.empCode().trim().toLowerCase();
        const mine = raw
          .filter(p => (p.status || '').toLowerCase() !== 'draft')
          .filter(p =>
            (p.enterBy    || '').toLowerCase() === myCode ||
            (p.employeeNo || '').toLowerCase() === myCode
          );
        this.allPassesRaw.set(mine);
      });
  }

  onSearch       (v: string) { this.searchText.set(v);    this.currentPage.set(1); }
  onFilterStatus (v: string) { this.filterStatus.set(v);  this.currentPage.set(1); }
  onFilterEmpType(v: string) { this.filterEmpType.set(v); this.currentPage.set(1); }
  onPageSize     (v: string) { this.pageSize.set(+v);     this.currentPage.set(1); }
  goToPage       (p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }

  formatPassId(id: number | null | undefined): string {
    if (!id && id !== 0) return '—';
    return `PASS-HEG-${String(id).padStart(4, '0')}`;
  }

  formatDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getStatusClass(s: string): string {
    switch ((s || '').toLowerCase()) {
      case 'active'     : return 'badge badge-active';
      case 'expiring'   : return 'badge badge-expiring';
      case 'expired'    : return 'badge badge-expired';
      case 'surrendered': return 'badge badge-surrendered';
      case 'submitted'  : return 'badge badge-submitted';
      case 'confirmed'  : return 'badge badge-confirmed';
      default           : return 'badge badge-surrendered';
    }
  }

  getEmpTypeBadgeClass(e: string): string {
    return e === 'Contractor' ? 'badge badge-contractor' : 'badge badge-employee';
  }

  openViewModal(p: any): void {
    this.viewPass.set(p);
    this.viewPassDocs.set([]);
    this.viewDocLoadError.set('');
    this.viewPdfError.set('');
    this.viewPdfLoading.set(null);
    this.showViewModal.set(true);
    this.loadViewDocs(p);
  }

  closeViewModal(): void {
    this.showViewModal.set(false);
    this.viewPass.set(null);
    this.viewPassDocs.set([]);
    this.viewDocLoadError.set('');
    this.viewPdfError.set('');
  }

  private loadViewDocs(p: any): void {
    const vehicleId: number | null = p.vehicle?.vehicleId ?? null;
    if (!vehicleId) {
      this.isLoadingViewDocs.set(true);
      this.http.get<any[]>(API_CONFIG.PASS_LIST, { headers: this.HEADERS })
        .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$), catchError(() => of([])))
        .subscribe(list => {
          const vid = (list || []).find((x: any) => x.passId === p.passId)?.vehicle?.vehicleId ?? null;
          if (vid) this.fetchViewDocsByVehicleId(vid);
          else { this.viewDocLoadError.set('No vehicle linked.'); this.isLoadingViewDocs.set(false); }
        });
      return;
    }
    this.fetchViewDocsByVehicleId(vehicleId);
  }

  private fetchViewDocsByVehicleId(vehicleId: number): void {
    this.isLoadingViewDocs.set(true);
    this.viewDocLoadError.set('');
    this.http.get<DocRecord[]>(API_CONFIG.DOCUMENTS, { headers: this.HEADERS })
      .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          this.viewDocLoadError.set('Could not load documents.');
          this.isLoadingViewDocs.set(false);
          return of([]);
        })
      )
      .subscribe(docs => {
        const filtered = (docs || []).filter(d => d.vehicle?.vehicleId === vehicleId);
        this.viewPassDocs.set(filtered);
        if (!filtered.length) this.viewDocLoadError.set('No documents found for this vehicle.');
        this.isLoadingViewDocs.set(false);
      });
  }

  viewDocumentPdf(doc: DocRecord): void {
    if (!doc?.documentId || !doc?.fileName) {
      this.viewPdfError.set('No file attached.');
      setTimeout(() => this.viewPdfError.set(''), 3500);
      return;
    }
    this.viewPdfLoading.set(doc.documentId);
    this.viewPdfError.set('');
    this.http.get(`${API_CONFIG.DOCUMENTS_DOWNLOAD}?id=${doc.documentId}`, { responseType: 'blob', headers: this.HEADERS })
      .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(() => { this.viewPdfError.set('Could not load file.'); this.viewPdfLoading.set(null); return of(null); })
      )
      .subscribe((blob: Blob | null) => {
        this.viewPdfLoading.set(null);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      });
  }

  getDocStatusClass(exp: string): string {
    if (!exp) return 'doc-status-unknown';
    const days = Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
    return days < 0 ? 'doc-status-expired' : days <= 30 ? 'doc-status-expiring' : 'doc-status-valid';
  }

  getDocStatusText(exp: string): string {
    if (!exp) return 'Unknown';
    const days = Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
    return days < 0 ? 'Expired' : days <= 30 ? `Expiring in ${days}d` : 'Valid';
  }
}