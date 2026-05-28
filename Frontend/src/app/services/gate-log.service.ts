import { Injectable, inject } from '@angular/core';
import { HttpClient }         from '@angular/common/http';
import { Observable }         from 'rxjs';
import { API_CONFIG }         from '../core/api.config';

export interface GateLog {
  logId      : number;
  vehicleNo  : string;
  gateNumber : string;
  inTime     : string;
  outTime    : string;
  purpose    : string;
  logDate    : string;
}

@Injectable({ providedIn: 'root' })
export class GateLogService {
  private http = inject(HttpClient);

  getAllLogs(): Observable<GateLog[]> {
    return this.http.get<GateLog[]>(API_CONFIG.GATE_LOGS);
  }

  logEntry(log: Partial<GateLog>): Observable<GateLog> {
    return this.http.post<GateLog>(API_CONFIG.GATE_LOGS, log);
  }

  getLogsByDate(date: string): Observable<GateLog[]> {
    return this.http.get<GateLog[]>(`${API_CONFIG.GATE_LOGS}?date=${date}`);
  }
}