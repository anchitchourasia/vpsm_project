import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';
import { PassStateService, PassRecord } from '../services/pass-state.service';
import { AuthService } from '../core/auth.service';

const HTTP_TIMEOUT_MS = 12000;

// ✅ API now returns named-key objects — EMP_IDX array approach removed
// API shape: { id, name, deptCode, deptName, contractorCode, contractorNo, aadhaarNo, empType }

function formatPassId(dbPassId: number): string {
  // ✅ ACTUAL DB id shown as-is — no PASS-HEG prefix, no padding
  return String(dbPassId);
}

interface DocEntry {
  id: string;
  docType: string;
  docNo: string;
  validUpto: string;
  file: File | null;
  documentId?: number;
  existingFile?: string;
}

const ALLOWED_DOC_TYPES = ['RC', 'PUC', 'INSURANCE', 'LICENSE', 'FITNESS'];

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
  if (v.length >= 2) return 'Four_Wheeler';
  return '';
}

function emptyDoc(): DocEntry {
  return { id: crypto.randomUUID(), docType: '', docNo: '', validUpto: '', file: null };
}

@Component({
  selector: 'app-pass-entry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pass-entry.html',
  styleUrl: './pass-entry.css',
})
export class PassEntry implements OnInit, OnDestroy {

  protected readonly ALLOWED_DOC_TYPES = ALLOWED_DOC_TYPES;

  private destroy$ = new Subject<void>();

  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });
  private readonly MULTIPART_HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
  });

  private passState = inject(PassStateService);
  private auth = inject(AuthService);

  empType = signal<string>('');
  passId = signal<string>('');
  passIdGenerated = signal(false);
  fetchingEmployee = signal(false);
  empFetchError = signal('');
  empName = signal('');
  empDept = signal('');
  empSalary = signal('');
  empEmail = signal('');
  empType_display = signal('');
  empDeptCode = signal('');
  empTypeDetail = signal<'PERMANENT' | 'HEG' | 'CONTRACT' | ''>('');

  // ✅ Aadhar — signal, auto-filled readonly from employee API
  empAadhar = signal('');

  empContractorCode = '';
  empContractorName = '';
  empContractorEmail = '';
  contractorName = '';
  contractorEmail = '';
  isSaving = signal(false);
  saved = signal(false);
  saveSuccess = signal('');
  saveError = signal('');
  docs = signal<DocEntry[]>([]);

  modificationRemark = signal<string>('');
  isModificationMode = signal(false);

  vehicleNo = '';
  vehicleType = '';
  brandModel = '';
  vehicleClass = '';
  ecNo = '';
  contractorCode = '';
  issueDate = '';
  validityDate = '';
  gateNo = '';
  parkingArea = '';
  remark = '';

  private empData: any = null;
  private savedVehicleId: number | null = null;
  private savedPassRegistryId: number | null = null;
  // ✅ draftPassId now stores the real numeric DB pass id (as string) — no DRAFT- prefix
  private draftPassId: string | null = null;

  get todayDate(): string { return new Date().toISOString().split('T')[0]; }
  get isEcNoLocked(): boolean { return false; }

  formatDateDDMMYYYY(isoDate: string): string {
    if (!isoDate || isoDate.length < 10) return isoDate ?? '';
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
  }

  openDatePicker(input: HTMLInputElement): void {
    try { (input as any).showPicker(); } catch { input.click(); }
  }

  availableDocTypes = (currentDoc: DocEntry): string[] => {
    const used = this.docs()
      .filter(d => d !== currentDoc)
      .map(d => d.docType)
      .filter(Boolean);
    const available = ALLOWED_DOC_TYPES.filter(t => !used.includes(t));
    if (currentDoc.docType && !available.includes(currentDoc.docType)) {
      return [currentDoc.docType, ...available];
    }
    return available;
  };

  constructor(private http: HttpClient, private router: Router) { }

  docAlreadyUploaded(doc: DocEntry): boolean {
    return !!doc.documentId && !!doc.existingFile && !doc.file;
  }

  ngOnInit(): void {
    if (this.auth.isRegularUser() && this.auth.empCode()) {
      this.ecNo = this.auth.empCode()!;
    }

    // ── 1. Resume DRAFT (also handles Edit from Pass Registry) ──
    const draft = this.passState.resumeDraftData();
    if (draft) {
      this.passState.clearResumeDraft();

      this.empType.set(draft.empType);
      this.vehicleNo = draft.vehicleNo;
      this.vehicleType = draft.vehicleType;
      this.vehicleClass = draft.vehicleClass;
      this.brandModel = draft.brandModel;
      this.validityDate = draft.validityDate;
      this.gateNo = draft.gateNo;
      this.parkingArea = draft.parkingArea;
      this.remark = draft.remark;
      this.empName.set(draft.empName);
      this.empDept.set(draft.empDept);

      const rawDetail = ((draft as any).empTypeDetail || '') as string;
      const isContractor = draft.empType === 'Contractor';

      let resolvedDetail: 'PERMANENT' | 'HEG' | 'CONTRACT' | '' = '';
      if (!isContractor) {
        const upper = rawDetail.toUpperCase().trim();
        if (upper === 'PERMANENT' || upper === 'HEG' || upper === 'CONTRACT') {
          resolvedDetail = upper as 'PERMANENT' | 'HEG' | 'CONTRACT';
        } else {
          resolvedDetail = 'HEG';
        }
      }
      this.empTypeDetail.set(resolvedDetail);

      if (isContractor) {
        this.contractorCode = draft.contractorFirm || '';
        this.ecNo = this.contractorCode;
      } else {
        this.ecNo = draft.ecNo || '';
        this.contractorCode = draft.contractorFirm || '';
      }

      this.empAadhar.set((draft as any).empAadhar || '');
      this.empDeptCode.set((draft as any).empDeptCode || '');
      this.empContractorCode = (draft as any).empContractorCode || '';
      this.empContractorName = (draft as any).empContractorName || '';
      this.contractorName = (draft as any).contractorName || draft.contractorFirm || '';

      if (Array.isArray(draft.docs) && draft.docs.length > 0) {
        const restoredDocs: DocEntry[] = draft.docs.map((d: any) => ({
          id: crypto.randomUUID(),
          docType: (d.docType || '').toUpperCase().trim(),
          docNo: d.docNo || '',
          validUpto: d.validUpto || '',
          file: null,
          documentId: d.documentId || null,
          existingFile: d.fileName || null,
        }));
        this.docs.set(restoredDocs);
      }

      this.draftPassId = draft.passId;
      this.passId.set(draft.passId);
      this.passIdGenerated.set(true);
      this.saved.set(true);
      this.savedPassRegistryId = draft.passId ? Number(draft.passId) : null;
      this.savedVehicleId = (draft as any).vehicleId
        ? Number((draft as any).vehicleId)
        : null;

      this.saveSuccess.set(
        `Draft resumed — Request ID: ${draft.passId}. Documents restored. Click Submit when ready.`
      );
      return;
    }

    // ── 2. Resume MODIFICATION ──
    const modData = this.passState.resumeModData();
    if (modData) {
      this.passState.clearResumeMod();

      this.empType.set(modData.empType || '');
      this.vehicleNo = modData.vehicleNo || '';
      this.vehicleType = modData.vehicleType || '';
      this.vehicleClass = modData.vehicleClass || '';
      this.brandModel = modData.brandModel || '';
      this.ecNo = modData.ecNo || '';
      this.contractorCode = modData.contractorFirm || '';
      this.validityDate = modData.validityDate || '';
      this.gateNo = modData.gateNo || '';
      this.parkingArea = modData.parkingArea || '';
      this.remark = modData.remark || '';
      this.empName.set(modData.empName || '');
      this.empDept.set(modData.empDept || '');

      if (Array.isArray(modData.docs) && modData.docs.length > 0) {
        const prefilledDocs: DocEntry[] = modData.docs.map((d: any) => ({
          id: crypto.randomUUID(),
          docType: (d.docType || '').toUpperCase().trim(),
          docNo: d.docNo || '',
          validUpto: d.validUpto || '',
          file: null,
          documentId: d.documentId || null,
          existingFile: d.fileName || null,
        }));
        this.docs.set(prefilledDocs);
      }

      this.savedPassRegistryId = modData.passId ?? null;
      this.savedVehicleId = (modData as any).vehicleId
        ? Number((modData as any).vehicleId)
        : null;
      this.passId.set(
        modData.passId ? String(modData.passId) : ''
      );
      this.passIdGenerated.set(!!modData.passId);
      this.saved.set(false);
      this.isModificationMode.set(true);
      this.modificationRemark.set(modData.confirmerRemark || '');
      this.saveSuccess.set('');
      this.saveError.set('');
    }
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  setEmpType(t: string): void {
    this.empType.set(t);
    this.empTypeDetail.set('');
    this.ecNo = ''; this.contractorCode = '';
    this.empName.set(''); this.empDept.set(''); this.empSalary.set('');
    this.empAadhar.set('');
    this.empEmail.set('');
    this.contractorName = '';
    this.contractorEmail = '';
    this.empDeptCode.set('');
    this.empType_display.set('');
    this.empFetchError.set(''); this.empData = null;
    this.clearAlerts();
  }

  onVehicleTypeInput(event: Event | string): void {
    const val = (typeof event === 'string'
      ? event
      : (event.target as HTMLInputElement).value
    ).toUpperCase();

    this.vehicleType = val;
    const detected = detectVehicleClass(val);
    if (detected) this.vehicleClass = detected;
  }

  onUpperInput(event: Event, field: keyof this): void {
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
    const ecNo = this.ecNo.trim();
    if (!ecNo) return;

    this.empFetchError.set('');
    this.empName.set('');
    this.empDept.set('');
    this.empSalary.set('');
    this.empEmail.set('');
    this.empAadhar.set('');
    this.contractorName = '';
    this.contractorEmail = '';
    this.empData = null;
    this.fetchingEmployee.set(true);

    this.http
      .get<any[]>(`${API_CONFIG.BASE_URL}/api/reports/employee-department`, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          this.fetchingEmployee.set(false);
          this.empFetchError.set(
            `Could not fetch employee details (${err?.status ?? 'network error'})`
          );
          return of([]);
        })
      )
      .subscribe((rows: any[]) => {
        this.fetchingEmployee.set(false);
        if (!rows || rows.length === 0) {
          this.empFetchError.set('Employee list empty — check backend connection.');
          return;
        }

        let match: any;
        if (this.empType() === 'Contractor') {
          match = rows.find(r =>
            r.contractorNo && String(r.contractorNo).toUpperCase() === ecNo.toUpperCase()
          );
        } else {
          match = rows.find(r => String(r.id) === ecNo);
        }

        if (match) {
          const selectedDetail = this.empTypeDetail();
          const apiEmpType = String(match.empType || '').toLowerCase();
          const isContractorMatch = !!(match.contractorNo);

          let mismatch = false;
          let mismatchMsg = '';

          if (selectedDetail === 'CONTRACT' && !isContractorMatch) {
            mismatch = true;
            mismatchMsg = `⚠️ Mismatch: EC No "${ecNo}" belongs to a Company Employee (${match.empType || 'non-contractor'}), not a Contractor. Please select the correct Employee Type.`;
          } else if ((selectedDetail === 'PERMANENT' || selectedDetail === 'HEG') && isContractorMatch) {
            mismatch = true;
            mismatchMsg = `⚠️ Mismatch: EC No "${ecNo}" belongs to a Contractor, not a ${selectedDetail} employee. Please select CONTRACT.`;
          }

          if (mismatch) {
            this.empName.set('');
            this.empDept.set('');
            this.empDeptCode.set('');
            this.empAadhar.set('');
            this.empContractorCode = '';
            this.empContractorName = '';
            this.contractorName = '';
            this.empType_display.set('');
            this.empData = null;
            this.empFetchError.set(mismatchMsg);
            return;
          }

          this.empData = match;
          this.empName.set(String(match.name || ''));
          this.empDept.set(String(match.deptName || '').toUpperCase());
          this.empDeptCode.set(String(match.deptCode || ''));
          this.empSalary.set('');
          this.empEmail.set('');
          this.empAadhar.set(String(match.aadhaarNo || match.aadharNo || match.aadhar || ''));
          this.empContractorCode = String(match.contractorCode || '');
          this.empContractorName = String(match.name || '');
          this.contractorName = String(match.name || '');
          this.contractorEmail = '';
          this.empType_display.set(String(match.empType || ''));
          this.empFetchError.set('');
        } else {
          this.empFetchError.set(
            this.empTypeDetail() === 'CONTRACT'
              ? `No contractor found for Code: ${ecNo}`
              : `No employee found for ID: ${ecNo}`
          );
        }
      });
  }

  addDoc(): void {
    if (this.docs().length >= ALLOWED_DOC_TYPES.length) return;
    this.docs.update(d => [...d, emptyDoc()]);
  }

  removeDoc(i: number): void { this.docs.update(d => d.filter((_, idx) => idx !== i)); }

  onDocTypeChange(doc: DocEntry): void {
    const dupe = this.docs().filter(d => d !== doc && d.docType === doc.docType);
    if (dupe.length > 0) {
      setTimeout(() => { doc.docType = ''; }, 0);
      this.saveError.set(`${doc.docType} is already added. Each type can appear only once.`);
    } else { this.clearAlerts(); }
  }

  onDocFileSelected(event: Event, doc: DocEntry): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    if (file.type !== 'application/pdf') { this.saveError.set('Only PDF files are allowed.'); return; }
    if (file.size > 10 * 1024 * 1024) { this.saveError.set('File must be under 10 MB.'); return; }
    this.docs.update(list => list.map(d =>
      d.id === doc.id ? { ...d, file, existingFile: undefined } : d
    ));
    this.clearAlerts();
  }

  shortName(name: string): string { return name.length > 18 ? name.substring(0, 15) + '...' : name; }

  private checkDuplicate(): Promise<string> {
    const vehicleNo = this.vehicleNo.trim().toUpperCase();
    const ecNo = this.empType() === 'Company_Employee'
      ? this.ecNo.trim().toUpperCase()
      : (this.contractorCode || this.ecNo).trim().toUpperCase();

    return new Promise(resolve => {
      this.http.get<any[]>(API_CONFIG.PASSES, { headers: this.HEADERS })
        .pipe(
          timeout(HTTP_TIMEOUT_MS),
          takeUntil(this.destroy$),
          catchError(() => of([]))
        )
        .subscribe(passes => {
          if (!passes || passes.length === 0) { resolve(''); return; }

          const terminalStatuses = ['rejected', 'surrendered', 'expired'];

          const duplicate = passes.find(p => {
            const pVehicleNo = String(p.vehicle?.vehicleNo || '').trim().toUpperCase();
            const pEcNo = String(p.employeeNo || p.contractorCode || '').trim().toUpperCase();
            const pStatus = String(p.status || '').toLowerCase();

            if (this.savedPassRegistryId && p.passId === this.savedPassRegistryId) return false;
            if (terminalStatuses.includes(pStatus)) return false;

            return pVehicleNo === vehicleNo && pEcNo === ecNo;
          });

          if (duplicate) {
            const statusLabel = duplicate.status || 'existing';
            resolve(
              `⚠️ Duplicate detected: Vehicle ${vehicleNo} is already linked to EC/Code "${ecNo}" ` +
              `with Pass ID #${duplicate.passId} (Status: ${statusLabel}). ` +
              `A new pass cannot be created for the same vehicle and employee combination.`
            );
          } else {
            resolve('');
          }
        });
    });
  }

  private validate(): string {
    if (!this.vehicleNo.trim()) return 'Vehicle No is required.';
    if (!this.vehicleType.trim()) return 'Vehicle Type is required.';
    if (!this.vehicleClass) return 'Vehicle Class is required.';
    if (this.empType() === 'Company_Employee' && !this.ecNo.trim())
      return 'EC No is required.';
    if (this.empType() === 'Contractor' && !this.contractorCode.trim())
      return 'Contractor Code is required.';
    if (this.validityDate && this.validityDate < this.todayDate)
      return 'Validity Date cannot be a past date.';
    if (!this.gateNo) return 'Gate No is required.';
    for (const doc of this.docs()) {
      if (!doc.docType) return 'Select Document Type for all document rows.';
      if (!doc.docNo.trim()) return `Document No is required for ${doc.docType}.`;
      if (!doc.validUpto) return `Valid Upto date is required for ${doc.docType}.`;
      if (!doc.file && !this.docAlreadyUploaded(doc))
        return `Please upload a PDF file for ${doc.docType}.`;
    }
    return '';
  }

  private validateSubmit(): string {
    if (this.docs().length < ALLOWED_DOC_TYPES.length) {
      const missing = ALLOWED_DOC_TYPES.filter(
        t => !this.docs().some(d => d.docType === t)
      );
      return `All 5 documents are mandatory. Missing: ${missing.join(', ')}.`;
    }
    for (const doc of this.docs()) {
      if (!doc.docType) return 'Select Document Type for all document rows.';
      if (!doc.docNo.trim()) return `Document No is required for ${doc.docType}.`;
      if (!doc.validUpto) return `Valid Upto date is required for ${doc.docType}.`;
      if (!doc.file && !this.docAlreadyUploaded(doc))
        return `Please upload a PDF file for ${doc.docType}.`;
    }
    return '';
  }

  private clearAlerts(): void { this.saveError.set(''); this.saveSuccess.set(''); }

  onSave(): void {
    if (!this.validityDate) this.validityDate = this.todayDate;
    this.issueDate = this.todayDate;
    const err = this.validate();
    if (err) { this.saveError.set(err); return; }

    if (this.passIdGenerated() && this.savedPassRegistryId) {
      this.isSaving.set(true);
      this.updateExistingPassInDB('Draft');
      return;
    }

    this.isSaving.set(true);
    this.checkDuplicate().then(dupErr => {
      if (dupErr) {
        this.saveError.set(dupErr);
        this.isSaving.set(false);
        return;
      }
      this.persistDraftToDB();
    });
  }

  onSubmit(): void {
    if (!this.validityDate) this.validityDate = this.todayDate;
    this.issueDate = this.todayDate;
    const formErr = this.validate();
    if (formErr) { this.saveError.set(formErr); return; }
    const docErr = this.validateSubmit();
    if (docErr) { this.saveError.set(docErr); return; }
    if (this.isSaving()) return;
    this.clearAlerts();
    this.isSaving.set(true);

    this.checkDuplicate().then(dupErr => {
      if (dupErr) {
        this.saveError.set(dupErr);
        this.isSaving.set(false);
        return;
      }
      if (this.savedPassRegistryId) {
        this.updateExistingPassInDB('Submitted');
      } else {
        this.step1RegisterVehicle();
      }
    });
  }

  private persistDraftToDB(): void {
    const vehiclePayload = {
      vehicleNo: this.vehicleNo.trim().toUpperCase(),
      vehicleType: this.vehicleType.trim(),
      vehicleClass: this.vehicleClass,
      brandModel: this.brandModel.trim() || null,
      isActive: 'Y',
      isBlacklisted: 'N',
    };

    this.http.post<any>(API_CONFIG.VEHICLES_REGISTER, vehiclePayload, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          this.handleSaveError(err, 'Draft — Vehicle');
          return of(null);
        })
      )
      .subscribe(vRes => {
        if (!vRes) { this.isSaving.set(false); return; }
        this.savedVehicleId = vRes.vehicleId ?? vRes.id ?? null;

        const passPayload = {
          vehicle: { vehicleId: this.savedVehicleId },
          issueDate: this.issueDate || this.todayDate,
          validityDate: this.validityDate || null,
          employeeNo: this.empType() === 'Company_Employee' ? this.ecNo.trim() : null,
          employeeCompanyNo: this.empType() === 'Company_Employee' ? this.ecNo.trim() : null,
          employeeName: this.empName() || null,
          dept: this.empDept() || null,
          contractorCode: this.empType() === 'Contractor' ? this.contractorCode.trim() : null,
          aadhaarNo: this.empAadhar() || null,
          contractorName: this.empContractorName || null,
          gateNo: this.gateNo,
          parkingToBeUsed: this.parkingArea.trim() || null,
          status: 'Draft',
          empType: this.empType() === 'Contractor'
            ? 'Contractor'
            : (this.empTypeDetail() || this.empType()),
          enterBy: this.auth.empCode() || 'REQUESTER',
          typeOfVehicle: this.vehicleType.trim() || null,
          remarks: this.remark.trim() || null,
        };

        this.http.post<any>(API_CONFIG.PASSES_ISSUE, passPayload, { headers: this.HEADERS })
          .pipe(
            timeout(HTTP_TIMEOUT_MS),
            takeUntil(this.destroy$),
            catchError(err => {
              this.handleSaveError(err, 'Draft — Pass');
              return of(null);
            })
          )
          .subscribe(pRes => {
            if (!pRes) { this.isSaving.set(false); return; }

            const realDbId = pRes.passId ?? pRes.id ?? null;
            this.savedPassRegistryId = realDbId;

            const realIdStr = realDbId ? String(realDbId) : `PENDING-${Date.now()}`;
            this.passId.set(realIdStr);
            this.passIdGenerated.set(true);
            this.draftPassId = realIdStr;

            this.logHistory(
              realDbId,
              'DRAFT_SAVED',
              this.auth.empCode() || 'REQUESTER',
              `Draft saved — Vehicle: ${this.vehicleNo}, Gate: ${this.gateNo}`
            );

            const docsWithFile = this.docs().filter(d => d.docType && d.file);
            if (docsWithFile.length > 0 && this.savedVehicleId) {
              this.uploadDocsForDraft(docsWithFile, realIdStr);
            }

            const record = this._buildRecord('Saved');
            this.passState.upsert(record);
            this.passState.broadcastDraftChange();
            this.passState.broadcast({ ...record, _broadcastType: 'DRAFT_UPSERT' } as any);
            this.saved.set(true);
            this.isSaving.set(false);

            this.saveSuccess.set(
              `Draft saved — Request ID: ${realIdStr}. Documents saved. Click Submit when ready.`
            );
          });
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // uploadDocsForDraft — uploads/replaces docs silently during Save
  //
  // ✅ Always uses POST /api/documents/upload
  // Backend /upload does upsert by vehicleId + docType:
  //   finds existing row → UPDATE, or creates new row → INSERT
  // No separate PUT /update endpoint needed.
  // ─────────────────────────────────────────────────────────────────────────
  private uploadDocsForDraft(docsToUpload: DocEntry[], realIdStr: string): void {
    const fd = new FormData();
    fd.append('vehicleId', String(this.savedVehicleId));
    fd.append('enterBy', this.auth.empCode() || 'REQUESTER');

    for (const doc of docsToUpload) {
      const dt = doc.docType.toLowerCase();
      const file = doc.file!;
      if (dt === 'rc') {
        fd.append('rcNo', doc.docNo);
        fd.append('rcStart', this.todayDate);
        fd.append('rcExpiry', doc.validUpto);
        fd.append('rcFile', file, file.name);
      } else if (dt === 'puc') {
        fd.append('pucNo', doc.docNo);
        fd.append('pucStart', this.todayDate);
        fd.append('pucExpiry', doc.validUpto);
        fd.append('pucFile', file, file.name);
      } else if (dt === 'insurance') {
        fd.append('insuranceNo', doc.docNo);
        fd.append('insuranceStart', this.todayDate);
        fd.append('insuranceExpiry', doc.validUpto);
        fd.append('insuranceFile', file, file.name);
      } else if (dt === 'license') {
        fd.append('loadTestNo', doc.docNo);
        fd.append('loadTestStart', this.todayDate);
        fd.append('loadTestExpiry', doc.validUpto);
        fd.append('loadTestFile', file, file.name);
      } else if (dt === 'fitness') {
        fd.append('fitnessNo', doc.docNo);
        fd.append('fitnessStart', this.todayDate);
        fd.append('fitnessExpiry', doc.validUpto);
        fd.append('fitnessFile', file, file.name);
      }
    }

    // ✅ Always POST to /upload — backend upserts by vehicleId + docType automatically.
    // No separate PUT /update endpoint needed — /upload handles both new & replacement docs.
    this.http.post<any>(API_CONFIG.DOCUMENTS_UPLOAD, fd, { headers: this.MULTIPART_HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(() => {
          this.saveSuccess.set(
            `Draft saved — Request ID: ${realIdStr}. ⚠️ Documents could not be uploaded. Try again on Submit.`
          );
          return of(null);
        })
      )
      .subscribe(res => {
        if (res !== null) {
          // ✅ FIX: res !== null (not truthy) — backend may return {} or []
          this.saveSuccess.set(
            `Draft saved — Request ID: ${realIdStr}. Documents uploaded ✅. Click Submit when ready.`
          );
        }
      });
  }

  private updateExistingPassInDB(newStatus: 'Draft' | 'Submitted'): void {
    const passRegistryId = this.savedPassRegistryId!;

    const proceedToPassUpdate = () => {
      const updatePayload = {
        employeeNo: this.empType() === 'Company_Employee' ? this.ecNo.trim() : null,
        issueDate: this.issueDate || this.todayDate,
        employeeCompanyNo: this.empType() === 'Company_Employee' ? this.ecNo.trim() : null,
        employeeName: this.empName() || null,
        dept: this.empDept() || null,
        contractorCode: this.empType() === 'Contractor' ? this.contractorCode.trim() : null,
        aadhaarNo: this.empAadhar() || null,
        contractorName: this.empContractorName || null,
        gateNo: this.gateNo,
        parkingToBeUsed: this.parkingArea.trim() || null,
        status: newStatus,
        empType: this.empType() === 'Contractor'
          ? 'Contractor'
          : (this.empTypeDetail() || this.empType()),
        typeOfVehicle: this.vehicleType.trim() || null,
        remarks: this.remark.trim() || null,
        validityDate: this.validityDate || null,
      };

      this.http
        .put<any>(`${API_CONFIG.PASSES_UPDATE}/${passRegistryId}`, updatePayload, { headers: this.HEADERS })
        .pipe(
          timeout(HTTP_TIMEOUT_MS),
          takeUntil(this.destroy$),
          catchError(err => {
            this.handleSaveError(err, `Update Pass [${newStatus}]`);
            return of(null);
          })
        )
        .subscribe(res => {
          if (!res) { this.isSaving.set(false); return; }

          const docsWithNewFile = this.docs().filter(d => d.docType && d.file !== null);

          if (docsWithNewFile.length > 0 && this.savedVehicleId) {
            if (newStatus === 'Submitted') {
              this.step3UploadDocs(docsWithNewFile);
            } else {
              this.uploadDocsForDraft(docsWithNewFile, this.passId());
              const record = this._buildRecord('Saved');
              this.passState.upsert(record);
              this.passState.broadcastDraftChange();
              this.passState.broadcast({ ...record, _broadcastType: 'DRAFT_UPSERT' } as any);
              this.saved.set(true);
              this.isSaving.set(false);
              this.saveSuccess.set(
                `Draft updated — Pass ID: ${this.passId()}. Changes & documents saved ✅. Click Submit when ready.`
              );
            }
          } else {
            if (newStatus === 'Submitted') {
              this.finaliseSubmit();
            } else {
              const record = this._buildRecord('Saved');
              this.passState.upsert(record);
              this.passState.broadcastDraftChange();
              this.passState.broadcast({ ...record, _broadcastType: 'DRAFT_UPSERT' } as any);
              this.saved.set(true);
              this.isSaving.set(false);
              this.saveSuccess.set(
                `Draft updated — Pass ID: ${this.passId()}. Changes saved ✅. Click Submit when ready.`
              );
            }
          }

          this.logHistory(
            passRegistryId,
            newStatus === 'Submitted' ? 'RESUBMITTED' : 'DRAFT_UPDATED',
            this.auth.empCode() || 'REQUESTER',
            `Pass ${newStatus.toLowerCase()} — ID: ${this.passId()}, Vehicle: ${this.vehicleNo}`
          );
        });
    };

    if (this.savedVehicleId) {
      const vehiclePayload = {
        vehicleNo: this.vehicleNo.trim().toUpperCase(),
        vehicleType: this.vehicleType.trim(),
        vehicleClass: this.vehicleClass,
        brandModel: this.brandModel.trim() || null,
        isActive: 'Y',
        isBlacklisted: 'N',
      };

      this.http
        .put<any>(`${API_CONFIG.VEHICLES_UPDATE}/${this.savedVehicleId}`, vehiclePayload, { headers: this.HEADERS })
        .pipe(
          timeout(HTTP_TIMEOUT_MS),
          takeUntil(this.destroy$),
          catchError(err => {
            console.warn(`[Vehicle PUT] failed [${err?.status}] — continuing to pass update`);
            return of(null);
          })
        )
        .subscribe(() => proceedToPassUpdate());

    } else {
      console.warn('[updateExistingPassInDB] savedVehicleId is null — skipping vehicle PUT');
      proceedToPassUpdate();
    }
  }

  private step1RegisterVehicle(): void {
    const payload = {
      vehicleNo: this.vehicleNo.trim().toUpperCase(),
      vehicleType: this.vehicleType.trim(),
      vehicleClass: this.vehicleClass,
      brandModel: this.brandModel.trim() || null,
      isActive: 'Y',
      isBlacklisted: 'N',
    };
    this.http.post<any>(API_CONFIG.VEHICLES_REGISTER, payload, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => { this.handleSaveError(err, 'Step 1 — Vehicle'); return of(null); })
      )
      .subscribe(vRes => {
        if (!vRes) return;
        this.savedVehicleId = vRes.vehicleId ?? vRes.id ?? null;
        this.step2IssuePass();
      });
  }

  private step2IssuePass(): void {
    const payload = {
      vehicle: { vehicleId: this.savedVehicleId },
      issueDate: this.issueDate || this.todayDate,
      validityDate: this.validityDate || null,
      employeeNo: this.empType() === 'Company_Employee' ? this.ecNo.trim() : null,
      employeeCompanyNo: this.empType() === 'Company_Employee' ? this.ecNo.trim() : null,
      employeeName: this.empName() || null,
      dept: this.empDept() || null,
      contractorCode: this.empType() === 'Contractor' ? this.contractorCode.trim() : null,
      aadhaarNo: this.empAadhar() || null,
      contractorName: this.empContractorName || null,
      gateNo: this.gateNo,
      parkingToBeUsed: this.parkingArea.trim() || null,
      status: 'Submitted',
      empType: this.empType() === 'Contractor'
        ? 'Contractor'
        : (this.empTypeDetail() || this.empType()),
      enterBy: this.auth.empCode() || 'REQUESTER',
      typeOfVehicle: this.vehicleType.trim() || null,
      remarks: this.remark.trim() || null,
    };
    this.http.post<any>(API_CONFIG.PASSES_ISSUE, payload, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => { this.handleSaveError(err, 'Step 2 — Pass'); return of(null); })
      )
      .subscribe(pRes => {
        if (!pRes) return;
        this.savedPassRegistryId = pRes.passId ?? pRes.id ?? null;
        const realId = formatPassId(this.savedPassRegistryId!);
        this.passId.set(realId);
        this.passIdGenerated.set(true);
        const docsWithNewFile = this.docs().filter(d => d.docType && d.file);
        if (docsWithNewFile.length > 0) { this.step3UploadDocs(docsWithNewFile); }
        else { this.finaliseSubmit(); }
      });
  }

  private step3UploadDocs(docsToProcess: DocEntry[]): void {
    const fd = new FormData();
    fd.append('vehicleId', String(this.savedVehicleId));
    fd.append('enterBy', this.auth.empCode() || 'REQUESTER');

    for (const doc of docsToProcess) {
      const dt = doc.docType.toLowerCase();
      const file = doc.file!;
      if (dt === 'rc') {
        fd.append('rcNo', doc.docNo);
        fd.append('rcStart', this.todayDate);
        fd.append('rcExpiry', doc.validUpto);
        fd.append('rcFile', file, file.name);
      } else if (dt === 'puc') {
        fd.append('pucNo', doc.docNo);
        fd.append('pucStart', this.todayDate);
        fd.append('pucExpiry', doc.validUpto);
        fd.append('pucFile', file, file.name);
      } else if (dt === 'insurance') {
        fd.append('insuranceNo', doc.docNo);
        fd.append('insuranceStart', this.todayDate);
        fd.append('insuranceExpiry', doc.validUpto);
        fd.append('insuranceFile', file, file.name);
      } else if (dt === 'license') {
        fd.append('loadTestNo', doc.docNo);
        fd.append('loadTestStart', this.todayDate);
        fd.append('loadTestExpiry', doc.validUpto);
        fd.append('loadTestFile', file, file.name);
      } else if (dt === 'fitness') {
        fd.append('fitnessNo', doc.docNo);
        fd.append('fitnessStart', this.todayDate);
        fd.append('fitnessExpiry', doc.validUpto);
        fd.append('fitnessFile', file, file.name);
      }
    }
    this.http.post<any>(API_CONFIG.DOCUMENTS_UPLOAD, fd, { headers: this.MULTIPART_HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(_err => { this.finaliseSubmit(true); return of(null); })
      )
      .subscribe(dRes => { if (dRes !== null) this.finaliseSubmit(); });
  }

  private finaliseSubmit(docWarn = false): void {
    this.isSaving.set(false);
    this.saved.set(true);

    const record = this._buildRecord('Submitted');

    if (this.draftPassId && this.draftPassId !== this.passId()) {
      this.passState.deleteDraft(this.draftPassId);
    }
    this.draftPassId = null;

    const action = this.modificationRemark() ? 'RESUBMITTED' : 'SUBMITTED';
    this.logHistory(
      this.savedPassRegistryId ?? this.savedVehicleId,
      action,
      this.auth.empCode() || 'REQUESTER',
      `Pass ${action.toLowerCase()} — ID: ${this.passId()}, Vehicle: ${this.vehicleNo}`
    );

    this.modificationRemark.set('');
    this.isModificationMode.set(false);

    this.saveSuccess.set(
      docWarn
        ? `Request registered! ID: ${this.passId()} — Documents upload failed; add from Documents module.`
        : `Request submitted! ID: ${this.passId()} is now pending confirmer review.`
    );

    setTimeout(() => {

      this.router.navigate(['/passes/all']);

    }, 2200);
  }

  private _buildRecord(status: 'Saved' | 'Submitted'): PassRecord {
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
      contractorFirm: this.contractorCode,
      issueDate: this.todayDate,
      validityDate: this.validityDate,
      gateNo: this.gateNo,
      parkingArea: this.parkingArea,
      remark: this.remark,
      docs: this.docs().map(d => ({
        docType: d.docType,
        docNo: d.docNo,
        validUpto: d.validUpto,
      })),
      status: status,
      createdAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    };
  }

  clearForm(): void {
    this.empType.set('');
    this.vehicleNo = ''; this.vehicleType = ''; this.brandModel = ''; this.vehicleClass = '';
    this.ecNo = ''; this.contractorCode = '';
    this.validityDate = ''; this.gateNo = ''; this.parkingArea = ''; this.remark = '';
    this.empName.set(''); this.empDept.set(''); this.empSalary.set('');
    this.empAadhar.set('');
    this.empDeptCode.set('');
    this.empType_display.set('');
    this.empTypeDetail.set('');
    this.empContractorCode = '';
    this.empContractorName = '';
    this.empContractorEmail = '';
    this.contractorName = '';
    this.contractorEmail = '';
    this.empData = null;
    this.docs.set([]);
    this.passId.set(''); this.passIdGenerated.set(false);
    this.saved.set(false);
    this.savedVehicleId = null; this.savedPassRegistryId = null;
    this.draftPassId = null;
    this.modificationRemark.set('');
    this.isModificationMode.set(false);
    this.clearAlerts(); this.empFetchError.set('');
  }

  private logHistory(passNo: any, action: string, empCode: string, remark: string): void {
    const payload = {
      passNo: String(passNo ?? ''),
      empCode: (empCode || 'ADMIN').toUpperCase(),
      action: action.toUpperCase(),
      aadhaarNo: this.empAadhar() || null,
      remark: remark || null,
      dateOfEntry: new Date().toISOString(),
    };
    this.http
      .post<any>(API_CONFIG.HISTORY_LOG, payload, { headers: this.HEADERS, observe: 'response' })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => { console.warn('[History] silent fail:', err?.status); return of(null); })
      )
      .subscribe(res => {
        if (res?.status === 200 || res?.status === 201)
          console.log('[History] Logged:', payload.action);
      });
  }

  private handleSaveError(err: any, step: string): void {
    const status = err?.status ?? '?';
    const body = err?.error;
    let msg = '';
    if (body instanceof Blob) {
      body.text().then(t => {
        try { msg = JSON.parse(t)?.message || t; } catch { msg = t; }
        this.saveError.set(`[${step}] [${status}] ${msg.substring(0, 300)}`);
        this.isSaving.set(false);
      });
      return;
    }
    msg = (typeof body === 'string' && body.trim())
      ? body.trim()
      : (body?.message || body?.error || 'Server error — check backend logs.');
    this.saveError.set(`[${step}] [${status}] ${msg.substring(0, 300)}`);
    this.isSaving.set(false);
  }
}