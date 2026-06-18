import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule }    from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService }     from '../core/auth.service';
import { API_CONFIG }      from '../core/api.config';

@Component({
  selector   : 'app-my-pass',
  standalone : true,
  imports    : [CommonModule],
  templateUrl: './my-pass.html',
  styleUrl   : './my-pass.css',
})
export class MyPass implements OnInit {

  auth     = inject(AuthService);   // ✅ public — used in template
  private http = inject(HttpClient);

  passes   = signal<any[]>([]);
  loading  = signal(true);
  errorMsg = signal('');

  private readonly HEADERS = new HttpHeaders({
    'x-api-key'   : API_CONFIG.API_KEY,
    'Accept'      : 'application/json',
    'Content-Type': 'application/json',
  });

  ngOnInit(): void {
    this.loadMyPasses();
  }

  loadMyPasses(): void {
    this.loading.set(true);
    this.errorMsg.set('');

    const empCode = this.auth.empCode();
    const url     = `${API_CONFIG.PASSES}?empCode=${empCode}`;

    this.http.get<any[]>(url, { headers: this.HEADERS }).subscribe({
      next : (data) => { this.passes.set(data || []); this.loading.set(false); },
      error: ()     => { this.errorMsg.set('Failed to load passes.'); this.loading.set(false); }
    });
  }
}