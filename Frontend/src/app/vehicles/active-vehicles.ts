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

const DUMMY_VEHICLES = [
  { vehicleId: 1,  vehicleNo: 'MP04HEG1111', vehicleType: 'Car',          vehicleClass: 'Four_Wheeler',    brandModel: 'Honda City',               isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 2,  vehicleNo: 'MP04HEG2222', vehicleType: 'Bike',         vehicleClass: 'Two_Wheeler',     brandModel: 'Royal Enfield Classic 350', isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 3,  vehicleNo: 'MP04HEG3333', vehicleType: 'Dumper Truck', vehicleClass: 'Heavy_Machinery', brandModel: 'Tata Prima',                isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 5,  vehicleNo: 'MP04HEG5555', vehicleType: 'SUV',          vehicleClass: 'Four_Wheeler',    brandModel: 'Tata Harrier',              isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 6,  vehicleNo: 'MP04HEG6666', vehicleType: 'Sedan',        vehicleClass: 'Four_Wheeler',    brandModel: 'Hyundai Verna',             isActive: 'Y', isBlacklisted: 'Y' },
  { vehicleId: 7,  vehicleNo: 'MP04HEG7777', vehicleType: 'Scooter',      vehicleClass: 'Two_Wheeler',     brandModel: 'Activa 6G',                 isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 8,  vehicleNo: 'MP04HEG8888', vehicleType: 'Truck',        vehicleClass: 'Heavy_Machinery', brandModel: 'BharatBenz 2823C',          isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 9,  vehicleNo: 'MP04XX3548',  vehicleType: 'SUV',          vehicleClass: 'Four_Wheeler',    brandModel: 'Tata Harrier',              isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 10, vehicleNo: 'MP04XX4174',  vehicleType: 'SUV',          vehicleClass: 'Four_Wheeler',    brandModel: 'Tata Curvv',                isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 12, vehicleNo: 'MH12KL1234',  vehicleType: 'Car',          vehicleClass: 'Four_Wheeler',    brandModel: 'Honda City',                isActive: 'Y', isBlacklisted: 'N' },
];

@Component({
  selector  : 'app-active-vehicles',
  standalone: true,
  imports   : [CommonModule, FormsModule],
  template  : `

    <div class="page-wrapper">
      <div class="page-top">
        <div class="page-title-row">
          <i class="bi bi-check-circle-fill page-icon" style="color:#16a34a"></i>
          <h2 class="page-heading">Active Vehicles</h2>
          <span class="record-pill" style="background:#d1fae5;color:#065f46">
            {{ filteredVehicles.length }} Active
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

        <!-- FILTER BAR -->
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

        <!-- TABLE -->
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
                  <th>BLACKLISTED</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let v of pagedVehicles; let i = index">
                  <td>{{ (currentPage()-1)*pageSize() + i + 1 }}</td>
                  <td class="td-muted">{{ v.vehicleId }}</td>
                  <td><strong>{{ v.vehicleNo }}</strong></td>
                  <td>{{ v.vehicleType }}</td>
                  <td>{{ v.vehicleClass }}</td>
                  <td>{{ v.brandModel || '—' }}</td>
                  <td>
                    <span [class]="v.isBlacklisted === 'Y' ? 'badge red' : 'badge grey'">
                      {{ v.isBlacklisted === 'Y' ? 'YES' : 'NO' }}
                    </span>
                  </td>
                </tr>
                <tr *ngIf="pagedVehicles.length === 0">
                  <td colspan="7" class="no-data">No active vehicles found.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- PAGINATION -->
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
export class ActiveVehicles implements OnInit {

  private readonly HEADERS = new HttpHeaders({
    'X-API-KEY'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });

  allVehicles  = signal<any[]>([]);
  isLoading    = signal(true);
  hasError     = signal(false);
  isDummy      = USE_DUMMY_DATA;

  searchText   = signal('');
  filterClass  = signal('ALL');
  currentPage  = signal(1);
  pageSize     = signal(10);

  constructor(private http: HttpClient) {}
  ngOnInit() { this.loadVehicles(); }

  loadVehicles() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        // pre-filter: only active
        this.allVehicles.set(DUMMY_VEHICLES.filter(v => v.isActive === 'Y'));
        this.isLoading.set(false);
      }, 400);
      return;
    }

    // Live: backend should return only active vehicles
    this.http.get<any[]>(`${API_CONFIG.VEHICLES}?status=Y`, { headers: this.HEADERS }).subscribe({
      next : (data) => { this.allVehicles.set(data); this.isLoading.set(false); },
      error: ()     => { this.hasError.set(true);    this.isLoading.set(false); }
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