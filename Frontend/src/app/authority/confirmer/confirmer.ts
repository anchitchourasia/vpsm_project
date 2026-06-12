import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PassStateService, PassRecord } from '../../services/pass-state.service';

@Component({
  selector: 'app-confirmer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './confirmer.html',
  styleUrl: './confirmer.css'
})
export class Confirmer {
  private passState = inject(PassStateService);

  readonly queue = computed(() => this.passState.pendingConfirmation());
  readonly selectedPass = signal<PassRecord | null>(null);
  readonly actionRemark = signal('');
  readonly actionError = signal('');
  readonly actionSuccess = signal('');
  readonly actingOn = signal<string>('');
  readonly confirmerName = signal('CONFIRMER');

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
    return this.actionRemark().trim() ? '' : 'Remark is required for confirmation action.';
  }

  confirm(pass: PassRecord): void {
    const err = this.validateRemark();
    if (err) {
      this.actionError.set(err);
      return;
    }
    this.actingOn.set(pass.passId);
    try {
      this.passState.confirmRequest(pass.passId, this.confirmerName(), this.actionRemark().trim());
      this.actionSuccess.set(`${pass.passId} moved to Pending Approval.`);
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
      this.passState.rejectByConfirmer(pass.passId, this.confirmerName(), this.actionRemark().trim());
      this.actionSuccess.set(`${pass.passId} returned to requester.`);
      this.actionError.set('');
      this.actionRemark.set('');
      this.selectedPass.set(this.passState.getById(pass.passId) ?? pass);
    } finally {
      this.actingOn.set('');
    }
  }
}