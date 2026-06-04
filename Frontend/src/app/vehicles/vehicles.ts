import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

const USE_DUMMY_DATA = false;
const HTTP_TIMEOUT_MS = 12000;

// Employee lookup array index positions (from Postman)
// [empNo, name, salary, managerId, email, deptId, deptName]
const EMP_IDX = { empNo: 0, name: 1, salary: 2, email: 4, deptName: 6 };

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
];

interface VehicleForm {
  vehicleNo    : string;
  vehicleType  : string;
  vehicleClass : string;
  brandModel   : string;
  isActive     : string;
  isBlacklisted: string;
}

// ✅ UPDATED: employeeCompanyNo → empName, mobileNo → salary
interface IssuePassForm {
  vehicleId      : number | null;
  vehicleNo      : string;
  typeOfVehicle  : string;
  vehicleClass   : string;
  empType        : string;
  employeeNo     : string;
  empName        : string;   // was: employeeCompanyNo (EC No) → now NAME
  salary         : string;   // was: mobileNo → now SALARY
  contractorCode : string;
  dept           : string;
  issueDate      : string;
  validityDate   : string;
  gateNo         : string;
  parkingToBeUsed: string;
  remarks        : string;
}

interface IssuePassErrors {
  issueDate      : string;
  validityDate   : string;
  gateNo         : string;
  employeeNo     : string;
  contractorCode : string;
  salary         : string;
  remarks        : string;
  dept           : string;
  empName        : string;
  parkingToBeUsed: string;
}

const EMPTY_FORM = (): VehicleForm => ({
  vehicleNo: '', vehicleType: '', vehicleClass: '',
  brandModel: '', isActive: 'Y', isBlacklisted: 'N',
});

const EMPTY_ISSUE_PASS_FORM = (): IssuePassForm => ({
  vehicleId: null, vehicleNo: '', typeOfVehicle: '', vehicleClass: '',
  empType: 'Company_Employee', employeeNo: '', empName: '', salary: '',
  contractorCode: '', dept: '',
  issueDate: '', validityDate: '', gateNo: '', parkingToBeUsed: '', remarks: '',
});

const EMPTY_PASS_ERRORS = (): IssuePassErrors => ({
  issueDate: '', validityDate: '', gateNo: '',
  employeeNo: '', contractorCode: '', salary: '',
  remarks: '', dept: '', empName: '', parkingToBeUsed: '',
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
  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });
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

  // ── Issue Pass / Raise Request Modal ──
  showIssuePassModal = signal(false);
  isSavingPass       = signal(false);
  issuePassError     = signal('');
  issuePassSuccess   = signal('');
  issuePassForm: IssuePassForm    = EMPTY_ISSUE_PASS_FORM();
  passFieldErrors: IssuePassErrors = EMPTY_PASS_ERRORS();

  // ✅ NEW: Employee lookup state
  isLookingUpEmp = signal(false);
  empLookupError = signal('');
  empLookupDone  = signal(false);

  // ✅ NEW: Vehicle Documents state (shown inside Raise Request modal)
  vehicleDocs      = signal<any[]>([]);
  isLoadingDocs    = signal(false);

  constructor(private http: HttpClient) {}
  ngOnInit()    { this.loadVehicles(); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  LOAD VEHICLES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  loadVehicles() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      setTimeout(() => { this.allVehicles.set([...DUMMY_VEHICLES]); this.isLoading.set(false); }, 400);
      return;
    }

    this.http
      .get<any[]>(this.API_URL, { headers: this.HEADERS, observe: 'response' })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(() => { this.hasError.set(true); this.isLoading.set(false); return of(null); })
      )
      .subscribe((response: HttpResponse<any[]> | null) => {
        if (!response) return;
        this.allVehicles.set(response.status === 204 || !response.body ? [] : response.body);
        this.isLoading.set(false);
      });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  ADD / EDIT VEHICLE MODAL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  openAddModal() {
    this.form = EMPTY_FORM(); this.isEditMode.set(false);
    this.editId.set(null); this.saveError.set(''); this.saveSuccess.set('');
    this.showModal.set(true);
  }

  openEditModal(v: any) {
    this.form = {
      vehicleNo: v.vehicleNo, vehicleType: v.vehicleType,
      vehicleClass: v.vehicleClass, brandModel: v.brandModel || '',
      isActive: v.isActive, isBlacklisted: v.isBlacklisted,
    };
    this.isEditMode.set(true); this.editId.set(v.vehicleId);
    this.saveError.set(''); this.saveSuccess.set('');
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  saveVehicle() {
    if (!this.form.vehicleNo.trim())   { this.saveError.set('Vehicle number is required.'); return; }
    if (!this.form.vehicleType.trim()) { this.saveError.set('Vehicle type is required.');   return; }
    if (!this.form.vehicleClass)       { this.saveError.set('Vehicle class is required.');  return; }
    if (this.isSaving()) return;

    this.form.vehicleNo = this.form.vehicleNo.toUpperCase().replace(/\s+/g, '');
    this.isSaving.set(true); this.saveError.set(''); this.saveSuccess.set('');

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        if (this.isEditMode()) {
          const idx = DUMMY_VEHICLES.findIndex(v => v.vehicleId === this.editId());
          if (idx > -1) DUMMY_VEHICLES[idx] = { ...DUMMY_VEHICLES[idx], ...this.form };
        } else {
          DUMMY_VEHICLES.push({ vehicleId: Math.max(...DUMMY_VEHICLES.map(v => v.vehicleId)) + 1, ...this.form });
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
        vehicleType: this.form.vehicleType, vehicleClass: this.form.vehicleClass,
        brandModel: this.form.brandModel, isActive: this.form.isActive, isBlacklisted: this.form.isBlacklisted,
      };
      this.http.put(`${API_CONFIG.BASE_URL}/api/vehicles/update/${this.editId()}`, updatePayload, { headers: this.HEADERS })
        .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
          catchError(err => { this.isSaving.set(false); this.saveError.set(err?.error?.message || 'Update failed.'); return of(null); }))
        .subscribe(res => {
          if (res === null) return;
          this.isSaving.set(false); this.saveSuccess.set('Vehicle updated successfully!');
          const list = this.allVehicles(); const idx = list.findIndex(v => v.vehicleId === this.editId());
          if (idx > -1) { list[idx] = { ...list[idx], ...updatePayload }; this.allVehicles.set([...list]); }
          setTimeout(() => this.closeModal(), 1200);
        });
    } else {
      this.http.post(API_CONFIG.VEHICLES_REGISTER, this.form, { headers: this.HEADERS })
        .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
          catchError(err => { this.isSaving.set(false); this.saveError.set(err?.error?.message || err?.error || 'Add failed.'); return of(null); }))
        .subscribe((saved: any) => {
          if (!saved) return;
          this.isSaving.set(false); this.saveSuccess.set('Vehicle added successfully!');
          this.allVehicles.set([...this.allVehicles(), saved]);
          setTimeout(() => this.closeModal(), 1200);
        });
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  DELETE MODAL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  openDeleteModal(v: any) { this.deleteTarget.set(v); this.deleteError.set(''); this.showDeleteModal.set(true); }
  closeDeleteModal()      { this.showDeleteModal.set(false); }

  confirmDelete() {
    const v = this.deleteTarget();
    if (!v || this.isDeleting()) return;
    this.isDeleting.set(true); this.deleteError.set('');

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        const idx = DUMMY_VEHICLES.findIndex(x => x.vehicleId === v.vehicleId);
        if (idx > -1) DUMMY_VEHICLES.splice(idx, 1);
        this.allVehicles.set([...DUMMY_VEHICLES]);
        this.isDeleting.set(false); this.closeDeleteModal();
      }, 500);
      return;
    }

    this.http.delete(`${API_CONFIG.BASE_URL}/api/vehicles/delete/${v.vehicleId}`, { headers: this.HEADERS, responseType: 'text' })
      .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => { this.isDeleting.set(false); this.deleteError.set(err?.error?.message || 'Delete failed.'); return of(null); }))
      .subscribe(res => {
        if (res === null) return;
        this.isDeleting.set(false);
        this.allVehicles.set(this.allVehicles().filter(x => x.vehicleId !== v.vehicleId));
        this.closeDeleteModal();
      });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  RAISE REQUEST MODAL (was: Issue Pass)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  openIssuePassModal(v: any) {
    if (v.isBlacklisted === 'Y') {
      alert(`⛔ Vehicle ${v.vehicleNo} is blacklisted. Pass cannot be raised.`);
      return;
    }
    if (v.isActive === 'N') {
      alert(`⚠️ Vehicle ${v.vehicleNo} is inactive. Pass cannot be raised.`);
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
    this.isLookingUpEmp.set(false);
    this.empLookupError.set('');
    this.empLookupDone.set(false);
    this.vehicleDocs.set([]);

    // ✅ Load this vehicle's documents immediately when modal opens
    this.loadVehicleDocs(v.vehicleId);

    this.showIssuePassModal.set(true);
  }

  closeIssuePassModal() {
    this.showIssuePassModal.set(false);
    this.passFieldErrors = EMPTY_PASS_ERRORS();
    this.issuePassError.set('');
    this.issuePassSuccess.set('');
    this.empLookupError.set('');
    this.empLookupDone.set(false);
    this.vehicleDocs.set([]);
  }

  // ✅ NEW: Load documents for this specific vehicleId — 1 GET, filter client-side
  loadVehicleDocs(vehicleId: number) {
    this.isLoadingDocs.set(true);

    if (USE_DUMMY_DATA) {
      setTimeout(() => { this.vehicleDocs.set([]); this.isLoadingDocs.set(false); }, 300);
      return;
    }

    this.http
      .get<any[]>(API_CONFIG.DOCUMENTS, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(() => { this.isLoadingDocs.set(false); return of([]); })
      )
      .subscribe((docs: any[]) => {
        // Filter client-side — no extra backend endpoint needed
        this.vehicleDocs.set((docs || []).filter(d => d.vehicle?.vehicleId === vehicleId));
        this.isLoadingDocs.set(false);
      });
  }

  // ✅ NEW: Auto-fill Name, Dept, Salary on Employee No blur
  onEmployeeNoBlur() {
    const empNo = this.issuePassForm.employeeNo.trim();
    if (!empNo || this.issuePassForm.empType !== 'Company_Employee') return;

    this.isLookingUpEmp.set(true);
    this.empLookupError.set('');
    this.empLookupDone.set(false);
    // Reset auto-filled fields
    this.issuePassForm.empName = '';
    this.issuePassForm.dept    = '';
    this.issuePassForm.salary  = '';

    this.http
      .get<any[]>(`${API_CONFIG.BASE_URL}/api/reports/employee-department`, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(() => {
          this.isLookingUpEmp.set(false);
          this.empLookupError.set('⚠️ Employee lookup failed. Fill manually.');
          return of([]);
        })
      )
      .subscribe((rows: any[]) => {
        this.isLookingUpEmp.set(false);
        // Array format: [empNo, name, salary, managerId, email, deptId, deptName]
        const match = rows.find(r => String(r[EMP_IDX.empNo]) === empNo);
        if (match) {
          this.issuePassForm.empName = String(match[EMP_IDX.name]    || '');
          this.issuePassForm.dept    = String(match[EMP_IDX.deptName]|| '').toUpperCase();
          this.issuePassForm.salary  = String(match[EMP_IDX.salary]  || '');
          this.empLookupDone.set(true);
          this.empLookupError.set('');
        } else {
          this.empLookupError.set(`⚠️ Employee No "${empNo}" not found.`);
        }
      });
  }

  clearPassError(field: keyof IssuePassErrors) {
    this.passFieldErrors[field] = '';
    this.issuePassError.set('');
  }

  onEmpTypeChange() {
    this.issuePassForm.employeeNo    = '';
    this.issuePassForm.empName       = '';
    this.issuePassForm.contractorCode = '';
    this.issuePassForm.dept          = '';
    this.issuePassForm.salary        = '';
    this.passFieldErrors.employeeNo  = '';
    this.passFieldErrors.contractorCode = '';
    this.passFieldErrors.empName     = '';
    this.empLookupError.set('');
    this.empLookupDone.set(false);
    this.issuePassError.set('');
  }

  onEmployeeNoInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v  = el.value.toUpperCase().replace(/\s+/g, '');
    this.issuePassForm.employeeNo = v; el.value = v;
    // Reset auto-filled when emp no changes
    this.issuePassForm.empName = '';
    this.issuePassForm.dept    = '';
    this.issuePassForm.salary  = '';
    this.empLookupDone.set(false);
    this.empLookupError.set('');
    this.clearPassError('employeeNo');
  }

  onContractorCodeInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v  = el.value.toUpperCase().replace(/\s+/g, '');
    this.issuePassForm.contractorCode = v; el.value = v;
    this.clearPassError('contractorCode');
  }

  onDeptInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v  = el.value.toUpperCase();
    this.issuePassForm.dept = v; el.value = v;
    this.clearPassError('dept');
  }

  onParkingInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const v  = el.value.toUpperCase();
    this.issuePassForm.parkingToBeUsed = v; el.value = v;
    this.clearPassError('parkingToBeUsed');
  }

  get isPassFormInvalid(): boolean {
    const f = this.issuePassForm;
    if (!f.issueDate)                                                    return true;
    if (!f.validityDate)                                                 return true;
    if (f.issueDate && f.validityDate && f.validityDate <= f.issueDate) return true;
    if (!f.gateNo.trim())                                                return true;
    if (f.empType === 'Company_Employee' && !f.employeeNo.trim())       return true;
    if (f.empType === 'Contractor'       && !f.contractorCode.trim())   return true;
    if (f.remarks && f.remarks.length > 200)                            return true;
    return false;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  SUBMIT RAISE REQUEST
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  submitIssuePass() {
    if (this.isSavingPass()) return;

    this.passFieldErrors = EMPTY_PASS_ERRORS();
    this.issuePassError.set('');
    const f = this.issuePassForm;
    let hasError = false;

    if (!f.issueDate)    { this.passFieldErrors.issueDate    = 'Issue Date is required.';    hasError = true; }
    if (!f.validityDate) { this.passFieldErrors.validityDate = 'Validity Date is required.'; hasError = true; }
    if (f.issueDate && f.validityDate && f.validityDate <= f.issueDate)
                         { this.passFieldErrors.validityDate = 'Must be after Issue Date.';  hasError = true; }
    if (!f.gateNo.trim()) { this.passFieldErrors.gateNo     = 'Gate No is required.';       hasError = true; }
    if (f.empType === 'Company_Employee' && !f.employeeNo.trim())
                         { this.passFieldErrors.employeeNo   = 'Employee No is required.';   hasError = true; }
    if (f.empType === 'Contractor' && !f.contractorCode.trim())
                         { this.passFieldErrors.contractorCode = 'Contractor Code required.'; hasError = true; }
    if (f.remarks && f.remarks.length > 200)
                         { this.passFieldErrors.remarks = `Too long (${f.remarks.length}/200).`; hasError = true; }
    if (hasError) return;

    this.isSavingPass.set(true);

    // ✅ Payload: salary → mobileNo field in DB (as agreed — pass registry keeps mobileNo col)
    const payload: any = {
      vehicle          : { vehicleId: f.vehicleId },
      typeOfVehicle    : f.typeOfVehicle    || null,
      empType          : f.empType,
      issueDate        : f.issueDate,
      validityDate     : f.validityDate,
      gateNo           : f.gateNo.toUpperCase().trim(),
      parkingToBeUsed  : f.parkingToBeUsed  ? f.parkingToBeUsed.toUpperCase() : null,
      status           : 'Active',
      isActive         : 'Y',
      remarks          : f.remarks          || null,
      dept             : f.dept             || null,
      // ✅ mobileNo col in DB stores salary for company employees
      mobileNo         : f.salary           || null,
      enterBy          : 'ADMIN',
      enterDate        : new Date().toISOString().split('T')[0],
      employeeNo       : f.empType === 'Company_Employee' ? (f.employeeNo.toUpperCase().trim()    || null) : null,
      // ✅ employeeCompanyNo col stores the auto-filled employee name
      employeeCompanyNo: f.empType === 'Company_Employee' ? (f.empName.trim() || null)                    : null,
      contractorCode   : f.empType === 'Contractor'       ? (f.contractorCode.toUpperCase().trim() || null) : null,
    };

    console.log('📤 Raise Request payload:', JSON.stringify(payload, null, 2));

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        this.issuePassSuccess.set(`✅ Request raised for ${f.vehicleNo}!`);
        this.isSavingPass.set(false);
        setTimeout(() => this.closeIssuePassModal(), 1400);
      }, 600);
      return;
    }

    this.http
      .post(API_CONFIG.PASSES_ISSUE, payload, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError((err: any) => {
          console.error('❌ Raise Request error:', err);
          const msg =
            (typeof err?.error === 'string' ? err.error : null) ||
            err?.error?.message || JSON.stringify(err?.error) ||
            `Server error ${err?.status}`;
          this.issuePassError.set(msg);
          this.isSavingPass.set(false);
          return of(null);
        })
      )
      .subscribe((res: any) => {
        if (!res) return;
        this.issuePassSuccess.set(`✅ Request raised successfully for ${f.vehicleNo}!`);
        this.isSavingPass.set(false);
        setTimeout(() => this.closeIssuePassModal(), 1400);
      });
  }

  // ── Helpers ──
  formatDocDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }

  getDocStatusClass(expiryDate: string): string {
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0)   return 'badge red';
    if (days <= 30) return 'badge orange';
    return 'badge green';
  }

  getDocStatusText(expiryDate: string): string {
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0)   return `Expired`;
    if (days <= 30) return `${days}d left`;
    return `Valid`;
  }

  // ── Filter / Pagination ──
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

  get pagedVehicles()  { const s = (this.currentPage()-1)*this.pageSize(); return this.filteredVehicles.slice(s, s+this.pageSize()); }
  get totalPages()     { return Math.ceil(this.filteredVehicles.length / this.pageSize()) || 1; }
  get totalPagesArr()  { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  goToPage      (p: number)   { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }
  onSearch      (val: string) { this.searchText.set(val);   this.currentPage.set(1); }
  onFilterClass (val: string) { this.filterClass.set(val);  this.currentPage.set(1); }
  onFilterStatus(val: string) { this.filterStatus.set(val); this.currentPage.set(1); }
  onPageSize    (val: string) { this.pageSize.set(+val);    this.currentPage.set(1); }

  getStatusClass(v: string) { return v === 'Y' ? 'badge green' : 'badge red';  }
  getStatusText (v: string) { return v === 'Y' ? 'ACTIVE'      : 'INACTIVE';   }
  getBlackClass (v: string) { return v === 'Y' ? 'badge red'   : 'badge grey'; }
}