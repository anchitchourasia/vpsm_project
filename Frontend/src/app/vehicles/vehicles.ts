import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_CONFIG }  from '../core/api.config';

// ══════════════════════════════════════════════════════════════
//  🔧 DUMMY DATA SWITCH  ← ONLY LINE YOU EVER NEED TO CHANGE
//  true  = shows dummy data (no API needed, backend can be off)
//  false = fetches live data from real API
// ══════════════════════════════════════════════════════════════
const USE_DUMMY_DATA = false;

const DUMMY_VEHICLES = [
  { vehicleId: 1,  vehicleNo: 'MP04HEG1111', vehicleType: 'Car',          vehicleClass: 'Four_Wheeler',    brandModel: 'Honda City',               isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 2,  vehicleNo: 'MP04HEG2222', vehicleType: 'Bike',         vehicleClass: 'Two_Wheeler',     brandModel: 'Royal Enfield Classic 350', isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 3,  vehicleNo: 'MP04HEG3333', vehicleType: 'Dumper Truck', vehicleClass: 'Heavy_Machinery', brandModel: 'Tata Prima',                isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 4,  vehicleNo: 'MP04HEG4444', vehicleType: 'Scooter',      vehicleClass: 'Two_Wheeler',     brandModel: 'Honda Activa 6G',           isActive: 'N', isBlacklisted: 'N' },
  { vehicleId: 5,  vehicleNo: 'MP04HEG5555', vehicleType: 'SUV',          vehicleClass: 'Four_Wheeler',    brandModel: 'Tata Harrier',              isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 6,  vehicleNo: 'MP04HEG6666', vehicleType: 'Sedan',        vehicleClass: 'Four_Wheeler',    brandModel: 'Hyundai Verna',             isActive: 'Y', isBlacklisted: 'Y' },
  { vehicleId: 7,  vehicleNo: 'MP04HEG7777', vehicleType: 'Scooter',      vehicleClass: 'Two_Wheeler',     brandModel: 'Activa 6G',                 isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 8,  vehicleNo: 'MP04HEG8888', vehicleType: 'Truck',        vehicleClass: 'Heavy_Machinery', brandModel: 'BharatBenz 2823C',          isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 9,  vehicleNo: 'MP04XX3548',  vehicleType: 'SUV',          vehicleClass: 'Four_Wheeler',    brandModel: 'Tata Harrier',              isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 10, vehicleNo: 'MP04XX4174',  vehicleType: 'SUV',          vehicleClass: 'Four_Wheeler',    brandModel: 'Tata Curvv',                isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 11, vehicleNo: 'MP04XX4194',  vehicleType: 'SUV',          vehicleClass: 'Four_Wheeler',    brandModel: 'Tata Manza',                isActive: 'N', isBlacklisted: 'N' },
  { vehicleId: 12, vehicleNo: 'MH12KL1234',  vehicleType: 'Car',          vehicleClass: 'Four_Wheeler',    brandModel: 'Honda City',                isActive: 'Y', isBlacklisted: 'N' },
];

@Component({
  selector  : 'app-vehicles',
  standalone: true,
  imports   : [CommonModule, FormsModule],
  templateUrl: './vehicles.html',
  styleUrl  : './vehicles.css'
})
export class Vehicles implements OnInit {

  private readonly API_URL = API_CONFIG.VEHICLES;
  private readonly HEADERS = new HttpHeaders({
    'X-API-KEY'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });

  allVehicles  = signal<any[]>([]);
  isLoading    = signal(true);
  hasError     = signal(false);
  isDummy      = USE_DUMMY_DATA;   // exposed to HTML for showing badge

  searchText   = signal('');
  filterClass  = signal('ALL');
  filterStatus = signal('ALL');
  currentPage  = signal(1);
  pageSize     = signal(10);

  constructor(private http: HttpClient) {}

  ngOnInit() { this.loadVehicles(); }

  loadVehicles() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      // ── DUMMY MODE: load instantly, no API call ──
      setTimeout(() => {
        this.allVehicles.set(DUMMY_VEHICLES);
        this.isLoading.set(false);
      }, 400);
      return;
    }

    // ── LIVE MODE: call real API ──
    this.http.get<any[]>(this.API_URL, { headers: this.HEADERS }).subscribe({
      next : (data) => { this.allVehicles.set(data); this.isLoading.set(false); },
      error: (err)  => { this.hasError.set(true);    this.isLoading.set(false); }
    });
  }

  get filteredVehicles() {
    let list = this.allVehicles();
    const s  = this.searchText().toLowerCase();
    if (s) {
      list = list.filter(v =>
        v.vehicleNo?.toLowerCase().includes(s)    ||
        v.vehicleType?.toLowerCase().includes(s)  ||
        v.brandModel?.toLowerCase().includes(s)
      );
    }
    if (this.filterClass()  !== 'ALL') list = list.filter(v => v.vehicleClass === this.filterClass());
    if (this.filterStatus() !== 'ALL') list = list.filter(v => v.isActive     === this.filterStatus());
    return list;
  }

  get pagedVehicles() {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredVehicles.slice(start, start + this.pageSize());
  }

  get totalPages()    { return Math.ceil(this.filteredVehicles.length / this.pageSize()) || 1; }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  goToPage(p: number)         { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }
  onSearch(val: string)       { this.searchText.set(val);   this.currentPage.set(1); }
  onFilterClass(val: string)  { this.filterClass.set(val);  this.currentPage.set(1); }
  onFilterStatus(val: string) { this.filterStatus.set(val); this.currentPage.set(1); }
  onPageSize(val: string)     { this.pageSize.set(+val);    this.currentPage.set(1); }

  getStatusClass(v: string) { return v === 'Y' ? 'badge green' : 'badge red'; }
  getStatusText(v: string)  { return v === 'Y' ? 'ACTIVE' : 'INACTIVE'; }
  getBlackClass(v: string)  { return v === 'Y' ? 'badge red' : 'badge grey'; }
}