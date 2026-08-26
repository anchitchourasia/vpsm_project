import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
// import { Router } from '@angular/router';
import { Subject, catchError, of, takeUntil, timeout } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

const HTTP_TIMEOUT_MS = 12_000;

@Component({
  selector  : 'app-home',
  standalone: true,
  imports   : [CommonModule],
  styleUrl  : './home.css',
  template  : `

    <div class="page-header">
      <div class="ph-left">
        
      </div>

    </div>

    <div class="home-content">

      <div *ngIf="isLoading()" class="home-state-row info-txt">
        <i class="bi bi-arrow-repeat spin-icon"></i>&nbsp; Syncing live pass data from server...
      </div>
      <div *ngIf="hasError() && !isLoading()" class="home-state-row error-txt">
        <i class="bi bi-exclamation-triangle-fill"></i>&nbsp; Could not reach server. Counts unavailable.
      </div>

      <div class="kpi-row">

        <!-- TOTAL PASSES -->
        <!-- REDIRECT (future): (click)="goToPassRegistry()" → /passes/active -->
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
            <!-- <span class="kpi-link">Pass Registry <i class="bi bi-arrow-right"></i></span> -->
          </div>
        </div>

        <!-- APPROVED -->
        <!-- REDIRECT (future): (click)="goToPassDetails('Approved')" → /pass-details?tab=submitted&filter=Approved -->
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
            <!-- <span class="kpi-link">Pass Details <i class="bi bi-arrow-right"></i></span> -->
          </div>
        </div>

        <!-- SUBMITTED -->
        <!-- REDIRECT (future): (click)="goToPassDetails('ALL')" → /pass-details?tab=submitted&filter=ALL -->
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
            <!-- <span class="kpi-link">Pass Details <i class="bi bi-arrow-right"></i></span> -->
          </div>
        </div>

        <!-- CONFIRMED -->
        <!-- REDIRECT (future): (click)="goToPassDetails('Confirmed')" → /pass-details?tab=submitted&filter=Confirmed -->
        <div class="kpi-card kpi-confirmed">
          <div class="kpi-top">
            <span class="kpi-label">CONFIRMED</span>
            <span class="kpi-icon-bg kpi-bg-confirmed">
              <i class="bi bi-hourglass-split"></i>
            </span>
          </div>
          <div class="kpi-value">{{ confirmedPasses() }}</div>
          <div class="kpi-footer">
            <span class="kpi-sub">Confirmed — awaiting final approval</span>
            <!-- <span class="kpi-link">Pass Details <i class="bi bi-arrow-right"></i></span> -->
          </div>
        </div>

      </div>

    </div>
  `,
})
export class Home implements OnInit, OnDestroy {

  private readonly destroy$ = new Subject<void>();
  private readonly HEADERS  = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });

  private allPasses = signal<any[]>([]);

  isLoading = signal(true);
  hasError  = signal(false);

  readonly approvedPasses = computed(() =>
    this.allPasses().filter(p =>
      (p.status || '').toLowerCase() === 'active'
    ).length
  );

  readonly submittedPasses = computed(() =>
    this.allPasses().filter(p =>
      (p.status || '').toLowerCase() === 'submitted'
    ).length
  );

  readonly confirmedPasses = computed(() =>
    this.allPasses().filter(p =>
      (p.status || '').toLowerCase() === 'confirmed'
    ).length
  );

  // Sir's logic: Total = Submitted + Confirmed + Approved
  readonly totalPasses = computed(() =>
    this.submittedPasses() + this.confirmedPasses() + this.approvedPasses()
  );

  constructor(private http: HttpClient) {}
  // constructor(private http: HttpClient, private router: Router) {}  // uncomment when redirects are enabled

  ngOnInit(): void {
    this.fetchPasses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private fetchPasses(): void {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.http.get<any[]>(API_CONFIG.PASS_LIST, { headers: this.HEADERS })
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

  // ── REDIRECT METHODS (future use — uncomment constructor router injection above) ──
  // goToPassRegistry(): void {
  //   this.router.navigate(['/passes/active']);
  // }

  // goToPassDetails(filter: string): void {
  //   this.router.navigate(['/pass-details'], {
  //     queryParams: { tab: 'submitted', filter }
  //   });
  // }

  openPassEntry(): void { window.open('/pass-entry', '_blank'); }
}