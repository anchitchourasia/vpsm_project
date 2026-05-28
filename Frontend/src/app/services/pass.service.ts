import { Injectable, inject } from '@angular/core';
import { HttpClient }         from '@angular/common/http';
import { Observable }         from 'rxjs';
import { API_CONFIG }         from '../core/api.config';

export interface Pass {
  passId      : number;
  vehicleNo   : string;
  employeeCode: string;
  issueDate   : string;
  validityDate: string;
  assignedGate: string;
  passStatus  : 'Active' | 'Surrendered' | 'Expired';
}

@Injectable({ providedIn: 'root' })
export class PassService {
  private http = inject(HttpClient);

  getAllPasses(): Observable<Pass[]> {
    return this.http.get<Pass[]>(API_CONFIG.PASSES);
  }

  getPassById(id: number): Observable<Pass> {
    return this.http.get<Pass>(`${API_CONFIG.PASSES}/${id}`);
  }

  // Passes are NEVER deleted — only status updated
  updatePassStatus(id: number, status: 'Surrendered' | 'Expired'): Observable<Pass> {
    return this.http.patch<Pass>(`${API_CONFIG.PASSES}/${id}/status`, { passStatus: status });
  }

  createPass(pass: Partial<Pass>): Observable<Pass> {
    return this.http.post<Pass>(API_CONFIG.PASSES, pass);
  }
}