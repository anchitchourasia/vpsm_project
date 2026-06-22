import { Component, signal, computed, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

export interface VehiclePermissionRecord {
  id: number; contractorName: string; vehicleNumber: string;
  vehicleType: string; permissionFrom: string; permissionTo: string;
  natureOfJob: string; driverName: string; status: string;
  submittedBy: string; submittedDate: string;
}

@Component({
  selector   : 'app-vehicle-permission-list',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './vehicle-permission-list.html',
  styleUrl   : './vehicle-permission-list.css',
})
export class VehiclePermissionList implements OnInit, OnDestroy {
  private router   = inject(Router);
  private destroy$ = new Subject<void>();

  searchText   = signal('');
  statusFilter = signal('ALL');
  currentPage  = signal(1);
  readonly pageSize = 10;
  isLoading = signal(false);

  // Mock data — replace with HTTP call when backend is ready
  allRecords = signal<VehiclePermissionRecord[]>([
    { id:1, contractorName:'M/s Sharma Contractors', vehicleNumber:'MP04 AB 1234', vehicleType:'Heavy Vehicle', permissionFrom:'2026-06-01', permissionTo:'2026-06-30', natureOfJob:'Civil Construction', driverName:'Ramesh Kumar', status:'Approved', submittedBy:'EMP101', submittedDate:'2026-05-28' },
    { id:2, contractorName:'R.K. Electricals',       vehicleNumber:'MP09 CD 5678', vehicleType:'Four Wheeler',  permissionFrom:'2026-06-10', permissionTo:'2026-06-20', natureOfJob:'Electrical Work',   driverName:'Suresh Patel', status:'Submitted', submittedBy:'EMP202', submittedDate:'2026-06-09' },
    { id:3, contractorName:'Fast Transport',          vehicleNumber:'MP11 EF 9999', vehicleType:'Two Wheeler',   permissionFrom:'2026-06-15', permissionTo:'2026-07-15', natureOfJob:'Material Delivery', driverName:'Ajay Singh',  status:'Pending',   submittedBy:'EMP303', submittedDate:'2026-06-14' },
  ]);

  readonly statusOptions = [
    { value:'ALL',       label:'All Statuses'    },
    { value:'Draft',     label:'Draft'           },
    { value:'Submitted', label:'Submitted'       },
    { value:'Pending',   label:'Pending Approval'},
    { value:'Approved',  label:'Approved'        },
    { value:'Rejected',  label:'Rejected'        },
  ];

  filteredRecords = computed(() => {
    const q = this.searchText().toLowerCase().trim();
    const s = this.statusFilter();
    return this.allRecords().filter(r =>
      (s === 'ALL' || r.status === s) &&
      (!q || r.contractorName.toLowerCase().includes(q) || r.vehicleNumber.toLowerCase().includes(q) ||
             r.natureOfJob.toLowerCase().includes(q)    || r.driverName.toLowerCase().includes(q)    || String(r.id).includes(q))
    );
  });

  pagedRecords = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredRecords().slice(start, start + this.pageSize);
  });

  get totalPages()    { return Math.max(1, Math.ceil(this.filteredRecords().length / this.pageSize)); }
  get totalPagesArr() { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  ngOnInit()    {}
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  addNew()            { this.router.navigate(['/vehicle-permission/add']); }
  goToPage(p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage.set(p); }
  onSearch(v: string) { this.searchText.set(v); this.currentPage.set(1); }

  getStatusClass(s: string): string {
    switch(s.toLowerCase()) {
      case 'approved' : return 'vpl-badge-approved';
      case 'submitted': return 'vpl-badge-submitted';
      case 'pending'  : return 'vpl-badge-pending';
      case 'draft'    : return 'vpl-badge-draft';
      case 'rejected' : return 'vpl-badge-rejected';
      default         : return 'vpl-badge-draft';
    }
  }
  formatDate(d: string): string {
    if (!d || d.length < 10) return d ?? '—';
    const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`;
  }
}