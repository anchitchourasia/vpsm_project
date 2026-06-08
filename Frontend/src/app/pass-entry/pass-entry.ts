import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule }                          from '@angular/common';
import { FormsModule }                           from '@angular/forms';
import { HttpClient, HttpHeaders }               from '@angular/common/http';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG }                            from '../core/api.config';

const HTTP_TIMEOUT_MS = 12000;

// Backend array index positions: [empNo, name, salary, managerId, email, deptId, deptName]
const EMP_IDX = { empNo: 0, name: 1, salary: 2, email: 4, deptName: 6 };

// ── Interfaces ────────────────────────────────────────────────
interface PassEntryForm {
  vehicleNo   : string;
  vehicleType : string;
  vehicleClass: string;
  brandModel  : string;
  empType       : 'Company_Employee' | 'Contractor';
  ecNo          : string;
  empName       : string;
  dept          : string;
  contractorCode: string;
  issueDate      : string;
  validityDate   : string;
  gateNo         : string;
  parkingToBeUsed: string;
  remarks        : string;
}

interface PassEntryErrors {
  vehicleNo     : string;
  vehicleType   : string;
  vehicleClass  : string;
  ecNo          : string;
  contractorCode: string;
  empName       : string;
  dept          : string;
  issueDate     : string;
  validityDate  : string;
  gateNo        : string;
  remarks       : string;
}

const EMPTY_FORM = (): PassEntryForm => ({
  vehicleNo: '', vehicleType: '', vehicleClass: '', brandModel: '',
  empType: 'Company_Employee', ecNo: '', empName: '', dept: '', contractorCode: '',
  issueDate: '', validityDate: '', gateNo: '', parkingToBeUsed: '', remarks: '',
});

const EMPTY_ERRORS = (): PassEntryErrors => ({
  vehicleNo: '', vehicleType: '', vehicleClass: '',
  ecNo: '', contractorCode: '', empName: '', dept: '',
  issueDate: '', validityDate: '', gateNo: '', remarks: '',
});

// ── Component ─────────────────────────────────────────────────
@Component({
  selector   : 'app-pass-entry',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './pass-entry.html',
  styleUrl   : './pass-entry.css',
})
export class PassEntry implements OnInit, OnDestroy {

  // ── Single unified header — matches vehicles.ts exactly ──
  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
    'Accept'      : 'application/json',
  });

  private readonly destroy$ = new Subject<void>();
  readonly todayStr = new Date().toISOString().split('T')[0];

  // ── Form & error state ──
  form  : PassEntryForm   = EMPTY_FORM();
  errors: PassEntryErrors = EMPTY_ERRORS();

  // ── Employee lookup state ──
  fetchingEmployee = signal(false);
  empFetchError    = signal('');
  empFetchDone     = signal(false);

  // ── Submit state ──
  isSaving    = signal(false);
  saveError   = signal('');
  saveSuccess = signal('');

  constructor(private http: HttpClient) {}

  ngOnInit()    { /* standalone page — nothing to preload */ }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  INPUT HELPERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** UPPERCASE + strip spaces — vehicleNo, ecNo, gateNo, contractorCode */
  onUpperInput(e: Event, field: keyof PassEntryForm): void {
    const el  = e.target as HTMLInputElement;
    const val = el.value.toUpperCase().replace(/\s+/g, '');
    (this.form as any)[field] = val;
    el.value = val;
    this.clearError(field as keyof PassEntryErrors);
  }

  /** UPPERCASE preserve spaces — dept, parkingToBeUsed, vehicleType */
  onUpperInputSpaces(e: Event, field: keyof PassEntryForm): void {
    const el  = e.target as HTMLInputElement;
    const val = el.value.toUpperCase();
    (this.form as any)[field] = val;
    el.value = val;
    this.clearError(field as keyof PassEntryErrors);
  }

  clearError(field: keyof PassEntryErrors): void {
    this.errors[field] = '';
    this.saveError.set('');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  EMP TYPE CHANGE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onEmpTypeChange(): void {
    this.form.ecNo             = '';
    this.form.empName          = '';
    this.form.dept             = '';
    this.form.contractorCode   = '';
    this.errors.ecNo           = '';
    this.errors.contractorCode = '';
    this.errors.empName        = '';
    this.errors.dept           = '';
    this.empFetchError.set('');
    this.empFetchDone.set(false);
    this.saveError.set('');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  EMPLOYEE LOOKUP (on EC No blur)
  //  Fetch-all + filter client-side — same pattern as vehicles.ts
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onEcNoBlur(): void {
    const ecNo = this.form.ecNo.trim();
    if (!ecNo || this.form.empType !== 'Company_Employee') return;

    this.fetchingEmployee.set(true);
    this.empFetchError.set('');
    this.empFetchDone.set(false);
    this.form.empName = '';
    this.form.dept    = '';

    this.http
      .get<any[]>(`${API_CONFIG.BASE_URL}/api/reports/employee-department`, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          this.fetchingEmployee.set(false);
          const status = err?.status;
          this.empFetchError.set(
            status === 401 ? '⛔ Unauthorized — API key missing or invalid (401).' :
            status === 403 ? '⛔ Access forbidden (403).' :
            status === 404 ? '⚠️ Employee lookup endpoint not found (404).' :
            `⚠️ Could not fetch employee details (${status ?? 'network error'}).`
          );
          return of([]);
        })
      )
      .subscribe((rows: any[]) => {
        this.fetchingEmployee.set(false);
        if (!rows?.length) return;

        const match = rows.find(r => String(r[EMP_IDX.empNo]) === ecNo);
        if (match) {
          this.form.empName = String(match[EMP_IDX.name]    || '');
          this.form.dept    = String(match[EMP_IDX.deptName]|| '').toUpperCase();
          this.empFetchDone.set(true);
          this.empFetchError.set('');
          this.errors.empName = '';
          this.errors.dept    = '';
        } else {
          this.empFetchError.set(`⚠️ Employee No "${ecNo}" not found in records.`);
        }
      });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  VALIDATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private validate(): boolean {
    this.errors = EMPTY_ERRORS();
    const f = this.form;
    let ok = true;

    if (!f.vehicleNo.trim())   { this.errors.vehicleNo    = 'Vehicle Number is required.';  ok = false; }
    if (!f.vehicleType.trim()) { this.errors.vehicleType  = 'Vehicle Type is required.';    ok = false; }
    if (!f.vehicleClass)       { this.errors.vehicleClass = 'Vehicle Class is required.';   ok = false; }

    if (f.empType === 'Company_Employee') {
      if (!f.ecNo.trim()) { this.errors.ecNo = 'EC No is required.'; ok = false; }
    } else {
      if (!f.contractorCode.trim()) { this.errors.contractorCode = 'Contractor Code is required.'; ok = false; }
      if (!f.dept.trim())           { this.errors.dept           = 'Agency / Dept is required.';   ok = false; }
    }

    if (!f.issueDate)    { this.errors.issueDate    = 'Issue Date is required.';    ok = false; }
    if (!f.validityDate) { this.errors.validityDate = 'Validity Date is required.'; ok = false; }
    if (f.issueDate && f.validityDate && f.validityDate <= f.issueDate)
                         { this.errors.validityDate = 'Must be after Issue Date.';  ok = false; }
    if (!f.gateNo.trim()) { this.errors.gateNo      = 'Gate No is required.';       ok = false; }
    if (f.remarks && f.remarks.length > 200)
                         { this.errors.remarks = `Too long (${f.remarks.length}/200).`; ok = false; }

    return ok;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  HISTORY LOG (silent — same as vehicles.ts)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private logHistory(passId: any, action: string, empCode: string, remark: string): void {
    const payload = {
      passNo     : String(passId ?? ''),
      empCode    : (empCode || 'ADMIN').toUpperCase(),
      action     : action.toUpperCase(),
      remark     : remark || null,
      dateOfEntry: new Date().toISOString(),
    };

    this.http
      .post<any>(API_CONFIG.HISTORY_LOG, payload, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.warn('⚠️ [History Log] Failed silently:', err?.status, err?.error);
          return of(null);
        })
      )
      .subscribe(res => {
        if (res) console.log('📋 [History Log] Recorded:', payload.action, '→ pass', payload.passNo);
      });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  SUBMIT — 2-step: Register Vehicle → Issue Pass
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onSubmit(): void {
    if (this.isSaving()) return;
    if (!this.validate()) return;

    this.isSaving.set(true);
    this.saveError.set('');
    this.saveSuccess.set('');

    const f = this.form;

    // Normalize
    f.vehicleNo       = f.vehicleNo.toUpperCase().replace(/\s+/g, '');
    f.gateNo          = f.gateNo.toUpperCase().trim();
    f.ecNo            = f.ecNo.toUpperCase().trim();
    f.contractorCode  = f.contractorCode.toUpperCase().trim();
    f.dept            = f.dept.toUpperCase().trim();
    f.parkingToBeUsed = f.parkingToBeUsed.toUpperCase().trim();

    // ── STEP 1: Register vehicle ──
    const vehiclePayload = {
      vehicleNo    : f.vehicleNo,
      vehicleType  : f.vehicleType,
      vehicleClass : f.vehicleClass,
      brandModel   : f.brandModel || null,
      isActive     : 'Y',
      isBlacklisted: 'N',
    };

    console.log('📤 [Step 1] Vehicle Register:', JSON.stringify(vehiclePayload, null, 2));

    this.http
      .post<any>(API_CONFIG.VEHICLES_REGISTER, vehiclePayload, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          // 409 Conflict = vehicle already exists — fetch existing to get vehicleId
          if (err?.status === 409) {
            console.warn('ℹ️ Vehicle already exists (409) — fetching existing...');
            return this.http
              .get<any[]>(API_CONFIG.VEHICLES, { headers: this.HEADERS })
              .pipe(
                timeout(HTTP_TIMEOUT_MS),
                takeUntil(this.destroy$),
                catchError(() => of(null))
              );
          }
          const msg =
            (typeof err?.error === 'string' ? err.error : null) ||
            err?.error?.message ||
            `Vehicle registration failed (${err?.status})`;
          this.saveError.set(msg);
          this.isSaving.set(false);
          return of(null);
        })
      )
      .subscribe((vehicleRes: any) => {
        if (!vehicleRes) return;

        // Resolve vehicleId
        let vehicleId: number | null = null;
        if (Array.isArray(vehicleRes)) {
          // 409 fallback — find by vehicleNo in list
          const existing = vehicleRes.find((v: any) =>
            v.vehicleNo?.toUpperCase() === f.vehicleNo
          );
          vehicleId = existing?.vehicleId ?? null;
        } else {
          vehicleId = vehicleRes?.vehicleId ?? null;
        }

        if (!vehicleId) {
          this.saveError.set('Could not resolve Vehicle ID. Please try again.');
          this.isSaving.set(false);
          return;
        }

        // ── STEP 2: Issue pass ──
        this.issuePass(vehicleId);
      });
  }

  private issuePass(vehicleId: number): void {
    const f = this.form;

    const passPayload: any = {
      vehicle          : { vehicleId },
      typeOfVehicle    : f.vehicleType  || null,
      empType          : f.empType,
      issueDate        : f.issueDate,
      validityDate     : f.validityDate,
      gateNo           : f.gateNo,
      parkingToBeUsed  : f.parkingToBeUsed || null,
      status           : 'Active',
      isActive         : 'Y',
      remarks          : f.remarks || null,
      dept             : f.dept    || null,
      enterBy          : 'ADMIN',
      enterDate        : new Date().toISOString().split('T')[0],
      mobileNo         : null,
      // Company Employee
      employeeNo       : f.empType === 'Company_Employee' ? (f.ecNo     || null) : null,
      employeeCompanyNo: f.empType === 'Company_Employee' ? (f.empName  || null) : null,
      // Contractor
      contractorCode   : f.empType === 'Contractor' ? (f.contractorCode || null) : null,
    };

    console.log('📤 [Step 2] Issue Pass:', JSON.stringify(passPayload, null, 2));

    this.http
      .post<any>(API_CONFIG.PASSES_ISSUE, passPayload, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError((err: any) => {
          const msg =
            (typeof err?.error === 'string' ? err.error : null) ||
            err?.error?.message || JSON.stringify(err?.error) ||
            `Pass issue failed (${err?.status})`;
          this.saveError.set(msg);
          this.isSaving.set(false);
          return of(null);
        })
      )
      .subscribe((passRes: any) => {
        if (!passRes) return;

        const passId  = passRes?.passId ?? vehicleId;
        const empCode = f.empType === 'Company_Employee' ? f.ecNo : f.contractorCode;

        this.logHistory(
          passId,
          'CREATE',
          empCode,
          `Pass raised for Vehicle ${f.vehicleNo} — Gate: ${f.gateNo}, Valid till: ${f.validityDate}`
        );

        this.isSaving.set(false);
        this.saveSuccess.set(`✅ Pass issued successfully for ${f.vehicleNo}!`);

        // Auto-reset form after 2 seconds
        setTimeout(() => {
          this.form   = EMPTY_FORM();
          this.errors = EMPTY_ERRORS();
          this.empFetchDone.set(false);
          this.empFetchError.set('');
          this.saveSuccess.set('');
        }, 2000);
      });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  RESET
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onReset(): void {
    this.form    = EMPTY_FORM();
    this.errors  = EMPTY_ERRORS();
    this.saveError.set('');
    this.saveSuccess.set('');
    this.empFetchError.set('');
    this.empFetchDone.set(false);
    this.isSaving.set(false);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  TEMPLATE GETTERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  get isEmployee()  : boolean { return this.form.empType === 'Company_Employee'; }
  get isContractor(): boolean { return this.form.empType === 'Contractor'; }

  get isFormInvalid(): boolean {
    const f = this.form;
    if (!f.vehicleNo.trim())    return true;
    if (!f.vehicleType.trim())  return true;
    if (!f.vehicleClass)        return true;
    if (f.empType === 'Company_Employee'  && !f.ecNo.trim())           return true;
    if (f.empType === 'Contractor'        && !f.contractorCode.trim()) return true;
    if (!f.issueDate || !f.validityDate)  return true;
    if (f.issueDate && f.validityDate && f.validityDate <= f.issueDate) return true;
    if (!f.gateNo.trim())       return true;
    return false;
  }
}