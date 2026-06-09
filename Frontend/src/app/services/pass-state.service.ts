// Frontend/src/app/services/pass-state.service.ts
import { Injectable, signal, computed, NgZone, inject } from '@angular/core';

export interface PassRecord {
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
  docs           : { docType: string; docNo: string; validUpto: string }[];
  status         : 'Saved' | 'Submitted';
  createdAt      : string;
}

const STORAGE_KEY = 'vpsm_pass_records';

/** Read persisted records from localStorage safely */
function loadFromStorage(): PassRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PassRecord[];
  } catch {
    return [];
  }
}

/** Persist records to localStorage */
function saveToStorage(records: PassRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    console.warn('[PassStateService] localStorage write failed.');
  }
}

@Injectable({ providedIn: 'root' })
export class PassStateService {

  private zone    = inject(NgZone);
  private channel = new BroadcastChannel('pass_submitted_channel');

  // ✅ Initialize signal from localStorage — survives refresh & session close
  private _passes = signal<PassRecord[]>(loadFromStorage());

  /** All passes — read-only */
  readonly passes = this._passes.asReadonly();

  /** Only submitted passes — used by Pass Details view */
  readonly submittedPasses = computed(() =>
    this._passes().filter(p => p.status === 'Submitted')
  );

  /** All saved (not yet submitted) passes — draft recovery */
  readonly savedDrafts = computed(() =>
    this._passes().filter(p => p.status === 'Saved')
  );

  constructor() {
    // Listen for records broadcast from pass-entry tab (cross-tab sync)
    this.channel.onmessage = (event) => {
      if (event.data?.type === 'PASS_SUBMITTED') {
        this.zone.run(() => this.upsert(event.data.record as PassRecord));
      }
    };
  }

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
      saveToStorage(updated);  // ✅ Persist every upsert
      return updated;
    });
  }

  /** Broadcast a submitted record to ALL open tabs */
  broadcast(record: PassRecord): void {
    this.channel.postMessage({ type: 'PASS_SUBMITTED', record });
  }

  /** Mark a saved pass as submitted */
  markSubmitted(passId: string): void {
    this._passes.update(list => {
      const updated = list.map(p =>
        p.passId === passId ? { ...p, status: 'Submitted' as const } : p
      );
      saveToStorage(updated);  // ✅ Persist status change
      return updated;
    });
  }

  /** Get a single pass by ID */
  getById(passId: string): PassRecord | undefined {
    return this._passes().find(p => p.passId === passId);
  }

  /** Delete a draft pass (Saved status only) from storage */
  deleteDraft(passId: string): void {
    this._passes.update(list => {
      const updated = list.filter(p => !(p.passId === passId && p.status === 'Saved'));
      saveToStorage(updated);
      return updated;
    });
  }

  /** Clear all records — for admin/reset use only */
  clearAll(): void {
    this._passes.set([]);
    localStorage.removeItem(STORAGE_KEY);
  }
}