import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth.service';

interface VehicleDoc {
  docType  : string;
  docNo    : string;
  validFrom: string;
  validTo  : string;
  file     : File | null;
  fileName : string;
}

interface HelperPerson {
  jobType  : string;
  name     : string;
  mobileNo : string;
  aadhaarNo: string;
  file     : File | null;
  fileName : string;
}

@Component({
  selector   : 'app-vehicle-permission-form',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './vehicle-permission-form.html',
  styleUrl   : './vehicle-permission-form.css',
})
export class VehiclePermissionForm implements OnInit, OnDestroy {

  private router   = inject(Router);
  private auth     = inject(AuthService);
  private destroy$ = new Subject<void>();

  readonly formNo      = 'W-OHS-SECURITY-12';
  readonly companyName = 'HEG Limited, Mandideep';
  readonly requestDate = signal(new Date().toLocaleDateString('en-GB'));
  readonly department  = signal(this.auth.department() || 'Security');
  readonly category    = 'Vehicle Entry';
  status = signal('Draft');

  // General Info
  contractorName     = signal('');
  reqDate            = signal('');
  natureOfJob        = signal('');
  permissionDateFrom = signal('');
  permissionDateTo   = signal('');

  // Vehicle Info
  vehicleNumber = signal('');
  vehicleType   = signal('');

  readonly vehicleTypeOptions = [
    'Two Wheeler','Four Wheeler','Heavy Vehicle',
    'Tractor','Crane','JCB','Fork Lift','Other',
  ];

  // Vehicle Documents
  readonly docTypeOptions = ['RC','Insurance','PUC','Fitness','Load Test','Other'];

  vehicleDocs = signal<VehicleDoc[]>([
    { docType: '', docNo: '', validFrom: '', validTo: '', file: null, fileName: '' },
  ]);

  addVehicleDoc(): void {
    this.vehicleDocs.update(d => [
      ...d, { docType: '', docNo: '', validFrom: '', validTo: '', file: null, fileName: '' },
    ]);
  }
  removeVehicleDoc(i: number): void {
    if (this.vehicleDocs().length === 1) return;
    this.vehicleDocs.update(d => d.filter((_, idx) => idx !== i));
  }
  onVehicleDocFile(event: Event, i: number): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.vehicleDocs.update(d => {
      const copy = [...d];
      copy[i] = { ...copy[i], file, fileName: file?.name ?? '' };
      return copy;
    });
  }

  // Driver Info
  driverName       = signal('');
  contactNumber    = signal('');
  aadhaarNumber    = signal('');
  aadhaarCopyName  = signal('');
  licenseNumber    = signal('');
  licenseType      = signal('');
  licenseValidFrom = signal('');
  licenseValidTo   = signal('');
  drivingLicName   = signal('');
  driverPhotoName  = signal('');

  onAadhaarFile(e: Event)    { const f=(e.target as HTMLInputElement).files?.[0]??null; this.aadhaarCopyName.set(f?.name??''); }
  onDrivingLicFile(e: Event) { const f=(e.target as HTMLInputElement).files?.[0]??null; this.drivingLicName.set(f?.name??''); }
  onDriverPhotoFile(e: Event){ const f=(e.target as HTMLInputElement).files?.[0]??null; this.driverPhotoName.set(f?.name??''); }

  // Helpers
  readonly jobTypeOptions = ['Helper','Supervisor','Technician','Laborer','Other'];
  helpers = signal<HelperPerson[]>([]);

  addHelper(): void {
    this.helpers.update(h => [...h, { jobType:'',name:'',mobileNo:'',aadhaarNo:'',file:null,fileName:'' }]);
  }
  removeHelper(i: number): void { this.helpers.update(h => h.filter((_,idx)=>idx!==i)); }
  onHelperFile(event: Event, i: number): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.helpers.update(h => { const c=[...h]; c[i]={...c[i],file,fileName:file?.name??''}; return c; });
  }

  // Workflow display rows
  workflowRows = signal([
    { level:'Request Raised By',   approver: '${requestBy}',          status:'Submitted', remark:'Request Submitted', date: new Date().toLocaleDateString('en-GB') },
    { level:'Department Approval', approver: '${departmentApprover}', status:'Pending',   remark:'-', date:'-' },
    { level:'Security Approval',   approver: '${securityApprover}',   status:'Waiting',   remark:'-', date:'-' },
    { level:'Safety Approval',     approver: '${safetyApprover}',     status:'Waiting',   remark:'-', date:'-' },
  ]);

  isSaving     = signal(false);
  isSubmitting = signal(false);
  saveMsg      = signal('');
  errorMsg     = signal('');

  ngOnInit(): void {}
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  saveDraft(): void {
    this.status.set('Draft');
    this.saveMsg.set('✅ Draft saved successfully.');
    setTimeout(() => this.saveMsg.set(''), 3000);
  }

  submitForm(): void {
    if (!this.contractorName().trim()) { this.errorMsg.set('Contractor Name is required.'); return; }
    if (!this.vehicleNumber().trim())  { this.errorMsg.set('Vehicle Number is required.');  return; }
    if (!this.vehicleType())           { this.errorMsg.set('Vehicle Type is required.');    return; }
    this.errorMsg.set('');
    this.isSubmitting.set(true);
    this.status.set('Submitted');
    // Backend integration hook — wire API here when backend is ready
    setTimeout(() => {
      this.isSubmitting.set(false);
      this.saveMsg.set('✅ Permission request submitted successfully!');
      setTimeout(() => { this.saveMsg.set(''); this.router.navigate(['/vehicle-permission/list']); }, 2000);
    }, 800);
  }

  reset(): void {
    this.contractorName.set(''); this.reqDate.set(''); this.natureOfJob.set('');
    this.permissionDateFrom.set(''); this.permissionDateTo.set('');
    this.vehicleNumber.set(''); this.vehicleType.set('');
    this.vehicleDocs.set([{ docType:'',docNo:'',validFrom:'',validTo:'',file:null,fileName:'' }]);
    this.driverName.set(''); this.contactNumber.set(''); this.aadhaarNumber.set('');
    this.licenseNumber.set(''); this.licenseType.set('');
    this.licenseValidFrom.set(''); this.licenseValidTo.set('');
    this.helpers.set([]);
    this.status.set('Draft'); this.saveMsg.set(''); this.errorMsg.set('');
  }

  getStatusClass(s: string): string {
    switch(s.toLowerCase()) {
      case 'submitted': return 'wf-submitted';
      case 'pending'  : return 'wf-pending';
      case 'waiting'  : return 'wf-waiting';
      case 'approved' : return 'wf-approved';
      case 'rejected' : return 'wf-rejected';
      default         : return 'wf-waiting';
    }
  }
}