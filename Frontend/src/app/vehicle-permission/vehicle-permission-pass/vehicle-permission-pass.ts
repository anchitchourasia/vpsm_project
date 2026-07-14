import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
    CvpsService,
    CreateRequestDTO,
    EmployeeDTO,
    EmployeeDocumentDTO,
    VehicleDocumentDTO,
    RequestHistoryDTO,
} from '../../services/cvps.service';

@Component({
    selector: 'app-vehicle-permission-pass',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './vehicle-permission-pass.html',
    styleUrl: './vehicle-permission-pass.css'
})
export class VehiclePermissionPassComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    cvps = inject(CvpsService);

    private destroy$ = new Subject<void>();

    readonly formNo = 'W-OHS-SECURITY-12';
    readonly companyName = 'HEG Limited, Mandideep';

    loading = signal(false);
    errorMsg = signal('');
    requestNo = signal<number | null>(null);
    dto = signal<CreateRequestDTO | null>(null);
    contractorName = signal('');
    status = signal<string>('Draft');

    readonly request = computed(() => this.dto()?.request ?? null);
    readonly vehicleDocuments = computed(() => this.dto()?.vehicleDocuments ?? []);
    readonly employees = computed(() => this.dto()?.employees ?? []);

    readonly passEmployees = computed(() =>
        (this.dto()?.employees ?? []).map((employee: any) => {
            const dlDoc = this.findEmployeeDocument(employee, 'DRIVINGLICENSE');
            const aadhaarDoc = this.findEmployeeDocument(employee, 'AADHAAR');

            return {
                ...employee,
                _aadhaarNo: String(
                    aadhaarDoc?.documentNo ||
                    employee?.aadhaarNo ||
                    ''
                ).trim(),
                _licenseNo: String(
                    dlDoc?.documentNo ||
                    employee?.licenseNo ||
                    employee?.licenseNumber ||
                    ''
                ).trim(),
                _licenseValidTill: String(
                    dlDoc?.validTill ||
                    employee?.validTill ||
                    employee?.validTo ||
                    ''
                ).trim()
            };
        })
    );

    ngOnInit(): void {
        this.route.queryParams
            .pipe(takeUntil(this.destroy$))
            .subscribe(params => {
                const id = Number(params['requestNo']);

                if (!id || Number.isNaN(id)) {
                    this.errorMsg.set('Invalid request number.');
                    return;
                }

                this.requestNo.set(id);
                this.loadPass(id);
                window.removeEventListener('beforeprint', () => { });
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        window.removeEventListener('beforeprint', () => { });
    }

    private loadPass(requestNo: number): void {
        this.loading.set(true);
        this.errorMsg.set('');

        this.cvps.getRequestById(requestNo)
            .pipe(
                takeUntil(this.destroy$),
                catchError(err => {
                    this.errorMsg.set(
                        err?.error?.message ||
                        err?.message ||
                        'Unable to load pass details.'
                    );
                    return of(null);
                }),
                finalize(() => this.loading.set(false))
            )
            .subscribe(dto => {
                if (!dto || !dto.request) {
                    this.errorMsg.set('No request data found.');
                    return;
                }

                const normalizedEmployees = this.mapPassEmployees(dto.employees ?? []);

                const normalizedDto: CreateRequestDTO = {
                    ...dto,
                    employees: normalizedEmployees
                };

                console.log('PASS DTO FULL:', normalizedDto);
                console.log('PASS EMPLOYEES NORMALIZED:', normalizedEmployees);
                console.log(
                    'PASS EMPLOYEE DOCUMENTS:',
                    normalizedEmployees.map((e: any) => ({
                        name: e?.name,
                        empJob: e?.empJob,
                        aadhaarNo: e?.aadhaarNo,
                        licenseNo: e?.licenseNo,
                        validTo: e?.validTo,
                        documents: e?.documents
                    }))
                );

                this.dto.set(normalizedDto);

                this.status.set(dto.request?.reqStatus || 'Draft');
                if (dto.request?.reqStatus) {
                    this.status.set(String(dto.request.reqStatus));
                }

                const contractorId = (dto.request.contractorId || '').trim().toUpperCase();
                if (contractorId) {
                    this.resolveContractorName(contractorId);
                }
            });
    }

    private mapPassEmployees(employees: EmployeeDTO[] | null | undefined): any[] {
        return (employees ?? []).map((employee: any) => {
            const docs = Array.isArray(employee?.documents) ? employee.documents : [];

            const aadhaarDoc =
                docs.find((doc: any) => this.isAadhaarDoc(doc?.documentType)) ?? null;

            const dlDoc =
                docs.find((doc: any) => this.isDlDoc(doc?.documentType)) ?? null;

            const photoDoc =
                docs.find((doc: any) => this.isPhotoDoc(doc?.documentType)) ?? null;

            return {
                ...employee,
                documents: docs,
                aadhaarNo: String(
                    aadhaarDoc?.documentNo ||
                    employee?.aadhaarNo ||
                    ''
                ).trim(),
                licenseNo: String(
                    dlDoc?.documentNo ||
                    employee?.licenseNo ||
                    employee?.licenseNumber ||
                    ''
                ).trim(),
                licenseNumber: String(
                    dlDoc?.documentNo ||
                    employee?.licenseNumber ||
                    employee?.licenseNo ||
                    ''
                ).trim(),
                validFrom: String(
                    dlDoc?.validFrom ||
                    employee?.validFrom ||
                    ''
                ).trim(),
                validTo: String(
                    dlDoc?.validTill ||
                    employee?.validTo ||
                    employee?.validTill ||
                    ''
                ).trim(),
                photoFileName: String(
                    photoDoc?.filename ||
                    photoDoc?.fileName ||
                    photoDoc?.documentName ||
                    photoDoc?.documentPath ||
                    ''
                ).trim()
            };
        });
    }

    private resolveContractorName(contractorCode: string): void {
        this.cvps.fetchContractorDetails()
            .pipe(
                takeUntil(this.destroy$),
                catchError(() => {
                    this.contractorName.set('');
                    return of([]);
                })
            )
            .subscribe((rows: any[]) => {
                if (!rows?.length) {
                    this.contractorName.set('');
                    return;
                }

                const match = rows.find(r =>
                    String(r?.contractorCode || '').trim().toUpperCase() === contractorCode.trim().toUpperCase()
                );

                this.contractorName.set(match?.name ? String(match.name).toUpperCase() : '');
            });
    }

    formatDate(value: string | null | undefined): string {
        if (!value) return '-';
        return String(value).split('T')[0];
    }

    formatDateForInput(value: string | null | undefined): string {
        if (!value) return '';
        return String(value).split('T')[0];
    }

    shortName(name: string | null | undefined): string {
        if (!name) return '-';
        return name.length > 18 ? `${name.substring(0, 15)}...` : name;
    }

    normalizeDocType(value: string | null | undefined): string {
        return (value || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '')
            .replace(/_/g, '');
    }

    private isAadhaarDoc(value: string | null | undefined): boolean {
        const type = this.normalizeDocType(value);
        return ['AADHAAR', 'AADHAR', 'ADHAR', 'AADHAARCARD'].includes(type);
    }

    private isDlDoc(value: string | null | undefined): boolean {
        const type = this.normalizeDocType(value);
        return ['DL', 'LICENSE', 'DRIVINGLICENSE'].includes(type);
    }

    private isPhotoDoc(value: string | null | undefined): boolean {
        const type = this.normalizeDocType(value);
        return ['PHOTO', 'DRIVERPHOTO', 'PHOTOGRAPH'].includes(type);
    }

    private getDaysDiff(dateStr: string | null | undefined): number | null {
        if (!dateStr) return null;

        const target = new Date(dateStr);
        if (isNaN(target.getTime())) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        target.setHours(0, 0, 0, 0);

        const diffMs = target.getTime() - today.getTime();
        return Math.round(diffMs / (1000 * 60 * 60 * 24));
    }

    getRemarkClass(dateStr: string | null | undefined): string {
        const days = this.getDaysDiff(dateStr);
        if (days === null) return '';
        if (days < 0) return 'remark-expired';
        if (days <= 30) return 'remark-expiring';
        return 'remark-valid';
    }

    getRemarkText(dateStr: string | null | undefined): string {
        const days = this.getDaysDiff(dateStr);
        if (days === null) return '-';
        if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
        if (days === 0) return 'Expires today';
        if (days <= 30) return `Expires in ${days} day${days === 1 ? '' : 's'}`;
        return 'Valid';
    }

    private findEmployeeDocument(
        employee: EmployeeDTO | null | undefined,
        kind: 'AADHAAR' | 'DRIVINGLICENSE' | 'PHOTO'
    ): EmployeeDocumentDTO | null {
        const docs = Array.isArray(employee?.documents) ? employee!.documents : [];

        if (!docs.length) {
            return null;
        }

        return docs.find((doc: any) => {
            const docType = doc?.documentType;
            if (kind === 'AADHAAR') return this.isAadhaarDoc(docType);
            if (kind === 'DRIVINGLICENSE') return this.isDlDoc(docType);
            return this.isPhotoDoc(docType);
        }) ?? null;
    }

    getEmployeeDocNo(employee: any, kind: 'AADHAAR' | 'DRIVINGLICENSE'): string {
        const doc = this.findEmployeeDocument(employee, kind);

        if (doc?.documentNo) {
            return String(doc.documentNo).trim() || '-';
        }

        if (kind === 'AADHAAR') {
            return String(employee?.aadhaarNo || '').trim() || '-';
        }

        return String(employee?.licenseNo || employee?.licenseNumber || '').trim() || '-';
    }

    getEmployeeDocFile(employee: EmployeeDTO | null | undefined, kind: 'AADHAAR' | 'DRIVINGLICENSE'): string | null {
        const doc = this.findEmployeeDocument(employee, kind) as any;
        return doc?.filename || doc?.fileName || doc?.documentName || doc?.documentPath || null;
    }

    getEmployeeDocValidFrom(employee: EmployeeDTO | null | undefined, kind: 'DRIVINGLICENSE'): string {
        const doc = this.findEmployeeDocument(employee, kind) as any;
        return doc?.validFrom || '';
    }

    getEmployeeDocValidTill(employee: any, kind: 'DRIVINGLICENSE'): string {
        const doc = this.findEmployeeDocument(employee, kind);

        if (doc?.validTill) {
            return String(doc.validTill).trim();
        }

        return String(employee?.validTill || employee?.validTo || '').trim();
    }

    getEmployeePhotoFile(employee: EmployeeDTO | null | undefined): string | null {
        const doc = this.findEmployeeDocument(employee, 'PHOTO') as any;
        return doc?.filename || doc?.fileName || doc?.documentName || doc?.documentPath || null;
    }

    getStatusClass(status: string): string {
        const normalized = (status || '').trim().toUpperCase();

        switch (normalized) {
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

    goBack(): void {
        this.router.navigate(['/vehicle-permission/list']);
    }
    
    printPass(): void {
        window.print();
    }
}