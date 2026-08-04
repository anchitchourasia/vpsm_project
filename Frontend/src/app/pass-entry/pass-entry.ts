import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, of } from 'rxjs';
import { takeUntil, timeout, catchError, finalize } from 'rxjs/operators';
import { API_CONFIG } from '../core/api.config';
import { PassStateService } from '../services/pass-state.service';
import { AuthService } from '../core/auth.service';
import {
  HttpClient,
  HttpHeaders,
  HttpResponse
} from '@angular/common/http';

const HTTP_TIMEOUT_MS = 12000;

// Document Details Model
export interface PassDocument {
  documentId: number | null;
  documentType: string;
  documentNo: string;
  expiryDate: string;
  fileKey: string;
  fileName: string;
  file: File | null;
  existingFile?: string;
}

// Pass History Model
export interface HistoryRecord {
  id?: number;
  passNo: string;
  empCode: string;
  action: string;
  remark: string;
  dateOfEntry: string;
}

// Employee Lookup Response Model
export interface EmployeeLookupResponse {
  employeeNo?: string;
  name?: string;
  deptCode?: string;
  deptName?: string;
  contractorCode?: string;
  contractorName?: string;
  aadhaarNo?: string;
  empType?: string;
}

export interface PassRequest {
  id: number | null;
  passNo: number | null;
  vehicleNo: string;
  vehicleType: string;
  brandModel: string;
  employeeNo: string;
  empType: string;
  contractorCode: string | null;
  gateNo: string;
  parkingToBeUsed: string;
  status: string;
  remark: string | null;
  enterBy: string;
  documents: PassDocument[];
}


export interface PassRegistryResponseDTO {
  id: number;
  vehicleNo: string;
  vehicleType: string;
  brandModel: string;
  employeeNo: number;
  empType: string;
  contractorCode: string;
  gateNo: string;
  parkingToBeUsed: string;
  enterBy: string;
  enterDate: string;
  reqStatus: string;
  passNo: number;
  documents: PassDocument[];
}

// Pass Status Constants
export const PassStatus = {
  DRAFT: 'DRAFT',
  SAVED: 'SAVED',
  SUBMITTED: 'SUBMITTED',
  CONFIRMED: 'CONFIRMED',
  APPROVED: 'APPROVED',
  REJECT: 'REJECT',
  REGRET: 'REJECT', // Fallback mapping for existing references
  MODIFY: 'MODIFY',
  NEEDS_MODIFICATION: 'NEEDS_MODIFICATION'
} as const;

const ALLOWED_DOC_TYPES = ['RC', 'INSURANCE', 'LICENSE'];

/**
 * Creates an empty document object.
 */
function emptyDocument(): PassDocument {
  return {
    documentId: null,
    documentType: '',
    documentNo: '',
    expiryDate: '',
    fileKey: '',
    fileName: '',
    file: null,
    existingFile: ''
  };
}

type EmployeeType =
  | ''
  | 'HEG'
  | 'TACC'
  | 'CONTRACT'
  | 'CRE-PRM';

@Component({
  selector: 'app-pass-entry',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './pass-entry.html',
  styleUrl: './pass-entry.css'
})
export class PassEntry implements OnInit, OnDestroy {
  //=====================================================
  // Constants
  //=====================================================
  protected readonly ALLOWED_DOC_TYPES = ALLOWED_DOC_TYPES;
  readonly PassStatus = PassStatus;
  private readonly destroy$ = new Subject<void>();

  //=====================================================
  // HTTP Headers
  //=====================================================
  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
  });

  //=====================================================
  // Vehicle Details
  //=====================================================
  vehicleNo: string = '';
  vehicleType: string = '';
  brandModel: string = '';

  //=====================================================
  // Employee Details
  //=====================================================
  employeeNo: string = '';
  ecNo: string = '';
  empType = signal<EmployeeType>('');
  contractorCode: string | null = null;

  //=====================================================
  // Gate & Parking
  //=====================================================
  gateNo: string = '';
  parkingToBeUsed: string = '';

  //=====================================================
  // Workflow
  //=====================================================
  status: string = PassStatus.DRAFT;
  remark: string | null = null;
  enterBy: string = '';

  get currentStatus(): string {
    return (this.status ?? '').toUpperCase();
  }

  //=====================================================
  // Auto Filled Employee Details
  //=====================================================
  empName = signal<string>('');
  empDept = signal<string>('');
  empDeptCode = signal<string>('');
  empType_display = signal<string>('');
  empAadhar = signal<string>('');
  empContractorCode = '';
  empContractorName = '';
  contractorName = '';
  contractorEmail = '';
  empEmail = '';
  empSalary = '';
  empContractorEmail = '';

  //=====================================================
  // Document Details
  //=====================================================
  documents = signal<PassDocument[]>([
    emptyDocument()
  ]);

  //=====================================================
  // UI Signals
  //=====================================================
  registryId: number | null = null;
  passNo: number | null = null;
  fetchingEmployee = signal<boolean>(false);
  empFetchError = signal<string>('');
  isSaving = signal<boolean>(false);
  saved = signal<boolean>(false);
  saveSuccess = signal<string>('');
  saveError = signal<string>('');

  //=====================================================
  // Screen Mode
  //=====================================================
  isModificationMode = signal<boolean>(false);
  isViewMode = signal<boolean>(false);
  isApproverMode = signal<boolean>(false);
  isConfirmerMode = signal<boolean>(false);

  //=====================================================
  // Workflow Signals
  //=====================================================
  modificationRemark = signal<string>('');
  reviewRemark = signal<string>('');
  isWorkflowSubmitting = signal<boolean>(false);

  //=====================================================
  // Pass History
  //=====================================================
  showPassHistory = signal<boolean>(false);
  isLoadingPassHistory = signal<boolean>(false);
  passHistoryError = signal<string>('');
  passHistory = signal<HistoryRecord[]>([]);

  //=====================================================
  // Private Variables
  //=====================================================
  private empData: EmployeeLookupResponse | null = null;
  private savedVehicleId: number | null = null;
  private savedPassRegistryId: number | null = null;
  private draftPassId: string | null = null;

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private passState: PassStateService,
    private auth: AuthService
  ) { }

  get todayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  // UPDATED: Now respects view mode completely
  get isReadOnlyMode(): boolean {
    if (this.isViewMode()) {
      return true;
    }
    return !this.canEdit();
  }

  isEcNoLocked: boolean = false;

  //=====================================================
  // Angular Life Cycle Hook
  //=====================================================
  ngOnInit(): void {
    //=====================================================
    // Load Logged User
    //=====================================================
    this.loadLoggedInUser();

    //=====================================================
    // Initialize Documents
    //=====================================================
    if (this.documents().length === 0) {
      this.documents.set([
        emptyDocument()
      ]);
    }

    //=====================================================
    // Route Handling
    //=====================================================
    this.route.queryParams
      .pipe(
        takeUntil(this.destroy$)
      )
      .subscribe(params => {
        const mode = params['mode'];
        const id = params['id'];

        console.log("Mode : ", mode);
        console.log("ID : ", id);

        // 1. Properly set UI modes based on query params
        if (mode === 'view') {
          this.isViewMode.set(true);
          this.isApproverMode.set(false);
        } else if (mode === 'approver') {
          this.isViewMode.set(false);
          this.isApproverMode.set(true);
        } else {
          // 'edit' or undefined
          this.isViewMode.set(false);
        }

        // 2. Load the Pass ONLY based on ID presence, independent of 'mode'
        if (id) {
          this.registryId = Number(id);
          console.log("Loading Pass ID : ", this.registryId);
          this.loadPass(this.registryId);
        } else {
          // New Entry
          this.registryId = null;
          this.status = PassStatus.DRAFT;
        }
      });
  }

  //=====================================================
  // Load Logged-in User Details
  //=====================================================
  private loadLoggedInUser(): void {
    const session = sessionStorage.getItem('vpsm_session');
    console.log('vpsm_session = ', session);

    if (!session) {
      console.log('No session found');
      return;
    }

    try {
      const user = JSON.parse(session);
      console.log('Logged User = ', user);

      this.enterBy = user.empCode ?? '';

      const role = String(user.role ?? '').toUpperCase();
      console.log('Login Role = ', role);

      if (role === 'APPROVER') {
        this.isApproverMode.set(true);
      } else {
        this.isApproverMode.set(false);
      }
    } catch (error) {
      console.error('Unable to parse session.', error);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  //=====================================================
  // SECTION 6 : Utility Methods
  //=====================================================
  onUpperInput(event: Event, field: keyof PassEntry): void {
    if (this.isReadOnlyMode) return;
    const input = event.target as HTMLInputElement;
    const val = input.value.toUpperCase().replace(/\s+/g, '');
    (this as any)[field] = val;
    input.value = val;
  }

  onVehicleTypeInput(event: Event): void {
    if (this.isReadOnlyMode) return;
    const input = event.target as HTMLInputElement;
    this.vehicleType = this.formatUpperCase(input.value);
    input.value = this.vehicleType;
  }

  private formatUpperCase(value: string): string {
    return value.toUpperCase();
  }

  onDocNoInput(event: Event, doc: PassDocument): void {
    if (this.isReadOnlyMode) return;
    const input = event.target as HTMLInputElement;
    doc.documentNo = this.formatUpperCase(input.value);
    input.value = doc.documentNo;
  }

  shortName(name: string): string {
    return name.length > 18 ? name.substring(0, 15) + '...' : name;
  }

  formatDateDDMMYYYY(isoDate: string): string {
    if (!isoDate || isoDate.length < 10) return isoDate ?? '';
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
  }

  formatDateTime(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;

    const date = dt.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const time = dt.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    return `${date}, ${time}`;
  }

  openDatePicker(input: HTMLInputElement): void {
    try { (input as any).showPicker(); } catch { input.click(); }
  }

  //=====================================================
  // SECTION 7 : Employee Methods
  //=====================================================
  loadEmployee(): void {
    this.empFetchError.set('');
    this.clearEmployeeData();
    this.fetchingEmployee.set(true);

    const url = `${API_CONFIG.EMPLOYEE_REPORT}/${encodeURIComponent(this.employeeNo)}`;

    this.http.get<any>(url, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          this.empFetchError.set(
            `Could not fetch employee details (${err?.status ?? 'Network Error'})`
          );
          return of(null);
        }),
        finalize(() => this.fetchingEmployee.set(false))
      )
      .subscribe(res => {
        if (!res) return;

        const selectedType = this.empType().trim().toUpperCase();
        const apiType = String(res.empType || '').trim().toUpperCase();

        if (selectedType !== apiType) {
          this.clearEmployeeData();
          this.empFetchError.set(
            `Employee Type mismatch. Selected: ${selectedType}, Found: ${apiType}`
          );
          return;
        }

        this.empData = res;
        this.empName.set(String(res.name || ''));
        this.empDept.set(String(res.deptName || '').toUpperCase());
        this.empDeptCode.set(String(res.deptCode || ''));
        this.empAadhar.set(String(res.aadhaarNo || res.aadharNo || ''));
        this.empType_display.set(apiType);
        this.empContractorCode = String(res.contractorCode || '');
        this.contractorCode = String(res.contractorCode || '');
        this.empContractorName = String(res.contractorName || '');
        this.empFetchError.set('');
      });
  }

  private clearEmployeeData(): void {
    this.empData = null;
    this.empName.set('');
    this.empDept.set('');
    this.empDeptCode.set('');
    this.empAadhar.set('');
    this.empType_display.set('');
    this.empContractorCode = '';
    this.empContractorName = '';
    this.contractorName = '';
    this.contractorEmail = '';
  }

  //=====================================================
  // SECTION 8 : Document Methods
  //=====================================================
  addDocument(): void {
    if (this.isReadOnlyMode) return;

    const docs = [...this.documents()];
    const lastDoc = docs[docs.length - 1];

    if (
      !lastDoc.documentType ||
      !lastDoc.documentNo ||
      !lastDoc.expiryDate
    ) {
      alert('Please complete the current document before adding a new one.');
      return;
    }

    docs.push(emptyDocument());
    this.documents.set(docs);
  }

  removeDocument(index: number): void {
    if (this.isReadOnlyMode) return;

    this.documents.update(docs => {
      if (docs.length === 1) {
        return docs;
      }
      return docs.filter((_, i) => i !== index);
    });
  }

  removeDoc(index: number): void {
    this.removeDocument(index);
  }

  availableDocTypes(index: number): string[] {
    const docs = this.documents();
    const selectedTypes = docs
      .filter((_, i) => i !== index)
      .map(doc => doc.documentType)
      .filter(type => !!type);

    return ALLOWED_DOC_TYPES.filter(type =>
      !selectedTypes.includes(type) || docs[index].documentType === type
    );
  }

  onDocumentTypeChange(index: number, documentType: string): void {
    if (this.isReadOnlyMode) return;

    this.documents.update(docs => {
      const updatedDocs = [...docs];
      updatedDocs[index] = {
        ...updatedDocs[index],
        documentType,
        documentNo: '',
        expiryDate: '',
        file: null,
        fileName: '',
        fileKey: '',
        existingFile: ''
      };
      return updatedDocs;
    });
  }

  onDocumentFileSelected(event: Event, index: number): void {
    if (this.isReadOnlyMode) return;

    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      alert('File size must be less than 5 MB.');
      input.value = '';
      return;
    }

    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png'
    ];

    if (!allowedTypes.includes(file.type)) {
      alert('Only PDF, JPG and PNG files are allowed.');
      input.value = '';
      return;
    }

    this.documents.update(docs => {
      const updated = [...docs];
      updated[index] = {
        ...updated[index],
        file: file,
        fileName: file.name,
        fileKey: `document_${index}`
      };
      console.log('Updated Document List:', updated);
      return updated;
    });

    input.value = '';
  }

  //=====================================================
  // SECTION 9 : Validation
  //=====================================================
  private validateVehicle(): boolean {
    if (!this.vehicleNo.trim()) {
      this.saveError.set('Vehicle Number is required.');
      return false;
    }
    if (!this.vehicleType.trim()) {
      this.saveError.set('Vehicle Type is required.');
      return false;
    }
    if (!this.brandModel.trim()) {
      this.saveError.set('Brand / Model is required.');
      return false;
    }
    return true;
  }

  private validateDocuments(): boolean {
    const docs = this.documents();
    if (docs.length === 0) {
      this.saveError.set('Please add at least one document.');
      return false;
    }

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];

      if (!doc.documentType) {
        this.saveError.set(`Please select Document Type for row ${i + 1}.`);
        return false;
      }
      if (!doc.documentNo.trim()) {
        this.saveError.set(`Please enter Document Number for row ${i + 1}.`);
        return false;
      }
      if (!doc.expiryDate) {
        this.saveError.set(`Please select Expiry Date for row ${i + 1}.`);
        return false;
      }
      if (!doc.file && !doc.existingFile) {
        this.saveError.set(`Please upload a file for row ${i + 1}.`);
        return false;
      }
    }
    return true;
  }

  private validateEmployee(): boolean {
    if (!this.empType()) {
      this.saveError.set('Please select Employee Type.');
      return false;
    }
    if (!this.employeeNo.trim()) {
      this.saveError.set('Employee Code is required.');
      return false;
    }
    if (!this.empName()) {
      this.saveError.set('Please verify Employee Code.');
      return false;
    }
    return true;
  }

  private validateGateAndParking(): boolean {
    if (!this.gateNo.trim()) {
      this.saveError.set('Gate No is required.');
      return false;
    }
    if (!this.parkingToBeUsed.trim()) {
      this.saveError.set('Parking To Be Used is required.');
      return false;
    }
    return true;
  }

  //=====================================================
  // SECTION 10 : Build Request
  //=====================================================
  private buildRequest(): PassRequest {
    const payload: PassRequest = {
      id: this.registryId,
      passNo: this.passNo,
      vehicleNo: this.vehicleNo?.trim() ?? '',
      vehicleType: this.vehicleType?.trim() ?? '',
      brandModel: this.brandModel?.trim() ?? '',
      employeeNo: this.employeeNo?.trim() ?? '',
      empType: this.empType(),
      contractorCode: this.contractorCode,
      gateNo: this.gateNo?.trim() ?? '',
      parkingToBeUsed: this.parkingToBeUsed?.trim() ?? '',
      status: this.status,
      remark: this.remark,
      enterBy: this.enterBy,
      documents: this.documents()
    };

    console.log('========= PASS FORM PAYLOAD =========');
    console.log(JSON.stringify(payload, null, 2));
    console.log("CONTRACTOR CODE FROM FORM ===>", this.contractorCode);

    return payload;
  }

  private buildFormData(): FormData {
    const formData = new FormData();
    formData.append(
      'request',
      new Blob(
        [JSON.stringify(this.buildRequest())],
        { type: 'application/json' }
      )
    );

    this.documents().forEach(doc => {
      if (doc.file) {
        formData.append(doc.fileKey, doc.file, doc.file.name);
        for (const pair of (formData as any).entries()) {
          console.log(pair[0], pair[1]);
        }
      }
    });

    return formData;
  }

  //=====================================================
  // SECTION 11 : CRUD Operations
  //=====================================================
  savePass(): void {
    if (this.isReadOnlyMode) {
      return;
    }

    this.saveError.set('');
    this.saveSuccess.set('');

    if (!this.validateForm()) {
      return;
    }

    // CASE 1: If pass was in modification state and user clicks SAVE, update status to DRAFT
    const currentUpperStatus = (this.status || '').toUpperCase();
    if (
      currentUpperStatus === PassStatus.MODIFY ||
      currentUpperStatus === PassStatus.NEEDS_MODIFICATION ||
      currentUpperStatus === 'NEEDSMODIFICATION'
    ) {
      this.status = PassStatus.DRAFT;
    }

    this.isSaving.set(true);
    const formData = this.buildFormData();

    // EDIT MODE
    if (this.registryId != null) {
      this.http.put<PassRegistryResponseDTO>(
        `${API_CONFIG.PASS_UPDATE}/${this.registryId}`,
        formData,
        { headers: this.HEADERS }
      )
        .pipe(
          timeout(HTTP_TIMEOUT_MS),
          takeUntil(this.destroy$),
          finalize(() => this.isSaving.set(false))
        )
        .subscribe({
          next: (response) => {
            this.saved.set(true);
            this.saveSuccess.set('Vehicle pass updated successfully.');
            this.registryId = response.id;
            this.passNo = response.passNo;
            this.status = response.reqStatus ?? PassStatus.DRAFT;
          },
          error: (err) => {
            this.saveError.set(
              err?.error?.message ?? 'Unable to update vehicle pass.'
            );
          }
        });
      return;
    }

    // ADD MODE
    this.http.post<PassRegistryResponseDTO>(
      API_CONFIG.PASS_SAVE,
      formData,
      { headers: this.HEADERS }
    )
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        finalize(() => this.isSaving.set(false))
      )
      .subscribe({
        next: (response) => {
          this.saved.set(true);
          this.saveSuccess.set('Vehicle pass saved successfully.');
          this.registryId = response.id;
          this.passNo = response.passNo;
          this.status = response.reqStatus ?? PassStatus.DRAFT;
        },
        error: (err) => {
          this.saveError.set(
            err?.error?.message ?? 'Unable to save vehicle pass.'
          );
        }
      });
  }

  updatePass(): void {
    if (this.isReadOnlyMode) {
      return;
    }

    if (!this.registryId) {
      this.saveError.set('Invalid Pass ID.');
      return;
    }

    this.saveError.set('');
    this.saveSuccess.set('');

    if (!this.validateForm()) {
      return;
    }

    this.isSaving.set(true);
    const formData = this.buildFormData();

    this.http.put<PassRegistryResponseDTO>(
      `${API_CONFIG.PASS_UPDATE}/${this.registryId}`,
      formData,
      { headers: this.HEADERS }
    )
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        finalize(() => this.isSaving.set(false))
      )
      .subscribe({
        next: (response) => {
          this.registryId = response.id;
          this.passNo = response.passNo;
          this.status = response.reqStatus;
          this.saved.set(true);
          this.saveSuccess.set('Vehicle pass updated successfully.');
        },
        error: (err) => {
          this.saveError.set(
            err?.error?.message ?? 'Unable to update vehicle pass.'
          );
        }
      });
  }

  private loadPass(id: number): void {
    this.isSaving.set(true);
    this.saveError.set('');

    this.http.get<PassRegistryResponseDTO>(
      `${API_CONFIG.PASS_LIST}/${id}`,
      { headers: this.HEADERS }
    )
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        finalize(() => this.isSaving.set(false))
      )
      .subscribe({
        next: (response) => {
          this.registryId = response.id;
          this.passNo = response.passNo;
          this.vehicleNo = response.vehicleNo ?? '';
          this.vehicleType = response.vehicleType ?? '';
          this.brandModel = response.brandModel ?? '';
          this.employeeNo = String(response.employeeNo ?? '');
          this.ecNo = String(response.employeeNo ?? '');

          this.setEmployeeType(response.empType);
          this.contractorCode = response.contractorCode ?? null;
          this.gateNo = response.gateNo ?? '';
          this.parkingToBeUsed = response.parkingToBeUsed ?? '';
          this.status = response.reqStatus ?? PassStatus.DRAFT;
          this.enterBy = response.enterBy ?? '';

          if (response.documents && response.documents.length > 0) {
            this.documents.set(
              response.documents.map(doc => ({
                documentId: doc.documentId ?? null,
                documentType: doc.documentType ?? '',
                documentNo: doc.documentNo ?? '',
                expiryDate: doc.expiryDate ?? '',
                fileKey: doc.fileKey ?? '',
                fileName: doc.fileName ?? '',
                existingFile: doc.fileName ?? '',
                file: null
              }))
            );
          } else {
            this.documents.set([emptyDocument()]);
          }

          this.saved.set(true);
          this.saveSuccess.set('Pass details loaded successfully.');

          if (this.employeeNo) {
            this.loadEmployee();
          }
        },
        error: (error) => {
          console.error('Load Pass Error:', error);
          this.saveError.set(
            error?.error?.message ?? 'Unable to load pass details.'
          );
        }
      });
  }

  private setEmployeeType(type: string | null | undefined): void {
    const value = (type ?? '').toUpperCase();
    if (
      value === 'HEG' ||
      value === 'TACC' ||
      value === 'CONTRACT' ||
      value === 'CRE-PRM'
    ) {
      this.empType.set(value);
    } else {
      this.empType.set('');
    }
  }

  //=====================================================
  // SECTION 12 : Workflow
  //=====================================================
  //=====================================================
  // SECTION 12 : Workflow
  //=====================================================
  //=====================================================
  // SECTION 12 : Workflow Handlers
  //=====================================================
  updatePassStatus(id: number, status: string): void {
    this.isSaving.set(true);

    const payload = {
      status: status,
      remark: this.reviewRemark() || this.remark || `${status} requested`,
      enterBy: this.enterBy || 'SYSTEM'
    };

    this.http.put<any>(
      `${API_CONFIG.PASS_STATUS_UPDATE}/${id}`,
      payload,
      { headers: this.HEADERS }
    ).subscribe({
      next: (response) => {
        this.isSaving.set(false);
        console.log("Status Updated Successfully", response);

        this.loadPass(id);

        if (this.showPassHistory()) {
          this.loadPassHistory(id);
        }

        this.showMessage(`${status} completed successfully`);
      },
      error: (error) => {
        this.isSaving.set(false);
        console.error("Status update failed", error);
        this.showMessage(error?.error?.message ?? "Status update failed");
      }
    });
  }

  confirmPass(): void {
    if (!this.registryId) return;
    this.updatePassStatus(this.registryId, PassStatus.CONFIRMED);
  }

  approvePass(): void {
    if (!this.registryId) return;
    // Sends ACTIVE status to transition pass to active state
    this.updatePassStatus(this.registryId, 'ACTIVE');
  }

  rejectPass(): void {
    if (!this.registryId) return;
    if (!this.reviewRemark()?.trim() && !this.remark?.trim()) {
      alert('Remark is required before rejecting.');
      return;
    }
    this.updatePassStatus(this.registryId, PassStatus.REJECT);
  }

  // Alias to satisfy template call (click)="regretPass()"
  regretPass(): void {
    this.rejectPass();
  }

  sendForModify(): void {
    if (!this.registryId) return;
    if (!this.reviewRemark()?.trim() && !this.remark?.trim()) {
      alert('Remark is required before requesting modification.');
      return;
    }
    this.updatePassStatus(this.registryId, PassStatus.MODIFY);
  }

  // Alias to satisfy template call (click)="modifyPass()"
  modifyPass(): void {
    this.sendForModify();
  }

  private showMessage(message: string): void {
    alert(message);
  }

  onEmpTypeChange(value: EmployeeType): void {
    this.empType.set(value);
    this.clearEmployeeData();
    this.employeeNo = '';
    this.empFetchError.set('');
  }

  // Helper property checking if mode is approver
  get isApproverView(): boolean {
    return this.isApproverMode() || (this.route.snapshot.queryParams['mode'] === 'approver');
  }

  // Edit guard for creator form
  // Edit guard for creator form
  canEdit(): boolean {
    if (this.isViewMode() || this.isApproverView) {
      return false;
    }
    const s = (this.status || '').toUpperCase();
    return (
      s === PassStatus.DRAFT ||
      s === PassStatus.SAVED ||
      s === PassStatus.MODIFY ||
      s === PassStatus.NEEDS_MODIFICATION ||
      s === 'NEEDSMODIFICATION'
    );
  }

  // Guards for Approver action buttons
  canApprove(): boolean {
    const s = (this.status || '').toUpperCase();
    return this.isApproverView && (s === 'SUBMITTED' || s === 'CONFIRMED');
  }

  canReject(): boolean {
    return this.canApprove();
  }

  canSendForModify(): boolean {
    return this.canApprove();
  }

  onEcNoBlur(): void {
    if (!this.empType()) {
      this.empFetchError.set('Please select Employee Type first');
      return;
    }
    if (!this.ecNo || this.ecNo.trim() === '') {
      return;
    }
    this.employeeNo = this.ecNo.trim().toUpperCase();
    this.loadEmployee();
  }

  onSubmit(): void {
    console.log("===== SUBMIT CLICKED =====");
    this.saveError.set('');
    this.saveSuccess.set('');

    // 1. Validate form fields before submitting
    if (!this.validateForm()) {
      return;
    }

    // 2. Fallback check for enterBy
    if (!this.enterBy) {
      const session = sessionStorage.getItem('vpsm_session');
      if (session) {
        try {
          const user = JSON.parse(session);
          this.enterBy = user.empCode ?? user.employeeNo ?? 'SYSTEM';
        } catch (e) {
          this.enterBy = 'SYSTEM';
        }
      }
    }

    // 3. Ensure we pass 'SUBMITTED' in the payload without prematurely altering 'this.status'
    const payload = this.buildRequest();
    payload.status = PassStatus.SUBMITTED;

    this.isSaving.set(true);
    const formData = this.buildFormData();

    // Workaround: ensure request blob inside formData has SUBMITTED status
    formData.set(
      'request',
      new Blob(
        [JSON.stringify(payload)],
        { type: 'application/json' }
      )
    );

    // 4. Send request based on mode
    if (this.registryId) {
      console.log("UPDATE MODE SUBMIT ID = ", this.registryId);
      this.http.put<PassRegistryResponseDTO>(
        `${API_CONFIG.PASS_UPDATE}/${this.registryId}`,
        formData,
        { headers: this.HEADERS }
      )
        .pipe(
          timeout(HTTP_TIMEOUT_MS),
          takeUntil(this.destroy$),
          finalize(() => this.isSaving.set(false))
        )
        .subscribe({
          next: (response) => {
            this.saved.set(true);
            this.saveSuccess.set('Pass submitted successfully.');
            this.registryId = response.id;
            this.passNo = response.passNo;
            this.status = response.reqStatus ?? PassStatus.SUBMITTED;

            // Refresh history table automatically
            if (this.showPassHistory() && this.registryId) {
              this.loadPassHistory(this.registryId);
            }
          },
          error: (err) => {
            console.error("Submit Error:", err);
            this.saveError.set(
              err?.error?.message ?? 'Unable to submit vehicle pass.'
            );
          }
        });
    } else {
      console.log("SAVE MODE SUBMIT");
      this.http.post<PassRegistryResponseDTO>(
        API_CONFIG.PASS_SAVE,
        formData,
        { headers: this.HEADERS }
      )
        .pipe(
          timeout(HTTP_TIMEOUT_MS),
          takeUntil(this.destroy$),
          finalize(() => this.isSaving.set(false))
        )
        .subscribe({
          next: (response) => {
            this.saved.set(true);
            this.saveSuccess.set('Pass submitted successfully.');
            this.registryId = response.id;
            this.passNo = response.passNo;
            this.status = response.reqStatus ?? PassStatus.SUBMITTED;

            if (this.showPassHistory() && this.registryId) {
              this.loadPassHistory(this.registryId);
            }
          },
          error: (err) => {
            console.error("Submit Error:", err);
            this.saveError.set(
              err?.error?.message ?? 'Unable to submit vehicle pass.'
            );
          }
        });
    }
  }

  private validateForm(): boolean {
    console.log("VALIDATION START");
    this.saveError.set('');

    if (!this.validateVehicle()) {
      console.log("Vehicle validation failed");
      return false;
    }
    if (!this.validateEmployee()) {
      console.log("Employee validation failed");
      return false;
    }
    if (!this.validateGateAndParking()) {
      console.log("Gate validation failed");
      return false;
    }
    if (!this.validateDocuments()) {
      console.log("Document validation failed");
      return false;
    }

    console.log("VALIDATION SUCCESS");
    return true;
  }

  //=====================================================
  // STATUS CONTROL
  //=====================================================
  isNew(): boolean {
    return this.registryId === null;
  }

  isSavedStatus(): boolean {
    return this.status === PassStatus.SAVED;
  }

  isSubmittedStatus(): boolean {
    return this.status === PassStatus.SUBMITTED;
  }

  isConfirmedStatus(): boolean {
    return this.status === PassStatus.CONFIRMED;
  }

  isModifyStatus(): boolean {
    return this.status === PassStatus.MODIFY;
  }

  isApprovedStatus(): boolean {
    return this.status === PassStatus.APPROVED;
  }

  //=====================================================
  // SECTION 13 : History
  //=====================================================
  togglePassHistory(): void {
    const open = !this.showPassHistory();
    this.showPassHistory.set(open);
    if (open && this.registryId && this.passHistory().length === 0) {
      this.loadPassHistory(this.registryId);
    }
  }

  private loadPassHistory(id: number): void {
    this.isLoadingPassHistory.set(true);
    this.passHistoryError.set('');

    this.http.get<HistoryRecord[]>(
      `${API_CONFIG.PASS_HISTORY}/${id}`,
      { headers: this.HEADERS }
    )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoadingPassHistory.set(false))
      )
      .subscribe({
        next: (response) => {
          this.passHistory.set(response ?? []);
        },
        error: (err) => {
          console.error(err);
          this.passHistoryError.set('Unable to load pass history.');
        }
      });
  }

  //=====================================================
  // Navigation
  //=====================================================
  goBackToPasses(): void {
    if (window.history.length > 1) {
      this.router.navigate(['/pass-list']);
    } else {
      this.router.navigate(['/']);
    }
  }
downloadDocument(doc: PassDocument): void {

  console.log("Document Object:", doc);

  alert("Document ID = " + doc.documentId);

}
}