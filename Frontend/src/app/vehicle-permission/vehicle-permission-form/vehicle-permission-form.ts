import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Subject, of, firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { catchError, finalize, takeUntil, switchMap } from 'rxjs/operators';
import {
  CvpsService,
  CreateRequestDTO,
  ApiResponse,
  WorkflowAction,
  RequestHistoryDTO, DepartmentDTO
} from '../../services/cvps.service';

import { environment } from '../../../environments/environment';

//Documents Interface
interface DocEntry {
  id: string;
  docType: string;
  docNo: string;
  validUpto: string;
  file: File | null;
  documentId?: number;
  existingFile?: string;         // Current filename used for save/update
  originalExistingFile?: string; // Filename loaded from DB (read-only reference)
  replaced?: boolean;
}

interface WorkflowRemarkEntry {
  id: string;
  stage: 'UPLOADER' | 'CONFIRMER' | 'VERIFIER' | 'APPROVER';
  action: string;
  remark: string;
  byName: string;
  byEmpCode: string;
  statusAfter: string;
  createdAt: string;
}

//Employee details
interface DriverPerson {
  id: string;
  role: string;
  empNo: string;
  eyeTestFile: File | null;
  eyeTestFileName: string;
  eyeTestExistingFile: string;
  eyeTestDate: string;
  eyeTestDocumentId?: number;
  employeeCode: string;
  name: string;
}

const ALLOWED_DOC_TYPES = ['RC', 'Insurance', 'PUC', 'Fitness'];

const VEHICLE_TYPE_MAP: Record<string, string> = {
  'Two Wheeler': 'TWO_WHEEL',
  'Four Wheeler': 'FOUR_WHEEL',
  'Heavy Vehicle': 'HEAVY',
  'Tractor': 'TRACTOR',
  'Crane': 'CRANE',
  'JCB': 'JCB',
  'Fork Lift': 'FORKLIFT',
  'Other': 'OTHER',
};

function emptyDoc(): DocEntry {
  return {
    id: crypto.randomUUID(),
    docType: '',
    docNo: '',
    validUpto: '',
    file: null,
    existingFile: undefined,
    originalExistingFile: undefined,
    replaced: false
  };
}

function emptyDriver(): DriverPerson {
  return {
    id: crypto.randomUUID(),
    role: 'Driver',
    empNo: '',
    eyeTestFile: null,
    eyeTestFileName: '',
    eyeTestExistingFile: '',
    eyeTestDate: '',
    employeeCode: '',
    name: '',
    eyeTestDocumentId: undefined
  };
}

@Component({
  selector: 'app-vehicle-permission-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vehicle-permission-form.html',
  styleUrl: './vehicle-permission-form.css',
})
export class VehiclePermissionFormComponent implements OnInit, OnDestroy {

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private cvps = inject(CvpsService);
  private destroy$ = new Subject<void>();
  private http = inject(HttpClient);

  readonly formNo = 'W-OHS-SECURITY-12';
  readonly companyName = 'HEG Limited, Mandideep';
  readonly requestDate = signal(new Date().toLocaleDateString('en-GB'));


  readonly category = 'Vehicle Entry';
  readonly isConfirmerMode = signal(false);
  readonly isVerifierMode = signal(false);
  readonly isApproverMode = signal(false);
  readonly isViewMode = signal(false);

  isReadOnlyMode(): boolean {
    return (
      this.isConfirmerMode() ||
      this.isVerifierMode() ||
      this.isApproverMode() ||
      this.isViewMode()
    );
  }

  onContractorCodeBlur(): void {
    if (this.isReadOnlyMode()) {
      return;
    }

    const code = this.contractorCode().trim().toUpperCase();

    // Save the trimmed value back to the signal
    this.contractorCode.set(code);

    // Clear previous values
    this.contractorName.set('');
    this.errorMsg.set('');

    // Don't call API for empty value
    if (!code) {
      return;
    }

    // Lookup contractor
    this.resolveContractorName(code);
  }

  status = signal('Draft');
  editingMode = signal(false);
  contractorCode = signal('');
  contractorName = signal('');
  department = signal('');
  reqDate = signal(new Date().toISOString().split('T')[0]);
  natureOfJob = signal('');
  permissionDateFrom = signal('');
  permissionDateTo = signal('');
  lastLoadedDocs = signal<DocEntry[]>([]);
  lastLoadedDrivers = signal<DriverPerson[]>([]);


  permissionDepartment = signal('');
  departments = signal<DepartmentDTO[]>([]);


  vehicleNumber = signal('');
  vehicleType = signal('');
  employeeNames = signal<Record<string, string>>({});

  readonly vehicleTypeOptions = [
    { label: 'Two Wheeler', value: 'TWO_WHEEL' },
    { label: 'Four Wheeler', value: 'FOUR_WHEEL' },
    { label: 'Heavy Vehicle', value: 'HEAVY' },
    { label: 'Tractor', value: 'TRACTOR' },
    { label: 'Crane', value: 'CRANE' },
    { label: 'JCB', value: 'JCB' },
    { label: 'Fork Lift', value: 'FORKLIFT' },
    { label: 'Other', value: 'OTHER' }
  ];
  readonly driverRoleOptions = ['Driver', 'Conductor', 'Helper', 'Other'];
  readonly jobTypeOptions = ['Helper', 'Supervisor', 'Technician', 'Laborer', 'Other'];
  readonly ALLOWED_DOC_TYPES = ALLOWED_DOC_TYPES;

  docs = signal<DocEntry[]>([]);
  drivers = signal<DriverPerson[]>([emptyDriver()]);

  isSaving = signal(false);
  isSubmitting = signal(false);
  isEditDataLoaded = signal(false);
  saveMsg = signal('');
  errorMsg = signal('');
  savedRequestNo = signal<number | null>(null);
  actionRemark = signal('');
  remarksHistory = signal<WorkflowRemarkEntry[]>([]);
  showWorkflowHistory = signal(false);

  ngOnInit(): void {

    this.loadDepartments();
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        console.log('FORM query params:', params);

        const mode = String(params['mode'] || '').toLowerCase();
        const view = String(params['view'] || '').toLowerCase();
        this.isViewMode.set(view === 'true' || mode === 'view');
        this.isConfirmerMode.set(mode === 'confirmer');
        this.isVerifierMode.set(mode === 'verifier');
        this.isApproverMode.set(mode === 'approver');

        const editId = params['edit'];
        console.log('FORM editId:', editId);

        if (!editId) {
          this.editingMode.set(false);
          this.isEditDataLoaded.set(true);
          this.savedRequestNo.set(null);
          this.remarksHistory.set([]);
          this.actionRemark.set('');
          this.showWorkflowHistory.set(false);
          this.loadLoggedInContractor();
          return;
        }

        const requestNo = Number(editId);
        console.log('FORM parsed requestNo:', requestNo);

        if (!requestNo || Number.isNaN(requestNo)) {
          this.errorMsg.set('Invalid request id.');
          this.editingMode.set(false);
          this.isEditDataLoaded.set(true);
          this.remarksHistory.set([]);
          this.actionRemark.set('');
          this.showWorkflowHistory.set(false);
          return;
        }

        this.editingMode.set(true);
        this.isEditDataLoaded.set(false);
        this.savedRequestNo.set(requestNo);
        this.showWorkflowHistory.set(false);

        console.log('Calling loadRemarkHistory:', requestNo);
        this.loadRemarkHistory(requestNo);
        this.loadRequest(requestNo);

      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  private loadDepartments(): void {
    this.cvps.getDepartments()
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('Failed to load department list:', err);
          this.errorMsg.set('Unable to load departments.');
          return of<DepartmentDTO[]>([]);
        })
      )
      .subscribe(departments => {
        const normalizedDepartments = (departments || []).map(department => ({
          ...department,
          deptCode: Number(department.deptCode),
          deptName: String(department.deptName || '').trim()
        }));

        this.departments.set(normalizedDepartments);

        console.log('Department options loaded:', normalizedDepartments);
        console.log('Current saved department:', this.permissionDepartment());
      });
  }
  private setSavedDepartment(deptCode: unknown): void {
    const code = String(deptCode ?? '').trim();

    if (!code) {
      this.permissionDepartment.set('');
      return;
    }

    this.permissionDepartment.set(code);
  }
  getSelectedDepartmentName(): string {
    const selectedCode = String(this.permissionDepartment() || '').trim();

    if (!selectedCode) {
      return '-';
    }

    const selectedDepartment = this.departments().find(
      department =>
        String(department.deptCode).trim() === selectedCode
    );

    return selectedDepartment?.deptName || selectedCode;
  }

  addDoc(): void {
    if (this.isReadOnlyMode()) return;
    if (this.docs().length >= ALLOWED_DOC_TYPES.length) return;
    this.docs.update(d => [...d, emptyDoc()]);
  }

  removeDoc(i: number): void {
    if (this.isReadOnlyMode()) return;
    this.docs.update(d => d.filter((_, idx) => idx !== i));
  }

  toggleWorkflowHistory(): void {
    this.showWorkflowHistory.update(v => !v);
  }

  closeView(): void {
    const nextUrl = this.isApproverMode()
      ? '/vehicle-permission/approver'
      : this.isConfirmerMode()
        ? '/vehicle-permission/confirmer'
        : '/vehicle-permission/list';

    this.router.navigate([nextUrl]);
  }

  availableDocTypes(currentDoc: DocEntry): string[] {
    const used = this.docs().filter(d => d !== currentDoc).map(d => d.docType).filter(Boolean);
    const available = ALLOWED_DOC_TYPES.filter(t => !used.includes(t));
    if (currentDoc.docType && !available.includes(currentDoc.docType)) {
      return [currentDoc.docType, ...available];
    }
    return available;
  }

  getDocumentUrl(fileName: string): string {
    return `${environment.cvpsBaseUrl}/api/documents/download/${fileName}`;
  }

  sendForModificationByConfirmer(): void {
    this.processFormSubmission('MODIFY');
  }

  confirmByConfirmer(): void {
    this.processFormSubmission('CONFIRMED');
  }

  rejectByConfirmer(): void {
    this.processFormSubmission('REJECTED');
  }
  sendForModificationByVerifier(): void {
    this.processFormSubmission('HOLD');
  }

  verifyByVerifier(): void {
    this.processFormSubmission('VERIFIED');
  }

  rejectByVerifier(): void {
    this.processFormSubmission('REJECTED');
  }

  sendForModificationByApprover(): void {
    this.processFormSubmission('HOLD');
  }

  approveByApprover(): void {
    this.processFormSubmission('APPROVED');
  }

  rejectByApprover(): void {
    this.processFormSubmission('REJECTED');
  }

  onDocTypeChange(doc: DocEntry): void {
    if (this.isReadOnlyMode()) return;
    const dupe = this.docs().filter(d => d !== doc && d.docType === doc.docType);
    if (dupe.length > 0) {
      const duplicateType = doc.docType;
      setTimeout(() => { doc.docType = ''; }, 0);
      this.errorMsg.set(`${duplicateType} is already added. Each type can appear only once.`);
    } else {
      this.errorMsg.set('');
    }
  }

  onDocNoInput(event: Event, doc: DocEntry): void {
    if (this.isReadOnlyMode()) return;
    const input = event.target as HTMLInputElement;
    doc.docNo = input.value.toUpperCase();
    input.value = doc.docNo;
  }

  onDocFileSelected(event: Event, doc: DocEntry): void {
    if (this.isReadOnlyMode()) return;

    const file = (event.target as HTMLInputElement).files?.[0];

    if (!file) {
      return;
    }

    this.docs.update(docs =>
      docs.map(d =>
        d.id === doc.id
          ? {
            ...d,
            file,
            replaced: true
          }
          : d
      )
    );
  }

  docAlreadyUploaded(doc: DocEntry): boolean {
    return !!doc.documentId && !!(doc.existingFile || doc.originalExistingFile);
  }

  private isVehicleDocComplete(doc: DocEntry): boolean {
    return !!(
      (doc.docType || '').trim() &&
      (doc.docNo || '').trim() &&
      doc.validUpto &&
      (doc.file || this.docAlreadyUploaded(doc))
    );
  }

  hasAllRequiredVehicleDocs(): boolean {
    const docs = this.docs();

    const requiredTypes = ['RC', 'Insurance'];

    const selectedTypes = docs
      .map(doc => (doc.docType || '').trim())
      .filter(Boolean);

    const allRequiredPresent = requiredTypes.every(type =>
      selectedTypes.includes(type)
    );

    const requiredDocsComplete = docs
      .filter(doc => requiredTypes.includes((doc.docType || '').trim()))
      .every(doc => this.isVehicleDocComplete(doc));

    return allRequiredPresent && requiredDocsComplete;
  }

  shortName(name: string): string {
    return name.length > 18 ? `${name.substring(0, 15)}...` : name;
  }

  addDriver(): void {
    if (this.isReadOnlyMode()) return;
    this.drivers.update(d => [...d, emptyDriver()]);
  }

  removeDriver(i: number): void {
    if (this.isReadOnlyMode()) return;
    this.drivers.update(d => d.filter((_, idx) => idx !== i));
  }

  onDriverAadhaarFile(event: Event, driver: DriverPerson): void {
    if (this.isReadOnlyMode()) return;

    const file = (event.target as HTMLInputElement).files?.[0];

    if (!file) {
      return;
    }

    this.drivers.update(list =>
      list.map(d =>
        d.id === driver.id
          ? {
            ...d,
            aadhaarFile: file,
            aadhaarFileName: file.name,
            aadhaarExistingFile: ''
          }
          : d
      )
    );
  }

  onDriverDlFile(event: Event, driver: DriverPerson): void {
    if (this.isReadOnlyMode()) return;

    const file = (event.target as HTMLInputElement).files?.[0];

    if (!file) {
      return;
    }

    this.drivers.update(list =>
      list.map(d =>
        d.id === driver.id
          ? {
            ...d,
            dlFile: file,
            dlFileName: file.name,
            dlExistingFile: ''
          }
          : d
      )
    );
  }

  onDriverPhotoFile(event: Event, driver: DriverPerson): void {
    if (this.isReadOnlyMode()) return;

    const file = (event.target as HTMLInputElement).files?.[0];

    if (!file) {
      return;
    }

    this.drivers.update(list =>
      list.map(d =>
        d.id === driver.id
          ? {
            ...d,
            photoFile: file,
            photoFileName: file.name,
            photoExistingFile: ''
          }
          : d
      )
    );
  }

  private dedupeVehicleDocuments(docs: any[]): any[] {
    const map = new Map<string, any>();

    for (const doc of docs || []) {
      const key = [
        String(doc?.documentType || '').trim().toUpperCase(),
        String(doc?.documentNo || '').trim().toUpperCase(),
        String(doc?.validTill || '').trim(),
        String(
          doc?.filename ||
          doc?.fileName ||
          doc?.documentName ||
          doc?.documentPath ||
          ''
        ).trim().toUpperCase()
      ].join('|');

      if (!map.has(key)) {
        map.set(key, doc);
      }
    }

    return Array.from(map.values());
  }

  private dedupeDocEntries(docs: DocEntry[]): DocEntry[] {
    const map = new Map<string, DocEntry>();

    for (const doc of docs || []) {
      const key = [
        (doc.docType || '').trim().toUpperCase(),
        (doc.docNo || '').trim().toUpperCase(),
        (doc.validUpto || '').trim(),
        (doc.originalExistingFile || doc.existingFile || doc.file?.name || '').trim().toUpperCase()
      ].join('|');

      if (!map.has(key)) {
        map.set(key, doc);
      }
    }

    return Array.from(map.values());
  }

  private resolveWorkflowStage(
    row: RequestHistoryDTO
  ): 'UPLOADER' | 'CONFIRMER' | 'VERIFIER' | 'APPROVER' {
    const action = String(row.actionTaken || '').trim().toUpperCase();

    const backendStage = String(
      (row as any).stage ||
      (row as any).workflowStage ||
      (row as any).actorRole ||
      (row as any).userType ||
      ''
    ).trim().toUpperCase();

    if (backendStage.includes('APPROVER')) return 'APPROVER';
    if (backendStage.includes('VERIFIER')) return 'VERIFIER';
    if (backendStage.includes('CONFIRMER')) return 'CONFIRMER';
    if (backendStage.includes('UPLOADER') || backendStage.includes('CREATOR')) {
      return 'UPLOADER';
    }

    if (['SAVED', 'DRAFT', 'SUBMITTED'].includes(action)) return 'UPLOADER';
    if (['CONFIRMED', 'MODIFY'].includes(action)) return 'CONFIRMER';
    if (['VERIFIED'].includes(action)) return 'VERIFIER';
    if (['APPROVED'].includes(action)) return 'APPROVER';

    if (action === 'HOLD' || action === 'REJECTED') {
      if (this.isApproverMode()) return 'APPROVER';
      if (this.isConfirmerMode()) return 'CONFIRMER';
    }

    return 'UPLOADER';
  }

  private loadRemarkHistory(requestNo: number): void {
    console.log('Inside loadRemarkHistory:', requestNo);
    this.cvps.getRequestHistory(requestNo)
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          console.error('Failed to load workflow history:', err);
          this.remarksHistory.set([]);
          return of([]);
        })
      )
      .subscribe((rows: RequestHistoryDTO[]) => {
        console.log('History API response:', rows);
        const mapped: WorkflowRemarkEntry[] = (rows || []).map((row, index) => {
          const stage = this.resolveWorkflowStage(row);

          return {
            id: String(row.historyId ?? index + 1),
            stage,
            action: row.actionTaken || '—',
            remark: String(row.remarks ?? '').trim(),
            byName: row.empNo || 'SYSTEM',
            byEmpCode: row.empNo || 'SYSTEM',
            statusAfter: row.actionTaken || '',
            createdAt: row.actionDate || ''
          };
        });
        mapped.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeA - timeB;
        });
        console.log('Mapped + Sorted history:', mapped);
        this.remarksHistory.set(mapped);
      });
  }

  private requiresWorkflowRemark(targetStatus: string): boolean {
    const statusUpper = (targetStatus || '').trim().toUpperCase();

    if (
      !this.isConfirmerMode() &&
      !this.isVerifierMode() &&
      !this.isApproverMode()
    ) {
      return false;
    }

    return [
      'CONFIRMED',
      'VERIFIED',
      'APPROVED',
      'REJECTED',
      'MODIFY',
      'HOLD'
    ].includes(statusUpper);
  }

  private validateWorkflowRemark(targetStatus: string): boolean {
    if (!this.requiresWorkflowRemark(targetStatus)) {
      return true;
    }

    const remark = this.actionRemark().trim();
    if (remark) {
      return true;
    }

    const statusUpper = (targetStatus || '').trim().toUpperCase();
    if (statusUpper === 'CONFIRMED') {
      this.errorMsg.set('Confirmer remark is required before confirm.');
    } else if (statusUpper === 'VERIFIED') {
      this.errorMsg.set('Verifier remark is required before verify.');
    } else if (statusUpper === 'APPROVED') {
      this.errorMsg.set('Approver remark is required before approve.');
    } else if (statusUpper === 'MODIFY' || statusUpper === 'HOLD') {
      this.errorMsg.set('Please enter modification remark before proceeding.');
    } else if (statusUpper === 'REJECTED') {
      this.errorMsg.set('Please enter rejection remark before proceeding.');
    } else {
      this.errorMsg.set('Remark is required.');
    }

    return false;
  }

  private buildWorkflowRemarkEntry(targetStatus: string): WorkflowRemarkEntry | null {
    if (!this.requiresWorkflowRemark(targetStatus)) {
      return null;
    }

    const remark = this.actionRemark().trim();
    if (!remark) {
      return null;
    }

    const statusUpper = (targetStatus || '').trim().toUpperCase();

    let action = statusUpper;
    if (statusUpper === 'CONFIRMED') action = 'Confirmed';
    else if (statusUpper === 'VERIFIED') action = 'Verified';
    else if (statusUpper === 'APPROVED') action = 'Approved';
    else if (statusUpper === 'MODIFY' || statusUpper === 'HOLD') {
      action = 'Sent for Modification';
    } else if (statusUpper === 'REJECTED') {
      action = 'Rejected';
    }

    const stage: 'UPLOADER' | 'CONFIRMER' | 'VERIFIER' | 'APPROVER' =
      this.isApproverMode()
        ? 'APPROVER'
        : this.isVerifierMode()
          ? 'VERIFIER'
          : this.isConfirmerMode()
            ? 'CONFIRMER'
            : 'UPLOADER';
    return {
      id: crypto.randomUUID(),
      stage,
      action,
      remark,
      byName: this.auth.empName() || stage,
      byEmpCode: this.auth.empCode() || 'SYSTEM',
      statusAfter: statusUpper,
      createdAt: new Date().toISOString()
    };
  }

  private appendWorkflowRemarkAfterSuccess(requestNo: number, targetStatus: string): void {
    const entry = this.buildWorkflowRemarkEntry(targetStatus);
    if (!entry) return;

    this.remarksHistory.update(list => [...list, entry]);
    this.actionRemark.set('');
  }

  formatRemarkDate(value: string): string {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleString('en-GB');
  }

  private loadRequest(requestNo: number): void {
    console.log('Loading Request:', requestNo);
    this.isEditDataLoaded.set(false);

    this.cvps.getRequestById(requestNo)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: dto => {
          console.log('API RESPONSE FULL:', dto);
          console.log('REQUEST OBJECT:', dto?.request);
          console.log('VEHICLE DOCUMENTS:', dto?.vehicleDocuments);
          console.log(
            'VEHICLE DOC FILENAMES:',
            (dto?.vehicleDocuments || []).map((d: any) => ({
              id: d?.id,
              documentType: d?.documentType,
              documentNo: d?.documentNo,
              filename: d?.filename,
              fileName: d?.fileName,
              documentName: d?.documentName,
              documentPath: d?.documentPath
            }))
          );
          console.log('EMPLOYEES:', dto?.employees);
          console.log(
            'EMPLOYEE DOCUMENTS:',
            (dto?.employees || []).map((e: any) => ({
              empName: e?.name,
              empJob: e?.empJob,
              documents: (e?.documents || []).map((d: any) => ({
                id: d?.id,
                documentType: d?.documentType,
                documentNo: d?.documentNo,
                filename: d?.filename,
                fileName: d?.fileName,
                documentName: d?.documentName,
                documentPath: d?.documentPath
              }))
            }))
          );

          if (!dto || !dto.request) {
            this.errorMsg.set('No request data found.');
            this.isEditDataLoaded.set(true);
            return;
          }

          this.fillForm(dto);
          this.editingMode.set(true);
          this.isEditDataLoaded.set(true);
        },
        error: err => {
          console.error('API ERROR:', err);
          this.errorMsg.set(
            err?.error?.message ||
            'Unable to load request'
          );
          this.isEditDataLoaded.set(true);
        }
      });
  }

  private formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    return String(dateStr).substring(0, 10);
  }

  private normalizeDocType(value: string | null | undefined): string {
    return (value || '').trim().toUpperCase().replace(/\s+/g, '_');
  }

  private isAadhaarDoc(value: string | null | undefined): boolean {
    const type = this.normalizeDocType(value);
    return ['AADHAAR', 'AADHAR', 'ADHAR', 'AADHAAR_CARD'].includes(type);
  }

  private isDlDoc(value: string | null | undefined): boolean {
    const type = this.normalizeDocType(value);
    return ['DL', 'LICENSE', 'DRIVING_LICENSE'].includes(type);
  }

  private isPhotoDoc(value: string | null | undefined): boolean {
    const type = this.normalizeDocType(value);
    return ['PHOTO', 'DRIVER_PHOTO', 'PHOTOGRAPH'].includes(type);
  }

  private getExistingFileName(doc: any): string {
    const raw = (
      doc?.filename ||
      doc?.fileName ||
      doc?.documentName ||
      doc?.documentPath ||
      ''
    );

    if (!raw) return '';
    return String(raw).split('/').pop() || String(raw);
  }

  private isModifiedLikeStatus(status: string | null | undefined): boolean {
    const s = (status || '').trim().toUpperCase();
    return s === 'MODIFY' || s === 'HOLD' || s === 'NEED MODIFICATION';
  }

  private cloneDocs(docs: DocEntry[]): DocEntry[] {
    return docs.map(d => ({
      ...d,
      file: d.file ?? null
    }));
  }

  private cloneDrivers(drivers: DriverPerson[]): DriverPerson[] {
    return drivers.map(d => ({
      ...d,
      aadhaarFile: null,
      dlFile: null,
      photoFile: null,
      eyeTestFile: null
    }));
  }

  private async fetchExistingAsFile(fileName: string): Promise<File | null> {
    try {
      const url = this.getDocumentUrl(fileName);
      const blob = await firstValueFrom(
        this.http.get(url, { responseType: 'blob' })
      );
      return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    } catch (e) {
      console.error('Failed to fetch existing file:', fileName, e);
      return null;
    }
  }

  private extractRequestNo(
    response: ApiResponse | null,
    fallback: number | null = null
  ): number | null {
    const raw = (response as any)?.data ?? fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private setDisplayStatus(rawStatus: string | null | undefined): void {
    const backendStatus = String(rawStatus || '').trim().toUpperCase();

    switch (backendStatus) {
      case 'SAVED':
      case 'DRAFT':
        this.status.set('Saved');
        break;
      case 'SUBMITTED':
        this.status.set('Submitted');
        break;
      case 'MODIFY':
        this.status.set('MODIFY');
        break;
      case 'HOLD':
        this.status.set('Hold');
        break;
      case 'APPROVED':
        this.status.set('Approved');
        break;
      case 'REJECTED':
        this.status.set('Rejected');
        break;
      default:
        this.status.set(rawStatus || 'Draft');
        break;
    }
  }

  private fillForm(dto: CreateRequestDTO): void {
    const req = dto.request;
    this.setSavedDepartment((req as any)?.deptCode);

    console.log(
      'Department restored after edit load:',
      this.permissionDepartment()
    );

    if ((req as any)?.reqStatus) {
      this.setDisplayStatus((req as any).reqStatus);
    }

    if ((req as any)?.createdDate) {
      this.reqDate.set(this.formatDate((req as any).createdDate));
    }

    const vehicleDocuments = this.dedupeVehicleDocuments(dto.vehicleDocuments || []);
    const mappedDocs: DocEntry[] = vehicleDocuments.map(doc => {
      const existing = this.getExistingFileName(doc) || undefined;

      return {
        id: crypto.randomUUID(),
        docType: (doc.documentType || '').trim(),
        docNo: (doc.documentNo || '').trim(),
        validUpto: this.formatDate(doc.validTill),
        file: null,
        documentId: doc.id,
        existingFile: existing,
        originalExistingFile: existing,
        replaced: false
      };
    });

    this.docs.set(mappedDocs);
    this.lastLoadedDocs.set(this.cloneDocs(mappedDocs));

    const employees = dto.employees || [];

    const mappedDrivers: DriverPerson[] = employees.map(emp => {
      const rawEyeTestDate = emp.eyeTestDate || '';
      const existingEyeTestFileName = emp.eyeTestFile || '';

      const employeeCode = String(emp.empNo ?? '').trim();

      const employeeName = String(
        (emp as any)?.empName ||
        (emp as any)?.EMP_NAME ||
        (emp as any)?.name ||
        (emp as any)?.NAME ||
        (emp as any)?.employeeName ||
        (emp as any)?.EMPLOYEE_NAME ||
        ''
      ).trim();

      return {
        id: crypto.randomUUID(),
        role: (emp.empType || 'Driver').trim(),
        empNo: employeeCode,

        // Preserve name if request-detail API already returns it.
        employeeCode,
        name: employeeName,

        eyeTestFile: null,
        eyeTestFileName: existingEyeTestFileName,
        eyeTestExistingFile: existingEyeTestFileName,
        eyeTestDate: this.formatDate(rawEyeTestDate),

        // This stores EmployeeDTO.id for edit/update context.
        eyeTestDocumentId: emp.id
      };
    });

    if (mappedDrivers.length > 0) {
      this.drivers.set(mappedDrivers);
      this.lastLoadedDrivers.set(this.cloneDrivers(mappedDrivers));
    } else {
      this.drivers.set([emptyDriver()]);
    }
    // Put names received in request details into the display lookup map.
    const initialEmployeeNames = mappedDrivers.reduce(
      (names, driver) => {
        if (driver.empNo && driver.name) {
          names[driver.empNo] = driver.name;
        }
        return names;
      },
      {} as Record<string, string>
    );

    if (Object.keys(initialEmployeeNames).length > 0) {
      this.employeeNames.update(names => ({
        ...names,
        ...initialEmployeeNames
      }));
    }

    // Fetch names missing from request details.
    // This intentionally works in read-only confirmer/verifier/approver modes.
    mappedDrivers.forEach(driver => {
      if (driver.empNo && !driver.name) {
        this.resolveEmployeeName(driver.empNo, driver.id);
      }
    });

    const contractorId = (req.contractorId || '').trim().toUpperCase();
    this.contractorCode.set(contractorId);
    this.contractorName.set('');

    if (contractorId) {
      this.resolveContractorName(contractorId);
    }

    this.natureOfJob.set(req.natureOfJob || '');
    this.vehicleNumber.set((req.vehicleNo || '').toUpperCase());
    this.vehicleType.set(req.vehicleType || '');
    this.permissionDateFrom.set('');
    this.permissionDateTo.set(this.formatDate(req.permissionTo || ''));
  }

  private resolveContractorName(contractorCode: string): void {
    this.cvps.fetchContractorDetails(contractorCode).subscribe({
      next: (bp: any) => {
        this.contractorCode.set(bp?.contractorCode || contractorCode);
        this.contractorName.set(bp?.contractorName || '');
      },
      error: () => {
        this.contractorName.set('');
        this.department.set('');      // NEWreadonly department = signal(this.auth.department() || 'Security');
        this.errorMsg.set(`Unable to fetch contractor details for code ${contractorCode}.`);
      }
    });
  }

  saveDraft(): void {
    this.processFormSubmission('SAVED');
  }

  submitForm(): void {
    this.processFormSubmission('SUBMITTED');
  }

  private validateForm(targetStatus: string): boolean {
    if (!this.contractorCode().trim()) {
      this.errorMsg.set('Contractor Code is required.');
      return false;
    }
    if (!this.contractorName().trim()) {
      this.errorMsg.set('Contractor Name is required.');
      return false;
    }
    if (!this.vehicleNumber().trim()) {
      this.errorMsg.set('Vehicle Number is required.');
      return false;
    }
    if (!this.vehicleType()) {
      this.errorMsg.set('Vehicle Type is required.');
      return false;
    }
    if (!this.natureOfJob().trim()) {
      this.errorMsg.set('Nature of Job is required.');
      return false;
    }
    if (!this.permissionDepartment()) {
      this.errorMsg.set('Department is required.');
      return false;
    }

    if (targetStatus === 'SUBMITTED') {
      if (!this.permissionDateTo()) {
        this.errorMsg.set('Permission Date To is invalid.');
        return false;
      }

      if (!this.hasAllRequiredVehicleDocs()) {
        this.errorMsg.set('RC and Insurance documents must be completed before submitting.');
        return false;
      }

      for (const doc of this.docs()) {
        if (!doc.docType || !doc.docNo.trim() || !doc.validUpto) {
          this.errorMsg.set(`Incomplete details for Document: ${doc.docType || 'Unknown'}`);
          return false;
        }
        if (!doc.file && !this.docAlreadyUploaded(doc)) {
          this.errorMsg.set(`Please upload a file for ${doc.docType}.`);
          return false;
        }
      }


      for (let idx = 0; idx < this.drivers().length; idx++) {
        const d = this.drivers()[idx];
        const label = `Person ${idx + 1}`;

        if (!d.role?.trim()) {
          this.errorMsg.set(`${label} Role is required.`);
          return false;
        }

        if (!d.empNo?.trim()) {
          this.errorMsg.set(`${label} Employee Code is required.`);
          return false;
        }

        if (d.role.trim().toUpperCase() === 'DRIVER') {
          if (!d.eyeTestDate?.trim()) {
            this.errorMsg.set(`${label} Eye Test Date is required.`);
            return false;
          }

          if (!d.eyeTestFile && !d.eyeTestExistingFile && !d.eyeTestFileName) {
            this.errorMsg.set(`${label} Eye Test File is required.`);
            return false;
          }
        }
      }
    }

    this.errorMsg.set('');
    return true;
  }
  private getItConfirmerCode(): number | undefined {
    const selectedDepartmentCode = String(
      this.permissionDepartment() || ''
    ).trim();

    const selectedDepartment = this.departments().find(
      department =>
        String(department.deptCode).trim() === selectedDepartmentCode
    );

    const departmentName = String(selectedDepartment?.deptName || '')
      .trim()
      .toUpperCase();

    // New routing rule:
    // Department IT must go to confirmer employee 636.
    if (departmentName === 'IT') {
      return 636;
    }

    // For every other department, preserve current routing.
    return undefined;
  }

  private buildCreatePayload(targetStatus: string): CreateRequestDTO {
    const confirmerEmpCode = this.getItConfirmerCode();

    return {
      request: {
        contractorId: this.contractorCode().trim().toUpperCase(),
        natureOfJob: this.natureOfJob().trim(),
        vehicleNo: this.vehicleNumber().trim().toUpperCase(),
        vehicleType: this.vehicleType(),
        permissionTo: this.permissionDateTo() || '',
        reqStatus: targetStatus.trim().toUpperCase(),
        createdBy: (this.auth.empCode() || 'SYSTEM').substring(0, 9).toUpperCase(),

        deptCode: Number(this.permissionDepartment()),
        ...(confirmerEmpCode !== undefined ? { confirmerEmpCode } : {}),

        userRemark:
          targetStatus.trim().toUpperCase() === 'SAVED'
            ? (this.actionRemark().trim() || 'Request updated')
            : this.actionRemark().trim()
      },

      vehicleDocuments: this.dedupeDocEntries(this.docs())
        .filter(doc =>
          (doc.docType || '').trim() ||
          (doc.docNo || '').trim() ||
          doc.validUpto ||
          doc.file ||
          doc.existingFile ||
          doc.originalExistingFile ||
          doc.documentId
        )
        .map(doc => ({
          id: doc.documentId,
          documentType: (doc.docType || '').trim(),
          documentNo: (doc.docNo || '').trim(),
          filename: doc.file ? doc.file.name : (doc.originalExistingFile || doc.existingFile || ''),
          validTill: doc.validUpto || null
        })),

      employees: this.drivers()
        .filter(driver =>
          (driver.role || '').trim() !== '' &&
          (driver.empNo || '').trim() !== ''
        )
        .map(driver => {
          const resolvedEyeTestFileName = driver.eyeTestFile
            ? driver.eyeTestFile.name
            : (driver.eyeTestExistingFile || driver.eyeTestFileName || '');

          return {
            empNo: Number(driver.empNo),
            empType: (driver.role || 'Driver').trim(),
            eyeTestFile: resolvedEyeTestFileName || undefined,
            eyeTestDate: driver.eyeTestDate || null
          };
        })
    };
  }

  private collectFiles(): File[] {
    const files: File[] = [];

    this.docs().forEach(doc => {
      if (doc.file) {
        files.push(doc.file);
      }
    });

    this.drivers().forEach(driver => {

      if (driver.eyeTestFile) {
        files.push(driver.eyeTestFile);
      }

    });

    return files;
  }

  private handleUpdateSuccess(targetStatus: string, activeId: number): void {
    const statusUpper = targetStatus.trim().toUpperCase();

    if (statusUpper === 'SAVED') {
      this.status.set('Saved');
      this.saveMsg.set('Form updated successfully!');
    } else if (statusUpper === 'HOLD' || statusUpper === 'MODIFY') {
      this.status.set('MODIFY');
      this.saveMsg.set('Request sent for modification successfully!');
    } else if (statusUpper === 'CONFIRMED') {
      this.status.set('Confirmed');
      this.saveMsg.set('Request confirmed successfully!');
    } else if (statusUpper === 'VERIFIED') {
      this.status.set('Verified');
      this.saveMsg.set('Request verified successfully!');
    } else if (statusUpper === 'APPROVED') {
      this.status.set('Approved');
      this.saveMsg.set('Request approved successfully!');
    } else if (statusUpper === 'REJECTED') {
      this.status.set('Rejected');
      this.saveMsg.set('Request rejected successfully!');
    } else {
      this.status.set('Submitted');
      this.saveMsg.set('Permission request updated successfully!');
    }

    const nextUrl = this.isApproverMode()
      ? '/vehicle-permission/approver'
      : this.isVerifierMode()
        ? '/vehicle-permission/verifier'
        : this.isConfirmerMode()
          ? '/vehicle-permission/confirmer'
          : '/vehicle-permission/list';

    setTimeout(() => {
      this.saveMsg.set('');
      this.router.navigate([nextUrl]);
    }, 2000);
  }

  private submitConfirmerWorkflow(targetAction: 'CONFIRM' | 'HOLD' | 'REJECT'): void {
    const requestNo = this.savedRequestNo();

    if (!requestNo) {
      this.errorMsg.set('Request number is missing.');
      return;
    }

    if (!this.actionRemark().trim()) {
      if (targetAction === 'CONFIRM') {
        this.errorMsg.set('Review action remark is required to confirm.');
      } else if (targetAction === 'HOLD') {
        this.errorMsg.set('Please state modification requirements in the remarks.');
      } else {
        this.errorMsg.set('Explicit rejection justification comment is mandatory.');
      }
      return;
    }

    const payload: WorkflowAction = {
      action: targetAction,
      remarks: this.actionRemark().trim(),
      empNo: this.auth.empCode() || 'SYSTEM'
    };

    const workflowCall =
      (this.cvps as any).executeWorkflowAction?.bind(this.cvps) ??
      (this.cvps as any).doWorkflowAction?.bind(this.cvps);

    if (!workflowCall) {
      this.errorMsg.set('Existing workflow API method not found in CvpsService.');
      return;
    }

    this.errorMsg.set('');
    this.saveMsg.set('');
    this.isSubmitting.set(true);

    workflowCall(requestNo, payload).pipe(
      takeUntil(this.destroy$),
      catchError((err: any) => {
        this.errorMsg.set(err?.error?.message || err?.message || 'Workflow execution failed');
        return of(null);
      }),
      finalize(() => {
        this.isSubmitting.set(false);
      })
    ).subscribe((response: ApiResponse | null) => {
      if (!response) return;

      if (targetAction === 'HOLD') {
        this.status.set('Modified');
        this.saveMsg.set('Request sent for modification successfully!');
      } else if (targetAction === 'CONFIRM') {
        this.status.set('Confirmed');
        this.saveMsg.set('Request confirmed successfully!');
      } else {
        this.status.set('Rejected');
        this.saveMsg.set('Request rejected successfully!');
      }

      this.actionRemark.set('');

      setTimeout(() => {
        this.saveMsg.set('');
        this.router.navigate(['/vehicle-permission/confirmer']);
      }, 1500);
    });
  }

  private async processFormSubmission(targetStatus: string): Promise<void> {
    if (!this.validateForm(targetStatus)) return;
    if (!this.validateWorkflowRemark(targetStatus)) return;

    this.errorMsg.set('');
    this.saveMsg.set('');

    if (targetStatus === 'SAVED') this.isSaving.set(true);
    else this.isSubmitting.set(true);

    const activeId = this.savedRequestNo();
    const isUpdate = !!activeId;

    try {

      const files = this.collectFiles();
      console.log('Collected Files:', files);

      files.forEach((f, i) => {
        console.log(`File ${i}:`, f.name);
      });

      const payload = this.buildCreatePayload(targetStatus);
      console.log('Payload = ', payload);
      console.log('Payload JSON = ', JSON.stringify(payload, null, 2));

      if (isUpdate && activeId) {
        this.cvps.updateRequest(activeId, payload, files).pipe(
          takeUntil(this.destroy$),
          catchError(err => {
            this.errorMsg.set(err?.error?.message || err?.message || 'Request update failed');
            return of(null);
          }),
          finalize(() => {
            this.isSubmitting.set(false);
            this.isSaving.set(false);
          })
        ).subscribe((response: ApiResponse | null) => {
          if (!response) return;

          const resolvedId = this.extractRequestNo(response, activeId);
          if (resolvedId) {
            this.savedRequestNo.set(resolvedId);
            this.editingMode.set(true);
          }
          if (
            this.isConfirmerMode() ||
            this.isVerifierMode() ||
            this.isApproverMode()
          ) {
            this.handleUpdateSuccess(targetStatus, resolvedId || activeId);
            return;
          }
          if (targetStatus === 'SUBMITTED') {
            this.status.set('Submitted');
          }
          this.saveMsg.set(
            targetStatus === 'SAVED'
              ? 'Form updated successfully!'
              : 'Request submitted successfully!'
          );

          if (targetStatus === 'SUBMITTED') {
            this.router.navigate(['/vehicle-permission/list']);
          } else if (resolvedId) {
            this.router.navigate([], {
              relativeTo: this.route,
              queryParams: { edit: resolvedId },
              queryParamsHandling: 'merge',
              replaceUrl: true
            });
          }
        });
        return;
      }

      // Fresh creation path
      this.cvps.createRequest(payload, files).pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.errorMsg.set(err?.error?.message || err?.message || 'Request creation failed');
          return of(null);
        }),
        finalize(() => {
          this.isSaving.set(false);
          this.isSubmitting.set(false);
        })
      ).subscribe((response: ApiResponse | null) => {
        if (!response) return;

        const resolvedId = this.extractRequestNo(response, null);
        if (resolvedId) {
          this.savedRequestNo.set(resolvedId);
          this.editingMode.set(true);
        }

        this.saveMsg.set(
          targetStatus === 'SAVED'
            ? 'Draft saved successfully'
            : 'Request submitted successfully'
        );

        if (targetStatus === 'SUBMITTED') {
          this.router.navigate(['/vehicle-permission/list']);
        } else if (resolvedId) {
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { edit: resolvedId },
            queryParamsHandling: 'merge',
            replaceUrl: true
          });
        }
      });
    } catch (err: any) {
      this.errorMsg.set(err?.message || 'Unexpected error while processing request.');
      this.isSaving.set(false);
      this.isSubmitting.set(false);
    }
  }

  private loadLoggedInContractor(): void {

    const code = this.auth.getUserCode();

    if (!code) {
      return;
    }

    if (!code.toUpperCase().startsWith('G')) {
      return;
    }

    this.cvps.fetchContractorDetails(code).subscribe({

      next: (bp: any) => {

        console.log('BP Record:', bp);

        this.contractorCode.set(bp.contractorCode || code);
        this.contractorName.set(bp.contractorName || '');

      },

      error: (err: any) => {
        console.error(err);
      }

    });

  }

  reset(): void {
    this.contractorCode.set('');
    this.contractorName.set('');
    this.reqDate.set(new Date().toISOString().split('T')[0]);
    this.natureOfJob.set('');
    this.permissionDateFrom.set('');
    this.permissionDateTo.set('');
    this.vehicleNumber.set('');
    this.vehicleType.set('');
    this.docs.set([]);
    this.drivers.set([emptyDriver()]);
    this.savedRequestNo.set(null);
    this.editingMode.set(false);
    this.isEditDataLoaded.set(true);
    this.status.set('Draft');
    this.saveMsg.set('');
    this.errorMsg.set('');
    this.actionRemark.set('');
    this.remarksHistory.set([]);
    this.showWorkflowHistory.set(false);
  }


  getStatusClass(status: string): string {
    switch ((status || '').trim().toUpperCase()) {
      case 'SUBMITTED':
        return 'wf-submitted';

      case 'CONFIRMED':
      case 'PENDING':
        return 'wf-pending';

      case 'WAITING':
        return 'wf-waiting';

      case 'VERIFIED':
        return 'wf-verified';

      case 'APPROVED':
        return 'wf-approved';

      case 'REJECTED':
        return 'wf-rejected';

      case 'HOLD':
      case 'MODIFY':
      case 'NEED MODIFICATION':
        return 'wf-hold';

      case 'SAVED':
      case 'DRAFT':
        return 'wf-draft';

      default:
        return 'wf-waiting';
    }
  }

  private resolveEmployeeName(
    empCode: string,
    driverId?: string
  ): void {
    const code = String(empCode || '').trim();

    if (!code) {
      return;
    }

    this.cvps.fetchEmployeeDetails(code)
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('Error fetching employee details:', err);
          return of(null);
        })
      )
      .subscribe((response: any) => {
        if (!response) {
          return;
        }

        let empData = response?.data ?? response;

        if (Array.isArray(empData)) {
          empData = empData[0] ?? null;
        }

        const fetchedName = String(
          empData?.empName ||
          empData?.EMP_NAME ||
          empData?.name ||
          empData?.NAME ||
          empData?.employeeName ||
          empData?.EMPLOYEE_NAME ||
          ''
        ).trim();

        if (!fetchedName) {
          return;
        }

        this.employeeNames.update(names => ({
          ...names,
          [code]: fetchedName
        }));

        if (driverId) {
          this.drivers.update(list =>
            list.map(driver =>
              driver.id === driverId
                ? { ...driver, name: fetchedName }
                : driver
            )
          );
        }
      });
  }
  onEmployeeCodeBlur(driver: DriverPerson): void {
    // Keep existing behavior: reviewer modes cannot edit employee code.
    if (this.isReadOnlyMode()) {
      return;
    }

    const code = String(driver.empNo || '').trim();
    driver.empNo = code;

    if (!code) {
      return;
    }

    this.resolveEmployeeName(code, driver.id);
  }

  // Eye Test Handlers
  onEyeTestFileSelected(event: Event, driver: DriverPerson): void {
    this.onDriverEyeTestFile(event, driver);
  }

  onDriverEyeTestFile(event: Event, driver: DriverPerson): void {
    if (this.isReadOnlyMode()) return;

    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.drivers.update(list =>
      list.map(d =>
        d.id === driver.id
          ? {
            ...d,
            eyeTestFile: file,
            eyeTestFileName: file.name,
            eyeTestExistingFile: file.name
          }
          : d
      )
    );
  }
  // <--- ADD THE NEW METHOD RIGHT HERE
  downloadEyeTestFile(driver: DriverPerson): void {
    const fileName = driver.eyeTestExistingFile || driver.eyeTestFileName;
    if (!fileName) return;

    if (driver.eyeTestFile) {
      this.cvps.triggerBlobDownload(driver.eyeTestFile, driver.eyeTestFile.name);
      return;
    }

    this.cvps.downloadDocument(fileName).pipe(
      takeUntil(this.destroy$),
      catchError(err => {
        console.error('Error downloading Eye Test document:', err);
        this.errorMsg.set(`Failed to download ${fileName}`);
        return of(null);
      })
    ).subscribe(blob => {
      if (blob) {
        this.cvps.triggerBlobDownload(blob, fileName);
      }
    });
  }
} // <--- End of VehiclePermissionFormComponent class