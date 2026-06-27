import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Subject, takeUntil, timeout, catchError, of, interval, switchMap } from 'rxjs';
import { Router } from '@angular/router';
import { API_CONFIG } from '../core/api.config';
import { AuthService } from '../core/auth.service';
import { PassStateService } from '../services/pass-state.service';

const USE_DUMMY_DATA = false;
const HTTP_TIMEOUT_MS = 12000;

const DUMMY_PASSES: any[] = [
  { passId: 1, issueDate: '2024-01-10', validityDate: '2025-01-10', employeeNo: 'EMP001', employeeCompanyNo: 'HEG001', dept: 'Mechanical', contractorCode: null, gateNo: 'GATE_01', parkingToBeUsed: 'P-Block', vehicle: { vehicleId: 1, vehicleNo: 'MP04HEG1111', vehicleType: 'Car', vehicleClass: 'Four_Wheeler' }, typeOfVehicle: 'Car', mobileNo: '9876543210', status: 'Active', empType: 'Company_Employee', isActive: 'Y', enterBy: 'ADMIN', enterDate: '2024-01-10', remarks: '' },
  { passId: 2, issueDate: '2024-02-01', validityDate: '2025-02-01', employeeNo: 'EMP002', employeeCompanyNo: 'HEG002', dept: 'Electrical', contractorCode: null, gateNo: 'GATE_02', parkingToBeUsed: 'A-Block', vehicle: { vehicleId: 2, vehicleNo: 'MP04HEG2222', vehicleType: 'Bike', vehicleClass: 'Two_Wheeler' }, typeOfVehicle: 'Bike', mobileNo: '9876500001', status: 'Active', empType: 'Company_Employee', isActive: 'Y', enterBy: 'ADMIN', enterDate: '2024-02-01', remarks: '' },
  { passId: 3, issueDate: '2023-06-01', validityDate: '2024-06-01', employeeNo: null, employeeCompanyNo: null, dept: 'Construction', contractorCode: 'CON001', gateNo: 'GATE_03', parkingToBeUsed: 'Heavy Yard', vehicle: { vehicleId: 3, vehicleNo: 'MP04HEG3333', vehicleType: 'Dumper Truck', vehicleClass: 'Heavy_Machinery' }, typeOfVehicle: 'Dumper Truck', mobileNo: '9988776655', status: 'Expired', empType: 'Contractor', isActive: 'N', enterBy: 'ADMIN', enterDate: '2023-06-01', remarks: 'Load permit required' },
  { passId: 4, issueDate: '2024-03-15', validityDate: '2025-03-15', employeeNo: 'EMP004', employeeCompanyNo: 'HEG004', dept: 'Civil', contractorCode: null, gateNo: 'GATE_01', parkingToBeUsed: 'B-Block', vehicle: { vehicleId: 5, vehicleNo: 'MP04HEG5555', vehicleType: 'SUV', vehicleClass: 'Four_Wheeler' }, typeOfVehicle: 'SUV', mobileNo: '9800001234', status: 'Active', empType: 'Company_Employee', isActive: 'Y', enterBy: 'ADMIN', enterDate: '2024-03-15', remarks: '' },
  { passId: 5, issueDate: '2024-04-01', validityDate: '2024-12-31', employeeNo: null, employeeCompanyNo: null, dept: null, contractorCode: 'CON002', gateNo: 'GATE_02', parkingToBeUsed: 'Heavy Yard', vehicle: { vehicleId: 8, vehicleNo: 'MP04HEG8888', vehicleType: 'Truck', vehicleClass: 'Heavy_Machinery' }, typeOfVehicle: 'Truck', mobileNo: '9700001111', status: 'Surrendered', empType: 'Contractor', isActive: 'N', enterBy: 'ADMIN', enterDate: '2024-04-01', remarks: 'Surrendered early' },
];

interface PassForm {
  issueDate: string;
  validityDate: string;
  employeeNo: string;
  employeeCompanyNo: string;
  dept: string;
  contractorCode: string;
  gateNo: string;
  parkingToBeUsed: string;
  vehicleId: string;
  typeOfVehicle: string;
  mobileNo: string;
  passStatus: string;
  empType: string;
  remarks: string;
  isActive: string;
}
interface DocRecord {
  documentId: number;
  documentType: string;
  documentNo: string;
  expiryDate: string;
  startDate?: string;
  fileName?: string;
  vehicle?: { vehicleId: number };
}

const EMPTY_FORM = (): PassForm => ({
  issueDate: '', validityDate: '', employeeNo: '', employeeCompanyNo: '',
  dept: '', contractorCode: '', gateNo: '', parkingToBeUsed: '',
  vehicleId: '', typeOfVehicle: '', mobileNo: '',
  passStatus: 'Active', empType: 'Company_Employee', remarks: '', isActive: 'Y',
});

@Component({
  selector: 'app-passes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './passes.html',
  styleUrl: './passes.css',
})
export class Passes implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private passState = inject(PassStateService);

  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });

  private readonly POST_HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  });

  private readonly destroy$ = new Subject<void>();

  private allPassesRaw = signal<any[]>([]);
  isLoading = signal(true);
  hasError = signal(false);
  isDummy = USE_DUMMY_DATA;

  searchText = signal('');
  filterStatus = signal('ALL');
  filterEmpType = signal('ALL');
  currentPage = signal(1);
  pageSize = signal(10);

  filteredPasses = computed(() => {
    const q = this.searchText().toLowerCase();
    const st = this.filterStatus();
    const et = this.filterEmpType();
    return this.allPassesRaw().filter(p => {
      const matchSearch =
        !q ||
        (p.employeeNo || '').toLowerCase().includes(q) ||
        (p.contractorCode || '').toLowerCase().includes(q) ||
        (p.dept || '').toLowerCase().includes(q) ||
        (p.mobileNo || '').toLowerCase().includes(q) ||
        (p.vehicle?.vehicleNo || '').toLowerCase().includes(q) ||
        String(p.passId || '').includes(q) ||
        this.formatPassId(p.passId).toLowerCase().includes(q);
      const rowStatus = p.status || p.passStatus || '';
      const matchStatus = st === 'ALL' || rowStatus === st;
      const matchEmpType = et === 'ALL' || (p.empType || '') === et;
      return matchSearch && matchStatus && matchEmpType;
    });
  });

  pagedPasses = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredPasses().slice(start, start + this.pageSize());
  });

  get totalPages(): number { return Math.max(1, Math.ceil(this.filteredPasses().length / this.pageSize())); }
  get totalPagesArr(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  showModal = signal(false);
  isEditMode = signal(false);
  isSaving = signal(false);
  saveError = signal('');
  saveSuccess = signal('');
  editId = signal<number | null>(null);
  form: PassForm = EMPTY_FORM();

  vehicleLookupError = signal('');
  vehicleLookupSuccess = signal('');
  isLookingUp = signal(false);

  showViewModal = signal(false);
  viewPass = signal<any>(null);
  viewPassDocs = signal<DocRecord[]>([]);
  isLoadingViewDocs = signal(false);
  viewDocLoadError = signal('');
  viewPdfLoading = signal<number | null>(null);
  viewPdfError = signal('');

  isRedirectingToEdit = signal(false);

  constructor(private http: HttpClient, private router: Router) { }

  ngOnInit() { this.loadPasses(); this.startPolling(); }
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

        const myCode = this.auth.empCode().trim().toLowerCase();
        let filtered = raw.filter((p: any) => {
          const st = (p.status || '').toLowerCase();
          if (st === 'draft') {
            return (p.enterBy || '').toLowerCase() === myCode;
          }
          return true;
        });

        if (this.auth.isRegularUser()) {
          filtered = filtered.filter((p: any) =>
            (p.enterBy || '').toLowerCase() === myCode ||
            (p.employeeNo || '').toLowerCase() === myCode
          );
        }

        const normalized = filtered.map((p: any) => {
          const derivedEmpType = (p.contractorCode && p.contractorCode.trim())
            ? 'Contractor'
            : (p.empType && p.empType.trim() ? p.empType : 'Company_Employee');

          const derivedEmpTypeDetail = (p.empTypeDetail && p.empTypeDetail.trim())
            ? p.empTypeDetail.trim().toUpperCase()
            : (derivedEmpType === 'Contractor' ? 'Contractor' : '');

          const derivedVehicleType = (p.typeOfVehicle && p.typeOfVehicle.trim())
            ? p.typeOfVehicle
            : (p.vehicle?.vehicleType && p.vehicle.vehicleType.trim()
              ? p.vehicle.vehicleType
              : (p.vehicle?.vehicleClass && p.vehicle.vehicleClass.trim()
                ? p.vehicle.vehicleClass
                : '—'));

          return {
            ...p,
            empType: derivedEmpType,
            empTypeDetail: derivedEmpTypeDetail,
            typeOfVehicle: derivedVehicleType,
          };
        });

        this.allPassesRaw.set(normalized);
        this.isLoading.set(false);
      });
  }

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

        const myCode = this.auth.empCode().trim().toLowerCase();
        let filtered = raw.filter((p: any) => {
          const st = (p.status || '').toLowerCase();
          if (st === 'draft') {
            return (p.enterBy || '').toLowerCase() === myCode;
          }
          return true;
        });

        if (this.auth.isRegularUser()) {
          filtered = filtered.filter((p: any) =>
            (p.enterBy || '').toLowerCase() === myCode ||
            (p.employeeNo || '').toLowerCase() === myCode
          );
        }

        const normalized = filtered.map((p: any) => {
          const derivedEmpType = (p.contractorCode && p.contractorCode.trim())
            ? 'Contractor'
            : (p.empType && p.empType.trim() ? p.empType : 'Company_Employee');

          const derivedEmpTypeDetail = (p.empTypeDetail && p.empTypeDetail.trim())
            ? p.empTypeDetail.trim().toUpperCase()
            : (derivedEmpType === 'Contractor' ? 'Contractor' : '');

          const derivedVehicleType = (p.typeOfVehicle && p.typeOfVehicle.trim())
            ? p.typeOfVehicle
            : (p.vehicle?.vehicleType && p.vehicle.vehicleType.trim()
              ? p.vehicle.vehicleType
              : (p.vehicle?.vehicleClass && p.vehicle.vehicleClass.trim()
                ? p.vehicle.vehicleClass
                : '—'));

          return {
            ...p,
            empType: derivedEmpType,
            empTypeDetail: derivedEmpTypeDetail,
            typeOfVehicle: derivedVehicleType,
          };
        });

        this.allPassesRaw.set(normalized);
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

  onSearch(v: string) { this.searchText.set(v); this.currentPage.set(1); }
  onFilterStatus(v: string) { this.filterStatus.set(v); this.currentPage.set(1); }
  onFilterEmpType(v: string) { this.filterEmpType.set(v); this.currentPage.set(1); }
  onPageSize(v: string) { this.pageSize.set(+v); this.currentPage.set(1); }
  goToPage(p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }

  formatPassId(dbPassId: number | null | undefined, remarks?: string): string {
    if (!dbPassId && dbPassId !== 0) return '—';
    return String(dbPassId);
  }

  formatDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getStatusClass(s: string): string {
    switch ((s || '').toLowerCase()) {
      case 'active': return 'badge badge-active';
      case 'expiring': return 'badge badge-expiring';
      case 'expired': return 'badge badge-expired';
      case 'surrendered': return 'badge badge-surrendered';
      case 'draft': return 'badge badge-draft';
      case 'submitted': return 'badge badge-submitted';
      case 'confirmed': return 'badge badge-confirmed';
      default: return 'badge badge-surrendered';
    }
  }

  getEmpTypeBadgeClass(e: string, detail?: string): string {
    if (e === 'Contractor') return 'badge badge-contractor';
    const d = (detail || '').toUpperCase();
    if (d === 'HEG') return 'badge badge-heg';
    if (d === 'CONTRACT') return 'badge badge-contract-type';
    if (d === 'PERMANENT') return 'badge badge-permanent';
    return 'badge badge-employee';
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
      issueDate: p.issueDate || '',
      validityDate: p.validityDate || '',
      employeeNo: p.employeeNo || '',
      employeeCompanyNo: p.employeeCompanyNo || '',
      dept: p.dept || '',
      contractorCode: p.contractorCode || '',
      gateNo: p.gateNo || '',
      parkingToBeUsed: p.parkingToBeUsed || '',
      vehicleId: String(p.vehicle?.vehicleId ?? ''),
      typeOfVehicle: p.typeOfVehicle || p.vehicle?.vehicleType || '',
      mobileNo: p.mobileNo || '',
      passStatus: p.status || p.passStatus || 'Active',
      empType: p.empType || '',
      remarks: p.remarks || '',
      isActive: p.isActive || 'Y',
    };
    this.isEditMode.set(true);
    this.editId.set(p.passId);
    this.saveError.set('');
    this.saveSuccess.set('');
    this.vehicleLookupError.set('');
    this.vehicleLookupSuccess.set(
      this.form.typeOfVehicle ? '✅ Vehicle found: ' + this.form.typeOfVehicle : ''
    );
    this.isLookingUp.set(false);
    this.showViewModal.set(false);
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  openViewModal(p: any): void {
    this.viewPass.set(p);
    this.viewPassDocs.set([]);
    this.viewDocLoadError.set('');
    this.viewPdfError.set('');
    this.viewPdfLoading.set(null);
    this.showViewModal.set(true);
    this.loadViewDocs(p);
  }

  closeViewModal(): void {
    this.showViewModal.set(false);
    this.viewPass.set(null);
    this.viewPassDocs.set([]);
    this.viewDocLoadError.set('');
    this.viewPdfError.set('');
  }

  private loadViewDocs(p: any): void {
    const vehicleId: number | null = p.vehicle?.vehicleId ?? null;
    if (!vehicleId) {
      this.isLoadingViewDocs.set(true);
      this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
        .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$), catchError(() => of([])))
        .subscribe(list => {
          const vid = (list || []).find((x: any) => x.passId === p.passId)?.vehicle?.vehicleId ?? null;
          if (vid) this.fetchViewDocsByVehicleId(vid);
          else {
            this.viewDocLoadError.set('No vehicle linked — cannot load documents.');
            this.isLoadingViewDocs.set(false);
          }
        });
      return;
    }
    this.fetchViewDocsByVehicleId(vehicleId);
  }

  private fetchViewDocsByVehicleId(vehicleId: number): void {
    this.isLoadingViewDocs.set(true);
    this.viewDocLoadError.set('');
    this.http.get<DocRecord[]>(API_CONFIG.DOCUMENTS, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          this.viewDocLoadError.set('Could not load documents (' + (err?.status || 'network error') + ').');
          this.isLoadingViewDocs.set(false);
          return of([]);
        })
      )
      .subscribe(docs => {
        const filtered = (docs || []).filter(d => d.vehicle?.vehicleId === vehicleId);
        this.viewPassDocs.set(filtered);
        if (!filtered.length) this.viewDocLoadError.set('No documents found for this vehicle.');
        this.isLoadingViewDocs.set(false);
      });
  }

  viewDocumentPdf(doc: DocRecord): void {
    if (!doc?.documentId || !doc?.fileName) {
      this.viewPdfError.set('No file attached.');
      setTimeout(() => this.viewPdfError.set(''), 3500);
      return;
    }
    this.viewPdfLoading.set(doc.documentId);
    this.viewPdfError.set('');
    this.http.get(`${API_CONFIG.DOCUMENTS_DOWNLOAD}?id=${doc.documentId}`, { responseType: 'blob', headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(() => {
          this.viewPdfError.set('Could not load file.');
          this.viewPdfLoading.set(null);
          setTimeout(() => this.viewPdfError.set(''), 4000);
          return of(null);
        })
      )
      .subscribe((blob: Blob | null) => {
        this.viewPdfLoading.set(null);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      });
  }

  getDocStatusClass(exp: string): string {
    if (!exp) return 'doc-status-unknown';
    const days = Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
    return days < 0 ? 'doc-status-expired' : days <= 30 ? 'doc-status-expiring' : 'doc-status-valid';
  }

  getDocStatusText(exp: string): string {
    if (!exp) return 'Unknown';
    const days = Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
    return days < 0 ? 'Expired' : days <= 30 ? `Expiring in ${days}d` : 'Valid';
  }

  savePass() {
    if (!String(this.form.vehicleId).trim()) { this.saveError.set('Vehicle ID is required.'); return; }
    if (this.vehicleLookupError()) { this.saveError.set('Fix Vehicle ID error before saving.'); return; }
    if (!this.form.typeOfVehicle.trim()) { this.saveError.set('Enter a valid Vehicle ID first — type auto-fills.'); return; }
    if (!this.form.issueDate) { this.saveError.set('Issue Date is required.'); return; }
    if (!this.form.validityDate) { this.saveError.set('Validity Date is required.'); return; }
    if (!this.form.gateNo.trim()) { this.saveError.set('Gate No is required.'); return; }
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
      vehicle: { vehicleId: Number(this.form.vehicleId) },
      typeOfVehicle: this.form.typeOfVehicle,
      empType: this.form.empType,
      dept: this.form.dept || null,
      mobileNo: this.form.mobileNo || null,
      issueDate: this.form.issueDate,
      validityDate: this.form.validityDate,
      gateNo: this.form.gateNo,
      parkingToBeUsed: this.form.parkingToBeUsed || null,
      status: this.form.passStatus,
      isActive: this.form.isActive,
      remarks: this.form.remarks || null,
      enterBy: 'ADMIN',
      enterDate: new Date().toISOString().split('T')[0],
    };

    if (this.form.empType === 'Company_Employee') {
      payload.employeeNo = this.form.employeeNo || null;
      payload.employeeCompanyNo = this.form.employeeCompanyNo || null;
      payload.contractorCode = null;
    } else {
      payload.contractorCode = this.form.contractorCode || null;
      payload.employeeNo = null;
      payload.employeeCompanyNo = null;
    }

    console.log('📤 Pass payload →', JSON.stringify(payload, null, 2));

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        if (this.isEditMode()) {
          const idx = this.allPassesRaw().findIndex(p => p.passId === this.editId());
          if (idx !== -1) {
            const upd = [...this.allPassesRaw()];
            upd[idx] = { ...upd[idx], ...payload };
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
      ? this.http.put(`${API_CONFIG.PASSES_UPDATE}/${this.editId()}`, payload, { headers: this.HEADERS })
      : this.http.post(API_CONFIG.PASSES_ISSUE, payload, { headers: this.HEADERS });

    req$
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError((err: any) => {
          const body = err?.error;
          const msg =
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

        const isEdit = this.isEditMode();
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
        this.loadPasses();
        setTimeout(() => this.closeModal(), 1200);
      });
  }

  private logHistory(passId: any, action: string, empCode: string, remark: string): void {
    const payload = {
      passNo: String(passId ?? ''),
      empCode: (empCode || 'ADMIN').toUpperCase(),
      action: action.toUpperCase(),
      remark: remark || null,
      dateOfEntry: new Date().toISOString(),
    };

    this.http
      .post<any>(API_CONFIG.HISTORY_LOG, payload, { headers: this.POST_HEADERS, observe: 'response' })
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

  downloadPass(p: any): void {
    const passId = String(p.passId);
    const emp = p.employeeNo || p.contractorCode || '—';
    const vehicle = p.vehicle?.vehicleNo || '—';
    const gate = p.gateNo || '—';
    const issued = this.formatDate(p.issueDate);
    const valid = this.formatDate(p.validityDate);
    const status = p.status || '—';

    const content = [
      '================================================',
      '         HEG VEHICLE PASS MANAGEMENT SYSTEM     ',
      '================================================',
      `PASS ID     : ${passId}`,
      `EMPLOYEE NO : ${emp}`,
      `EMP TYPE    : ${p.empType || '—'}`,
      `DEPARTMENT  : ${p.dept || '—'}`,
      `VEHICLE NO  : ${vehicle}`,
      `VEHICLE TYPE: ${p.vehicle?.vehicleType || p.typeOfVehicle || '—'}`,
      `GATE        : ${gate}`,
      `ISSUE DATE  : ${issued}`,
      `VALID TILL  : ${valid}`,
      `STATUS      : ${status}`,
      '================================================',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Pass-${passId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  openEditInPassEntry — Edit button in Pass Registry
  //
  //  ✅ FIX: The old code tried to read employee name/dept/aadhar
  //  directly from the pass object (fresh.employeeName, fresh.empName,
  //  fresh.deptCode etc.) — BUT the /api/passes/list endpoint does NOT
  //  return these fields. They only exist in the Employee Report API.
  //
  //  NEW FLOW:
  //   1. Fetch fresh pass row from DB
  //   2. Fetch compliance docs for that vehicle
  //   3. ✅ NEW: Fetch employee details from /api/reports/employee-department
  //      using fresh.employeeNo (Company_Employee) or fresh.contractorCode
  //      (Contractor) to get name, dept, deptCode, aadhaarNo etc.
  //   4. Build PassRecord with real employee data merged in
  //   5. passState.setResumeDraft(record) → pass-entry reads in ngOnInit
  //   6. router.navigate(['/pass-entry'])
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  openEditInPassEntry(p: any): void {
    const passId = p?.passId;
    if (!passId) return;

    this.isRedirectingToEdit.set(true);

    // ── Step 1: Fetch fresh pass row from DB ──────────────────────────────
    this.http
      .get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(() => of(null))
      )
      .subscribe((allPasses: any[] | null) => {
        const fresh = allPasses?.find((x: any) => x.passId === passId) ?? p;
        const vehicleId = fresh.vehicle?.vehicleId ?? null;
        const isContractor = (fresh.empType || '').toLowerCase() === 'contractor'
          || !!(fresh.contractorCode && fresh.contractorCode.trim());
        const lookupCode = isContractor
          ? (fresh.contractorCode || '').trim()
          : (fresh.employeeNo || fresh.employeeCompanyNo || '').trim();

        // ── Step 2: Fetch employee details from Employee Report API ─────────
        // This is the ✅ KEY FIX — the passes/list API never returns
        // employee name, deptCode, aadhaarNo. We must fetch from employee API.
        this.http
          .get<any[]>(API_CONFIG.EMPLOYEE_REPORT, { headers: this.HEADERS })
          .pipe(
            timeout(HTTP_TIMEOUT_MS),
            takeUntil(this.destroy$),
            catchError(() => of([]))   // if employee API fails, still navigate with empty name
          )
          .subscribe((empRows: any[]) => {

            // Match employee row by EC No or Contractor Code
            let empMatch: any = null;
            if (lookupCode && empRows && empRows.length > 0) {
              if (isContractor) {
                empMatch = empRows.find(r =>
                  r.contractorNo &&
                  String(r.contractorNo).trim().toUpperCase() === lookupCode.toUpperCase()
                );
              } else {
                empMatch = empRows.find(r =>
                  String(r.id || '').trim() === lookupCode
                );
              }
            }

            // ── Step 3: Fetch compliance docs for this vehicle ──────────────
            const fetchDocsAndNavigate = (rawDocs: any[]) => {
              const mappedDocs = (rawDocs || []).map((d: any) => ({
                documentId: d.documentId ?? d.id ?? null,
                docType: (d.documentType || '').toUpperCase().trim(),
                docNo: d.documentNo || d.docNo || '',
                validUpto: d.expiryDate || d.validUpto || '',
                fileName: d.fileName || null,
              }));

              // ── Resolve empTypeDetail ────────────────────────────────────
              // Priority: DB value on pass → employee API value → default 'HEG'
              // Default 'HEG' ensures EC No field is always UNLOCKED on Edit
              const rawEmpTypeDetail = (fresh.empTypeDetail || '').toString().trim().toUpperCase();
              let resolvedEmpTypeDetail = '';
              if (!isContractor) {
                if (rawEmpTypeDetail === 'PERMANENT' || rawEmpTypeDetail === 'HEG' || rawEmpTypeDetail === 'CONTRACT') {
                  resolvedEmpTypeDetail = rawEmpTypeDetail;
                } else {
                  // Check employee API empType field as fallback
                  const apiEmpType = (empMatch?.empType || '').toString().trim().toUpperCase();
                  if (apiEmpType === 'PERMANENT' || apiEmpType === 'HEG' || apiEmpType === 'CONTRACT') {
                    resolvedEmpTypeDetail = apiEmpType;
                  } else {
                    resolvedEmpTypeDetail = 'HEG'; // default — unlocks EC No field
                  }
                }
              }

              const record = {
                passId: String(fresh.passId),
                empType: isContractor ? 'Contractor' : 'Company_Employee',
                vehicleNo: fresh.vehicle?.vehicleNo || '',
                vehicleType: fresh.vehicle?.vehicleType || fresh.typeOfVehicle || '',
                vehicleClass: fresh.vehicle?.vehicleClass || '',
                brandModel: fresh.vehicle?.brandModel || '',

                // ✅ ecNo: for Company_Employee = employeeNo; for Contractor = contractorCode
                ecNo: isContractor ? '' : lookupCode,
                contractorFirm: isContractor ? lookupCode : (fresh.contractorCode || ''),

                // ✅ FIX: empName now sourced from Employee Report API match
                // Falls back to any name stored on the pass itself as last resort
                empName: empMatch?.name
                  || empMatch?.employeeName
                  || fresh.employeeName
                  || fresh.empName
                  || '',

                // ✅ FIX: empDept from Employee Report API (deptName field)
                // Falls back to dept column on pass row
                empDept: (empMatch?.deptName || fresh.dept || '').toUpperCase(),

                issueDate: fresh.issueDate || '',
                validityDate: fresh.validityDate || '',
                gateNo: fresh.gateNo || '',
                parkingArea: fresh.parkingToBeUsed || '',
                remark: fresh.remarks || '',
                docs: mappedDocs,
                status: 'Saved' as const,
                createdAt: fresh.enterDate
                  || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),

                // ✅ FIX: empTypeDetail resolved above — always a valid value for Company_Employee
                empTypeDetail: resolvedEmpTypeDetail,

                // ✅ FIX: empAadhar from Employee Report API (aadhaarNo field)
                empAadhar: empMatch?.aadhaarNo
                  || empMatch?.aadharNo
                  || fresh.aadhaarNo
                  || '',

                // ✅ FIX: empDeptCode from Employee Report API (deptCode field)
                empDeptCode: empMatch?.deptCode || fresh.deptCode || '',

                // ✅ FIX: contractor fields from Employee Report API match
                empContractorCode: empMatch?.contractorCode || fresh.contractorCode || '',
                empContractorName: isContractor
                  ? (empMatch?.name || fresh.contractorName || lookupCode)
                  : (empMatch?.name || ''),

                contractorName: isContractor
                  ? (empMatch?.name || fresh.contractorName || lookupCode)
                  : '',
              };

              this.passState.setResumeDraft(record as any);
              this.isRedirectingToEdit.set(false);
              this.router.navigate(['/pass-entry']);
            };

            if (vehicleId) {
              // ── Step 4: Fetch compliance docs for this vehicle ───────────
              this.http
                .get<any[]>(`${API_CONFIG.BASE_URL}/api/documents/vehicle/${vehicleId}`, { headers: this.HEADERS })
                .pipe(
                  timeout(HTTP_TIMEOUT_MS),
                  takeUntil(this.destroy$),
                  catchError(() => of([]))
                )
                .subscribe((docs: any[]) => fetchDocsAndNavigate(docs || []));
            } else {
              fetchDocsAndNavigate([]);
            }
          });
      });
  }

  canEditPass(p: any): boolean {
    const status = (p?.status || p?.passStatus || '').toLowerCase();
    if (this.auth.isAdmin()) return true;
    if (this.auth.isConfirmer() || this.auth.isApprover()) return false;
    if (this.auth.isUploader() || this.auth.isRegularUser()) {
      return status === 'draft' || status === 'needs_modification';
    }
    return false;
  }
}