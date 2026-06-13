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
  styleUrl   : './home.css',           //<span class="page-title">HOME</span><span class="page-sub">*CONNECTED REAL-TIME OPERATIONAL DATA LAYER</span> in template area
  template   : `                          

    <div class="page-header">
      <div class="ph-left">
      </div>
      <button class="btn-add-pass" (click)="openPassEntry()">
        <i class="bi bi-plus-circle-fill"></i> ADD PASS
      </button>
    </div>

    <div class="home-content">


      <div *ngIf="hasError && !isLoading" class="home-state-row error-txt">
        <i class="bi bi-exclamation-triangle-fill"></i>&nbsp; Some modules failed to respond. Showing cached data.
      </div>

      <!-- KPI CARDS -->
      <div class="kpi-row">

        <div class="kpi-card kpi-total" (click)="goTo('/pass-details')">
          <div class="kpi-top">
            <span class="kpi-label">TOTAL PASSES</span>
            <span class="kpi-icon-bg kpi-bg-total">
              <i class="bi bi-card-list"></i>
            </span>
          </div>
          <div class="kpi-value">{{ totalPasses() }}</div>
          <div class="kpi-footer">
            <span class="kpi-sub">All submitted requests</span>
            <span class="kpi-link">View Details <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>

        <div class="kpi-card kpi-approved" (click)="goTo('/pass-details')">
          <div class="kpi-top">
            <span class="kpi-label">APPROVED</span>
            <span class="kpi-icon-bg kpi-bg-approved">
              <i class="bi bi-patch-check-fill"></i>
            </span>
          </div>
          <div class="kpi-value">{{ approvedPasses() }}</div>
          <div class="kpi-footer">
            <span class="kpi-sub">Fully approved &amp; active</span>
            <span class="kpi-link">View Details <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>

        <div class="kpi-card kpi-submitted" (click)="goTo('/pass-details')">
          <div class="kpi-top">
            <span class="kpi-label">SUBMITTED</span>
            <span class="kpi-icon-bg kpi-bg-submitted">
              <i class="bi bi-send-fill"></i>
            </span>
          </div>
          <div class="kpi-value">{{ submittedPasses() }}</div>
          <div class="kpi-footer">
            <span class="kpi-sub">Awaiting confirmer review</span>
            <span class="kpi-link">View Details <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>

        <div class="kpi-card kpi-confirmed" (click)="goTo('/pass-details')">
          <div class="kpi-top">
            <span class="kpi-label">CONFIRMED</span>
            <span class="kpi-icon-bg kpi-bg-confirmed">
              <i class="bi bi-hourglass-split"></i>
            </span>
          </div>
          <div class="kpi-value">{{ confirmedPasses() }}</div>
          <div class="kpi-footer">
            <span class="kpi-sub">Awaiting final approval</span>
            <span class="kpi-link">View Details <i class="bi bi-arrow-right"></i></span>
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

  // Live KPI signals — directly from PassStateService (same source as Pass Details)
  readonly totalPasses = computed(() =>
    this.passState.passes().filter(p => p.status === 'Submitted').length
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
  readonly rejectedPasses = computed(() =>
    this.passState.passes().filter(p =>
      p.workflowStatus === 'Confirmation_Rejected' ||
      p.workflowStatus === 'Approval_Rejected'
    ).length
  );

  private readonly HEADERS = new HttpHeaders({
    'X-API-KEY'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });

  private sub?: Subscription;
  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    // Trigger PassStateService to load passes into the signal
    this.isLoading = true;
    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(catchError(() => of([])))
      .subscribe(() => { this.isLoading = false; });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  openPassEntry(): void { window.open('/pass-entry', '_blank'); }
  goTo(path: string): void { this.router.navigate([path]); }
}