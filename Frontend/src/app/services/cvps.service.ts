import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { API_CONFIG, CVPS_URLS } from '../core/api.config';
import { AuthService } from '../core/auth.service';

export interface CvpsRequest {
  requestNo?: number;
  contractorId: string;
  natureOfJob: string;
  vehicleNo: string;
  vehicleType: string;
  permissionFrom: string;
  permissionTo: string;
  reqStatus?: string;
  createdBy: string;
  createdDate?: string;
  vehicleDocuments?: CvpsVehicleDoc[];
  employeeDetails?: CvpsPersonnel[];
  requestHistories?: CvpsHistory[];
}

export interface CvpsVehicleDoc {
  id?: number;
  documentType: string;
  documentNo: string;
  validFrom: string;
  validTill?: string;
  filename?: string;
}

export interface CvpsPersonnel {
  id?: number;
  empJob: string;
  empType: string;
  empNo?: number;
  aadharNo?: string;
  name: string;
  mobileNo?: string;        // ✅ FIX 1: added for contractor-approver.html
}

export interface WorkflowAction {
  action: 'CONFIRM' | 'APPROVE' | 'REJECT' | 'HOLD';
  empNo: string;
  remarks: string;
}

export interface CvpsHistory {
  historyId?: number;
  actionTaken: string;
  empNo: string;
  remarks?: string;
  actionDate?: string;
}

export const CVPS_STATUS = {
  CREATED: 'CREATED',
  CONFIRMED: 'CONFIRMED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  HOLD: 'HOLD',
} as const;

export type CvpsStatusType = typeof CVPS_STATUS[keyof typeof CVPS_STATUS];

@Injectable({ providedIn: 'root' })
export class CvpsService {

  private http = inject(HttpClient);
  private auth = inject(AuthService);

  // ── 1. POST — Create new request ────────────────────────────────────
  createRequest(payload: CvpsRequest): Observable<CvpsRequest> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required.'));
    }
    return this.http.post<CvpsRequest>(API_CONFIG.CVPS_BASE, payload);
  }

  // ── 2. POST — Upload all vehicle documents ───────────────────────────
  uploadAllDocuments(
    requestNo: number,
    docs: { docType: string; docNo: string; validFrom: string; validTo: string; file: File }[]
  ): Observable<string> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required.'));
    }
    const fd = new FormData();
    docs.forEach(d => {
      fd.append('documentType', d.docType);
      fd.append('documentNo', d.docNo);
      fd.append('validFrom', d.validFrom);
      fd.append('validTill', d.validTo || '');
      fd.append('files', d.file, d.file.name);
    });
    return this.http.post<string>(
      CVPS_URLS.uploadDocs(requestNo), fd,
      { responseType: 'text' as 'json' }
    );
  }

  // ── 3. POST — Add personnel ──────────────────────────────────────────
  addPersonnel(requestNo: number, payload: CvpsPersonnel): Observable<CvpsPersonnel> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required.'));
    }
    return this.http.post<CvpsPersonnel>(CVPS_URLS.addPersonnel(requestNo), payload);
  }

  // ── 4. POST — Workflow action ────────────────────────────────────────
  doWorkflowAction(requestNo: number, payload: WorkflowAction): Observable<CvpsRequest> {
    const action = payload.action.toUpperCase();
    if (action === 'CONFIRM' && !this.auth.isConfirmer()) {
      return throwError(() => new Error('Access Denied: CONFIRMER role required.'));
    }
    if (['APPROVE', 'REJECT'].includes(action) && !this.auth.isApprover()) {
      return throwError(() => new Error('Access Denied: APPROVER role required.'));
    }
    if (action === 'HOLD' && !this.auth.isApprover() && !this.auth.isConfirmer()) {
      return throwError(() => new Error('Access Denied: CONFIRMER or APPROVER role required.'));
    }
    return this.http.post<CvpsRequest>(CVPS_URLS.workflowAction(requestNo), payload);
  }

  // ── 5. PUT — Modify existing request ────────────────────────────────
  modifyRequest(requestNo: number, payload: CvpsRequest): Observable<CvpsRequest> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required.'));
    }
    return this.http.put<CvpsRequest>(CVPS_URLS.modify(requestNo), payload);
  }

  // ── 6. POST — Replace a single document ─────────────────────────────
  replaceDocument(
    requestNo: number,
    doc: { docType: string; docNo: string; validFrom: string; validTo: string; file: File }
  ): Observable<string> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required.'));
    }
    const fd = new FormData();
    fd.append('documentType', doc.docType);
    fd.append('documentNo', doc.docNo);
    fd.append('validFrom', doc.validFrom);
    fd.append('validTill', doc.validTo || '');
    fd.append('file', doc.file, doc.file.name);
    return this.http.post<string>(
      CVPS_URLS.replaceDoc(requestNo), fd,
      { responseType: 'text' as 'json' }
    );
  }

  // ── 7. GET — By vehicle number ───────────────────────────────────────
  getByVehicleNo(vehicleNo: string): Observable<CvpsRequest> {
    return this.http.get<CvpsRequest>(
      CVPS_URLS.getByVehicle(vehicleNo.trim().toUpperCase())
    );
  }

  // ── 8. GET — All requests ────────────────────────────────────────────
  getAllRequests(): Observable<CvpsRequest[]> {
    return this.http.get<CvpsRequest[]>(API_CONFIG.CVPS_GET_ALL);
  }

  // ── 9. GET — Filter by status ────────────────────────────────────────
  getByStatus(status: CvpsStatusType | string): Observable<CvpsRequest[]> {
    const params = new HttpParams().set('status', status.toString().toUpperCase());
    return this.http.get<CvpsRequest[]>(API_CONFIG.CVPS_FILTER, { params });
  }

  // ── 10. GET — Gate validation ────────────────────────────────────────
  validateGatePass(vehicleNo: string): Observable<CvpsRequest> {
    return this.http.get<CvpsRequest>(
      CVPS_URLS.validateGate(vehicleNo.trim().toUpperCase())
    );
  }

  // ── 11. GET — Download document blob ────────────────────────────────
  downloadDocument(documentId: number): Observable<Blob> {
    return this.http.get(
      CVPS_URLS.downloadDoc(documentId),
      { responseType: 'blob' }
    );
  }

  // ── 12. GET — Download Excel report ─────────────────────────────────
  downloadExcelReport(): Observable<Blob> {
    return this.http.get(API_CONFIG.CVPS_DOWNLOAD_EXCEL, { responseType: 'blob' });
  }

  // ── 13. GET — Contractor details for name lookup ─────────────────────
  // Calls main VPMS backend (port 8080), not CVPS (port 8086)
  fetchContractorDetails(): Observable<any[]> {
    return this.http.get<any[]>(API_CONFIG.EMPLOYEE_REPORT);   // ← use the defined constant
  }

  // ── 14. POST — Upload personnel documents (DL, Aadhaar, Photo) ───────
  // ✅ FIX 3: added for vehicle-permission-form.ts uploadPersonnelDocuments()
  uploadPersonnelDocuments(personnelId: number, files: File[]): Observable<any> {
    const fd = new FormData();
    files.forEach(f => fd.append('files', f, f.name));
    return this.http.post<any>(
      `${API_CONFIG.CVPS_BASE}/personnel/${personnelId}/upload-documents`, fd
    );
  }

  // ── 15. ALIAS — getRequestsByStatus → getByStatus ────────────────────
  // ✅ FIX 4: added for contractor-confirmer.ts getRequestsByStatus()
  getRequestsByStatus(status: string): Observable<CvpsRequest[]> {
    return this.getByStatus(status);
  }

  // ── 16. ALIAS — executeWorkflowAction → doWorkflowAction ─────────────
  // ✅ FIX 5: added for contractor-confirmer.ts executeWorkflowAction()
  // Accepts plain string action to avoid strict union type mismatch (TS2345)
  executeWorkflowAction(
    requestNo: number,
    payload: { action: string; empNo: string; remarks: string }
  ): Observable<CvpsRequest> {
    return this.doWorkflowAction(requestNo, payload as WorkflowAction);
  }

  // ── UTILITY — Trigger browser file download ──────────────────────────
  triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}