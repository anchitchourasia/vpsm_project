import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_CONFIG }  from '../core/api.config';

// ══════════════════════════════════════════════
//  🔧 DUMMY DATA SWITCH
//  true  = dummy data   |   false = live API
// ══════════════════════════════════════════════
const USE_DUMMY_DATA = false;

// ⚠️ Only vehicles with isBlacklisted: 'Y' should be here
const DUMMY_BLACKLISTED = [
  { vehicleId: 6,  vehicleNo: 'MP04HEG6666', vehicleType: 'Sedan', vehicleClass: 'Four_Wheeler',    brandModel: 'Hyundai Verna', isActive: 'Y', isBlacklisted: 'Y' },
  { vehicleId: 15, vehicleNo: 'MP04TT9999',  vehicleType: 'Truck', vehicleClass: 'Heavy_Machinery', brandModel: 'Tata Prima',    isActive: 'Y', isBlacklisted: 'Y' },
];

@Component({
  selector  : 'app-blacklisted',
  standalone: true,
  imports   : [CommonModule, FormsModule],
  template  : `

    <div class="page-wrapper">
      <div class="page-top">
        <div class="page-title-row">
          <i class="bi bi-slash-circle-fill page-icon" style="color:#dc2626"></i>
          <h2 class="page-heading">Blacklisted Vehicles</h2>
          <span class="record-pill" style="background:#fee2e2;color:#991b1b">
            {{ filteredVehicles.length }} Blacklisted
          </span>
          <span class="dummy-mode-pill" *ngIf="isDummy">● DUMMY DATA</span>
        </div>
      </div>

      <!-- LOADING -->
      <div *ngIf="isLoading()" class="state-box">
        <i class="bi bi-arrow-repeat spin-icon"></i><p>Loading...</p>
      </div>

      <!-- ERROR -->
      <div *ngIf="hasError() && !isLoading()" class="state-box error-box">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <p>Failed to load data.</p>
        <button class="btn-retry" (click)="loadVehicles()">Retry</button>
      </div>

      <div *ngIf="!isLoading() && !hasError()">
        <div class="filter-bar">
          <div class="search-box">
            <i class="bi bi-search search-icon"></i>
            <input type="text" placeholder="Search vehicle no, type, brand..."
              [value]="searchText()" (input)="onSearch($any($event.target).value)"
              class="search-input" />
          </div>
          <div class="filter-group">
            <select (change)="onFilterClass($any($event.target).value)" class="filter-select">
              <option value="ALL">All Classes</option>
              <option value="Two_Wheeler">Two Wheeler</option>
              <option value="Four_Wheeler">Four Wheeler</option>
              <option value="Heavy_Machinery">Heavy Machinery</option>
            </select>
            <select (change)="onPageSize($any($event.target).value)" class="filter-select">
              <option value="10">10 / page</option>
              <option value="20">20 / page</option>
              <option value="50">50 / page</option>
            </select>
          </div>
        </div>

        <div class="table-card">
          <div class="table-scroll">
            <table class="dtable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>VEHICLE ID</th>
                  <th>VEHICLE NO</th>
                  <th>TYPE</th>
                  <th>CLASS</th>
                  <th>BRAND / MODEL</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let v of pagedVehicles; let i = index">
                  <td>{{ (currentPage()-1)*pageSize() + i + 1 }}</td>
                  <td class="td-muted">{{ v.vehicleId }}</td>
                  <td><strong style="color:#dc2626">{{ v.vehicleNo }}</strong></td>
                  <td>{{ v.vehicleType }}</td>
                  <td>{{ v.vehicleClass }}</td>
                  <td>{{ v.brandModel || '—' }}</td>
                  <td>
                    <span [class]="v.isActive === 'Y' ? 'badge green' : 'badge red'">
                      {{ v.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE' }}
                    </span>
                  </td>
                </tr>
                <tr *ngIf="pagedVehicles.length === 0">
                  <td colspan="7" class="no-data">
                    <i class="bi bi-check-circle" style="color:#16a34a;font-size:20px"></i>
                    <br/>No blacklisted vehicles. All clear! ✅
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="pagination-bar">
            <span class="page-info">
              Showing {{ (currentPage()-1)*pageSize()+1 }}–{{ currentPage()*pageSize() < filteredVehicles.length ? currentPage()*pageSize() : filteredVehicles.length }}
              of {{ filteredVehicles.length }}
            </span>
            <div class="page-btns">
              <button class="pg-btn" (click)="goToPage(currentPage()-1)" [disabled]="currentPage()===1">
                <i class="bi bi-chevron-left"></i>
              </button>
              <button *ngFor="let p of totalPagesArr" class="pg-btn"
                [class.active]="p === currentPage()" (click)="goToPage(p)">{{ p }}</button>
              <button class="pg-btn" (click)="goToPage(currentPage()+1)" [disabled]="currentPage()===totalPages">
                <i class="bi bi-chevron-right"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

  `,
  styleUrl: './vehicles.css'
})
export class Blacklisted implements OnInit {

  private readonly HEADERS = new HttpHeaders({
    'X-API-KEY'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });

  allVehicles = signal<any[]>([]);
  isLoading   = signal(true);
  hasError    = signal(false);
  isDummy     = USE_DUMMY_DATA;

  searchText  = signal('');
  filterClass = signal('ALL');
  currentPage = signal(1);
  pageSize    = signal(10);

  constructor(private http: HttpClient) {}
  ngOnInit() { this.loadVehicles(); }

  loadVehicles() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        // ✅ DUMMY: already only blacklisted records
        this.allVehicles.set(DUMMY_BLACKLISTED);
        this.isLoading.set(false);
      }, 400);
      return;
    }

    // ✅ LIVE: API returns all vehicles → we filter isBlacklisted = 'Y' here
    this.http.get<any[]>(API_CONFIG.VEHICLES, { headers: this.HEADERS }).subscribe({
      next : (data) => {
        // Frontend safety filter — only show blacklisted ones
        this.allVehicles.set(data.filter((v: any) => v.isBlacklisted === 'Y'));
        this.isLoading.set(false);
      },
      error: () => { this.hasError.set(true); this.isLoading.set(false); }
    });
  }

  get filteredVehicles() {
    let list = this.allVehicles();
    const s  = this.searchText().toLowerCase();
    if (s) list = list.filter(v =>
      v.vehicleNo?.toLowerCase().includes(s) ||
      v.vehicleType?.toLowerCase().includes(s) ||
      v.brandModel?.toLowerCase().includes(s)
    );
    if (this.filterClass() !== 'ALL') list = list.filter(v => v.vehicleClass === this.filterClass());
    return list;
  }

  get pagedVehicles()  { const s = (this.currentPage()-1)*this.pageSize(); return this.filteredVehicles.slice(s, s+this.pageSize()); }
  get totalPages()     { return Math.ceil(this.filteredVehicles.length / this.pageSize()) || 1; }
  get totalPagesArr()  { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  goToPage(p: number)        { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }
  onSearch(val: string)      { this.searchText.set(val);  this.currentPage.set(1); }
  onFilterClass(val: string) { this.filterClass.set(val); this.currentPage.set(1); }
  onPageSize(val: string)    { this.pageSize.set(+val);   this.currentPage.set(1); }
}