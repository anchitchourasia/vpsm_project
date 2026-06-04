import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

// ══════════════════════════════════════════════════════════════
//  🔧 DUMMY DATA SWITCH
//  true  = dummy data (backend off)
//  false = live API
// ══════════════════════════════════════════════════════════════
const USE_DUMMY_DATA = false;

// Oracle 10g can be slow — abort if no response in 12 seconds
const HTTP_TIMEOUT_MS = 12000;

const DUMMY_VEHICLES: any[] = [
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

// ── Interfaces ──
interface VehicleForm {
  vehicleNo    : string;
  vehicleType  : string;
  vehicleClass : string;
  brandModel   : string;
  isActive     : string;
  isBlacklisted: string;
}

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

interface IssuePassErrors {
  issueDate        : string;
  validityDate     : string;
  gateNo           : string;
  employeeNo       : string;
  contractorCode   : string;
  mobileNo         : string;
  remarks          : string;
  dept             : string;
  employeeCompanyNo: string;
  parkingToBeUsed  : string;
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

const EMPTY_PASS_ERRORS = (): IssuePassErrors => ({
  issueDate: '', validityDate: '', gateNo: '',
  employeeNo: '', contractorCode: '', mobileNo: '',
  remarks: '', dept: '', employeeCompanyNo: '', parkingToBeUsed: '',
});

@Component({
  selector   : 'app-vehicles',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './vehicles.html',
  styleUrl   : './vehicles.css',
})
export class Vehicles implements OnInit, OnDestroy {
  private readonly API_URL = API_CONFIG.VEHICLES;

  // ✅ FIX: lowercase 'x-api-key' — uppercase 'X-API-KEY' was breaking the API in wpfix
  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });

  // Cancels all HTTP calls on component destroy — prevents ghost requests to Oracle
  private readonly destroy$ = new Subject<void>();

  readonly todayStr = new Date().toISOString().split('T')[0];

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

  // ── Issue Pass Modal ──
  showIssuePassModal = signal(false);
  isSavingPass       = signal(false);
  issuePassError     = signal('');
  issuePassSuccess   = signal('');
  issuePassForm: IssuePassForm    = EMPTY_ISSUE_PASS_FORM();
  passFieldErrors: IssuePassErrors = EMPTY_PASS_ERRORS();

  constructor(private http: HttpClient) {}
  ngOnInit()    { this.loadVehicles(); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  LOAD — called only on init + retry
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

    this.http
      .get<any[]>(this.API_URL, { headers: this.HEADERS, observe: 'response' })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(() => {
          this.hasError.set(true);
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe((response: HttpResponse<any[]> | null) => {
        if (!response) return;
        this.allVehicles.set(
          response.status === 204 || !response.body ? [] : response.body
        );
        this.isLoading.set(false);
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
      brandModel   : v.brandModel || '',
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
    if (this.isSaving()) return; // guard: no double-click sending two requests

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
      this.http
        .put(`${API_CONFIG.BASE_URL}/api/vehicles/update/${this.editId()}`, updatePayload, { headers: this.HEADERS })
        .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
          catchError(err => { this.isSaving.set(false); this.saveError.set(err?.error?.message || 'Update failed.'); return of(null); })
        )
        .subscribe(res => {
          if (res === null) return;
          this.isSaving.set(false);
          this.saveSuccess.set('Vehicle updated successfully!');
          // Local update — no extra GET to backend
          const list = this.allVehicles();
          const idx  = list.findIndex(v => v.vehicleId === this.editId());
          if (idx > -1) { list[idx] = { ...list[idx], ...updatePayload }; this.allVehicles.set([...list]); }
          setTimeout(() => this.closeModal(), 1200);
        });
    } else {
      this.http
        .post(API_CONFIG.VEHICLES_REGISTER, this.form, { headers: this.HEADERS })
        .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
          catchError(err => { this.isSaving.set(false); this.saveError.set(err?.error?.message || err?.error || 'Add failed.'); return of(null); })
        )
        .subscribe((saved: any) => {
          if (!saved) return;
          this.isSaving.set(false);
          this.saveSuccess.set('Vehicle added successfully!');
          // Append returned object — no extra GET
          this.allVehicles.set([...this.allVehicles(), saved]);
          setTimeout(() => this.closeModal(), 1200);
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
    if (!v || this.isDeleting()) return; // guard: no double-click

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

    this.http
      .delete(`${API_CONFIG.BASE_URL}/api/vehicles/delete/${v.vehicleId}`, { headers: this.HEADERS, responseType: 'text' })
      .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => { this.isDeleting.set(false); this.deleteError.set(err?.error?.message || 'Delete failed.'); return of(null); })
      )
      .subscribe(res => {
        if (res === null) return;
        this.isDeleting.set(false);
        // Remove locally — no extra GET to backend
        this.allVehicles.set(this.allVehicles().filter(x => x.vehicleId !== v.vehicleId));
        this.closeDeleteModal();
      });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  ISSUE PASS MODAL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  openIssuePassModal(v: any) {
    if (v.isBlacklisted === 'Y') {
      alert(`⛔ Vehicle ${v.vehicleNo} is blacklisted. Pass cannot be issued.`);
      return;
    }
    if (v.isActive === 'N') {
      alert(`⚠️ Vehicle ${v.vehicleNo} is inactive. Pass cannot be issued.`);
      return;
    }
    this.issuePassForm = {
      ...EMPTY_ISSUE_PASS_FORM(),
      vehicleId    : v.vehicleId,
      vehicleNo    : v.vehicleNo,
      typeOfVehicle: v.vehicleType  || '',
      vehicleClass : v.vehicleClass || '',
    };
    this.passFieldErrors = EMPTY_PASS_ERRORS();
    this.issuePassError.set('');
    this.issuePassSuccess.set('');
    this.isSavingPass.set(false);
    this.showIssuePassModal.set(true);
  }

  closeIssuePassModal() {
    this.showIssuePassModal.set(false);
    this.passFieldErrors = EMPTY_PASS_ERRORS();
    this.issuePassError.set('');
    this.issuePassSuccess.set('');
  }

  clearPassError(field: keyof IssuePassErrors) {
    this.passFieldErrors[field] = '';
    this.issuePassError.set('');
  }

  onEmpTypeChange() {
    this.issuePassForm.employeeNo        = '';
    this.issuePassForm.employeeCompanyNo = '';
    this.issuePassForm.contractorCode    = '';
    this.passFieldErrors.employeeNo      = '';
    this.passFieldErrors.contractorCode  = '';
    this.passFieldErrors.employeeCompanyNo = '';
    this.issuePassError.set('');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  AUTO-UPPERCASE HANDLERS
  //  Each maps to exact VARCHAR2 column — converts as user types
  //  Uses [ngModel] + (input) pattern to avoid cursor-jump bug
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onEmployeeNoInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v  = el.value.toUpperCase().replace(/\s+/g, '');
    this.issuePassForm.employeeNo = v; el.value = v;
    this.clearPassError('employeeNo');
  }

  onEmployeeCompanyNoInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v  = el.value.toUpperCase().replace(/\s+/g, '');
    this.issuePassForm.employeeCompanyNo = v; el.value = v;
    this.clearPassError('employeeCompanyNo');
  }

  onContractorCodeInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v  = el.value.toUpperCase().replace(/\s+/g, '');
    this.issuePassForm.contractorCode = v; el.value = v;
    this.clearPassError('contractorCode');
  }

  onDeptInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v  = el.value.toUpperCase(); // spaces allowed in dept
    this.issuePassForm.dept = v; el.value = v;
    this.clearPassError('dept');
  }

  onParkingInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v  = el.value.toUpperCase();
    this.issuePassForm.parkingToBeUsed = v; el.value = v;
    this.clearPassError('parkingToBeUsed');
  }

  onMobileNoInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v  = el.value.replace(/\D/g, '').slice(0, 15); // digits only, max 15
    this.issuePassForm.mobileNo = v; el.value = v;
    this.clearPassError('mobileNo');
  }

  // Real-time submit button disable — checks all SQL NOT NULL + constraints
  get isPassFormInvalid(): boolean {
    const f = this.issuePassForm;
    if (!f.issueDate)                                                    return true;
    if (!f.validityDate)                                                 return true;
    if (f.issueDate && f.validityDate && f.validityDate <= f.issueDate) return true;
    if (!f.gateNo.trim())                                                return true;
    if (f.empType === 'Company_Employee' && !f.employeeNo.trim())       return true;
    if (f.empType === 'Contractor'       && !f.contractorCode.trim())   return true;
    if (f.mobileNo && !/^\d{1,15}$/.test(f.mobileNo))                  return true;
    if (f.remarks && f.remarks.length > 200)                            return true;
    if (f.dept    && f.dept.length    > 50)                             return true;
    return false;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  SUBMIT ISSUE PASS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  submitIssuePass() {
    if (this.isSavingPass()) return; // guard: no double-submit

    this.passFieldErrors = EMPTY_PASS_ERRORS();
    this.issuePassError.set('');
    const f = this.issuePassForm;
    let hasError = false;

    if (!f.issueDate)    { this.passFieldErrors.issueDate    = 'Issue Date is required.';    hasError = true; }
    if (!f.validityDate) { this.passFieldErrors.validityDate = 'Validity Date is required.'; hasError = true; }
    if (f.issueDate && f.validityDate && f.validityDate <= f.issueDate)
                         { this.passFieldErrors.validityDate = 'Must be after Issue Date.';  hasError = true; }
    if (!f.gateNo.trim()) { this.passFieldErrors.gateNo      = 'Gate No is required.';       hasError = true; }
    if (f.empType === 'Company_Employee' && !f.employeeNo.trim())
                         { this.passFieldErrors.employeeNo   = 'Employee No is required.';   hasError = true; }
    if (f.empType === 'Contractor' && !f.contractorCode.trim())
                         { this.passFieldErrors.contractorCode = 'Contractor Code required.';hasError = true; }
    if (f.mobileNo && !/^\d{1,15}$/.test(f.mobileNo))
                         { this.passFieldErrors.mobileNo     = 'Digits only, max 15.';       hasError = true; }
    if (f.remarks && f.remarks.length > 200)
                         { this.passFieldErrors.remarks       = `Too long (${f.remarks.length}/200).`; hasError = true; }
    if (f.dept && f.dept.length > 50)
                         { this.passFieldErrors.dept          = `Too long (${f.dept.length}/50).`;     hasError = true; }
    if (hasError) return;

    this.isSavingPass.set(true);

    // ── Payload: camelCase matches PassRegistry.java getters exactly ──
    // vehicle sent as nested object — @ManyToOne in PassRegistry.java
    const payload: any = {
      vehicle          : { vehicleId: f.vehicleId },
      typeOfVehicle    : f.typeOfVehicle    || null,
      empType          : f.empType,
      issueDate        : f.issueDate,
      validityDate     : f.validityDate,
      gateNo           : f.gateNo.toUpperCase().trim(),
      parkingToBeUsed  : f.parkingToBeUsed  ? f.parkingToBeUsed.toUpperCase()  : null,
      status           : 'Active',
      isActive         : 'Y',
      remarks          : f.remarks          || null,
      dept             : f.dept             || null,
      mobileNo         : f.mobileNo         || null,
      enterBy          : 'ADMIN',
      enterDate        : new Date().toISOString().split('T')[0],
      employeeNo       : f.empType === 'Company_Employee' ? (f.employeeNo.toUpperCase().trim()        || null) : null,
      employeeCompanyNo: f.empType === 'Company_Employee' ? (f.employeeCompanyNo.toUpperCase().trim() || null) : null,
      contractorCode   : f.empType === 'Contractor'       ? (f.contractorCode.toUpperCase().trim()    || null) : null,
    };

    console.log('📤 Issue Pass payload:', JSON.stringify(payload, null, 2));

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        this.issuePassSuccess.set(`✅ Pass issued for ${f.vehicleNo}!`);
        this.isSavingPass.set(false);
        setTimeout(() => this.closeIssuePassModal(), 1400);
      }, 600);
      return;
    }

    this.http
      .post(API_CONFIG.PASSES_ISSUE, payload, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError((err: any) => {
          console.error('❌ Issue Pass error:', err);
          const msg =
            (typeof err?.error === 'string' ? err.error : null) ||
            err?.error?.message ||
            JSON.stringify(err?.error) ||
            `Server error ${err?.status}`;
          this.issuePassError.set(msg);
          this.isSavingPass.set(false);
          return of(null);
        })
      )
      .subscribe((res: any) => {
        if (!res) return;
        console.log('✅ Pass issued:', res);
        this.issuePassSuccess.set(`✅ Pass issued successfully for ${f.vehicleNo}!`);
        this.isSavingPass.set(false);
        setTimeout(() => this.closeIssuePassModal(), 1400);
      });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  FILTER & PAGINATION — pure frontend, zero API calls
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  get filteredVehicles() {
    let list = this.allVehicles();
    const s  = this.searchText().toLowerCase();
    if (s) list = list.filter(v =>
      v.vehicleNo?.toLowerCase().includes(s)   ||
      v.vehicleType?.toLowerCase().includes(s) ||
      v.brandModel?.toLowerCase().includes(s)
    );
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

  goToPage      (p: number)   { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }
  onSearch      (val: string) { this.searchText.set(val);   this.currentPage.set(1); }
  onFilterClass (val: string) { this.filterClass.set(val);  this.currentPage.set(1); }
  onFilterStatus(val: string) { this.filterStatus.set(val); this.currentPage.set(1); }
  onPageSize    (val: string) { this.pageSize.set(+val);    this.currentPage.set(1); }

  getStatusClass(v: string) { return v === 'Y' ? 'badge green' : 'badge red';  }
  getStatusText (v: string) { return v === 'Y' ? 'ACTIVE'      : 'INACTIVE';   }
  getBlackClass (v: string) { return v === 'Y' ? 'badge red'   : 'badge grey'; }
}