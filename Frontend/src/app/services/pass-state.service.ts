import { Injectable, signal, computed } from '@angular/core';

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

  private _passes = signal<PassRecord[]>([]);

  /** All submitted passes — read by PassDetails */
  readonly passes = this._passes.asReadonly();

  /** Only submitted ones (for Pass Details view) */
  readonly submittedPasses = computed(() =>
    this._passes().filter(p => p.status === 'Submitted')
  );

  /** Add or update a pass record */
  upsert(record: PassRecord): void {
    this._passes.update(list => {
      const idx = list.findIndex(p => p.passId === record.passId);
      if (idx >= 0) {
        const updated = [...list];
        updated[idx] = record;
        return updated;
      }
      return [record, ...list];
    });
  }

  /** Mark a saved pass as submitted */
  markSubmitted(passId: string): void {
    this._passes.update(list =>
      list.map(p => p.passId === passId ? { ...p, status: 'Submitted' } : p)
    );
  }

  /** Get a single pass by ID (for edit) */
  getById(passId: string): PassRecord | undefined {
    return this._passes().find(p => p.passId === passId);
  }
}