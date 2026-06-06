import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

const HTTP_TIMEOUT_MS = 12000;

// ── Maps your route eventType → API action value(s) ──
// eventType in route  →  action values to match in API response
const ACTION_MAP: Record<string, string[]> = {
  ALL:         [],                                    // show everything
  CREATED:     ['CREATE', 'CREATED'],                 // API sends 'CREATE'
  APPROVED:    ['APPROVED', 'APPROVE'],
  SURRENDERED: ['SURRENDER', 'SURRENDERED'],           // API sends 'SURRENDER'
  EXPIRED:     ['EXPIRED', 'EXPIRY'],
};

const PAGE_CONFIG: Record<string, {
  title: string; icon: string; iconColor: string;
  pillBg: string; pillColor: string; emptyMsg: string;
}> = {
  ALL: {
    title: 'All History', icon: 'bi-clock-history',
    iconColor: '#e65c00',
    pillBg: '#f0f0f0', pillColor: '#555',
    emptyMsg: 'No history records found.',
  },
  CREATED: {
    title: 'Pass Created History', icon: 'bi-plus-circle',
    iconColor: '#e65c00',
    pillBg: '#fff8e1', pillColor: '#e65100',
    emptyMsg: 'No pass creation events found.',
  },
  APPROVED: {
    title: 'Approved History', icon: 'bi-check-circle',
    iconColor: '#1e7e34',
    pillBg: '#e6f4ea', pillColor: '#1e7e34',
    emptyMsg: 'No approval events found.',
  },
  SURRENDERED: {
    title: 'Surrendered History', icon: 'bi-x-circle',
    iconColor: '#555',
    pillBg: '#f0f0f0', pillColor: '#555',
    emptyMsg: 'No surrender events found.',
  },
  EXPIRED: {
    title: 'Expiry Events', icon: 'bi-calendar-x',
    iconColor: '#c0392b',
    pillBg: '#fdecea', pillColor: '#c0392b',
    emptyMsg: 'No expiry events found.',
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
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });
  private readonly destroy$ = new Subject<void>();

  // ── Route-driven ──
  eventType = 'ALL';   // matches route data key: eventType
  get cfg() { return PAGE_CONFIG[this.eventType] ?? PAGE_CONFIG['ALL']; }

  // ── State ──
  allLogs   = signal<any[]>([]);
  isLoading = signal(true);
  hasError  = signal(false);

  // ── Filters ──
  searchText  = signal('');
  currentPage = signal(1);
  pageSize    = signal(10);

  // ── Computed ──
  filteredLogs = () => {
    const q = this.searchText().toLowerCase();
    return this.allLogs().filter(h =>
      !q ||
      (h.passNo  || '').toLowerCase().includes(q) ||
      (h.empCode || '').toLowerCase().includes(q) ||
      (h.remark  || '').toLowerCase().includes(q)
    );
  };

  pagedLogs = () => {
    const s = (this.currentPage() - 1) * this.pageSize();
    return this.filteredLogs().slice(s, s + this.pageSize());
  };

  get totalPages()    { return Math.max(1, Math.ceil(this.filteredLogs().length / this.pageSize())); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit() {
    // Re-fires on every sidebar click to a new history sub-route
    this.route.data.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.eventType = data['eventType'] ?? 'ALL';
      this.searchText.set('');
      this.currentPage.set(1);
      this.loadHistory();
    });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  loadHistory() {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.http
      .get<any[]>(`${API_CONFIG.BASE_URL}/api/history/list`, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('❌ history error:', err?.status, err?.error);
          this.hasError.set(true);
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe(data => {
        if (data === null) return;

        const matchActions = ACTION_MAP[this.eventType] ?? [];

        const filtered = matchActions.length === 0
          ? data   // ALL — show everything
          : data.filter(h =>
              matchActions.includes((h.action || '').toUpperCase())
            );

        // Sort newest first
        const sorted = [...filtered].sort((a, b) =>
          new Date(b.dateOfEntry || 0).getTime() - new Date(a.dateOfEntry || 0).getTime()
        );
        this.allLogs.set(sorted);
        this.isLoading.set(false);
      });
  }

  onSearch  (v: string) { this.searchText.set(v); this.currentPage.set(1); }
  onPageSize(v: string) { this.pageSize.set(+v);  this.currentPage.set(1); }
  goToPage  (p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }

  formatDateTime(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d :
      dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ', ' +
      dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  getActionBadgeClass(action: string): string {
    switch ((action || '').toUpperCase()) {
      case 'CREATE':
      case 'CREATED':    return 'badge badge-expiring';
      case 'APPROVE':
      case 'APPROVED':   return 'badge badge-active';
      case 'SURRENDER':
      case 'SURRENDERED':return 'badge badge-surrendered';
      case 'EXPIRED':
      case 'EXPIRY':     return 'badge badge-expired';
      case 'IN':
      case 'ENTRY':      return 'badge badge-employee';
      case 'OUT':        return 'badge badge-expired';
      default:           return 'badge badge-surrendered';
    }
  }
}