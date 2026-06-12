import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  role = 'Requester';
  userName = '';

  constructor(private router: Router) {}

  continue(): void {
    if (this.role === 'Confirmer') {
      this.router.navigate(['/authority/confirmer']);
      return;
    }
    if (this.role === 'Approver') {
      this.router.navigate(['/authority/approval']);
      return;
    }
    this.router.navigate(['/pass-entry']);
  }
}