import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule }    from '@angular/common';
import { FormsModule }     from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, interval, startWith, takeUntil, timeout, catchError, of } from 'rxjs';
import { AuthService }     from '../core/auth.service';
import { API_CONFIG }      from '../core/api.config';

const REFRESH_MS   = 30_000;
const TIMEOUT_MS   = 12_000;

// ── Map backend status → readable label ───────────────────────────
function statusLabel(s: string): string {
  switch ((s || '').toLowerCase()) {
    case 'submitted'         : return 'Pending Confirmation';
    case 'confirmed'         : return 'Pending Approval';
    case 'active'            : return 'Approved';
    case 'rejected'          : return 'Returned by Confirmer';
    case 'surrendered'       : return 'Returned by Approver';
    case 'expired'           : return 'Expired';
    case 'needs_modification': return 'Needs Modification';
    default                  : return s || '—';
  }
}

function statusClass(s: string): string {
  switch ((s || '').toLowerCase()) {
    case 'active'    : return 'badge-approved';
    case 'submitted' : return 'badge-submitted';
    case 'confirmed' : return 'badge-confirmed';
    case 'rejected'  :
    case 'surrendered': return 'badge-rejected';
    case 'expired'   : return 'badge-expired';
    default          : return 'badge-default';
  }
}

function fmt(iso: string): string {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

@Component({
  selector   : 'app-my-pass',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './my-pass.html',
  styleUrl   : './my-pass.css',
})
export class MyPass implements OnInit, OnDestroy {

  auth     = inject(AuthService);  // public — used in template
  private http    = inject(HttpClient);
  private destroy$ = new Subject<void>();

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
  });

  // ── State ──────────────────────────────────────────────────────────
  allMyPasses  = signal<any[]>([]);
  loading      = signal(true);
  errorMsg     = signal('');
  lastSyncedAt = signal('');
  expandedId   = signal<number | null>(null);
  searchTerm   = signal('');
  filterStatus = signal('ALL');

  readonly statusOptions = [
    { value: 'ALL',              label: 'All Statuses'          },
    { value: 'submitted',        label: 'Pending Confirmation'  },
    { value: 'confirmed',        label: 'Pending Approval'      },
    { value: 'active',           label: 'Approved'              },
    { value: 'rejected',         label: 'Returned by Confirmer' },
    { value: 'surrendered',      label: 'Returned by Approver'  },
    { value: 'expired',          label: 'Expired'               },
    { value: 'needs_modification', label: 'Needs Modification'  },
  ];

  filteredPasses = computed(() => {
    const term    = this.searchTerm().toLowerCase().trim();
    const status  = this.filterStatus();
    return this.allMyPasses().filter(p => {
      const matchStatus = status === 'ALL' ||
        (p.status || '').toLowerCase() === status.toLowerCase();
      const matchSearch = !term || (
        String(p.passId        || '').toLowerCase().includes(term) ||
        String(p.vehicle?.vehicleNo || '').toLowerCase().includes(term) ||
        String(p.gateNo        || '').toLowerCase().includes(term) ||
        String(p.empName       || '').toLowerCase().includes(term) ||
        String(p.status        || '').toLowerCase().includes(term)
      );
      return matchStatus && matchSearch;
    });
  });

  statusCounts = computed(() => {
    const counts: Record<string, number> = { ALL: this.allMyPasses().length };
    for (const p of this.allMyPasses()) {
      const s = (p.status || 'submitted').toLowerCase();
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  });

  // ── Lifecycle ──────────────────────────────────────────────────────
  ngOnInit(): void {
    interval(REFRESH_MS)
      .pipe(startWith(0), takeUntil(this.destroy$))
      .subscribe(() => this.loadMyPasses());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Core Fetch + Filter ────────────────────────────────────────────
  loadMyPasses(): void {
    this.loading.set(true);
    this.errorMsg.set('');
    const myCode = this.auth.empCode().trim().toLowerCase();

    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS }).pipe(
      timeout(TIMEOUT_MS),
      takeUntil(this.destroy$),
      catchError(err => {
        this.errorMsg.set('Could not reach server (' + (err?.status || 'network error') + ').');
        this.loading.set(false);
        return of([]);
      })
    ).subscribe(data => {
      const all = Array.isArray(data) ? data : [];

      // ── Filter: keep only passes belonging to logged-in employee ──
      // Backend uses "enterBy" for who submitted the pass (empCode stored there)
      // and "employeeNo" for the employee on the pass
      const mine = all.filter(p => {
        const enterBy    = String(p.enterBy    || '').trim().toLowerCase();
        const employeeNo = String(p.employeeNo || '').trim().toLowerCase();
        return enterBy === myCode || employeeNo === myCode;
      });

      this.allMyPasses.set(mine);
      this.loading.set(false);
      this.lastSyncedAt.set(
        new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
      );
    });
  }

  // ── UI helpers ─────────────────────────────────────────────────────
  toggle(passId: number): void {
    this.expandedId.update(cur => cur === passId ? null : passId);
  }

  onSearch(e: Event): void {
    this.searchTerm.set((e.target as HTMLInputElement).value);
  }

  setFilter(v: string): void { this.filterStatus.set(v); }

  statusLabel = statusLabel;
  statusClass = statusClass;
  fmt         = fmt;

  classLabel(cls: string): string {
    const map: Record<string, string> = {
      'Two_Wheeler'    : '🏍️ Two Wheeler',
      'Four_Wheeler'   : '🚗 Four Wheeler',
      'Heavy_Machinery': '🏗️ Heavy Machinery',
    };
    return map[cls] ?? cls ?? '—';
  }

  empTypeLabel(t: string): string {
    return t === 'Contractor' ? '🔧 Contractor' : '🏢 Company Employee';
  }
}