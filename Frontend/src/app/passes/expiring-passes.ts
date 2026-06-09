import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

const USE_DUMMY_DATA = false;
const HTTP_TIMEOUT_MS = 12000;

const DUMMY_PASSES: any[] = [
  { passId:6, issueDate:'2026-01-01', validityDate:'2026-06-10', employeeNo:'EMP006', employeeCompanyNo:'HEG006', dept:'HR',          contractorCode:null,    gateNo:'GATE_01', parkingToBeUsed:'A-Block',    vehicle:{ vehicleId:9, vehicleNo:'MP04XX3548', vehicleType:'SUV',          vehicleClass:'Four_Wheeler'  }, typeOfVehicle:'SUV',          mobileNo:'9600002222', status:'Expiring', empType:'Company_Employee', isActive:'Y', enterBy:'ADMIN', enterDate:'2026-01-01', remarks:'Renewal due soon' },
  { passId:7, issueDate:'2026-02-10', validityDate:'2026-06-15', employeeNo:null,     employeeCompanyNo:null,     dept:'Heavy Works', contractorCode:'CON003', gateNo:'GATE_03', parkingToBeUsed:'Heavy Yard', vehicle:{ vehicleId:3, vehicleNo:'MP04HEG3333', vehicleType:'Dumper Truck', vehicleClass:'Heavy_Machinery'}, typeOfVehicle:'Dumper Truck', mobileNo:'9500003333', status:'Expiring', empType:'Contractor',       isActive:'Y', enterBy:'ADMIN', enterDate:'2026-02-10', remarks:'' },
];

@Component({
  selector  : 'app-expiring-passes',
  standalone: true,
  imports   : [CommonModule, FormsModule],
  styleUrl  : './passes.css',
  template  : `
<div class="page-wrapper">

  <!-- HEADER -->
  <div class="page-top">
    <div class="page-title-row">
      <span class="dummy-mode-pill" *ngIf="isDummy">● DUMMY DATA</span>
      <i class="bi bi-hourglass-split page-icon" style="color:#d97706"></i>
      <h2 class="page-heading">Expiring Passes</h2>
      <span class="record-pill" style="background:#fef3c7;color:#92400e">
        {{ filteredPasses().length }} Expiring
      </span>
    </div>
  </div>

  <!-- LOADING -->
  <div *ngIf="isLoading()" class="state-box">
    <i class="bi bi-arrow-repeat spin-icon"></i>
    <p>Loading expiring passes...</p>
  </div>

  <!-- ERROR -->
  <div *ngIf="hasError() && !isLoading()" class="state-box error-box">
    <i class="bi bi-exclamation-triangle-fill"></i>
    <p>Failed to load data. Check if backend is running.</p>
    <button class="btn-retry" (click)="loadPasses()">
      <i class="bi bi-arrow-clockwise"></i> Retry
    </button>
  </div>

  <!-- CONTENT -->
  <div *ngIf="!isLoading() && !hasError()">

    <!-- FILTER BAR -->
    <div class="filter-bar">
      <div class="search-box">
        <i class="bi bi-search search-icon"></i>
        <input type="text" placeholder="Search emp code, contractor, dept, mobile, vehicle no..."
          [value]="searchText()"
          (input)="onSearch($any($event.target).value)"
          class="search-input" />
      </div>
      <div class="filter-group">
        <select (change)="onFilterEmpType($any($event.target).value)" class="filter-select">
          <option value="ALL">All Types</option>
          <option value="Company_Employee">Company Employee</option>
          <option value="Contractor">Contractor</option>
        </select>
        <select (change)="onPageSize($any($event.target).value)" class="filter-select">
          <option value="10">10 / page</option>
          <option value="20">20 / page</option>
          <option value="50">50 / page</option>
        </select>
      </div>
    </div>

    <!-- TABLE -->
    <div class="table-card">
      <div class="table-scroll">
        <table class="dtable">
          <thead>
            <tr>
              <th>S.NO</th>
              <th>PASS ID</th>
              <th>EMP / CONTRACTOR</th>
              <th>EMP TYPE</th>
              <th>DEPT / AREA</th>
              <th>VEHICLE NO</th>
              <th>TYPE OF VEHICLE</th>
              <th>GATE</th>
              <th>VALID TILL</th>
              <th>DAYS LEFT</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of pagedPasses(); let i = index">
              <td>{{ (currentPage()-1)*pageSize() + i + 1 }}</td>
              <td class="td-muted">{{ formatPassId(p.passId) }}</td>
              <td>
                <strong>{{ p.empType === 'Contractor' ? (p.contractorCode || '—') : (p.employeeNo || '—') }}</strong>
              </td>
              <td>
                <span [class]="getEmpTypeBadgeClass(p.empType)">
                  {{ p.empType === 'Company_Employee' ? 'Employee' : 'Contractor' }}
                </span>
              </td>
              <td>{{ p.dept || '—' }}</td>
              <td><strong>{{ p.vehicle?.vehicleNo || '—' }}</strong></td>
              <td>{{ p.typeOfVehicle || p.vehicle?.vehicleType || '—' }}</td>
              <td>{{ p.gateNo || '—' }}</td>
              <td>{{ formatDate(p.validityDate) }}</td>
              <td>
                <span [class]="getDaysLeftClass(p.validityDate)">
                  {{ getDaysLeft(p.validityDate) }} days
                </span>
              </td>
              <td>
                <div class="action-btns">
                  <button class="btn-icon-view" (click)="openViewModal(p)">
                    <i class="bi bi-eye"></i> View
                  </button>
                </div>
              </td>
            </tr>
            <tr *ngIf="pagedPasses().length === 0">
              <td colspan="11" class="no-data">No expiring passes found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- PAGINATION -->
      <div class="pagination-bar">
        <span class="page-info">
          Showing
          {{ filteredPasses().length === 0 ? 0 : (currentPage()-1)*pageSize()+1 }}–{{ currentPage()*pageSize() < filteredPasses().length ? currentPage()*pageSize() : filteredPasses().length }}
          of {{ filteredPasses().length }}
        </span>
        <div class="page-btns">
          <button class="pg-btn" (click)="goToPage(currentPage()-1)" [disabled]="currentPage()===1">
            <i class="bi bi-chevron-left"></i>
          </button>
          <button *ngFor="let pg of totalPagesArr" class="pg-btn"
            [class.active]="pg === currentPage()" (click)="goToPage(pg)">{{ pg }}</button>
          <button class="pg-btn" (click)="goToPage(currentPage()+1)" [disabled]="currentPage()===totalPages">
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- VIEW MODAL -->
<div class="modal-overlay" *ngIf="showViewModal()" (click)="closeViewModal()"></div>
<div class="modal-box modal-lg" *ngIf="showViewModal() && viewPass()">
  <div class="modal-header modal-header-view">
    <h3>🪪 Pass Detail — {{ formatPassId(viewPass().passId) }}</h3>
    <button class="modal-close" (click)="closeViewModal()"><i class="bi bi-x-lg"></i></button>
  </div>
  <div class="modal-body">
    <div class="detail-grid">
      <!-- PERSON -->
      <div class="detail-section">
        <div class="detail-section-title">PERSON</div>
        <div class="detail-row">
          <span class="detail-label">Emp Type</span>
          <span [class]="getEmpTypeBadgeClass(viewPass().empType)">
            {{ viewPass().empType === 'Company_Employee' ? 'Company Employee' : 'Contractor' }}
          </span>
        </div>
        <ng-container *ngIf="viewPass().empType === 'Company_Employee'">
          <div class="detail-row"><span class="detail-label">Employee No</span><strong class="detail-value">{{ viewPass().employeeNo || '—' }}</strong></div>
          <div class="detail-row"><span class="detail-label">EC No</span><strong class="detail-value">{{ viewPass().employeeCompanyNo || '—' }}</strong></div>
        </ng-container>
        <ng-container *ngIf="viewPass().empType === 'Contractor'">
          <div class="detail-row"><span class="detail-label">Contractor Code</span><strong class="detail-value">{{ viewPass().contractorCode || '—' }}</strong></div>
        </ng-container>
        <div class="detail-row"><span class="detail-label">Department / Work Area</span><strong class="detail-value">{{ viewPass().dept || '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Mobile</span><strong class="detail-value">{{ viewPass().mobileNo || '—' }}</strong></div>
      </div>
      <!-- VEHICLE -->
      <div class="detail-section">
        <div class="detail-section-title">VEHICLE</div>
        <div class="detail-row"><span class="detail-label">Vehicle ID (FK)</span><strong class="detail-value">{{ viewPass().vehicle?.vehicleId ?? '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Vehicle No</span><strong class="detail-value">{{ viewPass().vehicle?.vehicleNo ?? '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Type of Vehicle</span><strong class="detail-value">{{ viewPass().typeOfVehicle || viewPass().vehicle?.vehicleType || '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Vehicle Class</span><strong class="detail-value">{{ viewPass().vehicle?.vehicleClass ?? '—' }}</strong></div>
      </div>
      <!-- PASS INFO -->
      <div class="detail-section">
        <div class="detail-section-title">PASS INFO</div>
        <div class="detail-row"><span class="detail-label">Issue Date</span><strong class="detail-value">{{ formatDate(viewPass().issueDate) }}</strong></div>
        <div class="detail-row"><span class="detail-label">Valid Till</span><strong class="detail-value">{{ formatDate(viewPass().validityDate) }}</strong></div>
        <div class="detail-row">
          <span class="detail-label">Days Left</span>
          <span [class]="getDaysLeftClass(viewPass().validityDate)">{{ getDaysLeft(viewPass().validityDate) }} days</span>
        </div>
        <div class="detail-row"><span class="detail-label">Gate No</span><strong class="detail-value">{{ viewPass().gateNo || '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Parking</span><strong class="detail-value">{{ viewPass().parkingToBeUsed || '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Status</span><span class="badge badge-expiring">Expiring</span></div>
        <div class="detail-row"><span class="detail-label">Is Active</span><strong class="detail-value">{{ viewPass().isActive === 'Y' ? 'Yes' : 'No' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Entered By</span><strong class="detail-value">{{ viewPass().enterBy || '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Enter Date</span><strong class="detail-value">{{ formatDate(viewPass().enterDate) }}</strong></div>
        <div class="detail-row"><span class="detail-label">Remarks</span><strong class="detail-value">{{ viewPass().remarks || '—' }}</strong></div>
      </div>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn-cancel" (click)="closeViewModal()">Close</button>
  </div>
</div>
  `,
})
export class ExpiringPasses implements OnInit, OnDestroy {

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });
  private readonly destroy$ = new Subject<void>();

  private allPassesRaw = signal<any[]>([]);
  isLoading  = signal(true);
  hasError   = signal(false);
  isDummy    = USE_DUMMY_DATA;

  searchText    = signal('');
  filterEmpType = signal('ALL');
  currentPage   = signal(1);
  pageSize      = signal(10);

  showViewModal = signal(false);
  viewPass      = signal<any>(null);

  constructor(private http: HttpClient) {}
  ngOnInit()    { this.loadPasses(); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  loadPasses() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        this.allPassesRaw.set(DUMMY_PASSES);
        this.isLoading.set(false);
      }, 400);
      return;
    }

    this.http
      .get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS, observe: 'response' })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('❌ expiring-passes error:', err?.status, err?.error);
          this.hasError.set(true);
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe((response: HttpResponse<any[]> | null) => {
        if (!response) return;
        const all   = response.status === 204 || !response.body ? [] : response.body;
        const today = new Date(); today.setHours(0,0,0,0);
        const in30  = new Date(); in30.setDate(today.getDate() + 30);
        // Show passes flagged 'Expiring' OR validity within next 30 days and still active
        this.allPassesRaw.set(all.filter(p => {
          const st         = (p.status || '').toLowerCase();
          const validTill  = p.validityDate ? new Date(p.validityDate) : null;
          const nearExpiry = validTill && validTill >= today && validTill <= in30;
          return st === 'expiring' || nearExpiry;
        }));
        this.isLoading.set(false);
      });
  }

  filteredPasses = () => {
    const q  = this.searchText().toLowerCase();
    const et = this.filterEmpType();
    return this.allPassesRaw().filter(p => {
      const matchSearch =
        !q ||
        (p.employeeNo          || '').toLowerCase().includes(q) ||
        (p.contractorCode      || '').toLowerCase().includes(q) ||
        (p.dept                || '').toLowerCase().includes(q) ||
        (p.mobileNo            || '').toLowerCase().includes(q) ||
        (p.vehicle?.vehicleNo  || '').toLowerCase().includes(q) ||
        String(p.passId        || '').includes(q);
        this.formatPassId(p.passId).toLowerCase().includes(q);
      const matchEmpType = et === 'ALL' || (p.empType || '') === et;
      return matchSearch && matchEmpType;
    });
  };

  pagedPasses = () => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredPasses().slice(start, start + this.pageSize());
  };

  get totalPages()    { return Math.max(1, Math.ceil(this.filteredPasses().length / this.pageSize())); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  openViewModal(p: any) { this.viewPass.set(p); this.showViewModal.set(true); }
  closeViewModal()      { this.showViewModal.set(false); }

  onSearch       (v: string) { this.searchText.set(v);    this.currentPage.set(1); }
  onFilterEmpType(v: string) { this.filterEmpType.set(v); this.currentPage.set(1); }
  onPageSize     (v: string) { this.pageSize.set(+v);     this.currentPage.set(1); }
  goToPage       (p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }
  
  formatPassId(dbPassId: number | null | undefined): string {
    if (!dbPassId && dbPassId !== 0) return '—';
    return `PASS-HEG-${String(dbPassId).padStart(4, '0')}`;
  }
  formatDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }

  getDaysLeft(validityDate: string): number {
    if (!validityDate) return 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const end   = new Date(validityDate); end.setHours(0,0,0,0);
    return Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86400000));
  }

  getDaysLeftClass(validityDate: string): string {
    const days = this.getDaysLeft(validityDate);
    if (days <= 7)  return 'badge badge-expired';
    if (days <= 15) return 'badge badge-expiring';
    return 'badge badge-active';
  }

  getEmpTypeBadgeClass(e: string): string {
    return e === 'Contractor' ? 'badge badge-contractor' : 'badge badge-employee';
  }
}