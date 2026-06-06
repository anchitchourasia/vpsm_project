import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

const HTTP_TIMEOUT_MS = 12000;

// ── ACTION_MAP: route eventType  →  API action values (both forms for safety) ──
const ACTION_MAP: Record<string, string[]> = {
  ALL:         [],
  CREATED:     ['CREATE', 'CREATED'],
  APPROVED:    ['APPROVE', 'APPROVED'],
  SURRENDERED: ['SURRENDER', 'SURRENDERED'],
  EXPIRED:     ['EXPIRED', 'EXPIRY', 'EXPIRE'],
  GATE:        ['IN', 'OUT', 'ENTRY', 'EXIT'],
};

// ── Per-section page config (title, icon, badge color) ──
const PAGE_CONFIG: Record<string, {
  title: string; icon: string; iconColor: string;
  pillBg: string; pillColor: string; emptyMsg: string;
}> = {
  ALL: {
    title: 'All History', icon: 'bi-clock-history',
    iconColor: '#6366f1',
    pillBg: '#f0f0f0', pillColor: '#555',
    emptyMsg: 'No history records found.',
  },
  CREATED: {
    title: 'Pass Created History', icon: 'bi-plus-circle-fill',
    iconColor: '#e65c00',
    pillBg: '#fff8e1', pillColor: '#e65100',
    emptyMsg: 'No pass creation events found.',
  },
  APPROVED: {
    title: 'Approved History', icon: 'bi-check-circle-fill',
    iconColor: '#1e7e34',
    pillBg: '#e6f4ea', pillColor: '#1e7e34',
    emptyMsg: 'No approval events found.',
  },
  SURRENDERED: {
    title: 'Surrendered History', icon: 'bi-x-circle-fill',
    iconColor: '#6c757d',
    pillBg: '#f0f0f0', pillColor: '#555',
    emptyMsg: 'No surrender events found.',
  },
  EXPIRED: {
    title: 'Expiry Events', icon: 'bi-calendar-x-fill',
    iconColor: '#c0392b',
    pillBg: '#fdecea', pillColor: '#c0392b',
    emptyMsg: 'No expiry events found.',
  },
  GATE: {
    title: 'Gate Movement History', icon: 'bi-door-open-fill',
    iconColor: '#006494',
    pillBg: '#e8f4fd', pillColor: '#006494',
    emptyMsg: 'No gate movement events found.',
  },
};

@Component({
  selector   : 'app-history',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './history.html',
  styleUrl   : './history.css',
})
export class History implements OnInit, OnDestroy {

  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Accept'   : 'application/json',
  });
  private readonly destroy$ = new Subject<void>();

  // ── Route-driven state ──
  eventType = signal<string>('ALL');
  get cfg() { return PAGE_CONFIG[this.eventType()] ?? PAGE_CONFIG['ALL']; }

  // ── Data ──
  private allLogsRaw = signal<any[]>([]);
  isLoading          = signal(true);
  hasError           = signal(false);

  // ── Filter/pagination ──
  searchText  = signal('');
  currentPage = signal(1);
  pageSize    = signal(10);

  // ── Computed: filter by search text ──
  filteredLogs = computed(() => {
    const q = this.searchText().toLowerCase();
    if (!q) return this.allLogsRaw();
    return this.allLogsRaw().filter(h =>
      (h.passNo    || '').toLowerCase().includes(q) ||
      (h.empCode   || '').toLowerCase().includes(q) ||
      (h.action    || '').toLowerCase().includes(q) ||
      (h.remark    || '').toLowerCase().includes(q)
    );
  });

  // ── Computed: paginate ──
  pagedLogs = computed(() => {
    const s = (this.currentPage() - 1) * this.pageSize();
    return this.filteredLogs().slice(s, s + this.pageSize());
  });

  get totalPages()    { return Math.max(1, Math.ceil(this.filteredLogs().length / this.pageSize())); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit() {
    // Re-fires on every sidebar click between history sub-routes
    this.route.data.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.eventType.set(data['eventType'] ?? 'ALL');
      this.searchText.set('');
      this.currentPage.set(1);
      this.loadHistory();
    });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  // ── LOAD from API ──
  loadHistory() {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.http
      .get<any[]>(`${API_CONFIG.BASE_URL}/api/history/list`, {
        headers: this.HEADERS,
        observe : 'response',
      })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('❌ [History] GET error:', err?.status, err?.error);
          this.hasError.set(true);
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe((res: HttpResponse<any[]> | null) => {
        if (!res) return;

        const raw: any[] = (res.status === 204 || !res.body) ? [] : res.body;
        const matchActions = ACTION_MAP[this.eventType()] ?? [];

        // Filter by eventType, or show all if eventType = ALL
        const filtered = matchActions.length === 0
          ? raw
          : raw.filter(h =>
              matchActions.includes((h.action || '').toUpperCase())
            );

        // Sort newest first by dateOfEntry
        filtered.sort((a, b) =>
          new Date(b.dateOfEntry || 0).getTime() - new Date(a.dateOfEntry || 0).getTime()
        );

        this.allLogsRaw.set(filtered);
        this.isLoading.set(false);
      });
  }

  // ── Filter/pagination handlers ──
  onSearch  (v: string) { this.searchText.set(v); this.currentPage.set(1); }
  onPageSize(v: string) { this.pageSize.set(+v);  this.currentPage.set(1); }
  goToPage  (p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }

  // ── Date formatter (matches documents.ts pattern) ──
  formatDateTime(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return (
      dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ', ' +
      dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
  }

  // ── Badge class per action (uses existing app.css badge classes) ──
  getActionBadgeClass(action: string): string {
    switch ((action || '').toUpperCase()) {
      case 'CREATE':
      case 'CREATED':
        return 'badge badge-expiring';    // orange
      case 'APPROVE':
      case 'APPROVED':
        return 'badge badge-active';      // green
      case 'SURRENDER':
      case 'SURRENDERED':
        return 'badge badge-surrendered'; // grey
      case 'EXPIRED':
      case 'EXPIRY':
      case 'EXPIRE':
        return 'badge badge-expired';     // red
      case 'IN':
      case 'ENTRY':
        return 'badge badge-employee';    // blue
      case 'OUT':
      case 'EXIT':
        return 'badge badge-expired';     // red
      default:
        return 'badge badge-surrendered';
    }
  }
}