import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_CONFIG } from '../core/api.config';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DUMMY DATA SWITCH
//  true  = use local dummy data (no API call)
//  false = call live backend API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const USE_DUMMY_DATA = false;

const DUMMY_PASSES: any[] = [
  {
    passId: 1, issueDate: '2024-01-10', validityDate: '2025-01-10',
    employeeNo: 'EMP001', employeeCompanyNo: 'HEG001', dept: 'Mechanical',
    contractorCode: null, gateNo: 'GATE_01', parkingToBeUsed: 'P-Block',
    vehicleId: 1, typeOfVehicle: 'Car', mobileNo: '9876543210',
    status: 'Active', empType: 'Company_Employee',
    isActive: 'Y', enterBy: 'ADMIN', enterDate: '2024-01-10', remarks: ''
  },
  {
    passId: 2, issueDate: '2024-02-01', validityDate: '2025-02-01',
    employeeNo: 'EMP002', employeeCompanyNo: 'HEG002', dept: 'Electrical',
    contractorCode: null, gateNo: 'GATE_02', parkingToBeUsed: 'A-Block',
    vehicleId: 2, typeOfVehicle: 'Bike', mobileNo: '9876500001',
    status: 'Active', empType: 'Company_Employee',
    isActive: 'Y', enterBy: 'ADMIN', enterDate: '2024-02-01', remarks: ''
  },
  {
    passId: 3, issueDate: '2023-06-01', validityDate: '2024-06-01',
    employeeNo: null, employeeCompanyNo: null, dept: 'Construction',
    contractorCode: 'CON001', gateNo: 'GATE_03', parkingToBeUsed: 'Heavy Yard',
    vehicleId: 3, typeOfVehicle: 'Dumper Truck', mobileNo: '9988776655',
    status: 'Expired', empType: 'Contractor',
    isActive: 'N', enterBy: 'ADMIN', enterDate: '2023-06-01', remarks: 'Load permit required'
  },
  {
    passId: 4, issueDate: '2024-03-15', validityDate: '2025-03-15',
    employeeNo: 'EMP004', employeeCompanyNo: 'HEG004', dept: 'Civil',
    contractorCode: null, gateNo: 'GATE_01', parkingToBeUsed: 'B-Block',
    vehicleId: 5, typeOfVehicle: 'SUV', mobileNo: '9800001234',
    status: 'Active', empType: 'Company_Employee',
    isActive: 'Y', enterBy: 'ADMIN', enterDate: '2024-03-15', remarks: ''
  },
  {
    passId: 5, issueDate: '2024-04-01', validityDate: '2024-12-31',
    employeeNo: null, employeeCompanyNo: null, dept: null,
    contractorCode: 'CON002', gateNo: 'GATE_02', parkingToBeUsed: 'Heavy Yard',
    vehicleId: 8, typeOfVehicle: 'Truck', mobileNo: '9700001111',
    status: 'Surrendered', empType: 'Contractor',
    isActive: 'N', enterBy: 'ADMIN', enterDate: '2024-04-01', remarks: 'Surrendered early'
  },
  {
    passId: 6, issueDate: '2025-01-01', validityDate: '2025-07-01',
    employeeNo: 'EMP006', employeeCompanyNo: 'HEG006', dept: 'HR',
    contractorCode: null, gateNo: 'GATE_01', parkingToBeUsed: 'A-Block',
    vehicleId: 9, typeOfVehicle: 'SUV', mobileNo: '9600002222',
    status: 'Expiring', empType: 'Company_Employee',
    isActive: 'Y', enterBy: 'ADMIN', enterDate: '2025-01-01', remarks: 'Renewal due soon'
  },
  {
    passId: 7, issueDate: '2025-02-10', validityDate: '2025-08-10',
    employeeNo: null, employeeCompanyNo: null, dept: 'Heavy Works',
    contractorCode: 'CON003', gateNo: 'GATE_03', parkingToBeUsed: 'Heavy Yard',
    vehicleId: 3, typeOfVehicle: 'Dumper Truck', mobileNo: '9500003333',
    status: 'Expiring', empType: 'Contractor',
    isActive: 'Y', enterBy: 'ADMIN', enterDate: '2025-02-10', remarks: ''
  },
];

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
  status           : string;
  empType          : string;
  remarks          : string;
  isActive         : string;
}

const EMPTY_FORM = (): PassForm => ({
  issueDate: '', validityDate: '', employeeNo: '', employeeCompanyNo: '',
  dept: '', contractorCode: '', gateNo: '', parkingToBeUsed: '',
  vehicleId: '', typeOfVehicle: '', mobileNo: '',
  status: 'Active', empType: 'Company_Employee', remarks: '', isActive: 'Y'
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
      const matchStatus  = st === 'ALL' || p.status  === st;
      const matchEmpType = et === 'ALL' || p.empType === et;
      return matchSearch && matchStatus && matchEmpType;
    });
  });

  pagedPasses = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredPasses().slice(start, start + this.pageSize());
  });

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredPasses().length / this.pageSize()));
  }
  get totalPagesArr(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  // ── Add/Edit Modal ──
  showModal   = signal(false);
  isEditMode  = signal(false);
  isSaving    = signal(false);
  saveError   = signal('');
  saveSuccess = signal('');
  editId      = signal<number | null>(null);
  form: PassForm = EMPTY_FORM();

  // ── View Modal ──
  showViewModal = signal(false);
  viewPass      = signal<any>(null);

  constructor(private http: HttpClient) {}
  ngOnInit() { this.loadPasses(); }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  LOAD → GET /api/passes/list
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  loadPasses() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        this.allPassesRaw.set([...DUMMY_PASSES]);
        this.isLoading.set(false);
      }, 400);
      return;
    }

    this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS }).subscribe({
      next : (data) => { this.allPassesRaw.set(data ?? []); this.isLoading.set(false); },
      error: ()     => { this.hasError.set(true);           this.isLoading.set(false); },
    });
  }

  // ── Filter event handlers ──
  onSearch       (v: string) { this.searchText.set(v);    this.currentPage.set(1); }
  onFilterStatus (v: string) { this.filterStatus.set(v);  this.currentPage.set(1); }
  onFilterEmpType(v: string) { this.filterEmpType.set(v); this.currentPage.set(1); }
  onPageSize     (v: string) { this.pageSize.set(+v);     this.currentPage.set(1); }
  goToPage       (p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }

  // ── Date formatter ──
  formatDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ── Badge class helpers ──
  getStatusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'active'     : return 'badge badge-active';
      case 'expiring'   : return 'badge badge-expiring';
      case 'expired'    : return 'badge badge-expired';
      case 'surrendered': return 'badge badge-surrendered';
      default           : return 'badge badge-surrendered';
    }
  }

  getEmpTypeBadgeClass(empType: string): string {
    return empType === 'Contractor' ? 'badge badge-contractor' : 'badge badge-employee';
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  MODAL CONTROL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  openAddModal() {
    this.form = EMPTY_FORM();
    this.isEditMode.set(false);
    this.editId.set(null);
    this.saveError.set('');
    this.saveSuccess.set('');
    this.showModal.set(true);
  }

  openEditModal(p: any) {
    this.form = {
      issueDate        : p.issueDate          || '',
      validityDate     : p.validityDate       || '',
      employeeNo       : p.employeeNo         || '',
      employeeCompanyNo: p.employeeCompanyNo  || '',
      dept             : p.dept               || '',
      contractorCode   : p.contractorCode     || '',
      gateNo           : p.gateNo             || '',
      parkingToBeUsed  : p.parkingToBeUsed    || '',
      vehicleId        : String(p.vehicleId   || ''),
      typeOfVehicle    : p.typeOfVehicle      || '',
      mobileNo         : p.mobileNo           || '',
      status           : p.status             || 'Active',
      empType          : p.empType            || 'Company_Employee',
      remarks          : p.remarks            || '',
      isActive         : p.isActive           || 'Y',
    };
    this.isEditMode.set(true);
    this.editId.set(p.passId);
    this.saveError.set('');
    this.saveSuccess.set('');
    this.showViewModal.set(false);
    this.showModal.set(true);
  }

  closeModal()     { this.showModal.set(false); }
  openViewModal(p: any) { this.viewPass.set(p); this.showViewModal.set(true); }
  closeViewModal()      { this.showViewModal.set(false); }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  SAVE → POST /api/passes/issue
  //          PUT  /api/passes/update/{id}
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  savePass() {
    if (!String(this.form.vehicleId).trim())  { this.saveError.set('Vehicle ID is required.');      return; }
    if (!this.form.typeOfVehicle.trim())       { this.saveError.set('Type of Vehicle is required.'); return; }
    if (!this.form.issueDate)                 { this.saveError.set('Issue Date is required.');       return; }
    if (!this.form.validityDate)              { this.saveError.set('Validity Date is required.');    return; }
    if (!this.form.gateNo.trim())             { this.saveError.set('Gate No is required.');          return; }
    if (this.form.empType === 'Company_Employee' && !this.form.employeeNo.trim()) {
      this.saveError.set('Employee No is required for Company Employee.'); return;
    }
    if (this.form.empType === 'Contractor' && !this.form.contractorCode.trim()) {
      this.saveError.set('Contractor Code is required for Contractor.'); return;
    }

    this.isSaving.set(true);
    this.saveError.set('');

    // Only Pass_Registry columns in payload
    const payload = {
      issueDate        : this.form.issueDate,
      validityDate     : this.form.validityDate,
      employeeNo       : this.form.empType === 'Company_Employee' ? this.form.employeeNo        : null,
      employeeCompanyNo: this.form.empType === 'Company_Employee' ? this.form.employeeCompanyNo : null,
      dept             : this.form.dept             || null,
      contractorCode   : this.form.empType === 'Contractor'       ? this.form.contractorCode    : null,
      gateNo           : this.form.gateNo,
      parkingToBeUsed  : this.form.parkingToBeUsed  || null,
      vehicleId        : Number(this.form.vehicleId),
      typeOfVehicle    : this.form.typeOfVehicle,
      mobileNo         : this.form.mobileNo         || null,
      status           : this.form.status,
      empType          : this.form.empType,
      remarks          : this.form.remarks           || null,
      isActive         : this.form.isActive,
    };

    // Dummy mode: update local signal directly
    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        if (this.isEditMode()) {
          const idx = this.allPassesRaw().findIndex(p => p.passId === this.editId());
          if (idx !== -1) {
            const updated = [...this.allPassesRaw()];
            updated[idx]  = { ...updated[idx], ...payload };
            this.allPassesRaw.set(updated);
          }
          this.saveSuccess.set('Pass updated successfully.');
        } else {
          const newPass = {
            passId: Date.now(), ...payload,
            enterBy: 'ADMIN', enterDate: new Date().toISOString().split('T')[0]
          };
          this.allPassesRaw.set([newPass, ...this.allPassesRaw()]);
          this.saveSuccess.set('Pass issued successfully.');
        }
        this.isSaving.set(false);
        setTimeout(() => this.closeModal(), 1200);
      }, 500);
      return;
    }

    // Live API
    const req$ = this.isEditMode()
      ? this.http.put(`${API_CONFIG.PASSES_UPDATE}/${this.editId()}`, payload, { headers: this.HEADERS })
      : this.http.post(API_CONFIG.PASSES_ISSUE, payload, { headers: this.HEADERS });

    req$.subscribe({
      next: () => {
        this.saveSuccess.set(this.isEditMode() ? 'Pass updated successfully.' : 'Pass issued successfully.');
        this.isSaving.set(false);
        this.loadPasses();
        setTimeout(() => this.closeModal(), 1200);
      },
      error: (err: any) => {
        this.saveError.set(err?.error?.message || 'Failed to save. Please try again.');
        this.isSaving.set(false);
      },
    });
  }
}