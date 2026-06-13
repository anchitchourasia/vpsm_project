import { Injectable, signal, computed, NgZone, inject } from '@angular/core';

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
  passId         : string;
  empType        : string;
  vehicleNo      : string;
  vehicleType    : string;
  vehicleClass   : string;
  brandModel     : string;
  ecNo           : string;
  empName        : string;
  empDept        : string;
  contractorFirm : string;
  issueDate      : string;
  validityDate   : string;
  gateNo         : string;
  parkingArea    : string;
  remark         : string;
  docs           : {
    documentId ?: number;
    docType     : string;
    docNo       : string;
    validUpto   : string;
    fileName   ?: string;
  }[];
  status         : 'Saved' | 'Submitted';  // kept for backward compat
  createdAt      : string;

  // ── NEW WORKFLOW FIELDS (all optional — old records load with no break) ──
  workflowStatus  ?: WorkflowStatus;

  // Submission info
  submittedBy     ?: string;
  submittedAt     ?: string;

  // Confirmer action info
  confirmedBy     ?: string;
  confirmedAt     ?: string;
  confirmerRemark ?: string;

  // Approver action info
  approvedBy      ?: string;
  approvedAt      ?: string;
  approverRemark  ?: string;
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

  private zone    = inject(NgZone);
  private channel = new BroadcastChannel('pass_submitted_channel');

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
  // This is the key fix: pass-entry tab writes localStorage → pass-details tab reloads signal
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

  /**
   * CONFIRMER — Confirm a submitted request.
   * Transition: Submitted → Confirmed
   */
  confirmRequest(passId: string, confirmedBy: string, remark: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId && p.workflowStatus === 'Submitted'
          ? {
              ...p,
              workflowStatus : 'Confirmed' as WorkflowStatus,
              confirmedBy,
              confirmedAt    : new Date().toISOString(),
              confirmerRemark: remark
            }
          : p
      );
      saveToStorage(updated);
      return updated;
    });
  }

  /**
   * CONFIRMER — Reject a submitted request.
   * Transition: Submitted → Confirmation_Rejected
   */
  rejectByConfirmer(passId: string, confirmedBy: string, remark: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId && p.workflowStatus === 'Submitted'
          ? {
              ...p,
              workflowStatus : 'Confirmation_Rejected' as WorkflowStatus,
              confirmedBy,
              confirmedAt    : new Date().toISOString(),
              confirmerRemark: remark
            }
          : p
      );
      saveToStorage(updated);
      return updated;
    });
  }

  /**
   * APPROVER — Approve a confirmed request.
   * Transition: Confirmed → Approved
   * Record now appears in approvedPasses → Active Pass list.
   */
  approveRequest(passId: string, approvedBy: string, remark: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId && p.workflowStatus === 'Confirmed'
          ? {
              ...p,
              workflowStatus: 'Approved' as WorkflowStatus,
              approvedBy,
              approvedAt    : new Date().toISOString(),
              approverRemark: remark
            }
          : p
      );
      saveToStorage(updated);
      return updated;
    });
  }

  /**
   * APPROVER — Reject a confirmed request.
   * Transition: Confirmed → Approval_Rejected
   */
  rejectByApprover(passId: string, approvedBy: string, remark: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId && p.workflowStatus === 'Confirmed'
          ? {
              ...p,
              workflowStatus: 'Approval_Rejected' as WorkflowStatus,
              approvedBy,
              approvedAt    : new Date().toISOString(),
              approverRemark: remark
            }
          : p
      );
      saveToStorage(updated);
      return updated;
    });
  }

  /**
   * Return a confirmation-rejected record back to Submitted
   * (user re-submits after confirmer sends it back)
   */
  returnToSubmitted(passId: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId && p.workflowStatus === 'Confirmation_Rejected'
          ? {
              ...p,
              workflowStatus : 'Submitted' as WorkflowStatus,
              confirmedBy    : undefined,
              confirmedAt    : undefined,
              confirmerRemark: undefined
            }
          : p
      );
      saveToStorage(updated);
      return updated;
    });
  }

  // ── TEMPLATE HELPERS ──────────────────────────────────────────────────────

  /**
   * Human-readable label for workflow status badges.
   * Usage in template: {{ passState.getStatusLabel(p.workflowStatus) }}
   */
  getStatusLabel(ws: WorkflowStatus | undefined): string {
    switch (ws) {
      case 'Draft'                 : return 'Draft';
      case 'Submitted'             : return 'Pending Confirmation';
      case 'Confirmed'             : return 'Pending Approval';
      case 'Confirmation_Rejected' : return 'Returned by Confirmer';
      case 'Approved'              : return 'Approved';
      case 'Approval_Rejected'     : return 'Returned by Approver';
      default                      : return 'Unknown';
    }
  }

  /**
   * CSS badge class for workflow status.
   * Usage in template: [ngClass]="passState.getStatusClass(p.workflowStatus)"
   *
   * Add these to your global styles.css:
   *   .badge-draft      { background:#94a3b8; color:#fff; padding:2px 8px; border-radius:4px; font-size:12px; }
   *   .badge-submitted  { background:#3b82f6; color:#fff; padding:2px 8px; border-radius:4px; font-size:12px; }
   *   .badge-confirmed  { background:#f59e0b; color:#fff; padding:2px 8px; border-radius:4px; font-size:12px; }
   *   .badge-approved   { background:#22c55e; color:#fff; padding:2px 8px; border-radius:4px; font-size:12px; }
   *   .badge-rejected   { background:#ef4444; color:#fff; padding:2px 8px; border-radius:4px; font-size:12px; }
   */
  getStatusClass(ws: WorkflowStatus | undefined): string {
    switch (ws) {
      case 'Draft'                 : return 'badge-draft';
      case 'Submitted'             : return 'badge-submitted';
      case 'Confirmed'             : return 'badge-confirmed';
      case 'Confirmation_Rejected' : return 'badge-rejected';
      case 'Approved'              : return 'badge-approved';
      case 'Approval_Rejected'     : return 'badge-rejected';
      default                      : return 'badge-draft';
    }
  }
}