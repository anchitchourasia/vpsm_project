import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, timeout, catchError, of } from 'rxjs';
import { API_CONFIG } from '../core/api.config';

const USE_DUMMY_DATA = false;
const HTTP_TIMEOUT_MS = 12000;

// ✅ CORRECTED: Real documentType values from live DB (Postman confirmed)
const DOC_TYPE_LABELS: Record<string, string> = {
  'RC'        : 'RC (Registration)',
  'PUC'       : 'PUC Certificate',
  'Insurance' : 'Insurance',
  'Fitness'   : 'Fitness Certificate',
  'Load_Test' : 'Load Test',
  'Load Test' : 'Load Test',   // ← DB stores with space
};

// Route data → DB documentType value
const ROUTE_TO_DOCTYPE: Record<string, string> = {
  'RC'        : 'RC', 
  'PUC'       : 'PUC',
  'Insurance' : 'Insurance',
  'Fitness'   : 'Fitness',
  'Load_Test' : 'Load Test',
  'ALL'       : 'ALL',
};

// ✅ CORRECTED dummy data matches real Postman response shape exactly
const DUMMY_DOCS: any[] = [
  {
    documentId: 21, documentType: 'RC', documentNo: 'RC-MH02-REG-8822',
    startDate: '2026-06-01', expiryDate: '2041-05-31',
    documentStatus: 'Valid', remarks: 'Permanent smart card registration verified',
    enterBy: 'HEG_ADMIN', enterDate: '2026-06-01',
    vehicle: { vehicleId: 40, vehicleNo: 'MP04HEG1111', vehicleType: 'cycle', vehicleClass: 'Two_Wheeler', brandModel: 'honda', isActive: 'N', isBlacklisted: 'Y' }
  },
  {
    documentId: 22, documentType: 'Insurance', documentNo: 'INS-POLICY-7762A',
    startDate: '2026-03-01', expiryDate: '2027-03-01',
    documentStatus: 'Valid', remarks: 'Comprehensive cover',
    enterBy: 'HEG_ADMIN', enterDate: '2026-05-28',
    vehicle: { vehicleId: 40, vehicleNo: 'MP04HEG1111', vehicleType: 'cycle', vehicleClass: 'Two_Wheeler', brandModel: 'honda', isActive: 'N', isBlacklisted: 'Y' }
  },
  {
    documentId: 44, documentType: 'Insurance', documentNo: 'INS-2026-9921',
    startDate: '2026-05-29', expiryDate: '2027-05-29',
    documentStatus: 'ACTIVE', remarks: 'Verified physical copy',
    enterBy: 'ADMIN', enterDate: '2026-05-28',
    vehicle: { vehicleId: 1, vehicleNo: 'MP04HEG2026', vehicleType: 'Heavy Logistics Truck', vehicleClass: 'Heavy_Machinery', brandModel: 'Tata Prima 2830.K', isActive: 'Y', isBlacklisted: 'N' }
  },
  {
    documentId: 45, documentType: 'PUC', documentNo: 'PUC-HEG-2026-881',
    startDate: '2026-05-01', expiryDate: '2026-11-01',
    documentStatus: 'Valid', remarks: 'Exhaust emissions check passed',
    enterBy: 'SYSTEM', enterDate: '2026-05-30',
    vehicle: { vehicleId: 1, vehicleNo: 'MP04HEG2026', vehicleType: 'Heavy Logistics Truck', vehicleClass: 'Heavy_Machinery', brandModel: 'Tata Prima 2830.K', isActive: 'Y', isBlacklisted: 'N' }
  },
  {
    documentId: 81, documentType: 'Insurance', documentNo: 'INS-992031-HEG',
    startDate: '2026-06-02', expiryDate: '2027-06-02',
    documentStatus: 'Valid', remarks: 'Annual vehicle renewal insurance policy',
    enterBy: 'ADMIN', enterDate: '2026-06-02',
    vehicle: { vehicleId: 121, vehicleNo: 'MP04CF4174', vehicleType: 'Car', vehicleClass: 'Four_Wheeler', brandModel: 'Tata', isActive: 'Y', isBlacklisted: 'N' }
  },
];

interface DocForm {
  vehicleId     : string;
  documentType  : string;
  documentNo    : string;
  startDate     : string;
  expiryDate    : string;
  documentStatus: string;
  remarks       : string;
}

const EMPTY_FORM = (docType = ''): DocForm => ({
  vehicleId: '', documentType: docType, documentNo: '',
  startDate: '', expiryDate: '', documentStatus: 'Valid', remarks: '',
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
    <p>Loading {{ currentDocLabel() }} records...</p>
  </div>

  <!-- ERROR -->
  <div *ngIf="hasError() && !isLoading()" class="state-box error-box">
    <i class="bi bi-exclamation-triangle-fill"></i>
    <p>Failed to load data. Check if backend is running at correct IP.</p>
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
          placeholder="Search vehicle no, doc no, brand, status..."
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
              <td>{{ DOC_TYPE_LABELS[d.documentType] || d.documentType || '—' }}</td>
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
              <td class="td-muted">{{ d.enterBy || '—' }}</td>
              <td>
                <div class="action-btns">
                  <button class="btn-icon-view" (click)="openViewModal(d)"><i class="bi bi-eye"></i> View</button>
                  <button class="btn-icon-edit" (click)="openEditModal(d)"><i class="bi bi-pencil-square"></i> Edit</button>
                </div>
              </td>
            </tr>
            <tr *ngIf="pagedDocs().length === 0">
              <td colspan="13" class="no-data">No {{ currentDocLabel() }} records found.</td>
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

<!-- ══════════════════════════════════════════ -->
<!-- ADD / EDIT MODAL                           -->
<!-- ══════════════════════════════════════════ -->
<div class="modal-overlay" *ngIf="showModal()" (click)="closeModal()"></div>
<div class="modal-box modal-lg" *ngIf="showModal()">
  <div class="modal-header" [class]="isEditMode() ? 'modal-header-edit' : 'modal-header-add'">
    <h3>{{ isEditMode() ? '✏️ Edit Document — #' + editId() : '📄 Upload New Document' }}</h3>
    <button class="modal-close" (click)="closeModal()"><i class="bi bi-x-lg"></i></button>
  </div>

  <div class="modal-body">
    <div class="alert-success" *ngIf="saveSuccess()">{{ saveSuccess() }}</div>
    <div class="alert-error"   *ngIf="saveError()">{{ saveError() }}</div>

    <div class="form-grid">

      <!-- Vehicle ID (add only) -->
      <div class="form-group" *ngIf="!isEditMode()">
        <label>Vehicle ID <span class="req">*</span></label>
        <input type="number" [(ngModel)]="form.vehicleId"
          placeholder="Enter Vehicle ID from Vehicles Master"
          class="form-control" min="1" />
        <small class="field-hint">Must match a valid Vehicle ID in the database</small>
      </div>

      <!-- Vehicle No (edit — read only) -->
      <div class="form-group" *ngIf="isEditMode()">
        <label>Vehicle No</label>
        <input type="text" [value]="editVehicleNo()" class="form-control" readonly />
        <small class="field-hint">Vehicle cannot be changed after upload</small>
      </div>

      <!-- Document Type -->
      <div class="form-group">
        <label>Document Type <span class="req">*</span></label>
        <select [(ngModel)]="form.documentType" class="form-control" [disabled]="isEditMode()">
          <option value="">— Select Type —</option>
          <option value="RC">RC (Registration)</option>
          <option value="PUC">PUC Certificate</option>
          <option value="Insurance">Insurance</option>
          <option value="Fitness">Fitness Certificate</option>
          <option value="Load_Test">Load Test</option>
        </select>
        <small class="field-hint" *ngIf="isEditMode()">Document type cannot be changed after upload</small>
      </div>

      <!-- Document No -->
      <div class="form-group">
        <label>Document No <span class="req">*</span></label>
        <input type="text" [(ngModel)]="form.documentNo"
          placeholder="e.g. PUC-HEG-2026-001"
          class="form-control" />
      </div>

      <!-- Start Date -->
      <div class="form-group">
        <label>Start Date <span class="req">*</span></label>
        <input type="date" [(ngModel)]="form.startDate" class="form-control" />
      </div>

      <!-- Expiry Date -->
      <div class="form-group">
        <label>Expiry Date <span class="req">*</span></label>
        <input type="date" [(ngModel)]="form.expiryDate" class="form-control" />
      </div>

      <!-- Status -->
      <div class="form-group">
        <label>Document Status</label>
        <select [(ngModel)]="form.documentStatus" class="form-control">
          <option value="Valid">Valid</option>
          <option value="ACTIVE">Active</option>
          <option value="Expired">Expired</option>
          <option value="Expiring">Expiring</option>
        </select>
      </div>

      <!-- Remarks -->
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
    <button class="btn-save"   (click)="saveDocument()" [disabled]="isSaving()">
      <span *ngIf="isSaving()"><i class="bi bi-hourglass-split"></i> Saving...</span>
      <span *ngIf="!isSaving()"><i class="bi bi-floppy-fill"></i> {{ isEditMode() ? 'Update' : 'Upload' }}</span>
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

      <!-- VEHICLE -->
      <div class="detail-section">
        <div class="detail-section-title">VEHICLE</div>
        <div class="detail-row"><span class="detail-label">Vehicle ID</span><strong class="detail-value">{{ viewDoc().vehicle?.vehicleId ?? '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Vehicle No</span><strong class="detail-value">{{ viewDoc().vehicle?.vehicleNo ?? '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Type</span><strong class="detail-value">{{ viewDoc().vehicle?.vehicleType ?? '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Class</span>
          <span [class]="getVehicleClassBadge(viewDoc().vehicle?.vehicleClass)">{{ viewDoc().vehicle?.vehicleClass ?? '—' }}</span>
        </div>
        <div class="detail-row"><span class="detail-label">Brand / Model</span><strong class="detail-value">{{ viewDoc().vehicle?.brandModel ?? '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Active</span><strong class="detail-value">{{ viewDoc().vehicle?.isActive === 'Y' ? 'Yes' : 'No' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Blacklisted</span>
          <span [class]="viewDoc().vehicle?.isBlacklisted === 'Y' ? 'badge badge-expired' : 'badge badge-active'">
            {{ viewDoc().vehicle?.isBlacklisted === 'Y' ? 'Yes' : 'No' }}
          </span>
        </div>
      </div>

      <!-- DOCUMENT INFO -->
      <div class="detail-section">
        <div class="detail-section-title">DOCUMENT INFO</div>
        <div class="detail-row"><span class="detail-label">Document Type</span><strong class="detail-value">{{ DOC_TYPE_LABELS[viewDoc().documentType] || viewDoc().documentType || '—' }}</strong></div>
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
      </div>

      <!-- AUDIT -->
      <div class="detail-section">
        <div class="detail-section-title">AUDIT INFO</div>
        <div class="detail-row"><span class="detail-label">Entered By</span><strong class="detail-value">{{ viewDoc().enterBy || '—' }}</strong></div>
        <div class="detail-row"><span class="detail-label">Enter Date</span><strong class="detail-value">{{ formatDate(viewDoc().enterDate) }}</strong></div>
        <div class="detail-row"><span class="detail-label">Remarks</span><strong class="detail-value">{{ viewDoc().remarks || '—' }}</strong></div>
      </div>

    </div>
  </div>
  <div class="modal-footer">
    <button class="btn-cancel" (click)="closeViewModal()">Close</button>
    <button class="btn-save"   (click)="closeViewModal(); openEditModal(viewDoc())">
      <i class="bi bi-pencil-square"></i> Edit
    </button>
  </div>
</div>
  `,
})
export class Documents implements OnInit, OnDestroy {

  readonly DOC_TYPE_LABELS = DOC_TYPE_LABELS;

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Content-Type': 'application/json',
  });
  private readonly destroy$ = new Subject<void>();

  // ✅ All docs loaded ONCE — 1 GET total, filtered client-side
  private allDocsRaw    = signal<any[]>([]);
  private activeDocType = signal<string>('ALL');

  isLoading = signal(true);
  hasError  = signal(false);
  isDummy   = USE_DUMMY_DATA;

  searchText   = signal('');
  filterStatus = signal('ALL');
  currentPage  = signal(1);
  pageSize     = signal(10);

  showModal    = signal(false);
  isEditMode   = signal(false);
  isSaving     = signal(false);
  saveError    = signal('');
  saveSuccess  = signal('');
  editId       = signal<number | null>(null);
  editVehicleNo = signal('');
  form: DocForm = EMPTY_FORM();

  showViewModal = signal(false);
  viewDoc       = signal<any>(null);

  currentDocLabel = computed(() =>
    this.activeDocType() === 'ALL'
      ? 'All Documents'
      : (DOC_TYPE_LABELS[this.activeDocType()] || this.activeDocType())
  );

  // ✅ Client-side filter: docType + status + search
  filteredDocs = computed(() => {
    const q  = this.searchText().toLowerCase();
    const st = this.filterStatus();
    const dt = this.activeDocType();
    return this.allDocsRaw().filter(d => {
      const normalize = (s: string) => (s || '').toLowerCase().replace(/[\s\-]/g, '_');
      const matchType = dt === 'ALL' || normalize(d.documentType) === normalize(dt);     
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
    // Read route data → set active doc type (ALL / RC / PUC / Insurance etc.)
    this.route.data.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.activeDocType.set(data['docType'] || 'ALL');
    });
    // ✅ Single GET — all doc types, all pages
    this.loadDocuments();
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  loadDocuments() {
    this.isLoading.set(true);
    this.hasError.set(false);

    if (USE_DUMMY_DATA) {
      setTimeout(() => { this.allDocsRaw.set(DUMMY_DOCS); this.isLoading.set(false); }, 400);
      return;
    }

    this.http
      .get<any[]>(API_CONFIG.DOCUMENTS, { headers: this.HEADERS, observe: 'response' })
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

  openAddModal() {
    this.form = EMPTY_FORM(this.activeDocType() === 'ALL' ? '' : this.activeDocType());
    this.isEditMode.set(false); this.editId.set(null);
    this.saveError.set(''); this.saveSuccess.set('');
    this.showModal.set(true);
  }

  openEditModal(d: any) {
    this.form = {
      vehicleId     : String(d.vehicle?.vehicleId ?? ''),
      documentType  : d.documentType   || '',
      documentNo    : d.documentNo     || '',
      startDate     : d.startDate      || '',
      expiryDate    : d.expiryDate     || '',
      documentStatus: d.documentStatus || 'Valid',
      remarks       : d.remarks        || '',
    };
    this.editVehicleNo.set(d.vehicle?.vehicleNo || String(d.vehicle?.vehicleId ?? ''));
    this.isEditMode.set(true); this.editId.set(d.documentId);
    this.saveError.set(''); this.saveSuccess.set('');
    this.showViewModal.set(false);
    this.showModal.set(true);
  }

  closeModal    ()      { this.showModal.set(false); }
  openViewModal (d: any){ this.viewDoc.set(d); this.showViewModal.set(true); }
  closeViewModal()      { this.showViewModal.set(false); }

  saveDocument() {
    if (!this.isEditMode() && !String(this.form.vehicleId).trim()) { this.saveError.set('Vehicle ID is required.'); return; }
    if (!this.form.documentType.trim()) { this.saveError.set('Document Type is required.'); return; }
    if (!this.form.documentNo.trim())   { this.saveError.set('Document No is required.');   return; }
    if (!this.form.startDate)           { this.saveError.set('Start Date is required.');     return; }
    if (!this.form.expiryDate)          { this.saveError.set('Expiry Date is required.');    return; }
    if (this.form.startDate >= this.form.expiryDate) { this.saveError.set('Expiry Date must be after Start Date.'); return; }
    if (this.isSaving()) return;

    this.isSaving.set(true);
    this.saveError.set(''); this.saveSuccess.set('');

    // ✅ Payload matches Document.java @ManyToOne — vehicle as nested object
    const payload: any = {
      vehicle        : { vehicleId: Number(this.form.vehicleId) },
      documentType   : this.form.documentType,
      documentNo     : this.form.documentNo.trim(),
      startDate      : this.form.startDate,
      expiryDate     : this.form.expiryDate,
      documentStatus : this.form.documentStatus,
      remarks        : this.form.remarks || null,
      enterBy        : 'ADMIN',
      enterDate      : new Date().toISOString().split('T')[0],
    };

    console.log('📤 Document payload →', JSON.stringify(payload, null, 2));

    if (USE_DUMMY_DATA) {
      setTimeout(() => {
        if (this.isEditMode()) {
          const list = [...this.allDocsRaw()];
          const idx  = list.findIndex(d => d.documentId === this.editId());
          if (idx !== -1) list[idx] = { ...list[idx], ...payload };
          this.allDocsRaw.set(list);
          this.saveSuccess.set('✅ Document updated (dummy).');
        } else {
          this.allDocsRaw.set([{ documentId: Date.now(), ...payload,
            vehicle: { vehicleId: Number(this.form.vehicleId), vehicleNo: 'NEW', vehicleType: '—', vehicleClass: '—', brandModel: '—', isActive: 'Y', isBlacklisted: 'N' }
          }, ...this.allDocsRaw()]);
          this.saveSuccess.set('✅ Document uploaded (dummy).');
        }
        this.isSaving.set(false);
        setTimeout(() => this.closeModal(), 1200);
      }, 500);
      return;
    }

    const req$ = this.isEditMode()
      ? this.http.put(`${API_CONFIG.DOCUMENTS_UPDATE}/${this.editId()}`, payload, { headers: this.HEADERS })
      : this.http.post(API_CONFIG.DOCUMENTS_UPLOAD, payload, { headers: this.HEADERS });

    req$.pipe(
      timeout(HTTP_TIMEOUT_MS),
      takeUntil(this.destroy$),
      catchError((err: any) => {
        const body = err?.error;
        const msg  =
          (typeof body === 'string' && body.length < 300 ? body : null) ||
          body?.message || body?.error ||
          (typeof body === 'object' ? JSON.stringify(body) : null) ||
          `HTTP ${err?.status ?? '?'} — check F12 → Network`;
        console.error('❌ saveDocument error:', err?.status, body);
        this.saveError.set(msg);
        this.isSaving.set(false);
        return of(null);
      })
    ).subscribe((res: any) => {
      if (!res) return;
      const msg = this.isEditMode() ? '✅ Document updated successfully.' : '✅ Document uploaded successfully.';
      this.saveSuccess.set(msg);
      this.isSaving.set(false);
      // ✅ Local update — no extra GET
      if (this.isEditMode()) {
        const list = [...this.allDocsRaw()];
        const idx  = list.findIndex(d => d.documentId === this.editId());
        if (idx !== -1) list[idx] = { ...list[idx], ...res };
        this.allDocsRaw.set(list);
      } else {
        this.allDocsRaw.set([res, ...this.allDocsRaw()]);
      }
      setTimeout(() => this.closeModal(), 1200);
    });
  }

  // ── Helpers ──
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

  // ✅ CORRECTED: handles both "Valid", "ACTIVE", "Expired", "Expiring"
  getStatusClass(s: string): string {
    switch ((s || '').toLowerCase()) {
      case 'valid' : return 'badge badge-active';
      case 'active': return 'badge badge-active';
      case 'expiring': return 'badge badge-expiring';
      case 'expired'  : return 'badge badge-expired';
      default: return 'badge badge-surrendered';
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
}