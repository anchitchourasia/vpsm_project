import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import {
  CvpsService,
  CreateRequestDTO,
  ApiResponse,
} from '../../services/cvps.service';

import { environment } from '../../../environments/environment';


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
  photoExistingFile?: string;
  aadhaarDocumentId?: number;
  dlDocumentId?: number;
  photoDocumentId?: number;// <-- ADD THIS
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
    photoExistingFile: '',
    aadhaarDocumentId: undefined,
    dlDocumentId: undefined,
    photoDocumentId: undefined,
  };
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
  editingMode = signal(false);
  contractorCode = signal('');
  contractorName = signal('');
  reqDate = signal(new Date().toISOString().split('T')[0]);
  natureOfJob = signal('');
  permissionDateFrom = signal('');
  permissionDateTo = signal('');

  vehicleNumber = signal('');
  vehicleType = signal('');

  readonly vehicleTypeOptions = [
    { label: 'Two Wheeler', value: 'TWO_WHEEL' },
    { label: 'Four Wheeler', value: 'FOUR_WHEEL' },
    { label: 'Heavy Vehicle', value: 'HEAVY' },
    { label: 'Tractor', value: 'TRACTOR' },
    { label: 'Crane', value: 'CRANE' },
    { label: 'JCB', value: 'JCB' },
    { label: 'Fork Lift', value: 'FORKLIFT' },
    { label: 'Other', value: 'OTHER' }
  ];
  readonly driverRoleOptions = ['Driver', 'Conductor', 'Helper', 'Other'];
  readonly jobTypeOptions = ['Helper', 'Supervisor', 'Technician', 'Laborer', 'Other'];
  readonly ALLOWED_DOC_TYPES = ALLOWED_DOC_TYPES;

  docs = signal<DocEntry[]>([]);
  drivers = signal<DriverPerson[]>([emptyDriver()]);


  isSaving = signal(false);
  isSubmitting = signal(false);
  saveMsg = signal('');
  errorMsg = signal('');
  savedRequestNo = signal<number | null>(null);

  ngOnInit(): void {

    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {

         const editId = params['edit'];

         if (!editId) {
           return;
         }

         const requestNo = Number(editId);
        // const requestNo = 1;

        this.loadRequest(requestNo);


        this.editingMode.set(true);

        this.savedRequestNo.set(requestNo);

        this.loadRequest(requestNo);

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
  getDocumentUrl(fileName: string): string {

    return `${environment.cvpsBaseUrl}/api/documents/download/${fileName}`;

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

  onDriverAadhaarFile(event: Event, driver: DriverPerson): void {

    const file = (event.target as HTMLInputElement).files?.[0];

    if (!file) {
      return;
    }

    this.drivers.update(list =>
      list.map(d =>
        d.id === driver.id
          ? {
            ...d,
            aadhaarFile: file,
            aadhaarFileName: file.name,
            aadhaarExistingFile: ''

          } : d
      )
    );

  }

  onDriverDlFile(event: Event, driver: DriverPerson): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.drivers.update(list =>
      list.map(d =>
        d.id === driver.id
          ? {
            ...d,
            dlFile: file,
            dlFileName: file.name,
            dlExistingFile: ''
          }
          : d
      )
    );
  }

  onDriverPhotoFile(event: Event, driver: DriverPerson): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.drivers.update(list =>
      list.map(d =>
        d.id === driver.id
          ? {
            ...d,
            photoFile: file,
            photoFileName: file.name,
            photoExistingFile: ''
          }
          : d
      )
    );
  }








  onContractorCodeChange(typedCode: string): void {
    const cleanCode = typedCode.trim().toUpperCase();
    this.contractorCode.set(cleanCode);
    this.contractorName.set('');
    this.errorMsg.set('');
    if (!cleanCode) return;

    this.resolveContractorName(cleanCode);
  }
  private loadRequest(
    requestNo: number
  ): void {
    console.log('Loading Request:', requestNo);

    this.cvps.getRequestById(requestNo)
      .pipe(takeUntil(this.destroy$))
      .subscribe({

        next: dto => {
          console.log('API RESPONSE:', dto);

          this.fillForm(dto);

        },

        error: err => {
          console.error('API ERROR:', err);

          this.errorMsg.set(
            err?.error?.message ||
            'Unable to load request'
          );

        }

      });

  }
  private fillForm(
    dto: CreateRequestDTO
  ): void {

    const req = dto.request;
    this.docs.set(

      dto.vehicleDocuments.map(doc => ({

        id: crypto.randomUUID(),
        docType: doc.documentType,
        docNo: doc.documentNo,
        validUpto: doc.validTill || '',
        file: null,
        documentId: doc.id,
        existingFile: doc.filename ?? undefined
      }))

    );
    this.drivers.set(

      dto.employees.map(emp => {
        const photoDoc = emp.documents?.find(
          d => d.documentType === 'PHOTO'
        );

        const aadhaarDoc = emp.documents?.find(
          d => d.documentType === 'AADHAAR'
        );

        const dlDoc = emp.documents?.find(
          d => d.documentType === 'DRIVING_LICENSE'
        );


        return {

          id: crypto.randomUUID(),

          role: emp.empJob,

          name: emp.name,

          mobileNo: emp.mobileNo || '',

          aadhaarNo: aadhaarDoc?.documentNo || '',

          licenseNo: dlDoc?.documentNo || '',

          licenseType: '',

          validFrom: dlDoc?.validFrom || '',

          validTo: dlDoc?.validTill || '',

          aadhaarFile: null,

          aadhaarFileName: '',

          aadhaarExistingFile:
            aadhaarDoc?.filename || '',

          dlFile: null,

          dlFileName: '',

          dlExistingFile:
            dlDoc?.filename || '',

          photoFile: null,

          photoFileName: '',
          photoExistingFile:
            photoDoc?.filename || '',
          aadhaarDocumentId: aadhaarDoc?.id,
          dlDocumentId: dlDoc?.id,
          photoDocumentId: photoDoc?.id,

        };

      })

    );

    const contractorId = (req.contractorId || '').trim().toUpperCase();

    this.contractorCode.set(contractorId);
    this.contractorName.set('');

    if (contractorId) {
      this.resolveContractorName(contractorId);
    }

    this.natureOfJob.set(
      req.natureOfJob || ''
    );

    this.vehicleNumber.set(
      req.vehicleNo || ''
    );

    this.vehicleType.set(
      req.vehicleType || ''
    );

    this.permissionDateFrom.set(
      req.permissionFrom || ''
    );

    this.permissionDateTo.set(
      req.permissionTo || ''
    );

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
        r => r.contractorCode && String(r.contractorCode).trim().toUpperCase() === contractorCode.trim().toUpperCase()
      );

      if (match) {
        this.contractorName.set(String(match.name || '').toUpperCase());
        this.errorMsg.set('');
      } else {
        this.contractorName.set('');
      }
    });
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




  private buildCreatePayload(): CreateRequestDTO {

    return {

      request: {

        contractorId: this.contractorCode().trim().toUpperCase(),

        natureOfJob: this.natureOfJob().trim(),

        vehicleNo: this.vehicleNumber().trim().toUpperCase(),

        vehicleType: this.vehicleType(),

        permissionFrom: this.permissionDateFrom(),

        permissionTo: this.permissionDateTo(),

        createdBy:
          (this.auth.empCode() || 'SYSTEM')
            .substring(0, 9)
            .toUpperCase()

      },

      vehicleDocuments: this.docs().map(doc => ({

        id: doc.documentId,

        documentType: doc.docType,

        documentNo: doc.docNo,

        filename:
          doc.file?.name ||
          doc.existingFile ||
          '',

        validFrom: this.reqDate(),

        validTill: doc.validUpto

      })),

      employees: this.drivers().map(driver => {
        const role = (driver.role || '').trim();
        const isDriver = role.toUpperCase() === 'DRIVER';
        const documents: any[] = [];

        if (driver.aadhaarNo?.trim()) {
          documents.push({
            id: driver.aadhaarDocumentId,
            documentType: 'AADHAAR',
            documentNo: driver.aadhaarNo.trim(),
            filename: driver.aadhaarFile?.name || driver.aadhaarExistingFile || '',
            validFrom: this.reqDate(),
            validTill: null
          });
        }

        if (isDriver && driver.licenseNo?.trim()) {
          documents.push({
            id: driver.dlDocumentId,
            documentType: 'DRIVING_LICENSE',
            documentNo: driver.licenseNo.trim(),
            filename: driver.dlFile?.name || driver.dlExistingFile || '',
            validFrom: driver.validFrom || null,
            validTill: driver.validTo || null
          });
        }
        if (driver.photoFile || driver.photoExistingFile) {
          documents.push({
            id: driver.photoDocumentId,
            documentType: 'PHOTO',
            documentNo: '',
            filename: driver.photoFile?.name || driver.photoExistingFile || '',
            validFrom: this.reqDate(),
            validTill: null
          });
        }


        return {
          empNo: null,
          name: driver.name.trim(),
          mobileNo: driver.mobileNo.trim(),
          empType: role,
          empJob: role,
          documents
        };
      })
    };

  }


  private collectFiles(): File[] {
    const files: File[] = [];

    this.docs().forEach(doc => {
      if (doc.file) {
        files.push(doc.file);
      }
    });

    this.drivers().forEach(driver => {
      const role = (driver.role || '').trim();
      const isDriver = role.toUpperCase() === 'DRIVER';

      if (driver.aadhaarFile) {
        files.push(driver.aadhaarFile);
      }

      if (isDriver && driver.dlFile) {
        files.push(driver.dlFile);
      }
      if (driver.photoFile) {
        files.push(driver.photoFile);
      }
    });

    return files;
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
      const payload = this.buildCreatePayload();
      const files = this.collectFiles();

      this.cvps.updateRequest(activeId, payload, files).pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.errorMsg.set(
            err?.error?.message ||
            err?.message ||
            'Request update failed'
          );
          return of(null);
        }),
        finalize(() => {
          this.isSubmitting.set(false);
          this.isSaving.set(false);
        })
      ).subscribe((response: ApiResponse | null) => {
        if (!response) {
          return;
        }

        this.savedRequestNo.set(response.requestNo);

        if (targetStatus === 'SAVED') {
          this.status.set('Saved');
          this.saveMsg.set('✅ Form updated successfully!');
        } else {
          this.status.set('Submitted');
          this.saveMsg.set('✅ Permission request updated successfully!');
        }

        setTimeout(() => {
          this.saveMsg.set('');
          this.router.navigate(['/vehicle-permission/list']);
        }, 2000);
      });

      return;
    }

    const payload = this.buildCreatePayload();

    const files = this.collectFiles();

    this.cvps.createRequest(payload, files).pipe(

      takeUntil(this.destroy$),

      catchError(err => {

        this.errorMsg.set(
          err?.error?.message ||
          err?.message ||
          'Request creation failed'
        );

        return of(null);

      }),

      finalize(() => {

        this.isSaving.set(false);

        this.isSubmitting.set(false);

      })

    ).subscribe((response: ApiResponse | null) => {

      if (!response) {
        return;
      }

      this.savedRequestNo.set(
        response.requestNo
      );

      this.status.set('Submitted');

      this.saveMsg.set(
        '✅ Request submitted successfully'
      );

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

  getStatusClass(status: string): string {
    switch ((status || '').trim().toUpperCase()) {
      case 'SUBMITTED':
      case 'CREATED':
        return 'wf-submitted';

      case 'CONFIRMED':
      case 'PENDING':
        return 'wf-pending';

      case 'WAITING':
        return 'wf-waiting';

      case 'VERIFIED':
        return 'wf-verified';

      case 'APPROVED':
        return 'wf-approved';

      case 'REJECTED':
        return 'wf-rejected';

      case 'HOLD':
      case 'MODIFY':
      case 'MODIFIED':
      case 'NEED MODIFICATION':
        return 'wf-hold';

      case 'SAVED':
      case 'DRAFT':
        return 'wf-draft';

      default:
        return 'wf-waiting';
    }
  }
}