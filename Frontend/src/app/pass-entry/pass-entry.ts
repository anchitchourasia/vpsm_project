import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

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
  selector  : 'app-pass-entry',
  standalone: true,
  imports   : [CommonModule, FormsModule],
  styleUrl  : './pass-entry.css',
  template  : `
<div class="pe-wrapper">

  <!-- TOP BAR -->
  <div class="pe-topbar">
    <div class="pe-topbar-left">
      <i class="bi bi-pass-fill pe-topbar-icon"></i>
      <span class="pe-topbar-title">Pass Entry Form</span>
      <span class="pe-topbar-sub">General Details</span>
    </div>
    <div class="pe-pass-id-chip" [class.generated]="passIdGenerated()">
      <i class="bi bi-qr-code"></i>
      <span>{{ passId() || 'Pass ID will generate on Save' }}</span>
    </div>
  </div>

  <!-- EMPLOYEE TYPE SELECTOR -->
  <div class="pe-emp-type-row">
    <span class="pe-emp-type-label">Employee Type <span class="req">*</span></span>
    <div class="pe-emp-type-options">
      <label class="pe-type-card" [class.selected]="empType() === 'Company_Employee'"
             (click)="setEmpType('Company_Employee')">
        <i class="bi bi-building-fill"></i>
        <span>Company Employee</span>
        <i class="bi bi-check-circle-fill pe-check" *ngIf="empType() === 'Company_Employee'"></i>
      </label>
      <label class="pe-type-card" [class.selected]="empType() === 'Contractor'"
             (click)="setEmpType('Contractor')">
        <i class="bi bi-person-workspace"></i>
        <span>Contractor</span>
        <i class="bi bi-check-circle-fill pe-check" *ngIf="empType() === 'Contractor'"></i>
      </label>
    </div>
  </div>

  <!-- FORM BODY (shown after type selection) -->
  <div class="pe-form-body" *ngIf="empType()">

    <!-- ① VEHICLE DETAILS -->
    <!-- ① VEHICLE DETAILS -->
    <div class="pe-section">
      <div class="pe-section-header">
        <i class="bi bi-truck-front-fill"></i>
        <span>Vehicle Details</span>
      </div>
      <div class="pe-grid pe-grid-3">

        <!-- Vehicle Number -->
        <div class="pe-field">
          <label>Vehicle Number <span class="req">*</span></label>
          <input type="text" class="pe-input" placeholder="E.G. MP50XX1234"
            [(ngModel)]="vehicleNo"
            (input)="onUpperInput($event, 'vehicleNo')" maxlength="20" />
          <span class="pe-field-hint">Auto-normalized: UPPERCASE, no spaces</span>
        </div>

        <!-- Vehicle Type (free text — same as Vehicle Master modal) -->
        <div class="pe-field">
          <label>Vehicle Type <span class="req">*</span></label>
          <input type="text" class="pe-input" placeholder="e.g. Car, Bike, Truck, JCB"
            [(ngModel)]="vehicleType"
            (input)="onUpperInput($event, 'vehicleType')" maxlength="40" />
        </div>

        <!-- Vehicle Class (dropdown matching Vehicle Master) -->
        <div class="pe-field">
          <label>Vehicle Class <span class="req">*</span></label>
          <select class="pe-input" [(ngModel)]="vehicleClass">
            <option value="">-- Select Class --</option>
            <option value="Two_Wheeler">Two Wheeler</option>
            <option value="Four_Wheeler">Four Wheeler</option>
            <option value="Heavy_Machinery">Heavy Machinery</option>
          </select>
        </div>

        <!-- Brand / Model (free text — same as Vehicle Master modal) -->
        <div class="pe-field">
          <label>Brand / Model</label>
          <input type="text" class="pe-input" placeholder="e.g. Honda City, Tata Prima"
            [(ngModel)]="brandModel"
            (input)="onUpperInput($event, 'brandModel')" maxlength="60" />
        </div>
      </div>
    </div>

    <!-- ② EMPLOYEE / CONTRACTOR DETAILS -->
    <div class="pe-section">
      <div class="pe-section-header">
        <i class="bi bi-person-badge-fill"></i>
        <span>{{ empType() === 'Contractor' ? 'Contractor Details' : 'Employee Details' }}</span>
      </div>
      <div class="pe-grid pe-grid-3">
        <div class="pe-field">
          <label>EC No <span class="req">*</span></label>
          <div class="pe-input-group">
            <input type="text" class="pe-input" placeholder="Enter EC / Employee Code"
              [(ngModel)]="ecNo"
              (blur)="onEcNoBlur()"
              (input)="onUpperInput($event, 'ecNo')" maxlength="20" />
            <span class="pe-fetching" *ngIf="fetchingEmployee()">
              <i class="bi bi-arrow-repeat spin"></i>
            </span>
          </div>
          <span class="pe-field-hint">Auto-fills details on blur</span>
        </div>
        <div class="pe-field">
          <label>Name</label>
          <input type="text" class="pe-input pe-readonly" [value]="empName()" readonly
            placeholder="Auto-filled from EC No" />
        </div>
        <div class="pe-field">
          <label>{{ empType() === 'Contractor' ? 'Company / Agency' : 'Department' }}</label>
          <input type="text" class="pe-input pe-readonly" [value]="empDept()" readonly
            placeholder="Auto-filled from EC No" />
        </div>
        <div class="pe-field" *ngIf="empType() === 'Contractor'">
          <label>Contractor Firm Name</label>
          <input type="text" class="pe-input" placeholder="Firm name"
            [(ngModel)]="contractorFirm"
            (input)="onUpperInput($event, 'contractorFirm')" maxlength="60" />
        </div>
      </div>
      <div class="pe-fetch-error" *ngIf="empFetchError()">
        <i class="bi bi-exclamation-triangle-fill"></i> {{ empFetchError() }}
      </div>
    </div>

    <!-- ③ PASS DETAILS -->
    <div class="pe-section">
      <div class="pe-section-header">
        <i class="bi bi-card-checklist"></i>
        <span>Pass Details</span>
      </div>
      <div class="pe-grid pe-grid-3">
        <div class="pe-field">
          <label>Issue Date</label>
          <input type="date" class="pe-input pe-readonly" [value]="todayDate" readonly />
          <span class="pe-field-hint">Auto set to today</span>
        </div>
        <div class="pe-field">
          <label>Validity Date <span class="req">*</span></label>
          <input type="date" class="pe-input" [(ngModel)]="validityDate" [min]="todayDate" />
        </div>
        <div class="pe-field">
          <label>Gate No <span class="req">*</span></label>
          <select class="pe-input" [(ngModel)]="gateNo">
            <option value="">— Select Gate —</option>
            <option value="GATE_01">GATE 01</option>
            <option value="GATE_02">GATE 02</option>
            <option value="GATE_03">GATE 03</option>
            <option value="GATE_04">GATE 04</option>
            <option value="GATE_05">GATE 05</option>
          </select>
        </div>
        <div class="pe-field">
          <label>Parking to be Used</label>
          <select class="pe-input" [(ngModel)]="parkingArea">
            <option value="">— Select Parking —</option>
            <option value="P1_MAIN">P1 - Main Parking</option>
            <option value="P2_CONTRACTOR">P2 - Contractor Bay</option>
            <option value="P3_HEAVY">P3 - Heavy Machinery Bay</option>
            <option value="P4_VISITOR">P4 - Visitor Lot</option>
          </select>
        </div>
        <div class="pe-field pe-field-full">
          <label>Remark</label>
          <textarea class="pe-input" rows="2" placeholder="Optional notes..."
            [(ngModel)]="remark" maxlength="250"></textarea>
        </div>
      </div>
    </div>

    <!-- ④ REQUIRED DOCUMENTS (dropdown/expandable rows) -->
    <div class="pe-section">
      <div class="pe-section-header">
        <i class="bi bi-file-earmark-check-fill"></i>
        <span>Required Documents</span>
        <span class="pe-doc-count">{{ docs().length }} added</span>
      </div>

      <div class="pe-doc-table" *ngIf="docs().length > 0">
        <div class="pe-doc-header-row">
          <span>Doc Type</span>
          <span>Doc No</span>
          <span>Valid Upto</span>
          <span>File (PDF)</span>
          <span></span>
        </div>
        <div class="pe-doc-row" *ngFor="let doc of docs(); let i = index">
          <div class="pe-doc-cell">
            <select class="pe-input pe-input-sm" [(ngModel)]="doc.docType"
              (ngModelChange)="onDocTypeChange(doc)">
              <option value="">— Type —</option>
              <option *ngFor="let t of availableDocTypes(doc)" [value]="t">{{ t }}</option>
            </select>
          </div>
          <div class="pe-doc-cell">
            <input type="text" class="pe-input pe-input-sm" placeholder="Doc number"
              [(ngModel)]="doc.docNo"
              (input)="onDocNoInput($event, doc)" maxlength="60" />
          </div>
          <div class="pe-doc-cell">
            <input type="date" class="pe-input pe-input-sm" [(ngModel)]="doc.validUpto" />
          </div>
          <div class="pe-doc-cell">
            <label class="pe-file-btn" [class.has-file]="doc.file">
              <input type="file" accept=".pdf" class="pe-file-hidden"
                (change)="onDocFileSelected($event, doc)" />
              <i class="bi" [class]="doc.file ? 'bi-file-earmark-pdf-fill' : 'bi-cloud-upload'"></i>
              <span>{{ doc.file ? shortName(doc.file.name) : 'Upload PDF' }}</span>
            </label>
          </div>
          <div class="pe-doc-cell">
            <button class="pe-doc-remove" (click)="removeDoc(i)" title="Remove">
              <i class="bi bi-x-circle-fill"></i>
            </button>
          </div>
        </div>
      </div>

      <button class="pe-add-doc-btn" (click)="addDoc()"
        [disabled]="docs().length >= ALLOWED_DOC_TYPES.length">
        <i class="bi bi-plus-circle-fill"></i>
        Add Document
        <span class="pe-add-hint" *ngIf="docs().length >= ALLOWED_DOC_TYPES.length">
          (All 5 types added)
        </span>
      </button>

      <div class="pe-doc-info">
        <i class="bi bi-info-circle"></i>
        Supported: RC, PUC, Insurance, License, Fitness — each type can be added only once.
        Mandatory for Contractors &amp; Heavy Machinery vehicles.
      </div>
    </div>

    <!-- ALERTS -->
    <div class="pe-alert pe-alert-success" *ngIf="saveSuccess()">
      <i class="bi bi-check-circle-fill"></i> {{ saveSuccess() }}
    </div>
    <div class="pe-alert pe-alert-error" *ngIf="saveError()">
      <i class="bi bi-exclamation-triangle-fill"></i> {{ saveError() }}
    </div>

    <!-- ACTION BUTTONS -->
    <div class="pe-actions">
      <button class="pe-btn pe-btn-clear" (click)="clearForm()" [disabled]="isSaving()">
        <i class="bi bi-x-square"></i> Clear
      </button>
      <button class="pe-btn pe-btn-save" (click)="onSave()" [disabled]="isSaving()">
        <ng-container *ngIf="!isSaving()"><i class="bi bi-floppy-fill"></i> Save</ng-container>
        <ng-container *ngIf="isSaving()"><i class="bi bi-hourglass-split"></i> Saving...</ng-container>
      </button>
      <button class="pe-btn pe-btn-submit" (click)="onSubmit()" [disabled]="!saved() || isSaving()">
        <i class="bi bi-send-fill"></i> Submit
      </button>
    </div>
    <div class="pe-submit-hint" *ngIf="!saved()">
      <i class="bi bi-info-circle"></i>
      Save first to generate Pass ID, then Submit to finalise.
    </div>
  </div>

  <!-- EMPTY STATE before type selection -->
  <div class="pe-empty" *ngIf="!empType()">
    <i class="bi bi-arrow-up-circle-fill"></i>
    <p>Select employee type above to begin filling the form.</p>
  </div>

</div>
`,
})
export class PassEntry implements OnInit, OnDestroy {

  protected readonly ALLOWED_DOC_TYPES = ALLOWED_DOC_TYPES;

  private destroy$ = new Subject<void>();
  private readonly HEADERS      = new HttpHeaders({ Accept: '*/*' });
  private readonly JSON_HEADERS = new HttpHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' });
  private readonly POST_HEADERS = new HttpHeaders({ 'x-api-key': API_CONFIG.API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' });

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

  // Form fields
  vehicleNo      = '';
//   vehicleType    = '';
//   brandModel     = '';
//   vehicleClass   = '';
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
    if (!this.vehicleNo.trim())  return 'Vehicle No is required.';
    if (!this.vehicleType)       return 'Vehicle Type is required.';
    if (!this.brandModel.trim()) return 'Brand / Model is required.';
    if (!this.vehicleClass)      return 'Vehicle Class is required.';
    if (!this.ecNo.trim())       return 'EC No is required.';
    if (!this.validityDate)      return 'Validity Date is required.';
    if (this.validityDate <= this.todayDate) return 'Validity Date must be in the future.';
    if (!this.gateNo)            return 'Gate No is required.';
    for (const doc of this.docs()) {
      if (!doc.docType)        return 'Select Document Type for all document rows.';
      if (!doc.docNo.trim())   return `Document No is required for ${doc.docType}.`;
      if (!doc.validUpto)      return `Valid Upto date is required for ${doc.docType}.`;
    }
    return '';
  }

  private clearAlerts(): void { this.saveError.set(''); this.saveSuccess.set(''); }

  // ══════════════════════════════════════════
  // SAVE — Step 1: Vehicle → Step 2: Pass → Step 3: Docs
  // ══════════════════════════════════════════
  onSave(): void {
    this.clearAlerts();
    const err = this.validate();
    if (err) { this.saveError.set(err); return; }
    if (this.isSaving()) return;
    this.isSaving.set(true);

    const vehiclePayload = {
      vehicleNo   : this.vehicleNo.trim(),
      vehicleType : this.vehicleType,
      vehicleClass: this.vehicleClass,
      brandModel  : this.brandModel.trim(),
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
      if (dt === 'rc')        { fd.append('rcNo', doc.docNo); fd.append('rcStart', this.todayDate); fd.append('rcExpiry', doc.validUpto); if (doc.file) fd.append('rcFile', doc.file, doc.file.name); }
      else if (dt === 'puc')  { fd.append('pucNo', doc.docNo); fd.append('pucStart', this.todayDate); fd.append('pucExpiry', doc.validUpto); if (doc.file) fd.append('pucFile', doc.file, doc.file.name); }
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

  // ══════════════════════════════════════════
  // SUBMIT
  // ══════════════════════════════════════════
  onSubmit(): void {
    if (!this.saved()) { this.saveError.set('Please Save first.'); return; }
    this.clearAlerts();
    this.logHistory(
      this.savedPassRegistryId ?? this.savedVehicleId, 'APPROVED',
      this.ecNo.trim(), `Pass submitted — ID: ${this.passId()}, Vehicle: ${this.vehicleNo}`
    );
    this.saveSuccess.set(`🎉 Pass submitted! ID: ${this.passId()} is now active. Redirecting...`);
    setTimeout(() => this.router.navigate(['/passes/active']), 2200);
  }

  // ══════════════════════════════════════════
  // CLEAR
  // ══════════════════════════════════════════
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
      passNo: String(passNo ?? ''), empCode: (empCode || 'ADMIN').toUpperCase(),
      action: action.toUpperCase(), remark: remark || null,
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