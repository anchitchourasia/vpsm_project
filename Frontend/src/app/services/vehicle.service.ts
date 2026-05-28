import { Injectable, inject } from '@angular/core';
import { HttpClient }         from '@angular/common/http';
import { Observable }         from 'rxjs';
import { API_CONFIG }         from '../core/api.config';

export interface Vehicle {
  id          : number;
  vehicleNo   : string;
  vehicleClass: string;
  vehicleType : string;
  ownerName   : string;
}

@Injectable({ providedIn: 'root' })
export class VehicleService {
  private http = inject(HttpClient);

  getAllVehicles(): Observable<Vehicle[]> {
    return this.http.get<Vehicle[]>(API_CONFIG.VEHICLES);
  }

  getVehicleById(id: number): Observable<Vehicle> {
    return this.http.get<Vehicle>(`${API_CONFIG.VEHICLES}/${id}`);
  }

  addVehicle(vehicle: Partial<Vehicle>): Observable<Vehicle> {
    return this.http.post<Vehicle>(API_CONFIG.VEHICLES, vehicle);
  }

  updateVehicle(id: number, vehicle: Partial<Vehicle>): Observable<Vehicle> {
    return this.http.put<Vehicle>(`${API_CONFIG.VEHICLES}/${id}`, vehicle);
  }
}