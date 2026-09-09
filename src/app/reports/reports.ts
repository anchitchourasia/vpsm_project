import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, finalize, of, timeout } from 'rxjs';
import * as XLSX from 'xlsx';
import { API_CONFIG } from '../core/api.config';

const HTTP_TIMEOUT_MS = 12_000;

type DocumentStatus = 'EXPIRED' | 'EXPIRING' | 'VALID';

interface ExpiryDocument {
  expiryDate: string | null;
  status: DocumentStatus;
}

interface DocumentExpiryReportRow {
  employeeNo: string;
  name: string;
  department: string;
  mobileNo: string;

  rc: ExpiryDocument;
  insurance: ExpiryDocument;
  license: ExpiryDocument;
}

/*
 * API response from:
 * GET /api/passes/expiry-details
 */
interface PassExpiryDetailsResponse {
  employeeNo?: number | string;
  name?: string;
  deptCode?: string;
  deptName?: string;
  contractorCode?: string;
  contractorName?: string;
  aadhaarNo?: string;
  empType?: string;
  mobileNo?: string;

  rcExpiryDate?: string | null;
  insuranceExpiryDate?: string | null;
  licenseExpiryDate?: string | null;

  passNo?: number | string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.css'
})
export class ReportsComponent {
  private readonly http = inject(HttpClient);

  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Accept': 'application/json'
  });

  cutoffDate = signal<string>('');
  searched = signal<boolean>(false);
  searchText = signal<string>('');

  isLoading = signal<boolean>(false);
  hasError = signal<boolean>(false);
  errorMessage = signal<string>('');

  rows = signal<DocumentExpiryReportRow[]>([]);

  filteredRows = computed(() => {
    const search = this.searchText()
      .trim()
      .toLowerCase();

    if (!search) {
      return this.rows();
    }

    return this.rows().filter(row =>
      row.employeeNo.toLowerCase().includes(search) ||
      row.name.toLowerCase().includes(search) ||
      row.department.toLowerCase().includes(search) ||
      row.mobileNo.toLowerCase().includes(search)
    );
  });

  get todayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  generateReport(): void {
    const cutoffDate = this.cutoffDate();

    if (!cutoffDate) {
      return;
    }

    this.isLoading.set(true);
    this.hasError.set(false);
    this.errorMessage.set('');
    this.searched.set(false);

    this.http.get<PassExpiryDetailsResponse[]>(
      API_CONFIG.PASS_EXPIRY_DETAILS,
      {
        headers: this.HEADERS
      }
    )
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        catchError(error => {
          console.error('PASS EXPIRY DETAILS ERROR:', error);

          this.hasError.set(true);
          this.errorMessage.set(
            error?.error?.message ??
            'Unable to load expiry report data.'
          );

          return of([]);
        }),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe(response => {
        const reportRows = (response ?? [])
          .map(row => this.mapReportRow(row, cutoffDate))
          .filter(row => this.shouldIncludeInReport(row, cutoffDate));

        this.rows.set(reportRows);
        this.searched.set(true);
      });
  }
  /**
 * Show a VPMS row if any mandatory document is:
 * - missing/null, which sir wants treated as EXPIRED;
 * - already expired; or
 * - expiring on/before the selected cutoff date.
 */
  private shouldIncludeInReport(
    row: DocumentExpiryReportRow,
    cutoffDate: string
  ): boolean {
    return (
      this.isExpiredOrExpiring(row.rc, cutoffDate) ||
      this.isExpiredOrExpiring(row.insurance, cutoffDate) ||
      this.isExpiredOrExpiring(row.license, cutoffDate)
    );
  }
  private isExpiredOrExpiring(
    document: ExpiryDocument,
    cutoffDate: string
  ): boolean {
    /*
     * VPMS business rule from sir:
     * null document expiry = EXPIRED.
     */
    if (!document.expiryDate) {
      return true;
    }

    const expiry = new Date(
      `${document.expiryDate.substring(0, 10)}T00:00:00`
    );

    const cutoff = new Date(
      `${cutoffDate}T00:00:00`
    );

    if (
      Number.isNaN(expiry.getTime()) ||
      Number.isNaN(cutoff.getTime())
    ) {
      return true;
    }

    return expiry.getTime() <= cutoff.getTime();
  }

  resetReport(): void {
    this.cutoffDate.set('');
    this.searchText.set('');
    this.rows.set([]);
    this.searched.set(false);
    this.hasError.set(false);
    this.errorMessage.set('');
  }

  private mapReportRow(
    response: PassExpiryDetailsResponse,
    cutoffDate: string
  ): DocumentExpiryReportRow {
    return {
      employeeNo: String(response.employeeNo ?? '').trim(),

      name: String(response.name ?? '')
        .replace(/\s+/g, ' ')
        .trim(),

      department: String(response.deptName ?? '')
        .replace(/\s+/g, ' ')
        .trim(),

      mobileNo: String(response.mobileNo ?? '').trim(),

      rc: this.toExpiryDocument(
        response.rcExpiryDate ?? null,
        cutoffDate
      ),

      insurance: this.toExpiryDocument(
        response.insuranceExpiryDate ?? null,
        cutoffDate
      ),

      license: this.toExpiryDocument(
        response.licenseExpiryDate ?? null,
        cutoffDate
      )
    };
  }

  /*
   * VPMS business rule from sir:
   * null document expiry date is considered EXPIRED.
   */
  private toExpiryDocument(
    expiryDate: string | null,
    cutoffDate: string
  ): ExpiryDocument {
    const normalizedDate = String(expiryDate ?? '')
      .trim()
      .substring(0, 10);

    /*
     * Sir's rule:
     * Missing/null document expiry date = EXPIRED.
     */
    if (!normalizedDate) {
      return {
        expiryDate: null,
        status: 'EXPIRED'
      };
    }

    const expiry = new Date(`${normalizedDate}T00:00:00`);
    const today = new Date();
    const cutoff = new Date(`${cutoffDate}T00:00:00`);

    today.setHours(0, 0, 0, 0);

    /*
     * Expiry date prior to today = expired.
     */
    if (expiry.getTime() < today.getTime()) {
      return {
        expiryDate: normalizedDate,
        status: 'EXPIRED'
      };
    }

    /*
     * Valid today but expires on/before the selected cutoff date
     * = expiring.
     */
    if (expiry.getTime() <= cutoff.getTime()) {
      return {
        expiryDate: normalizedDate,
        status: 'EXPIRING'
      };
    }

    return {
      expiryDate: normalizedDate,
      status: 'VALID'
    };
  }


  downloadExcel(): void {
    const reportRows = this.filteredRows();

    if (reportRows.length === 0) {
      alert('No report data available to export.');
      return;
    }

    const exportData = reportRows.map((row, index) => ({
      'Sr No': index + 1,
      'Employee No': row.employeeNo ?? '',
      'Name': row.name ?? '',
      'Department': row.department ?? '',
      'Mobile No': row.mobileNo ?? '',

      'RC Expiry Date': row.rc.expiryDate ?? 'Expired',
      'RC Status': this.statusLabel(row.rc.status),

      'Insurance Expiry Date': row.insurance.expiryDate ?? 'Expired',
      'Insurance Status': this.statusLabel(row.insurance.status),

      'License Expiry Date': row.license.expiryDate ?? 'Expired',
      'License Status': this.statusLabel(row.license.status)
    }));

    const worksheet: XLSX.WorkSheet =
      XLSX.utils.json_to_sheet(exportData);

    const workbook: XLSX.WorkBook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Document Expiry Report'
    );

    const cutoffDate = this.cutoffDate() || 'Report';

    const fileName =
      `VPMS_Document_Expiry_Report_${cutoffDate}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  }


  statusClass(status: DocumentStatus): string {
    switch (status) {
      case 'EXPIRED':
        return 'status-expired';

      case 'EXPIRING':
        return 'status-expiring';

      case 'VALID':
        return 'status-valid';
    }
  }

  statusLabel(status: DocumentStatus): string {
    switch (status) {
      case 'EXPIRED':
        return 'Expired';

      case 'EXPIRING':
        return 'Expiring';

      case 'VALID':
        return 'Valid';
    }
  }

  formatDate(date: string | null): string {
    /*
     * Null is an expired/missing document date.
     * Show a direct value rather than the old "Not Available" state.
     */
    if (!date) {
      return 'Expired';
    }

    const parsed = new Date(`${date}T00:00:00`);

    if (Number.isNaN(parsed.getTime())) {
      return 'Expired';
    }

    return parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
}