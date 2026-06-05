import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';


const USE_DUMMY_DATA  = false;
const HTTP_TIMEOUT_MS = 12000;


const DOC_TYPE_LABELS: Record<string, string> = {
  'RC'        : 'RC (Registration)',
  'PUC'       : 'PUC Certificate',
  'Insurance' : 'Insurance',
  'INSURANCE' : 'Insurance',
  'Fitness'   : 'Fitness Certificate',
  'FITNESS'   : 'Fitness Certificate',
  'Load_Test' : 'Load Test',
  'LOAD_TEST' : 'Load Test',
  'Load Test' : 'Load Test',
};

// ── Dummy seed data for offline development ──
const DUMMY_DOCS: any[] = [
  {
    documentId: 21, documentType: 'RC', documentNo: 'RC-MH02-REG-8822',
    startDate: '2026-06-01', expiryDate: '2041-05-31',
    documentStatus: 'Valid', remarks: 'Permanent smart card',
    enterBy: 'HEG_ADMIN', enterDate: '2026-06-01', fileName: null,
    vehicle: { vehicleId: 40, vehicleNo: 'MP04HEG1111', vehicleType: 'Truck',
      vehicleClass: 'Heavy_Machinery', brandModel: 'Tata', isActive: 'Y', isBlacklisted: 'N' }
  },
  {
    documentId: 22, documentType: 'INSURANCE', documentNo: 'INS-7762A',
    startDate: '2026-03-01', expiryDate: '2027-03-01',
    documentStatus: 'Valid', remarks: 'Comprehensive',
    enterBy: 'HEG_ADMIN', enterDate: '2026-05-28', fileName: 'insurance.pdf',
    vehicle: { vehicleId: 40, vehicleNo: 'MP04HEG1111', vehicleType: 'Truck',
      vehicleClass: 'Heavy_Machinery', brandModel: 'Tata', isActive: 'Y', isBlacklisted: 'N' }
  },
  {
    documentId: 23, documentType: 'Fitness', documentNo: 'FIT-HEG-2026-001',
    startDate: '2026-01-01', expiryDate: '2026-09-15',
    documentStatus: 'Expiring', remarks: 'Annual fitness check',
    enterBy: 'HEG_ADMIN', enterDate: '2026-01-01', fileName: 'fitness.pdf',
    vehicle: { vehicleId: 40, vehicleNo: 'MP04HEG1111', vehicleType: 'Truck',
      vehicleClass: 'Heavy_Machinery', brandModel: 'Tata', isActive: 'Y', isBlacklisted: 'N' }
  },
  {
    documentId: 24, documentType: 'Load_Test', documentNo: 'LT-HEG-2026-001',
    startDate: '2026-04-01', expiryDate: '2027-04-01',
    documentStatus: 'Valid', remarks: 'Crane load test passed',
    enterBy: 'HEG_ADMIN', enterDate: '2026-04-01', fileName: 'loadtest.pdf',
    vehicle: { vehicleId: 40, vehicleNo: 'MP04HEG1111', vehicleType: 'Crane',
      vehicleClass: 'Heavy_Machinery', brandModel: 'ACE', isActive: 'Y', isBlacklisted: 'N' }
  },
];


// ── DocForm: covers all 5 document types ──
interface DocForm {
  vehicleId      : string;
  enterBy        : string;
  documentType   : string;
  documentNo     : string;
  startDate      : string;
  expiryDate     : string;
  documentStatus : string;
  remarks        : string;
  selectedFile   : File | null;
  // PUC
  pucNo          : string;
  pucStart       : string;
  pucExpiry      : string;
  pucFile        : File | null;
  // Insurance
  insuranceNo    : string;
  insuranceStart : string;
  insuranceExpiry: string;
  insuranceFile  : File | null;
  // RC
  rcNo           : string;
  rcStart        : string;
  rcExpiry       : string;
  rcFile         : File | null;
  // Fitness
  fitnessNo      : string;
  fitnessStart   : string;
  fitnessExpiry  : string;
  fitnessFile    : File | null;
  // Load Test
  loadTestNo     : string;
  loadTestStart  : string;
  loadTestExpiry : string;
  loadTestFile   : File | null;
}

const EMPTY_FORM = (docType = ''): DocForm => ({
  vehicleId: '', enterBy: 'ADMIN',
  documentType: docType, documentNo: '',
  startDate: '', expiryDate: '', documentStatus: 'Valid',
  remarks: '', selectedFile: null,
  pucNo: '', pucStart: '', pucExpiry: '', pucFile: null,
  insuranceNo: '', insuranceStart: '', insuranceExpiry: '', insuranceFile: null,
  rcNo: '', rcStart: '', rcExpiry: '', rcFile: null,
  fitnessNo: '', fitnessStart: '', fitnessExpiry: '', fitnessFile: null,
  loadTestNo: '', loadTestStart: '', loadTestExpiry: '', loadTestFile: null,
});


@Component({
  selector  : 'app-documents',
  standalone: true,
  imports   : [CommonModule, FormsModule],
  styleUrl  : './documents.css',
  template  : `
<div class="page-wrapper">

  <!-- HEADER -->
  <div class="page-top">
    <div class="page-title-row">
      <span class="dummy-mode-pill" *ngIf="isDummy">● DUMMY DATA</span>
      <i class="bi bi-file-earmark-text page-icon" style="color:#0ea5e9"></i>
      <h2 class="page-heading">{{ currentDocLabel() }}</h2>
      <span class="record-pill" style="background:#e0f2fe;color:#0369a1">
        {{ filteredDocs().length }} Records
      </span>
    </div>
    <button class="btn-issue" (click)="openAddModal()">
      <i class="bi bi-plus-circle-fill"></i> Upload Document
    </button>
  </div>

  <!-- LOADING -->
  <div *ngIf="isLoading()" class="state-box">
    <i class="bi bi-arrow-repeat spin-icon"></i>
    <p>Loading records...</p>
  </div>

  <!-- ERROR -->
  <div *ngIf="hasError() && !isLoading()" class="state-box error-box">
    <i class="bi bi-exclamation-triangle-fill"></i>
    <p>Failed to load data. Check if backend is running.</p>
    <button class="btn-retry" (click)="loadDocuments()">
      <i class="bi bi-arrow-clockwise"></i> Retry
    </button>
  </div>

  <!-- CONTENT -->
  <div *ngIf="!isLoading() && !hasError()">

    <!-- FILTER BAR -->
    <div class="filter-bar">
      <div class="search-box">
        <i class="bi bi-search search-icon"></i>
        <input type="text"
          placeholder="Search vehicle no, doc no, type, status..."
          [value]="searchText()"
          (input)="onSearch($any($event.target).value)"
          class="search-input" />
      </div>
      <div class="filter-group">
        <select (change)="onFilterStatus($any($event.target).value)" class="filter-select">
          <option value="ALL">All Status</option>
          <option value="Valid">Valid</option>
          <option value="ACTIVE">Active</option>
          <option value="Expired">Expired</option>
          <option value="Expiring">Expiring</option>
        </select>
        <select (change)="onPageSize($any($event.target).value)" class="filter-select">
          <option value="10">10 / page</option>
          <option value="20">20 / page</option>
          <option value="50">50 / page</option>
        </select>
      </div>
    </div>

    <!-- TABLE -->
    <div class="table-card">
      <div class="table-scroll">
        <table class="dtable">
          <thead>
            <tr>
              <th>S.NO</th>
              <th>DOC ID</th>
              <th>VEHICLE NO</th>
              <th>BRAND / MODEL</th>
              <th>CLASS</th>
              <th>DOC TYPE</th>
              <th>DOC NO</th>
              <th>START DATE</th>
              <th>EXPIRY DATE</th>
              <th>DAYS LEFT</th>
              <th>STATUS</th>
              <th>FILE</th>
              <th>ENTERED BY</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let d of pagedDocs(); let i = index">
              <td>{{ (currentPage()-1)*pageSize() + i + 1 }}</td>
              <td class="td-muted">{{ d.documentId }}</td>
              <td><strong>{{ d.vehicle?.vehicleNo || '—' }}</strong></td>
              <td>{{ d.vehicle?.brandModel || '—' }}</td>
              <td>
                <span [class]="getVehicleClassBadge(d.vehicle?.vehicleClass)">
                  {{ d.vehicle?.vehicleClass || '—' }}
                </span>
              </td>
              <td>
                <span [class]="getDocTypeBadge(d.documentType)">
                  {{ DOC_TYPE_LABELS[d.documentType] || d.documentType || '—' }}
                </span>
              </td>
              <td>{{ d.documentNo || '—' }}</td>
              <td>{{ formatDate(d.startDate) }}</td>
              <td>{{ formatDate(d.expiryDate) }}</td>
              <td>
                <span [class]="getDaysLeftClass(d.expiryDate)">
                  {{ getDaysLeftLabel(d.expiryDate) }}
                </span>
              </td>
              <td>
                <span [class]="getStatusClass(d.documentStatus)">
                  {{ d.documentStatus || '—' }}
                </span>
              </td>
              <td>
                <button *ngIf="d.fileName" class="btn-pdf"
                  (click)="downloadPdf(d)" title="Download {{ d.fileName }}">
                  <i class="bi bi-file-earmark-pdf-fill"></i> PDF
                </button>
                <span *ngIf="!d.fileName" class="td-muted">—</span>
              </td>
              <td class="td-muted">{{ d.enterBy || '—' }}</td>
              <td>
                <div class="action-btns">
                  <button class="btn-icon-view" (click)="openViewModal(d)">
                    <i class="bi bi-eye"></i> View
                  </button>
                  <button class="btn-icon-edit" (click)="openEditModal(d)">
                    <i class="bi bi-pencil-square"></i> Edit
                  </button>
                </div>
              </td>
            </tr>
            <tr *ngIf="pagedDocs().length === 0">
              <td colspan="14" class="no-data">No records found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- PAGINATION -->
      <div class="pagination-bar">
        <span class="page-info">
          Showing
          {{ filteredDocs().length === 0 ? 0 : (currentPage()-1)*pageSize()+1 }}–{{ currentPage()*pageSize() < filteredDocs().length ? currentPage()*pageSize() : filteredDocs().length }}
          of {{ filteredDocs().length }}
        </span>
        <div class="page-btns">
          <button class="pg-btn" (click)="goToPage(currentPage()-1)" [disabled]="currentPage()===1">
            <i class="bi bi-chevron-left"></i>
          </button>
          <button *ngFor="let pg of totalPagesArr" class="pg-btn"
            [class.active]="pg === currentPage()" (click)="goToPage(pg)">{{ pg }}</button>
          <button class="pg-btn" (click)="goToPage(currentPage()+1)" [disabled]="currentPage()===totalPages">
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>

  </div>
</div>


<!-- ══════════════════════════════════════════════════════════════════ -->
<!--  ADD MODAL  — All 5 doc types: PUC + Insurance + RC + Fitness + Load Test -->
<!-- ══════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" *ngIf="showModal() && !isEditMode()" (click)="closeModal()"></div>
<div class="modal-box modal-xl" *ngIf="showModal() && !isEditMode()">
  <div class="modal-header modal-header-add">
    <h3>📄 Upload Documents — Multi-Type (All 5)</h3>
    <button class="modal-close" (click)="closeModal()"><i class="bi bi-x-lg"></i></button>
  </div>

  <div class="modal-body">
    <div class="alert-success" *ngIf="saveSuccess()">{{ saveSuccess() }}</div>
    <div class="alert-error"   *ngIf="saveError()">{{ saveError() }}</div>

    <!-- Vehicle + Entered By -->
    <div class="form-grid">
      <div class="form-group">
        <label>Vehicle ID <span class="req">*</span></label>
        <input type="number" [(ngModel)]="form.vehicleId"
          placeholder="Enter Vehicle ID from Vehicles Master"
          class="form-control" min="1"
          (input)="onVehicleIdInput($event)" />
        <small class="field-hint">Must match a valid Vehicle ID in the database</small>
      </div>
      <div class="form-group">
        <label>Entered By <span class="req">*</span></label>
        <input type="text" [(ngModel)]="form.enterBy"
          class="form-control" placeholder="e.g. ADMIN" />
      </div>
    </div>

    <p class="upload-note">
      <i class="bi bi-info-circle-fill"></i>
      Upload one or more document types at a time. At least one file is required.
    </p>

    <!-- ══ PUC SECTION ══ -->
    <div class="doc-section" [class.doc-section-active]="form.pucFile">
      <div class="doc-section-header">
        <span class="doc-type-badge badge-puc">PUC</span>
        <span>PUC Certificate</span>
        <span class="doc-optional">(optional)</span>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>PUC No</label>
          <input type="text" [(ngModel)]="form.pucNo"
            placeholder="e.g. PUC-HEG-2026-001" class="form-control" maxlength="50"
            (input)="onUpperCase($event, 'pucNo')" />
        </div>
        <div class="form-group">
          <label>Start Date</label>
          <input type="date" [(ngModel)]="form.pucStart" class="form-control" />
        </div>
        <div class="form-group">
          <label>Expiry Date</label>
          <input type="date" [(ngModel)]="form.pucExpiry" class="form-control" />
        </div>
        <div class="form-group">
          <label>PUC PDF File</label>
          <div class="file-upload-box" [class.has-file]="form.pucFile">
            <input type="file" accept=".pdf" id="pucFileInput"
              class="file-input-hidden" (change)="onFileSelected($event, 'puc')" />
            <label for="pucFileInput" class="file-upload-label">
              <ng-container *ngIf="!form.pucFile">
                <i class="bi bi-cloud-arrow-up-fill file-upload-icon"></i>
                <span class="file-upload-text">Choose PUC PDF</span>
                <span class="file-upload-hint">Max 10 MB</span>
              </ng-container>
              <ng-container *ngIf="form.pucFile">
                <i class="bi bi-file-earmark-pdf-fill file-pdf-icon"></i>
                <span class="file-selected-name">{{ form.pucFile.name }}</span>
                <span class="file-selected-size">{{ formatFileSize(form.pucFile.size) }}</span>
              </ng-container>
            </label>
            <button *ngIf="form.pucFile" class="btn-remove-file" type="button"
              (click)="clearFile($event, 'puc')"><i class="bi bi-x-circle-fill"></i></button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ INSURANCE SECTION ══ -->
    <div class="doc-section" [class.doc-section-active]="form.insuranceFile">
      <div class="doc-section-header">
        <span class="doc-type-badge badge-insurance">INSURANCE</span>
        <span>Insurance Certificate</span>
        <span class="doc-optional">(optional)</span>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Insurance No</label>
          <input type="text" [(ngModel)]="form.insuranceNo"
            placeholder="e.g. INS-HEG-2026-001" class="form-control" maxlength="50"
            (input)="onUpperCase($event, 'insuranceNo')" />
        </div>
        <div class="form-group">
          <label>Start Date</label>
          <input type="date" [(ngModel)]="form.insuranceStart" class="form-control" />
        </div>
        <div class="form-group">
          <label>Expiry Date</label>
          <input type="date" [(ngModel)]="form.insuranceExpiry" class="form-control" />
        </div>
        <div class="form-group">
          <label>Insurance PDF File</label>
          <div class="file-upload-box" [class.has-file]="form.insuranceFile">
            <input type="file" accept=".pdf" id="insuranceFileInput"
              class="file-input-hidden" (change)="onFileSelected($event, 'insurance')" />
            <label for="insuranceFileInput" class="file-upload-label">
              <ng-container *ngIf="!form.insuranceFile">
                <i class="bi bi-cloud-arrow-up-fill file-upload-icon"></i>
                <span class="file-upload-text">Choose Insurance PDF</span>
                <span class="file-upload-hint">Max 10 MB</span>
              </ng-container>
              <ng-container *ngIf="form.insuranceFile">
                <i class="bi bi-file-earmark-pdf-fill file-pdf-icon"></i>
                <span class="file-selected-name">{{ form.insuranceFile.name }}</span>
                <span class="file-selected-size">{{ formatFileSize(form.insuranceFile.size) }}</span>
              </ng-container>
            </label>
            <button *ngIf="form.insuranceFile" class="btn-remove-file" type="button"
              (click)="clearFile($event, 'insurance')"><i class="bi bi-x-circle-fill"></i></button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ RC SECTION ══ -->
    <div class="doc-section" [class.doc-section-active]="form.rcFile">
      <div class="doc-section-header">
        <span class="doc-type-badge badge-rc">RC</span>
        <span>RC (Registration Certificate)</span>
        <span class="doc-optional">(optional)</span>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>RC No</label>
          <input type="text" [(ngModel)]="form.rcNo"
            placeholder="e.g. RC-MP04-2026-001" class="form-control" maxlength="50"
            (input)="onUpperCase($event, 'rcNo')" />
        </div>
        <div class="form-group">
          <label>Start Date</label>
          <input type="date" [(ngModel)]="form.rcStart" class="form-control" />
        </div>
        <div class="form-group">
          <label>Expiry Date</label>
          <input type="date" [(ngModel)]="form.rcExpiry" class="form-control" />
        </div>
        <div class="form-group">
          <label>RC PDF File</label>
          <div class="file-upload-box" [class.has-file]="form.rcFile">
            <input type="file" accept=".pdf" id="rcFileInput"
              class="file-input-hidden" (change)="onFileSelected($event, 'rc')" />
            <label for="rcFileInput" class="file-upload-label">
              <ng-container *ngIf="!form.rcFile">
                <i class="bi bi-cloud-arrow-up-fill file-upload-icon"></i>
                <span class="file-upload-text">Choose RC PDF</span>
                <span class="file-upload-hint">Max 10 MB</span>
              </ng-container>
              <ng-container *ngIf="form.rcFile">
                <i class="bi bi-file-earmark-pdf-fill file-pdf-icon"></i>
                <span class="file-selected-name">{{ form.rcFile.name }}</span>
                <span class="file-selected-size">{{ formatFileSize(form.rcFile.size) }}</span>
              </ng-container>
            </label>
            <button *ngIf="form.rcFile" class="btn-remove-file" type="button"
              (click)="clearFile($event, 'rc')"><i class="bi bi-x-circle-fill"></i></button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ FITNESS SECTION ══ -->
    <div class="doc-section" [class.doc-section-active]="form.fitnessFile">
      <div class="doc-section-header">
        <span class="doc-type-badge badge-fitness">FITNESS</span>
        <span>Fitness Certificate</span>
        <span class="doc-optional">(optional — Heavy Machinery only)</span>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Fitness No</label>
          <input type="text" [(ngModel)]="form.fitnessNo"
            placeholder="e.g. FIT-HEG-2026-001" class="form-control" maxlength="50"
            (input)="onUpperCase($event, 'fitnessNo')" />
        </div>
        <div class="form-group">
          <label>Start Date</label>
          <input type="date" [(ngModel)]="form.fitnessStart" class="form-control" />
        </div>
        <div class="form-group">
          <label>Expiry Date</label>
          <input type="date" [(ngModel)]="form.fitnessExpiry" class="form-control" />
        </div>
        <div class="form-group">
          <label>Fitness PDF File</label>
          <div class="file-upload-box" [class.has-file]="form.fitnessFile">
            <input type="file" accept=".pdf" id="fitnessFileInput"
              class="file-input-hidden" (change)="onFileSelected($event, 'fitness')" />
            <label for="fitnessFileInput" class="file-upload-label">
              <ng-container *ngIf="!form.fitnessFile">
                <i class="bi bi-cloud-arrow-up-fill file-upload-icon"></i>
                <span class="file-upload-text">Choose Fitness PDF</span>
                <span class="file-upload-hint">Max 10 MB</span>
              </ng-container>
              <ng-container *ngIf="form.fitnessFile">
                <i class="bi bi-file-earmark-pdf-fill file-pdf-icon"></i>
                <span class="file-selected-name">{{ form.fitnessFile.name }}</span>
                <span class="file-selected-size">{{ formatFileSize(form.fitnessFile.size) }}</span>
              </ng-container>
            </label>
            <button *ngIf="form.fitnessFile" class="btn-remove-file" type="button"
              (click)="clearFile($event, 'fitness')"><i class="bi bi-x-circle-fill"></i></button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ LOAD TEST SECTION ══ -->
    <div class="doc-section" [class.doc-section-active]="form.loadTestFile">
      <div class="doc-section-header">
        <span class="doc-type-badge badge-loadtest">LOAD TEST</span>
        <span>Load Test Certificate</span>
        <span class="doc-optional">(optional — Cranes / Heavy Machinery only)</span>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Load Test No</label>
          <input type="text" [(ngModel)]="form.loadTestNo"
            placeholder="e.g. LT-HEG-2026-001" class="form-control" maxlength="50"
            (input)="onUpperCase($event, 'loadTestNo')" />
        </div>
        <div class="form-group">
          <label>Start Date</label>
          <input type="date" [(ngModel)]="form.loadTestStart" class="form-control" />
        </div>
        <div class="form-group">
          <label>Expiry Date</label>
          <input type="date" [(ngModel)]="form.loadTestExpiry" class="form-control" />
        </div>
        <div class="form-group">
          <label>Load Test PDF File</label>
          <div class="file-upload-box" [class.has-file]="form.loadTestFile">
            <input type="file" accept=".pdf" id="loadTestFileInput"
              class="file-input-hidden" (change)="onFileSelected($event, 'loadTest')" />
            <label for="loadTestFileInput" class="file-upload-label">
              <ng-container *ngIf="!form.loadTestFile">
                <i class="bi bi-cloud-arrow-up-fill file-upload-icon"></i>
                <span class="file-upload-text">Choose Load Test PDF</span>
                <span class="file-upload-hint">Max 10 MB</span>
              </ng-container>
              <ng-container *ngIf="form.loadTestFile">
                <i class="bi bi-file-earmark-pdf-fill file-pdf-icon"></i>
                <span class="file-selected-name">{{ form.loadTestFile.name }}</span>
                <span class="file-selected-size">{{ formatFileSize(form.loadTestFile.size) }}</span>
              </ng-container>
            </label>
            <button *ngIf="form.loadTestFile" class="btn-remove-file" type="button"
              (click)="clearFile($event, 'loadTest')"><i class="bi bi-x-circle-fill"></i></button>
          </div>
        </div>
      </div>
    </div>

  </div>

  <div class="modal-footer">
    <button class="btn-cancel" (click)="closeModal()" [disabled]="isSaving()">Cancel</button>
    <button class="btn-save" (click)="saveDocument()" [disabled]="isSaving()">
      <span *ngIf="isSaving()"><i class="bi bi-hourglass-split"></i> Uploading...</span>
      <span *ngIf="!isSaving()"><i class="bi bi-floppy-fill"></i> Upload</span>
    </button>
  </div>
</div>


<!-- ══════════════════════════════════════════ -->
<!-- EDIT MODAL  (single-doc update)           -->
<!-- ══════════════════════════════════════════ -->
<div class="modal-overlay" *ngIf="showModal() && isEditMode()" (click)="closeModal()"></div>
<div class="modal-box modal-lg" *ngIf="showModal() && isEditMode()">
  <div class="modal-header modal-header-edit">
    <h3>✏️ Edit Document — #{{ editId() }}</h3>
    <button class="modal-close" (click)="closeModal()"><i class="bi bi-x-lg"></i></button>
  </div>

  <div class="modal-body">
    <div class="alert-success" *ngIf="saveSuccess()">{{ saveSuccess() }}</div>
    <div class="alert-error"   *ngIf="saveError()">{{ saveError() }}</div>

    <div class="form-grid">

      <div class="form-group">
        <label>Vehicle No</label>
        <input type="text" [value]="editVehicleNo()" class="form-control" readonly />
        <small class="field-hint">Vehicle cannot be changed after upload</small>
      </div>

      <div class="form-group">
        <label>Document Type <span class="req">*</span></label>
        <select [(ngModel)]="form.documentType" class="form-control" disabled>
          <option value="">— Select Type —</option>
          <option value="RC">RC (Registration)</option>
          <option value="PUC">PUC Certificate</option>
          <option value="INSURANCE">Insurance</option>
          <option value="Fitness">Fitness Certificate</option>
          <option value="Load_Test">Load Test</option>
        </select>
        <small class="field-hint">Document type cannot be changed after upload</small>
      </div>

      <div class="form-group">
        <label>Document No <span class="req">*</span></label>
        <input type="text"
          [ngModel]="form.documentNo"
          (input)="onDocumentNoInput($event)"
          placeholder="Document number"
          class="form-control" maxlength="50" />
        <small class="field-hint">Auto-UPPERCASE · max 50 chars</small>
      </div>

      <div class="form-group">
        <label>Start Date <span class="req">*</span></label>
        <input type="date" [(ngModel)]="form.startDate" class="form-control" />
      </div>

      <div class="form-group">
        <label>Expiry Date <span class="req">*</span></label>
        <input type="date" [(ngModel)]="form.expiryDate" class="form-control" />
      </div>

      <div class="form-group">
        <label>Document Status</label>
        <select [(ngModel)]="form.documentStatus" class="form-control">
          <option value="Valid">Valid</option>
          <option value="ACTIVE">Active</option>
          <option value="Expired">Expired</option>
          <option value="Expiring">Expiring</option>
        </select>
      </div>

      <div class="form-group form-group-full">
        <label>
          <i class="bi bi-paperclip"></i>
          Replace PDF Document
          <span class="field-optional">(optional)</span>
        </label>
        <div class="file-upload-box" [class.has-file]="form.selectedFile">
          <input type="file" accept=".pdf" id="pdfFileInput"
            class="file-input-hidden" (change)="onFileSelected($event, 'single')" />
          <label for="pdfFileInput" class="file-upload-label">
            <ng-container *ngIf="!form.selectedFile">
              <i class="bi bi-cloud-arrow-up-fill file-upload-icon"></i>
              <span class="file-upload-text">Click to choose PDF</span>
              <span class="file-upload-hint">Max 10 MB · PDF only</span>
            </ng-container>
            <ng-container *ngIf="form.selectedFile">
              <i class="bi bi-file-earmark-pdf-fill file-pdf-icon"></i>
              <span class="file-selected-name">{{ form.selectedFile.name }}</span>
              <span class="file-selected-size">{{ formatFileSize(form.selectedFile.size) }}</span>
            </ng-container>
          </label>
          <button *ngIf="form.selectedFile" class="btn-remove-file" type="button"
            (click)="clearFile($event, 'single')">
            <i class="bi bi-x-circle-fill"></i>
          </button>
        </div>
        <div class="existing-file-row" *ngIf="editExistingFileName()">
          <i class="bi bi-file-earmark-pdf-fill" style="color:#dc2626"></i>
          <span>Current file: <strong>{{ editExistingFileName() }}</strong></span>
          <span class="field-hint">(Upload new file above to replace)</span>
        </div>
      </div>

      <div class="form-group form-group-full">
        <label>Remarks</label>
        <textarea [(ngModel)]="form.remarks" rows="2"
          placeholder="Optional remarks..."
          class="form-control"></textarea>
      </div>

    </div>
  </div>

  <div class="modal-footer">
    <button class="btn-cancel" (click)="closeModal()" [disabled]="isSaving()">Cancel</button>
    <button class="btn-save" (click)="saveDocument()" [disabled]="isSaving()">
      <span *ngIf="isSaving()"><i class="bi bi-hourglass-split"></i> Saving...</span>
      <span *ngIf="!isSaving()"><i class="bi bi-floppy-fill"></i> Update</span>
    </button>
  </div>
</div>


<!-- ══════════════════════════════════════════ -->
<!-- VIEW DETAIL MODAL                          -->
<!-- ══════════════════════════════════════════ -->
<div class="modal-overlay" *ngIf="showViewModal()" (click)="closeViewModal()"></div>
<div class="modal-box modal-lg" *ngIf="showViewModal() && viewDoc()">
  <div class="modal-header modal-header-view">
    <h3>📄 Document Detail — #{{ viewDoc().documentId }}</h3>
    <button class="modal-close" (click)="closeViewModal()"><i class="bi bi-x-lg"></i></button>
  </div>
  <div class="modal-body">
    <div class="detail-grid">

      <div class="detail-section">
        <div class="detail-section-title">VEHICLE</div>
        <div class="detail-row"><span class="detail-label">Vehicle ID</span><strong class="detail-value">{{ viewDoc().vehicle?.vehicleId ?? '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Vehicle No</span><strong class="detail-value">{{ viewDoc().vehicle?.vehicleNo ?? '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Type</span><strong class="detail-value">{{ viewDoc().vehicle?.vehicleType ?? '—' }}</strong></div>
        <div class="detail-row">
          <span class="detail-label">Class</span>
          <span [class]="getVehicleClassBadge(viewDoc().vehicle?.vehicleClass)">{{ viewDoc().vehicle?.vehicleClass ?? '—' }}</span>
        </div>
        <div class="detail-row"><span class="detail-label">Brand / Model</span><strong class="detail-value">{{ viewDoc().vehicle?.brandModel ?? '—' }}</strong></div>
        <div class="detail-row">
          <span class="detail-label">Blacklisted</span>
          <span [class]="viewDoc().vehicle?.isBlacklisted === 'Y' ? 'badge badge-expired' : 'badge badge-active'">
            {{ viewDoc().vehicle?.isBlacklisted === 'Y' ? 'Yes' : 'No' }}
          </span>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">DOCUMENT INFO</div>
        <div class="detail-row">
          <span class="detail-label">Document Type</span>
          <span [class]="getDocTypeBadge(viewDoc().documentType)">
            {{ DOC_TYPE_LABELS[viewDoc().documentType] || viewDoc().documentType || '—' }}
          </span>
        </div>
        <div class="detail-row"><span class="detail-label">Document No</span><strong class="detail-value">{{ viewDoc().documentNo || '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Start Date</span><strong class="detail-value">{{ formatDate(viewDoc().startDate) }}</strong></div>
        <div class="detail-row"><span class="detail-label">Expiry Date</span><strong class="detail-value">{{ formatDate(viewDoc().expiryDate) }}</strong></div>
        <div class="detail-row">
          <span class="detail-label">Days Left</span>
          <span [class]="getDaysLeftClass(viewDoc().expiryDate)">{{ getDaysLeftLabel(viewDoc().expiryDate) }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span [class]="getStatusClass(viewDoc().documentStatus)">{{ viewDoc().documentStatus || '—' }}</span>
        </div>
        <div class="detail-row"><span class="detail-label">Remarks</span><strong class="detail-value">{{ viewDoc().remarks || '—' }}</strong></div>
      </div>

      <div class="detail-section" *ngIf="viewDoc().fileName">
        <div class="detail-section-title">ATTACHED FILE</div>
        <div class="detail-row">
          <span class="detail-label">File Name</span>
          <strong class="detail-value">{{ viewDoc().fileName }}</strong>
        </div>
        <div class="detail-row">
          <span class="detail-label">Download</span>
          <button class="btn-pdf-lg" (click)="downloadPdf(viewDoc())">
            <i class="bi bi-file-earmark-pdf-fill"></i> Download PDF
          </button>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">AUDIT INFO</div>
        <div class="detail-row"><span class="detail-label">Entered By</span><strong class="detail-value">{{ viewDoc().enterBy || '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Enter Date</span><strong class="detail-value">{{ formatDate(viewDoc().enterDate) }}</strong></div>
      </div>

    </div>
  </div>
  <div class="modal-footer">
    <button class="btn-cancel" (click)="closeViewModal()">Close</button>
    <button class="btn-pdf-lg" *ngIf="viewDoc().fileName" (click)="downloadPdf(viewDoc())">
      <i class="bi bi-file-earmark-pdf-fill"></i> Download PDF
    </button>
    <button class="btn-save" (click)="closeViewModal(); openEditModal(viewDoc())">
      <i class="bi bi-pencil-square"></i> Edit
    </button>
  </div>
</div>
  `,
})
export class Documents implements OnInit, OnDestroy {

  readonly DOC_TYPE_LABELS = DOC_TYPE_LABELS;

  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
  });
  private readonly JSON_HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });

  private readonly destroy$ = new Subject<void>();

  private allDocsRaw    = signal<any[]>([]);
  private activeDocType = signal<string>('ALL');

  isLoading = signal(true);
  hasError  = signal(false);
  isDummy   = USE_DUMMY_DATA;

  searchText   = signal('');
  filterStatus = signal('ALL');
  currentPage  = signal(1);
  pageSize     = signal(10);

  showModal            = signal(false);
  isEditMode           = signal(false);
  isSaving             = signal(false);
  saveError            = signal('');
  saveSuccess          = signal('');
  editId               = signal<number | null>(null);
  editVehicleNo        = signal('');
  editExistingFileName = signal('');
  form: DocForm        = EMPTY_FORM();

  showViewModal = signal(false);
  viewDoc       = signal<any>(null);

  currentDocLabel = computed(() =>
    this.activeDocType() === 'ALL'
      ? 'All Documents'
      : (DOC_TYPE_LABELS[this.activeDocType()] || this.activeDocType())
  );

  filteredDocs = computed(() => {
    const q  = this.searchText().toLowerCase();
    const st = this.filterStatus();
    const dt = this.activeDocType();
    return this.allDocsRaw().filter(d => {
      const normalize   = (s: string) => (s || '').toLowerCase().replace(/[\s\-_]/g, '');
      const matchType   = dt === 'ALL' || normalize(d.documentType) === normalize(dt);
      const matchStatus = st === 'ALL' || (d.documentStatus || '') === st;
      const matchSearch =
        !q ||
        (d.vehicle?.vehicleNo  || '').toLowerCase().includes(q) ||
        (d.vehicle?.brandModel || '').toLowerCase().includes(q) ||
        (d.documentNo          || '').toLowerCase().includes(q) ||
        (d.documentType        || '').toLowerCase().includes(q) ||
        (d.documentStatus      || '').toLowerCase().includes(q) ||
        String(d.documentId    || '').includes(q);
      return matchType && matchStatus && matchSearch;
    });
  });

  pagedDocs = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredDocs().slice(start, start + this.pageSize());
  });

  get totalPages()    { return Math.max(1, Math.ceil(this.filteredDocs().length / this.pageSize())); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.data.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.activeDocType.set(data['docType'] || 'ALL');
    });
    this.loadDocuments();
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  // ── LOAD ──
  loadDocuments() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      setTimeout(() => { this.allDocsRaw.set(DUMMY_DOCS); this.isLoading.set(false); }, 400);
      return;
    }

    this.http
      .get<any[]>(API_CONFIG.DOCUMENTS, { headers: this.JSON_HEADERS, observe: 'response' })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError(err => {
          console.error('❌ documents GET error:', err?.status, err?.error);
          this.hasError.set(true);
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe((res: HttpResponse<any[]> | null) => {
        if (!res) return;
        this.allDocsRaw.set(res.status === 204 || !res.body ? [] : res.body);
        this.isLoading.set(false);
      });
  }

  onSearch      (v: string) { this.searchText.set(v);   this.currentPage.set(1); }
  onFilterStatus(v: string) { this.filterStatus.set(v); this.currentPage.set(1); }
  onPageSize    (v: string) { this.pageSize.set(+v);    this.currentPage.set(1); }
  goToPage      (p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }

  // ── OPEN ADD MODAL ──
  openAddModal() {
    this.form = EMPTY_FORM();
    this.isEditMode.set(false); this.editId.set(null);
    this.editExistingFileName.set('');
    this.saveError.set(''); this.saveSuccess.set('');
    this.showModal.set(true);
  }

  // ── OPEN EDIT MODAL ──
  openEditModal(d: any) {
    this.form = {
      vehicleId     : String(d.vehicle?.vehicleId ?? ''),
      enterBy       : d.enterBy        || 'ADMIN',
      documentType  : d.documentType   || '',
      documentNo    : d.documentNo     || '',
      startDate     : d.startDate      || '',
      expiryDate    : d.expiryDate     || '',
      documentStatus: d.documentStatus || 'Valid',
      remarks       : d.remarks        || '',
      selectedFile  : null,
      pucNo: '', pucStart: '', pucExpiry: '', pucFile: null,
      insuranceNo: '', insuranceStart: '', insuranceExpiry: '', insuranceFile: null,
      rcNo: '', rcStart: '', rcExpiry: '', rcFile: null,
      fitnessNo: '', fitnessStart: '', fitnessExpiry: '', fitnessFile: null,
      loadTestNo: '', loadTestStart: '', loadTestExpiry: '', loadTestFile: null,
    };
    this.editVehicleNo.set(d.vehicle?.vehicleNo || String(d.vehicle?.vehicleId ?? ''));
    this.editExistingFileName.set(d.fileName || '');
    this.isEditMode.set(true); this.editId.set(d.documentId);
    this.saveError.set(''); this.saveSuccess.set('');
    this.showViewModal.set(false);
    this.showModal.set(true);
  }

  closeModal    ()       { this.showModal.set(false); }
  openViewModal (d: any) { this.viewDoc.set(d); this.showViewModal.set(true); }
  closeViewModal()       { this.showViewModal.set(false); }

  // ── FILE SELECTION ──
  onFileSelected(event: Event, type: 'puc' | 'insurance' | 'rc' | 'fitness' | 'loadTest' | 'single'): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    if (file.type !== 'application/pdf') {
      this.saveError.set('Only PDF files are allowed.'); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.saveError.set('File size must be under 10 MB.'); return;
    }
    this.saveError.set('');
    if (type === 'puc')       this.form.pucFile       = file;
    if (type === 'insurance') this.form.insuranceFile = file;
    if (type === 'rc')        this.form.rcFile        = file;
    if (type === 'fitness')   this.form.fitnessFile   = file;
    if (type === 'loadTest')  this.form.loadTestFile  = file;
    if (type === 'single')    this.form.selectedFile  = file;
  }

  clearFile(event: Event, type: 'puc' | 'insurance' | 'rc' | 'fitness' | 'loadTest' | 'single'): void {
    event.preventDefault(); event.stopPropagation();
    if (type === 'puc')       { this.form.pucFile       = null; this.resetInput('pucFileInput');       }
    if (type === 'insurance') { this.form.insuranceFile = null; this.resetInput('insuranceFileInput'); }
    if (type === 'rc')        { this.form.rcFile        = null; this.resetInput('rcFileInput');        }
    if (type === 'fitness')   { this.form.fitnessFile   = null; this.resetInput('fitnessFileInput');   }
    if (type === 'loadTest')  { this.form.loadTestFile  = null; this.resetInput('loadTestFileInput');  }
    if (type === 'single')    { this.form.selectedFile  = null; this.resetInput('pdfFileInput');       }
  }

  private resetInput(id: string): void {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.value = '';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  // ── SAVE (handles ADD multi-doc and EDIT single-doc) ──
  saveDocument() {
    this.saveError.set('');
    this.saveSuccess.set('');

    // ════ EDIT MODE ════
    if (this.isEditMode()) {
      if (!this.form.documentType.trim()) { this.saveError.set('Document Type is required.'); return; }
      if (!this.form.documentNo.trim())   { this.saveError.set('Document No is required.');   return; }
      if (!this.form.startDate)           { this.saveError.set('Start Date is required.');     return; }
      if (!this.form.expiryDate)          { this.saveError.set('Expiry Date is required.');    return; }
      if (this.form.startDate >= this.form.expiryDate) {
        this.saveError.set('Expiry Date must be after Start Date.'); return;
      }
      if (this.isSaving()) return;
      this.isSaving.set(true);

      const fd = new FormData();
      const docJson = JSON.stringify({
        vehicle        : { vehicleId: Number(this.form.vehicleId) },
        documentType   : this.form.documentType,
        documentNo     : this.form.documentNo.trim(),
        startDate      : this.form.startDate,
        expiryDate     : this.form.expiryDate,
        documentStatus : this.form.documentStatus,
        remarks        : this.form.remarks || null,
        enterBy        : this.form.enterBy || 'ADMIN',
        enterDate      : new Date().toISOString().split('T')[0],
      });
      fd.append('document', new Blob([docJson], { type: 'application/json' }));
      if (this.form.selectedFile) {
        fd.append('file', this.form.selectedFile, this.form.selectedFile.name);
      }

      const url = `${API_CONFIG.DOCUMENTS_UPDATE}/${this.editId()}`;
      this.http.put(url, fd, { headers: this.HEADERS })
        .pipe(
          timeout(HTTP_TIMEOUT_MS),
          takeUntil(this.destroy$),
          catchError((err: any) => { this.handleHttpError(err); return of(null); })
        )
        .subscribe((res: any) => {
          if (!res) return;
          this.saveSuccess.set('✅ Document updated successfully.');
          this.isSaving.set(false);
          const list = [...this.allDocsRaw()];
          const idx  = list.findIndex(d => d.documentId === this.editId());
          if (idx !== -1) list[idx] = { ...list[idx], ...res };
          this.allDocsRaw.set(list);
          setTimeout(() => this.closeModal(), 1200);
        });
      return;
    }

    // ════ ADD MODE — multi-doc upload (all 5 types) ════
    if (!String(this.form.vehicleId).trim()) { this.saveError.set('Vehicle ID is required.'); return; }
    if (!this.form.enterBy.trim())           { this.saveError.set('Entered By is required.'); return; }

    const hasFile =
      this.form.pucFile      ||
      this.form.insuranceFile||
      this.form.rcFile       ||
      this.form.fitnessFile  ||
      this.form.loadTestFile;

    if (!hasFile) {
      this.saveError.set('At least one PDF file must be selected (PUC, Insurance, RC, Fitness, or Load Test).');
      return;
    }

    // Per-section validation (only validate if file is attached)
    if (this.form.pucFile) {
      if (!this.form.pucNo.trim()) { this.saveError.set('PUC No is required.'); return; }
      if (!this.form.pucStart)     { this.saveError.set('PUC Start Date is required.'); return; }
      if (!this.form.pucExpiry)    { this.saveError.set('PUC Expiry Date is required.'); return; }
      if (this.form.pucStart >= this.form.pucExpiry) { this.saveError.set('PUC Expiry must be after Start Date.'); return; }
    }
    if (this.form.insuranceFile) {
      if (!this.form.insuranceNo.trim()) { this.saveError.set('Insurance No is required.'); return; }
      if (!this.form.insuranceStart)     { this.saveError.set('Insurance Start Date is required.'); return; }
      if (!this.form.insuranceExpiry)    { this.saveError.set('Insurance Expiry Date is required.'); return; }
      if (this.form.insuranceStart >= this.form.insuranceExpiry) { this.saveError.set('Insurance Expiry must be after Start Date.'); return; }
    }
    if (this.form.rcFile) {
      if (!this.form.rcNo.trim()) { this.saveError.set('RC No is required.'); return; }
      if (!this.form.rcStart)     { this.saveError.set('RC Start Date is required.'); return; }
      if (!this.form.rcExpiry)    { this.saveError.set('RC Expiry Date is required.'); return; }
      if (this.form.rcStart >= this.form.rcExpiry) { this.saveError.set('RC Expiry must be after Start Date.'); return; }
    }
    if (this.form.fitnessFile) {
      if (!this.form.fitnessNo.trim()) { this.saveError.set('Fitness No is required.'); return; }
      if (!this.form.fitnessStart)     { this.saveError.set('Fitness Start Date is required.'); return; }
      if (!this.form.fitnessExpiry)    { this.saveError.set('Fitness Expiry Date is required.'); return; }
      if (this.form.fitnessStart >= this.form.fitnessExpiry) { this.saveError.set('Fitness Expiry must be after Start Date.'); return; }
    }
    if (this.form.loadTestFile) {
      if (!this.form.loadTestNo.trim()) { this.saveError.set('Load Test No is required.'); return; }
      if (!this.form.loadTestStart)     { this.saveError.set('Load Test Start Date is required.'); return; }
      if (!this.form.loadTestExpiry)    { this.saveError.set('Load Test Expiry Date is required.'); return; }
      if (this.form.loadTestStart >= this.form.loadTestExpiry) { this.saveError.set('Load Test Expiry must be after Start Date.'); return; }
    }

    if (this.isSaving()) return;
    this.isSaving.set(true);

    const fd = new FormData();
    fd.append('vehicleId', String(Number(this.form.vehicleId)));
    fd.append('enterBy',   this.form.enterBy.trim());

    // Append each section only if file exists (matches backend @RequestParam required=false)
    if (this.form.pucFile) {
      fd.append('pucNo',     this.form.pucNo.trim());
      fd.append('pucStart',  this.form.pucStart);
      fd.append('pucExpiry', this.form.pucExpiry);
      fd.append('pucFile',   this.form.pucFile, this.form.pucFile.name);
    }
    if (this.form.insuranceFile) {
      fd.append('insuranceNo',     this.form.insuranceNo.trim());
      fd.append('insuranceStart',  this.form.insuranceStart);
      fd.append('insuranceExpiry', this.form.insuranceExpiry);
      fd.append('insuranceFile',   this.form.insuranceFile, this.form.insuranceFile.name);
    }
    if (this.form.rcFile) {
      fd.append('rcNo',     this.form.rcNo.trim());
      fd.append('rcStart',  this.form.rcStart);
      fd.append('rcExpiry', this.form.rcExpiry);
      fd.append('rcFile',   this.form.rcFile, this.form.rcFile.name);
    }
    // ── NEW: Fitness (backend needs to add these params) ──
    if (this.form.fitnessFile) {
      fd.append('fitnessNo',     this.form.fitnessNo.trim());
      fd.append('fitnessStart',  this.form.fitnessStart);
      fd.append('fitnessExpiry', this.form.fitnessExpiry);
      fd.append('fitnessFile',   this.form.fitnessFile, this.form.fitnessFile.name);
    }
    // ── NEW: Load Test (backend needs to add these params) ──
    if (this.form.loadTestFile) {
      fd.append('loadTestNo',     this.form.loadTestNo.trim());
      fd.append('loadTestStart',  this.form.loadTestStart);
      fd.append('loadTestExpiry', this.form.loadTestExpiry);
      fd.append('loadTestFile',   this.form.loadTestFile, this.form.loadTestFile.name);
    }

    this.http.post<any[]>(API_CONFIG.DOCUMENTS_UPLOAD, fd, { headers: this.HEADERS })
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        takeUntil(this.destroy$),
        catchError((err: any) => { this.handleHttpError(err); return of(null); })
      )
      .subscribe((res: any[] | null) => {
        if (!res) return;
        this.allDocsRaw.set([...res, ...this.allDocsRaw()]);
        this.saveSuccess.set(`✅ ${res.length} document(s) uploaded successfully.`);
        this.isSaving.set(false);
        setTimeout(() => this.closeModal(), 1500);
      });
  }

  // ── CENTRALISED HTTP ERROR HANDLER ──
  private handleHttpError(err: any): void {
    const status = err?.status ?? '?';
    const body   = err?.error;
    if (body instanceof Blob) {
      body.text().then(text => {
        let display = text;
        try {
          const parsed = JSON.parse(text);
          display = parsed?.message || parsed?.error || text;
        } catch { /* plain text */ }
        this.saveError.set(`[${status}] ${display}`);
      });
    } else {
      const msg =
        (typeof body === 'string' && body.length < 400 ? body : null) ||
        body?.message || body?.error ||
        `HTTP ${status} — check F12 → Network Response tab`;
      this.saveError.set(msg);
    }
    this.isSaving.set(false);
  }

  // ── PDF DOWNLOAD ──
  downloadPdf(doc: any): void {
    if (!doc?.documentId) return;
    const url = `${API_CONFIG.DOCUMENTS_DOWNLOAD}/${doc.documentId}`;
    this.http.get(url, { headers: this.HEADERS, responseType: 'blob' })
      .pipe(
        timeout(30000),
        takeUntil(this.destroy$),
        catchError(err => { alert('Could not download PDF.'); return of(null); })
      )
      .subscribe(blob => {
        if (!blob) return;
        const link    = document.createElement('a');
        link.href     = URL.createObjectURL(blob);
        link.download = doc.fileName || `document_${doc.documentId}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
      });
  }

  // ── HELPERS ──
  formatDate(d: string): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getDaysLeft(expiryDate: string): number {
    if (!expiryDate) return 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const end   = new Date(expiryDate); end.setHours(0,0,0,0);
    return Math.ceil((end.getTime() - today.getTime()) / 86400000);
  }

  getDaysLeftLabel(expiryDate: string): string {
    const days = this.getDaysLeft(expiryDate);
    if (days < 0)   return `Expired ${Math.abs(days)}d ago`;
    if (days === 0) return 'Expires today';
    return `${days} days`;
  }

  getDaysLeftClass(expiryDate: string): string {
    const days = this.getDaysLeft(expiryDate);
    if (days < 0)   return 'badge badge-expired';
    if (days <= 30) return 'badge badge-expiring';
    return 'badge badge-active';
  }

  getStatusClass(s: string): string {
    switch ((s || '').toLowerCase()) {
      case 'valid'   : return 'badge badge-active';
      case 'active'  : return 'badge badge-active';
      case 'expiring': return 'badge badge-expiring';
      case 'expired' : return 'badge badge-expired';
      default        : return 'badge badge-surrendered';
    }
  }

  getVehicleClassBadge(c: string): string {
    switch (c) {
      case 'Two_Wheeler'    : return 'badge badge-employee';
      case 'Four_Wheeler'   : return 'badge badge-active';
      case 'Heavy_Machinery': return 'badge badge-expiring';
      default               : return 'badge badge-surrendered';
    }
  }

  getDocTypeBadge(t: string): string {
    switch ((t || '').toUpperCase()) {
      case 'PUC'      : return 'badge badge-puc-pill';
      case 'INSURANCE': return 'badge badge-insurance-pill';
      case 'RC'       : return 'badge badge-rc-pill';
      case 'FITNESS'  : return 'badge badge-fitness-pill';
      case 'LOAD_TEST':
      case 'LOAD TEST': return 'badge badge-loadtest-pill';
      default         : return 'badge badge-surrendered';
    }
  }

  onDocumentNoInput(event: Event): void {
    const input   = event.target as HTMLInputElement;
    const cleaned = input.value.toUpperCase().replace(/\s{2,}/g, ' ').trimStart();
    input.value          = cleaned;
    this.form.documentNo = cleaned;
  }

  onUpperCase(event: Event, field: keyof DocForm): void {
    const input = event.target as HTMLInputElement;
    const val   = input.value.toUpperCase().replace(/\s{2,}/g, ' ').trimStart();
    input.value = val;
    (this.form as any)[field] = val;
  }

  onVehicleIdInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/[^0-9]/g, '');
    input.value = cleaned;
    this.form.vehicleId = cleaned;
  }
}