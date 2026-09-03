import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {

  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  empCodeInput = '';
  isLoading = false;
  errorMsg = '';
  resolvedRole = '';

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/']);
      return;
    }

    const empCodeFromPortal = this.route.snapshot.queryParamMap
      .get('empCode')
      ?.trim();

    if (empCodeFromPortal) {
      this.empCodeInput = empCodeFromPortal;
      this.onLogin();
    }
  }

  onLogin(): void {
    const code = this.empCodeInput.trim();
    if (!code) {
      this.errorMsg = 'Please enter your Employee Code.';
      return;
    }
    this.isLoading = true;
    this.errorMsg = '';
    this.resolvedRole = '';

    this.auth.resolveByEmpCode(code).subscribe({
      next: () => {
        this.isLoading = false;
        if (this.auth.isLoggedIn()) {
          this.resolvedRole = this.auth.isRegularUser() ? 'Employee' : this.auth.role();
          this.cdr.detectChanges();
          this.router.navigate(['/']);
        } else {
          this.errorMsg = this.auth.resolveError() || 'Login failed.';
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        this.isLoading = false;
        if (err?.status === 404) {
          this.errorMsg = err?.error?.message
            ? `❌ ${err.error.message}`
            : `Employee code "${code}" not registered.`;
        } else if (err?.status === 401) {
          this.errorMsg = '⚠️ API authentication failed. Contact administrator.';
        } else if (err?.status === 0) {
          this.errorMsg = '🔌 Cannot reach server. Check network.';
        } else {
          this.errorMsg = this.auth.resolveError() ||
            `Unexpected error (${err?.status ?? 'unknown'}).`;
        }
        this.cdr.detectChanges();
      }
    });
  }
}