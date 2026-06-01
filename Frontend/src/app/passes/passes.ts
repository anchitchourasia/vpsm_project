import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_CONFIG } from '../core/api.config';

const USE_DUMMY_DATA = false;

const DUMMY_PASSES: any[] = [
  { passId:1,  issueDate:'2024-01-10', validityDate:'2025-01-10', employeeNo:'EMP001', employeeCompanyNo:'HEG001', dept:'Mechanical',  contractorCode:null,    gateNo:'GATE_01', parkingToBeUsed:'P-Block',    vehicleId:1,  typeOfVehicle:'Car',          mobileNo:'9876543210', passStatus:'Active',      empType:'Company_Employee', isActive:'Y', enterBy:'ADMIN', enterDate:'2024-01-10', remarks:'' },
  { passId:2,  issueDate:'2024-02-01', validityDate:'2025-02-01', employeeNo:'EMP002', employeeCompanyNo:'HEG002', dept:'Electrical',   contractorCode:null,    gateNo:'GATE_02', parkingToBeUsed:'A-Block',    vehicleId:2,  typeOfVehicle:'Bike',         mobileNo:'9876500001', passStatus:'Active',      empType:'Company_Employee', isActive:'Y', enterBy:'ADMIN', enterDate:'2024-02-01', remarks:'' },
  { passId:3,  issueDate:'2023-06-01', validityDate:'2024-06-01', employeeNo:null,     employeeCompanyNo:null,     dept:'Construction', contractorCode:'CON001', gateNo:'GATE_03', parkingToBeUsed:'Heavy Yard', vehicleId:3,  typeOfVehicle:'Dumper Truck', mobileNo:'9988776655', passStatus:'Expired',     empType:'Contractor',       isActive:'N', enterBy:'ADMIN', enterDate:'2023-06-01', remarks:'Load permit required' },
  { passId:4,  issueDate:'2024-03-15', validityDate:'2025-03-15', employeeNo:'EMP004', employeeCompanyNo:'HEG004', dept:'Civil',        contractorCode:null,    gateNo:'GATE_01', parkingToBeUsed:'B-Block',    vehicleId:5,  typeOfVehicle:'SUV',          mobileNo:'9800001234', passStatus:'Active',      empType:'Company_Employee', isActive:'Y', enterBy:'ADMIN', enterDate:'2024-03-15', remarks:'' },
  { passId:5,  issueDate:'2024-04-01', validityDate:'2024-12-31', employeeNo:null,     employeeCompanyNo:null,     dept:null,           contractorCode:'CON002', gateNo:'GATE_02', parkingToBeUsed:'Heavy Yard', vehicleId:8,  typeOfVehicle:'Truck',        mobileNo:'9700001111', passStatus:'Surrendered', empType:'Contractor',       isActive:'N', enterBy:'ADMIN', enterDate:'2024-04-01', remarks:'Surrendered early' },
  { passId:6,  issueDate:'2025-01-01', validityDate:'2025-07-01', employeeNo:'EMP006', employeeCompanyNo:'HEG006', dept:'HR',           contractorCode:null,    gateNo:'GATE_01', parkingToBeUsed:'A-Block',    vehicleId:9,  typeOfVehicle:'SUV',          mobileNo:'9600002222', passStatus:'Expiring',    empType:'Company_Employee', isActive:'Y', enterBy:'ADMIN', enterDate:'2025-01-01', remarks:'Renewal due soon' },
  { passId:7,  issueDate:'2025-02-10', validityDate:'2025-08-10', employeeNo:null,     employeeCompanyNo:null,     dept:'Heavy Works',  contractorCode:'CON003', gateNo:'GATE_03', parkingToBeUsed:'Heavy Yard', vehicleId:3,  typeOfVehicle:'Dumper Truck', mobileNo:'9500003333', passStatus:'Expiring',    empType:'Contractor',       isActive:'Y', enterBy:'ADMIN', enterDate:'2025-02-10', remarks:'' },
];

const DUMMY_VEHICLES: any[] = [
  { vehicleId:1,   vehicleType:'Car'          },
  { vehicleId:2,   vehicleType:'Bike'         },
  { vehicleId:3,   vehicleType:'Dumper Truck' },
  { vehicleId:4,   vehicleType:'Scooter'      },
  { vehicleId:5,   vehicleType:'SUV'          },
  { vehicleId:6,   vehicleType:'Sedan'        },
  { vehicleId:7,   vehicleType:'Scooter'      },
  { vehicleId:8,   vehicleType:'Truck'        },
  { vehicleId:9,   vehicleType:'SUV'          },
  { vehicleId:10,  vehicleType:'SUV'          },
  { vehicleId:101, vehicleType:'Bike'         },
];

// ─────────────────────────────────────────────────────────────
//  PassForm — ALL fields use camelCase for Angular form binding
//  The payload mapper below converts to Oracle snake_case DDL
// ─────────────────────────────────────────────────────────────
interface PassForm {
  issueDate        : string;
  validityDate     : string;
  employeeNo       : string;
  employeeCompanyNo: string;
  dept             : string;
  contractorCode   : string;
  gateNo           : string;
  parkingToBeUsed  : string;
  vehicleId        : string;
  typeOfVehicle    : string;
  mobileNo         : string;
  passStatus       : string;   // ← form field; mapped to 'status' in payload
  empType          : string;
  remarks          : string;
  isActive         : string;   // ← 'Y' or 'N'  (Oracle CHAR(1))
}

const EMPTY_FORM = (): PassForm => ({
  issueDate:'', validityDate:'', employeeNo:'', employeeCompanyNo:'',
  dept:'', contractorCode:'', gateNo:'', parkingToBeUsed:'',
  vehicleId:'', typeOfVehicle:'', mobileNo:'',
  passStatus:'Active', empType:'Company_Employee', remarks:'', isActive:'Y',
});

@Component({
  selector   : 'app-passes',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './passes.html',
  styleUrl   : './passes.css',
})
export class Passes implements OnInit {

  private get HEADERS(): HttpHeaders {
    return new HttpHeaders({
      'X-API-KEY'   : API_CONFIG.API_KEY,
      'Content-Type': 'application/json',
    });
  }

  // ── State ──
  private allPassesRaw = signal<any[]>([]);
  isLoading  = signal(true);
  hasError   = signal(false);
  isDummy    = USE_DUMMY_DATA;

  // ── Filters ──
  searchText    = signal('');
  filterStatus  = signal('ALL');
  filterEmpType = signal('ALL');
  currentPage   = signal(1);
  pageSize      = signal(10);

  filteredPasses = computed(() => {
    const q  = this.searchText().toLowerCase();
    const st = this.filterStatus();
    const et = this.filterEmpType();
    return this.allPassesRaw().filter(p => {
      const matchSearch =
        !q ||
        (p.employeeNo     || '').toLowerCase().includes(q) ||
        (p.contractorCode || '').toLowerCase().includes(q) ||
        (p.dept           || '').toLowerCase().includes(q) ||
        (p.mobileNo       || '').toLowerCase().includes(q) ||
        String(p.passId   || '').includes(q);
      // support both 'status' (Oracle) and 'passStatus' (dummy/legacy)
      const rowStatus    = p.status || p.passStatus || '';
      const matchStatus  = st === 'ALL' || rowStatus === st;
      const matchEmpType = et === 'ALL' || (p.empType || '') === et;
      return matchSearch && matchStatus && matchEmpType;
    });
  });

  pagedPasses = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredPasses().slice(start, start + this.pageSize());
  });

  get totalPages(): number    { return Math.max(1, Math.ceil(this.filteredPasses().length / this.pageSize())); }
  get totalPagesArr(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  // ── Modal State ──
  showModal   = signal(false);
  isEditMode  = signal(false);
  isSaving    = signal(false);
  saveError   = signal('');
  saveSuccess = signal('');
  editId      = signal<number | null>(null);
  form: PassForm = EMPTY_FORM();

  // ── Vehicle Lookup ──
  vehicleLookupError   = signal('');
  vehicleLookupSuccess = signal('');
  isLookingUp          = signal(false);

  // ── View Modal ──
  showViewModal = signal(false);
  viewPass      = signal<any>(null);

  constructor(private http: HttpClient) {}
  ngOnInit() { this.loadPasses(); }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  GET → /api/passes/list
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  loadPasses() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      setTimeout(() => { this.allPassesRaw.set([...DUMMY_PASSES]); this.isLoading.set(false); }, 400);
      return;
    }

    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS }).subscribe({
      next : (data) => { this.allPassesRaw.set(data ?? []); this.isLoading.set(false); },
      error: (err)  => {
        console.error('❌ loadPasses error:', err?.status, err?.error);
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  VEHICLE LOOKUP — GET /api/vehicles/list → filter by id
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onVehicleIdBlur() {
    const id = this.form.vehicleId?.toString().trim();
    this.vehicleLookupError.set('');
    this.vehicleLookupSuccess.set('');
    this.form.typeOfVehicle = '';

    if (!id || id === '0') return;
    this.isLookingUp.set(true);

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        const found = DUMMY_VEHICLES.find(v => v.vehicleId === +id);
        if (found) {
          this.form.typeOfVehicle = found.vehicleType;
          this.vehicleLookupSuccess.set('✅ ' + found.vehicleType);
        } else {
          this.vehicleLookupError.set('Vehicle ID ' + id + ' not found.');
        }
        this.isLookingUp.set(false);
      }, 300);
      return;
    }

    this.http.get<any[]>(API_CONFIG.VEHICLES, { headers: this.HEADERS }).subscribe({
      next: (list) => {
        const found = (list || []).find(
          v => String(v.vehicleId ?? v.vehicle_id ?? v.id) === id
        );
        if (found) {
          this.form.typeOfVehicle =
            found.vehicleType || found.vehicle_type || found.typeOfVehicle || found.type || '';
          this.vehicleLookupSuccess.set('✅ Vehicle found: ' + this.form.typeOfVehicle);
        } else {
          this.vehicleLookupError.set('Vehicle ID ' + id + ' not found in Vehicles Master.');
        }
        this.isLookingUp.set(false);
      },
      error: (err) => {
        console.error('❌ Vehicle lookup error:', err?.status, err?.error);
        this.vehicleLookupError.set('Could not reach Vehicles Master. Check backend.');
        this.isLookingUp.set(false);
      },
    });
  }

  onSearch       (v: string) { this.searchText.set(v);    this.currentPage.set(1); }
  onFilterStatus (v: string) { this.filterStatus.set(v);  this.currentPage.set(1); }
  onFilterEmpType(v: string) { this.filterEmpType.set(v); this.currentPage.set(1); }
  onPageSize     (v: string) { this.pageSize.set(+v);     this.currentPage.set(1); }
  goToPage       (p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }

  formatDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }

  getStatusClass(s: string): string {
    switch ((s || '').toLowerCase()) {
      case 'active'     : return 'badge badge-active';
      case 'expiring'   : return 'badge badge-expiring';
      case 'expired'    : return 'badge badge-expired';
      case 'surrendered': return 'badge badge-surrendered';
      default           : return 'badge badge-surrendered';
    }
  }

  getEmpTypeBadgeClass(e: string): string {
    return e === 'Contractor' ? 'badge badge-contractor' : 'badge badge-employee';
  }

  openAddModal() {
    this.form = EMPTY_FORM();
    this.isEditMode.set(false); this.editId.set(null);
    this.saveError.set(''); this.saveSuccess.set('');
    this.vehicleLookupError.set(''); this.vehicleLookupSuccess.set('');
    this.isLookingUp.set(false);
    this.showModal.set(true);
  }

  openEditModal(p: any) {
    this.form = {
      issueDate        : p.issueDate         || p.issue_date         || '',
      validityDate     : p.validityDate      || p.validity_date      || '',
      employeeNo       : p.employeeNo        || p.employee_no        || '',
      employeeCompanyNo: p.employeeCompanyNo || p.employee_company_no|| '',
      dept             : p.dept              || '',
      contractorCode   : p.contractorCode    || p.contractor_code    || '',
      gateNo           : p.gateNo            || p.gate_no            || '',
      parkingToBeUsed  : p.parkingToBeUsed   || p.parking_to_be_used || '',
      vehicleId        : String(p.vehicleId  || p.vehicle_id         || ''),
      typeOfVehicle    : p.typeOfVehicle     || p.type_of_vehicle    || '',
      mobileNo         : p.mobileNo          || p.mobile_no          || '',
      passStatus       : p.status || p.passStatus                    || 'Active',
      empType          : p.empType           || p.emp_type           || 'Company_Employee',
      remarks          : p.remarks           || '',
      isActive         : p.isActive          || p.is_active          || 'Y',
    };
    this.isEditMode.set(true);
    this.editId.set(p.passId || p.pass_id);
    this.saveError.set(''); this.saveSuccess.set('');
    this.vehicleLookupError.set('');
    this.vehicleLookupSuccess.set(this.form.typeOfVehicle ? '✅ Vehicle found: ' + this.form.typeOfVehicle : '');
    this.isLookingUp.set(false);
    this.showViewModal.set(false);
    this.showModal.set(true);
  }

  closeModal()          { this.showModal.set(false); }
  openViewModal(p: any) { this.viewPass.set(p); this.showViewModal.set(true); }
  closeViewModal()      { this.showViewModal.set(false); }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  POST → /api/passes/issue        (new pass)
  //  PUT  → /api/passes/update/{id}  (edit pass)
  //
  //  Payload keys match Oracle Pass_Registry DDL column names.
  //  form.passStatus (Angular) → payload.status (Oracle column)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  savePass() {
    // Validations
    if (!String(this.form.vehicleId).trim())  { this.saveError.set('Vehicle ID is required.');                              return; }
    if (this.vehicleLookupError())            { this.saveError.set('Fix Vehicle ID error before saving.');                  return; }
    if (!this.form.typeOfVehicle.trim())      { this.saveError.set('Enter a valid Vehicle ID first — type auto-fills.');    return; }
    if (!this.form.issueDate)                 { this.saveError.set('Issue Date is required.');                              return; }
    if (!this.form.validityDate)              { this.saveError.set('Validity Date is required.');                           return; }
    if (!this.form.gateNo.trim())             { this.saveError.set('Gate No is required.');                                 return; }
    if (this.form.empType === 'Company_Employee' && !this.form.employeeNo.trim()) {
      this.saveError.set('Employee No is required for Company Employee.'); return;
    }
    if (this.form.empType === 'Contractor' && !this.form.contractorCode.trim()) {
      this.saveError.set('Contractor Code is required for Contractor.'); return;
    }

    this.isSaving.set(true);
    this.saveError.set('');
    this.saveSuccess.set('');

    // ── Payload: Oracle Pass_Registry column names (snake_case) ──
    const payload: any = {
      vehicle_id         : Number(this.form.vehicleId),
      type_of_vehicle    : this.form.typeOfVehicle,
      emp_type           : this.form.empType,
      dept               : this.form.dept            || null,
      mobile_no          : this.form.mobileNo        || null,
      issue_date         : this.form.issueDate,
      validity_date      : this.form.validityDate,
      gate_no            : this.form.gateNo,
      parking_to_be_used : this.form.parkingToBeUsed || null,
      status             : this.form.passStatus,       // ← form.passStatus → Oracle 'status'
      is_active          : this.form.isActive,         // ← 'Y' or 'N'  (CHAR(1))
      remarks            : this.form.remarks           || null,
      enter_by           : 'ADMIN',
      enter_date         : new Date().toISOString().split('T')[0],
    };

    if (this.form.empType === 'Company_Employee') {
      payload.employee_no          = this.form.employeeNo          || null;
      payload.employee_company_no  = this.form.employeeCompanyNo   || null;
      payload.contractor_code      = null;
    } else {
      payload.contractor_code      = this.form.contractorCode      || null;
      payload.employee_no          = null;
      payload.employee_company_no  = null;
    }

    console.log('📤 Payload →', JSON.stringify(payload, null, 2));

    // ── Dummy mode ──
    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        if (this.isEditMode()) {
          const idx = this.allPassesRaw().findIndex(p => (p.passId || p.pass_id) === this.editId());
          if (idx !== -1) {
            const upd = [...this.allPassesRaw()];
            upd[idx]  = { ...upd[idx], ...payload };
            this.allPassesRaw.set(upd);
          }
          this.saveSuccess.set('✅ Pass updated successfully.');
        } else {
          this.allPassesRaw.set([{ passId: Date.now(), ...payload }, ...this.allPassesRaw()]);
          this.saveSuccess.set('✅ Pass issued successfully.');
        }
        this.isSaving.set(false);
        setTimeout(() => this.closeModal(), 1200);
      }, 500);
      return;
    }

    // ── Live API ──
    const req$ = this.isEditMode()
      ? this.http.put(`${API_CONFIG.PASSES_UPDATE}/${this.editId()}`, payload, { headers: this.HEADERS })
      : this.http.post(API_CONFIG.PASSES_ISSUE, payload, { headers: this.HEADERS });

    req$.subscribe({
      next: (res: any) => {
        console.log('✅ savePass response:', res);
        this.saveSuccess.set(this.isEditMode() ? '✅ Pass updated successfully.' : '✅ Pass issued successfully.');
        this.isSaving.set(false);
        this.loadPasses();
        setTimeout(() => this.closeModal(), 1200);
      },
      error: (err: any) => {
        const body = err?.error;
        const msg  =
          (typeof body === 'string' && body.length < 300 ? body : null) ||
          body?.message || body?.error ||
          (typeof body === 'object' ? JSON.stringify(body) : null) ||
          `HTTP ${err?.status ?? '?'} — open F12 → Network tab for full error.`;
        console.error('❌ Status:', err?.status);
        console.error('❌ Body:',   body);
        this.saveError.set(msg);
        this.isSaving.set(false);
      },
    });
  }
}