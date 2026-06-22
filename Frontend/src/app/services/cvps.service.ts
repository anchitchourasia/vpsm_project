// ═══════════════════════════════════════════════════════════════════════════
// CVPS Service — Contractor Vehicle Permission System
// All 12 backend endpoints fully wired.
//
// Role mapping (matches your existing AuthService ROLE_PRIORITY):
//   UPLOADER   → can submit new requests (Step 1,2,3) + replace documents
//   CONFIRMER  → can do workflow action: CONFIRM  → status becomes CONFIRMED
//   APPROVER   → can do workflow action: APPROVE  → status becomes APPROVED
//                                        REJECT   → status becomes REJECTED
//                                        HOLD     → status becomes HOLD
//   ADMIN      → all of the above
//   EMPLOYEE   → read-only (getAllRequests, getByVehicleNo, getByStatus)
//
// NOTE: There is NO VERIFIER role. VERIFY action is not used.
// Workflow flow:  CREATED → CONFIRMED → APPROVED (or REJECTED / HOLD)
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { API_CONFIG, CVPS_URLS } from '../core/api.config';
import { AuthService } from './auth.service';   // for role-guard helpers

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
  validTill    ?: string;    // "YYYY-MM-DD" — optional (backend @RequestParam required=false)
  filename     ?: string;    // absolute path stored on server — read-only from frontend
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
  aadharNo?: string;    // ← "aadhar" not "aadhaar" — must match Java field name
  name     : string;
}

/**
 * WorkflowActionRequest — inner DTO class in CvpsApiController.java
 * action values handled by backend switch: CONFIRM | APPROVE | REJECT | HOLD
 * NOTE: VERIFY is NOT used — no VERIFIER role in your system
 */
export interface WorkflowAction {
  action  : 'CONFIRM' | 'APPROVE' | 'REJECT' | 'HOLD';
  empNo   : string;    // String (CHAR 9) — the acting employee's code
  remarks : string;
}

/**
 * Mirrors CvpsRequestHistory.java
 * field is "actionTaken" (not "action") — matches Java getter exactly
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
// These are the exact reqStatus values stored in DB after each action
// Use these when calling getByStatus() to filter queues
// ─────────────────────────────────────────────────────────────────────────
export const CVPS_STATUS = {
  CREATED  : 'CREATED',    // Just submitted by UPLOADER — awaiting CONFIRMER
  CONFIRMED: 'CONFIRMED',  // CONFIRMER approved — awaiting APPROVER
  APPROVED : 'APPROVED',   // APPROVER approved — gate pass is ACTIVE
  REJECTED : 'REJECTED',   // APPROVER rejected
  HOLD     : 'HOLD',       // APPROVER put on hold — can be modified + re-submitted
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
  // ROLE REQUIRED: UPLOADER or ADMIN
  // Backend returns the full saved CvpsRequest with auto-generated requestNo.
  createRequest(payload: CvpsRequest): Observable<CvpsRequest> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required to submit requests.'));
    }
    return this.http.post<CvpsRequest>(API_CONFIG.CVPS_BASE, payload);
  }

  // ── 2. POST /{requestNo}/upload-all-documents ─────────────────────────
  // Upload vehicle documents as parallel FormData arrays.
  // Backend iterates files[i] with documentType[i], documentNo[i], validFrom[i], validTill[i]
  // validFrom / validTill must be "YYYY-MM-DD" (LocalDate.parse on backend)
  // ROLE REQUIRED: UPLOADER or ADMIN
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
      fd.append('validFrom',    d.validFrom);         // "YYYY-MM-DD"
      fd.append('validTill',    d.validTo || '');     // "YYYY-MM-DD" — empty string if not set
      fd.append('files',        d.file, d.file.name);
    });
    return this.http.post<string>(
      CVPS_URLS.uploadDocs(requestNo), fd,
      { responseType: 'text' as 'json' }
    );
  }

  // ── 3. POST /{requestNo}/add-personnel ────────────────────────────────
  // Register one driver or helper person against a request.
  // Call once per person — use forkJoin in component for multiple persons.
  // ROLE REQUIRED: UPLOADER or ADMIN
  addPersonnel(requestNo: number, payload: CvpsPersonnel): Observable<CvpsPersonnel> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required to add personnel.'));
    }
    return this.http.post<CvpsPersonnel>(CVPS_URLS.addPersonnel(requestNo), payload);
  }

  // ── 4. POST /{requestNo}/workflow-action ──────────────────────────────
  // Push the request through the workflow gate.
  // Allowed actions and their role requirements:
  //   CONFIRM  → CONFIRMER or ADMIN  → reqStatus becomes "CONFIRMED"
  //   APPROVE  → APPROVER  or ADMIN  → reqStatus becomes "APPROVED"
  //   REJECT   → APPROVER  or ADMIN  → reqStatus becomes "REJECTED"
  //   HOLD     → APPROVER  or ADMIN  → reqStatus becomes "HOLD"
  // Each call also writes an immutable row to CVPS_REQUESTS_HISTORY.
  doWorkflowAction(requestNo: number, payload: WorkflowAction): Observable<CvpsRequest> {
    const action = payload.action.toUpperCase();

    if (action === 'CONFIRM' && !this.auth.isConfirmer()) {
      return throwError(() => new Error('Access Denied: CONFIRMER role required to confirm requests.'));
    }
    if (['APPROVE','REJECT','HOLD'].includes(action) && !this.auth.isApprover()) {
      return throwError(() => new Error('Access Denied: APPROVER role required to approve/reject/hold.'));
    }

    return this.http.post<CvpsRequest>(CVPS_URLS.workflowAction(requestNo), payload);
  }

  // ── 5. PUT /{requestNo}/modify ────────────────────────────────────────
  // Edit text fields of an existing request.
  // Backend enforces: only allowed when reqStatus = "CREATED" or "HOLD".
  // If status was "HOLD", backend auto-resets it back to "CREATED" after save.
  // ROLE REQUIRED: UPLOADER or ADMIN
  modifyRequest(requestNo: number, payload: CvpsRequest): Observable<CvpsRequest> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required to modify requests.'));
    }
    return this.http.put<CvpsRequest>(CVPS_URLS.modify(requestNo), payload);
  }

  // ── 6. POST /{requestNo}/replace-document ────────────────────────────
  // Replace one vehicle document file.
  // Backend checks if a document of same documentType exists under requestNo:
  //   - If YES: deletes old physical file, overwrites DB row with new file
  //   - If NO:  treats as fresh upload (fallback to uploadVehicleDocument)
  // ROLE REQUIRED: UPLOADER or ADMIN
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
    fd.append('file',         doc.file, doc.file.name);   // singular "file" — backend @RequestParam("file")
    return this.http.post<string>(
      CVPS_URLS.replaceDoc(requestNo), fd,
      { responseType: 'text' as 'json' }
    );
  }

  // ── 7. GET /{vehicleNo} ───────────────────────────────────────────────
  // Get a single vehicle's latest permission request record.
  // Returns 404 NoSuchElementException if vehicle has no request on file.
  // ROLE REQUIRED: All roles (read-only)
  getByVehicleNo(vehicleNo: string): Observable<CvpsRequest> {
    return this.http.get<CvpsRequest>(CVPS_URLS.getByVehicle(vehicleNo.trim().toUpperCase()));
  }

  // ── 8. GET / ──────────────────────────────────────────────────────────
  // Get ALL requests from the database — no filter.
  // ROLE REQUIRED: CONFIRMER, APPROVER, ADMIN (admin-level list view)
  getAllRequests(): Observable<CvpsRequest[]> {
    return this.http.get<CvpsRequest[]>(API_CONFIG.CVPS_GET_ALL);
  }

  // ── 9. GET /summary/filter?status={status} ────────────────────────────
  // Filter requests by workflow status queue.
  // Pass a CVPS_STATUS constant for type safety — e.g. CVPS_STATUS.CONFIRMED
  //
  // Typical queue usage by role:
  //   CONFIRMER  → getByStatus(CVPS_STATUS.CREATED)    — inbox of new requests to confirm
  //   APPROVER   → getByStatus(CVPS_STATUS.CONFIRMED)  — inbox of confirmed requests to approve
  //   UPLOADER   → getByStatus(CVPS_STATUS.HOLD)       — requests put on hold needing re-edit
  //   ADMIN      → any status
  // ROLE REQUIRED: All roles
  getByStatus(status: CvpsStatusType | string): Observable<CvpsRequest[]> {
    const params = new HttpParams().set('status', status.toString().toUpperCase());
    return this.http.get<CvpsRequest[]>(API_CONFIG.CVPS_FILTER, { params });
  }

  // ── 10. GET /summary/validate-gate/{vehicleNo} ───────────────────────
  // Security gate terminal check.
  // Returns 200 + full CvpsRequest if reqStatus = "APPROVED".
  // Returns 404 "Access Denied" if not approved — show red alert at gate.
  // ROLE REQUIRED: All roles (gate terminal is public-facing)
  validateGatePass(vehicleNo: string): Observable<CvpsRequest> {
    return this.http.get<CvpsRequest>(
      CVPS_URLS.validateGate(vehicleNo.trim().toUpperCase())
    );
  }

  // ── 11. GET /documents/{documentId}/download ─────────────────────────
  // Streams physical PDF binary from server path (F:/CVPS/uploaded_documents/).
  // Returns Blob — use triggerBlobDownload() helper below to open in browser.
  // ROLE REQUIRED: CONFIRMER, APPROVER, ADMIN (for Level-2 review)
  downloadDocument(documentId: number): Observable<Blob> {
    return this.http.get(
      CVPS_URLS.downloadDoc(documentId),
      { responseType: 'blob' }
    );
  }

  // ── 12. GET /summary/download-excel ──────────────────────────────────
  // Generates cvps_master_report.xlsx on the fly from Oracle — triggers download.
  // Returns Blob — use triggerBlobDownload() helper below.
  // ROLE REQUIRED: APPROVER or ADMIN
  downloadExcelReport(): Observable<Blob> {
    return this.http.get(API_CONFIG.CVPS_DOWNLOAD_EXCEL, { responseType: 'blob' });
  }

  // ─────────────────────────────────────────────────────────────────────
  // UTILITY HELPER — call this after any Blob Observable to trigger download
  // Usage:
  //   this.cvps.downloadDocument(id).subscribe(blob =>
  //     this.cvps.triggerBlobDownload(blob, 'document.pdf')
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