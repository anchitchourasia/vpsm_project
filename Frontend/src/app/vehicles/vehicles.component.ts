import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule }    from '@angular/common';
import { VehicleService, Vehicle } from '../services/vehicle.service';

@Component({
  selector   : 'app-vehicles',
  standalone : true,
  imports    : [CommonModule],
  template   : `
    <div *ngIf="isLoading()">Loading vehicles...</div>
    <div *ngIf="hasError()" class="error">{{ errorMsg() }}</div>
    <table *ngIf="!isLoading() && !hasError()">
      <tr *ngFor="let v of vehicles()">
        <td>{{ v.vehicleNo }}</td>
        <td>{{ v.vehicleClass }}</td>
        <td>{{ v.vehicleType }}</td>
        <td>{{ v.ownerName }}</td>
      </tr>
    </table>
  `
})
export class VehiclesComponent implements OnInit {
  private vehicleService = inject(VehicleService);

  vehicles  = signal<Vehicle[]>([]);
  isLoading = signal(true);
  hasError  = signal(false);
  errorMsg  = signal('');

  ngOnInit() {
    this.vehicleService.getAllVehicles().subscribe({
      next : (data) => { this.vehicles.set(data); this.isLoading.set(false); },
      error: (err)  => { this.hasError.set(true); this.errorMsg.set(err.message); this.isLoading.set(false); }
    });
  }
}