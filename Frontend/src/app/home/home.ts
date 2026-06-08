import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { forkJoin, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './home.css',
  template: `

    <div class="page-header">
      <span class="page-title">HOME</span>
      <span class="page-sub">*CONNECTED REAL-TIME OPERATIONAL DATA LAYER</span>
    </div>

    <div *ngIf="isGlobalLoading" class="home-state-row" style="padding: 15px; text-align: center; color: #4361ee; font-weight: 600;">
      <i class="bi bi-arrow-repeat spin-icon"></i> Syncing dashboard metrics with system APIs...
    </div>
    <div *ngIf="hasGlobalError" class="home-state-row error-txt" style="padding: 15px; text-align: center; color: #dc2626; font-weight: 600;">
      <i class="bi bi-exclamation-triangle-fill"></i> Warning: Some background operational modules failed to respond. Check backend server logs.
    </div>

    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-title">ACTIVE PASSES 🪪</div>
        <div class="stat-pending">(PENDING FOR RENEWAL) <strong>{{ pendingPassesRenewal }}</strong></div>
        <div class="stat-num">{{ activePassesCount }}</div>
        <a class="check-link" href="/passes">CHECK DETAILS »</a>
      </div>
      <div class="stat-card">
        <div class="stat-title">EXPIRING PASSES ⚠</div>
        <div class="stat-pending">(PENDING FOR ACTION) <strong>{{ expiringPassesCount }}</strong></div>
        <div class="stat-num">{{ expiringPassesCount }}</div>
        <a class="check-link" href="/passes">CHECK DETAILS »</a>
      </div>
      <div class="stat-card">
        <div class="stat-title">DOCUMENTS DUE 📄</div>
        <div class="stat-pending">(PENDING FOR ACTION) <strong>{{ expiringDocsCount }}</strong></div>
        <div class="stat-num">{{ expiringDocsCount }}</div>
        <a class="check-link" href="/documents">CHECK DETAILS »</a>
      </div>
      <div class="stat-card open-card">
        <div class="stat-title">GATE ENTRIES TODAY 🚗</div>
        <div class="stat-pending">(COUNT / MOVEMENTS)</div>
        <div class="stat-num-big">{{ totalHistoryMovements }}<span>/{{ activePassesCount }}</span></div>
        <a class="check-link" href="/history">CHECK DETAILS »</a>
      </div>
    </div>

    <div class="tables-row">
      <div class="tables-left">

        <div class="section">
          <div class="section-hdr">
            <i class="bi bi-truck-front-fill hdr-icon"></i> Vehicles Master
            <span class="live-badge">● LIVE</span>
          </div>
          <div class="table-scroll">
            <table class="dtable" *ngIf="!isGlobalLoading">
              <thead>
                <tr><th>#</th><th>VEHICLE NO</th><th>TYPE</th><th>CLASS</th><th>BRAND/MODEL</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let v of vehicles; let i = index">
                  <td>{{ i + 1 }}</td>
                  <td><strong>{{ v.vehicleNo }}</strong></td>
                  <td>{{ v.vehicleType }}</td>
                  <td>{{ v.vehicleClass }}</td>
                  <td>{{ v.brandModel || '—' }}</td>
                  <td>
                    <span [class]="v.isActive === 'Y' ? 'badge green' : 'badge red'">
                      {{ v.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE' }}
                    </span>
                  </td>
                </tr>
                <tr *ngIf="vehicles.length === 0">
                  <td colspan="6" style="text-align:center; color:#9ca3af;">No records found inside Vehicles Master</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="section">
          <div class="section-hdr">
            <i class="bi bi-person-vcard-fill hdr-icon"></i> Pass Registry
            <span class="live-badge">● LIVE</span>
          </div>
          <div class="table-scroll">
            <table class="dtable" *ngIf="!isGlobalLoading">
              <thead>
                <tr><th>PASS ID</th><th>VEHICLE NO</th><th>ISSUE DATE</th><th>VALIDITY DATE</th><th>DEPARTMENT</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let p of passes | slice:0:10">
                  <td>PSS-{{ p.passId }}</td>
                  <td><strong>{{ p.typeOfVehicle || '—' }}</strong></td>
                  <td>{{ formatDate(p.issueDate) }}</td>
                  <td>{{ formatDate(p.validityDate) }}</td>
                  <td>{{ p.dept || '—' }}</td>
                  <td>
                    <span [class]="p.isActive === 'Y' ? 'badge green' : 'badge red'">
                      {{ p.status || (p.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE') }}
                    </span>
                  </td>
                </tr>
                <tr *ngIf="passes.length === 0">
                  <td colspan="6" style="text-align:center; color:#9ca3af;">No records found inside Pass Registry</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="section">
          <div class="section-hdr">
            <i class="bi bi-file-earmark-text-fill hdr-icon"></i> Documents (Compliance)
            <span class="live-badge">● LIVE</span>
          </div>
          <div class="table-scroll">
            <table class="dtable" *ngIf="!isGlobalLoading">
              <thead>
                <tr><th>DOC ID</th><th>DOCUMENT NO</th><th>DOCUMENT TYPE</th><th>START DATE</th><th>EXPIRY DATE</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let d of documents | slice:0:10">
                  <td>DOC-{{ d.documentId }}</td>
                  <td><strong>{{ d.documentNo || '—' }}</strong></td>
                  <td>{{ d.documentType }}</td>
                  <td>{{ formatDate(d.startDate) }}</td>
                  <td>{{ formatDate(d.expiryDate) }}</td>
                  <td>
                    <span [class]="d.documentStatus === 'Valid' || d.documentStatus === 'ACTIVE' ? 'badge green' : 'badge red'">
                      {{ d.documentStatus || 'Valid' }}
                    </span>
                  </td>
                </tr>
                <tr *ngIf="documents.length === 0">
                  <td colspan="6" style="text-align:center; color:#9ca3af;">No compliance documents registered</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="section">
          <div class="section-hdr">
            <i class="bi bi-clock-history hdr-icon"></i> History (Audit Trail)
            <span class="live-badge">● LIVE</span>
          </div>
          <div class="table-scroll">
            <table class="dtable" *ngIf="!isGlobalLoading">
              <thead>
                <tr><th>PASS NO</th><th>EMP CODE</th><th>ACTION</th><th>ACTION DATE</th><th>REMARKS</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let h of historyLogs | slice:0:10">
                  <td>{{ h.passNo }}</td>
                  <td>{{ h.empCode }}</td>
                  <td>
                    <span [class]="getHistoryActionClass(h.action)">{{ h.action }}</span>
                  </td>
                  <td>{{ formatDate(h.dateOfEntry) }}</td>
                  <td>{{ h.remark || '—' }}</td>
                </tr>
                <tr *ngIf="historyLogs.length === 0">
                  <td colspan="5" style="text-align:center; color:#9ca3af;">No recent history audit traces logged</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="section">
          <div class="section-hdr">
            <i class="bi bi-lock-fill hdr-icon"></i> Authority (Approval Config)
            <span class="live-badge">● LIVE</span>
          </div>
          <div class="table-scroll">
            <table class="dtable" *ngIf="!isGlobalLoading">
              <thead>
                <tr><th>COMPANY</th><th>DEPARTMENT</th><th>EMP CODE</th><th>AUTHORITY TYPE</th><th>VALID FROM</th><th>VALID TILL</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let a of authorityRules">
                  <td>{{ a.companyCode }}</td>
                  <td>{{ a.departmentCode }}</td>
                  <td>{{ a.empCode }}</td>
                  <td><span class="badge green">{{ a.authorityType }}</span></td>
                  <td>{{ formatDate(a.validFrom) }}</td>
                  <td>{{ formatDate(a.validTill) }}</td>
                </tr>
                <tr *ngIf="authorityRules.length === 0">
                  <td colspan="6" style="text-align:center; color:#9ca3af;">No active approval rule authorizations configured</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <div class="vt-panel">
        <div class="vt-header">
          <span class="vt-dot"></span>
          <span class="vt-header-txt">LIVE VEHICLE MATRIX</span>
          <span class="vt-dot pulse-dot"></span>
        </div>
        <div class="vt-tank-outer">
          <div class="vt-ruler">
            <span>100</span><span>80</span><span>60</span>
            <span>40</span><span>20</span><span>0</span>
          </div>
          <div class="vt-tank">
            <div class="vt-tick vt-t80"></div>
            <div class="vt-tick vt-t60"></div>
            <div class="vt-tick vt-t40"></div>
            <div class="vt-tick vt-t20"></div>
            
            <div class="vt-liquid" [style.height.%]="tankPercentage">
              <div class="vt-ww vt-ww1">
                <svg viewBox="0 0 600 60" preserveAspectRatio="none">
                  <path d="M0,30 C75,5 150,55 225,30 C300,5 375,55 450,30 C525,5 600,55 675,30 L675,60 L0,60 Z"/>
                </svg>
              </div>
              <div class="vt-ww vt-ww2">
                <svg viewBox="0 0 600 60" preserveAspectRatio="none">
                  <path d="M0,35 C60,8 140,58 220,35 C300,8 380,58 460,35 C540,8 620,58 700,35 L700,60 L0,60 Z"/>
                </svg>
              </div>
              <div class="vt-ww vt-ww3">
                <svg viewBox="0 0 600 60" preserveAspectRatio="none">
                  <path d="M0,28 C90,3 170,53 250,28 C330,3 410,53 490,28 C570,3 650,53 730,28 L730,60 L0,60 Z"/>
                </svg>
              </div>
              <i class="vt-b vb1"></i><i class="vt-b vb2"></i>
              <i class="vt-b vb3"></i><i class="vt-b vb4"></i>
              <i class="vt-b vb5"></i>
              <div class="vt-glare"></div>
              
              <div class="vt-pct-text">{{ tankPercentage }}%</div>
            </div>
            <div class="vt-level-line" [style.bottom.%]="tankPercentage"></div>
          </div>
          <div class="vt-cap">
            <div class="vt-cap-top"></div>
            <div class="vt-cap-fill" [style.height.%]="tankPercentage"></div>
          </div>
        </div>
        <div class="vt-data-strip">
          <div class="vt-ds-block">
            <div class="vt-ds-num green-num">{{ activeCount }}</div>
            <div class="vt-ds-lbl">ACTIVE</div>
          </div>
          <div class="vt-ds-sep"></div>
          <div class="vt-ds-block">
            <div class="vt-ds-num">{{ vehicles.length }}</div>
            <div class="vt-ds-lbl">TOTAL</div>
          </div>
          <div class="vt-ds-sep"></div>
          <div class="vt-ds-block">
            <div class="vt-ds-num red-num">{{ inactiveCount }}</div>
            <div class="vt-ds-lbl">INACTIVE</div>
          </div>
        </div>
        <div class="vt-table-count">
          <div class="vtc-row">
            <i class="bi bi-truck-front-fill vtc-icon"></i>
            <span class="vtc-name">Vehicles Master</span>
            <span class="vtc-val">{{ vehicles.length }}</span>
          </div>
          <div class="vtc-row">
            <i class="bi bi-person-vcard-fill vtc-icon"></i>
            <span class="vtc-name">Pass Registry</span>
            <span class="vtc-val">{{ passes.length }}</span>
          </div>
          <div class="vtc-row">
            <i class="bi bi-file-earmark-text-fill vtc-icon"></i>
            <span class="vtc-name">Documents</span>
            <span class="vtc-val">{{ documents.length }}</span>
          </div>
          <div class="vtc-row">
            <i class="bi bi-clock-history vtc-icon"></i>
            <span class="vtc-name">History Traces</span>
            <span class="vtc-val">{{ historyLogs.length }}</span>
          </div>
          <div class="vtc-row">
            <i class="bi bi-lock-fill vtc-icon"></i>
            <span class="vtc-name">Authorizations</span>
            <span class="vtc-val">{{ authorityRules.length }}</span>
          </div>
        </div>
        <div class="vt-bar-wrap">
          <div class="vt-bar-fill" [style.width.%]="tankPercentage"></div>
        </div>
        <div class="vt-bar-caption">{{ activeCount }} / {{ vehicles.length }} VEHICLES ACTIVE</div>
      </div>

    </div>
  `,
})
export class Home implements OnInit {

  // Real Database Collections Array Data Maps
  vehicles: any[]       = [];
  passes: any[]         = [];
  documents: any[]      = [];
  historyLogs: any[]    = [];
  authorityRules: any[] = [];

  // Loading Framework Layout Flags
  isGlobalLoading       = true;
  hasGlobalError        = false;

  // Analytical Calculated Properties State Counters
  activePassesCount     = 0;
  expiringPassesCount   = 0;
  pendingPassesRenewal  = 0;
  expiringDocsCount     = 0;
  totalHistoryMovements = 0;
  tankPercentage        = 0;

  private readonly HEADERS = new HttpHeaders({
    'X-API-KEY'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.isGlobalLoading = true;
    this.hasGlobalError = false;

    // Execute safe forkJoin parallel streaming requests to all running partner backend APIs
    forkJoin({
      vehicles: this.http.get<any[]>(API_CONFIG.VEHICLES, { headers: this.HEADERS }).pipe(catchError(() => of([]))),
      passes: this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS }).pipe(catchError(() => of([]))),
      documents: this.http.get<any[]>(API_CONFIG.DOCUMENTS, { headers: this.HEADERS }).pipe(catchError(() => of([]))),
      history: this.http.get<any[]>(API_CONFIG.HISTORY || '/api/history', { headers: this.HEADERS }).pipe(catchError(() => of([]))),
      authority: this.http.get<any[]>(API_CONFIG.AUTHORITY || '/api/authority', { headers: this.HEADERS }).pipe(catchError(() => of([])))
    }).subscribe({
      next: (result) => {
        this.vehicles = result.vehicles;
        this.passes = result.passes;
        this.documents = result.documents;
        this.historyLogs = result.history;
        this.authorityRules = result.authority;

        // Perform live calculations based on the collected dataset properties
        this.calculateDashboardMetrics();
        this.isGlobalLoading = false;
      },
      error: () => {
        this.hasGlobalError = true;
        this.isGlobalLoading = false;
      }
    });
  }

  private calculateDashboardMetrics() {
    // 1. Calculations for passes module components
    this.activePassesCount = this.passes.filter(p => p.isActive === 'Y').length;
    this.pendingPassesRenewal = this.passes.filter(p => p.isActive === 'Y' && p.status === 'Expiring').length;
    this.expiringPassesCount = this.passes.filter(p => p.status === 'Expiring' || p.status === 'Review').length;

    // 2. Calculations for document deadlines
    this.expiringDocsCount = this.documents.filter(d => {
      if (!d.expiryDate) return false;
      const daysLeft = Math.ceil((new Date(d.expiryDate).getTime() - new Date().getTime()) / 86400000);
      return daysLeft >= 0 && daysLeft <= 30; // Count items expiring within next 30 days
    }).length;

    // 3. Gate log history actions tracking counter
    this.totalHistoryMovements = this.historyLogs.length;

    // 4. Calculate critical matching vertical tank container fluid capacity percentage
    if (this.vehicles.length > 0) {
      const activeVehicles = this.vehicles.filter(v => v.isActive === 'Y').length;
      this.tankPercentage = Math.round((activeVehicles / this.vehicles.length) * 100);
    } else {
      this.tankPercentage = 0;
    }
  }

  // Getters supporting template summary cards tracking metrics state
  get activeCount(): number   { return this.vehicles.filter(v => v.isActive === 'Y').length; }
  get inactiveCount(): number { return this.vehicles.filter(v => v.isActive !== 'Y').length; }

  // Component Utility string helper functions
  formatDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getHistoryActionClass(action: string): string {
    switch ((action || '').toUpperCase()) {
      case 'CREATE': return 'act-tag blue';
      case 'APPROVE': return 'act-tag orange';
      case 'SURRENDER': return 'act-tag red';
      default: return 'act-tag blue';
    }
  }
}