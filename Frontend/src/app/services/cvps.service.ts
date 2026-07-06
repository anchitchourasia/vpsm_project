import { Injectable, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { API_CONFIG, CVPS_URLS } from '../core/api.config';
import { AuthService } from '../core/auth.service';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';

export interface CvpsVehicleDoc {
  id?: number;
  documentType: string;
  documentNo: string;
  validFrom: string;
  validTill?: string;
  filename?: string;
}

export interface CvpsPersonnelDocument {
  documentNo: string;
  documentType: string;
  fileName: string;
  validFrom: string;
  validTill?: string;
}

export interface CvpsPersonnel {
  id?: number;
  empJob: string;
  empType: string;
  empNo?: number | null;
  aadharNo?: string;
  name: string;
  mobileNo?: string;
  licenseNo?: string;
  licenseType?: string;
  validFrom?: string;
  validTo?: string;
  driverPhotoName?: string;
  documents?: CvpsPersonnelDocument[];
}

export interface CvpsHistory {
  historyId?: number;
  actionTaken: string;
  empNo: string;
  remarks?: string;
  actionDate?: string;
}

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

export interface CreateRequestRequestDTO {
  createdDate?: string;
  permissionFrom: string;
  permissionTo: string;
  contractorId: string;
  createdBy: string;
  vehicleType: string;
  reqStatus?: string;
  vehicleNo: string;
  natureOfJob: string;
  requestId?: number;
}

export interface VehicleDocumentDTO {
  documentNo: string;
  documentType: string;
  fileName: string;
  validFrom: string;
  validTill?: string;
}

export interface EmployeeDocumentDTO {
  documentNo: string;
  documentType: string;
  fileName: string;
  validFrom: string;
  validTill?: string;
}

export interface EmployeeDTO {
  empNo?: number | null;
  name: string;
  mobileNo?: string;
  empType: string;
  empJob: string;
  documents?: EmployeeDocumentDTO[];
}

export interface CreateRequestDTO {
  request: CreateRequestRequestDTO;
  vehicleDocuments: VehicleDocumentDTO[];
  employees: EmployeeDTO[];
}

export interface ApiResponse {
  success: boolean;
  message: string;
  requestNo: number;
}

export interface WorkflowAction {
  action: 'CONFIRM' | 'APPROVE' | 'REJECT' | 'HOLD';
  empNo: string;
  remarks: string;
}

export const CVPS_STATUS = {
  CREATED: 'CREATED',
  CONFIRMED: 'CONFIRMED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  HOLD: 'HOLD',
  MODIFY: 'MODIFY',
  SAVED: 'SAVED',
  SUBMITTED: 'SUBMITTED',
} as const;

export type CvpsStatusType = typeof CVPS_STATUS[keyof typeof CVPS_STATUS];

@Injectable({ providedIn: 'root' })
export class CvpsService {

  private http = inject(HttpClient);
  private auth = inject(AuthService);

  createRequest(payload: CreateRequestDTO): Observable<ApiResponse> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required.'));
    }
    return this.http.post<ApiResponse>(API_CONFIG.CVPS_BASE, payload);
  }

  modifyRequest(requestNo: number, payload: CvpsRequest): Observable<CvpsRequest> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required.'));
    }
    return this.http.put<CvpsRequest>(CVPS_URLS.modify(requestNo), payload);
  }

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
      CVPS_URLS.uploadDocs(requestNo),
      fd,
      { responseType: 'text' as 'json' }
    );
  }

  addPersonnel(requestNo: number, payload: CvpsPersonnel): Observable<CvpsPersonnel> {
    if (!this.auth.isUploader()) {
      return throwError(() => new Error('Access Denied: UPLOADER role required.'));
    }
    return this.http.post<CvpsPersonnel>(CVPS_URLS.addPersonnel(requestNo), payload);
  }

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
      CVPS_URLS.replaceDoc(requestNo),
      fd,
      { responseType: 'text' as 'json' }
    );
  }

  getByVehicleNo(vehicleNo: string): Observable<CvpsRequest> {
    return this.http.get<CvpsRequest>(
      CVPS_URLS.getByVehicle(vehicleNo.trim().toUpperCase())
    );
  }

  getByRequestNo(requestNo: number): Observable<CvpsRequest> {
    return this.http.get<CvpsRequest[]>(API_CONFIG.CVPS_GET_ALL).pipe(
      map(list => {
        const found = list.find(r => r.requestNo === requestNo);
        if (!found) {
          throw new Error(`Request ${requestNo} not found.`);
        }
        return found;
      })
    );
  }

  getAllRequests(): Observable<CvpsRequest[]> {
    return this.http.get<CvpsRequest[]>(API_CONFIG.CVPS_GET_ALL);
  }

  getByStatus(status: CvpsStatusType | string): Observable<CvpsRequest[]> {
    const params = new HttpParams().set('status', status.toString().toUpperCase());
    return this.http.get<CvpsRequest[]>(API_CONFIG.CVPS_FILTER, { params });
  }

  validateGatePass(vehicleNo: string): Observable<CvpsRequest> {
    return this.http.get<CvpsRequest>(
      CVPS_URLS.validateGate(vehicleNo.trim().toUpperCase())
    );
  }

  downloadDocument(documentId: number): Observable<Blob> {
    return this.http.get(
      CVPS_URLS.downloadDoc(documentId),
      { responseType: 'blob' }
    );
  }

  downloadExcelReport(): Observable<Blob> {
    return this.http.get(API_CONFIG.CVPS_DOWNLOAD_EXCEL, { responseType: 'blob' });
  }

  fetchContractorDetails(): Observable<any[]> {
    const headers = new HttpHeaders({
      'x-api-key': API_CONFIG.API_KEY,
      'Accept': 'application/json',
    });
    return this.http.get<any[]>(API_CONFIG.EMPLOYEE_REPORT, { headers });
  }

  uploadPersonnelDocuments(personnelId: number, files: File[]): Observable<any> {
    const fd = new FormData();
    files.forEach(f => fd.append('files', f, f.name));
    return this.http.post<any>(
      `${API_CONFIG.CVPS_BASE}/personnel/${personnelId}/upload-documents`,
      fd
    );
  }

  getRequestsByStatus(status: string): Observable<CvpsRequest[]> {
    return this.getByStatus(status);
  }

  executeWorkflowAction(
    requestNo: number,
    payload: { action: string; empNo: string; remarks: string }
  ): Observable<CvpsRequest> {
    return this.doWorkflowAction(requestNo, payload as WorkflowAction);
  }

  triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}