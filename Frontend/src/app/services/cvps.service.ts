import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../core/api.config';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface CreateRequestRequestDTO {
  requestNo?: number;
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

  getAllRequests(): Observable<CreateRequestDTO[]> {
    return this.http.get<CreateRequestDTO[]>(
      API_CONFIG.CVPS_GET_ALL_REQUESTS
    );
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

  fetchContractorDetails(): Observable<any[]> {
    const headers = new HttpHeaders({
      'x-api-key': API_CONFIG.API_KEY,
      'Accept': 'application/json',
    });

    return this.http.get<any[]>(
      API_CONFIG.EMPLOYEE_REPORT,
      { headers }
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