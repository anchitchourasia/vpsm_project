

import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { Router }        from '@angular/router';
import { AuthService }   from '../core/auth.service';

@Component({
  selector   : 'app-login',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl   : './login.css',
})
export class Login {

  private auth   = inject(AuthService);
  private router = inject(Router);
  private cdr    = inject(ChangeDetectorRef);

  // Login View Controls
  empCodeInput  = '';
  passwordInput = '';
  isLoading     = false;
  errorMsg      = '';
  successMsg    = '';
  resolvedRole  = '';

  // Inline Reset Password Controls
  isResetMode          = false;
  resetEmpCodeInput    = '';
  newPasswordInput     = '';
  confirmPasswordInput = '';

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/']);
    }
  }

  // Toggle between Login View and Reset Password View
  toggleResetMode(mode: boolean): void {
    this.isResetMode          = mode;
    this.errorMsg             = '';
    this.successMsg           = '';
    this.resetEmpCodeInput    = '';
    this.newPasswordInput     = '';
    this.confirmPasswordInput = '';
    this.cdr.detectChanges();
  }

  onLogin(): void {
    const code     = this.empCodeInput.trim();
    const password = this.passwordInput.trim();

    if (!code) {
      this.errorMsg = 'Please enter your Employee Code.';
      return;
    }

    if (!password) {
      this.errorMsg = 'Please enter your Password.';
      return;
    }

    this.isLoading    = true;
    this.errorMsg     = '';
    this.successMsg   = '';
    this.resolvedRole = '';

    // Pass both code and password to AuthService
    this.auth.resolveByEmpCode(code, password).subscribe({
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
          this.errorMsg = '❌ Invalid Employee Code or Password.';
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

  // Handle Password Reset Submission
  onResetPassword(): void {
    const code        = this.resetEmpCodeInput.trim();
    const newPass     = this.newPasswordInput.trim();
    const confirmPass = this.confirmPasswordInput.trim();

    if (!code) {
      this.errorMsg = 'Please enter your Employee Code.';
      return;
    }

    if (!newPass) {
      this.errorMsg = 'Please enter your new password.';
      return;
    }

    if (!confirmPass) {
      this.errorMsg = 'Please enter password again.';
      return;
    }

    if (newPass !== confirmPass) {
      this.errorMsg = 'Passwords do not match. Please re-enter.';
      return;
    }

    this.isLoading = true;
    this.errorMsg  = '';

    this.auth.resetPassword(code, newPass).subscribe({
      next: () => {
        this.isLoading  = false;
        this.successMsg = 'Password updated successfully! Please log in with your new password.';
        this.toggleResetMode(false); // Return to Login view
        this.empCodeInput = code;    // Pre-fill employee code for convenience
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        if (err?.status === 404) {
          this.errorMsg = `Employee Code "${code}" is not registered.`;
        } else if (err?.status === 0) {
          this.errorMsg = 'Cannot reach server. Check network.';
        } else {
          this.errorMsg = err?.error?.message || this.auth.resolveError() || 'Password update failed.';
        }
        this.cdr.detectChanges();
      }
    });
  }
}