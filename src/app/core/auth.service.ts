
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap, timeout } from 'rxjs/operators';
import { API_CONFIG } from './api.config';

export interface AuthorityRecord {
  companyCode: string;
  departmentCode: string;
  empCode: string;
  authorityType: string;
  validFrom?: string;
  validTill?: string;
}

export interface SessionUser {
  empCode: string;
  empName: string;
  companyCode: string;
  deptCode: string;
  roles: string[];
  primaryRole: string;
  gates: string[];
  userCategory: string;
  authorities: AuthorityRecord[];
  source: 'authority' | 'employee';
}

const ROLE_PRIORITY = ['VERIFIER', 'UPLOADER', 'CONFIRMER', 'APPROVER'];

function resolvePrimaryRole(roles: string[]): string {
  let best = 'EMPLOYEE';
  for (const r of roles) {
    const up = r.toUpperCase();
    if (ROLE_PRIORITY.indexOf(up) > ROLE_PRIORITY.indexOf(best)) best = up;
  }
  return best;
}

const SESSION_KEY = 'cvps_session';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  });

  private _session = signal<SessionUser | null>(null);
  private _error = signal<string>('');

  readonly sessionReady = signal(false);
  readonly isLoggedIn = computed(() => !!this._session());
  readonly currentUser = computed(() => this._session());
  readonly primaryRole = computed(() => this._session()?.primaryRole ?? 'EMPLOYEE');
  readonly allRoles = computed(() => this._session()?.roles ?? []);
  readonly assignedGates = computed(() => this._session()?.gates ?? []);
  readonly empCode = computed(() => this._session()?.empCode ?? '');
  readonly empName = computed(() => this._session()?.empName ?? '');
  readonly companyCode = computed(() => this._session()?.companyCode ?? '');
  readonly deptCode = computed(() => this._session()?.deptCode ?? '');
  readonly userCategory = computed(() => this._session()?.userCategory ?? '');

  constructor(private http: HttpClient, private router: Router) { }

  clearError(): void {
    this._error.set('');
  }

  // NEW (matches backend: returns UserRoleResponse)
  resolveByEmpCode(empCode: string): Observable<any> {
    this.clearError();

    return this.http.get<{ empCode: string; roles: string[] }>(
      `${API_CONFIG.AUTHORITY_BY_EMP}/${empCode.trim()}`,
      { headers: this.HEADERS }
    ).pipe(
      timeout(12000),

      tap((response) => {
        if (!response || !response.roles || response.roles.length === 0) {
          throw {
            status: 404,
            error: {
              message: `Employee Code "${empCode}" not found.`
            }
          };
        }

        const session: SessionUser = {
          empCode: response.empCode,
          empName: response.empCode,  // You can enhance this later
          companyCode: 'HEG',  // Default, or fetch from elsewhere
          deptCode: '',  // Default, or fetch from elsewhere
          roles: response.roles.map(r => r.toUpperCase()),
          primaryRole: resolvePrimaryRole(response.roles),
          gates: [],
          userCategory: 'Authority',
          authorities: [],  // New endpoint doesn't return authorities
          source: 'authority'
        };

        this._saveSession(session);
      }),

      catchError(err => {
        if (err?.status === 404) {
          this._error.set(`Employee Code "${empCode}" not found.`);
        } else if (err?.status === 401) {
          this._error.set("API authentication failed.");
        } else if (err?.status === 0) {
          this._error.set("Cannot reach server.");
        } else {
          this._error.set(err?.error?.message || "Login failed.");
        }

        return throwError(() => err);
      })
    );
  }

  

  private _resolveFromEmployee(code: string): Observable<SessionUser> {
    return this.http.get<any[]>(
      API_CONFIG.EMPLOYEEREPORT,
      { headers: this.HEADERS }
    ).pipe(
      timeout(12_000),
      map((rows: any[]) => {
        const found = (rows || []).find(row => {
          if (Array.isArray(row)) {
            return String(row[0] || '').trim().toLowerCase() === code.toLowerCase();
          }
          const ec = String(
            row.empCode || row.employeeCode || row.EMP_CODE || row[0] || ''
          ).trim().toLowerCase();
          return ec === code.toLowerCase();
        });

        if (!found) {
          throw {
            status: 404,
            error: {
              message: `Employee code "${code}" is not registered. Contact administrator.`
            }
          };
        }

        const empC = Array.isArray(found) ? String(found[0]) : (found.empCode || found.EMP_CODE || code);
        const empN = Array.isArray(found) ? String(found[1]) : (found.empName || found.EMP_NAME || code);
        const dept = Array.isArray(found) ? String(found[2] || '') : (found.departmentCode || found.DEPT_CODE || '');
        const co = Array.isArray(found) ? String(found[4] || 'HEG') : (found.companyCode || 'HEG');

        const session: SessionUser = {
          empCode: empC,
          empName: empN,
          companyCode: co,
          deptCode: dept,
          roles: ['EMPLOYEE'],
          primaryRole: 'EMPLOYEE',
          gates: [],
          userCategory: 'Company_Employee',
          authorities: [],
          source: 'employee',
        };
        this._saveSession(session);
        return session;
      }),
      catchError(err => {
        const msg = err?.error?.message ||
          `Employee code "${code}" not found. Contact administrator.`;
        this._error.set(msg);
        return throwError(() => err);
      })
    );
  }

  tryRestoreSession(): void {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const stored: SessionUser = JSON.parse(raw);
        if (stored?.empCode && stored?.primaryRole) {
          this._session.set(stored);
        }
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
    this.sessionReady.set(true);
  }

  // ── Role helpers ──────────────────────────────────
  hasRole(role: string): boolean { return this.allRoles().includes(role.toUpperCase()); }
  isAdmin(): boolean { return this.hasRole('ADMIN'); }
  isUploader(): boolean { return this.hasRole('UPLOADER') || this.isAdmin(); }
  isConfirmer(): boolean { return this.hasRole('CONFIRMER') || this.isAdmin(); }
  isVerifier(): boolean { return this.hasRole('VERIFIER') || this.isAdmin(); }
  isApprover(): boolean { return this.hasRole('APPROVER') || this.isAdmin(); }
  hasAuthority(): boolean { return this._session()?.source === 'authority'; }
  isRegularUser(): boolean { return this._session()?.source === 'employee'; }

  role(): string { return this.primaryRole(); }
  company(): string { return this.companyCode(); }
  department(): string { return this.deptCode(); }
  resolveError(): string { return this._error(); }
  getUserCode(): string { return this.empCode(); }
  getUserName(): string { return this.empName(); }

  validTill(): string | null {
    const auths = this._session()?.authorities ?? [];
    const dates = auths.map((a: any) => a.validTill || '').filter(Boolean).sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }

  canActOnGate(gate: string): boolean {
    const gates = this.assignedGates();
    return gates.length === 0 || gates.includes(gate.trim());
  }

  logout(): void { this._clearSession(); this.router.navigate(['/login']); }

  private _saveSession(user: SessionUser): void {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch { /* storage full — silent */ }
    this._session.set(user);
    this.sessionReady.set(true);
  }

  private _clearSession(): void {
    sessionStorage.removeItem(SESSION_KEY);
    this._session.set(null);
    this.sessionReady.set(false);
  }
}