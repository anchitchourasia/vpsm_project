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
  mobileNo       ?: string;
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

const USER_KEY = 'vpsm_userName';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
  });

  private session = signal<SessionUser | null>(null);
  private _error  = signal<string>('');

  // ✅ true once session API resolves — app.html waits on this
  readonly sessionReady = signal(false);

  readonly isLoggedIn    = computed(() => !!this.session());
  readonly currentUser   = computed(() => this.session());
  readonly primaryRole   = computed(() => this.session()?.primaryRole  ?? 'EMPLOYEE');
  readonly allRoles      = computed(() => this.session()?.roles        ?? []);
  readonly assignedGates = computed(() => this.session()?.gates        ?? []);
  readonly empCode       = computed(() => this.session()?.empCode      ?? '');
  readonly empName       = computed(() => this.session()?.empName      ?? '');
  readonly companyCode   = computed(() => this.session()?.companyCode  ?? '');
  readonly deptCode      = computed(() => this.session()?.deptCode     ?? '');
  readonly userCategory  = computed(() => this.session()?.userCategory ?? '');

  constructor(private http: HttpClient, private router: Router) {}

  login(empCode: string): Observable<SessionUser> {
    return this._resolveFromAuthority(empCode.trim());
  }

  resolveByEmpCode(empCode: string): Observable<SessionUser> {
    return this._resolveFromAuthority(empCode.trim());
  }

  tryRestoreSession(): void {
    localStorage.removeItem('vpsm_session');
    const empCode = localStorage.getItem(USER_KEY)?.trim();
    if (!empCode) {
      this.sessionReady.set(true);
      return;
    }

    this._resolveFromAuthority(empCode).pipe(
      catchError(() => {
        if (!this.session()) {
          this.clearSession();
          this.router.navigate(['/login']);
        }
        this.sessionReady.set(true);
        return throwError(() => new Error('Session restore failed'));
      })
    ).subscribe();
  }

  private _resolveFromAuthority(code: string): Observable<SessionUser> {
    this._error.set('');
    const url = `${API_CONFIG.AUTHORITY_LOGIN}/${code}`;

    return this.http.get<AuthorityRecord[]>(url, { headers: this.HEADERS }).pipe(
      timeout(12_000),
      map((records: AuthorityRecord[]) => {
        if (!Array.isArray(records) || records.length === 0) {
          throw { status: 404 };
        }
        const roles = [...new Set(
          records
            .map(r => (r.authorityType || '').toUpperCase().trim())
            .filter(r => r.length > 0)
        )];
        const first = records[0];
        const session: SessionUser = {
          empCode     : first.empCode        || code,
          empName     : first.empCode        || code,
          companyCode : first.companyCode    || '',
          deptCode    : first.departmentCode || '',
          roles,
          primaryRole : resolvePrimaryRole(roles),
          gates       : [],
          userCategory: 'Authority',
          authorities : records,
          source      : 'authority',
        };
        this.saveSession(session);
        return session;
      }),
      catchError(err => {
        if (err?.status === 404) {
          return this._resolveFromEmployee(code);
        }
        const msg = err?.error?.message || err?.message || 'Login failed.';
        this._error.set(msg);
        return throwError(() => err);
      })
    );
  }

  private _resolveFromEmployee(code: string): Observable<SessionUser> {
    return this.http.get<EmployeeRecord[]>(
      API_CONFIG.EMPLOYEE_REPORT,
      { headers: this.HEADERS }
    ).pipe(
      timeout(12_000),
      map((employees: EmployeeRecord[]) => {
        const found = (employees || []).find(e => {
          const ec = (e.empCode || e.employeeCode || '').trim().toLowerCase();
          return ec === code.toLowerCase();
        });
        if (!found) {
          throw {
            status: 404,
            error: { message: `Employee code "${code}" not registered. Contact administrator.` }
          };
        }
        const session: SessionUser = {
          empCode     : found.empCode     || found.employeeCode || code,
          empName     : found.empName     || found.employeeName || code,
          companyCode : found.companyCode || 'HEG',
          deptCode    : found.department  || found.departmentName || '',
          roles       : ['EMPLOYEE'],
          primaryRole : 'EMPLOYEE',
          gates       : [],
          userCategory: 'Company_Employee',
          authorities : [],
          source      : 'employee',
        };
        this.saveSession(session);
        return session;
      }),
      catchError(err => {
        const msg = err?.error?.message || err?.message ||
          `Employee code "${code}" not found. Contact administrator.`;
        this._error.set(msg);
        return throwError(() => err);
      })
    );
  }

  hasRole(role: string): boolean { return this.allRoles().includes(role.toUpperCase()); }

  isAdmin()    : boolean { return this.hasRole('ADMIN');                        }
  isUploader() : boolean { return this.hasRole('UPLOADER')  || this.isAdmin(); }
  isConfirmer(): boolean { return this.hasRole('CONFIRMER') || this.isAdmin(); }
  isApprover() : boolean { return this.hasRole('APPROVER')  || this.isAdmin(); }

  hasAuthority() : boolean { return this.session()?.source === 'authority'; }
  isRegularUser(): boolean { return this.session()?.source === 'employee';  }

  role()      : string { return this.primaryRole(); }
  company()   : string { return this.companyCode(); }
  department(): string { return this.deptCode();    }

  validTill(): string | null {
    const auths = this.session()?.authorities ?? [];
    const dates = auths.map(a => a.validTill || '').filter(Boolean).sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }

  resolveError(): string { return this._error(); }
  getUserCode() : string { return this.empCode(); }
  getUserName() : string { return this.empName(); }

  canActOnGate(gate: string): boolean {
    const gates = this.assignedGates();
    return gates.length === 0 || gates.includes(gate.trim());
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  private saveSession(user: SessionUser): void {
    try { localStorage.setItem(USER_KEY, user.empCode); } catch {}
    this.session.set(user);
    this.sessionReady.set(true);
  }

  private clearSession(): void {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('vpsm_session');
    this.session.set(null);
    this.sessionReady.set(false);
  }
}