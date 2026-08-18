import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, catchError, of, takeUntil, timeout, interval } from 'rxjs';
import { API_CONFIG } from '../core/api.config';
import { AuthService } from '../core/auth.service';

const HTTP_TIMEOUT_MS = 12_000;
const REFRESH_INTERVAL_MS = 30_000;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home implements OnInit, OnDestroy {

  private readonly destroy$ = new Subject<void>();
  // Confirmer routing values.
  // Must match the same working logic used by Contractor Confirmer Queue.
  private readonly IT_DEPARTMENT_CODE = '163';
  private readonly HRM_DEPARTMENT_CODE = '180';

  private readonly IT_CONFIRMER_EMP_CODE = '636';
  private readonly HRM_CONFIRMER_EMP_CODE = '1832';
  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });

  private allPasses = signal<any[]>([]);

  isLoading = signal(true);
  hasError = signal(false);

  constructor(
    private http: HttpClient,
    public auth: AuthService,
    private router: Router
  ) { }

  private getStatus(p: any): string {
    return String(
      p?.reqStatus ||
      p?.requestStatus ||
      p?.status ||
      p?.request?.reqStatus ||
      p?.request?.requestStatus ||
      ''
    ).toUpperCase().trim();
  }
  private getDepartmentCode(pass: any): string {
    return String(
      pass?.deptCode ??
      pass?.departmentCode ??
      pass?.request?.deptCode ??
      pass?.request?.departmentCode ??
      ''
    ).trim();
  }
  readonly showKpis = computed(() => this.auth.isUploader());

  readonly approvedPasses = computed(() =>
    this.allPasses().filter(p => this.getStatus(p) === 'APPROVED').length
  );

  readonly submittedPasses = computed(() =>
    this.allPasses().filter(p =>
      ['CREATED', 'SUBMITTED', 'SAVED'].includes(this.getStatus(p))
    ).length
  );

  readonly confirmedPasses = computed(() =>
    this.allPasses().filter(p => this.getStatus(p) === 'CONFIRMED').length
  );

  readonly pendingConfirmerCount = computed(() => {
    const loggedInEmpCode = String(this.auth.empCode() || '').trim();

    return this.allPasses().filter(pass => {
      const status = this.getStatus(pass);

      // Only count requests that are waiting for confirmation.
      if (!['CREATED', 'SUBMITTED', 'SAVED'].includes(status)) {
        return false;
      }

      const departmentCode = this.getDepartmentCode(pass);

      // IT forms belong only to confirmer 636.
      if (departmentCode === this.IT_DEPARTMENT_CODE) {
        return loggedInEmpCode === this.IT_CONFIRMER_EMP_CODE;
      }

      // HRM forms belong only to confirmer 1832.
      if (departmentCode === this.HRM_DEPARTMENT_CODE) {
        return loggedInEmpCode === this.HRM_CONFIRMER_EMP_CODE;
      }

      // Preserve the existing/default behavior:
      // other non-IT departments remain with employee 1832.
      return loggedInEmpCode === this.HRM_CONFIRMER_EMP_CODE;
    }).length;
  });

  // Approver queue displays requests after verifier action.
  // contractor-approver.ts filters reqStatus === 'VERIFIED'.
  readonly pendingApproverCount = computed(() =>
    this.allPasses().filter(p => this.getStatus(p) === 'VERIFIED').length
  );
  // Verifier queue displays requests after confirmation.
  // contractor-verifier.ts filters reqStatus === 'CONFIRMED'.
  readonly pendingVerifierCount = computed(() =>
    this.allPasses().filter(p => this.getStatus(p) === 'CONFIRMED').length
  );

  readonly totalPasses = computed(() =>
    this.submittedPasses() + this.confirmedPasses() + this.approvedPasses()
  );

  readonly showConfirmerNotification = computed(() =>
    this.auth.isConfirmer() && this.pendingConfirmerCount() > 0
  );

  readonly showApproverNotification = computed(() =>
    this.auth.isApprover() && this.pendingApproverCount() > 0
  );
  // Visible only when the logged-in user has Verifier role,
  // for example employee code 70028.
  readonly showVerifierNotification = computed(() =>
    this.auth.isVerifier() && this.pendingVerifierCount() > 0
  );

  ngOnInit(): void {
    this.fetchPasses();
    interval(REFRESH_INTERVAL_MS)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.fetchPasses(false));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private fetchPasses(showLoading = true): void {
    if (showLoading) this.isLoading.set(true);
    this.hasError.set(false);

    this.http.get<any[]>(API_CONFIG.CVPS_GET_ALL_REQUESTS, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(() => {
          this.hasError.set(true);
          this.isLoading.set(false);
          return of([]);
        })
      )
      .subscribe((data: any) => {
        this.allPasses.set(Array.isArray(data) ? data : []);
        this.isLoading.set(false);
      });
  }

  goToConfirmerPage(): void {
    this.router.navigate(['/vehicle-permission/confirmer']);
  }

  goToApproverPage(): void {
    this.router.navigate(['/vehicle-permission/approver']);
  }
  goToVerifierPage(): void {
    this.router.navigate(['/vehicle-permission/verifier']);
  }

  openPassEntry(): void {
    window.open('/vehicle-permission/form', '_blank');
  }
}