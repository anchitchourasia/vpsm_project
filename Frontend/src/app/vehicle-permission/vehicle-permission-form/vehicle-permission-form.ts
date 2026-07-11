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
  VehicleDocumentDTO,
  EmployeeDTO,
  EmployeeDocumentDTO
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

//Employee details
interface DriverPerson {
  id: string;
  role: string;
  name: string;
  mobileNo: string;
  aadhaarNo: string;
  licenseNo: string;
  licenseNumber?: string;
  licenseType: string;
  validFrom: string;
  validTo: string;
  aadhaarFile: File | null;
  aadhaarFileName: string;
  aadhaarExistingFile: string;
  dlFile: File | null;
  dlFileName: string;
  dlExistingFile: string;
  photoFile: File | null;
  photoFileName: string;
  photoExistingFile?: string;
  aadhaarDocumentId?: number;
  dlDocumentId?: number;
  photoDocumentId?: number;
  dbId?: number;
}

const ALLOWED_DOC_TYPES = ['RC', 'Insurance', 'PUC', 'Fitness', 'Load Test'];

const DRIVER_DOC_TYPES_UPPER = [
  'DL', 'LICENSE', 'DRIVING_LICENSE',
  'AADHAAR', 'AADHAR', 'ADHAR', 'AADHAAR_CARD',
  'PHOTO', 'DRIVER_PHOTO', 'PHOTOGRAPH',
];

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
    name: '',
    mobileNo: '',
    aadhaarNo: '',
    licenseNo: '',
    licenseNumber: '',
    licenseType: '',
    validFrom: '',
    validTo: '',
    aadhaarFile: null,
    aadhaarFileName: '',
    aadhaarExistingFile: '',
    dlFile: null,
    dlFileName: '',
    dlExistingFile: '',
    photoFile: null,
    photoFileName: '',
    photoExistingFile: '',
    aadhaarDocumentId: undefined,
    dlDocumentId: undefined,
    photoDocumentId: undefined,
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
  readonly department = signal(this.auth.department() || 'Security');
  readonly category = 'Vehicle Entry';
  readonly isConfirmerMode = signal(false);
  readonly isApproverMode = signal(false);

  isReadOnlyMode(): boolean {
    return this.isConfirmerMode() || this.isApproverMode();
  }

  status = signal('Draft');
  editingMode = signal(false);
  contractorCode = signal('');
  contractorName = signal('');
  reqDate = signal(new Date().toISOString().split('T')[0]);
  natureOfJob = signal('');
  permissionDateFrom = signal('');
  permissionDateTo = signal('');
  lastLoadedDocs = signal<DocEntry[]>([]);
  lastLoadedDrivers = signal<DriverPerson[]>([]);

  vehicleNumber = signal('');
  vehicleType = signal('');

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


  ngOnInit(): void {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const mode = String(params['mode'] || '').toLowerCase();
        this.isConfirmerMode.set(mode === 'confirmer');
        this.isApproverMode.set(mode === 'approver');


        const editId = params['edit'];

        if (!editId) {
          this.editingMode.set(false);
          this.isEditDataLoaded.set(true);
          this.savedRequestNo.set(null);
          return;
        }

        const requestNo = Number(editId);

        if (!requestNo || Number.isNaN(requestNo)) {
          this.errorMsg.set('Invalid request id.');
          this.editingMode.set(false);
          this.isEditDataLoaded.set(true);
          return;
        }

        this.editingMode.set(true);
        this.isEditDataLoaded.set(false);
        this.savedRequestNo.set(requestNo);
        this.loadRequest(requestNo);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

    if (docs.length !== this.ALLOWED_DOC_TYPES.length) {
      return false;
    }

    const selectedTypes = docs
      .map(doc => (doc.docType || '').trim())
      .filter(Boolean);

    const allTypesPresent = this.ALLOWED_DOC_TYPES.every(type =>
      selectedTypes.includes(type)
    );

    return allTypesPresent && docs.every(doc => this.isVehicleDocComplete(doc));
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

            // mark old file replaced
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

  onContractorCodeChange(typedCode: string): void {
    if (this.isReadOnlyMode()) return;
    const cleanCode = typedCode.trim().toUpperCase();
    this.contractorCode.set(cleanCode);
    this.contractorName.set('');
    this.errorMsg.set('');
    if (!cleanCode) return;

    this.resolveContractorName(cleanCode);
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
    return s === 'MODIFIED' || s === 'MODIFY' || s === 'HOLD' || s === 'NEED MODIFICATION';
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
      photoFile: null
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
      case 'CREATED':
      case 'SUBMITTED':
        this.status.set('Submitted');
        break;
      case 'MODIFIED':
      case 'MODIFY':
        this.status.set('Modified');
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

    if ((req as any)?.reqStatus) {
      this.setDisplayStatus((req as any).reqStatus);
    }

    if ((req as any)?.createdDate) {
      this.reqDate.set(this.formatDate((req as any).createdDate));
    }

    const vehicleDocuments = dto.vehicleDocuments || [];
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

    // ✅ FIX: Ensure array state is always populated directly from the valid array passed by the server
    this.docs.set(mappedDocs);
    this.lastLoadedDocs.set(this.cloneDocs(mappedDocs));

    const employees = dto.employees || [];
    const mappedDrivers: DriverPerson[] = employees.map(emp => {
      const photoDoc = emp.documents?.find(d => this.isPhotoDoc(d.documentType));
      const aadhaarDoc = emp.documents?.find(d => this.isAadhaarDoc(d.documentType));
      const dlDoc = emp.documents?.find(d => this.isDlDoc(d.documentType));

      return {
        id: crypto.randomUUID(),
        role: (emp.empJob || emp.empType || 'Driver').trim(),
        name: (emp.name || '').trim(),
        mobileNo: (emp.mobileNo || '').trim(),
        aadhaarNo: (aadhaarDoc?.documentNo || '').trim(),
        licenseNo: (dlDoc?.documentNo || '').trim(),
        licenseNumber: (dlDoc?.documentNo || '').trim(),
        licenseType: '',
        validFrom: this.formatDate(dlDoc?.validFrom),
        validTo: this.formatDate(dlDoc?.validTill),
        aadhaarFile: null,
        aadhaarFileName: '',
        aadhaarExistingFile: this.getExistingFileName(aadhaarDoc),
        dlFile: null,
        dlFileName: '',
        dlExistingFile: this.getExistingFileName(dlDoc),
        photoFile: null,
        photoFileName: '',
        photoExistingFile: this.getExistingFileName(photoDoc),
        aadhaarDocumentId: aadhaarDoc?.id,
        dlDocumentId: dlDoc?.id,
        photoDocumentId: photoDoc?.id,
      };
    });

    if (mappedDrivers.length > 0) {
      this.drivers.set(mappedDrivers);
      this.lastLoadedDrivers.set(this.cloneDrivers(mappedDrivers));
    } else {
      this.drivers.set([emptyDriver()]);
    }

    const contractorId = (req.contractorId || '').trim().toUpperCase();
    this.contractorCode.set(contractorId);
    this.contractorName.set('');

    if (contractorId) {
      this.resolveContractorName(contractorId);
    }

    this.natureOfJob.set(req.natureOfJob || '');
    this.vehicleNumber.set((req.vehicleNo || '').toUpperCase());
    this.vehicleType.set(req.vehicleType || '');
    this.permissionDateFrom.set(this.formatDate(req.permissionFrom || ''));
    this.permissionDateTo.set(this.formatDate(req.permissionTo || ''));
  }

  private resolveContractorName(contractorCode: string): void {
    this.cvps.fetchContractorDetails().pipe(
      takeUntil(this.destroy$),
      catchError(() => {
        this.errorMsg.set('⚠️ Could not reach employee server. Check connectivity.');
        return of([]);
      })
    ).subscribe((rows: any[]) => {
      if (!rows || rows.length === 0) {
        this.contractorName.set('');
        return;
      }

      const match = rows.find(
        r => r.contractorCode && String(r.contractorCode).trim().toUpperCase() === contractorCode.trim().toUpperCase()
      );

      if (match) {
        this.contractorName.set(String(match.name || '').toUpperCase());
        this.errorMsg.set('');
      } else {
        this.contractorName.set('');
      }
    });
  }

  saveDraft(): void {
    this.processFormSubmission('SAVED');
  }

  submitForm(): void {
    this.processFormSubmission('CREATED');
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

    if (targetStatus === 'CREATED') {
      const today = this.reqDate();
      if (!this.permissionDateFrom() || this.permissionDateFrom() < today) {
        this.errorMsg.set('Permission Date From cannot be blank or a past date.');
        return false;
      }
      if (!this.permissionDateTo() || this.permissionDateTo() < this.permissionDateFrom()) {
        this.errorMsg.set('Permission Date To is invalid.');
        return false;
      }
      if (!this.hasAllRequiredVehicleDocs()) {
        this.errorMsg.set(
          `All ${this.ALLOWED_DOC_TYPES.length} required vehicle documents must be completed before submitting.`
        );
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
        const label = `Person ${idx + 1} (${d.role || 'Unknown'})`;

        if (!d.name.trim()) {
          this.errorMsg.set(`${label}: Name is required.`);
          return false;
        }
        if (!d.aadhaarNo?.trim()) {
          this.errorMsg.set(`${label}: Aadhaar Number is required.`);
          return false;
        }
        if (!d.aadhaarFile && !d.aadhaarExistingFile) {
          this.errorMsg.set(`${label}: Aadhaar Copy is required.`);
          return false;
        }

        if ((d.role || '').toUpperCase() === 'DRIVER') {
          if (!d.licenseNo?.trim()) {
            this.errorMsg.set(`${label}: License Number is required.`);
            return false;
          }
          if (!d.validFrom) {
            this.errorMsg.set(`${label}: License Valid From is required.`);
            return false;
          }
          if (!d.validTo) {
            this.errorMsg.set(`${label}: License Valid To is required.`);
            return false;
          }
          if (!d.dlFile && !d.dlExistingFile) {
            this.errorMsg.set(`${label}: Driving License Copy is required.`);
            return false;
          }
        }
      }
    }

    this.errorMsg.set('');
    return true;
  }

  private buildCreatePayload(targetStatus: string): CreateRequestDTO {
    return {
      request: {
        contractorId: this.contractorCode().trim().toUpperCase(),
        natureOfJob: this.natureOfJob().trim(),
        vehicleNo: this.vehicleNumber().trim().toUpperCase(),
        vehicleType: this.vehicleType(),
        permissionFrom: this.permissionDateFrom() || '',
        permissionTo: this.permissionDateTo() || '',
        reqStatus: targetStatus.trim().toUpperCase(),
        createdBy: (this.auth.empCode() || 'SYSTEM').substring(0, 9).toUpperCase()
      },

      vehicleDocuments: this.docs()
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
          // filename:
          //   doc.originalExistingFile ||
          //   doc.existingFile ||
          //   doc.file?.name ||
          //   '',
          filename: doc.file ? doc.file.name : (doc.originalExistingFile || doc.existingFile || ''),
          validFrom: this.reqDate(),
          validTill: doc.validUpto || null
        })),

      employees: this.drivers()
        .filter(driver =>
          (driver.name || '').trim() ||
          (driver.mobileNo || '').trim() ||
          (driver.aadhaarNo || '').trim() ||
          (driver.licenseNo || '').trim() ||
          driver.aadhaarExistingFile ||
          driver.dlExistingFile ||
          driver.photoExistingFile ||
          driver.aadhaarFile ||
          driver.dlFile ||
          driver.photoFile
        )
        .map(driver => {
          const role = (driver.role || '').trim();
          const isDriver = role.toUpperCase() === 'DRIVER';
          const documents: any[] = [];

          if ((driver.aadhaarNo || '').trim() || driver.aadhaarExistingFile || driver.aadhaarFile || driver.aadhaarDocumentId) {
            documents.push({
              id: driver.aadhaarDocumentId,
              documentType: 'AADHAAR',
              documentNo: (driver.aadhaarNo || '').trim(),
              // filename:
              //   driver.aadhaarFile
              //     ? driver.aadhaarFile.name
              //     : driver.aadhaarExistingFile || '',
              // filename: driver.dlFile ? undefined : (driver.dlExistingFile || ''),
              filename:
                driver.aadhaarFile
                  ? driver.aadhaarFile.name
                  : (driver.aadhaarExistingFile || ''),
              validFrom: this.reqDate(),
              validTill: null
            });
          }

          if (isDriver && ((driver.licenseNo || '').trim() || driver.dlExistingFile || driver.dlFile || driver.dlDocumentId)) {
            documents.push({
              id: driver.dlDocumentId,
              documentType: 'DRIVING_LICENSE',
              // documentType: 'DRIVINGLICENSE',
              documentNo: driver.licenseNo.trim(),
              filename:
                driver.dlFile
                  ? driver.dlFile.name
                  : driver.dlExistingFile || '',
              validFrom: driver.validFrom,
              validTill: driver.validTo
            });
          }

          if (driver.photoFile || driver.photoExistingFile || driver.photoDocumentId) {
            documents.push({
              id: driver.photoDocumentId,
              documentType: 'PHOTO',
              documentNo: '',
              filename:
                driver.photoFile
                  ? driver.photoFile.name
                  : driver.photoExistingFile || '',
              validFrom: this.reqDate(),
              validTill: null
            });
          }

          return {
            empNo: driver.dbId || null,
            name: (driver.name || '').trim(),
            mobileNo: (driver.mobileNo || '').trim(),
            empType: role,
            empJob: role,
            documents
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

      if (driver.aadhaarFile) {
        files.push(driver.aadhaarFile);
      }

      if (driver.dlFile) {
        files.push(driver.dlFile);
      }

      if (driver.photoFile) {
        files.push(driver.photoFile);
      }

    });

    return files;
  }
  private handleUpdateSuccess(targetStatus: string, activeId: number): void {
    const statusUpper = targetStatus.trim().toUpperCase();

    if (statusUpper === 'SAVED') {
      this.status.set('Saved');
      this.saveMsg.set('Form updated successfully!');
    } else if (statusUpper === 'MODIFY') {
      this.status.set('Modified');
      this.saveMsg.set('Request sent for modification successfully!');
    } else if (statusUpper === 'CONFIRMED') {
      this.status.set('Confirmed');
      this.saveMsg.set('Request confirmed successfully!');
    } else if (statusUpper === 'REJECTED') {
      this.status.set('Rejected');
      this.saveMsg.set('Request rejected successfully!');
    } else {
      this.status.set('Submitted');
      this.saveMsg.set('Permission request updated successfully!');
    }

    const nextUrl = this.isConfirmerMode()
      ? '/vehicle-permission/confirmer'
      : '/vehicle-permission/list';

    setTimeout(() => {
      this.saveMsg.set('');
      this.router.navigate([nextUrl]);
    }, 2000);
  }

  private async processFormSubmission(targetStatus: string): Promise<void> {
    if (!this.validateForm(targetStatus)) return;

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
        // We directly pass the clean payload to updateRequest, bypassing the broken merge functions!
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
          if (this.isConfirmerMode()) {
            this.handleUpdateSuccess(targetStatus, resolvedId || activeId);
            return;
          }
          if (targetStatus === 'CREATED') {
            this.status.set('Submitted');
          }
          this.saveMsg.set(
            targetStatus === 'SAVED'
              ? 'Form updated successfully!'
              : 'Request submitted successfully!'
          );


          if (targetStatus === 'CREATED') {
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

        if (targetStatus === 'CREATED') {
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
  }

  getStatusClass(status: string): string {
    switch ((status || '').trim().toUpperCase()) {
      case 'SUBMITTED':
      case 'CREATED':
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
      case 'MODIFIED':
      case 'NEED MODIFICATION':
        return 'wf-hold';

      case 'SAVED':
      case 'DRAFT':
        return 'wf-draft';

      default:
        return 'wf-waiting';
    }
  }
}