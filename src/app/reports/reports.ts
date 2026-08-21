import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type DocumentStatus = 'EXPIRED' | 'EXPIRING' | 'VALID' | 'NOT_AVAILABLE';

interface ExpiryDocument {
  expiryDate: string | null;
  status: DocumentStatus;
}

interface DocumentExpiryReportRow {
  passNo: string;
  employeeNo: string;
  name: string;
  department: string;
  mobileNo: string;
  rc: ExpiryDocument;
  insurance: ExpiryDocument;
  license: ExpiryDocument;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.css'
})
export class ReportsComponent {
  cutoffDate = signal<string>('');
  searched = signal<boolean>(false);
  searchText = signal<string>('');

  private readonly mockRows: DocumentExpiryReportRow[] = [
    {
      passNo: '1098',
      employeeNo: '13314',
      name: 'SUGREEV',
      department: 'TUNNEL KILN',
      mobileNo: 'NA',
      rc: { expiryDate: '2026-08-10', status: 'EXPIRED' },
      insurance: { expiryDate: '2026-11-25', status: 'EXPIRING' },
      license: { expiryDate: '2027-05-14', status: 'VALID' }
    },
    {
      passNo: '1124',
      employeeNo: '13275',
      name: 'SHIDDEEK KHAN',
      department: 'CONT. GRAPHITIZATION TUBE PLANT',
      mobileNo: '9876543210',
      rc: { expiryDate: '2027-02-12', status: 'VALID' },
      insurance: { expiryDate: '2026-07-31', status: 'EXPIRED' },
      license: { expiryDate: '2026-09-15', status: 'EXPIRING' }
    },
    {
      passNo: '1119',
      employeeNo: '13315',
      name: 'ANUJ SEN',
      department: 'IMPREGNATION',
      mobileNo: 'NA',
      rc: { expiryDate: '2026-09-01', status: 'EXPIRING' },
      insurance: { expiryDate: '2027-01-20', status: 'VALID' },
      license: { expiryDate: null, status: 'NOT_AVAILABLE' }
    },
    {
      passNo: '1081',
      employeeNo: '13320',
      name: 'SACHIN SINGH LOWANSHI',
      department: 'BAKING',
      mobileNo: '9876501234',
      rc: { expiryDate: '2026-06-15', status: 'EXPIRED' },
      insurance: { expiryDate: '2026-06-20', status: 'EXPIRED' },
      license: { expiryDate: '2026-08-18', status: 'EXPIRED' }
    }
  ];

  rows = signal<DocumentExpiryReportRow[]>([]);

  filteredRows = computed(() => {
    const search = this.searchText().trim().toLowerCase();

    if (!search) {
      return this.rows();
    }

    return this.rows().filter(row =>
      row.passNo.toLowerCase().includes(search) ||
      row.employeeNo.toLowerCase().includes(search) ||
      row.name.toLowerCase().includes(search) ||
      row.department.toLowerCase().includes(search)
    );
  });

  get todayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  generateReport(): void {
    if (!this.cutoffDate()) {
      return;
    }

    this.rows.set(this.mockRows);
    this.searched.set(true);
  }

  resetReport(): void {
    this.cutoffDate.set('');
    this.searchText.set('');
    this.rows.set([]);
    this.searched.set(false);
  }

  statusClass(status: DocumentStatus): string {
    switch (status) {
      case 'EXPIRED':
        return 'status-expired';
      case 'EXPIRING':
        return 'status-expiring';
      case 'VALID':
        return 'status-valid';
      default:
        return 'status-missing';
    }
  }

  statusLabel(status: DocumentStatus): string {
    switch (status) {
      case 'NOT_AVAILABLE':
        return 'Not Available';
      case 'EXPIRING':
        return 'Expiring';
      case 'EXPIRED':
        return 'Expired';
      default:
        return 'Valid';
    }
  }

  formatDate(date: string | null): string {
    if (!date) {
      return '—';
    }

    const parsed = new Date(`${date}T00:00:00`);

    return parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
}