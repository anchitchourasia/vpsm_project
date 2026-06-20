import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
// ✅ CHANGE 1: Added interval, switchMap
import { Subject, takeUntil, timeout, catchError, of, interval, switchMap } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

const USE_DUMMY_DATA = false;
const HTTP_TIMEOUT_MS = 12000;

const DUMMY_PASSES: any[] = [
  { passId:1, issueDate:'2024-01-10', validityDate:'2025-01-10', employeeNo:'EMP001', employeeCompanyNo:'HEG001', dept:'Mechanical',  contractorCode:null,    gateNo:'GATE_01', parkingToBeUsed:'P-Block',    vehicle:{ vehicleId:1, vehicleNo:'MP04HEG1111', vehicleType:'Car',          vehicleClass:'Four_Wheeler'    }, typeOfVehicle:'Car',          mobileNo:'9876543210', status:'Active',      empType:'Company_Employee', isActive:'Y', enterBy:'ADMIN', enterDate:'2024-01-10', remarks:'' },
  { passId:2, issueDate:'2024-02-01', validityDate:'2025-02-01', employeeNo:'EMP002', employeeCompanyNo:'HEG002', dept:'Electrical',   contractorCode:null,    gateNo:'GATE_02', parkingToBeUsed:'A-Block',    vehicle:{ vehicleId:2, vehicleNo:'MP04HEG2222', vehicleType:'Bike',         vehicleClass:'Two_Wheeler'     }, typeOfVehicle:'Bike',         mobileNo:'9876500001', status:'Active',      empType:'Company_Employee', isActive:'Y', enterBy:'ADMIN', enterDate:'2024-02-01', remarks:'' },
  { passId:3, issueDate:'2023-06-01', validityDate:'2024-06-01', employeeNo:null,     employeeCompanyNo:null,     dept:'Construction', contractorCode:'CON001', gateNo:'GATE_03', parkingToBeUsed:'Heavy Yard', vehicle:{ vehicleId:3, vehicleNo:'MP04HEG3333', vehicleType:'Dumper Truck', vehicleClass:'Heavy_Machinery' }, typeOfVehicle:'Dumper Truck', mobileNo:'9988776655', status:'Expired',     empType:'Contractor',       isActive:'N', enterBy:'ADMIN', enterDate:'2023-06-01', remarks:'Load permit required' },
  { passId:4, issueDate:'2024-03-15', validityDate:'2025-03-15', employeeNo:'EMP004', employeeCompanyNo:'HEG004', dept:'Civil',        contractorCode:null,    gateNo:'GATE_01', parkingToBeUsed:'B-Block',    vehicle:{ vehicleId:5, vehicleNo:'MP04HEG5555', vehicleType:'SUV',          vehicleClass:'Four_Wheeler'    }, typeOfVehicle:'SUV',          mobileNo:'9800001234', status:'Active',      empType:'Company_Employee', isActive:'Y', enterBy:'ADMIN', enterDate:'2024-03-15', remarks:'' },
  { passId:5, issueDate:'2024-04-01', validityDate:'2024-12-31', employeeNo:null,     employeeCompanyNo:null,     dept:null,           contractorCode:'CON002', gateNo:'GATE_02', parkingToBeUsed:'Heavy Yard', vehicle:{ vehicleId:8, vehicleNo:'MP04HEG8888', vehicleType:'Truck',        vehicleClass:'Heavy_Machinery' }, typeOfVehicle:'Truck',        mobileNo:'9700001111', status:'Surrendered', empType:'Contractor',       isActive:'N', enterBy:'ADMIN', enterDate:'2024-04-01', remarks:'Surrendered early' },
];

// ── All form fields camelCase — matching PassRegistry.java getters exactly ──
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
  passStatus       : string;
  empType          : string;
  remarks          : string;
  isActive         : string;
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
export class Passes implements OnInit, OnDestroy {

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });

  private readonly POST_HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
    'Accept'      : 'application/json',
  });

  private readonly destroy$ = new Subject<void>();

  private allPassesRaw = signal<any[]>([]);
  isLoading  = signal(true);
  hasError   = signal(false);
  isDummy    = USE_DUMMY_DATA;

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
        (p.employeeNo             || '').toLowerCase().includes(q) ||
        (p.contractorCode         || '').toLowerCase().includes(q) ||
        (p.dept                   || '').toLowerCase().includes(q) ||
        (p.mobileNo               || '').toLowerCase().includes(q) ||
        (p.vehicle?.vehicleNo     || '').toLowerCase().includes(q) ||
        String(p.passId           || '').includes(q)              ||
        // search also matches formatted ID e.g. "PASS-HEG-0047"
        this.formatPassId(p.passId).toLowerCase().includes(q);
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

  get totalPages(): number      { return Math.max(1, Math.ceil(this.filteredPasses().length / this.pageSize())); }
  get totalPagesArr(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  showModal   = signal(false);
  isEditMode  = signal(false);
  isSaving    = signal(false);
  saveError   = signal('');
  saveSuccess = signal('');
  editId      = signal<number | null>(null);
  form: PassForm = EMPTY_FORM();

  vehicleLookupError   = signal('');
  vehicleLookupSuccess = signal('');
  isLookingUp          = signal(false);

  showViewModal = signal(false);
  viewPass      = signal<any>(null);

  constructor(private http: HttpClient) {}

  // ✅ CHANGE 2: startPolling() added
  ngOnInit()    { this.loadPasses(); this.startPolling(); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  loadPasses() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      setTimeout(() => { this.allPassesRaw.set([...DUMMY_PASSES]); this.isLoading.set(false); }, 400);
      return;
    }

    this.http
      .get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS, observe: 'response' })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('❌ loadPasses error:', err?.status, err?.error);
          this.hasError.set(true);
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe((response: HttpResponse<any[]> | null) => {
        if (!response) return;
        const raw = (response.status === 204 || !response.body) ? [] : response.body;
        // ✅ Exclude Draft rows from Pass Registry table — drafts belong in pass-details/my-pass Drafts tab only
        this.allPassesRaw.set(raw.filter((p: any) => (p.status || '').toLowerCase() !== 'draft'));
        this.isLoading.set(false);
      });
  }

  // ✅ CHANGE 3: Silent background poll every 30s
  private startPolling(): void {
    if (USE_DUMMY_DATA) return;
    interval(30000)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() =>
          this.http
            .get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS, observe: 'response' })
            .pipe(catchError(() => of(null)))
        )
      )
      .subscribe((response: HttpResponse<any[]> | null) => {
        if (!response) return;
        const raw = (response.status === 204 || !response.body) ? [] : response.body;
        this.allPassesRaw.set(raw.filter((p: any) => (p.status || '').toLowerCase() !== 'draft'));
      });

  }

  onVehicleIdBlur() {
    const id = this.form.vehicleId?.toString().trim();
    this.vehicleLookupError.set('');
    this.vehicleLookupSuccess.set('');
    this.form.typeOfVehicle = '';
    if (!id || id === '0') return;

    this.isLookingUp.set(true);

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        const found = DUMMY_PASSES.find(p => String(p.vehicle?.vehicleId) === id);
        if (found) {
          this.form.typeOfVehicle = found.vehicle.vehicleType;
          this.vehicleLookupSuccess.set('✅ ' + found.vehicle.vehicleType);
        } else {
          this.vehicleLookupError.set('Vehicle ID ' + id + ' not found.');
        }
        this.isLookingUp.set(false);
      }, 300);
      return;
    }

    this.http
      .get<any[]>(API_CONFIG.VEHICLES, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('❌ Vehicle lookup error:', err?.status);
          this.vehicleLookupError.set('Could not reach Vehicles Master. Check backend.');
          this.isLookingUp.set(false);
          return of(null);
        })
      )
      .subscribe((list: any[] | null) => {
        if (!list) return;
        const found = list.find(v => String(v.vehicleId) === id);
        if (found) {
          this.form.typeOfVehicle = found.vehicleType || '';
          this.vehicleLookupSuccess.set('✅ Vehicle found: ' + found.vehicleType);
        } else {
          this.vehicleLookupError.set('Vehicle ID ' + id + ' not found in Vehicles Master.');
        }
        this.isLookingUp.set(false);
      });
  }

  onSearch       (v: string) { this.searchText.set(v);    this.currentPage.set(1); }
  onFilterStatus (v: string) { this.filterStatus.set(v);  this.currentPage.set(1); }
  onFilterEmpType(v: string) { this.filterEmpType.set(v); this.currentPage.set(1); }
  onPageSize     (v: string) { this.pageSize.set(+v);     this.currentPage.set(1); }
  goToPage       (p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }

  // formats DB integer passId → "PASS-HEG-0047"
  formatPassId(dbPassId: number | null | undefined, remarks?: string): string {
    if (!dbPassId && dbPassId !== 0) return '—';
    if (remarks && String(remarks).startsWith('DRAFT-')) return String(remarks);
    return `PASS-HEG-${String(dbPassId).padStart(4, '0')}`;
  }

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
      case 'draft'      : return 'badge badge-draft';      // ← add this
      case 'submitted'  : return 'badge badge-submitted';  // ← add this
      case 'confirmed'  : return 'badge badge-confirmed';  // ← add this
      default           : return 'badge badge-surrendered';
    }
  }

  getEmpTypeBadgeClass(e: string): string {
    return e === 'Contractor' ? 'badge badge-contractor' : 'badge badge-employee';
  }

  openAddModal() {
    this.form = EMPTY_FORM();
    this.isEditMode.set(false);
    this.editId.set(null);
    this.saveError.set('');
    this.saveSuccess.set('');
    this.vehicleLookupError.set('');
    this.vehicleLookupSuccess.set('');
    this.isLookingUp.set(false);
    this.showModal.set(true);
  }

  openEditModal(p: any) {
    this.form = {
      issueDate        : p.issueDate         || '',
      validityDate     : p.validityDate      || '',
      employeeNo       : p.employeeNo        || '',
      employeeCompanyNo: p.employeeCompanyNo || '',
      dept             : p.dept              || '',
      contractorCode   : p.contractorCode    || '',
      gateNo           : p.gateNo            || '',
      parkingToBeUsed  : p.parkingToBeUsed   || '',
      vehicleId        : String(p.vehicle?.vehicleId ?? ''),
      typeOfVehicle    : p.typeOfVehicle || p.vehicle?.vehicleType || '',
      mobileNo         : p.mobileNo          || '',
      passStatus       : p.status || p.passStatus || 'Active',
      empType          : p.empType           || 'Company_Employee',
      remarks          : p.remarks           || '',
      isActive         : p.isActive          || 'Y',
    };
    this.isEditMode.set(true);
    this.editId.set(p.passId);
    this.saveError.set('');
    this.saveSuccess.set('');
    this.vehicleLookupError.set('');
    this.vehicleLookupSuccess.set(
      this.form.typeOfVehicle
        ? '✅ Vehicle found: ' + this.form.typeOfVehicle
        : ''
    );
    this.isLookingUp.set(false);
    this.showViewModal.set(false);
    this.showModal.set(true);
  }

  closeModal()          { this.showModal.set(false); }
  openViewModal(p: any) { this.viewPass.set(p); this.showViewModal.set(true); }
  closeViewModal()      { this.showViewModal.set(false); }

  savePass() {
    if (!String(this.form.vehicleId).trim()) { this.saveError.set('Vehicle ID is required.');                            return; }
    if (this.vehicleLookupError())           { this.saveError.set('Fix Vehicle ID error before saving.');                return; }
    if (!this.form.typeOfVehicle.trim())     { this.saveError.set('Enter a valid Vehicle ID first — type auto-fills.'); return; }
    if (!this.form.issueDate)                { this.saveError.set('Issue Date is required.');                            return; }
    if (!this.form.validityDate)             { this.saveError.set('Validity Date is required.');                         return; }
    if (!this.form.gateNo.trim())            { this.saveError.set('Gate No is required.');                               return; }
    if (this.form.empType === 'Company_Employee' && !this.form.employeeNo.trim()) {
      this.saveError.set('Employee No is required for Company Employee.'); return;
    }
    if (this.form.empType === 'Contractor' && !this.form.contractorCode.trim()) {
      this.saveError.set('Contractor Code is required for Contractor.'); return;
    }
    if (this.isSaving()) return;

    this.isSaving.set(true);
    this.saveError.set('');
    this.saveSuccess.set('');

    const payload: any = {
      vehicle          : { vehicleId: Number(this.form.vehicleId) },
      typeOfVehicle    : this.form.typeOfVehicle,
      empType          : this.form.empType,
      dept             : this.form.dept             || null,
      mobileNo         : this.form.mobileNo         || null,
      issueDate        : this.form.issueDate,
      validityDate     : this.form.validityDate,
      gateNo           : this.form.gateNo,
      parkingToBeUsed  : this.form.parkingToBeUsed  || null,
      status           : this.form.passStatus,
      isActive         : this.form.isActive,
      remarks          : this.form.remarks           || null,
      enterBy          : 'ADMIN',
      enterDate        : new Date().toISOString().split('T')[0],
    };

    if (this.form.empType === 'Company_Employee') {
      payload.employeeNo        = this.form.employeeNo          || null;
      payload.employeeCompanyNo = this.form.employeeCompanyNo   || null;
      payload.contractorCode    = null;
    } else {
      payload.contractorCode    = this.form.contractorCode      || null;
      payload.employeeNo        = null;
      payload.employeeCompanyNo = null;
    }

    console.log('📤 Pass payload →', JSON.stringify(payload, null, 2));

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        if (this.isEditMode()) {
          const idx = this.allPassesRaw().findIndex(p => p.passId === this.editId());
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

    const req$ = this.isEditMode()
      ? this.http.put(`${API_CONFIG.PASSES_UPDATE}/${this.editId()}`,  payload, { headers: this.HEADERS })
      : this.http.post(API_CONFIG.PASSES_ISSUE, payload, { headers: this.HEADERS });

    req$
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError((err: any) => {
          const body = err?.error;
          const msg  =
            (typeof body === 'string' && body.length < 300 ? body : null) ||
            body?.message || body?.error ||
            (typeof body === 'object' ? JSON.stringify(body) : null) ||
            `HTTP ${err?.status ?? '?'} — open F12 → Network for full error.`;
          console.error('❌ Status:', err?.status, '| Body:', body);
          this.saveError.set(msg);
          this.isSaving.set(false);
          return of(null);
        })
      )
      .subscribe((res: any) => {
        if (!res) return;
        console.log('✅ savePass response:', res);

        const isEdit  = this.isEditMode();
        const savedId = res?.passId ?? this.editId() ?? '';
        const empCode = (this.form.employeeNo || this.form.contractorCode || 'ADMIN').toUpperCase();

        const action = isEdit
          ? (this.form.passStatus === 'Surrendered' ? 'SURRENDER' : 'APPROVED')
          : 'CREATE';

        const remark = isEdit
          ? `Pass ${savedId} updated — status: ${this.form.passStatus}`
          : `New pass issued for Vehicle ID ${this.form.vehicleId}`;

        this.logHistory(savedId, action, empCode, remark);

        this.saveSuccess.set(
          isEdit ? '✅ Pass updated successfully.' : '✅ Pass issued successfully.'
        );
        this.isSaving.set(false);

        // ✅ CHANGE 4: Always re-fetch from server for accuracy
        this.loadPasses();

        setTimeout(() => this.closeModal(), 1200);
      });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  AUTO-LOG TO HISTORY — fires silently after every successful
  //  pass issue / update / surrender.
  //
  //  POST /api/history/log  (API_CONFIG.HISTORY_LOG)
  //  Payload shape matches HistoryLog.java entity fields.
  //
  //  ⚠️  Silent fail by design — history errors MUST NOT block
  //      or surface to the user in any way.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private logHistory(passId: any, action: string, empCode: string, remark: string): void {
    const payload = {
      passNo     : String(passId ?? ''),
      empCode    : (empCode || 'ADMIN').toUpperCase(),
      action     : action.toUpperCase(),
      remark     : remark || null,
      dateOfEntry: new Date().toISOString(),
    };

    this.http
      .post<any>(API_CONFIG.HISTORY_LOG, payload, {
        headers: this.POST_HEADERS,
        observe : 'response',
      })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.warn('⚠️ [History Log] Failed silently:', err?.status, err?.error);
          return of(null);
        })
      )
      .subscribe(res => {
        if (res?.status === 200 || res?.status === 201) {
          console.log('📋 [History Log] Recorded — action:', payload.action, '| pass:', payload.passNo);
        }
      });
  }
}