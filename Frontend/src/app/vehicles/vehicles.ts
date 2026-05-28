import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-vehicles',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './vehicles.html',
  styleUrl: './vehicles.css'
})
export class Vehicles implements OnInit {

  // All vehicles list
  vehicles = signal<any[]>([]);

  // Loading & error state
  isLoading = signal(true);
  hasError = signal(false);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadVehicles();
  }

  loadVehicles() {
    this.isLoading.set(true);
    this.http.get<any[]>('http://localhost:8080/api/vehicles')
      .subscribe({
        next: (data) => {
          this.vehicles.set(data);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Error loading vehicles:', err);
          this.hasError.set(true);
          this.isLoading.set(false);
        }
      });
  }

  // Badge color based on status
  getStatusClass(isActive: string): string {
    return isActive === 'Y' ? 'badge green' : 'badge red';
  }

  getStatusText(isActive: string): string {
    return isActive === 'Y' ? 'ACTIVE' : 'INACTIVE';
  }

  getBlacklistClass(isBlacklisted: string): string {
    return isBlacklisted === 'Y' ? 'badge red' : 'badge green';
  }
}