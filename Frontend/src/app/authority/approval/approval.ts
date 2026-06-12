import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PassStateService, PassRecord } from '../../services/pass-state.service';

@Component({
  selector: 'app-approval',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './approval.html',
  styleUrl: './approval.css'
})
export class Approval {
  private passState = inject(PassStateService);

  readonly queue = computed(() => this.passState.pendingApproval());
  readonly selectedPass = signal<PassRecord | null>(null);
  readonly actionRemark = signal('');
  readonly actionError = signal('');
  readonly actionSuccess = signal('');
  readonly actingOn = signal<string>('');
  readonly approverName = signal('APPROVER');

  getStatusLabel = (ws?: string) => this.passState.getStatusLabel(ws as any);
  getStatusClass = (ws?: string) => this.passState.getStatusClass(ws as any);

  openDetails(p: PassRecord): void {
    this.selectedPass.set(p);
    this.actionError.set('');
    this.actionSuccess.set('');
    this.actionRemark.set('');
  }

  closeDetails(): void {
    this.selectedPass.set(null);
    this.actionRemark.set('');
  }

  private validateRemark(): string {
    return this.actionRemark().trim() ? '' : 'Remark is required for approval action.';
  }

  approve(pass: PassRecord): void {
    const err = this.validateRemark();
    if (err) {
      this.actionError.set(err);
      return;
    }
    this.actingOn.set(pass.passId);
    try {
      this.passState.approveRequest(pass.passId, this.approverName(), this.actionRemark().trim());
      this.actionSuccess.set(`${pass.passId} approved.`);
      this.actionError.set('');
      this.actionRemark.set('');
      this.selectedPass.set(this.passState.getById(pass.passId) ?? pass);
    } finally {
      this.actingOn.set('');
    }
  }

  reject(pass: PassRecord): void {
    const err = this.validateRemark();
    if (err) {
      this.actionError.set(err);
      return;
    }
    this.actingOn.set(pass.passId);
    try {
      this.passState.rejectByApprover(pass.passId, this.approverName(), this.actionRemark().trim());
      this.actionSuccess.set(`${pass.passId} returned from approval.`);
      this.actionError.set('');
      this.actionRemark.set('');
      this.selectedPass.set(this.passState.getById(pass.passId) ?? pass);
    } finally {
      this.actingOn.set('');
    }
  }
}