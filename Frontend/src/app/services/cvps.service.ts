import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { API_CONFIG, CVPS_URLS } from '../core/api.config';
import { AuthService } from '../core/auth.service';   // ✅ FIXED: ../core/ not ./

// ─────────────────────────────────────────────────────────────────────────
// INTERFACES — exactly mirror Java entity fields
// ─────────────────────────────────────────────────────────────────────────

/**
 * Mirrors CvpsRequest.java
 * permissionFrom / permissionTo → LocalDateTime → send as "YYYY-MM-DDTHH:mm:ss"
 */
export interface CvpsRequest {
  requestNo       ?: number;
  contractorId     : string;    // CHAR(9) @Size(max=9) @NotBlank
  natureOfJob      : string;    // VARCHAR(150) @NotBlank
  vehicleNo        : string;    // VARCHAR(20) @Size(4-20)
  vehicleType      : string;    // VARCHAR(10) @Size(max=10)
  permissionFrom   : string;    // "YYYY-MM-DDTHH:mm:ss"
  permissionTo     : string;    // "YYYY-MM-DDTHH:mm:ss"
  reqStatus       ?: string;    // default "CREATED"
  createdBy        : string;    // CHAR(9) @Size(max=9)
  createdDate     ?: string;
  vehicleDocuments ?: CvpsVehicleDoc[];
  employeeDetails  ?: CvpsPersonnel[];
  requestHistories ?: CvpsHistory[];
}

/**
 * Mirrors CvpsVehicleDocument.java
 * validFrom / validTill → LocalDate → send as "YYYY-MM-DD" plain date string
 * Backend does LocalDate.parse(validFrom) — do NOT send datetime with T suffix
 */
export interface CvpsVehicleDoc {
  id           ?: number;
  documentType  : string;    // RC | Insurance | PUC | Fitness | Load Test | AADHAAR | DL
  documentNo    : string;
  validFrom     : string;    // "YYYY-MM-DD"
  validTill    ?: string;    // "YYYY-MM-DD" — optional
  filename     ?: string;
}

/**
 * Mirrors CvpsEmployeeDetail.java
 * Note: field is "aadharNo" (single a) — matches Java entity exactly
 */
export interface CvpsPersonnel {
  id      ?: number;
  empJob   : string;    // DRIVER | HELPER | SUPERVISOR | TECHNICIAN | LABORER | OTHER
  empType  : string;    // CONTRACTOR (always for this system)
  empNo   ?: number;
  aadharNo?: string;    // ← "aadhar" (single a) — must match Java field name
  name     : string;
}

/**
 * WorkflowActionRequest — inner DTO in CvpsApiController.java
 * CONFIRM → CONFIRMED  (CONFIRMER role)
 * APPROVE → APPROVED   (APPROVER role)
 * REJECT  → REJECTED   (APPROVER role)
 * HOLD    → HOLD       (APPROVER role)
 * NOTE: VERIFY / VERIFIER role does NOT exist in this system
 */
export interface WorkflowAction {
  action  : 'CONFIRM' | 'APPROVE' | 'REJECT' | 'HOLD';
  empNo   : string;    // acting employee code — CHAR(9)
  remarks : string;
}

/**
 * Mirrors CvpsRequestHistory.java
 * field is "actionTaken" — matches Java getter exactly
 */
export interface CvpsHistory {
  historyId   ?: number;
  actionTaken  : string;    // CONFIRMED | APPROVED | REJECTED | HOLD
  empNo        : string;
  remarks     ?: string;
  actionDate  ?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// WORKFLOW STATUS CONSTANTS
// Pass these to getByStatus() for type-safe queue filtering
// ─────────────────────────────────────────────────────────────────────────
export const CVPS_STATUS = {
  CREATED  : 'CREATED',    // Submitted by UPLOADER — awaiting CONFIRMER
  CONFIRMED: 'CONFIRMED',  // Confirmed — awaiting APPROVER
  APPROVED : 'APPROVED',   // Gate pass is ACTIVE
  REJECTED : 'REJECTED',   // Rejected by APPROVER
  HOLD     : 'HOLD',       // On hold — can be modified and re-submitted
} as const;

export type CvpsStatusType = typeof CVPS_STATUS[keyof typeof CVPS_STATUS];

// ─────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class CvpsService {

  private http = inject(HttpClient);
  private auth = inject(AuthService);

  // ── 1. POST /api/v1/permissions ────────────────────────────────────────
  // Register a fresh contractor vehicle permission request.
  // ROLE: UPLOADER or ADMIN
  createRequest(payload: CvpsRequest): Observable<CvpsRequest> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required to submit requests.'));
    }
    return this.http.post<CvpsRequest>(API_CONFIG.CVPS_BASE, payload);
  }

  // ── 2. POST /{requestNo}/upload-all-documents ─────────────────────────
  // Backend iterates files[i] with documentType[i], documentNo[i], validFrom[i], validTill[i]
  // validFrom / validTill MUST be "YYYY-MM-DD" — LocalDate.parse() on backend
  // ROLE: UPLOADER or ADMIN
  uploadAllDocuments(
    requestNo : number,
    docs      : { docType: string; docNo: string; validFrom: string; validTo: string; file: File }[]
  ): Observable<string> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required to upload documents.'));
    }
    const fd = new FormData();
    docs.forEach(d => {
      fd.append('documentType', d.docType);
      fd.append('documentNo',   d.docNo);
      fd.append('validFrom',    d.validFrom);
      fd.append('validTill',    d.validTo || '');
      fd.append('files',        d.file, d.file.name);
    });
    return this.http.post<string>(
      CVPS_URLS.uploadDocs(requestNo), fd,
      { responseType: 'text' as 'json' }
    );
  }

  // ── 3. POST /{requestNo}/add-personnel ────────────────────────────────
  // Call once per person — use forkJoin in component for multiple persons
  // ROLE: UPLOADER or ADMIN
  addPersonnel(requestNo: number, payload: CvpsPersonnel): Observable<CvpsPersonnel> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required to add personnel.'));
    }
    return this.http.post<CvpsPersonnel>(CVPS_URLS.addPersonnel(requestNo), payload);
  }

  // ── 4. POST /{requestNo}/workflow-action ──────────────────────────────
  // CONFIRM → CONFIRMER role   → reqStatus = "CONFIRMED"
  // APPROVE → APPROVER  role   → reqStatus = "APPROVED"
  // REJECT  → APPROVER  role   → reqStatus = "REJECTED"
  // HOLD    → APPROVER  role   → reqStatus = "HOLD"
  // Each call writes an immutable row to CVPS_REQUESTS_HISTORY
  doWorkflowAction(requestNo: number, payload: WorkflowAction): Observable<CvpsRequest> {
    const action = payload.action.toUpperCase();
    if (action === 'CONFIRM' && !this.auth.isConfirmer()) {
      return throwError(() => new Error('Access Denied: CONFIRMER role required.'));
    }
    if (['APPROVE', 'REJECT', 'HOLD'].includes(action) && !this.auth.isApprover()) {
      return throwError(() => new Error('Access Denied: APPROVER role required.'));
    }
    return this.http.post<CvpsRequest>(CVPS_URLS.workflowAction(requestNo), payload);
  }

  // ── 5. PUT /{requestNo}/modify ────────────────────────────────────────
  // Only allowed when reqStatus = "CREATED" or "HOLD" (backend enforces)
  // If status was "HOLD", backend resets it back to "CREATED" after save
  // ROLE: UPLOADER or ADMIN
  modifyRequest(requestNo: number, payload: CvpsRequest): Observable<CvpsRequest> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required to modify requests.'));
    }
    return this.http.put<CvpsRequest>(CVPS_URLS.modify(requestNo), payload);
  }

  // ── 6. POST /{requestNo}/replace-document ────────────────────────────
  // If same documentType exists → deletes old file, overwrites DB row
  // If documentType not found   → treated as fresh upload (backend fallback)
  // ROLE: UPLOADER or ADMIN
  replaceDocument(
    requestNo : number,
    doc       : { docType: string; docNo: string; validFrom: string; validTo: string; file: File }
  ): Observable<string> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required to replace documents.'));
    }
    const fd = new FormData();
    fd.append('documentType', doc.docType);
    fd.append('documentNo',   doc.docNo);
    fd.append('validFrom',    doc.validFrom);
    fd.append('validTill',    doc.validTo || '');
    fd.append('file',         doc.file, doc.file.name);  // singular "file" per backend @RequestParam
    return this.http.post<string>(
      CVPS_URLS.replaceDoc(requestNo), fd,
      { responseType: 'text' as 'json' }
    );
  }

  // ── 7. GET /{vehicleNo} ───────────────────────────────────────────────
  // Get a vehicle's latest permission request record
  // Returns 404 if vehicle has no request on file
  // ROLE: All roles (read-only)
  getByVehicleNo(vehicleNo: string): Observable<CvpsRequest> {
    return this.http.get<CvpsRequest>(
      CVPS_URLS.getByVehicle(vehicleNo.trim().toUpperCase())
    );
  }

  // ── 8. GET / ──────────────────────────────────────────────────────────
  // Get ALL requests — no filter
  // ROLE: All roles
  getAllRequests(): Observable<CvpsRequest[]> {
    return this.http.get<CvpsRequest[]>(API_CONFIG.CVPS_GET_ALL);
  }

  // ── 9. GET /summary/filter?status={status} ────────────────────────────
  // Filter requests by workflow queue status
  // Typical usage:
  //   CONFIRMER → getByStatus(CVPS_STATUS.CREATED)    — new requests to confirm
  //   APPROVER  → getByStatus(CVPS_STATUS.CONFIRMED)  — confirmed requests to approve
  //   UPLOADER  → getByStatus(CVPS_STATUS.HOLD)       — held requests to re-edit
  // ROLE: All roles
  getByStatus(status: CvpsStatusType | string): Observable<CvpsRequest[]> {
    const params = new HttpParams().set('status', status.toString().toUpperCase());
    return this.http.get<CvpsRequest[]>(API_CONFIG.CVPS_FILTER, { params });
  }

  // ── 10. GET /summary/validate-gate/{vehicleNo} ───────────────────────
  // Gate terminal check — returns 200 only if reqStatus = "APPROVED"
  // Returns 404 "Access Denied" if not approved
  // ROLE: All roles
  validateGatePass(vehicleNo: string): Observable<CvpsRequest> {
    return this.http.get<CvpsRequest>(
      CVPS_URLS.validateGate(vehicleNo.trim().toUpperCase())
    );
  }

  // ── 11. GET /documents/{documentId}/download ─────────────────────────
  // Streams PDF binary from server (F:/CVPS/uploaded_documents/)
  // Use triggerBlobDownload() helper to open in browser
  // ROLE: CONFIRMER, APPROVER, ADMIN
  downloadDocument(documentId: number): Observable<Blob> {
    return this.http.get(
      CVPS_URLS.downloadDoc(documentId),
      { responseType: 'blob' }
    );
  }

  // ── 12. GET /summary/download-excel ──────────────────────────────────
  // Generates cvps_master_report.xlsx from Oracle on the fly
  // Use triggerBlobDownload() helper to trigger file save dialog
  // ROLE: APPROVER or ADMIN
  downloadExcelReport(): Observable<Blob> {
    return this.http.get(API_CONFIG.CVPS_DOWNLOAD_EXCEL, { responseType: 'blob' });
  }

  // ─────────────────────────────────────────────────────────────────────
  // UTILITY — triggers browser file download from a Blob response
  // Usage:
  //   this.cvps.downloadDocument(id).subscribe(blob =>
  //     this.cvps.triggerBlobDownload(blob, 'document.pdf')
  //   );
  //   this.cvps.downloadExcelReport().subscribe(blob =>
  //     this.cvps.triggerBlobDownload(blob, 'cvps_master_report.xlsx')
  //   );
  // ─────────────────────────────────────────────────────────────────────
  triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}