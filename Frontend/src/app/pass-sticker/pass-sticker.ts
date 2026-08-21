import {
  Component,
  inject,
  signal,
  ElementRef,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { API_CONFIG } from '../core/api.config';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

@Component({
  selector: 'app-pass-sticker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pass-sticker.html',
  styleUrl: './pass-sticker.css',
})
export class PassSticker {

  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  @ViewChild('stickerArea')
  stickerArea!: ElementRef;

  private readonly HEADERS = new HttpHeaders({
    'x-api-key': API_CONFIG.API_KEY,
    'Content-Type': 'application/json'
  });

  // Sticker Data
  passNo = signal('');
  empType = signal('');
  vehicleNo = signal('');

  gateNo = signal('');
  parkingToBeUsed = signal('');

  constructor() {

    this.route.queryParams.subscribe(params => {

      const id = Number(params['id']);

      if (id) {
        this.loadPass(id);
      }

    });

  }

  private loadPass(id: number): void {

    this.http.get<any>(
      `${API_CONFIG.PASS_LIST}/${id}`,
      {
        headers: this.HEADERS
      }
    )
      .subscribe({

        next: (response) => {

          this.passNo.set(response.passNo ?? '');

          this.empType.set(response.empType ?? '');

          this.vehicleNo.set(response.vehicleNo ?? '');

          this.gateNo.set(response.gateNo ?? '');

          this.parkingToBeUsed.set(response.parkingToBeUsed ?? '');

        },

        error: (err) => {
          console.error('Unable to load sticker details.', err);
        }

      });

  }

  // ===========================================
  // PRINT STICKER
  // ===========================================
 printSticker(): void {

  const sticker = this.stickerArea.nativeElement;

  html2canvas(sticker, {

    scale: 4,
    useCORS: true,
    backgroundColor: '#ffffff'

  }).then(canvas => {

    const dataUrl = canvas.toDataURL('image/png');

    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <html>

      <head>

        <title>Sticker</title>

        <style>

          @page{
            size:3in 3in;
            margin:0;
          }

          html,body{

            margin:0;
            padding:0;

            width:3in;
            height:3in;

            display:flex;
            justify-content:center;
            align-items:center;

            overflow:hidden;

          }

          img{

            width:3in;
            height:3in;

          }

        </style>

      </head>

      <body>

        <img src="${dataUrl}">

      </body>

      </html>
    `);

    printWindow.document.close();

    printWindow.focus();

    setTimeout(() => {

      printWindow.print();

      printWindow.close();

    },500);

  });

}

}