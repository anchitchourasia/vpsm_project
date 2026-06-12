import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector   : 'app-login',
  standalone : true,
  imports    : [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl   : './login.css'
})
export class Login {

  role     = signal('Requester');
  userName = signal('');
  errorMsg = signal('');

  constructor(private router: Router) {}

  continue(): void {
    const name = this.userName().trim();
    if (!name) {
      this.errorMsg.set('Please enter your name before continuing.');
      return;
    }
    this.errorMsg.set('');

    // Store session info — used by all downstream components
    localStorage.setItem('vpsm_role',     this.role());
    localStorage.setItem('vpsm_userName', name);
    localStorage.setItem('vpsm_loginAt',  new Date().toISOString());

    if (this.role() === 'Confirmer') {
      this.router.navigate(['/authority/confirmer']);
    } else if (this.role() === 'Approver') {
      this.router.navigate(['/authority/approval']);
    } else {
      this.router.navigate(['/pass-entry']);
    }
  }
}