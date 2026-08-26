import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  Subject,
  catchError,
  interval,
  of,
  takeUntil,
  timeout
} from 'rxjs';
import { API_CONFIG } from '../core/api.config';
import { AuthService } from '../core/auth.service';

const HTTP_TIMEOUT_MS = 12_000;
const KPI_REFRESH_INTERVAL_MS = 30_000;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  styleUrl: './home.css',
  template: `

    <div class="page-header">
      <div class="ph-left">
      </div>
    </div>

    <div class="home-content">
    @if (isApprover() && pendingApprovals() > 0) {
  <button
    type="button"
    class="approver-notification"
    (click)="goToApproverQueue()"
    [attr.aria-label]="pendingApprovals() + ' request(s) pending for approval'">

    <span class="approver-notification-message">
      <i class="bi bi-bell-fill"></i>
      Approver Alert: You have {{ pendingApprovals() }}
      request(s) pending for approval.
    </span>

    <span class="approver-notification-arrow">
      <i class="bi bi-arrow-right"></i>
    </span>
  </button>
}

      <div *ngIf="isLoading()" class="home-state-row info-txt">
        <i class="bi bi-arrow-repeat spin-icon"></i>
        &nbsp; Syncing live pass data from server...
      </div>

      <div *ngIf="hasError() && !isLoading()" class="home-state-row error-txt">
        <i class="bi bi-exclamation-triangle-fill"></i>
        &nbsp; Could not reach server. Counts unavailable.
      </div>

      <div class="kpi-row">

        <!-- TOTAL PASSES -->
        <div class="kpi-card kpi-total">
          <div class="kpi-top">
            <span class="kpi-label">TOTAL PASSES</span>
            <span class="kpi-icon-bg kpi-bg-total">
              <i class="bi bi-card-list"></i>
            </span>
          </div>

          <div class="kpi-value">{{ totalPasses() }}</div>

          <div class="kpi-footer">
            <span class="kpi-sub">Submitted + Confirmed + Approved</span>
          </div>
        </div>

        <!-- APPROVED / ACTIVE -->
        <div class="kpi-card kpi-approved">
          <div class="kpi-top">
            <span class="kpi-label">APPROVED</span>
            <span class="kpi-icon-bg kpi-bg-approved">
              <i class="bi bi-patch-check-fill"></i>
            </span>
          </div>

          <div class="kpi-value">{{ approvedPasses() }}</div>

          <div class="kpi-footer">
            <span class="kpi-sub">Fully approved &amp; active passes</span>
          </div>
        </div>

        <!-- SUBMITTED -->
        <div class="kpi-card kpi-submitted">
          <div class="kpi-top">
            <span class="kpi-label">SUBMITTED</span>
            <span class="kpi-icon-bg kpi-bg-submitted">
              <i class="bi bi-send-fill"></i>
            </span>
          </div>

          <div class="kpi-value">{{ submittedPasses() }}</div>

          <div class="kpi-footer">
            <span class="kpi-sub">All submitted pass requests</span>
          </div>
        </div>

        <!-- APPROVER-ONLY NOTIFICATION -->
        

      </div>

    </div>
  `
})
export class Home implements OnInit, OnDestroy {

  private readonly destroy$ = new Subject<void>();

  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });

  private allPasses = signal<any[]>([]);

  isLoading = signal(true);
  hasError = signal(false);

  constructor(
    private http: HttpClient,
    private router: Router,
    private auth: AuthService
  ) { }

  /**
   * Supports both current backend response field names:
   * - reqStatus
   * - status
   */
  private getPassStatus(pass: any): string {
    return String(
      pass?.reqStatus ??
      pass?.status ??
      ''
    )
      .trim()
      .toUpperCase();
  }

  /**
   * Displays the Approver notification card only for APPROVER or ADMIN.
   * AuthService already treats ADMIN as an Approver.
   */
  isApprover(): boolean {
    return this.auth.isApprover();
  }

  /**
   * ACTIVE is the final approved state.
   */
  readonly approvedPasses = computed(() =>
    this.allPasses().filter(pass =>
      this.getPassStatus(pass) === 'ACTIVE'
    ).length
  );

  readonly submittedPasses = computed(() =>
    this.allPasses().filter(pass =>
      this.getPassStatus(pass) === 'SUBMITTED'
    ).length
  );

  readonly confirmedPasses = computed(() =>
    this.allPasses().filter(pass =>
      this.getPassStatus(pass) === 'CONFIRMED'
    ).length
  );

  /**
   * Must match Approval.pendingList exactly.
   *
   * The existing Approver Queue displays both:
   * - SUBMITTED
   * - CONFIRMED
   */
  readonly pendingApprovals = computed(() =>
    this.allPasses().filter(pass => {
      const status = this.getPassStatus(pass);

      return status === 'SUBMITTED' || status === 'CONFIRMED';
    }).length
  );

  /**
   * Existing KPI rule retained:
   * Total = Submitted + Confirmed + Active/Approved.
   */
  readonly totalPasses = computed(() =>
    this.submittedPasses() +
    this.confirmedPasses() +
    this.approvedPasses()
  );

  ngOnInit(): void {
    // Load immediately on dashboard opening.
    this.fetchPasses();

    // Refresh KPI values and Approver notification count every 30 seconds.
    interval(KPI_REFRESH_INTERVAL_MS)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.fetchPasses());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private fetchPasses(): void {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.http.get<any[]>(
      API_CONFIG.PASS_LIST,
      { headers: this.HEADERS }
    )
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(() => {
          this.hasError.set(true);
          this.isLoading.set(false);
          return of([]);
        })
      )
      .subscribe(data => {
        this.allPasses.set(data ?? []);
        this.isLoading.set(false);
      });
  }

  /**
   * Existing Approver Queue route from app.routes.ts.
   */
  goToApproverQueue(): void {
    this.router.navigate(['/authority/approval']);
  }

  openPassEntry(): void {
    window.open('/pass-entry', '_blank');
  }
}