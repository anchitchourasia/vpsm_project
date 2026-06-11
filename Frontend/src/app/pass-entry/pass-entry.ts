import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';
import { PassStateService, PassRecord } from '../services/pass-state.service';

const HTTP_TIMEOUT_MS = 12000;

// Employee array index positions — matches /api/reports/employee-department
// Response format: [empNo, name, salary, managerId, email, deptId, deptName]
const EMP_IDX = { empNo: 0, name: 1, salary: 2, email: 4, deptName: 6 };

function formatPassId(dbPassId: number): string {
  return `PASS-HEG-${String(dbPassId).padStart(4, '0')}`;
}

interface DocEntry {
  id       : string;
  docType  : string;
  docNo    : string;
  validUpto: string;
  file     : File | null;
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

  if (heavy.some(k => v.includes(k)))      return 'Heavy_Machinery';
  if (twoWheeler.some(k => v.includes(k))) return 'Two_Wheeler';
  if (v.length >= 2)                       return 'Four_Wheeler';
  return '';
}

function emptyDoc(): DocEntry {
  return { id: crypto.randomUUID(), docType: '', docNo: '', validUpto: '', file: null };
}

@Component({
  selector   : 'app-pass-entry',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './pass-entry.html',
  styleUrl   : './pass-entry.css',
})
export class PassEntry implements OnInit, OnDestroy {

  protected readonly ALLOWED_DOC_TYPES = ALLOWED_DOC_TYPES;

  private destroy$ = new Subject<void>();

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });
  private readonly MULTIPART_HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    // DO NOT set Content-Type — browser sets multipart boundary automatically
  });

  private passState = inject(PassStateService);

  // ── Signals ────────────────────────────────────────────────────────────────
  empType          = signal<string>('');
  passId           = signal<string>('');
  passIdGenerated  = signal(false);
  fetchingEmployee = signal(false);
  empFetchError    = signal('');
  empName          = signal('');
  empDept          = signal('');
  empSalary        = signal('');
  isSaving         = signal(false);
  saved            = signal(false);
  saveSuccess      = signal('');
  saveError        = signal('');
  docs             = signal<DocEntry[]>([]);

  // ── Form fields ────────────────────────────────────────────────────────────
  vehicleNo      = '';
  vehicleType    = '';
  brandModel     = '';
  vehicleClass   = '';
  ecNo           = '';
  contractorCode = '';
  validityDate   = '';
  gateNo         = '';
  parkingArea    = '';
  remark         = '';

  private empData            : any           = null;
  private savedVehicleId     : number | null = null;
  private savedPassRegistryId: number | null = null;

  // ✅ Tracks the DRAFT- passId assigned at Save time so we can clean it up after Submit
  private draftPassId: string | null = null;

  // ── DATE HELPERS ───────────────────────────────────────────────────────────
  get todayDate(): string { return new Date().toISOString().split('T')[0]; }

  formatDateDDMMYYYY(isoDate: string): string {
    if (!isoDate || isoDate.length < 10) return isoDate ?? '';
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
  }

  openDatePicker(input: HTMLInputElement): void {
    try { (input as any).showPicker(); } catch { input.click(); }
  }

  availableDocTypes = (currentDoc: DocEntry): string[] => {
    const used = this.docs().filter(d => d !== currentDoc).map(d => d.docType).filter(Boolean);
    return ALLOWED_DOC_TYPES.filter(t => !used.includes(t));
  };

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    // ✅ Resume draft if user navigated back from Pass Details → Drafts tab → Resume
    try {
      const raw = localStorage.getItem('vpsm_resume_draft');
      if (raw) {
        const draft: PassRecord = JSON.parse(raw);
        localStorage.removeItem('vpsm_resume_draft'); // consume it — one-time use

        this.empType.set(draft.empType);
        this.vehicleNo      = draft.vehicleNo;
        this.vehicleType    = draft.vehicleType;
        this.vehicleClass   = draft.vehicleClass;
        this.brandModel     = draft.brandModel;
        this.ecNo           = draft.ecNo;
        this.contractorCode = draft.contractorFirm;
        this.validityDate   = draft.validityDate;
        this.gateNo         = draft.gateNo;
        this.parkingArea    = draft.parkingArea;
        this.remark         = draft.remark;
        this.empName.set(draft.empName);
        this.empDept.set(draft.empDept);

        // ✅ Keep the DRAFT- id so we can delete it from localStorage after Submit
        this.draftPassId = draft.passId;
        this.passId.set(draft.passId);
        this.passIdGenerated.set(true);
        this.saved.set(true);
        this.saveSuccess.set(
          `Draft resumed — ${draft.passId}. Add all 5 documents and click Submit to register.`
        );
      }
    } catch { /* silent */ }
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ── EMPLOYEE TYPE SWITCH ───────────────────────────────────────────────────
  setEmpType(t: string): void {
    this.empType.set(t);
    this.ecNo = ''; this.contractorCode = '';
    this.empName.set(''); this.empDept.set(''); this.empSalary.set('');
    this.empFetchError.set(''); this.empData = null;
    this.clearAlerts();
  }

  // ── VEHICLE TYPE INPUT ─────────────────────────────────────────────────────
  onVehicleTypeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const val   = input.value.toUpperCase();
    this.vehicleType = val;
    input.value      = val;
    const detected = detectVehicleClass(val);
    if (detected) this.vehicleClass = detected;
  }

  onUpperInput(event: Event, field: keyof this): void {
    const input = event.target as HTMLInputElement;
    const val   = input.value.toUpperCase().replace(/\s+/g, '');
    (this as any)[field] = val;
    input.value = val;
  }

  onDocNoInput(event: Event, doc: DocEntry): void {
    const input = event.target as HTMLInputElement;
    doc.docNo   = input.value.toUpperCase();
    input.value = doc.docNo;
  }

  // ── EC NO AUTO-FILL ────────────────────────────────────────────────────────
  onEcNoBlur(): void {
    const ecNo = this.ecNo.trim();
    if (!ecNo) return;

    this.empFetchError.set('');
    this.empName.set('');
    this.empDept.set('');
    this.empSalary.set('');
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

        const match = rows.find(r => String(r[EMP_IDX.empNo]) === ecNo);

        if (match) {
          this.empData = match;
          this.empName.set(String(match[EMP_IDX.name]     || ''));
          this.empDept.set(String(match[EMP_IDX.deptName] || '').toUpperCase());
          this.empSalary.set(String(match[EMP_IDX.salary] || ''));
          this.empFetchError.set('');
        } else {
          this.empFetchError.set(`No employee found for EC No: ${ecNo}`);
        }
      });
  }

  // ── DOCUMENTS ──────────────────────────────────────────────────────────────
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

  // ✅ FIXED: Use signal update instead of direct mutation — prevents Angular
  //           change detection delay that caused 30s UI freeze on file select
  onDocFileSelected(event: Event, doc: DocEntry): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    if (file.type !== 'application/pdf') { this.saveError.set('Only PDF files are allowed.'); return; }
    if (file.size > 10 * 1024 * 1024)   { this.saveError.set('File must be under 10 MB.'); return; }
    this.docs.update(list =>
      list.map(d => d.id === doc.id ? { ...d, file } : d)
    );
    this.clearAlerts();
  }

  shortName(name: string): string { return name.length > 18 ? name.substring(0, 15) + '...' : name; }

  // ── VALIDATION (Save — form fields only, docs not mandatory) ──────────────
  private validate(): string {
    if (!this.vehicleNo.trim())   return 'Vehicle No is required.';
    if (!this.vehicleType.trim()) return 'Vehicle Type is required.';
    if (!this.vehicleClass)       return 'Vehicle Class is required.';
    if (this.empType() === 'Company_Employee' && !this.ecNo.trim())
                                  return 'EC No is required.';
    if (this.empType() === 'Contractor' && !this.contractorCode.trim())
                                  return 'Contractor Code is required.';
    if (!this.validityDate)       return 'Validity Date is required.';
    if (this.validityDate <= this.todayDate)
                                  return 'Validity Date must be in the future.';
    if (!this.gateNo)             return 'Gate No is required.';
    for (const doc of this.docs()) {
      if (!doc.docType)        return 'Select Document Type for all document rows.';
      if (!doc.docNo.trim())   return `Document No is required for ${doc.docType}.`;
      if (!doc.validUpto)      return `Valid Upto date is required for ${doc.docType}.`;
      if (!doc.file)           return `Please upload a PDF file for ${doc.docType}.`;
    }
    return '';
  }

  // ── VALIDATION (Submit — all 5 docs strictly mandatory) ───────────────────
  private validateSubmit(): string {
    if (this.docs().length < ALLOWED_DOC_TYPES.length) {
      const missing = ALLOWED_DOC_TYPES.filter(
        t => !this.docs().some(d => d.docType === t)
      );
      return `All 5 documents are mandatory. Missing: ${missing.join(', ')}.`;
    }
    for (const doc of this.docs()) {
      if (!doc.docType)        return 'Select Document Type for all document rows.';
      if (!doc.docNo.trim())   return `Document No is required for ${doc.docType}.`;
      if (!doc.validUpto)      return `Valid Upto date is required for ${doc.docType}.`;
      if (!doc.file)           return `Please upload a PDF file for ${doc.docType}.`;
    }
    return '';
  }

  private clearAlerts(): void { this.saveError.set(''); this.saveSuccess.set(''); }

  // ── SAVE — LOCAL ONLY, ZERO API CALLS ─────────────────────────────────────
  // ✅ Validates form fields → generates a DRAFT- prefix local ID → persists
  //    to localStorage via PassStateService. Nothing touches the DB.
  //    Real PASS-HEG-XXXX ID is only assigned by DB at Submit time.
  onSave(): void {
    const err = this.validate();
    if (err) { this.saveError.set(err); return; }
    this.clearAlerts();

    // Generate a local DRAFT- ID only once per session
    // If user saves again (re-save), reuse the existing DRAFT- id
    if (!this.passIdGenerated()) {
      const draftId = `DRAFT-${Date.now()}`;
      this.passId.set(draftId);
      this.passIdGenerated.set(true);
      this.draftPassId = draftId;
    }

    // ✅ Build PassRecord with status 'Saved' — no DB fields (vehicleId etc.) needed
    const record: PassRecord = {
      passId        : this.passId(),
      empType       : this.empType(),
      vehicleNo     : this.vehicleNo,
      vehicleType   : this.vehicleType,
      vehicleClass  : this.vehicleClass,
      brandModel    : this.brandModel,
      ecNo          : this.ecNo,
      empName       : this.empName(),
      empDept       : this.empDept(),
      contractorFirm: this.contractorCode,
      issueDate     : this.todayDate,
      validityDate  : this.validityDate,
      gateNo        : this.gateNo,
      parkingArea   : this.parkingArea,
      remark        : this.remark,
      docs          : this.docs().map(d => ({
        docType  : d.docType,
        docNo    : d.docNo,
        validUpto: d.validUpto,
      })),
      status   : 'Saved',
      createdAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    };

    // ✅ Persist to localStorage — survives refresh & session close
    this.passState.upsert(record);
    this.saved.set(true);
    this.saveSuccess.set(
      `Draft saved — ${this.passId()}. Add all 5 documents then click Submit to register.`
    );
  }

  // ── SUBMIT — ALL 3 API STEPS, ALWAYS ──────────────────────────────────────
  // ✅ Works whether user saved first or clicks Submit directly.
  //    In both cases: validate fully → run Step1 → Step2 → Step3 → register in DB.
  //    After success, old DRAFT- record (if any) is removed from localStorage.
  onSubmit(): void {
    const formErr = this.validate();
    if (formErr) { this.saveError.set(formErr); return; }
    const docErr = this.validateSubmit();
    if (docErr) { this.saveError.set(docErr); return; }
    if (this.isSaving()) return;
    this.clearAlerts();
    this.isSaving.set(true);
    this.step1RegisterVehicle();
  }

  // STEP 1 — POST /api/vehicles/register
  private step1RegisterVehicle(): void {
    const payload = {
      vehicleNo    : this.vehicleNo.trim().toUpperCase(),
      vehicleType  : this.vehicleType.trim(),
      vehicleClass : this.vehicleClass,
      brandModel   : this.brandModel.trim() || null,
      isActive     : 'Y',
      isBlacklisted: 'N',
    };

    console.log('[Step 1] Registering vehicle...');
    this.http.post<any>(API_CONFIG.VEHICLES_REGISTER, payload, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => { this.handleSaveError(err, 'Step 1 — Vehicle'); return of(null); })
      )
      .subscribe(vRes => {
        if (!vRes) return;
        this.savedVehicleId = vRes.vehicleId ?? vRes.id ?? null;
        console.log('[Step 1] Vehicle ID:', this.savedVehicleId);
        this.step2IssuePass();
      });
  }

  // STEP 2 — POST /api/passes/issue
  private step2IssuePass(): void {
    const payload = {
      vehicle          : { vehicleId: this.savedVehicleId },
      issueDate        : this.todayDate,
      validityDate     : this.validityDate,
      employeeNo       : this.empType() === 'Company_Employee' ? this.ecNo.trim()           : null,
      employeeCompanyNo: this.empType() === 'Company_Employee' ? this.ecNo.trim()           : null,
      dept             : this.empDept() || null,
      contractorCode   : this.empType() === 'Contractor'       ? this.contractorCode.trim() : null,
      gateNo           : this.gateNo,
      parkingToBeUsed  : this.parkingArea.trim() || null,
      status           : 'Active',
      empType          : this.empType(),
      enterBy          : 'ADMIN',
      enterDate        : this.todayDate,
      remarks          : this.remark.trim() || null,
    };

    console.log('[Step 2] Issuing pass...');
    this.http.post<any>(API_CONFIG.PASSES_ISSUE, payload, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => { this.handleSaveError(err, 'Step 2 — Pass'); return of(null); })
      )
      .subscribe(pRes => {
        if (!pRes) return;
        this.savedPassRegistryId = pRes.passId ?? pRes.id ?? null;

        // ✅ Real DB-assigned Pass ID replaces any DRAFT- id
        const realId = formatPassId(this.savedPassRegistryId!);
        this.passId.set(realId);
        this.passIdGenerated.set(true);

        console.log('[Step 2] Real Pass ID:', realId, '| DB ID:', this.savedPassRegistryId);
        if (this.docs().length > 0) { this.step3UploadDocs(); }
        else { this.finaliseSubmit(); }
      });
  }

  // STEP 3 — POST /api/documents/upload
  // ✅ Sends each document as a raw multipart File (MultipartFile on backend).
  //    Backend reads bytes directly — no Base64 conversion needed.
  //    ALLOWED_DOC_TYPES = ['RC', 'PUC', 'INSURANCE', 'LICENSE', 'FITNESS']
  //    Maps: RC→rcFile, PUC→pucFile, INSURANCE→insuranceFile,
  //          LICENSE→loadTestFile, FITNESS→fitnessFile
  private step3UploadDocs(): void {
    const docsToProcess = this.docs().filter(d => d.docType && d.file);
    if (docsToProcess.length === 0) { this.finaliseSubmit(); return; }

    const fd = new FormData();
    fd.append('vehicleId', String(this.savedVehicleId));
    fd.append('enterBy',   'ADMIN');

    for (const doc of docsToProcess) {
      const dt   = doc.docType.toLowerCase(); // 'rc' | 'puc' | 'insurance' | 'license' | 'fitness'
      const file = doc.file!;

      if (dt === 'rc') {
        fd.append('rcNo',     doc.docNo);
        fd.append('rcStart',  this.todayDate);
        fd.append('rcExpiry', doc.validUpto);
        fd.append('rcFile',   file, file.name);
      } else if (dt === 'puc') {
        fd.append('pucNo',     doc.docNo);
        fd.append('pucStart',  this.todayDate);
        fd.append('pucExpiry', doc.validUpto);
        fd.append('pucFile',   file, file.name);
      } else if (dt === 'insurance') {
        fd.append('insuranceNo',     doc.docNo);
        fd.append('insuranceStart',  this.todayDate);
        fd.append('insuranceExpiry', doc.validUpto);
        fd.append('insuranceFile',   file, file.name);
      } else if (dt === 'license') {
        // ✅ LICENSE maps to loadTest fields in backend
        fd.append('loadTestNo',     doc.docNo);
        fd.append('loadTestStart',  this.todayDate);
        fd.append('loadTestExpiry', doc.validUpto);
        fd.append('loadTestFile',   file, file.name);
      } else if (dt === 'fitness') {
        fd.append('fitnessNo',     doc.docNo);
        fd.append('fitnessStart',  this.todayDate);
        fd.append('fitnessExpiry', doc.validUpto);
        fd.append('fitnessFile',   file, file.name);
      }
    }

    console.log('[Step 3] Uploading documents as raw multipart files...');
    this.http.post<any>(API_CONFIG.DOCUMENTS_UPLOAD, fd, { headers: this.MULTIPART_HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => {
          console.warn('[Step 3] Doc upload failed:', err?.status);
          // ✅ Docs failed but pass is registered — still finalise, warn user
          this.finaliseSubmit(true);
          return of(null);
        })
      )
      .subscribe(dRes => {
        if (dRes !== null) this.finaliseSubmit();
      });
  }

  // ── FINALISE SUBMIT ────────────────────────────────────────────────────────
  // ✅ All 3 steps done. Build PassRecord with real PASS-HEG-XXXX ID,
  //    upsert to localStorage, delete old DRAFT- record if existed,
  //    log history, show success, redirect.
  private finaliseSubmit(docWarn = false): void {
    this.isSaving.set(false);
    this.saved.set(true);

    const record: PassRecord = {
      passId        : this.passId(),          // ✅ Real PASS-HEG-XXXX from DB
      empType       : this.empType(),
      vehicleNo     : this.vehicleNo,
      vehicleType   : this.vehicleType,
      vehicleClass  : this.vehicleClass,
      brandModel    : this.brandModel,
      ecNo          : this.ecNo,
      empName       : this.empName(),
      empDept       : this.empDept(),
      contractorFirm: this.contractorCode,
      issueDate     : this.todayDate,
      validityDate  : this.validityDate,
      gateNo        : this.gateNo,
      parkingArea   : this.parkingArea,
      remark        : this.remark,
      docs          : this.docs().map(d => ({
        docType  : d.docType,
        docNo    : d.docNo,
        validUpto: d.validUpto,
      })),
      status   : 'Submitted',
      createdAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    };

    // ✅ Remove the old DRAFT- record from localStorage before upserting the real one
    if (this.draftPassId && this.draftPassId !== this.passId()) {
      this.passState.deleteDraft(this.draftPassId);
    }
    this.draftPassId = null;

    // ✅ Upsert the real submitted record into localStorage
    this.passState.upsert(record);

    this.logHistory(
      this.savedPassRegistryId ?? this.savedVehicleId, 'APPROVED',
      this.ecNo.trim(),
      `Pass submitted — ID: ${this.passId()}, Vehicle: ${this.vehicleNo}`
    );

    this.saveSuccess.set(
      docWarn
        ? `Pass registered! ID: ${this.passId()} — Documents upload failed; add from Documents module.`
        : `Pass submitted! ID: ${this.passId()} is now active. Redirecting...`
    );
    setTimeout(() => this.router.navigate(['/passes/active']), 2200);
  }

  // ── CLEAR ──────────────────────────────────────────────────────────────────
  clearForm(): void {
    this.vehicleNo = ''; this.vehicleType = ''; this.brandModel = ''; this.vehicleClass = '';
    this.ecNo = ''; this.contractorCode = '';
    this.validityDate = ''; this.gateNo = ''; this.parkingArea = ''; this.remark = '';
    this.empName.set(''); this.empDept.set(''); this.empSalary.set('');
    this.empData = null;
    this.docs.set([]);
    this.passId.set(''); this.passIdGenerated.set(false);
    this.saved.set(false);
    this.savedVehicleId = null; this.savedPassRegistryId = null;
    this.draftPassId = null;
    this.clearAlerts(); this.empFetchError.set('');
  }

  // ── HISTORY LOG — silent, never blocks UI ─────────────────────────────────
  private logHistory(passNo: any, action: string, empCode: string, remark: string): void {
    const payload = {
      passNo     : String(passNo ?? ''),
      empCode    : (empCode || 'ADMIN').toUpperCase(),
      action     : action.toUpperCase(),
      remark     : remark || null,
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
    const body   = err?.error;
    let   msg    = '';
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