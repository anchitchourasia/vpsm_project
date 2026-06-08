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

@Injectable({ providedIn: 'root' })
export class PassStateService {

  private zone    = inject(NgZone);
  private channel = new BroadcastChannel('pass_submitted_channel');

  private _passes = signal<PassRecord[]>([]);

  /** All passes — read-only */
  readonly passes = this._passes.asReadonly();

  /** Only submitted passes — used by Pass Details view */
  readonly submittedPasses = computed(() =>
    this._passes().filter(p => p.status === 'Submitted')
  );

  constructor() {
    // 🔑 Listen for records broadcast from the pass-entry tab
    this.channel.onmessage = (event) => {
      if (event.data?.type === 'PASS_SUBMITTED') {
        this.zone.run(() => this.upsert(event.data.record as PassRecord));
      }
    };
  }

  /** Add or update a pass record in memory */
  upsert(record: PassRecord): void {
    this._passes.update(list => {
      const idx = list.findIndex(p => p.passId === record.passId);
      if (idx >= 0) {
        const updated = [...list];
        updated[idx] = record;
        return updated;
      }
      return [record, ...list]; // newest first
    });
  }

  /** Broadcast a submitted record to ALL open tabs of this app */
  broadcast(record: PassRecord): void {
    this.channel.postMessage({ type: 'PASS_SUBMITTED', record });
  }

  /** Mark a saved pass as submitted */
  markSubmitted(passId: string): void {
    this._passes.update(list =>
      list.map(p => p.passId === passId ? { ...p, status: 'Submitted' } : p)
    );
  }

  /** Get a single pass by ID */
  getById(passId: string): PassRecord | undefined {
    return this._passes().find(p => p.passId === passId);
  }
}