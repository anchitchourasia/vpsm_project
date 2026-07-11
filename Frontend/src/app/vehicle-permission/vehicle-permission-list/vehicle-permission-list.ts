import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { CvpsService, CreateRequestDTO } from '../../services/cvps.service';

interface VehiclePermissionRow {
    requestNo: number;
    contractorCode: string;
    vehicleNo: string;
    vehicleType: string;
    natureOfJob: string;
    permissionFrom: string;
    permissionTo: string;
    reqStatus: string;
    createdBy: string;
    createdDate: string;
    personnelCount: number;
    vehicleDocumentCount: number;
}

@Component({
    selector: 'app-vehicle-permission-list',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './vehicle-permission-list.html',
    styleUrl: './vehicle-permission-list.css',
})
export class VehiclePermissionListComponent implements OnInit, OnDestroy {
    private router = inject(Router);
    private cvps = inject(CvpsService);
    private destroy$ = new Subject<void>();

    rows = signal<VehiclePermissionRow[]>([]);
    loading = signal(false);
    deletingId = signal<number | null>(null);
    errorMsg = signal('');
    successMsg = signal('');

    searchText = signal('');
    statusFilter = signal('ALL');

    readonly statusOptions = [
        'ALL',
        'SAVED',
        'CREATED',
        'CONFIRMED',
        'APPROVED',
        'REJECTED',
        'HOLD',
        'MODIFY',
        'SUBMITTED'
    ];

    filteredRows = computed(() => {
        const search = this.searchText().trim().toLowerCase();
        const status = this.statusFilter().trim().toUpperCase();

        return this.rows().filter(row => {
            const rowStatus = (row.reqStatus || '').trim().toUpperCase();

            const matchesStatus =
                status === 'ALL' ||
                rowStatus === status;
                

            const matchesSearch =
                !search ||
                String(row.requestNo).includes(search) ||
                (row.contractorCode || '').toLowerCase().includes(search) ||
                (row.vehicleNo || '').toLowerCase().includes(search) ||
                (row.vehicleType || '').toLowerCase().includes(search) ||
                (row.natureOfJob || '').toLowerCase().includes(search) ||
                (row.createdBy || '').toLowerCase().includes(search);

            return matchesStatus && matchesSearch;
        });
    });

    ngOnInit(): void {
        this.loadRequests();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    loadRequests(): void {
        this.loading.set(true);
        this.errorMsg.set('');
        this.successMsg.set('');

        this.cvps.getAllRequests()
            .pipe(
                takeUntil(this.destroy$),
                catchError(err => {
                    this.errorMsg.set(
                        err?.error?.message ||
                        err?.message ||
                        'Unable to load vehicle permission requests.'
                    );
                    return of([]);
                }),
                finalize(() => this.loading.set(false))
            )
            .subscribe((list: CreateRequestDTO[]) => {
                console.log('CVPS LIST API:', list);

                this.rows.set(
                    (list || []).map(dto => this.mapToRow(dto))
                        .sort((a, b) => b.requestNo - a.requestNo)
                );
            });
    }

    private mapToRow(dto: CreateRequestDTO): VehiclePermissionRow {
        const req = dto.request || ({} as CreateRequestDTO['request']);

        return {
            requestNo: Number(req.requestNo || 0),
            contractorCode: req.contractorId || '',
            vehicleNo: req.vehicleNo || '',
            vehicleType: req.vehicleType || '',
            natureOfJob: req.natureOfJob || '',
            permissionFrom: this.formatDate(req.permissionFrom),
            permissionTo: this.formatDate(req.permissionTo),
            reqStatus: this.normalizeRequestStatus(req.reqStatus),
            createdBy: req.createdBy || '',
            createdDate: this.formatDate(req.createdDate),
            personnelCount: dto.employees?.length || 0,
            vehicleDocumentCount: dto.vehicleDocuments?.length || 0,
        };
    }

    private formatDate(value: string | null | undefined): string {
        if (!value) return '';
        return String(value).split('T')[0];
    }

    private normalizeRequestStatus(status: string | null | undefined): string {
        const normalized = (status || '').trim().toUpperCase();

        switch (normalized) {
            case 'DRAFT':
                return 'SAVED';
            case 'MODIFY':
                return 'MODIFY';
            case 'CREATED':
                return 'SUBMITTED';
            default:
                return normalized;
        }
    }

    onSearchChange(value: string): void {
        this.searchText.set(value);
    }

    onStatusChange(value: string): void {
        this.statusFilter.set(value);
    }

    createNew(): void {
        this.router.navigate(['/vehicle-permission/form']);
    }

    editRequest(row: VehiclePermissionRow): void {
        this.router.navigate(
            ['/vehicle-permission/form'],
            { queryParams: { edit: row.requestNo } }
        );
    }

    canEdit(status: string): boolean {
        const normalized = (status || '').trim().toUpperCase();
        return normalized === 'SAVED' || normalized === 'MODIFY';
    }
    

    deleteRequest(row: VehiclePermissionRow): void {
        if (!row.requestNo) {
            return;
        }

        const confirmed = window.confirm(
            `Delete request #${row.requestNo} for vehicle ${row.vehicleNo}?`
        );

        if (!confirmed) {
            return;
        }

        this.deletingId.set(row.requestNo);
        this.errorMsg.set('');
        this.successMsg.set('');

        this.cvps.deleteRequest(row.requestNo)
            .pipe(
                takeUntil(this.destroy$),
                catchError(err => {
                    this.errorMsg.set(
                        err?.error?.message ||
                        err?.message ||
                        'Delete request failed.'
                    );
                    return of(null);
                }),
                finalize(() => this.deletingId.set(null))
            )
            .subscribe(response => {
                if (!response) {
                    return;
                }

                this.rows.update(list =>
                    list.filter(item => item.requestNo !== row.requestNo)
                );

                this.successMsg.set(response.message || 'Request deleted successfully.');
            });
    }

    refresh(): void {
        this.loadRequests();
    }

    clearFilters(): void {
        this.searchText.set('');
        this.statusFilter.set('ALL');
    }

    getStatusClass(status: string): string {
        switch (this.normalizeRequestStatus(status)) {
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
            case 'NEED MODIFICATION':
                return 'wf-hold';

            case 'SAVED':
            case 'DRAFT':
                return 'wf-draft';

            default:
                return 'wf-waiting';
        }
    }

    getStatusLabel(status: string): string {
        switch (this.normalizeRequestStatus(status)) {
            case 'CREATED':
            case 'SUBMITTED':
                return 'Submitted';
            case 'SAVED':
                return 'Saved';
            case 'CONFIRMED':
                return 'Confirmed';
            case 'APPROVED':
                return 'Approved';
            case 'REJECTED':
                return 'Rejected';
            case 'HOLD':
                return 'Hold';
            case 'MODIFY':
                return 'MODIFY';
            default:
                return status || '-';
        }
    }
}