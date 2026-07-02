import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { API_CONFIG } from '../../core/api.config';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, switchMap, takeUntil, timeout, map } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';
import { CvpsService, CvpsPersonnel } from '../../services/cvps.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';  // ← added HttpClient

interface DocEntry {
  id: string;
  docType: string;
  docNo: string;
  validUpto: string;
  file: File | null;
  documentId?: number;
  existingFile?: string;
}

const ALLOWED_DOC_TYPES = ['RC', 'Insurance', 'PUC', 'Fitness', 'Load Test'];

function emptyDoc(): DocEntry {
  return { id: crypto.randomUUID(), docType: '', docNo: '', validUpto: '', file: null };
}

// ── MERGED: added role, aadhaarExistingFile, dlExistingFile from v6.8 ──
interface DriverPerson {
  id: string;
  role: string;                  // ✅ v6.8 — Driver / Conductor / Helper / Other
  name: string;
  mobileNo: string;
  aadhaarNo: string;
  licenseNo: string;
  licenseNumber?: string;        // kept from v6.4
  licenseType: string;
  validFrom: string;
  validTo: string;
  aadhaarFile: File | null;
  aadhaarFileName: string;
  aadhaarExistingFile: string;   // ✅ v6.8 — shows existing file in edit mode
  dlFile: File | null;
  dlFileName: string;
  dlExistingFile: string;        // ✅ v6.8 — shows existing file in edit mode
  photoFile: File | null;
  photoFileName: string;
}

function emptyDriver(): DriverPerson {
  return {
    id: crypto.randomUUID(),
    role: 'Driver',
    name: '', mobileNo: '', aadhaarNo: '',
    licenseNo: '', licenseNumber: '', licenseType: '', validFrom: '', validTo: '',
    aadhaarFile: null, aadhaarFileName: '', aadhaarExistingFile: '',
    dlFile: null, dlFileName: '', dlExistingFile: '',
    photoFile: null, photoFileName: '',
  };
}
/**
 * Safely converts backend date values to 'YYYY-MM-DD' string.
 * Handles both:
 *   - String:  "2025-06-15T00:00:00" or "2025-06-15"
 *   - Array:   [2025, 6, 15]  ← Jackson default LocalDate serialization
 */
function parseBackendDate(val: any): string {
  if (!val) return '';
  // Array format [YYYY, M, D] from Java LocalDate
  if (Array.isArray(val) && val.length >= 3) {
    const y = val[0];
    const m = String(val[1]).padStart(2, '0');
    const d = String(val[2]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // String format
  if (typeof val === 'string') return val.split('T')[0];
  return '';
}


// ── KEPT from v6.4 — helpers section ──
interface HelperPerson {
  jobType: string;
  name: string;
  mobileNo: string;
  aadhaarNo: string;
  file: File | null;
  fileName: string;
}

const VEHICLE_TYPE_MAP: Record<string, string> = {
  'Two Wheeler': 'TWO_WHEEL',
  'Four Wheeler': 'FOUR_WHEEL',
  'Heavy Vehicle': 'HEAVY',
  'Tractor': 'TRACTOR',
  'Crane': 'CRANE',
  'JCB': 'JCB',
  'Fork Lift': 'FORKLIFT',
  'Other': 'OTHER',
};

@Component({
  selector: 'app-vehicle-permission-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vehicle-permission-form.html',
  styleUrl: './vehicle-permission-form.css',
})
export class VehiclePermissionFormComponent implements OnInit, OnDestroy {

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private cvps = inject(CvpsService);
  private destroy$ = new Subject<void>();
  private http = inject(HttpClient);  // ✅ v6.8

  readonly formNo = 'W-OHS-SECURITY-12';
  readonly companyName = 'HEG Limited, Mandideep';
  readonly requestDate = signal(new Date().toLocaleDateString('en-GB'));
  readonly department = signal(this.auth.department() || 'Security');
  readonly category = 'Vehicle Entry';

  status = signal('Draft');

  contractorCode = signal('');
  contractorName = signal('');
  reqDate = signal(new Date().toISOString().split('T')[0]);
  natureOfJob = signal('');
  permissionDateFrom = signal('');
  permissionDateTo = signal('');

  vehicleNumber = signal('');
  vehicleType = signal('');

  readonly vehicleTypeOptions = [
    'Two Wheeler', 'Four Wheeler', 'Heavy Vehicle',
    'Tractor', 'Crane', 'JCB', 'Fork Lift', 'Other',
  ];

  // ✅ v6.8 — role dropdown for driver cards
  readonly driverRoleOptions = ['Driver', 'Conductor', 'Helper', 'Other'];

  // ── KEPT from v6.4 ──
  readonly jobTypeOptions = ['Helper', 'Supervisor', 'Technician', 'Laborer', 'Other'];

  readonly ALLOWED_DOC_TYPES = ALLOWED_DOC_TYPES;
  docs = signal<DocEntry[]>([]);

  addDoc(): void {
    if (this.docs().length >= ALLOWED_DOC_TYPES.length) return;
    this.docs.update(d => [...d, emptyDoc()]);
  }
  removeDoc(i: number): void { this.docs.update(d => d.filter((_, idx) => idx !== i)); }

  availableDocTypes(currentDoc: DocEntry): string[] {
    const used = this.docs().filter(d => d !== currentDoc).map(d => d.docType).filter(Boolean);
    const available = ALLOWED_DOC_TYPES.filter(t => !used.includes(t));
    if (currentDoc.docType && !available.includes(currentDoc.docType)) return [currentDoc.docType, ...available];
    return available;
  }

  onDocTypeChange(doc: DocEntry): void {
    const dupe = this.docs().filter(d => d !== doc && d.docType === doc.docType);
    if (dupe.length > 0) {
      setTimeout(() => { doc.docType = ''; }, 0);
      this.errorMsg.set(`${doc.docType} is already added. Each type can appear only once.`);
    } else { this.errorMsg.set(''); }
  }

  onDocNoInput(event: Event, doc: DocEntry): void {
    const input = event.target as HTMLInputElement;
    doc.docNo = input.value.toUpperCase();
    input.value = doc.docNo;
  }

  onDocFileSelected(event: Event, doc: DocEntry): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.docs.update(list => list.map(d => d.id === doc.id ? { ...d, file: input.files![0], existingFile: undefined } : d));
  }

  docAlreadyUploaded(doc: DocEntry): boolean { return !!doc.documentId && !!doc.existingFile && !doc.file; }
  shortName(name: string): string { return name.length > 18 ? name.substring(0, 15) + '...' : name; }

  // ── Drivers ──
  drivers = signal<DriverPerson[]>([emptyDriver()]);
  addDriver(): void { this.drivers.update(d => [...d, emptyDriver()]); }
  removeDriver(i: number): void { this.drivers.update(d => d.filter((_, idx) => idx !== i)); }

  // ✅ v6.8 — clear existingFile when user picks a new file
  onDriverAadhaarFile(e: Event, driver: DriverPerson) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) { driver.aadhaarFile = f; driver.aadhaarFileName = f.name; driver.aadhaarExistingFile = ''; }
  }
  onDriverDlFile(e: Event, driver: DriverPerson) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) { driver.dlFile = f; driver.dlFileName = f.name; driver.dlExistingFile = ''; }
  }
  onDriverPhotoFile(e: Event, driver: DriverPerson) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) { driver.photoFile = f; driver.photoFileName = f.name; }
  }

  // ── KEPT from v6.4 — Helpers ──
  helpers = signal<HelperPerson[]>([]);
  addHelper(): void { this.helpers.update(h => [...h, { jobType: '', name: '', mobileNo: '', aadhaarNo: '', file: null, fileName: '' }]); }
  removeHelper(i: number): void { this.helpers.update(h => h.filter((_, idx) => idx !== i)); }
  onHelperFile(event: Event, i: number): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.helpers.update(h => { const c = [...h]; c[i] = { ...c[i], file, fileName: file?.name ?? '' }; return c; });
  }

  isSaving = signal(false);
  isSubmitting = signal(false);
  saveMsg = signal('');
  errorMsg = signal('');
  savedRequestNo = signal<number | null>(null);

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const editId = params['edit'];
      if (editId) {
        const reqNo = Number(editId);
        this.savedRequestNo.set(reqNo);
        this.loadExistingRequestData(reqNo);
      }
    });
  }

  // ✅ v6.8 contractor lookup with x-api-key header + correct contractorCode field match
  onContractorCodeChange(typedCode: string): void {
    const cleanCode = typedCode.trim().toUpperCase();
    this.contractorCode.set(cleanCode);
    this.contractorName.set('');
    this.errorMsg.set('');
    if (!cleanCode) return;

    this.http.get<any[]>(
      `${API_CONFIG.BASE_URL}/api/reports/employee-department`,
      { headers: new HttpHeaders({ 'x-api-key': API_CONFIG.API_KEY, 'Content-Type': 'application/json' }) }
    ).pipe(
      timeout(12000),
      takeUntil(this.destroy$),
      catchError(() => {
        this.errorMsg.set('⚠️ Could not reach employee server. Check connectivity.');
        return of([]);
      })
    ).subscribe((rows: any[]) => {
      if (!rows || rows.length === 0) { this.errorMsg.set('Could not fetch employee list.'); return; }
      const match = rows.find(r =>
        r.contractorCode && String(r.contractorCode).toUpperCase() === cleanCode
      );
      if (match) {
        this.contractorName.set(String(match.name || '').toUpperCase());
        this.errorMsg.set('');
      } else {
        this.contractorName.set('');
        this.errorMsg.set(`⚠️ No contractor found for code: ${cleanCode}`);
      }
    });
  }

  private loadExistingRequestData(requestNo: number): void {
    this.cvps.getAllRequests().pipe(takeUntil(this.destroy$)).subscribe({
      next: (requests: any[]) => {
        const summary = requests.find(r => r.requestNo === requestNo);
        if (!summary) { this.errorMsg.set('❌ Request not found.'); return; }

        // ── If summary already has vehicleDocuments populated, use it directly ──
        if (summary.vehicleDocuments && summary.vehicleDocuments.length > 0) {
          this.populateFormFields(summary);
          return;
        }

        // ── Otherwise do 2nd fetch by vehicleNo ──
        const vehicleNo = summary.vehicleNo?.trim().toUpperCase();
        if (!vehicleNo) { this.populateFormFields(summary); return; }

        this.cvps.getByVehicleNo(vehicleNo).pipe(takeUntil(this.destroy$)).subscribe({
          next: (req: any) => {
            const hasDocuments = req?.vehicleDocuments && req.vehicleDocuments.length > 0;
            // Use whichever response has documents
            this.populateFormFields(hasDocuments ? req : summary);
          },
          error: () => this.populateFormFields(summary)
        });
      },
      error: () => this.errorMsg.set('❌ Error loading modification values.')
    });
  }

  // ── Extracted population logic — called from both success & fallback paths ──
  private populateFormFields(req: any): void {
    if (req.reqStatus === 'HOLD') {
      this.status.set('Need Modification');
    } else if (req.reqStatus === 'SAVED') {
      this.status.set('Saved');
    } else {
      this.status.set(req.reqStatus || 'Modification');
    }

    this.contractorCode.set(req.contractorId || '');
    this.contractorName.set(req.contractorName || req.contractorId || '');
    this.natureOfJob.set(req.natureOfJob || '');
    this.vehicleNumber.set(req.vehicleNo || '');

    const displayType = Object.keys(VEHICLE_TYPE_MAP).find(k => VEHICLE_TYPE_MAP[k] === req.vehicleType);
    this.vehicleType.set(displayType || 'Other');

    if (req.permissionFrom) this.permissionDateFrom.set(req.permissionFrom.split('T')[0]);
    if (req.permissionTo) this.permissionDateTo.set(req.permissionTo.split('T')[0]);

    // ── Vehicle Documents (RC, Insurance, PUC, Fitness, Load Test) ──
    if (req.vehicleDocuments && req.vehicleDocuments.length > 0) {
      const regularDocs = req.vehicleDocuments.filter(
        (d: any) => !['DL', 'PHOTO', 'DRIVER_PHOTO', 'PHOTOGRAPH', 'AADHAAR',
          'AADHAR', 'ADHAR', 'DRIVING_LICENSE', 'AADHAAR_CARD']
          .includes(d.documentType?.toUpperCase())
      );
      if (regularDocs.length > 0) {
        this.docs.set(regularDocs.map((d: any) => {
          const matchedType = ALLOWED_DOC_TYPES.find(
            opt => opt.toLowerCase() === (d.documentType || '').trim().toLowerCase()
          ) || d.documentType;
          return {
            id: crypto.randomUUID(),
            docType: matchedType,
            docNo: d.documentNo || '',
            validUpto: parseBackendDate(d.validTill) || parseBackendDate(d.validFrom) || '',
            file: null,
            documentId: d.id || null,
            existingFile: d.filename
              ? d.filename.substring(d.filename.lastIndexOf('/') + 1)
              : 'Attached Document',
          };
        }));
      }
    }

    // ── Drivers ──
    if (req.employeeDetails && req.employeeDetails.length > 0) {
      const driverList = req.employeeDetails.filter(
        (e: any) => e.empJob?.toUpperCase() === 'DRIVER'
      );
      const dlDocs = (req.vehicleDocuments || []).filter(
        (d: any) => ['DL', 'LICENSE', 'DRIVING_LICENSE'].includes(d.documentType?.toUpperCase())
      );
      const aadhaarDocs = (req.vehicleDocuments || []).filter(
        (d: any) => ['AADHAAR', 'AADHAR', 'ADHAR', 'AADHAAR_CARD'].includes(d.documentType?.toUpperCase())
      );

      if (driverList.length > 0) {
        this.drivers.set(driverList.map((driverData: any, idx: number) => {
          const dlDoc = dlDocs[idx] || {};
          const aadhaarDoc = aadhaarDocs[idx] || {};
          const resolvedLicenseVal = driverData.licenseNo || driverData.licenseNumber || dlDoc.documentNo || '';
          const cleanAadhaarName = aadhaarDoc.filename
            ? aadhaarDoc.filename.substring(aadhaarDoc.filename.lastIndexOf('/') + 1) : '';
          const cleanDlName = dlDoc.filename
            ? dlDoc.filename.substring(dlDoc.filename.lastIndexOf('/') + 1) : '';
          return {
            id: crypto.randomUUID(),
            name: driverData.name || '',
            mobileNo: driverData.mobileNo || driverData.contactNo || '',
            aadhaarNo: driverData.aadharNo || driverData.aadhaarNo || '',
            licenseNo: resolvedLicenseVal,
            licenseNumber: resolvedLicenseVal,
            licenseType: driverData.licType || driverData.licenseType || 'LMV',
            validFrom: parseBackendDate(dlDoc.validFrom) || parseBackendDate(driverData.validFrom) || '',
            validTo: parseBackendDate(dlDoc.validTill) || parseBackendDate(driverData.validTo) || '',
            aadhaarFile: null,
            aadhaarFileName: driverData.aadhaarFileName || cleanAadhaarName || '',
            dlFile: null,
            dlFileName: driverData.dlFileName || cleanDlName || '',
            photoFile: null,
            photoFileName: driverData.driverPhotoName || driverData.photoFileName || '',
          };
        }));
      } else {
        this.drivers.set([emptyDriver()]);
      }

      // ── Helpers ──
      const helpersList = req.employeeDetails.filter(
        (e: any) => e.empJob?.toUpperCase() !== 'DRIVER'
      );
      if (helpersList.length > 0) {
        this.helpers.set(helpersList.map((h: any) => ({
          jobType: h.empJob || 'Helper',
          name: h.name || '',
          mobileNo: h.mobileNo || '',
          aadhaarNo: h.aadharNo || '',
          file: null,
          fileName: '',
        })));
      }
    } else {
      this.drivers.set([emptyDriver()]);
    }
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  saveDraft(): void { this.processFormSubmission('SAVED'); }
  submitForm(): void { this.processFormSubmission('CREATED'); }

  private processFormSubmission(targetStatus: string): void {
    if (!this.contractorCode().trim()) { this.errorMsg.set('Contractor Code is required.'); return; }
    if (!this.contractorName().trim()) { this.errorMsg.set('Contractor Name is required.'); return; }
    if (!this.vehicleNumber().trim()) { this.errorMsg.set('Vehicle Number is required.'); return; }
    if (!this.vehicleType()) { this.errorMsg.set('Vehicle Type is required.'); return; }

    if (targetStatus === 'CREATED') {
      const todayStr = this.reqDate();
      if (!this.permissionDateFrom() || this.permissionDateFrom() < todayStr) { this.errorMsg.set('Permission Date From cannot be blank or a past date.'); return; }
      if (!this.permissionDateTo() || this.permissionDateTo() < this.permissionDateFrom()) { this.errorMsg.set('Permission Date To is invalid.'); return; }

      for (const doc of this.docs()) {
        if (!doc.docType || !doc.docNo.trim() || !doc.validUpto) { this.errorMsg.set(`Incomplete details for Document: ${doc.docType || 'Unknown'}`); return; }
        if (!doc.file && !this.docAlreadyUploaded(doc)) { this.errorMsg.set(`Please upload a file for ${doc.docType}.`); return; }
      }

      // ✅ v6.8 — role-aware driver validation
      for (let idx = 0; idx < this.drivers().length; idx++) {
        const d = this.drivers()[idx];
        const label = `Person ${idx + 1} (${d.role || 'Unknown'})`;
        if (!d.aadhaarNo?.trim()) { this.errorMsg.set(`${label}: Aadhaar Number is required.`); return; }
        if (!d.aadhaarFile && !d.aadhaarExistingFile) { this.errorMsg.set(`${label}: Aadhaar Copy is required.`); return; }
        if (d.role === 'Driver') {
          if (!d.licenseNo?.trim()) { this.errorMsg.set(`${label}: License Number is required for Driver.`); return; }
          if (!d.licenseType?.trim()) { this.errorMsg.set(`${label}: License Type is required for Driver.`); return; }
          if (!d.validFrom) { this.errorMsg.set(`${label}: License Valid From is required for Driver.`); return; }
          if (!d.validTo) { this.errorMsg.set(`${label}: License Valid To is required for Driver.`); return; }
          if (!d.dlFile && !d.dlExistingFile) { this.errorMsg.set(`${label}: Driving License Copy is required for Driver.`); return; }
        }
      }
    }

    if (!this.natureOfJob().trim()) { this.errorMsg.set('Nature of Job is required.'); return; }
    this.errorMsg.set('');
    this.isSubmitting.set(true);
    if (targetStatus === 'SAVED') this.isSaving.set(true);

    const vehicleTypeCode = VEHICLE_TYPE_MAP[this.vehicleType()] || this.vehicleType().substring(0, 10).toUpperCase();

    const step1Payload = {
      contractorId: this.contractorCode().trim().toUpperCase().substring(0, 9),
      natureOfJob: this.natureOfJob().trim(),
      vehicleNo: this.vehicleNumber().trim().toUpperCase().replace(/\s/g, ''),
      vehicleType: vehicleTypeCode,
      permissionFrom: this.permissionDateFrom() ? `${this.permissionDateFrom()}T00:00:00` : `${this.reqDate()}T00:00:00`,
      permissionTo: this.permissionDateTo() ? `${this.permissionDateTo()}T23:59:59` : `${this.reqDate()}T23:59:59`,
      reqStatus: targetStatus,
      createdBy: (this.auth.empCode() || 'SYSTEM').substring(0, 9).toUpperCase(),
    };

    const activeId = this.savedRequestNo();
    const isUpdate = !!activeId;

    const step1$ = isUpdate
      ? this.cvps.modifyRequest(activeId, step1Payload)
      : this.cvps.createRequest(step1Payload);

    step1$.pipe(
      switchMap(created => {
        const reqNo = created?.requestNo || activeId!;
        this.savedRequestNo.set(reqNo);

        const docsToUpload = this.docs().filter(d => d.file !== null && d.docType);

        // ✅ v6.8 — bundle driver Aadhaar/DL/Photo into uploadAllDocuments
        const extraDocs: { docType: string; docNo: string; validFrom: string; validTo: string; file: File }[] = [];
        this.drivers().forEach(d => {
          if (d.aadhaarFile) extraDocs.push({ docType: 'AADHAAR', docNo: d.aadhaarNo || 'N/A', validFrom: this.permissionDateFrom() || this.reqDate(), validTo: this.permissionDateTo(), file: d.aadhaarFile });
          if (d.dlFile) extraDocs.push({ docType: 'DL', docNo: d.licenseNo || 'N/A', validFrom: d.validFrom || this.permissionDateFrom() || this.reqDate(), validTo: d.validTo || this.permissionDateTo(), file: d.dlFile });
          if (d.photoFile) extraDocs.push({ docType: 'DRIVER_PHOTO', docNo: 'N/A', validFrom: this.permissionDateFrom() || this.reqDate(), validTo: this.permissionDateTo(), file: d.photoFile });
        });

        const allDocs = [
          ...docsToUpload.map(d => ({ docType: d.docType, docNo: d.docNo, validFrom: this.permissionDateFrom() || this.reqDate(), validTo: d.validUpto || '', file: d.file! })),
          ...extraDocs,
        ];
        const step2$ = allDocs.length > 0
          ? this.cvps.uploadAllDocuments(reqNo, allDocs).pipe(catchError(err => of(`WARN:${err.message}`)))
          : of('NO_DOCS');

        const personnel: any[] = [];
        this.drivers().filter(d => d.name.trim()).forEach(d => {
          personnel.push({
            empJob: (d.role || 'DRIVER').toUpperCase(),   // ✅ v6.8 — uses selected role
            empType: 'UNREGISTERED',
            aadharNo: d.aadhaarNo?.trim() || undefined,
            name: d.name.trim(),
            mobileNo: d.mobileNo?.trim() || undefined,
            driverPhotoName: d.photoFileName || undefined,
          });
        });

        // ── KEPT from v6.4 — helpers still go as separate personnel ──
        this.helpers().filter(h => h.name.trim()).forEach(h => {
          personnel.push({ empJob: h.jobType?.toUpperCase() || 'HELPER', empType: 'UNREGISTERED', aadharNo: h.aadhaarNo?.trim() || undefined, name: h.name.trim(), mobileNo: h.mobileNo || undefined });
        });

        const step3$ = personnel.length > 0
          ? forkJoin(personnel.map(p => this.cvps.addPersonnel(reqNo, p).pipe(catchError(err => of(err)))))
          : of([]);

        return step2$.pipe(switchMap(() => step3$));
      }),
      finalize(() => { this.isSubmitting.set(false); this.isSaving.set(false); }),
      catchError(err => {
        this.errorMsg.set(`❌ Process failed: ${err?.error?.message || err?.message || 'Server error. Please try again.'}`);
        return of(null);
      })
    ).subscribe(result => {
      if (result !== null) {
        if (targetStatus === 'SAVED') {
          this.status.set('Saved');
          this.saveMsg.set('✅ Form saved as draft!');
          setTimeout(() => { this.saveMsg.set(''); this.router.navigate(['/vehicle-permission/list']); }, 2000);
        } else {
          this.status.set('Submitted');
          this.saveMsg.set('✅ Permission processed & submitted to Confirmer!');
          setTimeout(() => { this.saveMsg.set(''); this.router.navigate(['/vehicle-permission/list']); }, 2500);
        }
      }
    });
  }

  reset(): void {
    this.contractorCode.set(''); this.contractorName.set('');
    this.reqDate.set(new Date().toISOString().split('T')[0]);
    this.natureOfJob.set(''); this.permissionDateFrom.set(''); this.permissionDateTo.set('');
    this.vehicleNumber.set(''); this.vehicleType.set('');
    this.docs.set([]);
    this.drivers.set([emptyDriver()]);
    this.helpers.set([]);         // ✅ kept from v6.4
    this.savedRequestNo.set(null);
    this.status.set('Draft'); this.saveMsg.set(''); this.errorMsg.set('');
  }

  getStatusClass(s: string): string {
    switch (s.toLowerCase()) {
      case 'submitted': case 'created': return 'wf-submitted';
      case 'confirmed': case 'pending': return 'wf-pending';
      case 'waiting': return 'wf-waiting';
      case 'verified': return 'wf-verified';
      case 'approved': return 'wf-approved';
      case 'rejected': return 'wf-rejected';
      case 'need modification': case 'hold': return 'wf-hold';
      case 'saved': return 'wf-draft';
      default: return 'wf-waiting';
    }
  }
}