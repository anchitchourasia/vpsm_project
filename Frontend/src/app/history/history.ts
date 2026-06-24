// Frontend/src/app/history/history.ts
import { Component, OnInit, OnDestroy, signal, computed, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

const TIMEOUT_MS = 15000;

const ACTION_GROUPS: Record<string, string[]> = {
  'pass-created'  : ['SUBMITTED', 'CREATED', 'PASS_RAISED', 'DRAFT_SAVED'],
  'approved'      : ['APPROVED', 'CONFIRMED'],
  'surrendered'   : ['SURRENDERED'],
  'expiry-events' : ['EXPIRED', 'EXPIRY_WARN'],
  'gate-movements': ['GATE_IN', 'GATE_OUT', 'GATE_ENTRY', 'GATE_EXIT'],
  'all'           : [],
};

const TAB_LABELS: Record<string, string> = {
  'pass-created'  : 'Pass Created',
  'approved'      : 'Approved',
  'surrendered'   : 'Surrendered',
  'expiry-events' : 'Expiry Events',
  'gate-movements': 'Gate Movements',
  'all'           : 'All History',
};

interface HistoryRecord {
  passNo      : string;
  dateOfEntry : string;
  empCode     : string;
  action      : string;
  remark      : string;
  passRegistry?: {
    passId   : number;
    status   : string;
    vehicle  ?: { vehicleNo: string };
    gateNo   ?: string;
  } | null;
}

@Component({
  selector   : 'app-history',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './history.html',
  styleUrl   : './history.css',
})
export class History implements OnInit, OnDestroy {

  private destroy$  = new Subject<void>();
  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Accept'   : 'application/json',
  });

  allRecords   = signal<HistoryRecord[]>([]);
  isLoading    = signal(true);
  hasError     = signal(false);
  searchText   = signal('');
  currentPage  = signal(1);
  pageSize     = signal(10);
  activeGroup  = signal<string>('all');

  // ✅ NEW filter signals
  filterAction   = signal<string>('ALL');
  filterDateFrom = signal<string>('');
  filterDateTo   = signal<string>('');
  filterPassId   = signal<string>('');

  currentTabLabel = computed(() => TAB_LABELS[this.activeGroup()] ?? 'History');

  // ✅ NEW — unique action values for the dropdown (auto-built from loaded data)
  uniqueActions = computed(() => {
    const set = new Set<string>();
    this.allRecords().forEach(r => { if (r.action) set.add(r.action.toUpperCase()); });
    return Array.from(set).sort();
  });

  filteredRecords = computed(() => {
    const group   = this.activeGroup();
    const actions = ACTION_GROUPS[group] ?? [];
    const q       = this.searchText().toLowerCase().trim();
    const selAct  = this.filterAction();
    const from    = this.filterDateFrom();
    const to      = this.filterDateTo();
    

    let list = this.allRecords();
    const pid = this.filterPassId().trim().toLowerCase();
    if (pid) {
      list = list.filter(r =>
        (r.passNo || '').toLowerCase().includes(pid)
  );
}

    // Filter by action group tab (empty = all)
    if (actions.length > 0) {
      list = list.filter(r =>
        actions.some(a => (r.action || '').toUpperCase() === a.toUpperCase())
      );
    }

    // ✅ NEW — Filter by selected action dropdown
    if (selAct !== 'ALL') {
      list = list.filter(r =>
        (r.action || '').toUpperCase() === selAct.toUpperCase()
      );
    }

    // ✅ NEW — Filter by date FROM
    if (from) {
      const fromMs = new Date(from).setHours(0, 0, 0, 0);
      list = list.filter(r =>
        r.dateOfEntry && new Date(r.dateOfEntry).getTime() >= fromMs
      );
    }

    // ✅ NEW — Filter by date TO
    if (to) {
      const toMs = new Date(to).setHours(23, 59, 59, 999);
      list = list.filter(r =>
        r.dateOfEntry && new Date(r.dateOfEntry).getTime() <= toMs
      );
    }

    // Filter by search text
    if (q) {
      list = list.filter(r =>
        (r.passNo   || '').toLowerCase().includes(q) ||
        (r.empCode  || '').toLowerCase().includes(q) ||
        (r.action   || '').toLowerCase().includes(q) ||
        (r.remark   || '').toLowerCase().includes(q) ||
        (r.passRegistry?.vehicle?.vehicleNo || '').toLowerCase().includes(q)
      );
    }

    // Sort newest first
    return [...list].sort((a, b) =>
      new Date(b.dateOfEntry).getTime() - new Date(a.dateOfEntry).getTime()
    );
  });

  pagedRecords = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredRecords().slice(start, start + this.pageSize());
  });

  get totalPages()    { return Math.max(1, Math.ceil(this.filteredRecords().length / this.pageSize())); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.data.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.activeGroup.set(data['historyType'] || 'all');
      this.currentPage.set(1);
      this.resetFilters(); // ✅ reset filters on tab change
    });
    this.loadHistory();
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  loadHistory(): void {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.http.get<HistoryRecord[]>(API_CONFIG.HISTORY_LIST, { headers: this.HEADERS })
      .pipe(
        timeout(TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          console.error('[History] Load error:', err?.status);
          this.hasError.set(true);
          this.isLoading.set(false);
          return of([]);
        })
      )
      .subscribe(data => {
        this.allRecords.set(Array.isArray(data) ? data : []);
        this.isLoading.set(false);
      });
  }

  onSearch(v: string):     void { this.searchText.set(v);       this.currentPage.set(1); }
  onPageSize(v: string):   void { this.pageSize.set(+v);        this.currentPage.set(1); }
  goToPage(p: number):     void { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }

  // ✅ NEW filter handlers
  onFilterAction(v: string):   void { this.filterAction.set(v);   this.currentPage.set(1); }
  onFilterDateFrom(v: string): void { this.filterDateFrom.set(v); this.currentPage.set(1); }
  onFilterDateTo(v: string):   void { this.filterDateTo.set(v);   this.currentPage.set(1); }

  // ✅ NEW — resets all extra filters
  resetFilters(): void {
    this.searchText.set('');
    this.filterAction.set('ALL');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.currentPage.set(1);
  }

  formatDate(d: string): string {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
    } catch { return d; }
  }

  getActionClass(action: string): string {
    const a = (action || '').toUpperCase();
    if (['SUBMITTED','CREATED','PASS_RAISED'].includes(a)) return 'action-pill action-create';
    if (['APPROVED','CONFIRMED'].includes(a))              return 'action-pill action-approve';
    if (['REJECTED'].includes(a))                          return 'action-pill action-reject';
    if (['SURRENDERED'].includes(a))                       return 'action-pill action-surrender';
    if (['EXPIRED','EXPIRY_WARN'].includes(a))             return 'action-pill action-expired';
    if (['GATE_IN','GATE_ENTRY'].includes(a))              return 'action-pill action-gate-in';
    if (['GATE_OUT','GATE_EXIT'].includes(a))              return 'action-pill action-gate-out';
    return 'action-pill action-default';
  }
}