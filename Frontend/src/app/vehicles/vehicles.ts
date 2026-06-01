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
  { vehicleId: 1,  vehicleNo: 'MP04HEG1111', vehicleType: 'Car',          vehicleClass: 'Four_Wheeler',    brandModel: 'Honda City',              isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 2,  vehicleNo: 'MP04HEG2222', vehicleType: 'Bike',         vehicleClass: 'Two_Wheeler',     brandModel: 'Royal Enfield Classic 350',isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 3,  vehicleNo: 'MP04HEG3333', vehicleType: 'Dumper Truck', vehicleClass: 'Heavy_Machinery', brandModel: 'Tata Prima',               isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 4,  vehicleNo: 'MP04HEG4444', vehicleType: 'Scooter',      vehicleClass: 'Two_Wheeler',     brandModel: 'Honda Activa 6G',          isActive: 'N', isBlacklisted: 'N' },
  { vehicleId: 5,  vehicleNo: 'MP04HEG5555', vehicleType: 'SUV',          vehicleClass: 'Four_Wheeler',    brandModel: 'Tata Harrier',             isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 6,  vehicleNo: 'MP04HEG6666', vehicleType: 'Sedan',        vehicleClass: 'Four_Wheeler',    brandModel: 'Hyundai Verna',            isActive: 'Y', isBlacklisted: 'Y' },
  { vehicleId: 7,  vehicleNo: 'MP04HEG7777', vehicleType: 'Scooter',      vehicleClass: 'Two_Wheeler',     brandModel: 'Activa 6G',               isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 8,  vehicleNo: 'MP04HEG8888', vehicleType: 'Truck',        vehicleClass: 'Heavy_Machinery', brandModel: 'BharatBenz 2823C',         isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 9,  vehicleNo: 'MP04XX3548',  vehicleType: 'SUV',          vehicleClass: 'Four_Wheeler',    brandModel: 'Tata Harrier',             isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 10, vehicleNo: 'MP04XX4174',  vehicleType: 'SUV',          vehicleClass: 'Four_Wheeler',    brandModel: 'Tata Curvv',               isActive: 'Y', isBlacklisted: 'N' },
  { vehicleId: 11, vehicleNo: 'MP04XX4194',  vehicleType: 'SUV',          vehicleClass: 'Four_Wheeler',    brandModel: 'Tata Manza',               isActive: 'N', isBlacklisted: 'N' },
  { vehicleId: 12, vehicleNo: 'MH12KL1234',  vehicleType: 'Car',          vehicleClass: 'Four_Wheeler',    brandModel: 'Honda City',               isActive: 'Y', isBlacklisted: 'N' },
];

// ── Form model ──
interface VehicleForm {
  vehicleNo    : string;
  vehicleType  : string;
  vehicleClass : string;
  brandModel   : string;
  isActive     : string;
  isBlacklisted: string;
}

// ── Issue Pass form model ──
interface IssuePassForm {
  vehicleId        : number | null;
  vehicleNo        : string;
  typeOfVehicle    : string;
  vehicleClass     : string;
  empType          : string;
  employeeNo       : string;
  employeeCompanyNo: string;
  contractorCode   : string;
  dept             : string;
  mobileNo         : string;
  issueDate        : string;
  validityDate     : string;
  gateNo           : string;
  parkingToBeUsed  : string;
  remarks          : string;
}

const EMPTY_FORM = (): VehicleForm => ({
  vehicleNo: '', vehicleType: '', vehicleClass: '',
  brandModel: '', isActive: 'Y', isBlacklisted: 'N',
});

const EMPTY_ISSUE_PASS_FORM = (): IssuePassForm => ({
  vehicleId: null, vehicleNo: '', typeOfVehicle: '', vehicleClass: '',
  empType: 'Company_Employee', employeeNo: '', employeeCompanyNo: '',
  contractorCode: '', dept: '', mobileNo: '',
  issueDate: '', validityDate: '', gateNo: '', parkingToBeUsed: '', remarks: '',
});

@Component({
  selector  : 'app-vehicles',
  standalone: true,
  imports   : [CommonModule, FormsModule],
  templateUrl: './vehicles.html',
  styleUrl  : './vehicles.css',
})
export class Vehicles implements OnInit {
  private readonly API_URL = API_CONFIG.VEHICLES;
  private readonly HEADERS = new HttpHeaders({
    'X-API-KEY'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });

  // ── List state ──
  allVehicles = signal<any[]>([]);
  isLoading   = signal(true);
  hasError    = signal(false);
  isDummy     = USE_DUMMY_DATA;

  // ── Search / Filter / Pagination ──
  searchText   = signal('');
  filterClass  = signal('ALL');
  filterStatus = signal('ALL');
  currentPage  = signal(1);
  pageSize     = signal(10);

  // ── Add/Edit Modal ──
  showModal   = signal(false);
  isEditMode  = signal(false);
  isSaving    = signal(false);
  saveError   = signal('');
  saveSuccess = signal('');
  editId      = signal<number | null>(null);
  form: VehicleForm = EMPTY_FORM();

  // ── Delete Modal ──
  showDeleteModal = signal(false);
  isDeleting      = signal(false);
  deleteError     = signal('');
  deleteTarget    = signal<any>(null);

  // ── Issue Pass Modal ──                        ← NEW
  showIssuePassModal = signal(false);
  isSavingPass       = signal(false);
  issuePassError     = signal('');
  issuePassSuccess   = signal('');
  issuePassForm: IssuePassForm = EMPTY_ISSUE_PASS_FORM();

  constructor(private http: HttpClient) {}
  ngOnInit() { this.loadVehicles(); }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  LOAD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  loadVehicles() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        this.allVehicles.set([...DUMMY_VEHICLES]);
        this.isLoading.set(false);
      }, 400);
      return;
    }

    this.http.get<any[]>(this.API_URL, { headers: this.HEADERS }).subscribe({
      next : (data) => { this.allVehicles.set(data); this.isLoading.set(false); },
      error: ()     => { this.hasError.set(true);    this.isLoading.set(false); },
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
      vehicleNo    : v.vehicleNo,
      vehicleType  : v.vehicleType,
      vehicleClass : v.vehicleClass,
      brandModel   : v.brandModel   || '',
      isActive     : v.isActive,
      isBlacklisted: v.isBlacklisted,
    };
    this.isEditMode.set(true);
    this.editId.set(v.vehicleId);
    this.saveError.set('');
    this.saveSuccess.set('');
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  saveVehicle() {
    if (!this.form.vehicleNo.trim())   { this.saveError.set('Vehicle number is required.'); return; }
    if (!this.form.vehicleType.trim()) { this.saveError.set('Vehicle type is required.');   return; }
    if (!this.form.vehicleClass)       { this.saveError.set('Vehicle class is required.');  return; }

    this.form.vehicleNo = this.form.vehicleNo.toUpperCase().replace(/\s+/g, '');
    this.isSaving.set(true);
    this.saveError.set('');
    this.saveSuccess.set('');

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        if (this.isEditMode()) {
          const idx = DUMMY_VEHICLES.findIndex(v => v.vehicleId === this.editId());
          if (idx > -1) DUMMY_VEHICLES[idx] = { ...DUMMY_VEHICLES[idx], ...this.form };
        } else {
          const newId = Math.max(...DUMMY_VEHICLES.map(v => v.vehicleId)) + 1;
          DUMMY_VEHICLES.push({ vehicleId: newId, ...this.form });
        }
        this.allVehicles.set([...DUMMY_VEHICLES]);
        this.isSaving.set(false);
        this.saveSuccess.set(this.isEditMode() ? 'Vehicle updated!' : 'Vehicle added!');
        setTimeout(() => this.closeModal(), 1200);
      }, 600);
      return;
    }

    if (this.isEditMode()) {
      const updatePayload = {
        vehicleType  : this.form.vehicleType,
        vehicleClass : this.form.vehicleClass,
        brandModel   : this.form.brandModel,
        isActive     : this.form.isActive,
        isBlacklisted: this.form.isBlacklisted,
      };
      this.http.put(`${API_CONFIG.BASE_URL}/api/vehicles/update/${this.editId()}`, updatePayload, { headers: this.HEADERS }).subscribe({
        next : () => { this.isSaving.set(false); this.saveSuccess.set('Vehicle updated successfully!'); this.loadVehicles(); setTimeout(() => this.closeModal(), 1200); },
        error: (err) => { this.isSaving.set(false); this.saveError.set(err?.error?.message || 'Failed to save. Please try again.'); },
      });
    } else {
      this.http.post(API_CONFIG.VEHICLES_REGISTER, this.form, { headers: this.HEADERS }).subscribe({
        next : () => { this.isSaving.set(false); this.saveSuccess.set('Vehicle added successfully!'); this.loadVehicles(); setTimeout(() => this.closeModal(), 1200); },
        error: (err) => { this.isSaving.set(false); this.saveError.set(err?.error?.message || err?.error || 'Failed to save. Please try again.'); },
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

  closeDeleteModal() { this.showDeleteModal.set(false); }

  confirmDelete() {
    const v = this.deleteTarget();
    if (!v) return;

    this.isDeleting.set(true);
    this.deleteError.set('');

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        const idx = DUMMY_VEHICLES.findIndex(x => x.vehicleId === v.vehicleId);
        if (idx > -1) DUMMY_VEHICLES.splice(idx, 1);
        this.allVehicles.set([...DUMMY_VEHICLES]);
        this.isDeleting.set(false);
        this.closeDeleteModal();
      }, 500);
      return;
    }

    this.http.delete(`${API_CONFIG.BASE_URL}/api/vehicles/delete/${v.vehicleId}`, { headers: this.HEADERS, responseType: 'text' }).subscribe({
      next : () => { this.isDeleting.set(false); this.loadVehicles(); this.closeDeleteModal(); },
      error: (err) => { this.isDeleting.set(false); this.deleteError.set(err?.error?.message || 'Delete failed. Please try again.'); },
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  ISSUE PASS MODAL                         ← NEW SECTION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  openIssuePassModal(v: any) {
    // Guard: prevent issuing pass for blacklisted vehicle
    if (v.isBlacklisted === 'Y') {
      alert(`Vehicle ${v.vehicleNo} is blacklisted. Pass cannot be issued.`);
      return;
    }

    // Pre-fill vehicle data from the row — user only fills person + pass details
    this.issuePassForm = {
      ...EMPTY_ISSUE_PASS_FORM(),
      vehicleId    : v.vehicleId,
      vehicleNo    : v.vehicleNo,
      typeOfVehicle: v.vehicleType   || '',
      vehicleClass : v.vehicleClass  || '',
    };

    this.issuePassError.set('');
    this.issuePassSuccess.set('');
    this.isSavingPass.set(false);
    this.showIssuePassModal.set(true);
  }

  closeIssuePassModal() { this.showIssuePassModal.set(false); }

 submitIssuePass() {
  // ── Validation ──
  if (!this.issuePassForm.issueDate)    { this.issuePassError.set('Issue Date is required.');    return; }
  if (!this.issuePassForm.validityDate) { this.issuePassError.set('Validity Date is required.'); return; }
  if (!this.issuePassForm.gateNo)       { this.issuePassError.set('Gate No is required.');       return; }
  if (this.issuePassForm.empType === 'Company_Employee' && !this.issuePassForm.employeeNo.trim()) {
    this.issuePassError.set('Employee No is required.'); return;
  }
  if (this.issuePassForm.empType === 'Contractor' && !this.issuePassForm.contractorCode.trim()) {
    this.issuePassError.set('Contractor Code is required.'); return;
  }

  this.isSavingPass.set(true);
  this.issuePassError.set('');

  // ── Payload — matches Pass Registry / Vehicle_Pass_Registry table columns ──
  const payload: any = {
    vehicleId        : this.issuePassForm.vehicleId,
    typeOfVehicle    : this.issuePassForm.typeOfVehicle,
    empType          : this.issuePassForm.empType,
    issueDate        : this.issuePassForm.issueDate,
    validityDate     : this.issuePassForm.validityDate,
    gateNo           : this.issuePassForm.gateNo,
    parkingToBeUsed  : this.issuePassForm.parkingToBeUsed  || null,
    passStatus       : 'Active',
    isActive         : 'Y',
    remarks          : this.issuePassForm.remarks          || null,
  };

  // Conditionally add person fields based on type
  if (this.issuePassForm.empType === 'Company_Employee') {
    payload.employeeNo        = this.issuePassForm.employeeNo        || null;
    payload.employeeCompanyNo = this.issuePassForm.employeeCompanyNo || null;
    payload.dept              = this.issuePassForm.dept              || null;
    payload.mobileNo          = this.issuePassForm.mobileNo          || null;
    payload.contractorCode    = null;
  } else {
    payload.contractorCode    = this.issuePassForm.contractorCode    || null;
    payload.dept              = this.issuePassForm.dept              || null;
    payload.mobileNo          = this.issuePassForm.mobileNo          || null;
    payload.employeeNo        = null;
    payload.employeeCompanyNo = null;
  }

  // ── DUMMY MODE ──
  if (USE_DUMMY_DATA) {
    setTimeout(() => {
      this.issuePassSuccess.set(`✅ Pass issued successfully for ${this.issuePassForm.vehicleNo}!`);
      this.isSavingPass.set(false);
      setTimeout(() => this.closeIssuePassModal(), 1400);
    }, 600);
    return;
  }

  // ── LIVE API → POST to Pass Registry ──
  console.log('📤 Submitting Issue Pass payload:', payload);  // ← helps debug

  this.http.post(API_CONFIG.PASSES_ISSUE, payload, { headers: this.HEADERS }).subscribe({
    next: (res: any) => {
      console.log('✅ Pass issued response:', res);
      this.issuePassSuccess.set(`✅ Pass issued successfully for ${this.issuePassForm.vehicleNo}!`);
      this.isSavingPass.set(false);
      setTimeout(() => this.closeIssuePassModal(), 1400);
    },
    error: (err: any) => {
      // ── Log exact backend error for debugging ──
      console.error('❌ Issue Pass API Error:', err);
      console.error('❌ Error body:', err?.error);
      console.error('❌ Status:', err?.status);

      // Show specific backend message if available
      const msg = err?.error?.message
        || err?.error?.error
        || err?.error
        || `Server error ${err?.status || ''}. Check console for details.`;

      this.issuePassError.set(typeof msg === 'string' ? msg : JSON.stringify(msg));
      this.isSavingPass.set(false);
    },
  });
}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  FILTER & PAGINATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  get filteredVehicles() {
    let list = this.allVehicles();
    const s  = this.searchText().toLowerCase();
    if (s) {
      list = list.filter(v =>
        v.vehicleNo?.toLowerCase().includes(s) ||
        v.vehicleType?.toLowerCase().includes(s) ||
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

  goToPage     (p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }
  onSearch     (val: string) { this.searchText.set(val);   this.currentPage.set(1); }
  onFilterClass(val: string) { this.filterClass.set(val);  this.currentPage.set(1); }
  onFilterStatus(val: string){ this.filterStatus.set(val); this.currentPage.set(1); }
  onPageSize   (val: string) { this.pageSize.set(+val);    this.currentPage.set(1); }

  getStatusClass(v: string) { return v === 'Y' ? 'badge green' : 'badge red'; }
  getStatusText (v: string) { return v === 'Y' ? 'ACTIVE'      : 'INACTIVE';  }
  getBlackClass (v: string) { return v === 'Y' ? 'badge red'   : 'badge grey';}
}