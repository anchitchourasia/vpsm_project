import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_CONFIG } from '../core/api.config';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './home.css',
  template: `

    <!-- PAGE HEADER -->
    <div class="page-header">
      <span class="page-title">HOME</span>
      <span class="page-sub">*NOT ACTUAL DATA AND LAYOUT</span>
    </div>

    <!-- STAT CARDS -->
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-title">ACTIVE PASSES 🪪</div>
        <div class="stat-pending">(PENDING FOR RENEWAL) <strong>12</strong></div>
        <div class="stat-num">248</div>
        <a class="check-link" href="#">CHECK DETAILS »</a>
      </div>
      <div class="stat-card">
        <div class="stat-title">EXPIRING PASSES ⚠</div>
        <div class="stat-pending">(PENDING FOR ACTION) <strong>36</strong></div>
        <div class="stat-num">36</div>
        <a class="check-link" href="#">CHECK DETAILS »</a>
      </div>
      <div class="stat-card">
        <div class="stat-title">DOCUMENTS DUE 📄</div>
        <div class="stat-pending">(PENDING FOR ACTION) <strong>18</strong></div>
        <div class="stat-num">18</div>
        <a class="check-link" href="#">CHECK DETAILS »</a>
      </div>
      <div class="stat-card open-card">
        <div class="stat-title">GATE ENTRIES TODAY 🚗</div>
        <div class="stat-pending">(COUNT / MOVEMENTS)</div>
        <div class="stat-num-big">84<span>/120</span></div>
        <a class="check-link" href="#">CHECK DETAILS »</a>
      </div>
    </div>

    <!-- TABLES + LIVE PANEL -->
    <div class="tables-row">
      <div class="tables-left">

        <!-- VEHICLES MASTER — LIVE DATA -->
        <div class="section">
          <div class="section-hdr">
            <i class="bi bi-truck-front-fill hdr-icon"></i> Vehicles Master
            <span class="live-badge">● LIVE</span>
          </div>
          <div class="table-scroll">

            <!-- LOADING STATE -->
            <div *ngIf="vehiclesLoading" class="home-state-row">
              <i class="bi bi-arrow-repeat spin-icon"></i> Loading...
            </div>

            <!-- ERROR STATE -->
            <div *ngIf="vehiclesError" class="home-state-row error-txt">
              <i class="bi bi-exclamation-triangle-fill"></i> Failed to load. Check API.
            </div>

            <!-- DATA TABLE -->
            <table class="dtable" *ngIf="!vehiclesLoading && !vehiclesError">
              <thead>
                <tr><th>#</th><th>VEHICLE NO</th><th>TYPE</th><th>CLASS</th><th>BRAND/MODEL</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let v of vehicles; let i = index">
                  <td>{{ i + 1 }}</td>
                  <td>{{ v.vehicleNo }}</td>
                  <td>{{ v.vehicleType }}</td>
                  <td>{{ v.vehicleClass }}</td>
                  <td>{{ v.brandModel }}</td>
                  <td>
                    <span [class]="v.isActive === 'Y' ? 'badge green' : 'badge red'">
                      {{ v.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE' }}
                    </span>
                  </td>
                </tr>
                <tr *ngIf="vehicles.length === 0">
                  <td colspan="6" style="text-align:center; color:#9ca3af;">No records found</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- PASS REGISTRY — DUMMY (API not ready) -->
        <div class="section">
          <div class="section-hdr">
            <i class="bi bi-person-vcard-fill hdr-icon"></i> Pass Registry
            <span class="dummy-badge">● DUMMY</span>
          </div>
          <div class="table-scroll">
            <table class="dtable">
              <thead>
                <tr><th>PASS ID</th><th>VEHICLE NO</th><th>ISSUE DATE</th><th>VALIDITY DATE</th><th>DEPARTMENT</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                <tr><td>PSS-001</td><td>MP09 AB 1234</td><td>01-Jan-2025</td><td>31-Dec-2025</td><td>Operations</td><td><span class="badge green">ACTIVE</span></td></tr>
                <tr><td>PSS-002</td><td>MP04 ZZ 9876</td><td>01-Mar-2025</td><td>15-Jun-2025</td><td>Logistics</td><td><span class="badge yellow">EXPIRING</span></td></tr>
                <tr><td>PSS-003</td><td>MP09 XY 5555</td><td>15-Jan-2025</td><td>01-Jan-2026</td><td>HR</td><td><span class="badge green">ACTIVE</span></td></tr>
                <tr><td>PSS-004</td><td>MP09 GH 3322</td><td>01-Jan-2025</td><td>10-May-2025</td><td>Maintenance</td><td><span class="badge red">EXPIRED</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- DOCUMENTS — DUMMY (API not ready) -->
        <div class="section">
          <div class="section-hdr">
            <i class="bi bi-file-earmark-text-fill hdr-icon"></i> Documents (Compliance)
            <span class="dummy-badge">● DUMMY</span>
          </div>
          <div class="table-scroll">
            <table class="dtable">
              <thead>
                <tr><th>DOC ID</th><th>VEHICLE NO</th><th>DOCUMENT TYPE</th><th>START DATE</th><th>EXPIRY DATE</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                <tr><td>DOC-001</td><td>MP09 AB 1234</td><td>PUC</td><td>01-Jan-2025</td><td>31-Dec-2025</td><td><span class="badge green">VALID</span></td></tr>
                <tr><td>DOC-002</td><td>MP04 ZZ 9876</td><td>Insurance</td><td>01-Mar-2025</td><td>28-Feb-2026</td><td><span class="badge green">VALID</span></td></tr>
                <tr><td>DOC-003</td><td>MP09 XY 5555</td><td>Fitness</td><td>01-Jun-2024</td><td>31-May-2025</td><td><span class="badge red">EXPIRED</span></td></tr>
                <tr><td>DOC-004</td><td>MP09 GH 3322</td><td>Load Test</td><td>01-Apr-2025</td><td>15-Jun-2025</td><td><span class="badge yellow">EXPIRING</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- HISTORY — DUMMY (API not ready) -->
        <div class="section">
          <div class="section-hdr">
            <i class="bi bi-clock-history hdr-icon"></i> History (Audit Trail)
            <span class="dummy-badge">● DUMMY</span>
          </div>
          <div class="table-scroll">
            <table class="dtable">
              <thead>
                <tr><th>HISTORY ID</th><th>PASS ID</th><th>ACTION</th><th>ACTION DATE</th><th>PERFORMED BY</th><th>REMARKS</th></tr>
              </thead>
              <tbody>
                <tr><td>HIS-001</td><td>PSS-001</td><td><span class="act-tag blue">CREATE</span></td><td>01-Jan-2025</td><td>Admin</td><td>New pass issued</td></tr>
                <tr><td>HIS-002</td><td>PSS-002</td><td><span class="act-tag orange">APPROVE</span></td><td>01-Mar-2025</td><td>Manager</td><td>Approved for logistics</td></tr>
                <tr><td>HIS-003</td><td>PSS-004</td><td><span class="act-tag red">SURRENDER</span></td><td>10-May-2025</td><td>Security</td><td>Pass surrendered at gate</td></tr>
                <tr><td>HIS-004</td><td>PSS-003</td><td><span class="act-tag blue">CREATE</span></td><td>15-Jan-2025</td><td>Admin</td><td>HR vehicle pass issued</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- AUTHORITY — DUMMY (API not ready) -->
        <div class="section">
          <div class="section-hdr">
            <i class="bi bi-lock-fill hdr-icon"></i> Authority (Approval Config)
            <span class="dummy-badge">● DUMMY</span>
          </div>
          <div class="table-scroll">
            <table class="dtable">
              <thead>
                <tr><th>AUTH ID</th><th>DEPARTMENT</th><th>AUTHORITY LEVEL</th><th>APPROVER NAME</th><th>MAX VALIDITY (DAYS)</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                <tr><td>AUTH-001</td><td>Operations</td><td>L1</td><td>Rajesh Sharma</td><td>365</td><td><span class="badge green">ACTIVE</span></td></tr>
                <tr><td>AUTH-002</td><td>Logistics</td><td>L2</td><td>Priya Mehta</td><td>180</td><td><span class="badge green">ACTIVE</span></td></tr>
                <tr><td>AUTH-003</td><td>Maintenance</td><td>L1</td><td>Suresh Tiwari</td><td>90</td><td><span class="badge yellow">REVIEW</span></td></tr>
                <tr><td>AUTH-004</td><td>HR</td><td>L3</td><td>Anita Joshi</td><td>365</td><td><span class="badge green">ACTIVE</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- LIVE VERTICAL TANK PANEL -->
      <div class="vt-panel">
        <div class="vt-header">
          <span class="vt-dot"></span>
          <span class="vt-header-txt">LIVE PASS STATUS</span>
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
            <div class="vt-liquid">
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
              <div class="vt-pct-text">70%</div>
            </div>
            <div class="vt-level-line"></div>
          </div>
          <div class="vt-cap">
            <div class="vt-cap-top"></div>
            <div class="vt-cap-fill"></div>
          </div>
        </div>
        <div class="vt-data-strip">
          <div class="vt-ds-block">
            <div class="vt-ds-num green-num">{{ activeCount }}</div>
            <div class="vt-ds-lbl">ACTIVE</div>
          </div>
          <div class="vt-ds-sep"></div>
          <div class="vt-ds-block">
            <div class="vt-ds-num">{{ vehicles.length || 0 }}</div>
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
            <span class="vtc-val">{{ vehicles.length || 0 }}</span>
          </div>
          <div class="vtc-row">
            <i class="bi bi-person-vcard-fill vtc-icon"></i>
            <span class="vtc-name">Pass Registry</span>
            <span class="vtc-val">248</span>
          </div>
          <div class="vtc-row">
            <i class="bi bi-file-earmark-text-fill vtc-icon"></i>
            <span class="vtc-name">Documents</span>
            <span class="vtc-val">312</span>
          </div>
          <div class="vtc-row">
            <i class="bi bi-clock-history vtc-icon"></i>
            <span class="vtc-name">History</span>
            <span class="vtc-val">890</span>
          </div>
          <div class="vtc-row">
            <i class="bi bi-lock-fill vtc-icon"></i>
            <span class="vtc-name">Authority</span>
            <span class="vtc-val">4</span>
          </div>
        </div>
        <div class="vt-bar-wrap">
          <div class="vt-bar-fill"></div>
        </div>
        <div class="vt-bar-caption">{{ activeCount }} / {{ vehicles.length || 0 }} VEHICLES ACTIVE</div>
      </div>

    </div>
  `
})
export class Home implements OnInit {

  vehicles: any[]     = [];
  vehiclesLoading     = true;
  vehiclesError       = false;

  private readonly HEADERS = new HttpHeaders({
    'X-API-KEY'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<any[]>(API_CONFIG.VEHICLES, { headers: this.HEADERS }).subscribe({
      next : (data) => { this.vehicles = data; this.vehiclesLoading = false; },
      error: ()     => { this.vehiclesError = true; this.vehiclesLoading = false; }
    });
  }

  get activeCount()   { return this.vehicles.filter(v => v.isActive === 'Y').length; }
  get inactiveCount() { return this.vehicles.filter(v => v.isActive !== 'Y').length; }
}