import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PassStateService, PassRecord } from '../services/pass-state.service';

@Component({
  selector   : 'app-pass-details',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './pass-details.html',
  styleUrl   : './pass-details.css',
})
export class PassDetails {

  private svc = inject(PassStateService);

  protected readonly passes = this.svc.submittedPasses;

  protected searchTerm   = signal('');
  protected filterStatus = signal<'All' | 'Submitted'>('All');
  protected expandedId   = signal<string | null>(null);

  protected filtered = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    return this.passes().filter(p => {
      if (!term) return true;
      return (
        p.passId.toLowerCase().includes(term)      ||
        p.vehicleNo.toLowerCase().includes(term)   ||
        p.empName.toLowerCase().includes(term)     ||
        p.ecNo.toLowerCase().includes(term)        ||
        p.gateNo.toLowerCase().includes(term)
      );
    });
  });

  protected toggle(passId: string): void {
    this.expandedId.update(cur => cur === passId ? null : passId);
  }

  protected onSearch(e: Event): void {
    this.searchTerm.set((e.target as HTMLInputElement).value);
  }

  protected classLabel(cls: string): string {
    const map: Record<string, string> = {
      'Two_Wheeler'    : '🏍️ Two Wheeler',
      'Four_Wheeler'   : '🚗 Four Wheeler',
      'Heavy_Machinery': '🏗️ Heavy Machinery',
    };
    return map[cls] ?? cls;
  }

  protected empTypeLabel(t: string): string {
    return t === 'Contractor' ? '🔧 Contractor' : '🏢 Company Employee';
  }
}