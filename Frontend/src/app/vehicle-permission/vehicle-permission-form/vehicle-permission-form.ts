import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { API_CONFIG } from '../../core/api.config';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, switchMap, takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';
import { CvpsService, CvpsPersonnel } from '../../services/cvps.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';

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

// ── ✅ FIXED: Added aadhaarExistingFile & dlExistingFile for edit-mode display ──
interface DriverPerson {
  id: string;
  role: string;           // ✅ NEW — Driver / Conductor / Helper / Other
  name: string;
  mobileNo: string;
  aadhaarNo: string;
  licenseNo: string;
  licenseType: string;
  validFrom: string;
  validTo: string;
  aadhaarFile: File | null;
  aadhaarFileName: string;
  aadhaarExistingFile: string;
  dlFile: File | null;
  dlFileName: string;
  dlExistingFile: string;
  photoFile: File | null;
  photoFileName: string;
}

function emptyDriver(): DriverPerson {
  return {
    id: crypto.randomUUID(),
    role: 'Driver',                                           // ✅ NEW — default to Driver
    name: '', mobileNo: '', aadhaarNo: '',
    licenseNo: '', licenseType: '', validFrom: '', validTo: '',
    aadhaarFile: null, aadhaarFileName: '', aadhaarExistingFile: '',
    dlFile: null, dlFileName: '', dlExistingFile: '',
    photoFile: null, photoFileName: '',
  };
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
export class VehiclePermissionForm implements OnInit, OnDestroy {

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private cvps = inject(CvpsService);
  private destroy$ = new Subject<void>();
  private http = inject(HttpClient);

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
  // ✅ ADD this line alongside the other readonly option arrays
  readonly driverRoleOptions = ['Driver', 'Conductor', 'Helper', 'Other'];

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

  drivers = signal<DriverPerson[]>([emptyDriver()]);

  addDriver(): void { this.drivers.update(d => [...d, emptyDriver()]); }
  removeDriver(i: number): void { this.drivers.update(d => d.filter((_, idx) => idx !== i)); }

  // ✅ Clear existingFile indicator when user picks a new file
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

  onContractorCodeChange(typedCode: string): void {
    const cleanCode = typedCode.trim().toUpperCase();
    this.contractorCode.set(cleanCode);
    if (!cleanCode) { this.contractorName.set(''); this.errorMsg.set(''); return; }

    this.http.get<any[]>(
      `${API_CONFIG.BASE_URL}/api/reports/employee-department`,
      { headers: new HttpHeaders({ 'x-api-key': API_CONFIG.API_KEY, 'Content-Type': 'application/json' }) }
    ).pipe(
      timeout(12000),
      takeUntil(this.destroy$),
      catchError(() => of([]))
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

  // ── ✅ FIX: 2-step fetch to get full record with eager-loaded vehicleDocuments & employeeDetails ──
  // Step 1: getAllRequests() → find vehicleNo for the given requestNo
  // Step 2: getByVehicleNo(vehicleNo) → full record with all nested relations populated
  // Fixes JPA lazy-load issue where getAllRequests() returned empty vehicleDocuments/employeeDetails
  private loadExistingRequestData(requestNo: number): void {
    this.cvps.getAllRequests().pipe(takeUntil(this.destroy$)).subscribe({
      next: (requests: any[]) => {
        const summary = requests.find(r => r.requestNo === requestNo);
        if (!summary) {
          this.errorMsg.set('❌ Request not found.');
          return;
        }
        const vehicleNo = summary.vehicleNo?.trim().toUpperCase();
        if (!vehicleNo) {
          this.errorMsg.set('❌ Vehicle number missing on this record.');
          return;
        }

        // Step 2: Fetch FULL single record — forces eager load of all nested collections
        this.cvps.getByVehicleNo(vehicleNo).pipe(takeUntil(this.destroy$)).subscribe({
          next: (req: any) => {
            // Edge case: vehicleNo has a newer request — fall back to summary data
            if (!req || req.requestNo !== requestNo) {
              this.populateFormFields(summary);
            } else {
              this.populateFormFields(req);
            }
          },
          error: () => {
            // Single-record fetch failed — still populate basic fields from summary
            this.populateFormFields(summary);
          }
        });
      },
      error: () => this.errorMsg.set('❌ Error loading existing record data.')
    });
  }

  // ── ✅ FIX: Extracted from loadExistingRequestData — reused for success + fallback paths ──
  // Broadened DL/Aadhaar document type filters to catch all backend-stored variants
  private populateFormFields(req: any): void {
    // ── Status translation ──
    if (req.reqStatus === 'HOLD') {
      this.status.set('Need Modification');
    } else if (req.reqStatus === 'DRAFT') {
      this.status.set('Draft');
    } else {
      this.status.set(req.reqStatus || 'Draft');
    }

    this.contractorCode.set(req.contractorId || '');
    this.contractorName.set(req.contractorName || req.contractorId || '');
    this.natureOfJob.set(req.natureOfJob || '');
    this.vehicleNumber.set(req.vehicleNo || '');

    const displayType = Object.keys(VEHICLE_TYPE_MAP).find(k => VEHICLE_TYPE_MAP[k] === req.vehicleType);
    this.vehicleType.set(displayType || req.vehicleType || '');

    if (req.permissionFrom) this.permissionDateFrom.set(req.permissionFrom.split('T')[0]);
    if (req.permissionTo) this.permissionDateTo.set(req.permissionTo.split('T')[0]);

    // ── ✅ Broadened type filters to catch all backend-stored variants ──
    const DL_TYPES = ['DL', 'LICENSE', 'DRIVING_LICENSE', 'DRIVINGLICENSE'];
    const AADHAAR_TYPES = ['AADHAAR', 'AADHAR', 'ADHAR'];
    const PHOTO_TYPES = ['PHOTO', 'DRIVER_PHOTO', 'PHOTOGRAPH', 'DRIVERPHOTO'];
    const DRIVER_DOC_TYPES = [...DL_TYPES, ...AADHAAR_TYPES, ...PHOTO_TYPES];

    // ── Map regular vehicle documents (RC, Insurance, PUC, Fitness, Load Test) ──
    if (req.vehicleDocuments && req.vehicleDocuments.length > 0) {
      const regularDocs = req.vehicleDocuments.filter(
        (d: any) => !DRIVER_DOC_TYPES.includes((d.documentType || '').toUpperCase().replace(/\s+/g, '_'))
      );

      // ✅ FIX: Deduplicate by docType — keep only the LATEST entry per type
      // (highest id = most recently saved row wins)
      const latestByType = new Map<string, any>();
      for (const d of regularDocs) {
        const key = (d.documentType || '').trim().toLowerCase();
        const existing = latestByType.get(key);
        if (!existing || (d.id && existing.id && d.id > existing.id)) {
          latestByType.set(key, d);
        }
      }
      const dedupedDocs = Array.from(latestByType.values());

      if (dedupedDocs.length > 0) {
        this.docs.set(dedupedDocs.map((d: any) => {
          const matchedType = ALLOWED_DOC_TYPES.find(
            opt => opt.toLowerCase() === (d.documentType || '').trim().toLowerCase()
          ) || d.documentType;
          return {
            id: crypto.randomUUID(),
            docType: matchedType,
            docNo: d.documentNo || '',
            validUpto: d.validTill
              ? d.validTill.split('T')[0]
              : (d.validFrom ? d.validFrom.split('T')[0] : ''),
            file: null,
            documentId: d.id || null,
            existingFile: d.filename
              ? d.filename.substring(d.filename.lastIndexOf('/') + 1)
              : 'Attached Document',
          };
        }));
      }
      // No docs on a pure DRAFT → docs stays [] → user sees empty table with Add Document button
    }

    // ── Map drivers and helpers ──
    if (req.employeeDetails && req.employeeDetails.length > 0) {
      const PERSONNEL_ROLES = ['DRIVER', 'CONDUCTOR', 'HELPER', 'OTHER'];
      const driverList = req.employeeDetails.filter(
        (e: any) => PERSONNEL_ROLES.includes(e.empJob?.toUpperCase())
      );

      const allDocs = req.vehicleDocuments || [];

      // ── ✅ Broadened DL filter catches 'DRIVING_LICENSE' stored by backend positional fallback ──
      const dlDocs = allDocs.filter(
        (d: any) => DL_TYPES.includes((d.documentType || '').toUpperCase().replace(/\s+/g, '_'))
      );
      const aadhaarDocs = allDocs.filter(
        (d: any) => AADHAAR_TYPES.includes((d.documentType || '').toUpperCase().replace(/\s+/g, '_'))
      );

      if (driverList.length > 0) {
        this.drivers.set(driverList.map((driverData: any, idx: number) => {
          const dlDoc = dlDocs[idx] || {};
          const aadhaarDoc = aadhaarDocs[idx] || {};
          return {
            id: crypto.randomUUID(),
            role: driverData.empJob
              ? driverData.empJob.charAt(0).toUpperCase() + driverData.empJob.slice(1).toLowerCase()
              : 'Driver',                                              // ✅ NEW
            name: driverData.name || '',
            mobileNo: driverData.mobileNo || driverData.contactNo || '',
            aadhaarNo: driverData.aadharNo || '',
            licenseNo: dlDoc.documentNo || '',
            licenseType: driverData.licType || driverData.licenseType || 'LMV',
            validFrom: dlDoc.validFrom ? dlDoc.validFrom.split('T')[0] : '',
            validTo: dlDoc.validTill ? dlDoc.validTill.split('T')[0] : '',
            aadhaarFile: null,
            aadhaarFileName: '',
            // ✅ Populated from DB so filename shows without re-upload
            aadhaarExistingFile: aadhaarDoc.filename
              ? aadhaarDoc.filename.substring(aadhaarDoc.filename.lastIndexOf('/') + 1)
              : '',
            dlFile: null,
            dlFileName: '',
            // ✅ Populated from DB so filename shows without re-upload
            dlExistingFile: dlDoc.filename
              ? dlDoc.filename.substring(dlDoc.filename.lastIndexOf('/') + 1)
              : '',
            photoFile: null,
            photoFileName: driverData.driverPhotoName || '',
          };
        }));
      }


    }
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  saveDraft(): void { this.processFormSubmission('DRAFT'); }
  submitForm(): void { this.processFormSubmission('CREATED'); }

  private processFormSubmission(targetStatus: string): void {
    // ── Common validations (DRAFT + CREATED both) ──
    if (!this.contractorCode().trim()) { this.errorMsg.set('Contractor Code is required.'); return; }
    if (!this.contractorName().trim()) { this.errorMsg.set('Contractor Name is required.'); return; }
    if (!this.natureOfJob().trim()) { this.errorMsg.set('Nature of job description is mandatory.'); return; }
    if (!this.vehicleNumber().trim()) { this.errorMsg.set('Vehicle Number is required.'); return; }
    if (!this.vehicleType()) { this.errorMsg.set('Vehicle Type is required.'); return; }

    // ── CREATED-only validations ──
    if (targetStatus === 'CREATED') {
      const todayStr = this.reqDate();
      if (!this.permissionDateFrom() || this.permissionDateFrom() < todayStr) {
        this.errorMsg.set('Permission Date From cannot be blank or a past date.'); return;
      }
      if (!this.permissionDateTo() || this.permissionDateTo() < this.permissionDateFrom()) {
        this.errorMsg.set('Permission Date To is invalid.'); return;
      }
      for (const doc of this.docs()) {
        if (!doc.docType || !doc.docNo.trim() || !doc.validUpto) {
          this.errorMsg.set(`Incomplete details for Document: ${doc.docType || 'Unknown'}`); return;
        }
        if (!doc.file && !this.docAlreadyUploaded(doc)) {
          this.errorMsg.set(`Please upload a file for ${doc.docType}.`); return;
        }
      }
      // ✅ NEW — Driver section validation
      for (let idx = 0; idx < this.drivers().length; idx++) {
        const d = this.drivers()[idx];
        const label = `Person ${idx + 1} (${d.role || 'Unknown'})`;

        // Case 2: Aadhaar required for ALL roles
        if (!d.aadhaarNo?.trim()) {
          this.errorMsg.set(`${label}: Aadhaar Number is required.`); return;
        }
        if (!d.aadhaarFile && !d.aadhaarExistingFile) {
          this.errorMsg.set(`${label}: Aadhaar Copy (file) is required.`); return;
        }

        // Case 1: DL fields required only when role is Driver
        if (d.role === 'Driver') {
          if (!d.licenseNo?.trim()) {
            this.errorMsg.set(`${label}: License Number is required for Driver.`); return;
          }
          if (!d.licenseType?.trim()) {
            this.errorMsg.set(`${label}: License Type is required for Driver.`); return;
          }
          if (!d.validFrom) {
            this.errorMsg.set(`${label}: License Valid From is required for Driver.`); return;
          }
          if (!d.validTo) {
            this.errorMsg.set(`${label}: License Valid To is required for Driver.`); return;
          }
          if (!d.dlFile && !d.dlExistingFile) {
            this.errorMsg.set(`${label}: Driving License Copy is required for Driver.`); return;
          }
        }
      }
      // ✅ END NEW
    }

    this.errorMsg.set('');
    this.isSubmitting.set(true);
    if (targetStatus === 'DRAFT') this.isSaving.set(true);

    const vehicleTypeCode = VEHICLE_TYPE_MAP[this.vehicleType()] || this.vehicleType().substring(0, 10).toUpperCase();

    const step1Payload = {
      contractorId: this.contractorCode().trim().toUpperCase().substring(0, 9),
      natureOfJob: this.natureOfJob().trim(),
      vehicleNo: this.vehicleNumber().trim().toUpperCase().replace(/\s/g, ''),
      vehicleType: vehicleTypeCode,
      permissionFrom: this.permissionDateFrom()
        ? `${this.permissionDateFrom()}T00:00:00`
        : `${this.reqDate()}T00:00:00`,
      permissionTo: this.permissionDateTo()
        ? `${this.permissionDateTo()}T23:59:59`
        : `${this.reqDate()}T23:59:59`,
      // ✅ KEY FIX: Always send 'CREATED' to backend — backend has no DRAFT status.
      // PUT /modify only accepts CREATED or HOLD. DRAFT label is UI-only via this.status().
      reqStatus: 'CREATED',
      createdBy: (this.auth.empCode() || 'SYSTEM').substring(0, 9).toUpperCase(),
    };

    const activeId = this.savedRequestNo();

    // ✅ KEY FIX: Use PUT if record already exists, POST only on very first save.
    // Removes the isDraftStatus check that was causing duplicate INSERT (ORA-00001).
    const step1$ = activeId
      ? this.cvps.modifyRequest(activeId, step1Payload)
      : this.cvps.createRequest(step1Payload);

    step1$.pipe(
      switchMap(created => {
        const reqNo = created?.requestNo || activeId!;
        this.savedRequestNo.set(reqNo);

        const docsToUpload = this.docs().filter(d => d.file !== null && d.docType);
        const extraDocs: { docType: string; docNo: string; validFrom: string; validTo: string; file: File }[] = [];

        this.drivers().forEach(d => {
          if (d.aadhaarFile) extraDocs.push({
            docType: 'AADHAAR', docNo: d.aadhaarNo || 'N/A',
            validFrom: this.permissionDateFrom() || this.reqDate(),
            validTo: this.permissionDateTo(), file: d.aadhaarFile,
          });
          if (d.dlFile) extraDocs.push({
            docType: 'DL', docNo: d.licenseNo || 'N/A',
            validFrom: d.validFrom || this.permissionDateFrom() || this.reqDate(),
            validTo: d.validTo || this.permissionDateTo(), file: d.dlFile,
          });
          if (d.photoFile) extraDocs.push({
            docType: 'DRIVER_PHOTO', docNo: 'N/A',
            validFrom: this.permissionDateFrom() || this.reqDate(),
            validTo: this.permissionDateTo(), file: d.photoFile,
          });
        });

        const allDocs = [
          ...docsToUpload.map(d => ({
            docType: d.docType, docNo: d.docNo,
            validFrom: this.permissionDateFrom() || this.reqDate(),
            validTo: d.validUpto || '', file: d.file!,
          })),
          ...extraDocs,
        ];

        const step2$ = allDocs.length > 0
          ? this.cvps.uploadAllDocuments(reqNo, allDocs).pipe(catchError(err => of(`WARN:${err.message}`)))
          : of('NO_DOCS');

        const personnel: any[] = [];
        this.drivers().filter(d => d.name.trim()).forEach(d => {
          personnel.push({
            empJob: (d.role || 'DRIVER').toUpperCase(),  // ✅ use selected role
            empType: 'UNREGISTERED',
            aadharNo: d.aadhaarNo?.trim() || undefined,
            name: d.name.trim(),
            mobileNo: d.mobileNo?.trim() || undefined,
            driverPhotoName: d.photoFileName || undefined,
          });
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
        if (targetStatus === 'DRAFT') {
          this.status.set('Draft');
          this.saveMsg.set('✅ Draft saved successfully!');
          setTimeout(() => this.saveMsg.set(''), 3000);
        } else {
          this.status.set('Submitted');
          this.saveMsg.set('✅ Permission processed & submitted to Confirmer!');
          setTimeout(() => { this.saveMsg.set(''); this.router.navigate(['/vehicle-permission/list']); }, 2500);
        }
      }
    });
  }

  reset(): void {
    this.contractorCode.set('');
    this.contractorName.set('');
    this.reqDate.set(new Date().toISOString().split('T')[0]);
    this.natureOfJob.set('');
    this.permissionDateFrom.set('');
    this.permissionDateTo.set('');
    this.vehicleNumber.set('');
    this.vehicleType.set('');
    this.docs.set([]);
    this.drivers.set([emptyDriver()]);
    this.savedRequestNo.set(null);
    this.status.set('Draft');
    this.saveMsg.set('');
    this.errorMsg.set('');
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
      case 'draft': return 'wf-draft';
      default: return 'wf-waiting';
    }
  }
}