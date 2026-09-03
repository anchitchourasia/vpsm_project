import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject
} from '@angular/core';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  Subject,
  takeUntil,
  timeout,
  catchError,
  of
} from 'rxjs';

import { API_CONFIG } from '../core/api.config';

const HTTP_TIMEOUT_MS = 12000;

/*
=====================================================
 PASS LIST RESPONSE
 Native Query Response Mapping
=====================================================
*/
interface PassListRow {
  id: number;
  passId: number;

  passNo: string;

  vehicleNo: string;
  vehicleType: string;

  employeeNo: string;
  empType: string;

  name: string;

  deptCode: string;
  deptName: string;

  contractorCode: string;
  contractorName: string;

  aadhaarNo: string;
  mobileNo: string;

  status: string;
  passStatus: string;

  issueDate: string;
  validityDate: string;

  gateNo: string;
}

@Component({
  selector: 'app-passes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './passes.html',
  styleUrl: './passes.css'
})
export class Passes implements OnInit, OnDestroy {

  private http = inject(HttpClient);
  private router = inject(Router);

  private destroy$ = new Subject<void>();

  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });

  /*
  =====================================================
   LIST DATA
  =====================================================
  */
  allPasses = signal<PassListRow[]>([]);

  isLoading = signal(false);
  hasError = signal(false);

  /*
  =====================================================
   FILTER
  =====================================================
  */
  searchText = signal('');

  filterStatus = signal('ALL');
  filterEmpType = signal('ALL');
  filterVehicleType = signal('ALL');

  filterEmployeeNo = signal('');
  filterPassNo = signal('');
  filterDept = signal('');

  currentPage = signal(1);

  pageSize = signal(10);
  isApprover = signal(false);

  /*
  =====================================================
   SEARCH + FILTER
  =====================================================
  */
  filteredPasses = computed(() => {
    const search = this.searchText()
      .trim()
      .toLowerCase();

    const status = this.filterStatus()
      .trim()
      .toUpperCase();

    const empType = this.filterEmpType()
      .trim()
      .toUpperCase();

    const vehicleType = this.filterVehicleType()
      .trim()
      .toUpperCase();

    const employeeNo = this.filterEmployeeNo()
      .trim()
      .toLowerCase();

    const passNo = this.filterPassNo()
      .trim()
      .toLowerCase();

    const dept = this.filterDept()
      .trim()
      .toLowerCase();

    return this.allPasses().filter(row => {
      /*
       * Normalize fields because native-query / Oracle values may
       * contain trailing spaces, for example:
       * "TUNNEL KILN                  "
       */
      const rowPassNo = String(row.passNo ?? '')
        .trim()
        .toLowerCase();

      const rowEmployeeNo = String(row.employeeNo ?? '')
        .trim()
        .toLowerCase();

      const rowDeptName = String(row.deptName ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      const rowDeptCode = String(row.deptCode ?? '')
        .trim()
        .toLowerCase();

      const rowVehicleType = String(row.vehicleType ?? '')
        .trim()
        .toUpperCase();

      const rowEmpType = String(row.empType ?? '')
        .trim()
        .toUpperCase();

      const rowStatus = String(row.status ?? '')
        .trim()
        .toUpperCase();

      /*
       * Header filter: PASS NO
       * Example: typing "12" matches pass numbers 12, 120, 912, etc.
       */
      const matchPassNo =
        passNo === '' ||
        rowPassNo.includes(passNo);

      /*
       * Header filter: ECNO
       * Example: typing "113" matches employee code 113.
       */
      const matchEmployeeNo =
        employeeNo === '' ||
        rowEmployeeNo.includes(employeeNo);

      /*
       * Header filter: DEPARTMENT
       * Supports department text and department code.
       *
       * "tunnel" -> TUNNEL KILN
       * "kiln"   -> TUNNEL KILN
       * "265"    -> department code 265
       */
      const matchDept =
        dept === '' ||
        rowDeptName.includes(dept) ||
        rowDeptCode.includes(dept);

      const matchEmpType =
        empType === 'ALL' ||
        rowEmpType === empType;

      const matchVehicleType =
        vehicleType === 'ALL' ||
        rowVehicleType === vehicleType;

      let matchStatus = true;

      if (status !== 'ALL' && status !== '') {
        if (
          status === 'REJECT' ||
          status === 'REJECTED' ||
          status === 'REGRET'
        ) {
          matchStatus = rowStatus === 'REJECT';
        } else if (
          status === 'NEEDS_MODIFICATION' ||
          status === 'MODIFY' ||
          status === 'NEEDSMODIFICATION'
        ) {
          matchStatus = rowStatus === 'NEEDS_MODIFICATION';
        } else if (
          status === 'ACTIVE' ||
          status === 'APPROVED'
        ) {
          matchStatus = rowStatus === 'ACTIVE';
        } else {
          matchStatus = rowStatus === status;
        }
      }

      /*
       * Existing global search behavior retained.
       * Department and mobile number are included as useful additions.
       */
      const matchSearch =
        search === '' ||
        rowPassNo.includes(search) ||
        String(row.vehicleNo ?? '').toLowerCase().includes(search) ||
        rowEmployeeNo.includes(search) ||
        String(row.name ?? '').toLowerCase().includes(search) ||
        rowDeptName.includes(search) ||
        rowDeptCode.includes(search) ||
        String(row.contractorCode ?? '').toLowerCase().includes(search) ||
        String(row.contractorName ?? '').toLowerCase().includes(search) ||
        String(row.empType ?? '').toLowerCase().includes(search) ||
        String(row.mobileNo ?? '').toLowerCase().includes(search);

      /*
       * All filters must match independently.
       * This is the key fix: matchDept is no longer wrongly
       * nested inside the Pass No condition.
       */
      return (
        matchSearch &&
        matchStatus &&
        matchEmpType &&
        matchVehicleType &&
        matchPassNo &&
        matchEmployeeNo &&
        matchDept
      );
    });
  });

  /*
  =====================================================
   PAGINATION
  =====================================================
  */
  pagedPasses = computed(() => {
    const start =
      (this.currentPage() - 1) *
      this.pageSize();

    return this.filteredPasses()
      .slice(
        start,
        start + this.pageSize()
      );
  });

  get totalPages(): number {
    return Math.max(
      1,
      Math.ceil(
        this.filteredPasses().length /
        this.pageSize()
      )
    );
  }

  get totalPagesArray(): number[] {
    return Array.from(
      {
        length: this.totalPages
      },
      (_, i) => i + 1
    );
  }

  /*
  =====================================================
   PAGINATION ADDITIONS
  =====================================================
  */
  readonly recordStart = computed(() => {
    if (this.filteredPasses().length === 0) return 0;

    return (
      (this.currentPage() - 1) *
      this.pageSize()
    ) + 1;
  });

  readonly recordEnd = computed(() => {
    const end =
      this.currentPage() *
      this.pageSize();

    return Math.min(
      end,
      this.filteredPasses().length
    );
  });

  readonly visiblePages = computed(() => {
    const total = this.totalPages;
    const current = this.currentPage();
    const maxVisible = 5;

    let start = Math.max(
      1,
      current - Math.floor(maxVisible / 2)
    );

    let end = Math.min(
      total,
      start + maxVisible - 1
    );

    if (end - start + 1 < maxVisible) {
      start = Math.max(
        1,
        end - maxVisible + 1
      );
    }

    const pages: number[] = [];

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  });

  /*
  =====================================================
   INIT
  =====================================================
  */
  ngOnInit(): void {
    const session = sessionStorage.getItem('vpsm_session');

    if (session) {
      try {
        const user = JSON.parse(session);

        const primaryRole = String(
          user?.primaryRole || ''
        )
          .trim()
          .toUpperCase();

        const roles = Array.isArray(user?.roles)
          ? user.roles.map((r: any) =>
              String(r).trim().toUpperCase()
            )
          : [];

        this.isApprover.set(
          primaryRole === 'APPROVER' ||
          roles.includes('APPROVER')
        );
      } catch (e) {
        console.error('Session parse error', e);
        this.isApprover.set(false);
      }
    } else {
      this.isApprover.set(false);
    }

    this.loadPasses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /*
  =====================================================
   LOAD LIST
   Native Query API
  =====================================================
  */
  loadPasses(): void {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.http.get<any[]>(
      API_CONFIG.PASS_LIST_V1,
      {
        headers: this.HEADERS
      }
    )
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('PASS LIST ERROR', err);

          this.hasError.set(true);
          this.isLoading.set(false);

          return of([]);
        })
      )
      .subscribe({
        next: (data) => {
          console.log('PASS_LIST_V1 Response:', data);

          const rows = (data ?? []).map(x =>
            this.mapListData(x)
          );

          this.allPasses.set(rows);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('PASS_LIST_V1 Error:', err);
          this.isLoading.set(false);
        }
      });
  }

  /*
  =====================================================
   CAN EDIT PASS
  =====================================================
  */
  canEditPass(row: PassListRow): boolean {
    if (this.isApproverUser()) {
      return false;
    }

    const status = String(row?.status ?? '')
      .trim()
      .toUpperCase();

    return (
      status === 'SAVED' ||
      status === 'NEEDS_MODIFICATION' ||
      status === 'NEEDSMODIFICATION' ||
      status === 'MODIFY'
    );
  }

  /*
  =====================================================
   MAP NATIVE QUERY RESPONSE
  =====================================================
  */
  private mapListData(row: any): PassListRow {
    const rawStatus = String(row.status ?? '')
      .trim()
      .toUpperCase();

    let displayStatus = row.status || '';

    if (rawStatus === 'APPROVED' || rawStatus === 'ACTIVE') {
      displayStatus = 'ACTIVE';
    } else if (
      rawStatus === 'MODIFY' ||
      rawStatus === 'NEEDS_MODIFICATION' ||
      rawStatus === 'NEEDSMODIFICATION'
    ) {
      displayStatus = 'NEEDS_MODIFICATION';
    } else if (
      rawStatus === 'REGRET' ||
      rawStatus === 'REJECTED' ||
      rawStatus === 'REJECT'
    ) {
      displayStatus = 'REJECT';
    }

    return {
      id: row.id,
      passId: row.id,

      passNo: String(row.passNo ?? '').trim(),

      vehicleNo: String(row.vehicleNo ?? '').trim(),
      vehicleType: String(row.vehicleType ?? '').trim(),

      employeeNo: String(row.employeeNo ?? '').trim(),
      empType: String(row.empType ?? '').trim(),

      name: String(row.name ?? '').trim(),

      deptCode: String(row.deptCode ?? '').trim(),
      deptName: String(row.deptName ?? '')
        .replace(/\s+/g, ' ')
        .trim(),

      contractorCode: String(row.contractorCode ?? '').trim(),
      contractorName: String(row.contractorName ?? '').trim(),

      aadhaarNo: String(row.aadhaarNo ?? '').trim(),
      mobileNo: String(row.mobileNo ?? '').trim(),

      status: String(displayStatus ?? '').trim(),
      passStatus: String(displayStatus ?? '').trim(),

      issueDate: String(row.issueDate ?? '').trim(),
      validityDate: String(row.validityDate ?? '').trim(),

      gateNo: String(row.gateNo ?? '').trim()
    };
  }

  /*
  =====================================================
   FILTER EVENTS
  =====================================================
  */
  onSearch(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(1);
  }

  onStatusChange(value: string): void {
    this.filterStatus.set(value);
    this.currentPage.set(1);
  }

  onEmpTypeChange(value: string): void {
    this.filterEmpType.set(value);
    this.currentPage.set(1);
  }

  onVehicleTypeChange(value: string): void {
    this.filterVehicleType.set(value);
    this.currentPage.set(1);
  }

  onEmpNoChange(value: string): void {
    this.filterEmployeeNo.set(value);
    this.currentPage.set(1);
  }

  onPassNoChange(value: string): void {
    this.filterPassNo.set(value);
    this.currentPage.set(1);
  }

  onDeptChange(value: string): void {
    this.filterDept.set(value);
    this.currentPage.set(1);
  }

  /*
  =====================================================
   PAGE
  =====================================================
  */
  changePage(page: number): void {
    if (
      page >= 1 &&
      page <= this.totalPages
    ) {
      this.currentPage.set(page);
    }
  }

  onPageSizeChange(value: string): void {
    this.pageSize.set(Number(value));
    this.currentPage.set(1);
  }

  /*
  =====================================================
   EDIT
  =====================================================
  */
  editPass(row: PassListRow): void {
    this.router.navigate(
      [
        '/pass-entry',
        row.passId
      ]
    );
  }

  /*
  =====================================================
   VIEW
  =====================================================
  */
  viewPass(row: PassListRow): void {
    if (!row || !row.id) {
      console.error('Pass ID not found.', row);
      return;
    }

    console.log('Opening View Page for ID :', row.id);

    this.router.navigate(
      ['/pass-entry'],
      {
        queryParams: {
          mode: 'view',
          id: row.id
        }
      }
    );
  }

  formatDate(date: string): string {
    if (!date) {
      return '-';
    }

    return new Date(date)
      .toLocaleDateString('en-GB');
  }

  getStatusClass(status: string): string {
    switch (status?.toUpperCase()) {
      case 'SAVED':
        return 'badge bg-primary';

      case 'SUBMITTED':
        return 'badge bg-warning';

      case 'CONFIRMED':
        return 'badge bg-info';

      case 'ACTIVE':
      case 'APPROVED':
        return 'badge bg-success';

      case 'NEEDS_MODIFICATION':
      case 'NEEDSMODIFICATION':
      case 'MODIFY':
        return 'badge bg-warning text-dark';

      case 'REJECT':
      case 'REJECTED':
      case 'REGRET':
        return 'badge bg-danger';

      default:
        return 'badge bg-secondary';
    }
  }

  /*
  =====================================================
   EDIT REDIRECT
   Pass List -> Pass Entry
  =====================================================
  */
  openEditInPassEntry(row: PassListRow): void {
    if (!row || !row.id) {
      console.error('Pass ID not found.', row);
      return;
    }

    console.log('Opening Edit Page for ID :', row.id);

    this.router.navigate(
      ['/pass-entry'],
      {
        queryParams: {
          mode: 'edit',
          id: row.id
        }
      }
    );
  }

  isApproverUser(): boolean {
    const session = sessionStorage.getItem('vpsm_session');

    if (!session) {
      return false;
    }

    try {
      const user = JSON.parse(session);

      const primaryRole = String(
        user?.primaryRole || ''
      )
        .trim()
        .toUpperCase();

      const roles = Array.isArray(user?.roles)
        ? user.roles.map((r: any) =>
            String(r).trim().toUpperCase()
          )
        : [];

      return (
        primaryRole === 'APPROVER' ||
        roles.includes('APPROVER')
      );
    } catch {
      return false;
    }
  }

  /*
  =====================================================
   DOWNLOAD EXCEL
  =====================================================
  */
  downloadExcel(): void {
    const rows = this.filteredPasses();

    if (!rows || rows.length === 0) {
      alert('No pass data available to export.');
      return;
    }

    const exportData = rows.map((p, index) => ({
      'Sr No': index + 1,
      'ID': p.id ?? '',
      'Pass No': p.passNo ?? '',
      'Vehicle No': p.vehicleNo ?? '',
      'Vehicle Type': p.vehicleType ?? '',
      'Employee Type': p.empType ?? '',
      'Name': p.name ?? '',
      'EC No': p.employeeNo ?? '',
      'Department': p.deptName ?? '',
      'Mobile No': p.mobileNo ?? '',
      'Contractor Name': p.contractorName ?? '',
      'Contractor Code': p.contractorCode ?? '',
      'Status': p.status ?? ''
    }));

    const worksheet: XLSX.WorkSheet =
      XLSX.utils.json_to_sheet(exportData);

    const workbook: XLSX.WorkBook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Pass Registry'
    );

    const fileName =
      `Pass_Registry_${new Date().toISOString().slice(0, 10)}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  }

  /*
  =====================================================
   PRINT STICKER
  =====================================================
  */
  printSticker(row: PassListRow): void {
    if (!row) {
      return;
    }

    this.router.navigate(
      ['/pass-sticker'],
      {
        queryParams: {
          id: row.id
        }
      }
    );
  }
}