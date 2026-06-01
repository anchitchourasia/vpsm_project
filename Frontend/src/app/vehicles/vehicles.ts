import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_CONFIG } from '../core/api.config';

// ══════════════════════════════════════════════════════════════
//  🔧 DUMMY DATA SWITCH  ← ONLY LINE YOU EVER NEED TO CHANGE
//  true  = shows dummy data (no API needed, backend can be off)
//  false = fetches live data from real API
// ══════════════════════════════════════════════════════════════
const USE_DUMMY_DATA = false;

const DUMMY_VEHICLES: any[] = [
  {
    vehicleId: 1,
    vehicleNo: 'MP04HEG1111',
    vehicleType: 'Car',
    vehicleClass: 'Four_Wheeler',
    brandModel: 'Honda City',
    isActive: 'Y',
    isBlacklisted: 'N',
  },
  {
    vehicleId: 2,
    vehicleNo: 'MP04HEG2222',
    vehicleType: 'Bike',
    vehicleClass: 'Two_Wheeler',
    brandModel: 'Royal Enfield Classic 350',
    isActive: 'Y',
    isBlacklisted: 'N',
  },
  {
    vehicleId: 3,
    vehicleNo: 'MP04HEG3333',
    vehicleType: 'Dumper Truck',
    vehicleClass: 'Heavy_Machinery',
    brandModel: 'Tata Prima',
    isActive: 'Y',
    isBlacklisted: 'N',
  },
  {
    vehicleId: 4,
    vehicleNo: 'MP04HEG4444',
    vehicleType: 'Scooter',
    vehicleClass: 'Two_Wheeler',
    brandModel: 'Honda Activa 6G',
    isActive: 'N',
    isBlacklisted: 'N',
  },
  {
    vehicleId: 5,
    vehicleNo: 'MP04HEG5555',
    vehicleType: 'SUV',
    vehicleClass: 'Four_Wheeler',
    brandModel: 'Tata Harrier',
    isActive: 'Y',
    isBlacklisted: 'N',
  },
  {
    vehicleId: 6,
    vehicleNo: 'MP04HEG6666',
    vehicleType: 'Sedan',
    vehicleClass: 'Four_Wheeler',
    brandModel: 'Hyundai Verna',
    isActive: 'Y',
    isBlacklisted: 'Y',
  },
  {
    vehicleId: 7,
    vehicleNo: 'MP04HEG7777',
    vehicleType: 'Scooter',
    vehicleClass: 'Two_Wheeler',
    brandModel: 'Activa 6G',
    isActive: 'Y',
    isBlacklisted: 'N',
  },
  {
    vehicleId: 8,
    vehicleNo: 'MP04HEG8888',
    vehicleType: 'Truck',
    vehicleClass: 'Heavy_Machinery',
    brandModel: 'BharatBenz 2823C',
    isActive: 'Y',
    isBlacklisted: 'N',
  },
  {
    vehicleId: 9,
    vehicleNo: 'MP04XX3548',
    vehicleType: 'SUV',
    vehicleClass: 'Four_Wheeler',
    brandModel: 'Tata Harrier',
    isActive: 'Y',
    isBlacklisted: 'N',
  },
  {
    vehicleId: 10,
    vehicleNo: 'MP04XX4174',
    vehicleType: 'SUV',
    vehicleClass: 'Four_Wheeler',
    brandModel: 'Tata Curvv',
    isActive: 'Y',
    isBlacklisted: 'N',
  },
  {
    vehicleId: 11,
    vehicleNo: 'MP04XX4194',
    vehicleType: 'SUV',
    vehicleClass: 'Four_Wheeler',
    brandModel: 'Tata Manza',
    isActive: 'N',
    isBlacklisted: 'N',
  },
  {
    vehicleId: 12,
    vehicleNo: 'MH12KL1234',
    vehicleType: 'Car',
    vehicleClass: 'Four_Wheeler',
    brandModel: 'Honda City',
    isActive: 'Y',
    isBlacklisted: 'N',
  },
];

// ── Form model ──
interface VehicleForm {
  vehicleNo: string;
  vehicleType: string;
  vehicleClass: string;
  brandModel: string;
  isActive: string;
  isBlacklisted: string;
}

const EMPTY_FORM = (): VehicleForm => ({
  vehicleNo: '',
  vehicleType: '',
  vehicleClass: '',
  brandModel: '',
  isActive: 'Y',
  isBlacklisted: 'N',
});

@Component({
  selector: 'app-vehicles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vehicles.html',
  styleUrl: './vehicles.css',
})
export class Vehicles implements OnInit {
  private readonly API_URL = API_CONFIG.VEHICLES;
  private readonly HEADERS = new HttpHeaders({
    'X-API-KEY': API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });

  // ── List state ──
  allVehicles = signal<any[]>([]);
  isLoading = signal(true);
  hasError = signal(false);
  isDummy = USE_DUMMY_DATA; // exposed to HTML for showing badge

  // ── Search / Filter / Pagination (all original) ──
  searchText = signal('');
  filterClass = signal('ALL');
  filterStatus = signal('ALL');
  currentPage = signal(1);
  pageSize = signal(10);

  // ── Add/Edit Modal state ──
  showModal = signal(false);
  isEditMode = signal(false);
  isSaving = signal(false);
  saveError = signal('');
  saveSuccess = signal('');
  editId = signal<number | null>(null);
  form: VehicleForm = EMPTY_FORM();

  // ── Delete Confirm Modal state ──
  showDeleteModal = signal(false);
  isDeleting = signal(false);
  deleteError = signal('');
  deleteTarget = signal<any>(null);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadVehicles();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  LOAD  (original — untouched)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  loadVehicles() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      // ── DUMMY MODE: load instantly, no API call ──
      setTimeout(() => {
        this.allVehicles.set([...DUMMY_VEHICLES]);
        this.isLoading.set(false);
      }, 400);
      return;
    }

    // ── LIVE MODE: call real API ──
    this.http.get<any[]>(this.API_URL, { headers: this.HEADERS }).subscribe({
      next: (data) => {
        this.allVehicles.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  ADD / EDIT MODAL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  openAddModal() {
    this.form = EMPTY_FORM();
    this.isEditMode.set(false);
    this.editId.set(null);
    this.saveError.set('');
    this.saveSuccess.set('');
    this.showModal.set(true);
  }

  openEditModal(v: any) {
    this.form = {
      vehicleNo: v.vehicleNo,
      vehicleType: v.vehicleType,
      vehicleClass: v.vehicleClass,
      brandModel: v.brandModel || '',
      isActive: v.isActive,
      isBlacklisted: v.isBlacklisted,
    };
    this.isEditMode.set(true);
    this.editId.set(v.vehicleId);
    this.saveError.set('');
    this.saveSuccess.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  saveVehicle() {
    // ── Validation ──
    if (!this.form.vehicleNo.trim()) {
      this.saveError.set('Vehicle number is required.');
      return;
    }
    if (!this.form.vehicleType.trim()) {
      this.saveError.set('Vehicle type is required.');
      return;
    }
    if (!this.form.vehicleClass) {
      this.saveError.set('Vehicle class is required.');
      return;
    }

    // ── Normalize ──
    this.form.vehicleNo = this.form.vehicleNo.toUpperCase().replace(/\s+/g, '');
    this.isSaving.set(true);
    this.saveError.set('');
    this.saveSuccess.set('');

    // ── DUMMY MODE ──
    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        if (this.isEditMode()) {
          const idx = DUMMY_VEHICLES.findIndex((v) => v.vehicleId === this.editId());
          if (idx > -1) DUMMY_VEHICLES[idx] = { ...DUMMY_VEHICLES[idx], ...this.form };
        } else {
          const newId = Math.max(...DUMMY_VEHICLES.map((v) => v.vehicleId)) + 1;
          DUMMY_VEHICLES.push({ vehicleId: newId, ...this.form });
        }
        this.allVehicles.set([...DUMMY_VEHICLES]);
        this.isSaving.set(false);
        this.saveSuccess.set(this.isEditMode() ? 'Vehicle updated!' : 'Vehicle added!');
        setTimeout(() => this.closeModal(), 1200);
      }, 600);
      return;
    }

    // ── LIVE API ──
    if (this.isEditMode()) {
      // ✅ PUT → /api/vehicles/update/{vehicleId}
      // Body → only updatable fields (vehicleNo is excluded, it never changes)
      const updatePayload = {
        vehicleType: this.form.vehicleType,
        vehicleClass: this.form.vehicleClass,
        brandModel: this.form.brandModel,
        isActive: this.form.isActive,
        isBlacklisted: this.form.isBlacklisted,
      };

      this.http
        .put(`${API_CONFIG.BASE_URL}/api/vehicles/update/${this.editId()}`, updatePayload, {
          headers: this.HEADERS,
        })
        .subscribe({
          next: () => {
            this.isSaving.set(false);
            this.saveSuccess.set('Vehicle updated successfully!');
            this.loadVehicles();
            setTimeout(() => this.closeModal(), 1200);
          },
          error: (err) => {
            this.isSaving.set(false);
            this.saveError.set(err?.error?.message || 'Failed to save. Please try again.');
          },
        });
    } else {
      // ✅ POST → Add new vehicle (confirm URL with backend partner)
      this.http.post(API_CONFIG.VEHICLES_REGISTER, this.form, { headers: this.HEADERS }).subscribe({
        next: (res) => {
          this.isSaving.set(false);
          this.saveSuccess.set('Vehicle added successfully!');
          this.loadVehicles();
          setTimeout(() => this.closeModal(), 1200);
        },
        error: (err) => {
          this.isSaving.set(false);
          const serverMsg = err?.error?.message || err?.error || err?.message;
          this.saveError.set(serverMsg || 'Failed to save. Please try again.');
        },
      });
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  DELETE MODAL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  openDeleteModal(v: any) {
    this.deleteTarget.set(v);
    this.deleteError.set('');
    this.showDeleteModal.set(true);
  }

  closeDeleteModal() {
    this.showDeleteModal.set(false);
  }

  confirmDelete() {
    const v = this.deleteTarget();
    if (!v) return;

    this.isDeleting.set(true);
    this.deleteError.set('');

    // ── DUMMY MODE ──
    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        const idx = DUMMY_VEHICLES.findIndex((x) => x.vehicleId === v.vehicleId);
        if (idx > -1) DUMMY_VEHICLES.splice(idx, 1);
        this.allVehicles.set([...DUMMY_VEHICLES]);
        this.isDeleting.set(false);
        this.closeDeleteModal();
      }, 500);
      return;
    }

    // ── LIVE API ── ✅ responseType: 'text' added (backend returns plain string)
    this.http
      .delete(`${API_CONFIG.BASE_URL}/api/vehicles/delete/${v.vehicleId}`, {
        headers: this.HEADERS,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.isDeleting.set(false);
          this.loadVehicles();
          this.closeDeleteModal();
        },
        error: (err) => {
          this.isDeleting.set(false);
          this.deleteError.set(err?.error?.message || 'Delete failed. Please try again.');
        },
      });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  FILTER & PAGINATION  (original — untouched)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  get filteredVehicles() {
    let list = this.allVehicles();
    const s = this.searchText().toLowerCase();
    if (s) {
      list = list.filter(
        (v) =>
          v.vehicleNo?.toLowerCase().includes(s) ||
          v.vehicleType?.toLowerCase().includes(s) ||
          v.brandModel?.toLowerCase().includes(s),
      );
    }
    if (this.filterClass() !== 'ALL')
      list = list.filter((v) => v.vehicleClass === this.filterClass());
    if (this.filterStatus() !== 'ALL')
      list = list.filter((v) => v.isActive === this.filterStatus());
    return list;
  }

  get pagedVehicles() {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredVehicles.slice(start, start + this.pageSize());
  }

  get totalPages() {
    return Math.ceil(this.filteredVehicles.length / this.pageSize()) || 1;
  }
  get totalPagesArr() {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  goToPage(p: number) {
    if (p >= 1 && p <= this.totalPages) this.currentPage.set(p);
  }
  onSearch(val: string) {
    this.searchText.set(val);
    this.currentPage.set(1);
  }
  onFilterClass(val: string) {
    this.filterClass.set(val);
    this.currentPage.set(1);
  }
  onFilterStatus(val: string) {
    this.filterStatus.set(val);
    this.currentPage.set(1);
  }
  onPageSize(val: string) {
    this.pageSize.set(+val);
    this.currentPage.set(1);
  }

  getStatusClass(v: string) {
    return v === 'Y' ? 'badge green' : 'badge red';
  }
  getStatusText(v: string) {
    return v === 'Y' ? 'ACTIVE' : 'INACTIVE';
  }
  getBlackClass(v: string) {
    return v === 'Y' ? 'badge red' : 'badge grey';
  }
}
