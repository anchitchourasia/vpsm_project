import { Injectable, inject } from '@angular/core';
import { API_CONFIG } from '../core/api.config';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, of, catchError } from 'rxjs';

export interface CreateRequestRequestDTO {
  requestNo?: number;
  createdDate?: string;
  permissionTo: string;
  contractorId: string;
  createdBy: string;
  vehicleType: string;
  reqStatus?: string;
  vehicleNo: string;
  natureOfJob: string;
  requestId?: number;
  userRemark?: string;
}
export interface DashboardSummaryDTO {
  totalPasses: number;
  approved: number;
  submitted: number;
  confirmed: number;
  pendingConfirmer?: number;
  pendingApprover?: number;
}

export interface VehicleDocumentDTO {
  id?: number;
  documentNo: string;
  documentType: string;
  filename?: string | null;
  validFrom: string | null;
  validTill?: string | null;
}

export interface EmployeeDocumentDTO {
  id?: number;
  documentNo: string | null;
  documentType: string;
  filename?: string | null;
  validFrom: string | null;
  validTill?: string | null;
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
export interface RequestHistoryDTO {
  historyId?: number;
  empNo?: string | null;
  actionTaken: string;
  remarks?: string | null;
  actionDate?: string | null;
}

export const CVPS_STATUS = {
  CREATED: 'CREATED',
  CONFIRMED: 'CONFIRMED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  HOLD: 'HOLD',
  MODIFY: 'MODIFY',
  MODIFIED: 'MODIFIED',
  SAVED: 'SAVED',
  SUBMITTED: 'SUBMITTED',
} as const;

export type CvpsStatusType = typeof CVPS_STATUS[keyof typeof CVPS_STATUS];

@Injectable({ providedIn: 'root' })
export class CvpsService {
  private http = inject(HttpClient);

  private buildMultipartFormData(
    payload: CreateRequestDTO,
    files: File[]
  ): FormData {
    const formData = new FormData();

    formData.append(
      'request',
      new Blob([JSON.stringify(payload)], { type: 'application/json' })
    );

    files.forEach(file => {
      formData.append('files', file, file.name);
    });

    return formData;
  }

  createRequest(
    payload: CreateRequestDTO,
    files: File[]
  ): Observable<ApiResponse> {
    const formData = this.buildMultipartFormData(payload, files);

    return this.http.post<ApiResponse>(
      API_CONFIG.CVPS_CREATE_REQUEST,
      formData
    );
  }

  // workflowAction(requestNo: number, payload: any, files: File[]): Observable<ApiResponse> {
  //   const formData = new FormData();
  //   formData.append('dto', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

  //   if (files && files.length > 0) {
  //     files.forEach(file => formData.append('files', file));
  //   } else {
  //     formData.append('files', new Blob([], { type: 'application/octet-stream' }));
  //   }

  //   return this.http.put<ApiResponse>(`${environment.cvpsBaseUrl}/api/requests/update/${requestNo}`, formData);
  // }
  executeWorkflowAction(requestNo: number, payload: WorkflowAction): Observable<ApiResponse> {
    const action = (payload.action || '').toUpperCase();

    if (action === 'HOLD' || action === 'REJECT') {
      const endpoint = action === 'HOLD' ? 'hold' : 'reject';

      const params = new HttpParams()
        .set('empNo', payload.empNo || 'SYSTEM')
        .set('remarks', payload.remarks || '');

      return this.http.put<ApiResponse>(
        `${environment.cvpsBaseUrl}/api/requests/${endpoint}/${requestNo}`,
        null,
        { params }
      );
    }

    throw new Error(`Unsupported confirmer workflow action: ${action}`);
  }

  doWorkflowAction(requestNo: number, payload: WorkflowAction): Observable<ApiResponse> {
    const action = (payload.action || '').toUpperCase();

    let endpoint = '';
    if (action === 'APPROVE') endpoint = 'approve';
    else if (action === 'REJECT') endpoint = 'reject';
    else if (action === 'HOLD') endpoint = 'hold';
    else throw new Error(`Unsupported approver workflow action: ${action}`);

    const params = new HttpParams()
      .set('empNo', payload.empNo || 'SYSTEM')
      .set('remarks', payload.remarks || '');

    return this.http.put<ApiResponse>(
      `${environment.cvpsBaseUrl}/api/requests/${endpoint}/${requestNo}`,
      null,
      { params }
    );
  }
  getAllRequests(): Observable<CreateRequestDTO[]> {
    return this.http.get<CreateRequestDTO[]>(
      API_CONFIG.CVPS_GET_ALL_REQUESTS
    );
  }


  getDashboardSummary(): Observable<DashboardSummaryDTO> {
    return this.http.get<DashboardSummaryDTO>(
      `${environment.cvpsBaseUrl}/api/requests/dashboard-summary`
    );
  }


  getDocumentUrl(filename: string): string {
    return `${environment.cvpsBaseUrl}/api/documents/download/${encodeURIComponent(filename)}`;
  }
  getRequestHistory(requestNo: number): Observable<RequestHistoryDTO[]> {
    console.log('Service getRequestHistory called with:', requestNo);
    return this.http.get<RequestHistoryDTO[]>(
      `${environment.cvpsBaseUrl}/api/requests/history/${requestNo}`
    );
  }

  downloadDocument(filename: string): Observable<Blob> {
    return this.http.get(this.getDocumentUrl(filename), {
      responseType: 'blob'
    });
  }
  deleteRequest(requestNo: number): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(
      `${API_CONFIG.CVPS_DELETE_REQUEST}/${requestNo}`
    );
  }

  getRequestById(requestNo: number): Observable<CreateRequestDTO> {
    return this.http.get<CreateRequestDTO>(
      `${API_CONFIG.CVPS_GET_REQUEST_BY_ID}/${requestNo}`
    );
  }



  updateRequest(
    requestNo: number,
    payload: CreateRequestDTO,
    files: File[]
  ): Observable<ApiResponse> {
    const formData = this.buildMultipartFormData(payload, files);

    return this.http.put<ApiResponse>(
      `${API_CONFIG.CVPS_UPDATE_REQUEST}/${requestNo}`,
      formData
    );
  }

  fetchContractorDetails(contractorCode: string): Observable<any> {

    const headers = new HttpHeaders({
      'x-api-key': API_CONFIG.API_KEY,
      'Accept': 'application/json'
    });

    return this.http.get<any>(
      `${API_CONFIG.CVPS_BP_RECORDS}/${contractorCode.trim()}`,
      { headers }
    );
  }
  fetchEmployeeDetails(empCode: string): Observable<any> {
    const headers = new HttpHeaders({
      'x-api-key': API_CONFIG.API_KEY,
      'Accept': 'application/json'
    });

    const code = encodeURIComponent(empCode.trim());

    // First try the report API, and if connection is refused (status 0), fallback to CVPS controller
    return this.http.get<any>(`${API_CONFIG.EMPLOYEE_REPORT}/${code}`, { headers }).pipe(
      catchError(() => {
        console.warn('Primary employee report API unreachable, trying CVPS fallback endpoint...');
        return this.http.get<any>(`${environment.cvpsBaseUrl}/api/requests/employee-name/${code}`, { headers });
      })
    );
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