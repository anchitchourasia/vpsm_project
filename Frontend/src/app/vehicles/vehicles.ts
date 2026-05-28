import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_CONFIG }  from '../core/api.config';

@Component({
  selector  : 'app-vehicles',
  standalone: true,
  imports   : [CommonModule, FormsModule],
  templateUrl: './vehicles.html',
  styleUrl  : './vehicles.css'
})
export class Vehicles implements OnInit {

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private readonly API_URL = API_CONFIG.VEHICLES;
  private readonly HEADERS = new HttpHeaders({
    'X-API-KEY'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  allVehicles  = signal<any[]>([]);
  isLoading    = signal(true);
  hasError     = signal(false);

  // Search & Filter
  searchText   = signal('');
  filterClass  = signal('ALL');
  filterStatus = signal('ALL');

  // Pagination
  currentPage  = signal(1);
  pageSize     = signal(10);

  constructor(private http: HttpClient) {}

  ngOnInit() { this.loadVehicles(); }

  loadVehicles() {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.http.get<any[]>(this.API_URL, { headers: this.HEADERS }).subscribe({
      next : (data) => {
        console.log('✅ Vehicles loaded:', data);
        this.allVehicles.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('❌ API Error:', err);
        this.hasError.set(true);
        this.isLoading.set(false);
      }
    });
  }

  // ── FILTERED LIST ──
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

  // ── PAGINATED LIST ──
  get pagedVehicles() {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredVehicles.slice(start, start + this.pageSize());
  }

  get totalPages()    { return Math.ceil(this.filteredVehicles.length / this.pageSize()); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  goToPage(p: number) {
    if (p >= 1 && p <= this.totalPages) this.currentPage.set(p);
  }

  onSearch(val: string)       { this.searchText.set(val);  this.currentPage.set(1); }
  onFilterClass(val: string)  { this.filterClass.set(val); this.currentPage.set(1); }
  onFilterStatus(val: string) { this.filterStatus.set(val);this.currentPage.set(1); }
  onPageSize(val: string)     { this.pageSize.set(+val);   this.currentPage.set(1); }

  // ── BADGE HELPERS ──
  getStatusClass(v: string) { return v === 'Y' ? 'badge green' : 'badge red'; }
  getStatusText(v: string)  { return v === 'Y' ? 'ACTIVE' : 'INACTIVE'; }
  getBlackClass(v: string)  { return v === 'Y' ? 'badge red' : 'badge grey'; }
}