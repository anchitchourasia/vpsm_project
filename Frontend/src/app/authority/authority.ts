import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

const HTTP_TIMEOUT_MS = 12000;

interface AuthorityRecord {
  companyCode    : string;
  departmentCode : string;
  empCode        : string;
  authorityType  : string;
  validFrom      : string;
  validTill      : string;
}

@Component({
  selector   : 'app-authority',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './authority.html',
  styleUrl   : './authority.css',
})
export class Authority implements OnInit, OnDestroy {

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
  });
  private readonly destroy$ = new Subject<void>();

  // ── List state ──
  allAuthorities = signal<AuthorityRecord[]>([]);
  isLoading      = signal(true);
  hasError       = signal(false);
  searchText     = signal('');
  currentPage    = signal(1);
  pageSize       = signal(10);

  filteredList = computed(() => {
    const q = this.searchText().toLowerCase();
    if (!q) return this.allAuthorities();
    return this.allAuthorities().filter(a =>
      (a.empCode        || '').toLowerCase().includes(q) ||
      (a.companyCode    || '').toLowerCase().includes(q) ||
      (a.departmentCode || '').toLowerCase().includes(q) ||
      (a.authorityType  || '').toLowerCase().includes(q)
    );
  });

  pagedList = computed(() => {
    const s = (this.currentPage() - 1) * this.pageSize();
    return this.filteredList().slice(s, s + this.pageSize());
  });

  get totalPages()    { return Math.max(1, Math.ceil(this.filteredList().length / this.pageSize())); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  // ── Grant form state ──
  showForm       = signal(false);
  isSubmitting   = signal(false);
  submitSuccess  = signal(false);
  submitError    = signal('');

  form = signal<AuthorityRecord>({
    companyCode    : '',
    departmentCode : '',
    empCode        : '',
    authorityType  : '',
    validFrom      : '',
    validTill      : '',
  });

  constructor(private http: HttpClient) {}

  ngOnInit()    { this.loadAuthorities(); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  // ── LOAD LIST ──
  loadAuthorities() {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.http.get<AuthorityRecord[]>(API_CONFIG.AUTHORITY, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('❌ [Authority] GET error:', err);
          this.hasError.set(true);
          this.isLoading.set(false);
          return of([]);
        })
      )
      .subscribe(data => {
        this.allAuthorities.set(Array.isArray(data) ? data : []);
        this.isLoading.set(false);
      });
  }

  // ── GRANT FORM ──
  openForm() {
    this.form.set({ companyCode:'', departmentCode:'', empCode:'', authorityType:'', validFrom:'', validTill:'' });
    this.submitSuccess.set(false);
    this.submitError.set('');
    this.showForm.set(true);
  }
  closeForm() { this.showForm.set(false); }

  updateField(field: keyof AuthorityRecord, value: string) {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  submitGrant() {
    const f = this.form();
    if (!f.companyCode || !f.empCode || !f.authorityType || !f.validFrom || !f.validTill) {
      this.submitError.set('Company Code, Emp Code, Authority Type, Valid From and Valid Till are required.');
      return;
    }
    this.isSubmitting.set(true);
    this.submitError.set('');

    this.http.post<AuthorityRecord>(API_CONFIG.AUTHORITY_GRANT, f, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('❌ [Authority] POST error:', err);
          this.submitError.set(err?.error?.message || 'Failed to grant authority. Please try again.');
          this.isSubmitting.set(false);
          return of(null);
        })
      )
      .subscribe(res => {
        if (!res) return;
        this.isSubmitting.set(false);
        this.submitSuccess.set(true);
        this.loadAuthorities(); // refresh list
        setTimeout(() => { this.showForm.set(false); this.submitSuccess.set(false); }, 1800);
      });
  }

  // ── Helpers ──
  onSearch  (v: string) { this.searchText.set(v); this.currentPage.set(1); }
  onPageSize(v: string) { this.pageSize.set(+v);  this.currentPage.set(1); }
  goToPage  (p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }

  formatDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getAuthorityBadgeClass(type: string): string {
    switch ((type || '').toUpperCase()) {
      case 'CONFIRMER': return 'badge badge-expiring';
      case 'APPROVER' : return 'badge badge-active';
      case 'ADMIN'    : return 'badge badge-employee';
      default         : return 'badge badge-surrendered';
    }
  }

  isExpired(validTill: string): boolean {
    if (!validTill) return false;
    return new Date(validTill) < new Date();
  }
}