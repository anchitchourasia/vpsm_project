import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders }      from '@angular/common/http';
import { Router }                       from '@angular/router';
import { Observable, throwError }       from 'rxjs';
import { catchError, map, timeout }     from 'rxjs/operators';
import { API_CONFIG }                   from './api.config';

export interface AuthorityRecord {
  companyCode    : string;
  departmentCode : string;
  empCode        : string;
  authorityType  : string;
  validFrom     ?: string;
  validTill     ?: string;
}

export interface EmployeeRecord {
  empCode        ?: string;
  employeeCode   ?: string;
  empName        ?: string;
  employeeName   ?: string;
  department     ?: string;
  departmentName ?: string;
  companyCode    ?: string;
}

export interface SessionUser {
  empCode      : string;
  empName      : string;
  companyCode  : string;
  deptCode     : string;
  roles        : string[];
  primaryRole  : string;
  gates        : string[];
  userCategory : string;
  authorities  : AuthorityRecord[];
  source       : 'authority' | 'employee';
}

const ROLE_PRIORITY = ['EMPLOYEE', 'UPLOADER', 'CONFIRMER', 'APPROVER', 'ADMIN'];

function resolvePrimaryRole(roles: string[]): string {
  let best = 'EMPLOYEE';
  for (const r of roles) {
    const up = r.toUpperCase();
    if (ROLE_PRIORITY.indexOf(up) > ROLE_PRIORITY.indexOf(best)) best = up;
  }
  return best;
}

// ✅ sessionStorage key — survives refresh & tab-switch, dies on tab close / logout
const SESSION_KEY = 'vpsm_session';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
  });

  private _session = signal<SessionUser | null>(null);
  private _error   = signal<string>('');

  readonly sessionReady  = signal(false);
  readonly isLoggedIn    = computed(() => !!this._session());
  readonly currentUser   = computed(() => this._session());
  readonly primaryRole   = computed(() => this._session()?.primaryRole  ?? 'EMPLOYEE');
  readonly allRoles      = computed(() => this._session()?.roles        ?? []);
  readonly assignedGates = computed(() => this._session()?.gates        ?? []);
  readonly empCode       = computed(() => this._session()?.empCode      ?? '');
  readonly empName       = computed(() => this._session()?.empName      ?? '');
  readonly companyCode   = computed(() => this._session()?.companyCode  ?? '');
  readonly deptCode      = computed(() => this._session()?.deptCode     ?? '');
  readonly userCategory  = computed(() => this._session()?.userCategory ?? '');

  constructor(private http: HttpClient, private router: Router) {}

  resolveByEmpCode(empCode: string): Observable<SessionUser> {
    this._error.set('');
    const code = empCode.trim();

    return this.http.get<AuthorityRecord[]>(
      `${API_CONFIG.AUTHORITY_BY_EMP}/${code}`,
      { headers: this.HEADERS }
    ).pipe(
      timeout(12_000),
      map((records: AuthorityRecord[]) => {
        const roles = [...new Set(
          (records || [])
            .map(r => (r.authorityType || '').toUpperCase().trim())
            .filter(r => r.length > 0)
        )];

        const first = records[0];
        const session: SessionUser = {
          empCode     : first.empCode        || code,
          empName     : first.empCode        || code,
          companyCode : first.companyCode    || 'HEG',
          deptCode    : first.departmentCode || '',
          roles,
          primaryRole : resolvePrimaryRole(roles),
          gates       : [],
          userCategory: 'Authority',
          authorities : records,
          source      : 'authority',
        };
        this._saveSession(session);
        return session;
      }),
      catchError(err => {
        if (err?.status === 404) {
          return this._resolveFromEmployee(code);
        }
        const msg = err?.error?.message || 'Login failed. Try again.';
        this._error.set(msg);
        return throwError(() => err);
      })
    );
  }

  private _resolveFromEmployee(code: string): Observable<SessionUser> {
    return this.http.get<any[]>(
      API_CONFIG.EMPLOYEE_REPORT,
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
            error : {
              message: `Employee code "${code}" is not registered. Contact administrator.`
            }
          };
        }

        const empC = Array.isArray(found) ? String(found[0]) : (found.empCode || found.EMP_CODE || code);
        const empN = Array.isArray(found) ? String(found[1]) : (found.empName || found.EMP_NAME || code);
        const dept = Array.isArray(found) ? String(found[2] || '') : (found.departmentCode || found.DEPT_CODE || '');
        const co   = Array.isArray(found) ? String(found[4] || 'HEG') : (found.companyCode || 'HEG');

        const session: SessionUser = {
          empCode     : empC,
          empName     : empN,
          companyCode : co,
          deptCode    : dept,
          roles       : ['EMPLOYEE'],
          primaryRole : 'EMPLOYEE',
          gates       : [],
          userCategory: 'Company_Employee',
          authorities : [],
          source      : 'employee',
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

  // ✅ FIXED: Reads session from sessionStorage and restores signal
  // Called once by app.ts ngOnInit on every page load / refresh / tab open
  // sessionStorage survives refresh — so user stays logged in
  // sessionStorage dies when tab/browser is closed — so session is naturally limited
  tryRestoreSession(): void {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const stored: SessionUser = JSON.parse(raw);
        // Validate it's a real session object before trusting it
        if (stored?.empCode && stored?.primaryRole) {
          this._session.set(stored);
        }
      }
    } catch {
      // Corrupted data — silently clear it
      sessionStorage.removeItem(SESSION_KEY);
    }
    // Always set sessionReady = true so authGuard unblocks
    this.sessionReady.set(true);
  }

  // ── Role helpers ──────────────────────────────────
  hasRole(role: string): boolean { return this.allRoles().includes(role.toUpperCase()); }
  isAdmin()     : boolean        { return this.hasRole('ADMIN'); }
  isUploader()  : boolean        { return this.hasRole('UPLOADER')  || this.isAdmin(); }
  isConfirmer() : boolean        { return this.hasRole('CONFIRMER') || this.isAdmin(); }
  isApprover()  : boolean        { return this.hasRole('APPROVER')  || this.isAdmin(); }
  hasAuthority()  : boolean      { return this._session()?.source === 'authority'; }
  isRegularUser() : boolean      { return this._session()?.source === 'employee';  }

  role()        : string { return this.primaryRole(); }
  company()     : string { return this.companyCode(); }
  department()  : string { return this.deptCode(); }
  resolveError(): string { return this._error(); }
  getUserCode() : string { return this.empCode(); }
  getUserName() : string { return this.empName(); }

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
    // ✅ Write to sessionStorage — survives refresh, dies on tab close
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch { /* storage full — silent */ }
    this._session.set(user);
    this.sessionReady.set(true);
  }

  private _clearSession(): void {
    // ✅ Remove from sessionStorage on logout
    sessionStorage.removeItem(SESSION_KEY);
    this._session.set(null);
    this.sessionReady.set(false);
  }
}