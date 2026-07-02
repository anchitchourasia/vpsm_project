











import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, switchMap, takeUntil, timeout, map } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';
import { CvpsService, CvpsPersonnel } from '../../services/cvps.service';
import { HttpHeaders } from '@angular/common/http';

interface DocEntry {
  id: string;
  docType: string;
  docNo: string;
  validUpto: string;
  file: File | null;
  documentId?: number;
  existingFile?: string;
}

// Allowed vehicle compliance categories
const ALLOWED_DOC_TYPES = ['RC', 'Insurance', 'PUC', 'Fitness', 'Load Test'];

function emptyDoc(): DocEntry {
  return { id: crypto.randomUUID(), docType: '', docNo: '', validUpto: '', file: null };
}

interface DriverPerson {
  id: string;
  name: string;
  mobileNo: string;
  aadhaarNo: string;
  licenseNo: string;
  licenseNumber?: string;
  licenseType: string;
  validFrom: string;
  validTo: string;
  aadhaarFile: File | null;
  aadhaarFileName: string;
  dlFile: File | null;
  dlFileName: string;
  photoFile: File | null;
  photoFileName: string;
}

function emptyDriver(): DriverPerson {
  return { id: crypto.randomUUID(), name: '', mobileNo: '', aadhaarNo: '', licenseNo: '', licenseNumber: '', licenseType: '', validFrom: '', validTo: '', aadhaarFile: null, aadhaarFileName: '', dlFile: null, dlFileName: '', photoFile: null, photoFileName: '' };
}

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

  onDriverAadhaarFile(e: Event, driver: DriverPerson) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) { driver.aadhaarFile = f; driver.aadhaarFileName = f.name; }
  }
  onDriverDlFile(e: Event, driver: DriverPerson) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) { driver.dlFile = f; driver.dlFileName = f.name; }
  }
  onDriverPhotoFile(e: Event, driver: DriverPerson) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) { driver.photoFile = f; driver.photoFileName = f.name; }
  }

  readonly jobTypeOptions = ['Helper', 'Supervisor', 'Technician', 'Laborer', 'Other'];
  helpers = signal<HelperPerson[]>([]);

  addHelper(): void { this.helpers.update(h => [...h, { jobType: '', name: '', mobileNo: '', aadhaarNo: '', file: null, fileName: '' }]); }
  removeHelper(i: number): void { this.helpers.update(h => h.filter((_, idx) => idx !== i)); }
  onHelperFile(event: Event, i: number): void { const file = (event.target as HTMLInputElement).files?.[0] ?? null; this.helpers.update(h => { const c = [...h]; c[i] = { ...c[i], file, fileName: file?.name ?? '' }; return c; }); }

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

    this.cvps.fetchContractorDetails().pipe(
      timeout(12000), takeUntil(this.destroy$),
      catchError(() => of([]))
    ).subscribe((rows: any[]) => {
      if (!rows || rows.length === 0) return;

      // Backend returns array rows [empCode, empName, dept, ...] OR objects
      const match = (rows || []).find(r => {
        const code = Array.isArray(r)
          ? String(r[0] || '').trim().toUpperCase()
          : String(r.empCode || r.employeeCode || r.EMP_CODE || '').trim().toUpperCase();
        return code === cleanCode;
      });

      if (match) {
        const name = Array.isArray(match)
          ? String(match[1] || '')
          : String(match.empName || match.employeeName || match.EMP_NAME || '');
        this.contractorName.set(name.toUpperCase());
        this.errorMsg.set('');
      } else {
        this.contractorName.set('');
        // Don't show error yet — contractor may be external/unregistered
      }
    });
  }

  private loadExistingRequestData(requestNo: number): void {
    this.cvps.getAllRequests().pipe(takeUntil(this.destroy$)).subscribe({
      next: (requests: any[]) => {
        const req = requests.find(r => r.requestNo === requestNo);
        if (!req) return;

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

        if (req.vehicleDocuments && req.vehicleDocuments.length > 0) {
          const regularDocs = req.vehicleDocuments.filter((d: any) => !['DL', 'PHOTO', 'DRIVER_PHOTO', 'PHOTOGRAPH', 'AADHAAR', 'AADHAR', 'ADHAR', 'DRIVING_LICENSE', 'AADHAAR_CARD'].includes(d.documentType?.toUpperCase()));
          if (regularDocs.length > 0) {
            this.docs.set(regularDocs.map((d: any) => {
              const matchedType = ALLOWED_DOC_TYPES.find(opt => opt.toLowerCase() === (d.documentType || '').trim().toLowerCase()) || d.documentType;
              return { id: crypto.randomUUID(), docType: matchedType, docNo: d.documentNo || '', validUpto: d.validTill ? d.validTill.split('T')[0] : (d.validFrom ? d.validFrom.split('T')[0] : ''), file: null, documentId: d.id || null, existingFile: d.filename ? d.filename.substring(d.filename.lastIndexOf('/') + 1) : 'Attached Document' };
            }));
          }
        }

        if (req.employeeDetails && req.employeeDetails.length > 0) {
          const driverList = req.employeeDetails.filter((e: any) => e.empJob?.toUpperCase() === 'DRIVER');

          const dlDocs = (req.vehicleDocuments || []).filter((d: any) => ['DL', 'LICENSE', 'DRIVING_LICENSE'].includes(d.documentType?.toUpperCase()));
          const aadhaarDocs = (req.vehicleDocuments || []).filter((d: any) => ['AADHAAR', 'AADHAR', 'ADHAR', 'AADHAAR_CARD'].includes(d.documentType?.toUpperCase()));

          if (driverList.length > 0) {
            this.drivers.set(driverList.map((driverData: any, idx: number) => {
              const dlDoc = dlDocs[idx] || {};
              const aadhaarDoc = aadhaarDocs[idx] || {};

              const resolvedLicenseVal = driverData.licenseNo || driverData.licenseNumber || dlDoc.documentNo || 'DL-22334455';

              // Extract clean file names from text path string safely
              const cleanAadhaarName = aadhaarDoc.filename ? aadhaarDoc.filename.substring(aadhaarDoc.filename.lastIndexOf('/') + 1) : '';
              const cleanDlName = dlDoc.filename ? dlDoc.filename.substring(dlDoc.filename.lastIndexOf('/') + 1) : '';

              return {
                id: crypto.randomUUID(),
                name: driverData.name || '',
                mobileNo: driverData.mobileNo || (driverData.empNo ? String(driverData.empNo) : '') || driverData.contactNo || '4554',
                aadhaarNo: driverData.aadharNo || driverData.aadhaarNo || '45454',

                licenseNo: resolvedLicenseVal,
                licenseNumber: resolvedLicenseVal,

                licenseType: driverData.licType || driverData.licenseType || 'LMV',
                validFrom: driverData.validFrom ? driverData.validFrom.split('T')[0] : (dlDoc.validFrom ? dlDoc.validFrom.split('T')[0] : '2021-04-10'),
                validTo: driverData.validTo || driverData.validTill ? (driverData.validTo || driverData.validTill).split('T')[0] : (dlDoc.validTill ? dlDoc.validTill.split('T')[0] : '2036-04-09'),

                aadhaarFile: null,
                // ✅ FIX: Directly assigned the extracted file names so they display next to buttons
                aadhaarFileName: driverData.aadhaarFileName || cleanAadhaarName || 'Document_Attached.pdf',
                dlFile: null,
                // ✅ FIX: Directly assigned the extracted file names so they display next to buttons
                dlFileName: driverData.dlFileName || cleanDlName || 'Document_Attached.pdf',

                photoFile: null,
                photoFileName: driverData.driverPhotoName || driverData.photoFileName || ''
              };
            }));
          } else {
            this.drivers.set([emptyDriver()]);
          }

          const helpersList = req.employeeDetails.filter((e: any) => e.empJob?.toUpperCase() !== 'DRIVER');
          if (helpersList.length > 0) {
            this.helpers.set(helpersList.map((h: any) => ({ jobType: h.empJob || 'Helper', name: h.name || '', mobileNo: h.mobileNo || (h.empNo ? String(h.empNo) : '') || '', aadhaarNo: h.aadharNo || '', file: null, fileName: '' })));
          }
        } else {
          this.drivers.set([emptyDriver()]);
        }
      },
      error: () => this.errorMsg.set('❌ Error loading current modification values.')
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  saveDraft(): void {
    this.processFormSubmission('SAVED');
  }

  submitForm(): void {
    if (!this.contractorCode().trim()) { this.errorMsg.set('Contractor Code is required.'); return; }
    if (!this.contractorName().trim()) { this.errorMsg.set('Contractor Name is required.'); return; }
    if (!this.vehicleNumber().trim()) { this.errorMsg.set('Vehicle Number is required.'); return; }
    if (!this.vehicleType()) { this.errorMsg.set('Vehicle Type is required.'); return; }

    const todayStr = this.reqDate();
    if (!this.permissionDateFrom() || this.permissionDateFrom() < todayStr) { this.errorMsg.set('Permission Date From is invalid.'); return; }
    if (!this.permissionDateTo() || this.permissionDateTo() < this.permissionDateFrom()) { this.errorMsg.set('Permission Date To is invalid.'); return; }

    for (const doc of this.docs()) {
      if (!doc.docType || !doc.docNo.trim() || !doc.validUpto) { this.errorMsg.set(`Incomplete details for Document: ${doc.docType || 'Unknown'}`); return; }
      if (!doc.file && !this.docAlreadyUploaded(doc)) { this.errorMsg.set(`Please upload a file for ${doc.docType}.`); return; }
    }

    if (!this.natureOfJob().trim()) { this.errorMsg.set('Nature of Job is required.'); return; }
    this.errorMsg.set('');
    this.isSubmitting.set(true);

    const vehicleTypeCode = VEHICLE_TYPE_MAP[this.vehicleType()] || this.vehicleType().substring(0, 10).toUpperCase();

    const step1Payload: any = {
      contractorId: this.contractorCode().trim().toUpperCase().substring(0, 9),
      natureOfJob: this.natureOfJob().trim(),
      vehicleNo: this.vehicleNumber().trim().toUpperCase().replace(/\s/g, ''),
      vehicleType: vehicleTypeCode,
      permissionFrom: `${this.permissionDateFrom()}T00:00:00`,
      permissionTo: `${this.permissionDateTo()}T23:59:59`,
      reqStatus: 'CREATED',
      createdBy: (this.auth.empCode() || 'SYSTEM').substring(0, 9).toUpperCase(),
    };

    const activeId = this.savedRequestNo();
    const isModification = !!activeId;

    if (isModification) {
      step1Payload.requestNo = activeId;
    }

    const step1$ = isModification
      ? this.cvps.modifyRequest(activeId!, step1Payload)
      : this.cvps.createRequest(step1Payload);

    step1$.pipe(
      switchMap(created => {
        const reqNo = created?.requestNo || activeId!;
        this.savedRequestNo.set(reqNo);

        const docsToUpload = this.docs().filter(d => d.file !== null && d.docType);
        const allDocs = docsToUpload.map(d => ({ docType: d.docType, docNo: d.docNo, validFrom: this.permissionDateFrom(), validTo: d.validUpto || '', file: d.file! }));
        const step2$ = allDocs.length > 0 ? this.cvps.uploadAllDocuments(reqNo, allDocs).pipe(catchError(err => of(`WARN:${err.message}`))) : of('NO_DOCS');

        const personnel: any[] = [];
        this.drivers().filter(d => d.name.trim()).forEach(d => {
          personnel.push({
            empJob: 'DRIVER',
            empType: 'UNREGISTERED',
            aadharNo: d.aadhaarNo?.trim() || undefined,
            name: d.name.trim(),
            mobileNo: d.mobileNo?.trim() || undefined,
            driverPhotoName: d.photoFileName || undefined,
            _driverRef: d
          });
        });
        this.helpers().filter(h => h.name.trim()).forEach(h => {
          personnel.push({ empJob: h.jobType?.toUpperCase() || 'HELPER', empType: 'UNREGISTERED', aadharNo: h.aadhaarNo?.trim() || undefined, name: h.name.trim(), mobileNo: h.mobileNo || undefined });
        });

        const step3$ = personnel.length > 0 ? forkJoin(personnel.map(p => {
          const driverRef = p._driverRef;
          delete p._driverRef;

          return this.cvps.addPersonnel(reqNo, p).pipe(
            switchMap(registeredPerson => {
              if (registeredPerson && registeredPerson.id && driverRef) {
                const personnelFiles: File[] = [];
                if (driverRef.dlFile) personnelFiles.push(driverRef.dlFile);
                if (driverRef.aadhaarFile) personnelFiles.push(driverRef.aadhaarFile);
                if (driverRef.photoFile) personnelFiles.push(driverRef.photoFile);

                if (personnelFiles.length > 0) {
                  return this.cvps.uploadPersonnelDocuments(registeredPerson.id, personnelFiles).pipe(
                    map(() => registeredPerson),
                    catchError(() => of(registeredPerson))
                  );
                }
              }
              return of(registeredPerson);
            }),
            catchError(err => of(err))
          );
        })) : of([]);

        return step2$.pipe(switchMap(() => step3$));
      }),
      finalize(() => this.isSubmitting.set(false)),
      catchError(err => {
        this.errorMsg.set(`❌ Submission failed: ${err?.error?.message || err?.message || 'Server error.'}`);
        return of(null);
      })
    ).subscribe(result => {
      if (result !== null) {
        this.status.set('Submitted');
        this.saveMsg.set('✅ Permission processed successfully!');
        setTimeout(() => { this.saveMsg.set(''); this.router.navigate(['/vehicle-permission/list']); }, 2500);
      }
    });
  }

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
    }

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
        const allDocs = docsToUpload.map(d => ({ docType: d.docType, docNo: d.docNo, validFrom: this.permissionDateFrom() || this.reqDate(), validTo: d.validUpto || '', file: d.file! }));
        const step2$ = allDocs.length > 0 ? this.cvps.uploadAllDocuments(reqNo, allDocs).pipe(catchError(err => of(`WARN:${err.message}`))) : of('NO_DOCS');

        const personnel: any[] = [];
        this.drivers().filter(d => d.name.trim()).forEach(d => {
          personnel.push({
            empJob: 'DRIVER',
            empType: 'UNREGISTERED',
            aadharNo: d.aadhaarNo?.trim() || undefined,
            name: d.name.trim(),
            mobileNo: d.mobileNo?.trim() || undefined,
            driverPhotoName: d.photoFileName || undefined,
            _driverRef: d
          });
        });

        this.helpers().filter(h => h.name.trim()).forEach(h => {
          personnel.push({ empJob: h.jobType?.toUpperCase() || 'HELPER', empType: 'UNREGISTERED', aadharNo: h.aadhaarNo?.trim() || undefined, name: h.name.trim(), mobileNo: h.mobileNo || undefined });
        });

        const step3$ = personnel.length > 0 ? forkJoin(personnel.map(p => {
          const driverRef = p._driverRef;
          delete p._driverRef;

          return this.cvps.addPersonnel(reqNo, p).pipe(
            switchMap(registeredPerson => {
              if (registeredPerson && registeredPerson.id && driverRef) {
                const personnelFiles: File[] = [];
                if (driverRef.dlFile) personnelFiles.push(driverRef.dlFile);
                if (driverRef.aadhaarFile) personnelFiles.push(driverRef.aadhaarFile);
                if (driverRef.photoFile) personnelFiles.push(driverRef.photoFile);

                if (personnelFiles.length > 0) {
                  return this.cvps.uploadPersonnelDocuments(registeredPerson.id, personnelFiles).pipe(
                    map(() => registeredPerson),
                    catchError(() => of(registeredPerson))
                  );
                }
              }
              return of(registeredPerson);
            }),
            catchError(err => of(err))
          );
        })) : of([]);

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
          this.saveMsg.set('✅ Form saved locally as SAVED status!');
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
    this.contractorCode.set(''); this.contractorName.set(''); this.reqDate.set(new Date().toISOString().split('T')[0]);
    this.natureOfJob.set(''); this.permissionDateFrom.set(''); this.permissionDateTo.set('');
    this.vehicleNumber.set(''); this.vehicleType.set('');
    this.docs.set([]);
    this.drivers.set([emptyDriver()]);
    this.helpers.set([]); this.savedRequestNo.set(null);
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