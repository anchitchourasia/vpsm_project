import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, of, timeout } from 'rxjs';
import { API_CONFIG } from '../core/api.config';
import { Injectable, signal, computed, NgZone, inject } from '@angular/core';


export type PassEntryMode = 'view' | 'edit';
// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW STATUS — 3-stage pipeline: Entry → Confirmer → Approver → Active
// ─────────────────────────────────────────────────────────────────────────────
export type WorkflowStatus =
  | 'Draft'                  // Saved locally, not yet submitted
  | 'Submitted'              // User submitted — waiting for Confirmer
  | 'Confirmed'              // Confirmer approved — waiting for Approver
  | 'Confirmation_Rejected'  // Confirmer rejected — returned to user
  | 'Approved'               // Approver approved — becomes Active Pass
  | 'Approval_Rejected';     // Approver rejected — returned to Confirmer/user

// ─────────────────────────────────────────────────────────────────────────────
// PASS RECORD — extended with workflow fields (backward compatible)
// Old PassRecord fields kept 100% intact. New fields are optional (?) so
// existing localStorage records load without any crash.
// ─────────────────────────────────────────────────────────────────────────────
export interface PassRecord {
  // ── EXISTING FIELDS (unchanged) ──────────────────────────────────────────
  passId: string;
  empType: string;
  vehicleNo: string;
  vehicleType: string;
  vehicleClass: string;
  brandModel: string;
  ecNo: string;
  empName: string;
  empDept: string;
  contractorFirm: string;
  issueDate: string;
  validityDate: string;
  gateNo: string;
  parkingArea: string;
  remark: string;
  docs: {
    documentId?: number;
    docType: string;
    docNo: string;
    validUpto: string;
    fileName?: string;
  }[];
  status: 'Saved' | 'Submitted';  // kept for backward compat
  createdAt: string;
  
  // ── NEW WORKFLOW FIELDS (all optional — old records load with no break) ──
  workflowStatus?: WorkflowStatus;

  // Submission info
  submittedBy?: string;
  submittedAt?: string;

  // Confirmer action info
  confirmedBy?: string;
  confirmedAt?: string;
  confirmerRemark?: string;

  // Approver action info
  approvedBy?: string;
  approvedAt?: string;
  approverRemark?: string;
  empTypeDetail?: string;
  empAadhar?: string;
  empDeptCode?: string;
  empContractorCode?: string;
  empContractorName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'vpsm_pass_records';

function loadFromStorage(): PassRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const records = JSON.parse(raw) as PassRecord[];
    // MIGRATION: old records have no workflowStatus — derive it from status
    return records.map(r => ({
      ...r,
      workflowStatus: r.workflowStatus ?? (
        r.status === 'Saved' ? 'Draft' : 'Submitted'
      ) as WorkflowStatus
    }));
  } catch {
    return [];
  }
}

function saveToStorage(records: PassRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    console.warn('[PassStateService] localStorage write failed.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class PassStateService {

  private zone = inject(NgZone);
  private channel = new BroadcastChannel('pass_submitted_channel');
  private http = inject(HttpClient);

  // Initialize from localStorage — survives refresh & tab close
  private _passes = signal<PassRecord[]>(loadFromStorage());

  // ── EXISTING READ-ONLY SELECTORS (unchanged — no risk to Pass Details) ────

  /** All passes */
  readonly passes = this._passes.asReadonly();

  /** Only submitted passes — used by existing Pass Details view */
  readonly submittedPasses = computed(() =>
    this._passes().filter(p => p.status === 'Submitted')
  );

  /** All saved drafts — draft recovery in Pass Details */
  readonly savedDrafts = computed(() =>
    this._passes().filter(p => p.status === 'Saved')
  );

  // ── NEW WORKFLOW-FILTERED COMPUTED LISTS ───────────────────────────────────

  /** Requests waiting for Confirmer action — used by Confirmer interface */
  readonly pendingConfirmation = computed(() =>
    this._passes().filter(p => p.workflowStatus === 'Submitted')
  );

  /** Confirmed requests waiting for Approver — used by Approval interface */
  readonly pendingApproval = computed(() =>
    this._passes().filter(p => p.workflowStatus === 'Confirmed')
  );

  /** Fully approved passes — these become the real Active Passes */
  readonly approvedPasses = computed(() =>
    this._passes().filter(p => p.workflowStatus === 'Approved')
  );

  /** Rejected by Confirmer */
  readonly confirmationRejected = computed(() =>
    this._passes().filter(p => p.workflowStatus === 'Confirmation_Rejected')
  );

  /** Rejected by Approver */
  readonly approvalRejected = computed(() =>
    this._passes().filter(p => p.workflowStatus === 'Approval_Rejected')
  );

  constructor() {
    // Cross-tab sync — BroadcastChannel for submitted passes
    this.channel.onmessage = (event) => {
      if (event.data?.type === 'PASS_SUBMITTED') {
        this.zone.run(() => this.upsert(event.data.record as PassRecord));
      }
      // ── NEW: draft saved or deleted in pass-entry tab → reload signal ──
      if (event.data?.type === 'DRAFT_UPSERT' || event.data?.type === 'DRAFT_DELETED') {
        this.zone.run(() => this._passes.set(loadFromStorage()));
      }
    };

    // ── NEW: localStorage storage event — fires in OTHER tabs when localStorage changes ──
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'vpsm_pass_records') {
          this.zone.run(() => this._passes.set(loadFromStorage()));
        }
      });
    }
  }

  // ── EXISTING METHODS (unchanged) ──────────────────────────────────────────

  /** Add or update a pass record — persists to localStorage immediately */
  upsert(record: PassRecord): void {
    this._passes.update(list => {
      const idx = list.findIndex(p => p.passId === record.passId);
      let updated: PassRecord[];
      if (idx >= 0) {
        updated = [...list];
        updated[idx] = record;
      } else {
        updated = [record, ...list]; // newest first
      }
      saveToStorage(updated);
      return updated;
    });
  }

  /** Broadcast a submitted record to ALL open tabs */
  broadcast(record: PassRecord): void {
    this.channel.postMessage({ type: 'PASS_SUBMITTED', record });
  }

  /** Notify other tabs that a draft was saved/deleted so they reload */
  broadcastDraftChange(): void {
    this.channel.postMessage({ type: 'DRAFT_UPSERT' });
  }

  // ── EMPLOYEE NAME LOOKUP ──────────────────────────────────────────────────

  private _empNameMap = signal<Record<string, string>>({});

  /** Call once on app start. Fetches EMPLOYEE_REPORT and builds EC→Name lookup. */
  loadEmployeeNames(): void {
    if (Object.keys(this._empNameMap()).length > 0) return;
    const headers = new HttpHeaders({
      'x-api-key': API_CONFIG.API_KEY,
      'Content-Type': 'application/json',
    });
    this.http.get<any[]>(API_CONFIG.EMPLOYEE_REPORT, { headers })
      .pipe(timeout(12_000), catchError(() => of([])))
      .subscribe(employees => {
        const map: Record<string, string> = {};
        (employees || []).forEach(emp => {
          const code = (emp.employeeCode ?? emp.empCode ?? emp.ec_no ?? emp.employeeNo ?? '')
            .toString().trim().toLowerCase();
          const name = (emp.name ?? emp.employeeName ?? emp.emp_name ?? '')
            .toString().trim().toUpperCase();
          if (code && name) map[code] = name;
        });
        this._empNameMap.set(map);
      });
  }

  /** Resolve employee name from EC code. Returns '' if not found. */
  resolveEmpName(ecCode: string): string {
    if (!ecCode) return '';
    return this._empNameMap()[(ecCode).toString().trim().toLowerCase()] ?? '';
  }

  /** Mark a saved pass as submitted — also syncs workflowStatus */
  markSubmitted(passId: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId
          ? { ...p, status: 'Submitted' as const, workflowStatus: 'Submitted' as WorkflowStatus }
          : p
      );
      saveToStorage(updated);
      return updated;
    });
  }

  /** Get a single pass by ID */
  getById(passId: string): PassRecord | undefined {
    return this._passes().find(p => p.passId === passId);
  }

  /** Delete a draft pass (Saved status only) */
  deleteDraft(passId: string): void {
    this._passes.update(list => {
      const updated = list.filter(
        p => !(p.passId === passId && p.status === 'Saved')
      );
      saveToStorage(updated);
      return updated;
    });
  }

  /** Clear all records — admin/reset only */
  clearAll(): void {
    this._passes.set([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  // ── NEW WORKFLOW TRANSITION METHODS ───────────────────────────────────────

  confirmRequest(passId: string, confirmedBy: string, remark: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId && p.workflowStatus === 'Submitted'
          ? { ...p, workflowStatus: 'Confirmed' as WorkflowStatus, confirmedBy, confirmedAt: new Date().toISOString(), confirmerRemark: remark }
          : p
      );
      saveToStorage(updated);
      return updated;
    });
  }

  rejectByConfirmer(passId: string, confirmedBy: string, remark: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId && p.workflowStatus === 'Submitted'
          ? { ...p, workflowStatus: 'Confirmation_Rejected' as WorkflowStatus, confirmedBy, confirmedAt: new Date().toISOString(), confirmerRemark: remark }
          : p
      );
      saveToStorage(updated);
      return updated;
    });
  }

  approveRequest(passId: string, approvedBy: string, remark: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId && p.workflowStatus === 'Confirmed'
          ? { ...p, workflowStatus: 'Approved' as WorkflowStatus, approvedBy, approvedAt: new Date().toISOString(), approverRemark: remark }
          : p
      );
      saveToStorage(updated);
      return updated;
    });
  }

  rejectByApprover(passId: string, approvedBy: string, remark: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId && p.workflowStatus === 'Confirmed'
          ? { ...p, workflowStatus: 'Approval_Rejected' as WorkflowStatus, approvedBy, approvedAt: new Date().toISOString(), approverRemark: remark }
          : p
      );
      saveToStorage(updated);
      return updated;
    });
  }

  returnToSubmitted(passId: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId && p.workflowStatus === 'Confirmation_Rejected'
          ? { ...p, workflowStatus: 'Submitted' as WorkflowStatus, confirmedBy: undefined, confirmedAt: undefined, confirmerRemark: undefined }
          : p
      );
      saveToStorage(updated);
      return updated;
    });
  }

  // ── NAVIGATION STATE ──────────────────────────────────────────────────────
private _resumeDraftData = signal<PassRecord | null>(null);
private _resumeModData = signal<any | null>(null);
private _resumeEntryMode = signal<PassEntryMode | null>(null);

readonly resumeDraftData = this._resumeDraftData.asReadonly();
readonly resumeModData = this._resumeModData.asReadonly();
readonly resumeEntryMode = this._resumeEntryMode.asReadonly();

setResumeDraft(data: PassRecord, mode: PassEntryMode = 'edit'): void {
  this._resumeDraftData.set(data);
  this._resumeEntryMode.set(mode);
}

clearResumeDraft(): void {
  this._resumeDraftData.set(null);
  this._resumeEntryMode.set(null);
}

setResumeMod(data: any): void {
  this._resumeModData.set(data);
  this._resumeEntryMode.set('edit');
}

clearResumeMod(): void { this._resumeModData.set(null); }

  // ── TEMPLATE HELPERS ──────────────────────────────────────────────────────

  getStatusLabel(ws: WorkflowStatus | undefined): string {
    switch (ws) {
      case 'Draft': return 'Draft';
      case 'Submitted': return 'Pending Confirmation';
      case 'Confirmed': return 'Pending Approval';
      case 'Confirmation_Rejected': return 'Returned by Confirmer';
      case 'Approved': return 'Approved';
      case 'Approval_Rejected': return 'Returned by Approver';
      default: return 'Unknown';
    }
  }

  getStatusClass(ws: WorkflowStatus | undefined): string {
    switch (ws) {
      case 'Draft': return 'badge-draft';
      case 'Submitted': return 'badge-submitted';
      case 'Confirmed': return 'badge-confirmed';
      case 'Confirmation_Rejected': return 'badge-rejected';
      case 'Approved': return 'badge-approved';
      case 'Approval_Rejected': return 'badge-rejected';
      default: return 'badge-draft';
    }
  }
}