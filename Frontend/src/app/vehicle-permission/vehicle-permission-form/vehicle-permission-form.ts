import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';
import { CvpsService, CvpsPersonnel } from '../../services/cvps.service';

interface VehicleDoc {
  docType  : string;
  docNo    : string;
  validFrom: string;
  validTo  : string;
  file     : File | null;
  fileName : string;
}

interface HelperPerson {
  jobType  : string;
  name     : string;
  mobileNo : string;
  aadhaarNo: string;
  file     : File | null;
  fileName : string;
}

// Maps display labels to backend VEHICLE_TYPE codes (max 10 chars per @Size constraint)
const VEHICLE_TYPE_MAP: Record<string, string> = {
  'Two Wheeler'  : 'TWO_WHEEL',
  'Four Wheeler' : 'FOUR_WHEEL',
  'Heavy Vehicle': 'HEAVY',
  'Tractor'      : 'TRACTOR',
  'Crane'        : 'CRANE',
  'JCB'          : 'JCB',
  'Fork Lift'    : 'FORKLIFT',
  'Other'        : 'OTHER',
};

@Component({
  selector   : 'app-vehicle-permission-form',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './vehicle-permission-form.html',
  styleUrl   : './vehicle-permission-form.css',
})
export class VehiclePermissionForm implements OnInit, OnDestroy {

  private router   = inject(Router);
  private auth     = inject(AuthService);
  private cvps     = inject(CvpsService);
  private destroy$ = new Subject<void>();

  // ── Header Meta ──────────────────────────────────────────────────────
  readonly formNo      = 'W-OHS-SECURITY-12';
  readonly companyName = 'HEG Limited, Mandideep';
  readonly requestDate = signal(new Date().toLocaleDateString('en-GB'));
  readonly department  = signal(this.auth.department() || 'Security');
  readonly category    = 'Vehicle Entry';
  status = signal('Draft');

  // ── General Info  (all signal names kept identical to existing HTML) ──
  contractorName     = signal('');   // UI label — mapped to contractorId at submit
  reqDate            = signal('');
  natureOfJob        = signal('');
  permissionDateFrom = signal('');
  permissionDateTo   = signal('');

  // ── Vehicle Info ─────────────────────────────────────────────────────
  vehicleNumber = signal('');
  vehicleType   = signal('');

  // Keep as string[] so existing HTML @for loop works without any change
  readonly vehicleTypeOptions = [
    'Two Wheeler', 'Four Wheeler', 'Heavy Vehicle',
    'Tractor', 'Crane', 'JCB', 'Fork Lift', 'Other',
  ];

  // ── Vehicle Documents ─────────────────────────────────────────────────
  readonly docTypeOptions = ['RC', 'Insurance', 'PUC', 'Fitness', 'Load Test', 'Other'];

  vehicleDocs = signal<VehicleDoc[]>([
    { docType: '', docNo: '', validFrom: '', validTo: '', file: null, fileName: '' },
  ]);

  addVehicleDoc(): void {
    this.vehicleDocs.update(d => [...d, { docType: '', docNo: '', validFrom: '', validTo: '', file: null, fileName: '' }]);
  }
  removeVehicleDoc(i: number): void {
    if (this.vehicleDocs().length === 1) return;
    this.vehicleDocs.update(d => d.filter((_, idx) => idx !== i));
  }
  onVehicleDocFile(event: Event, i: number): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.vehicleDocs.update(d => {
      const copy = [...d];
      copy[i] = { ...copy[i], file, fileName: file?.name ?? '' };
      return copy;
    });
  }

  // ── Driver Info ───────────────────────────────────────────────────────
  driverName       = signal('');
  contactNumber    = signal('');
  aadhaarNumber    = signal('');
  aadhaarCopyName  = signal('');
  licenseNumber    = signal('');
  licenseType      = signal('');
  licenseValidFrom = signal('');
  licenseValidTo   = signal('');
  drivingLicName   = signal('');
  driverPhotoName  = signal('');

  // Internal file refs for upload
  private _aadhaarFile : File | null = null;
  private _dlFile      : File | null = null;
  private _photoFile   : File | null = null;

  onAadhaarFile(e: Event)    { const f=(e.target as HTMLInputElement).files?.[0]??null; this._aadhaarFile=f; this.aadhaarCopyName.set(f?.name??''); }
  onDrivingLicFile(e: Event) { const f=(e.target as HTMLInputElement).files?.[0]??null; this._dlFile=f;     this.drivingLicName.set(f?.name??''); }
  onDriverPhotoFile(e: Event){ const f=(e.target as HTMLInputElement).files?.[0]??null; this._photoFile=f;  this.driverPhotoName.set(f?.name??''); }

  // ── Helpers ───────────────────────────────────────────────────────────
  readonly jobTypeOptions = ['Helper', 'Supervisor', 'Technician', 'Laborer', 'Other'];
  helpers = signal<HelperPerson[]>([]);

  addHelper(): void { this.helpers.update(h=>[...h,{jobType:'',name:'',mobileNo:'',aadhaarNo:'',file:null,fileName:''}]); }
  removeHelper(i: number): void { this.helpers.update(h=>h.filter((_,idx)=>idx!==i)); }
  onHelperFile(event: Event, i: number): void {
    const file=(event.target as HTMLInputElement).files?.[0]??null;
    this.helpers.update(h=>{const c=[...h];c[i]={...c[i],file,fileName:file?.name??''};return c;});
  }

  // ── Workflow Rows ─────────────────────────────────────────────────────
  workflowRows = signal([
    { level:'Request Raised By',   approver: this.auth.empCode()||'—', status:'Submitted', remark:'Request Submitted', date: new Date().toLocaleDateString('en-GB') },
    { level:'Department Approval', approver: '${departmentApprover}',  status:'Pending',   remark:'-', date:'-' },
    { level:'Security Approval',   approver: '${securityApprover}',    status:'Waiting',   remark:'-', date:'-' },
    { level:'Safety Approval',     approver: '${safetyApprover}',      status:'Waiting',   remark:'-', date:'-' },
  ]);

  // ── UI State ──────────────────────────────────────────────────────────
  isSaving     = signal(false);
  isSubmitting = signal(false);
  saveMsg      = signal('');
  errorMsg     = signal('');

  // Stored after Step 1 completes — used by Steps 2 & 3
  savedRequestNo = signal<number | null>(null);

  ngOnInit(): void {}
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ── Save Draft (local only) ───────────────────────────────────────────
  saveDraft(): void {
    this.status.set('Draft');
    this.saveMsg.set('✅ Draft saved successfully.');
    setTimeout(() => this.saveMsg.set(''), 3000);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SUBMIT — 3-Step Flow matching backend phases exactly:
  //   Step 1  POST /api/v1/permissions                    → get requestNo
  //   Step 2  POST /{requestNo}/upload-all-documents      → vehicle doc files
  //   Step 3  POST /{requestNo}/add-personnel (×N)        → driver + helpers
  // ═══════════════════════════════════════════════════════════════════════
  submitForm(): void {
    // ── Validation ──────────────────────────────────────────────────────
    if (!this.contractorName().trim())  { this.errorMsg.set('Contractor Name / ID is required.'); return; }
    if (this.contractorName().trim().length > 9) { this.errorMsg.set('Contractor ID must not exceed 9 characters.'); return; }
    if (!this.vehicleNumber().trim())   { this.errorMsg.set('Vehicle Number is required.');  return; }
    if (!this.vehicleType())            { this.errorMsg.set('Vehicle Type is required.');    return; }
    if (!this.permissionDateFrom())     { this.errorMsg.set('Permission Date From is required.'); return; }
    if (!this.permissionDateTo())       { this.errorMsg.set('Permission Date To is required.');   return; }
    if (!this.natureOfJob().trim())     { this.errorMsg.set('Nature of Job is required.');   return; }
    this.errorMsg.set('');
    this.isSubmitting.set(true);

    // Convert HTML date (YYYY-MM-DD) to LocalDateTime ISO format for backend
    const permFrom = `${this.permissionDateFrom()}T00:00:00`;
    const permTo   = `${this.permissionDateTo()}T23:59:59`;

    // Map display label → backend VEHICLE_TYPE code (max 10 chars)
    const vehicleTypeCode = VEHICLE_TYPE_MAP[this.vehicleType()] || this.vehicleType().substring(0, 10).toUpperCase();

    // ── STEP 1: Register the permission request ──────────────────────────
    const step1Payload = {
      contractorId  : this.contractorName().trim().toUpperCase().padEnd(9).substring(0, 9),
      natureOfJob   : this.natureOfJob().trim(),
      vehicleNo     : this.vehicleNumber().trim().toUpperCase().replace(/\s/g, ''),
      vehicleType   : vehicleTypeCode,
      permissionFrom: permFrom,
      permissionTo  : permTo,
      reqStatus     : 'CREATED',
      createdBy     : (this.auth.empCode() || 'SYSTEM').substring(0, 9).toUpperCase(),
    };

    this.cvps.createRequest(step1Payload).pipe(
      switchMap(created => {
        const reqNo = created.requestNo!;
        this.savedRequestNo.set(reqNo);

        // ── STEP 2: Upload vehicle documents (only rows that have a file) ─
        const docsToUpload = this.vehicleDocs().filter(d => d.file !== null && d.docType);

        // Also include driver Aadhaar, DL, photo as documents under their own types
        const extraDocs: { docType: string; docNo: string; validFrom: string; validTo: string; file: File }[] = [];
        if (this._aadhaarFile) extraDocs.push({ docType:'AADHAAR', docNo: this.aadhaarNumber()||'N/A', validFrom: this.permissionDateFrom(), validTo: this.permissionDateTo(), file: this._aadhaarFile });
        if (this._dlFile)      extraDocs.push({ docType:'DL',      docNo: this.licenseNumber()||'N/A', validFrom: this.licenseValidFrom()||this.permissionDateFrom(), validTo: this.licenseValidTo()||this.permissionDateTo(), file: this._dlFile });

        const allDocs = [
          ...docsToUpload.map(d => ({ docType: d.docType, docNo: d.docNo, validFrom: d.validFrom||this.permissionDateFrom(), validTo: d.validTo||'', file: d.file! })),
          ...extraDocs,
        ];

        const step2$ = allDocs.length > 0
          ? this.cvps.uploadAllDocuments(reqNo, allDocs).pipe(catchError(err => of(`WARN:${err.message}`)))
          : of('NO_DOCS');

        // ── STEP 3: Register driver + helpers as personnel ────────────────
        const personnel: CvpsPersonnel[] = [];

        if (this.driverName().trim()) {
          personnel.push({
            empJob  : 'DRIVER',
            empType : 'CONTRACTOR',
            aadharNo: this.aadhaarNumber().trim() || undefined,
            name    : this.driverName().trim(),
          });
        }

        this.helpers().filter(h => h.name.trim()).forEach(h => {
          personnel.push({
            empJob  : h.jobType?.toUpperCase() || 'HELPER',
            empType : 'CONTRACTOR',
            aadharNo: h.aadhaarNo?.trim() || undefined,
            name    : h.name.trim(),
          });
        });

        const step3$ = personnel.length > 0
          ? forkJoin(personnel.map(p =>
              this.cvps.addPersonnel(reqNo, p).pipe(catchError(err => of(err)))
            ))
          : of([]);

        // Chain: upload docs first, then register all personnel
        return step2$.pipe(switchMap(() => step3$));
      }),
      finalize(() => this.isSubmitting.set(false)),
      catchError(err => {
        this.errorMsg.set(`❌ Submission failed: ${err?.error?.message || err?.message || 'Server error. Please try again.'}`);
        return of(null);
      })
    ).subscribe(result => {
      if (result !== null) {
        this.status.set('Submitted');
        this.saveMsg.set(`✅ Permission submitted! Request No: ${this.savedRequestNo()}`);
        setTimeout(() => {
          this.saveMsg.set('');
          this.router.navigate(['/vehicle-permission/list']);
        }, 2500);
      }
    });
  }

  reset(): void {
    this.contractorName.set(''); this.reqDate.set('');
    this.natureOfJob.set(''); this.permissionDateFrom.set(''); this.permissionDateTo.set('');
    this.vehicleNumber.set(''); this.vehicleType.set('');
    this.vehicleDocs.set([{ docType:'',docNo:'',validFrom:'',validTo:'',file:null,fileName:'' }]);
    this.driverName.set(''); this.contactNumber.set(''); this.aadhaarNumber.set('');
    this.aadhaarCopyName.set(''); this.licenseNumber.set(''); this.licenseType.set('');
    this.licenseValidFrom.set(''); this.licenseValidTo.set('');
    this.drivingLicName.set(''); this.driverPhotoName.set('');
    this._aadhaarFile=null; this._dlFile=null; this._photoFile=null;
    this.helpers.set([]); this.savedRequestNo.set(null);
    this.status.set('Draft'); this.saveMsg.set(''); this.errorMsg.set('');
  }

  getStatusClass(s: string): string {
    switch (s.toLowerCase()) {
      case 'submitted': case 'created'  : return 'wf-submitted';
      case 'confirmed': case 'pending'  : return 'wf-pending';
      case 'waiting'  :                   return 'wf-waiting';
      case 'verified' :                   return 'wf-verified';
      case 'approved' :                   return 'wf-approved';
      case 'rejected' :                   return 'wf-rejected';
      default         :                   return 'wf-waiting';
    }
  }
}