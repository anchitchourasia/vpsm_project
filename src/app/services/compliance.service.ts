import { Injectable, inject } from '@angular/core';
import { HttpClient }         from '@angular/common/http';
import { Observable }         from 'rxjs';
import { API_CONFIG }         from '../core/api.config';

export interface ComplianceDoc {
  docId       : number;
  vehicleNo   : string;
  pucExpiry   : string;
  fitnessExpiry: string;
  loadTestExpiry: string;
  insuranceExpiry: string;
}

@Injectable({ providedIn: 'root' })
export class ComplianceService {
  private http = inject(HttpClient);

  // Strictly enforced for Contractors & Heavy Machinery only
  getComplianceByVehicle(vehicleNo: string): Observable<ComplianceDoc> {
    return this.http.get<ComplianceDoc>(`${API_CONFIG.COMPLIANCE}/${vehicleNo}`);
  }

  updateCompliance(vehicleNo: string, doc: Partial<ComplianceDoc>): Observable<ComplianceDoc> {
    return this.http.put<ComplianceDoc>(`${API_CONFIG.COMPLIANCE}/${vehicleNo}`, doc);
  }

  getExpiringDocs(days: number): Observable<ComplianceDoc[]> {
    return this.http.get<ComplianceDoc[]>(`${API_CONFIG.COMPLIANCE}/expiring?days=${days}`);
  }
}