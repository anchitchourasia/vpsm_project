import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, of, forkJoin, Observable } from 'rxjs';
import { catchError, finalize, switchMap, takeUntil, tap } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';
import {
  CvpsService,
  CvpsRequest,
  CreateRequestDTO,
  VehicleDocumentDTO,
  ApiResponse,
  CvpsPersonnel
} from '../../services/cvps.service';

interface DocEntry {
  id: string;
  docType: string;
  docNo: string;
  validUpto: string;
  file: File | null;
  documentId?: number;
  existingFile?: string;
}

interface DriverPerson {
  id: string;
  role: string;
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
  aadhaarExistingFile: string;
  dlFile: File | null;
  dlFileName: string;
  dlExistingFile: string;
  photoFile: File | null;
  photoFileName: string;
}

interface HelperPerson {
  jobType: string;
  name: string;
  mobileNo: string;
  aadhaarNo: string;
  file: File | null;
  fileName: string;
}

const ALLOWED_DOC_TYPES = ['RC', 'Insurance', 'PUC', 'Fitness', 'Load Test'];

const DRIVER_DOC_TYPES_UPPER = [
  'DL', 'LICENSE', 'DRIVING_LICENSE',
  'AADHAAR', 'AADHAR', 'ADHAR', 'AADHAAR_CARD',
  'PHOTO', 'DRIVER_PHOTO', 'PHOTOGRAPH',
];

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

function emptyDoc(): DocEntry {
  return { id: crypto.randomUUID(), docType: '', docNo: '', validUpto: '', file: null };
}

function emptyDriver(): DriverPerson {
  return {
    id: crypto.randomUUID(),
    role: 'Driver',
    name: '',
    mobileNo: '',
    aadhaarNo: '',
    licenseNo: '',
    licenseNumber: '',
    licenseType: '',
    validFrom: '',
    validTo: '',
    aadhaarFile: null,
    aadhaarFileName: '',
    aadhaarExistingFile: '',
    dlFile: null,
    dlFileName: '',
    dlExistingFile: '',
    photoFile: null,
    photoFileName: '',
  };
}

function parseBackendDate(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') return new Date(val).toISOString().split('T')[0];
  if (Array.isArray(val) && val.length >= 3) {
    const y = val[0];
    const m = String(val[1]).padStart(2, '0');
    const d = String(val[2]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'string') return val.split('T')[0];
  return '';
}

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

  readonly vehicleTypeOptions = ['Two Wheeler', 'Four Wheeler', 'Heavy Vehicle', 'Tractor', 'Crane', 'JCB', 'Fork Lift', 'Other'];
  readonly driverRoleOptions = ['Driver', 'Conductor', 'Helper', 'Other'];
  readonly jobTypeOptions = ['Helper', 'Supervisor', 'Technician', 'Laborer', 'Other'];
  readonly ALLOWED_DOC_TYPES = ALLOWED_DOC_TYPES;

  docs = signal<DocEntry[]>([]);
  drivers = signal<DriverPerson[]>([emptyDriver()]);
  helpers = signal<HelperPerson[]>([]);

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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  addDoc(): void {
    if (this.docs().length >= ALLOWED_DOC_TYPES.length) return;
    this.docs.update(d => [...d, emptyDoc()]);
  }

  removeDoc(i: number): void {
    this.docs.update(d => d.filter((_, idx) => idx !== i));
  }

  availableDocTypes(currentDoc: DocEntry): string[] {
    const used = this.docs().filter(d => d !== currentDoc).map(d => d.docType).filter(Boolean);
    const available = ALLOWED_DOC_TYPES.filter(t => !used.includes(t));
    if (currentDoc.docType && !available.includes(currentDoc.docType)) {
      return [currentDoc.docType, ...available];
    }
    return available;
  }

  onDocTypeChange(doc: DocEntry): void {
    const dupe = this.docs().filter(d => d !== doc && d.docType === doc.docType);
    if (dupe.length > 0) {
      const duplicateType = doc.docType;
      setTimeout(() => { doc.docType = ''; }, 0);
      this.errorMsg.set(`${duplicateType} is already added. Each type can appear only once.`);
    } else {
      this.errorMsg.set('');
    }
  }

  onDocNoInput(event: Event, doc: DocEntry): void {
    const input = event.target as HTMLInputElement;
    doc.docNo = input.value.toUpperCase();
    input.value = doc.docNo;
  }

  onDocFileSelected(event: Event, doc: DocEntry): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.docs.update(list =>
      list.map(d =>
        d.id === doc.id
          ? { ...d, file: input.files![0], existingFile: undefined }
          : d
      )
    );
  }

  docAlreadyUploaded(doc: DocEntry): boolean {
    return !!doc.documentId && !!doc.existingFile && !doc.file;
  }

  shortName(name: string): string {
    return name.length > 18 ? `${name.substring(0, 15)}...` : name;
  }

  addDriver(): void {
    this.drivers.update(d => [...d, emptyDriver()]);
  }

  removeDriver(i: number): void {
    this.drivers.update(d => d.filter((_, idx) => idx !== i));
  }

  onDriverAadhaarFile(e: Event, driver: DriverPerson): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) {
      driver.aadhaarFile = f;
      driver.aadhaarFileName = f.name;
      driver.aadhaarExistingFile = '';
    }
  }

  onDriverDlFile(e: Event, driver: DriverPerson): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) {
      driver.dlFile = f;
      driver.dlFileName = f.name;
      driver.dlExistingFile = '';
    }
  }

  onDriverPhotoFile(e: Event, driver: DriverPerson): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) {
      driver.photoFile = f;
      driver.photoFileName = f.name;
    }
  }

  addHelper(): void {
    this.helpers.update(h => [...h, {
      jobType: '',
      name: '',
      mobileNo: '',
      aadhaarNo: '',
      file: null,
      fileName: ''
    }]);
  }

  removeHelper(i: number): void {
    this.helpers.update(h => h.filter((_, idx) => idx !== i));
  }

  onHelperFile(event: Event, i: number): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.helpers.update(h => {
      const c = [...h];
      c[i] = { ...c[i], file, fileName: file?.name ?? '' };
      return c;
    });
  }

  onContractorCodeChange(typedCode: string): void {
    const cleanCode = typedCode.trim().toUpperCase();
    this.contractorCode.set(cleanCode);
    this.contractorName.set('');
    this.errorMsg.set('');
    if (!cleanCode) return;

    this.resolveContractorName(cleanCode);
  }

  private resolveContractorName(contractorCode: string): void {
    this.cvps.fetchContractorDetails().pipe(
      takeUntil(this.destroy$),
      catchError(() => {
        this.errorMsg.set('⚠️ Could not reach employee server. Check connectivity.');
        return of([]);
      })
    ).subscribe((rows: any[]) => {
      if (!rows || rows.length === 0) {
        this.contractorName.set('');
        return;
      }

      const match = rows.find(
        r => r.contractorCode && String(r.contractorCode).toUpperCase() === contractorCode.toUpperCase()
      );

      if (match) {
        this.contractorName.set(String(match.name || '').toUpperCase());
        this.errorMsg.set('');
      } else {
        this.contractorName.set('');
      }
    });
  }

  private loadExistingRequestData(requestNo: number): void {
    this.cvps.getByRequestNo(requestNo).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (record: CvpsRequest) => {
        if (!record) {
          this.errorMsg.set('❌ Request not found.');
          return;
        }
        this.populateFormFields(record);
      },
      error: () => this.errorMsg.set('❌ Error loading existing request data.'),
    });
  }

  private populateFormFields(req: CvpsRequest): void {
    const s = (req.reqStatus || '').toUpperCase();

    if (s === 'SAVED') this.status.set('Saved');
    else if (s === 'HOLD' || s === 'MODIFY') this.status.set('Need Modification');
    else if (s === 'CONFIRMED') this.status.set('Confirmed');
    else if (s === 'APPROVED') this.status.set('Approved');
    else if (s === 'REJECTED') this.status.set('Rejected');
    else if (s === 'CREATED' || s === 'SUBMITTED') this.status.set('Submitted');
    else this.status.set(req.reqStatus || 'Draft');

    const contractorId = req.contractorId || '';
    this.contractorCode.set(contractorId);
    this.contractorName.set('');
    if (contractorId) {
      this.resolveContractorName(contractorId);
    }

    this.natureOfJob.set(req.natureOfJob || '');
    this.vehicleNumber.set(req.vehicleNo || '');

    const displayType = Object.keys(VEHICLE_TYPE_MAP)
      .find(k => VEHICLE_TYPE_MAP[k] === req.vehicleType);
    this.vehicleType.set(displayType || req.vehicleType || 'Other');

    this.permissionDateFrom.set(parseBackendDate(req.permissionFrom));
    this.permissionDateTo.set(parseBackendDate(req.permissionTo));

    const allVehicleDocs = req.vehicleDocuments || [];
    const regularDocs = allVehicleDocs.filter(
      d => d.documentType && !DRIVER_DOC_TYPES_UPPER.includes(d.documentType.trim().toUpperCase())
    );

    this.docs.set(
      regularDocs.map(d => ({
        id: crypto.randomUUID(),
        docType: ALLOWED_DOC_TYPES.find(
          opt => opt.toLowerCase() === (d.documentType || '').trim().toLowerCase()
        ) || d.documentType,
        docNo: d.documentNo || '',
        validUpto: parseBackendDate(d.validTill) || parseBackendDate(d.validFrom) || '',
        file: null,
        documentId: d.id || undefined,
        existingFile: d.filename
          ? d.filename.substring(d.filename.lastIndexOf('/') + 1)
          : 'Attached Document',
      }))
    );

    const allPersonnel = req.employeeDetails || [];
    const driverList = allPersonnel.filter(
      e => (e.empJob || '').toUpperCase() === 'DRIVER'
    );
    const helpersList = allPersonnel.filter(
      e => (e.empJob || '').toUpperCase() !== 'DRIVER'
    );

    if (driverList.length > 0) {
      this.drivers.set(
        driverList.map(driverData => ({
          id: crypto.randomUUID(),
          role: driverData.empJob
            ? driverData.empJob.charAt(0).toUpperCase() + driverData.empJob.slice(1).toLowerCase()
            : 'Driver',
          name: driverData.name || '',
          mobileNo: driverData.mobileNo || '',
          aadhaarNo: driverData.aadharNo || '',
          licenseNo: driverData.licenseNo || '',
          licenseNumber: driverData.licenseNo || '',
          licenseType: driverData.licenseType || '',
          validFrom: parseBackendDate(driverData.validFrom) || '',
          validTo: parseBackendDate(driverData.validTo) || '',
          aadhaarFile: null,
          aadhaarFileName: '',
          aadhaarExistingFile: '',
          dlFile: null,
          dlFileName: '',
          dlExistingFile: '',
          photoFile: null,
          photoFileName: driverData.driverPhotoName || '',
        }))
      );
    } else {
      this.drivers.set([emptyDriver()]);
    }

    if (helpersList.length > 0) {
      this.helpers.set(
        helpersList.map(h => ({
          jobType: h.empJob || 'Helper',
          name: h.name || '',
          mobileNo: h.mobileNo || '',
          aadhaarNo: h.aadharNo || '',
          file: null,
          fileName: '',
        }))
      );
    } else {
      this.helpers.set([]);
    }
  }

  saveDraft(): void {
    this.processFormSubmission('SAVED');
  }

  submitForm(): void {
    this.processFormSubmission('CREATED');
  }

  private validateForm(targetStatus: string): boolean {
    if (!this.contractorCode().trim()) {
      this.errorMsg.set('Contractor Code is required.');
      return false;
    }
    if (!this.contractorName().trim()) {
      this.errorMsg.set('Contractor Name is required.');
      return false;
    }
    if (!this.vehicleNumber().trim()) {
      this.errorMsg.set('Vehicle Number is required.');
      return false;
    }
    if (!this.vehicleType()) {
      this.errorMsg.set('Vehicle Type is required.');
      return false;
    }
    if (!this.natureOfJob().trim()) {
      this.errorMsg.set('Nature of Job is required.');
      return false;
    }

    if (targetStatus === 'CREATED') {
      const today = this.reqDate();
      if (!this.permissionDateFrom() || this.permissionDateFrom() < today) {
        this.errorMsg.set('Permission Date From cannot be blank or a past date.');
        return false;
      }
      if (!this.permissionDateTo() || this.permissionDateTo() < this.permissionDateFrom()) {
        this.errorMsg.set('Permission Date To is invalid.');
        return false;
      }

      for (const doc of this.docs()) {
        if (!doc.docType || !doc.docNo.trim() || !doc.validUpto) {
          this.errorMsg.set(`Incomplete details for Document: ${doc.docType || 'Unknown'}`);
          return false;
        }
        if (!doc.file && !this.docAlreadyUploaded(doc)) {
          this.errorMsg.set(`Please upload a file for ${doc.docType}.`);
          return false;
        }
      }

      for (let idx = 0; idx < this.drivers().length; idx++) {
        const d = this.drivers()[idx];
        const label = `Person ${idx + 1} (${d.role || 'Unknown'})`;

        if (!d.name.trim()) {
          this.errorMsg.set(`${label}: Name is required.`);
          return false;
        }
        if (!d.aadhaarNo?.trim()) {
          this.errorMsg.set(`${label}: Aadhaar Number is required.`);
          return false;
        }
        if (!d.aadhaarFile && !d.aadhaarExistingFile) {
          this.errorMsg.set(`${label}: Aadhaar Copy is required.`);
          return false;
        }

        if ((d.role || '').toUpperCase() === 'DRIVER') {
          if (!d.licenseNo?.trim()) {
            this.errorMsg.set(`${label}: License Number is required.`);
            return false;
          }
          if (!d.licenseType?.trim()) {
            this.errorMsg.set(`${label}: License Type is required.`);
            return false;
          }
          if (!d.validFrom) {
            this.errorMsg.set(`${label}: License Valid From is required.`);
            return false;
          }
          if (!d.validTo) {
            this.errorMsg.set(`${label}: License Valid To is required.`);
            return false;
          }
          if (!d.dlFile && !d.dlExistingFile) {
            this.errorMsg.set(`${label}: Driving License Copy is required.`);
            return false;
          }
        }
      }
    }

    this.errorMsg.set('');
    return true;
  }

  private buildMasterPayload(targetStatus: string): CvpsRequest {
    return {
      contractorId: this.contractorCode().trim().toUpperCase(),
      natureOfJob: this.natureOfJob().trim(),
      vehicleNo: this.vehicleNumber().trim().toUpperCase(),
      vehicleType: VEHICLE_TYPE_MAP[this.vehicleType()] || 'OTHER',
      permissionFrom: this.permissionDateFrom()
        ? `${this.permissionDateFrom()}T00:00:00`
        : `${this.reqDate()}T00:00:00`,
      permissionTo: this.permissionDateTo()
        ? `${this.permissionDateTo()}T23:59:59`
        : `${this.reqDate()}T23:59:59`,
      reqStatus: targetStatus,
      createdBy: (this.auth.empCode() || 'SYSTEM').substring(0, 9).toUpperCase(),
    };
  }

  private buildCreatePayload(targetStatus: string): CreateRequestDTO {
    const master = this.buildMasterPayload(targetStatus);

    const vehicleDocuments: VehicleDocumentDTO[] = this.docs()
      .filter(d => d.docType && d.docNo.trim())
      .map(d => ({
        documentNo: d.docNo.trim().toUpperCase(),
        documentType: d.docType,
        fileName: d.file?.name || d.existingFile || `${d.docType}_${d.docNo}.pdf`,
        validFrom: this.permissionDateFrom() || this.reqDate(),
        validTill: d.validUpto || undefined,
      }));

    return {
      request: {
        createdDate: undefined,
        permissionFrom: master.permissionFrom,
        permissionTo: master.permissionTo,
        contractorId: master.contractorId,
        createdBy: master.createdBy,
        vehicleType: master.vehicleType,
        reqStatus: master.reqStatus,
        vehicleNo: master.vehicleNo,
        natureOfJob: master.natureOfJob,
        requestId: undefined,
      },
      vehicleDocuments,
      employees: []
    };
  }

  private buildPersonnelPayloads(): Array<{ payload: CvpsPersonnel; files: File[] }> {
    const personnel: Array<{ payload: CvpsPersonnel; files: File[] }> = [];

    this.drivers()
      .filter(d => d.name.trim())
      .forEach(d => {
        const files: File[] = [];
        if (d.aadhaarFile) files.push(d.aadhaarFile);
        if (d.dlFile) files.push(d.dlFile);
        if (d.photoFile) files.push(d.photoFile);

        personnel.push({
          payload: {
            empJob: (d.role || 'DRIVER').toUpperCase(),
            empType: 'UNREGISTERED',
            empNo: undefined,
            aadharNo: d.aadhaarNo?.trim() || undefined,
            name: d.name.trim(),
            mobileNo: d.mobileNo?.trim() || undefined,
            licenseNo: d.licenseNo?.trim() || undefined,
            licenseType: d.licenseType?.trim() || undefined,
            validFrom: d.validFrom || undefined,
            validTo: d.validTo || undefined,
            driverPhotoName: d.photoFileName || undefined,
          },
          files
        });
      });

    this.helpers()
      .filter(h => h.name.trim())
      .forEach(h => {
        const files: File[] = [];
        if (h.file) files.push(h.file);

        personnel.push({
          payload: {
            empJob: (h.jobType || 'HELPER').toUpperCase(),
            empType: 'UNREGISTERED',
            empNo: undefined,
            aadharNo: h.aadhaarNo?.trim() || undefined,
            name: h.name.trim(),
            mobileNo: h.mobileNo?.trim() || undefined,
          },
          files
        });
      });

    return personnel;
  }

  private uploadPersonnelSequence(requestNo: number): Observable<any> {
    const personnelEntries = this.buildPersonnelPayloads();

    if (personnelEntries.length === 0) {
      return of([]);
    }

    return forkJoin(
      personnelEntries.map(entry =>
        this.cvps.addPersonnel(requestNo, entry.payload).pipe(
          switchMap(savedPerson => {
            if (entry.files.length > 0 && savedPerson?.id) {
              return this.cvps.uploadPersonnelDocuments(savedPerson.id, entry.files);
            }
            return of(savedPerson);
          }),
          catchError(err => of(err))
        )
      )
    );
  }

  private uploadVehicleDocumentsForCreate(requestNo: number): Observable<any> {
    const docsNew = this.docs().filter(d => d.file !== null && d.docType);

    if (docsNew.length === 0) {
      return of('NO_VEHICLE_DOC_UPLOAD');
    }

    const vehicleDocEntries = docsNew.map(d => ({
      docType: d.docType,
      docNo: d.docNo,
      validFrom: this.permissionDateFrom() || this.reqDate(),
      validTo: d.validUpto || '',
      file: d.file!,
    }));

    return this.cvps.uploadAllDocuments(requestNo, vehicleDocEntries).pipe(
      catchError(err => of(err))
    );
  }

  private uploadVehicleDocumentsForUpdate(requestNo: number): Observable<any> {
    const docsNew = this.docs().filter(d => d.file !== null && !d.documentId && d.docType);
    const docsReplace = this.docs().filter(d => d.file !== null && !!d.documentId && d.docType);

    const newDocs$ = docsNew.length > 0
      ? this.cvps.uploadAllDocuments(
          requestNo,
          docsNew.map(d => ({
            docType: d.docType,
            docNo: d.docNo,
            validFrom: this.permissionDateFrom() || this.reqDate(),
            validTo: d.validUpto || '',
            file: d.file!,
          }))
        ).pipe(catchError(err => of(err)))
      : of('NO_NEW_DOCS');

    const replaceDocs$ = docsReplace.length > 0
      ? forkJoin(
          docsReplace.map(d =>
            this.cvps.replaceDocument(requestNo, {
              docType: d.docType,
              docNo: d.docNo,
              validFrom: this.permissionDateFrom() || this.reqDate(),
              validTo: d.validUpto || '',
              file: d.file!,
            }).pipe(catchError(err => of(err)))
          )
        )
      : of([]);

    return newDocs$.pipe(
      switchMap(() => replaceDocs$)
    );
  }

  private processFormSubmission(targetStatus: string): void {
    if (!this.validateForm(targetStatus)) return;

    this.errorMsg.set('');
    this.saveMsg.set('');

    if (targetStatus === 'SAVED') this.isSaving.set(true);
    else this.isSubmitting.set(true);

    const activeId = this.savedRequestNo();
    const isUpdate = !!activeId;

    if (isUpdate) {
      this.cvps.modifyRequest(activeId, this.buildMasterPayload(targetStatus)).pipe(
        switchMap((updatedRequest: CvpsRequest) => {
          const requestNo = updatedRequest.requestNo || activeId;
          this.savedRequestNo.set(requestNo);

          if (targetStatus === 'SAVED') {
            return of(updatedRequest);
          }

          return this.uploadVehicleDocumentsForUpdate(requestNo).pipe(
            switchMap(() => this.uploadPersonnelSequence(requestNo)),
            tap(() => this.status.set('Submitted'))
          );
        }),
        takeUntil(this.destroy$),
        catchError(err => {
          this.errorMsg.set(
            `❌ Process failed: ${err?.error?.message || err?.message || 'Server error. Please try again.'}`
          );
          return of(null);
        }),
        finalize(() => {
          this.isSubmitting.set(false);
          this.isSaving.set(false);
        })
      ).subscribe((result: any) => {
        if (result === null) return;

        if (targetStatus === 'SAVED') {
          this.status.set('Saved');
          this.saveMsg.set('✅ Form saved successfully!');
          setTimeout(() => {
            this.saveMsg.set('');
            this.router.navigate(['/vehicle-permission/list']);
          }, 2000);
        } else {
          this.status.set('Submitted');
          this.saveMsg.set('✅ Permission request updated successfully!');
          setTimeout(() => {
            this.saveMsg.set('');
            this.router.navigate(['/vehicle-permission/list']);
          }, 2500);
        }
      });

      return;
    }

    this.cvps.createRequest(this.buildCreatePayload(targetStatus)).pipe(
      switchMap((createResponse: ApiResponse) => {
        const requestNo = createResponse.requestNo;
        this.savedRequestNo.set(requestNo);

        if (targetStatus === 'SAVED') {
          return of(createResponse);
        }

        return this.uploadVehicleDocumentsForCreate(requestNo).pipe(
          switchMap(() => this.uploadPersonnelSequence(requestNo))
        );
      }),
      takeUntil(this.destroy$),
      catchError(err => {
        this.errorMsg.set(
          `❌ Process failed: ${err?.error?.message || err?.message || 'Server error. Please try again.'}`
        );
        return of(null);
      }),
      finalize(() => {
        this.isSubmitting.set(false);
        this.isSaving.set(false);
      })
    ).subscribe((result: any) => {
      if (result === null) return;

      if (targetStatus === 'SAVED') {
        this.status.set('Saved');
        this.saveMsg.set('✅ Form saved successfully!');
        setTimeout(() => {
          this.saveMsg.set('');
          this.router.navigate(['/vehicle-permission/list']);
        }, 2000);
      } else {
        this.status.set('Submitted');
        this.saveMsg.set('✅ Permission request submitted successfully!');
        setTimeout(() => {
          this.saveMsg.set('');
          this.router.navigate(['/vehicle-permission/list']);
        }, 2500);
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
    this.helpers.set([]);
    this.savedRequestNo.set(null);
    this.status.set('Draft');
    this.saveMsg.set('');
    this.errorMsg.set('');
  }

  getStatusClass(s: string): string {
    switch (s.toLowerCase()) {
      case 'submitted':
      case 'created':
        return 'wf-submitted';
      case 'confirmed':
      case 'pending':
        return 'wf-pending';
      case 'waiting':
        return 'wf-waiting';
      case 'verified':
        return 'wf-verified';
      case 'approved':
        return 'wf-approved';
      case 'rejected':
        return 'wf-rejected';
      case 'need modification':
      case 'hold':
        return 'wf-hold';
      case 'saved':
      case 'draft':
        return 'wf-draft';
      default:
        return 'wf-waiting';
    }
  }
}