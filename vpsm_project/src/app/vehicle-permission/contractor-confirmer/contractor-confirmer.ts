import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, of, forkJoin } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { CvpsService, CreateRequestDTO } from '../../services/cvps.service';
import { AuthService } from '../../core/auth.service';


interface CvpsRequestRecord {
    requestNo: number;
    contractorId: string;
    contractorName: string;
    departmentName: string;
    natureOfJob: string;
    vehicleNo: string;
    vehicleType: string;
    permissionTo: string;
    reqStatus: string;
    createdBy: string;
    createdDate: string;
    deptCode: number;
    employeeDetails?: Array<{
        id: number;
        empJob: string;
        empType: string;
        aadharNo?: string;
        name?: string;
    }>;
    vehicleDocuments?: Array<{
        id: number;
        requestNo: number;
        documentType: string;
        documentNo: string;
        validFrom: string;
        validTill: string;
        filename?: string;
    }>;
}

@Component({
    selector: 'app-contractor-confirmer',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './contractor-confirmer.html',
    styleUrl: './contractor-confirmer.css'
})
export class ContractorConfirmerComponent implements OnInit, OnDestroy {
    private cvps = inject(CvpsService);
    private auth = inject(AuthService);
    private destroy$ = new Subject<void>();
    private router = inject(Router);
    // Stores department names by department code for table display.
    private departmentNames = new Map<number, string>();
    private contractorNames = new Map<string, string>();
    // IT department requests must go only to IT confirmer.
    // Confirm IT Department Code from the Department dropdown/API.
    // Department codes — verify these values against getDepartments() response.
    private readonly IT_DEPARTMENT_CODE = 163;
    private readonly HRM_DEPARTMENT_CODE = 180;

    // Confirmer employee codes.
    private readonly IT_CONFIRMER_EMP_CODE = '636';
    private readonly HRM_CONFIRMER_EMP_CODE = '1832';
    // Signals for state management
    confirmerName = signal<string>('Confirmer Panel');
    pendingList = signal<CvpsRequestRecord[]>([]);
    isLoading = signal<boolean>(false);
    hasError = signal<boolean>(false);
    searchText = signal<string>('');

    // Pagination details
    currentPage = signal<number>(1);
    pageSize = 10;

    // Selection modal trackers
    selectedPass = signal<CvpsRequestRecord | null>(null);
    activeAction = signal<'modify' | 'reject' | null>(null);
    actionRemark = signal<string>('');
    isActing = signal<boolean>(false);
    actionSuccess = signal<string>('');
    actionError = signal<string>('');

    ngOnInit(): void {
        this.confirmerName.set(this.auth.empName() || 'Contractor Confirmer');

        // Load department code → name mapping before mapping queue rows.
        this.cvps.getDepartments()
            .pipe(
                takeUntil(this.destroy$),
                catchError(err => {
                    console.error('Failed to load department names:', err);
                    return of([]);
                })
            )
            .subscribe(departments => {
                this.departmentNames = new Map(
                    (departments || []).map(department => [
                        Number(department.deptCode),
                        String(department.deptName || '').trim()
                    ])
                );

                // Keep existing request fetching logic; only run it after
                // the display mapping is available.
                this.loadRequests();
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }
    private isRequestAssignedToCurrentConfirmer(
        request: CvpsRequestRecord
    ): boolean {
        const loggedInEmpCode = String(this.auth.empCode() || '').trim();

        // IT requests: only employee 636 can see and confirm them.
        if (request.deptCode === this.IT_DEPARTMENT_CODE) {
            return loggedInEmpCode === this.IT_CONFIRMER_EMP_CODE;
        }

        // HRM requests: only employee 1832 can see and confirm them.
        if (request.deptCode === this.HRM_DEPARTMENT_CODE) {
            return loggedInEmpCode === this.HRM_CONFIRMER_EMP_CODE;
        }

        // Preserve your current working default behavior:
        // all other non-IT/non-HRM requests remain with 1832.
        return loggedInEmpCode === this.HRM_CONFIRMER_EMP_CODE;
    }

    loadRequests(): void {
        this.isLoading.set(true);
        this.hasError.set(false);

        this.cvps.getAllRequests()
            .pipe(
                takeUntil(this.destroy$),
                catchError((err: any) => {
                    console.error('Error loading confirmer queue:', err);
                    this.hasError.set(true);
                    this.isLoading.set(false);
                    return of([] as CreateRequestDTO[]);
                })
            )
            .subscribe((list: CreateRequestDTO[]) => {
                const mapped = (list || [])
                    .map(dto => this.mapDtoToRecord(dto))
                    .filter(r => (r.reqStatus || '').toUpperCase() === 'SUBMITTED')
                    .filter(r => this.isRequestAssignedToCurrentConfirmer(r))
                    .sort((a, b) => b.requestNo - a.requestNo);

                this.loadMissingContractorNames(mapped);
            });
    }
    private loadMissingContractorNames(
        records: CvpsRequestRecord[]
    ): void {
        const contractorCodes = Array.from(
            new Set(
                records
                    .map(record => String(record.contractorId || '').trim().toUpperCase())
                    .filter(Boolean)
            )
        );

        const codesToLoad = contractorCodes.filter(
            code => !this.contractorNames.has(code)
        );

        if (codesToLoad.length === 0) {
            this.applyContractorNames(records);
            return;
        }

        forkJoin(
            codesToLoad.map(code =>
                this.cvps.fetchContractorDetails(code).pipe(
                    catchError(err => {
                        console.error(
                            `Failed to fetch contractor details for ${code}:`,
                            err
                        );

                        return of(null);
                    })
                )
            )
        )
            .pipe(takeUntil(this.destroy$))
            .subscribe(results => {
                results.forEach((result: any, index: number) => {
                    const code = codesToLoad[index];

                    const contractorName = String(
                        result?.contractorName ||
                        result?.name ||
                        result?.contractor_name ||
                        result?.vendorName ||
                        result?.bpName ||
                        ''
                    ).trim();

                    if (contractorName) {
                        this.contractorNames.set(code, contractorName);
                    }
                });

                this.applyContractorNames(records);
            });
    }
    private applyContractorNames(
        records: CvpsRequestRecord[]
    ): void {
        const enrichedRecords = records.map(record => {
            const contractorCode = String(
                record.contractorId || ''
            ).trim().toUpperCase();

            return {
                ...record,
                contractorName:
                    record.contractorName ||
                    this.contractorNames.get(contractorCode) ||
                    ''
            };
        });

        console.log('Enriched confirmer queue:', enrichedRecords);

        this.pendingList.set(enrichedRecords);
        this.isLoading.set(false);
    }
    private mapDtoToRecord(dto: CreateRequestDTO): CvpsRequestRecord {
        // Cast to 'any' so we can safely read display-only fields that may
        // or may not exist in the backend response without TS errors.
        const req = (dto.request || {}) as any;

        const deptCode = Number(req.deptCode || 0);

        const contractorName = String(
            req.contractorName ||
            req.contractorNameDisplay ||
            req.bpName ||
            req.vendorName ||
            (dto as any)?.contractorName ||
            ''
        ).trim();

        return {
            requestNo: Number(req.requestNo || 0),
            contractorId: req.contractorId || '',
            contractorName,
            departmentName: this.departmentNames.get(deptCode) || '',
            natureOfJob: req.natureOfJob || '',
            vehicleNo: req.vehicleNo || '',
            vehicleType: req.vehicleType || '',
            permissionTo: req.permissionTo || '',
            deptCode,
            reqStatus: (req.reqStatus || '').toUpperCase(),
            createdBy: req.createdBy || '',
            createdDate: req.createdDate || '',
            employeeDetails: (dto.employees || []).map((emp: any) => ({
                id: emp.empNo || 0,
                empJob: emp.empJob || emp.empType || '',
                empType: emp.empType || '',
                name: emp.name || '',
                mobileNo: emp.mobileNo || '',
                aadharNo: (emp.documents || []).find((d: any) =>
                    ['AADHAAR', 'AADHAR', 'ADHAR', 'AADHAAR_CARD'].includes(
                        String(d.documentType || '').trim().toUpperCase().replace(/\s+/g, '_')
                    )
                )?.documentNo || ''
            })),
            vehicleDocuments: (dto.vehicleDocuments || []).map((doc: any) => ({
                id: doc.id,
                requestNo: Number(req.requestNo || 0),
                documentType: doc.documentType || '',
                documentNo: doc.documentNo || '',
                validFrom: doc.validFrom || '',
                validTill: doc.validTill || '',
                filename: doc.filename || doc.fileName || doc.documentName || ''
            }))
        };
    }
    getContractorDisplay(record: CvpsRequestRecord): string {
        const contractorName = record.contractorName || '-';
        const contractorCode = record.contractorId || '-';

        return `${contractorName} (${contractorCode})`;
    }

    getDepartmentDisplay(record: CvpsRequestRecord): string {
        const departmentName = record.departmentName || '-';
        const departmentCode = record.deptCode || '-';

        return `${departmentName} (${departmentCode})`;
    }
    // Live client-side keyword criteria filtering signal rules
    filteredList = computed(() => {
        const q = this.searchText().trim().toLowerCase();
        const raw = this.pendingList();
        if (!q) return raw;

        return raw.filter(r =>
            r.requestNo.toString().includes(q) ||
            r.contractorId.toLowerCase().includes(q) ||
            r.vehicleNo.toLowerCase().includes(q) ||
            r.natureOfJob.toLowerCase().includes(q)
        );
    });

    // Pagination data splice window computations
    pagedList = computed(() => {
        const idx = (this.currentPage() - 1) * this.pageSize;
        return this.filteredList().slice(idx, idx + this.pageSize);
    });

    get totalPages(): number {
        return Math.max(1, Math.ceil(this.filteredList().length / this.pageSize));
    }

    get totalPagesArr(): number[] {
        return Array.from({ length: this.totalPages }, (_, i) => i + 1);
    }

    onSearch(v: string): void {
        this.searchText.set(v);
        this.currentPage.set(1);
    }

    goToPage(p: number): void {
        if (p >= 1 && p <= this.totalPages) {
            this.currentPage.set(p);
        }
    }

    openDetails(p: CvpsRequestRecord): void {
        this.router.navigate(['/vehicle-permission/form'], {
            queryParams: {
                edit: p.requestNo,
                mode: 'confirmer'
            }
        });
    }

    closeDetails(): void {
        if (!this.isActing()) {
            this.selectedPass.set(null);
        }
    }

    setAction(type: 'modify' | 'reject'): void {
        this.activeAction.set(type);
        this.actionError.set('');
    }

    confirm(p: CvpsRequestRecord): void {
        if (!this.actionRemark().trim()) {
            this.actionError.set('⚠️ Review action remark is required to confirm.');
            return;
        }
        this.submitAction(p.requestNo, 'CONFIRM');
    }

    sendForModify(p: CvpsRequestRecord): void {
        if (!this.actionRemark().trim()) {
            this.actionError.set('⚠️ Please state modification requirements in the remarks.');
            return;
        }
        this.submitAction(p.requestNo, 'HOLD'); // 'HOLD' sends back to Uploader state queues
    }

    reject(p: CvpsRequestRecord): void {
        if (!this.actionRemark().trim()) {
            this.actionError.set('⚠️ Explicit rejection justification comment is mandatory.');
            return;
        }
        this.submitAction(p.requestNo, 'REJECT');
    }

    private submitAction(requestNo: number, targetAction: string): void {
        this.isActing.set(true);
        this.actionError.set('');
        this.actionSuccess.set('');

        const payload = {
            action: targetAction as 'CONFIRM' | 'APPROVE' | 'REJECT' | 'HOLD',
            empNo: this.auth.empCode() || 'SYSTEM',
            remarks: this.actionRemark().trim()
        };

        this.cvps.executeWorkflowAction(requestNo, payload)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.actionSuccess.set(`Request ${requestNo} processed as ${targetAction}.`);
                    this.isActing.set(false);
                    this.loadRequests();
                    setTimeout(() => this.closeDetails(), 1500);
                },
                error: (err: any) => {
                    this.actionError.set(err?.error?.message || 'Workflow execution error encountered.');
                    this.isActing.set(false);
                }
            });
    }

    getDriverName(r: CvpsRequestRecord): string {
        const driver = r.employeeDetails?.find(e => e.empJob?.toUpperCase() === 'DRIVER');
        return driver ? driver.name || '—' : '—';
    }

    getDriverAadhar(r: CvpsRequestRecord): string {
        const driver = r.employeeDetails?.find(e => e.empJob?.toUpperCase() === 'DRIVER');
        return driver ? driver.aadharNo || '—' : '—';
    }

    formatDate(d: string | undefined): string {
        if (!d || d.length < 10) return d ?? '—';
        const cleanDate = d.split('T')[0];
        const [y, m, day] = cleanDate.split('-');
        return `${day}/${m}/${y}`;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🟢 ADDED: Unified Document Download Handler for Confirmer Dashboard
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    downloadDoc(filename: string | undefined, downloadName: string): void {
        if (!filename) {
            this.actionError.set('File name is missing for this document.');
            return;
        }

        this.actionError.set('');

        this.cvps.downloadDocument(filename).pipe(
            takeUntil(this.destroy$),
            catchError((err: any) => {
                console.error('File streaming failed:', err);
                this.actionError.set('Could not fetch the attachment binary from storage.');
                return of<Blob | null>(null);
            })
        ).subscribe((blob: Blob | null) => {
            if (blob) {
                this.cvps.triggerBlobDownload(blob, downloadName || filename);
            }
        });
    }
}