import { Component, OnInit, OnDestroy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, of, Subscription } from 'rxjs';
import { API_CONFIG } from '../core/api.config';
import { PassStateService } from '../services/pass-state.service';

@Component({
  selector   : 'app-home',
  standalone : true,
  imports    : [CommonModule],
  styleUrl   : './home.css',
  template   : `

    <div class="page-header">
      <div class="ph-left">
        <span class="page-title">HOME</span>
        <span class="page-sub">*CONNECTED REAL-TIME OPERATIONAL DATA LAYER</span>
      </div>
      <button class="btn-add-pass" (click)="openPassEntry()">
        <i class="bi bi-plus-circle-fill"></i> ADD PASS
      </button>
    </div>

    <div class="home-content">

      <div *ngIf="isLoading" class="home-state-row info-txt">
        <i class="bi bi-arrow-repeat spin-icon"></i>&nbsp; Syncing live pass data from server...
      </div>
      <div *ngIf="hasError && !isLoading" class="home-state-row error-txt">
        <i class="bi bi-exclamation-triangle-fill"></i>&nbsp; Could not reach server. Counts may reflect local data only.
      </div>

      <!-- KPI CARDS -->
      <div class="kpi-row">

        <!-- TOTAL PASSES → submitted tab, filter ALL -->
        <div class="kpi-card kpi-total" (click)="goToFilter('ALL')">
          <div class="kpi-top">
            <span class="kpi-label">TOTAL PASSES</span>
            <span class="kpi-icon-bg kpi-bg-total">
              <i class="bi bi-card-list"></i>
            </span>
          </div>
          <div class="kpi-value">{{ totalPasses() }}</div>
          <div class="kpi-footer">
            <span class="kpi-sub">All submitted pass requests</span>
            <span class="kpi-link">View All <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>

        <!-- APPROVED → submitted tab, filter Approved -->
        <div class="kpi-card kpi-approved" (click)="goToFilter('Approved')">
          <div class="kpi-top">
            <span class="kpi-label">APPROVED</span>
            <span class="kpi-icon-bg kpi-bg-approved">
              <i class="bi bi-patch-check-fill"></i>
            </span>
          </div>
          <div class="kpi-value">{{ approvedPasses() }}</div>
          <div class="kpi-footer">
            <span class="kpi-sub">Fully approved &amp; active passes</span>
            <span class="kpi-link">View Approved <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>

        <!-- SUBMITTED → submitted tab, filter Submitted (Pending Confirmation) -->
        <div class="kpi-card kpi-submitted" (click)="goToFilter('Submitted')">
          <div class="kpi-top">
            <span class="kpi-label">SUBMITTED</span>
            <span class="kpi-icon-bg kpi-bg-submitted">
              <i class="bi bi-send-fill"></i>
            </span>
          </div>
          <div class="kpi-value">{{ submittedPasses() }}</div>
          <div class="kpi-footer">
            <span class="kpi-sub">Pending confirmation by confirmer</span>
            <span class="kpi-link">View Pending <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>

        <!-- CONFIRMED → submitted tab, filter Confirmed (Pending Approval) -->
        <div class="kpi-card kpi-confirmed" (click)="goToFilter('Confirmed')">
          <div class="kpi-top">
            <span class="kpi-label">CONFIRMED</span>
            <span class="kpi-icon-bg kpi-bg-confirmed">
              <i class="bi bi-hourglass-split"></i>
            </span>
          </div>
          <div class="kpi-value">{{ confirmedPasses() }}</div>
          <div class="kpi-footer">
            <span class="kpi-sub">Confirmed — awaiting final approval</span>
            <span class="kpi-link">View Confirmed <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>

      </div>

    </div>
  `,
})
export class Home implements OnInit, OnDestroy {

  private passState = inject(PassStateService);
  private router    = inject(Router);

  isLoading = true;
  hasError  = false;

  // ── KPI counts — live from service signal (populated via API sync in ngOnInit)
  readonly totalPasses = computed(() =>
    this.passState.submittedPasses().length
  );
  readonly approvedPasses = computed(() =>
    this.passState.passes().filter(p => p.workflowStatus === 'Approved').length
  );
  readonly submittedPasses = computed(() =>
    this.passState.passes().filter(p => p.workflowStatus === 'Submitted').length
  );
  readonly confirmedPasses = computed(() =>
    this.passState.passes().filter(p => p.workflowStatus === 'Confirmed').length
  );

  private readonly HEADERS = new HttpHeaders({
    'X-API-KEY'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });

  private sub?: Subscription;
  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.isLoading = true;
    this.hasError  = false;

    // Pull fresh pass data from API into the shared signal
    // This makes KPI numbers real API data — not just localStorage
    this.passState.syncFromApi();

    // Show loading spinner briefly then clear
    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(catchError(() => { this.hasError = true; return of([]); }))
      .subscribe(() => { this.isLoading = false; });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  /**
   * Navigate to pass-details with pre-selected tab + status filter.
   * Pass Details reads these query params in ngOnInit and sets its signals.
   */
  goToFilter(status: string): void {
    this.router.navigate(['/pass-details'], {
      queryParams: { tab: 'submitted', filter: status }
    });
  }

  openPassEntry(): void { window.open('/pass-entry', '_blank'); }
}