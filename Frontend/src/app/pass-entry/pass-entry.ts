import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { takeUntil, timeout, catchError, finalize } from 'rxjs/operators';

import { API_CONFIG } from '../core/api.config';
import { PassStateService, PassRecord } from '../services/pass-state.service';
import { AuthService } from '../core/auth.service';

const HTTP_TIMEOUT_MS = 12000;

interface DocEntry {
  id: string;
  docType: string;
  docNo: string;
  validUpto: string;

  file: File | null;          // Actual PDF
  fileName?: string;          // Selected file name

  documentId?: number;
  existingFile?: string;
}

interface EmployeeLookupResponse {
  id?: number | string;
  employeeNo?: string;
  employeeCode?: string;
  name?: string;
  deptCode?: string;
  deptName?: string;
  contractorCode?: string;
  contractorNo?: string;
  contractorName?: string;
  aadhaarNo?: string;
  aadharNo?: string;
  aadhar?: string;
  empType?: string;
  email?: string;
  agencyName?: string;
}

export const PASS_STATUS = {
  DRAFT: 'SAVED',
  SUBMITTED: 'SUBMITTED',
  MODIFY: 'MODIFY',
  CONFIRMED: 'CONFIRMED',
  APPROVED: 'APPROVED',
  REGRETTED: 'REGRETTED'
} as const;

const ALLOWED_DOC_TYPES = ['RC', 'PUC', 'INSURANCE', 'LICENSE'];

function formatPassId(dbPassId: number | string): string {
  return String(dbPassId);
}

function detectVehicleClass(vehicleType: string): string {
  const v = vehicleType.toLowerCase().trim();
  if (!v) return '';

  const heavy = [
    'jcb', 'excavator', 'crane', 'dozer', 'bulldozer', 'loader',
    'dumper', 'truck', 'tipper', 'tanker', 'trailer', 'tractor',
    'forklift', 'grader', 'roller', 'mixer', 'transit', 'compactor',
    'paver', 'harvester', 'backhoe', 'rig', 'machinery', 'heavy'
  ];

  const twoWheeler = [
    'bike', 'motorcycle', 'scooter', 'activa', 'scooty',
    'moped', 'two wheeler', 'twowheeler', 'pulsar', 'splendor',
    'bullet', 'bajaj', 'hero', 'tvs', 'honda', 'yamaha', 'ktm',
    'royal enfield', 'suzuki', 'access', 'unicorn', 'shine'
  ];

  if (heavy.some(k => v.includes(k))) return 'Heavy_Machinery';
  if (twoWheeler.some(k => v.includes(k))) return 'Two_Wheeler';
  return 'Four_Wheeler';
}

function emptyDoc(): DocEntry {
  return {
    id: crypto.randomUUID(),
    docType: '',
    docNo: '',
    validUpto: '',
    file: null,
    fileName: ''
  };
}

@Component({
  selector: 'app-pass-entry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pass-entry.html',
  styleUrl: './pass-entry.css'
})
export class PassEntry implements OnInit, OnDestroy {
  protected readonly ALLOWED_DOC_TYPES = ALLOWED_DOC_TYPES;
  private destroy$ = new Subject<void>();

  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });

  private readonly MULTIPART_HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY
  });

  empType = signal<'Company_Employee' | 'Contractor' | ''>('');
  passId = signal('');
  passIdGenerated = signal(false);
  fetchingEmployee = signal(false);
  empFetchError = signal('');
  empName = signal('');
  empDept = signal('');
  empType_display = signal('');
  empDeptCode = signal('');
  empTypeDetail = signal<'TACC' | 'HEG' | 'CONTRACT' | ''>('');
  empAadhar = signal('');
  docs = signal<DocEntry[]>([emptyDoc()]);
  isSaving = signal(false);
  saved = signal(false);
  saveSuccess = signal('');
  saveError = signal('');
  modificationRemark = signal('');
  isModificationMode = signal(false);

  vehicleNo = '';
  vehicleType = '';
  brandModel = '';
  vehicleClass = '';
  ecNo = '';
  contractorCode = '';
  gateNo = '';
  parkingArea = '';
  remark = '';

  empContractorCode = '';
  empContractorName = '';
  contractorName = '';
  contractorEmail = '';
  empEmail = '';
  empSalary = '';
  empContractorEmail = '';

  private empData: EmployeeLookupResponse | null = null;
  private savedVehicleId: number | null = null;
  private savedPassRegistryId: number | null = null;
  private draftPassId: string | null = null;

  constructor(
    private http: HttpClient,
    private router: Router,
    private passState: PassStateService,
    private auth: AuthService
  ) { }

  get todayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  get isEcNoLocked(): boolean {
    return false;
  }

  ngOnInit(): void {
    if (this.auth.isRegularUser && this.auth.isRegularUser() && this.auth.empCode && this.auth.empCode()) {
      this.ecNo = this.auth.empCode() ?? '';
    }

    const draft = this.passState.resumeDraftData();
    if (draft) {
      this.loadPassRecord(draft, true);
      this.passState.clearResumeDraft();
      return;
    }

    const modData = this.passState.resumeModData();
    if (modData) {
      this.loadPassRecord(modData, false);
      this.passState.clearResumeMod();
      this.isModificationMode.set(true);
      this.modificationRemark.set(modData.confirmerRemark || '');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  private normalizeEmpTypeDetail(value: any): 'TACC' | 'HEG' | 'CONTRACT' | '' {
    const v = String(value || '').trim().toUpperCase();

    if (!v) return '';

    if (v === 'TACC') return 'TACC';
    if (v === 'HEG') return 'HEG';
    if (v === 'CONTRACT' || v === 'CONTRACTOR') return 'CONTRACT';

    if (v === 'COMPANY_EMPLOYEE' || v === 'COMPANY EMPLOYEE') return '';
    return '';
  }

  private loadPassRecord(data: any, isDraft: boolean): void {
    console.log('LOAD PASS RECORD DATA', data);
    console.log('LOAD PASS RECORD DOCS RAW', data.docs || data.documents);

    this.empType.set('Company_Employee');

    const loadedPassId = String(data.passId ?? data.id ?? '').trim();
    this.passId.set(loadedPassId);
    this.passIdGenerated.set(!!loadedPassId);

    this.vehicleNo = data.vehicleNo || data.vehicleNoo || '';
    this.vehicleType = data.vehicleType || '';
    this.vehicleClass = data.vehicleClass || '';
    this.brandModel = data.brandModel || '';

    this.ecNo = data.ecNo || data.employeeNo || data.employeeCompanyNo || '';
    this.contractorCode = data.contractorCode || data.contractorFirm || '';
    this.gateNo = data.gateNo || '';
    this.parkingArea = data.parkingArea || data.parkingToBeUsed || '';
    this.remark = data.remark || data.remarks || '';

    this.empName.set(data.empName || data.employeeName || '');
    this.empDept.set(data.empDept || data.dept || '');
    this.empAadhar.set(data.empAadhar || data.aadhaarNo || data.aadharNo || '');
    this.empDeptCode.set(data.empDeptCode || data.deptCode || '');
    const rawEmpTypeDetail =
      data.empTypeDetail ??
      data.empTypeDisplay ??
      data.employeeType ??
      data.employeeTypeDetail ??
      data.empTypeName ??
      data.employeeCategory ??
      '';

    const normalizedEmpTypeDetail = this.normalizeEmpTypeDetail(rawEmpTypeDetail);

    this.empTypeDetail.set(normalizedEmpTypeDetail);
    this.empType_display.set(normalizedEmpTypeDetail);

    this.empContractorCode = data.empContractorCode || data.contractorCode || '';
    this.empContractorName = data.empContractorName || data.contractorName || '';
    this.contractorName = data.contractorName || data.contractorFirm || data.empContractorName || '';

    const docs = data.docs || data.documents || [];

    this.docs.set(
      Array.isArray(docs) && docs.length
        ? docs.map((d: any) => {
          const existing =
            d.fileName ||
            d.filename ||
            d.existingFile ||
            d.documentName ||
            d.documentPath ||
            '';

          return {
            id: crypto.randomUUID(),
            docType: d.docType || d.documentType || '',
            docNo: d.docNo || d.documentNo || '',
            validUpto: d.validUpto || d.expiryDate || d.validTill || '',
            file: null,
            fileName: existing,
            documentId: d.documentId ?? d.id ?? d.docId ?? d.vehicleDocumentId ?? null,
            existingFile: existing
          };
        })
        : [emptyDoc()]
    );

    console.log('LOAD PASS ID =>', loadedPassId);
    console.log('PASS ID SIGNAL AFTER LOAD =>', this.passId());
    console.log('DOCS AFTER LOAD =>', this.docs());

    this.saved.set(isDraft);
    this.savedPassRegistryId = loadedPassId ? Number(loadedPassId) : null;
    this.savedVehicleId = data.vehicleId ? Number(data.vehicleId) : null;
    this.draftPassId = loadedPassId || null;
  }

  setEmpType(type: 'Company_Employee' | 'Contractor'): void {
    this.empType.set(type);
    this.empTypeDetail.set('');
    this.ecNo = '';
    this.contractorCode = '';
    this.empName.set('');
    this.empDept.set('');
    this.empAadhar.set('');
    this.empDeptCode.set('');
    this.empType_display.set('');
    this.empFetchError.set('');
    this.empContractorCode = '';
    this.empContractorName = '';
    this.contractorName = '';
    this.contractorEmail = '';
    this.empData = null;
    this.clearAlerts();
  }

  onEmpTypeDetailChange(value: 'TACC' | 'HEG' | 'CONTRACT' | ''): void {
    this.empTypeDetail.set(value);
    this.ecNo = '';
    this.empName.set('');
    this.empDept.set('');
    this.empAadhar.set('');
    this.empDeptCode.set('');
    this.empFetchError.set('');
    this.empType_display.set('');
    this.empContractorCode = '';
    this.empContractorName = '';
    this.contractorName = '';
    this.contractorEmail = '';
    this.empData = null;
    this.clearAlerts();
  }

  onVehicleTypeInput(event: Event | string): void {
    const val = typeof event === 'string' ? event : (event.target as HTMLInputElement).value;
    this.vehicleType = val;
    this.vehicleClass = detectVehicleClass(val);
  }

  onUpperInput(event: Event, field: keyof PassEntry): void {
    const input = event.target as HTMLInputElement;
    const val = input.value.toUpperCase().replace(/\s+/g, '');
    (this as any)[field] = val;
    input.value = val;
  }

  onDocNoInput(event: Event, doc: DocEntry): void {
    const input = event.target as HTMLInputElement;
    doc.docNo = input.value.toUpperCase();
    input.value = doc.docNo;
  }

  onEcNoBlur(): void {
    const code = this.ecNo.trim().toUpperCase();
    if (!code) return;

    this.empFetchError.set('');
    this.empName.set('');
    this.empDept.set('');
    this.empAadhar.set('');
    this.empDeptCode.set('');
    this.empType_display.set('');
    this.empContractorCode = '';
    this.empContractorName = '';
    this.contractorName = '';
    this.contractorEmail = '';
    this.empData = null;
    this.fetchingEmployee.set(true);

    const url = `${API_CONFIG.EMPLOYEE_REPORT}/${encodeURIComponent(code)}`;

    this.http.get<any>(url, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          this.empFetchError.set(
            `Could not fetch employee details (${err?.status ?? 'network error'})`
          );
          return of(null);
        }),
        finalize(() => this.fetchingEmployee.set(false))
      )
      .subscribe(res => {
        if (!res) return;

        const selectedDetail = (this.empTypeDetail() || '').toUpperCase().trim();
        const apiEmpType = String(res.empType || '').toUpperCase().trim();

        if (selectedDetail && apiEmpType && selectedDetail !== apiEmpType) {
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

          this.empFetchError.set(
            `Mismatch: EC No "${code}" belongs to "${apiEmpType}", not "${selectedDetail}". Please select the correct Employee Type.`
          );
          return;
        }

        this.empData = res;
        this.empName.set(String(res.name || ''));
        this.empDept.set(String(res.deptName || '').toUpperCase());
        this.empDeptCode.set(String(res.deptCode || ''));
        this.empAadhar.set(String(res.aadhaarNo || res.aadharNo || res.aadhar || ''));
        this.empType_display.set(apiEmpType);
        this.empContractorCode = String(res.contractorCode || '');
        this.empContractorName = String(res.contractorName || '');
        this.contractorName = String(res.contractorName || res.agencyName || '');
        this.empFetchError.set('');
      });
  }

  addDoc(): void {
    if (this.docs().length >= ALLOWED_DOC_TYPES.length) return;
    this.docs.update(d => [...d, emptyDoc()]);
  }

  removeDoc(i: number): void {
    const updated = this.docs().filter((_, idx) => idx !== i);
    this.docs.set(updated.length ? updated : [emptyDoc()]);
  }

  availableDocTypes(currentDoc: DocEntry): string[] {
    const used = this.docs().filter(d => d !== currentDoc).map(d => d.docType).filter(Boolean);
    const available = ALLOWED_DOC_TYPES.filter(t => !used.includes(t));
    if (currentDoc.docType && !available.includes(currentDoc.docType)) {
      return [currentDoc.docType, ...available];
    }
    return available;
  }

  onDocTypeChange(doc: DocEntry): void {
    const dupe = this.docs().filter(d => d !== doc && d.docType === doc.docType);
    if (dupe.length > 0) {
      const current = doc.docType;
      setTimeout(() => { doc.docType = ''; }, 0);
      this.saveError.set(`${current} is already added. Each type can appear only once.`);
    } else {
      this.clearAlerts();
    }
  }

  onDocFileSelected(event: Event, doc: DocEntry): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    if (file.type !== 'application/pdf') {
      this.saveError.set('Only PDF files are allowed.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.saveError.set('File must be under 10 MB.');
      return;
    }

    this.docs.update(list =>
      list.map(d =>
        d.id === doc.id
          ? {
            ...d,
            file: file,
            fileName: file.name,
            existingFile: undefined
          }
          : d
      )
    );

    this.clearAlerts();
  }

  docAlreadyUploaded(doc: DocEntry): boolean {
    return !!((doc.existingFile || doc.fileName) && !doc.file);
  }

  shortName(name: string): string {
    return name.length > 18 ? name.substring(0, 15) + '...' : name;
  }

  formatDateDDMMYYYY(isoDate: string): string {
    if (!isoDate || isoDate.length < 10) return isoDate ?? '';
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
  }

  openDatePicker(input: HTMLInputElement): void {
    try { (input as any).showPicker(); } catch { input.click(); }
  }

  validate(isSubmit: boolean): string {
    if (!this.vehicleNo.trim()) return 'Vehicle No is required.';
    if (!this.vehicleType.trim()) return 'Vehicle Type is required.';
    if (!this.brandModel.trim()) return 'Brand / Model is required.';
    if (this.empType() === 'Company_Employee' && !this.ecNo.trim()) return 'EC No is required.';
    if (!this.gateNo.trim()) return 'Gate No is required.';
    if (!this.parkingArea.trim()) return 'Parking Area is required.';

    if (this.empType() === 'Company_Employee') {
      const selectedDetail = (this.empTypeDetail() || '').toUpperCase().trim();
      const fetchedType = (this.empType_display() || '').toUpperCase().trim();

      if (!selectedDetail) return 'Employee Type detail is required.';
      if (!this.empName().trim()) return 'Valid employee details are required.';
      if (selectedDetail && fetchedType && selectedDetail !== fetchedType) {
        return `Employee Type mismatch: selected "${selectedDetail}" but employee belongs to "${fetchedType}".`;
      }
    }

    if (this.empType() === 'Contractor') {
      if (!this.contractorCode.trim()) return 'Contractor Code is required.';
      if (!this.contractorName.trim()) return 'Contractor Name is required.';
    }

    for (const doc of this.docs()) {
      const hasAnyValue =
        !!doc.docType ||
        !!doc.docNo.trim() ||
        !!doc.validUpto ||
        !!doc.file ||
        !!doc.fileName ||
        !!doc.existingFile;

      if (!hasAnyValue) continue;

      if (!doc.docType) return 'Select Document Type for all started document rows.';
      if (!doc.docNo.trim()) return `Document No is required for ${doc.docType || 'document row'}.`;
      if (!doc.validUpto) return `Valid Upto date is required for ${doc.docType || 'document row'}.`;

      if (!doc.file && !this.docAlreadyUploaded(doc)) {
        return `Please upload a PDF file for ${doc.docType || 'document row'}.`;
      }
    }

    if (isSubmit) {
      const requiredTypes = ['RC', 'PUC', 'INSURANCE', 'LICENSE'];

      const docsByType = this.docs().filter(doc => {
        const type = (doc.docType || '').trim().toUpperCase();
        return requiredTypes.includes(type);
      });

      if (docsByType.length !== 4) {
        const missing = requiredTypes.filter(type =>
          !docsByType.some(doc => (doc.docType || '').trim().toUpperCase() === type)
        );
        return `All 4 documents are mandatory for submit. Missing: ${missing.join(', ')}.`;
      }

      for (const type of requiredTypes) {
        const doc = docsByType.find(d => (d.docType || '').trim().toUpperCase() === type);

        if (!doc) {
          return `${type} document is missing.`;
        }

        if (!doc.docNo.trim()) {
          return `Document No is required for ${type}.`;
        }

        if (!doc.validUpto) {
          return `Valid Upto date is required for ${type}.`;
        }

        if (!doc.file && !doc.fileName && !doc.existingFile) {
          return `PDF file is required for ${type}.`;
        }
      }
    }

    return '';
  }

  private clearAlerts(): void {
    this.saveError.set('');
    this.saveSuccess.set('');
  }

  private mapFileKey(docType: string): string {
    switch ((docType || '').toUpperCase()) {
      case 'RC': return 'rcFile';
      case 'INSURANCE': return 'insuranceFile';
      case 'PUC': return 'pucFile';
      case 'LICENSE': return 'licenseFile';
      default: return 'documentFile';
    }
  }

  private buildRecord(status: 'Saved' | 'Submitted'): PassRecord {
    return {
      passId: this.passId(),
      empType: this.empType(),
      vehicleNo: this.vehicleNo,
      vehicleType: this.vehicleType,
      vehicleClass: this.vehicleClass,
      brandModel: this.brandModel,
      ecNo: this.ecNo,
      empName: this.empName(),
      empDept: this.empDept(),
      contractorFirm: this.empType() === 'Contractor' ? this.ecNo : this.empContractorCode,

      gateNo: this.gateNo,
      parkingArea: this.parkingArea,
      remark: this.remark,
      docs: this.docs().map(d => ({
        documentId: d.documentId,
        docType: d.docType,
        docNo: d.docNo,
        validUpto: d.validUpto,
        fileName: d.file?.name || d.fileName || d.existingFile || ''
      })),
      status,
      createdAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      workflowStatus: status === 'Saved' ? 'Draft' : 'Submitted',
      empTypeDetail: this.empTypeDetail(),
      empAadhar: this.empAadhar(),
      empDeptCode: this.empDeptCode(),
      empContractorCode: this.empContractorCode,
      empContractorName: this.empContractorName
    } as any;
  }

  // private buildPayload(status: string) {
  //   const filteredDocs = this.docs()
  //     .filter(doc => doc.docType && doc.docNo.trim() && doc.validUpto)
  //     .map(doc => ({
  //       documentId: doc.documentId ?? null,
  //       documentType: doc.docType.trim().toUpperCase(),
  //       documentNo: doc.docNo.trim().toUpperCase(),
  //       expiryDate: doc.validUpto || null,
  //       fileKey: this.mapFileKey(doc.docType),
  //       fileName: doc.file?.name || doc.existingFile || doc.fileName || ''
  //     }));

  //   const payload = {
  //     vehicleNo: this.vehicleNo.trim().toUpperCase(),
  //     vehicleType: this.vehicleType.trim() || null,
  //     brandModel: this.brandModel.trim() || null,

  //     employeeNo: this.ecNo.trim().toUpperCase() || null,
  //     empType: 'Company_Employee',
  //     contractorCode: null,

  //     gateNo: this.gateNo.trim() || null,
  //     parkingToBeUsed: this.parkingArea.trim() || null,
  //     status,
  //     remark: this.remark.trim() || null,
  //     enterBy: this.auth.empCode(),
  //     documents: filteredDocs
  //   };

  //   console.log('========== VPMS FINAL JSON PAYLOAD ==========');
  //   console.log(payload);
  //   console.log(JSON.stringify(payload, null, 2));
  //   console.log('============================================');

  //   return payload;
  // }


  private buildPayload(status: string) {
  const filteredDocs = this.docs()
    .filter(doc => doc.docType && doc.docNo.trim() && doc.validUpto)
    .map(doc => ({
      documentId: doc.documentId ?? null,
      documentType: doc.docType.trim().toUpperCase(),
      documentNo: doc.docNo.trim().toUpperCase(),
      expiryDate: doc.validUpto || null,
      fileKey: this.mapFileKey(doc.docType),
      fileName: doc.existingFile || doc.fileName || ''
    }));

  const payload = {
    vehicleNo: this.vehicleNo.trim().toUpperCase(),
    vehicleType: this.vehicleType.trim() || null,
    brandModel: this.brandModel.trim() || null,

    employeeNo: this.ecNo.trim().toUpperCase() || null,
    empType: 'Company_Employee',
    contractorCode: null,

    gateNo: this.gateNo.trim() || null,
    parkingToBeUsed: this.parkingArea.trim() || null,
    status,
    remark: this.remark.trim() || null,
    enterBy: this.auth.empCode(),
    documents: filteredDocs
  };

  console.log('========== VPMS FINAL JSON PAYLOAD ==========');
  console.log(payload);
  console.log(JSON.stringify(payload, null, 2));
  console.log('============================================');

  return payload;
}

  // private async buildMultipartPayload(status: string): Promise<FormData> {
  //   const payload = this.buildPayload(status);
  //   const formData = new FormData();

  //   formData.append(
  //     'request',
  //     new Blob([JSON.stringify(payload)], { type: 'application/json' })
  //   );

  //   for (const doc of this.docs()) {
  //     if (!doc.docType) continue;

  //     const fileKey = this.mapFileKey(doc.docType);

  //     if (doc.file) {
  //       formData.append(fileKey, doc.file, doc.file.name);
  //       continue;
  //     }

  //     const existingName =
  //       doc.existingFile ||
  //       doc.fileName ||
  //       '';

  //     if (this.passIdGenerated() && doc.documentId && existingName) {
  //       try {
  //         const blob = await fetch(
  //           `${API_CONFIG.DOCUMENTS_DOWNLOAD}?id=${doc.documentId}`,
  //           {
  //             headers: {
  //               'x-api-key': API_CONFIG.API_KEY
  //             }
  //           }
  //         ).then(r => {
  //           if (!r.ok) throw new Error(`HTTP ${r.status}`);
  //           return r.blob();
  //         });

  //         const existingFile = new File(
  //           [blob],
  //           existingName,
  //           { type: blob.type || 'application/pdf' }
  //         );

  //         formData.append(fileKey, existingFile, existingFile.name);
  //       } catch (e) {
  //         console.error('Failed to re-attach existing file:', doc.documentId, existingName, e);
  //       }
  //     }
  //   }

  //   return formData;
  // }



  private async buildMultipartPayload(status: string): Promise<FormData> {
  const payload = this.buildPayload(status);
  const formData = new FormData();

  formData.append(
    'request',
    new Blob([JSON.stringify(payload)], { type: 'application/json' })
  );

  for (const doc of this.docs()) {
    if (!doc.docType) continue;

    const fileKey = this.mapFileKey(doc.docType);

    if (doc.file) {
      formData.append(fileKey, doc.file, doc.file.name);
    }
  }

  return formData;
}
  private async fetchExistingFileAsFile(doc: DocEntry): Promise<File | null> {
    const fileName =
      doc.existingFile ||
      doc.fileName ||
      '';

    if (!fileName || !doc.documentId) return null;

    try {
      const blob = await fetch(
        `${API_CONFIG.DOCUMENTS_DOWNLOAD}?id=${doc.documentId}`,
        {
          headers: {
            'x-api-key': API_CONFIG.API_KEY
          }
        }
      ).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      });

      return new File([blob], fileName, {
        type: blob.type || 'application/pdf'
      });
    } catch (e) {
      console.error('Failed to refetch existing file for update:', doc.documentId, fileName, e);
      return null;
    }
  }

  onSave(): void {
    const err = this.validate(false);
    if (err) {
      this.saveError.set(err);
      return;
    }

    this.isSaving.set(true);
    this.clearAlerts();

    this.buildMultipartPayload(PASS_STATUS.DRAFT).then(formData => {
      const currentPassId = this.passId().trim();
      const isUpdate = this.passIdGenerated() && !!currentPassId;

      if (isUpdate) {
        console.log('UPDATE URL =>', `${API_CONFIG.PASS_UPDATE}/${currentPassId}`);
        console.log('PASS ID GENERATED =>', this.passIdGenerated());
        console.log('PASS ID VALUE =>', currentPassId);
      }

      const request$ = isUpdate
        ? this.http.put<any>(
          `${API_CONFIG.PASS_UPDATE}/${currentPassId}`,
          formData,
          { headers: this.MULTIPART_HEADERS }
        )
        : this.http.post<any>(
          API_CONFIG.PASS_SAVE,
          formData,
          { headers: this.MULTIPART_HEADERS }
        );

      request$
        .pipe(
          timeout(HTTP_TIMEOUT_MS),
          takeUntil(this.destroy$),
          catchError(err2 => {
            this.handleSaveError(err2, 'Save Draft');
            return of(null);
          }),
          finalize(() => this.isSaving.set(false))
        )
        .subscribe(res => {
          if (!res) return;

          const id = res.passId ?? res.id ?? res.requestId;
          if (id !== undefined && id !== null) {
            this.passId.set(formatPassId(id));
            this.passIdGenerated.set(true);
          }

          const record = this.buildRecord('Saved');
          this.passState.upsert(record);
          this.passState.broadcastDraftChange();
          this.saved.set(true);
          this.saveSuccess.set(`Draft saved successfully. Request ID: ${this.passId()}`);
        });
    }).catch(err => {
      console.error(err);
      this.saveError.set('Could not prepare document files for update.');
      this.isSaving.set(false);
    });
  }

  onSubmit(): void {
    const err = this.validate(true);
    if (err) {
      this.saveError.set(err);
      return;
    }

    this.isSaving.set(true);
    this.clearAlerts();

    this.buildMultipartPayload(PASS_STATUS.SUBMITTED).then(formData => {
      const currentPassId = this.passId().trim();
      const isUpdate = this.passIdGenerated() && !!currentPassId;

      if (isUpdate) {
        console.log('UPDATE URL =>', `${API_CONFIG.PASS_UPDATE}/${currentPassId}`);
        console.log('PASS ID GENERATED =>', this.passIdGenerated());
        console.log('PASS ID VALUE =>', currentPassId);
      }

      const request$ = isUpdate
        ? this.http.put<any>(
          `${API_CONFIG.PASS_UPDATE}/${currentPassId}`,
          formData,
          { headers: this.MULTIPART_HEADERS }
        )
        : this.http.post<any>(
          API_CONFIG.PASS_SAVE,
          formData,
          { headers: this.MULTIPART_HEADERS }
        );

      request$
        .pipe(
          timeout(HTTP_TIMEOUT_MS),
          takeUntil(this.destroy$),
          catchError(err => {
            this.handleSaveError(err, 'Submit Pass');
            return of(null);
          }),
          finalize(() => this.isSaving.set(false))
        )
        .subscribe(res => {
          if (!res) return;

          const id = res.passId ?? res.id ?? res.requestId;
          if (id !== undefined && id !== null) {
            this.passId.set(formatPassId(id));
            this.passIdGenerated.set(true);
          }

          const record = this.buildRecord('Submitted');
          this.passState.upsert(record);
          this.passState.broadcast({ ...record, workflowStatus: 'Submitted' } as any);
          this.saved.set(true);
          this.saveSuccess.set(`Request submitted successfully. ID: ${this.passId()}`);

          setTimeout(() => this.router.navigate(['/passes']), 1800);
        });
    }).catch(err => {
      console.error(err);
      this.saveError.set('Could not prepare document files for update.');
      this.isSaving.set(false);
    });
  }


  clearForm(): void {
    this.empType.set('');
    this.passId.set('');
    this.passIdGenerated.set(false);
    this.fetchingEmployee.set(false);
    this.empFetchError.set('');
    this.empName.set('');
    this.empDept.set('');
    this.empType_display.set('');
    this.empDeptCode.set('');
    this.empTypeDetail.set('');
    this.empAadhar.set('');
    this.docs.set([emptyDoc()]);
    this.isSaving.set(false);
    this.saved.set(false);
    this.saveSuccess.set('');
    this.saveError.set('');
    this.modificationRemark.set('');
    this.isModificationMode.set(false);

    this.vehicleNo = '';
    this.vehicleType = '';
    this.brandModel = '';
    this.vehicleClass = '';
    this.ecNo = '';
    this.contractorCode = '';
    this.gateNo = '';
    this.parkingArea = '';
    this.remark = '';

    this.empContractorCode = '';
    this.empContractorName = '';
    this.contractorName = '';
    this.contractorEmail = '';
    this.empEmail = '';
    this.empSalary = '';
    this.empContractorEmail = '';

    this.empData = null;
    this.savedVehicleId = null;
    this.savedPassRegistryId = null;
    this.draftPassId = null;
  }

  private handleSaveError(err: any, step: string): void {
    const status = err?.status ?? '?';
    const body = err?.error;

    if (body instanceof Blob) {
      body.text().then(text => {
        let msg = text;
        try {
          const parsed = JSON.parse(text);
          msg = parsed?.message || parsed?.error || text;
        } catch { }
        this.saveError.set(`[${step}] [${status}] ${String(msg).substring(0, 300)}`);
      });
      return;
    }

    const msg =
      typeof body === 'string'
        ? body
        : body?.message || body?.error || 'Server error — check backend logs.';

    this.saveError.set(`[${step}] [${status}] ${String(msg).substring(0, 300)}`);
  }
}