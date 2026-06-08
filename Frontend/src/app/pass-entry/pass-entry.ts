import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core'; // ← added inject
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';
import { PassStateService, PassRecord } from '../services/pass-state.service'; // ← NEW


const HTTP_TIMEOUT_MS = 12000;


function generatePassId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `PASS-${date}-${rand}`;
}


interface DocEntry {
  id       : string;
  docType  : string;
  docNo    : string;
  validUpto: string;
  file     : File | null;
}


const ALLOWED_DOC_TYPES = ['RC', 'PUC', 'INSURANCE', 'LICENSE', 'FITNESS'];


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

  private destroy$          = new Subject<void>();
  private readonly HEADERS      = new HttpHeaders({ Accept: '*/*' });
  private readonly JSON_HEADERS = new HttpHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' });
  private readonly POST_HEADERS = new HttpHeaders({ 'x-api-key': API_CONFIG.API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' });

  // ← NEW: inject PassStateService
  private passState = inject(PassStateService);

  empType          = signal<string>('');
  passId           = signal<string>('');
  passIdGenerated  = signal(false);
  fetchingEmployee = signal(false);
  empFetchError    = signal('');
  empName          = signal('');
  empDept          = signal('');
  isSaving         = signal(false);
  saved            = signal(false);
  saveSuccess      = signal('');
  saveError        = signal('');
  docs             = signal<DocEntry[]>([]);

  vehicleNo      = '';
  vehicleType    = '';
  brandModel     = '';
  vehicleClass   = '';
  ecNo           = '';
  contractorFirm = '';
  validityDate   = '';
  gateNo         = '';
  parkingArea    = '';
  remark         = '';

  private empData            : any          = null;
  private savedVehicleId     : number | null = null;
  private savedPassRegistryId: number | null = null;

  get todayDate(): string { return new Date().toISOString().split('T')[0]; }

  availableDocTypes = (currentDoc: DocEntry): string[] => {
    const used = this.docs().filter(d => d !== currentDoc).map(d => d.docType).filter(Boolean);
    return ALLOWED_DOC_TYPES.filter(t => !used.includes(t));
  };

  constructor(private http: HttpClient, private router: Router) {}
  ngOnInit(): void {}
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  setEmpType(t: string): void { this.empType.set(t); this.clearAlerts(); }

  onUpperInput(event: Event, field: keyof this): void {
    const input = event.target as HTMLInputElement;
    const val   = input.value.toUpperCase();
    (this as any)[field] = val;
    input.value = val;
  }

  onDocNoInput(event: Event, doc: DocEntry): void {
    const input = event.target as HTMLInputElement;
    doc.docNo   = input.value.toUpperCase();
    input.value = doc.docNo;
  }

  // ── Auto-fill employee on EC blur ──
  onEcNoBlur(): void {
    if (!this.ecNo.trim()) return;
    this.empFetchError.set(''); this.empName.set(''); this.empDept.set(''); this.empData = null;
    this.fetchingEmployee.set(true);

    const url = `${API_CONFIG.BASE_URL}/api/reports/employee-department?ecNo=${encodeURIComponent(this.ecNo.trim())}`;
    this.http.get<any>(url, { headers: this.JSON_HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          this.empFetchError.set(
            err?.status === 404
              ? `No employee found for EC No: ${this.ecNo}`
              : `Could not fetch employee details (${err?.status ?? 'network error'})`
          );
          this.fetchingEmployee.set(false);
          return of(null);
        })
      )
      .subscribe((res: any) => {
        this.fetchingEmployee.set(false);
        if (!res) return;
        const rec = Array.isArray(res) ? res[0] : res;
        if (!rec) { this.empFetchError.set(`No data for EC No: ${this.ecNo}`); return; }
        this.empData = rec;
        this.empName.set(rec.employeeName || rec.name || rec.empName || '');
        this.empDept.set(
          this.empType() === 'Contractor'
            ? (rec.agencyName  || rec.companyName || rec.department || '')
            : (rec.departmentName || rec.department || rec.dept || '')
        );
      });
  }

  // ── Documents ──
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
    if (file.size > 10 * 1024 * 1024)   { this.saveError.set('File must be under 10 MB.'); return; }
    doc.file = file;
    this.clearAlerts();
  }

  shortName(name: string): string { return name.length > 18 ? name.substring(0, 15) + '...' : name; }

  // ── Validation ──
  private validate(): string {
    if (!this.vehicleNo.trim())    return 'Vehicle No is required.';
    if (!this.vehicleType.trim())  return 'Vehicle Type is required.';
    if (!this.vehicleClass)        return 'Vehicle Class is required.';
    if (!this.ecNo.trim())         return 'EC No is required.';
    if (!this.validityDate)        return 'Validity Date is required.';
    if (this.validityDate <= this.todayDate) return 'Validity Date must be in the future.';
    if (!this.gateNo)              return 'Gate No is required.';
    for (const doc of this.docs()) {
      if (!doc.docType)        return 'Select Document Type for all document rows.';
      if (!doc.docNo.trim())   return `Document No is required for ${doc.docType}.`;
      if (!doc.validUpto)      return `Valid Upto date is required for ${doc.docType}.`;
    }
    return '';
  }

  private clearAlerts(): void { this.saveError.set(''); this.saveSuccess.set(''); }

  // ── SAVE: Step 1 → Vehicle, Step 2 → Pass, Step 3 → Docs ──
  onSave(): void {
    this.clearAlerts();
    const err = this.validate();
    if (err) { this.saveError.set(err); return; }
    if (this.isSaving()) return;
    this.isSaving.set(true);

    const vehiclePayload = {
      vehicleNo   : this.vehicleNo.trim(),
      vehicleType : this.vehicleType.trim(),
      vehicleClass: this.vehicleClass,
      brandModel  : this.brandModel.trim() || null,
      isActive    : 'Y',
      isBlacklisted: 'N',
    };

    this.http.post<any>(API_CONFIG.VEHICLES_REGISTER, vehiclePayload, { headers: this.POST_HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err2 => { this.handleSaveError(err2, 'Step 1 — Vehicle'); return of(null); })
      )
      .subscribe((vRes: any) => {
        if (!vRes) return;
        this.savedVehicleId = vRes.vehicleId ?? vRes.id ?? null;
        if (!this.savedVehicleId) {
          this.saveError.set('[Step 1] Vehicle registered but ID not returned.');
          this.isSaving.set(false); return;
        }
        this.step2IssuePass();
      });
  }

  private step2IssuePass(): void {
    const passPayload: any = {
      vehicle     : { vehicleId: this.savedVehicleId },
      issueDate   : this.todayDate,
      validityDate: this.validityDate,
      assignedGate: this.gateNo,
      parkingArea : this.parkingArea || null,
      passStatus  : 'Active',
      remarks     : this.remark || null,
      userCategory: this.empType(),
      user        : { employeeCode: this.ecNo.trim() },
    };

    this.http.post<any>(API_CONFIG.PASSES_ISSUE, passPayload, { headers: this.POST_HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => { this.handleSaveError(err, 'Step 2 — Pass Issue'); return of(null); })
      )
      .subscribe((pRes: any) => {
        if (!pRes) return;
        this.savedPassRegistryId = pRes.passId ?? pRes.id ?? null;
        const genId = generatePassId();
        this.passId.set(genId);
        this.passIdGenerated.set(true);
        this.logHistory(
          this.savedPassRegistryId ?? this.savedVehicleId,
          'CREATE', this.ecNo.trim(),
          `Pass raised for Vehicle ${this.vehicleNo} — Gate: ${this.gateNo}, Valid till: ${this.validityDate}`
        );
        if (this.docs().length > 0) { this.step3UploadDocs(); }
        else { this.finaliseSave(); }
      });
  }

  private step3UploadDocs(): void {
    const fd = new FormData();
    fd.append('vehicleId', String(this.savedVehicleId));
    fd.append('enterBy', this.ecNo.trim() || 'ADMIN');
    let hasAny = false;

    for (const doc of this.docs()) {
      const dt = (doc.docType || '').toLowerCase();
      if (!dt) continue; hasAny = true;
      if (dt === 'rc')             { fd.append('rcNo', doc.docNo); fd.append('rcStart', this.todayDate); fd.append('rcExpiry', doc.validUpto); if (doc.file) fd.append('rcFile', doc.file, doc.file.name); }
      else if (dt === 'puc')       { fd.append('pucNo', doc.docNo); fd.append('pucStart', this.todayDate); fd.append('pucExpiry', doc.validUpto); if (doc.file) fd.append('pucFile', doc.file, doc.file.name); }
      else if (dt === 'insurance') { fd.append('insuranceNo', doc.docNo); fd.append('insuranceStart', this.todayDate); fd.append('insuranceExpiry', doc.validUpto); if (doc.file) fd.append('insuranceFile', doc.file, doc.file.name); }
      else if (dt === 'fitness')   { fd.append('fitnessNo', doc.docNo); fd.append('fitnessStart', this.todayDate); fd.append('fitnessExpiry', doc.validUpto); if (doc.file) fd.append('fitnessFile', doc.file, doc.file.name); }
      else if (dt === 'license')   { fd.append('loadTestNo', doc.docNo); fd.append('loadTestStart', this.todayDate); fd.append('loadTestExpiry', doc.validUpto); if (doc.file) fd.append('loadTestFile', doc.file, doc.file.name); }
    }

    if (!hasAny) { this.finaliseSave(); return; }
    this.http.post<any>(API_CONFIG.DOCUMENTS_UPLOAD, fd, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$),
        catchError(err => { console.warn('⚠️ [Step 3] Doc upload failed:', err?.status); this.finaliseSave(true); return of(null); })
      )
      .subscribe(dRes => { if (dRes !== null) this.finaliseSave(); });
  }

  private finaliseSave(docWarn = false): void {
    this.isSaving.set(false); this.saved.set(true);
    this.saveSuccess.set(
      docWarn
        ? `✅ Pass saved (ID: ${this.passId()}) — Documents had an issue; upload separately from Documents module.`
        : `✅ Pass saved! Pass ID: ${this.passId()}. Click Submit to finalise.`
    );
  }

  // ── SUBMIT ── ← ONLY THIS METHOD CHANGED
  onSubmit(): void {
    if (!this.saved()) { this.saveError.set('Please Save first.'); return; }
    this.clearAlerts();

    // Push to PassStateService so Pass Details view shows it
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
      contractorFirm: this.contractorFirm,
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
    this.passState.upsert(record);

    // History log
    this.logHistory(
      this.savedPassRegistryId ?? this.savedVehicleId, 'APPROVED',
      this.ecNo.trim(), `Pass submitted — ID: ${this.passId()}, Vehicle: ${this.vehicleNo}`
    );

    this.saveSuccess.set(`🎉 Pass submitted! ID: ${this.passId()} is now active. Redirecting...`);
    setTimeout(() => this.router.navigate(['/passes/active']), 2200);
  }

  // ── CLEAR ──
  clearForm(): void {
    this.vehicleNo = ''; this.vehicleType = ''; this.brandModel = ''; this.vehicleClass = '';
    this.ecNo = ''; this.contractorFirm = '';
    this.validityDate = ''; this.gateNo = ''; this.parkingArea = ''; this.remark = '';
    this.empName.set(''); this.empDept.set(''); this.empData = null;
    this.docs.set([]);
    this.passId.set(''); this.passIdGenerated.set(false);
    this.saved.set(false); this.savedVehicleId = null; this.savedPassRegistryId = null;
    this.clearAlerts(); this.empFetchError.set('');
  }

  // ── History log (silent) ──
  private logHistory(passNo: any, action: string, empCode: string, remark: string): void {
    const payload = {
      passNo     : String(passNo ?? ''),
      empCode    : (empCode || 'ADMIN').toUpperCase(),
      action     : action.toUpperCase(),
      remark     : remark || null,
      dateOfEntry: new Date().toISOString(),
    };
    this.http.post<any>(API_CONFIG.HISTORY_LOG, payload, { headers: this.POST_HEADERS, observe: 'response' })
      .pipe(timeout(HTTP_TIMEOUT_MS), takeUntil(this.destroy$), catchError(err => { console.warn('⚠️ [History] silent fail:', err?.status); return of(null); }))
      .subscribe(res => { if (res?.status === 200 || res?.status === 201) console.log('📋 [History] Logged:', payload.action); });
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
      }); return;
    }
    msg = (typeof body === 'string' && body.trim()) ? body.trim() : (body?.message || body?.error || 'Server error — check backend logs.');
    this.saveError.set(`[${step}] [${status}] ${msg.substring(0, 300)}`);
    this.isSaving.set(false);
  }
}