import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_CONFIG } from '../../core/api.config';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
    CvpsService,
    CreateRequestDTO,
    EmployeeDTO,
} from '../../services/cvps.service';

type HistoryStage = 'UPLOADER' | 'CONFIRMER' | 'APPROVER';

interface PassHistoryEntry {
    id: string;
    stage: HistoryStage;
    action: string;
    remark: string;
    byName: string;
    byEmpCode: string;
    statusAfter: string;
    createdAt: string;
}

@Component({
    selector: 'app-vehicle-permission-pass',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './vehicle-permission-pass.html',
    styleUrl: './vehicle-permission-pass.css'
})
export class VehiclePermissionPassComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    cvps = inject(CvpsService);
    private http = inject(HttpClient);

    private readonly HEADERS = new HttpHeaders({
        'x-api-key': API_CONFIG.API_KEY,
        'Content-Type': 'application/json'
    });

    private destroy$ = new Subject<void>();

    readonly formNo = 'W-OHS-SECURITY-12';
    readonly companyName = 'HEG Limited, Mandideep';


    loading = signal(false);
    errorMsg = signal('');
    requestNo = signal<number | null>(null);
    dto = signal<CreateRequestDTO | null>(null);
    contractorName = signal('');
    employeeDetails = signal<any | null>(null);
    uploaderName = signal('');
    confirmerName = signal('');
    approverName = signal('');
    status = signal<string>('Draft');
    remarksHistory = signal<PassHistoryEntry[]>([]);

    readonly request = computed(() => this.dto()?.request ?? null);
    readonly vehicleDocuments = computed(() => this.dto()?.vehicleDocuments ?? []);
    readonly employees = computed(() => this.dto()?.employees ?? []);

    readonly passEmployees = computed(() =>
        (this.dto()?.employees ?? []).map((employee: any) => {

            return {
                ...employee,
                _role: String(employee?.empJob || employee?.empType || employee?.role || '-').trim() || '-',
            };
        })
    );

    ngOnInit(): void {
        this.route.queryParams
            .pipe(takeUntil(this.destroy$))
            .subscribe(params => {
                const id = Number(params['requestNo']);

                if (!id || Number.isNaN(id)) {
                    this.errorMsg.set('Invalid request number.');
                    return;
                }

                this.requestNo.set(id);
                this.loadPass(id);
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private loadPass(requestNo: number): void {
        this.loading.set(true);
        this.errorMsg.set('');
        this.remarksHistory.set([]);
        this.loadRemarkHistory(requestNo);

        this.cvps.getRequestById(requestNo)
            .pipe(
                takeUntil(this.destroy$),
                catchError(err => {
                    this.errorMsg.set(
                        err?.error?.message ||
                        err?.message ||
                        'Unable to load pass details.'
                    );
                    return of(null);
                }),
                finalize(() => this.loading.set(false))
            )
            .subscribe(dto => {
                if (!dto || !dto.request) {
                    this.errorMsg.set('No request data found.');
                    return;
                }

                this.dto.set(dto);
                this.status.set(dto.request?.reqStatus || 'Draft');
                console.log('Request Object:', dto.request);

                const emp = dto.employees?.[0];

                if (emp?.empNo) {
                    this.resolveEmployeeDetails(String(emp.empNo));
                }
                const contractorCode = String(dto.request?.contractorId || '').trim();

                if (contractorCode) {
                    this.resolveContractorName(contractorCode);
                }
            });
    }

    private loadRemarkHistory(requestNo: number): void {

        this.cvps.getRequestHistory(requestNo)
            .pipe(
                takeUntil(this.destroy$),
                catchError(() => of([]))
            )
            .subscribe((rows: any[]) => {

                const mapped: PassHistoryEntry[] = (rows || []).map((row: any, index: number) => {

                    const stage = this.inferHistoryStage(row);

                    const empCode = String(row?.empNo || '')
                        .trim();

                    // fetch employee name
                    if (empCode) {
                        this.resolveEmployeeName(empCode, stage);
                    }

                    return {
                        id: String(row?.historyId ?? index + 1),
                        stage,
                        action: row?.actionTaken || '',
                        remark: row?.remarks || '',
                        byName: '',
                        byEmpCode: empCode,
                        statusAfter: row?.actionTaken || '',
                        createdAt: row?.actionDate || ''
                    };

                });

                mapped.sort((a, b) => this.getHistorySortValue(a) - this.getHistorySortValue(b));

                this.remarksHistory.set(mapped);

            });

    }

    private resolveEmployeeDetails(empCode: string): void {

        const url = `${API_CONFIG.EMPLOYEE_REPORT}/${encodeURIComponent(empCode)}`;

        this.http.get<any>(url, { headers: this.HEADERS })
            .pipe(
                takeUntil(this.destroy$),
                catchError(() => {
                    this.employeeDetails.set(null);
                    this.contractorName.set('');
                    return of(null);
                })
            )
            .subscribe(res => {

                if (!res) {
                    this.employeeDetails.set(null);
                    return;
                }

                this.employeeDetails.set(res);

                this.contractorName.set(
                    String(res.contractorName || '').toUpperCase()
                );
            });
    }
    private resolveContractorName(contractorCode: string): void {

        const url = `${API_CONFIG.CVPS_BP_RECORDS}/${encodeURIComponent(contractorCode)}`;

        this.http.get<any>(url, { headers: this.HEADERS })
            .pipe(
                takeUntil(this.destroy$),
                catchError(() => {
                    this.contractorName.set('');
                    return of(null);
                })
            )
            .subscribe(res => {

                if (!res) return;

                this.contractorName.set(
                    String(res.contractorName || '').toUpperCase()
                );

            });

    }
    private resolveEmployeeName(
        empCode: string,
        stage: HistoryStage
    ): void {

        const url =
            `${API_CONFIG.EMPLOYEE_REPORT}/${encodeURIComponent(empCode.trim())}`;

        this.http.get<any>(url, {
            headers: this.HEADERS
        })
            .pipe(
                takeUntil(this.destroy$),
                catchError(() => of(null))
            )
            .subscribe(emp => {

                if (!emp) return;

                const name = String(
                    emp.name ||
                    emp.empName ||
                    emp.employeeName ||
                    '-'
                ).toUpperCase();

                switch (stage) {

                    case 'UPLOADER':
                        this.uploaderName.set(name);
                        break;

                    case 'CONFIRMER':
                        this.confirmerName.set(name);
                        break;

                    case 'APPROVER':
                        this.approverName.set(name);
                        break;
                }

            });

    }

    formatDate(value: string | null | undefined): string {
        if (!value) return '-';

        const raw = String(value).split('T')[0];
        const parts = raw.split('-');

        if (parts.length !== 3) return raw;

        const [year, month, day] = parts;
        return `${day}-${month}-${year}`;
    }

    formatDateForInput(value: string | null | undefined): string {
        if (!value) return '';
        return String(value).split('T')[0];
    }

    shortName(name: string | null | undefined): string {
        if (!name) return '-';
        return name.length > 18 ? `${name.substring(0, 15)}...` : name;
    }

    normalizeDocType(value: string | null | undefined): string {
        return (value || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '')
            .replace(/_/g, '');
    }

    private normalizeAction(value: string | null | undefined): string {
        return String(value || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ' ');
    }

    private isAadhaarDoc(value: string | null | undefined): boolean {
        const type = this.normalizeDocType(value);
        return ['AADHAAR', 'AADHAR', 'ADHAR', 'AADHAARCARD'].includes(type);
    }

    private isDlDoc(value: string | null | undefined): boolean {
        const type = this.normalizeDocType(value);
        return ['DL', 'LICENSE', 'DRIVINGLICENSE'].includes(type);
    }

    private isPhotoDoc(value: string | null | undefined): boolean {
        const type = this.normalizeDocType(value);
        return ['PHOTO', 'DRIVERPHOTO', 'PHOTOGRAPH'].includes(type);
    }

    private inferHistoryStage(row: any): HistoryStage {
        const explicitStage = String(
            row?.stage ||
            row?.level ||
            row?.role ||
            row?.actionByRole ||
            row?.actionRole ||
            row?.userRole ||
            ''
        ).trim().toUpperCase();

        const action = this.normalizeAction(
            row?.actionTaken ||
            row?.statusAfter ||
            row?.status
        );

        if (
            explicitStage.includes('UPLOADER') ||
            explicitStage.includes('CREATOR') ||
            explicitStage.includes('REQUESTER') ||
            explicitStage.includes('SUBMITTER')
        ) {
            return 'UPLOADER';
        }

        if (explicitStage.includes('APPROVER')) {
            return 'APPROVER';
        }

        if (explicitStage.includes('CONFIRMER')) {
            return 'CONFIRMER';
        }

        if (['SAVED', 'DRAFT', 'CREATED', 'SUBMITTED'].includes(action)) {
            return 'UPLOADER';
        }

        if (['APPROVED', 'REJECTED'].includes(action)) {
            return 'APPROVER';
        }

        return 'CONFIRMER';
    }

    private getHistorySortValue(item: PassHistoryEntry): number {
        const time = new Date(item?.createdAt || '').getTime();
        if (Number.isFinite(time) && time > 0) return time;

        const idNum = Number(item?.id);
        if (Number.isFinite(idNum) && idNum > 0) return idNum;

        return 0;
    }

    private getFirstHistoryByStage(stage: HistoryStage): PassHistoryEntry | null {
        const history = this.remarksHistory?.() || [];
        return history.find(item => String(item?.stage || '').trim().toUpperCase() === stage) || null;
    }

    private getLatestHistoryByStage(stage: HistoryStage): PassHistoryEntry | null {
        const history = this.remarksHistory?.() || [];
        return [...history]
            .reverse()
            .find(item => String(item?.stage || '').trim().toUpperCase() === stage) || null;
    }

    private getDaysDiff(dateStr: string | null | undefined): number | null {
        if (!dateStr) return null;
        const target = new Date(dateStr);
        if (isNaN(target.getTime())) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        target.setHours(0, 0, 0, 0);

        const diffMs = target.getTime() - today.getTime();
        return Math.round(diffMs / (1000 * 60 * 60 * 24));
    }

    getRemarkClass(dateStr: string | null | undefined): string {
        const days = this.getDaysDiff(dateStr);
        if (days === null) return '';
        if (days < 0) return 'remark-expired';
        if (days <= 30) return 'remark-expiring';
        return 'remark-valid';
    }

    getRemarkText(dateStr: string | null | undefined): string {
        const days = this.getDaysDiff(dateStr);
        if (days === null) return '-';
        if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
        if (days === 0) return 'Expires today';
        if (days <= 30) return `Expires in ${days} day${days === 1 ? '' : 's'}`;
        return 'Valid';
    }

    private getRemarkPdfStyle(dateStr: string | null | undefined): {
        text: string;
        fillColor: [number, number, number];
        textColor: [number, number, number];
    } {
        const days = this.getDaysDiff(dateStr);

        if (days === null) {
            return {
                text: '-',
                fillColor: [245, 245, 245],
                textColor: [80, 80, 80]
            };
        }

        if (days < 0) {
            return {
                text: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`,
                fillColor: [252, 228, 228],
                textColor: [180, 50, 50]
            };
        }

        if (days === 0) {
            return {
                text: 'Expires today',
                fillColor: [255, 243, 205],
                textColor: [140, 100, 20]
            };
        }

        if (days <= 30) {
            return {
                text: `Expires in ${days} day${days === 1 ? '' : 's'}`,
                fillColor: [255, 243, 205],
                textColor: [140, 100, 20]
            };
        }

        return {
            text: 'Valid',
            fillColor: [223, 240, 216],
            textColor: [40, 120, 60]
        };
    }

    private getWorkflowPerson(stage: HistoryStage): string {

        switch (stage) {

            case 'CONFIRMER':
                return this.confirmerName() || '-';

            case 'APPROVER':
                return this.approverName() || '-';

            default:
                return this.uploaderName() || '-';
        }

    }

    private getUploaderName(): string {
        return this.uploaderName() || '-';
    }
    private getWorkflowDate(stage: HistoryStage): string {
        const match = this.getLatestHistoryByStage(stage);

        if (!match?.createdAt) {
            return '-';
        }

        return this.formatDate(match.createdAt);
    }

    private async loadImageAsDataUrl(url: string): Promise<string | null> {
        try {
            const response = await fetch(url);
            const blob = await response.blob();

            return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch {
            return null;
        }
    }
    private getContractorDisplay(req: any): string {

        return String(
            req?.contractorCode ||
            req?.contractorId ||
            '-'
        ).trim();

    }

    private getVehicleDetailsTitle(req: any): string {
        const vehicleNo = String(req?.vehicleNo || '').trim() || '-';
        const vehicleType = String(req?.vehicleType || '').trim() || '-';
        return `Vehicle Details (${vehicleNo}, ${vehicleType})`;
    }

    private drawCompactField(
        doc: jsPDF,
        label: string,
        value: string,
        x: number,
        y: number,
        w: number,
        h: number = 12.5
    ): void {
        const safeValue = value && String(value).trim() ? String(value).trim() : '-';
        const valueLines = doc.splitTextToSize(safeValue, w - 5).slice(0, 2);

        doc.setDrawColor(210, 210, 210);
        doc.roundedRect(x, y, w, h, 2, 2);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(95, 95, 95);
        doc.text(label, x + 2.5, y + 4);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.2);
        doc.setTextColor(20, 20, 20);
        doc.text(valueLines, x + 2.5, y + 8.1);
    }

    private drawFieldRow(
        doc: jsPDF,
        label: string,
        value: string,
        x: number,
        y: number,
        w: number,
        h: number
    ): void {
        doc.setDrawColor(210, 210, 210);
        doc.roundedRect(x, y, w, h, 2, 2);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(90, 90, 90);
        doc.text(label, x + 3, y + 5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(20, 20, 20);
        const safeValue = value && String(value).trim() ? String(value) : '-';
        doc.text(safeValue, x + 3, y + 11);
    }

    private drawSignatureBlock(
        doc: jsPDF,
        x: number,
        y: number,
        w: number,
        personName: string,
        empCode: string,
        dateText: string,
        role: string
    ): void {

        const name = String(personName || '-').trim() || '-';
        const code = String(empCode || '-').trim() || '-';
        const date = String(dateText || '-').trim() || '-';
        const roleText = String(role || '').trim();

        // Name above signature line
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(20, 20, 20);
        doc.text(name, x + w / 2, y - 2, { align: 'center' });

        // Signature line
        doc.setDrawColor(180, 180, 180);
        doc.line(x, y, x + w, y);

        // Employee Code
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(code, x + w / 2, y + 4, { align: 'center' });

        // Date
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(date, x + w / 2, y + 8, { align: 'center' });

        // Role
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(roleText, x + w / 2, y + 12, { align: 'center' });

    }
    private addSectionTitle(
        doc: jsPDF,
        title: string,
        y: number,
        rightText: string = ''
    ): void {
        doc.setFillColor(245, 247, 250);
        doc.roundedRect(12, y, 186, 8, 2, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(30, 30, 30);
        doc.text(title, 15, y + 5.3);

        const safeRight = String(rightText || '').trim();
        if (safeRight) {
            const chipW = Math.max(30, Math.min(42, safeRight.length * 1.75));
            const chipH = 5.6;
            const chipX = 198 - chipW - 2;

            doc.setDrawColor(180, 180, 180);
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(chipX, y + 1.2, chipW, chipH, 2, 2, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.8);
            doc.setTextColor(35, 35, 35);
            doc.text(safeRight, chipX + chipW / 2, y + 4.9, { align: 'center' });
        }
    }
    async printPass(): Promise<void> {
        const req = this.request();
        if (!req) {
            this.errorMsg.set('No request data available for PDF.');
            return;
        }

        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const leftLogo = await this.loadImageAsDataUrl('/logos/security.jpg');
        const rightLogo = await this.loadImageAsDataUrl('/logos/heg_logo.jpg');

        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');

        pdf.setDrawColor(170, 170, 170);
        pdf.setLineWidth(0.5);
        pdf.roundedRect(10, 10, 190, 28, 3, 3);

        if (leftLogo) {
            pdf.addImage(leftLogo, 'JPEG', 14, 13, 20, 16);
        }

        if (rightLogo) {
            pdf.addImage(rightLogo, 'JPEG', 180, 13, 20, 16);
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(35, 35, 35);
        pdf.text('VENDORS VEHICLE/CONTRACTOR PERMISSION FORM', pageWidth / 2, 18, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.text('HEG LIMITED, MANDIDEEP', pageWidth / 2, 23, { align: 'center' });

        // pdf.setDrawColor(170, 170, 170);
        // pdf.roundedRect(160, 24.5, 32, 8, 2, 2);
        // pdf.setFont('helvetica', 'bold');
        // pdf.setFontSize(7.2);
        // pdf.setTextColor(35, 35, 35);
        // pdf.text(this.formNo, 176, 29.8, { align: 'center' });

        let y = 44;

        const contentLeft = 12;
        const contentWidth = 186;
        const colGap = 4;
        const infoColW = (contentWidth - colGap * 2) / 3;
        const infoRowH = 12.5;
        const rowGap = 3;

        const col1X = contentLeft;
        const col2X = contentLeft + infoColW + colGap;
        const col3X = contentLeft + (infoColW + colGap) * 2;

        this.addSectionTitle(pdf, 'General Information', y, this.formNo);
        y += 10;

        this.drawCompactField(
            pdf,
            'Contractor Name (Code)',
            this.getContractorDisplay(req),
            col1X,
            y,
            infoColW,
            infoRowH
        );
        this.drawCompactField(
            pdf,
            'Request Date',
            this.formatDate((req as any).createdDate),
            col2X,
            y,
            infoColW,
            infoRowH
        );
        this.drawCompactField(
            pdf,
            'Nature of Job',
            (req as any).natureOfJob || '-',
            col3X,
            y,
            infoColW,
            infoRowH
        );

        y += infoRowH + rowGap;

        this.drawCompactField(
            pdf,
            'Permission To',
            this.formatDate((req as any).permissionTo),
            col1X,
            y,
            infoColW,
            infoRowH
        );
        // this.drawCompactField(
        //     pdf,
        //     'Print Date',
        //     this.formatDate(new Date().toISOString()),
        //     col3X,
        //     y,
        //     infoColW,
        //     infoRowH
        // );
        this.drawCompactField(
            pdf,
            'Current Status',
            this.status() || '-',
            col2X,
            y,
            infoColW,
            infoRowH
        );

        this.drawCompactField(
            pdf,
            'Approved Date',
            '-',
            col3X,
            y,
            infoColW,
            infoRowH
        );
        // this.drawCompactField(
        //     pdf,
        //     'Current Status',
        //     this.status() || '-',
        //     col2X,
        //     y,
        //     infoColW,
        //     infoRowH
        // );

        y += infoRowH + 6;

        this.addSectionTitle(pdf, this.getVehicleDetailsTitle(req), y);
        y += 10;

        autoTable(pdf, {
            startY: y,
            head: [['Vehicle Documents', 'Doc. Number', 'Valid Upto', 'Remark']],
            body: (this.vehicleDocuments() || []).map((doc: any) => {
                const remark = this.getRemarkPdfStyle(doc.validTill);
                return [
                    doc.documentType || '-',
                    doc.documentNo || '-',
                    this.formatDate(doc.validTill),
                    remark.text
                ];
            }),
            margin: { left: 12, right: 12, bottom: 26 },
            tableWidth: 186,
            theme: 'grid',
            styles: {
                fontSize: 8,
                cellPadding: 2.5,
                textColor: [40, 40, 40],
                lineColor: [210, 210, 210],
                lineWidth: 0.2,
                valign: 'middle'
            },
            headStyles: {
                fillColor: [239, 242, 247],
                textColor: [20, 20, 20],
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [252, 252, 252]
            },
            columnStyles: {
                0: { cellWidth: 52 },
                1: { cellWidth: 36 },
                2: { cellWidth: 32 },
                3: { cellWidth: 66 }
            },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 3) {
                    const rowDoc = this.vehicleDocuments()[data.row.index];
                    const remark = this.getRemarkPdfStyle(rowDoc?.validTill);
                    data.cell.styles.fillColor = remark.fillColor;
                    data.cell.styles.textColor = remark.textColor;
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        y = (pdf as any).lastAutoTable.finalY + 8;

        this.addSectionTitle(pdf, 'Driver / Conductor Details', y);
        y += 12;

        autoTable(pdf, {
            startY: y,
            head: [['Role', 'Name', 'Contact No.', 'Aadhar No.', 'License No.', 'License Valid Upto', 'Remark (License)']],
            body: (this.passEmployees() || []).map((driver: any) => {
                const remark = this.getRemarkPdfStyle(driver._licenseValidTill);
                return [
                    driver._role || '-',
                    driver.name || '-',
                    driver.mobileNo || '-',
                    driver._aadhaarNo || '-',
                    driver._licenseNo || '-',
                    this.formatDate(driver._licenseValidTill),
                    remark.text
                ];
            }),
            margin: { left: 12, right: 12 },
            theme: 'grid',
            styles: {
                fontSize: 8,
                cellPadding: 2.5,
                textColor: [40, 40, 40],
                lineColor: [210, 210, 210],
                lineWidth: 0.2,
                valign: 'middle'
            },
            headStyles: {
                fillColor: [239, 242, 247],
                textColor: [20, 20, 20],
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [252, 252, 252]
            },
            columnStyles: {
                0: { cellWidth: 22 }, // Role
                1: { cellWidth: 28 }, // Name
                2: { cellWidth: 22 }, // Contact No.
                3: { cellWidth: 24 }, // Aadhar No.
                4: { cellWidth: 24 }, // License No.
                5: { cellWidth: 22 }, // Valid Upto
                6: { cellWidth: 44 }  // Remark
            },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 6) {
                    const rowDriver = this.passEmployees()[data.row.index];
                    const remark = this.getRemarkPdfStyle(rowDriver?._licenseValidTill);
                    data.cell.styles.fillColor = remark.fillColor;
                    data.cell.styles.textColor = remark.textColor;
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });


        const sectionLeft = 10;
        const blockWidth = 44;
        const gap = 3;
        const footerSignY = 274;
        const totalPages = pdf.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);

            this.drawSignatureBlock(
                pdf,
                sectionLeft,
                footerSignY,
                blockWidth,
                this.contractorName() || '-',
                String(req?.contractorId || '-'),
                this.getWorkflowDate('UPLOADER'),
                'contractor name'
            );

            const uploader = this.getFirstHistoryByStage('UPLOADER');

            this.drawSignatureBlock(
                pdf,
                sectionLeft + (blockWidth + gap),
                footerSignY,
                blockWidth,
                this.uploaderName(),
                uploader?.byEmpCode || '-',
                this.getWorkflowDate('UPLOADER'),
                'uploader'
            );
            const confirmer = this.getLatestHistoryByStage('CONFIRMER');

            this.drawSignatureBlock(
                pdf,
                sectionLeft + (blockWidth + gap) * 2,
                footerSignY,
                blockWidth,
                this.confirmerName(),
                confirmer?.byEmpCode || '-',
                this.getWorkflowDate('CONFIRMER'),
                'confirmer'
            );

            const approver = this.getLatestHistoryByStage('APPROVER');

            this.drawSignatureBlock(
                pdf,
                sectionLeft + (blockWidth + gap) * 3,
                footerSignY,
                blockWidth,
                this.approverName(),
                approver?.byEmpCode || '-',
                this.getWorkflowDate('APPROVER'),
                'approver'
            );

            pdf.setDrawColor(220, 220, 220);
            pdf.line(12, 287, 198, 287);

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(90, 90, 90);
            pdf.text(`Generated on: ${new Date().toLocaleString('en-GB')}`, 12, 292);
            pdf.text(`Page ${i} of ${totalPages}`, 198, 292, { align: 'right' });
        }

        pdf.save(`vehicle-permission-pass-${this.requestNo() || 'document'}.pdf`);
    }

    getStatusClass(status: string): string {
        const normalized = (status || '').trim().toUpperCase();

        switch (normalized) {
            case 'SUBMITTED':
            case 'CREATED':
                return 'wf-submitted';
            case 'CONFIRMED':
            case 'PENDING':
                return 'wf-pending';
            case 'WAITING':
                return 'wf-waiting';
            case 'VERIFIED':
                return 'wf-verified';
            case 'APPROVED':
                return 'wf-approved';
            case 'REJECTED':
                return 'wf-rejected';
            case 'HOLD':
            case 'MODIFY':
            case 'MODIFIED':
            case 'NEED MODIFICATION':
                return 'wf-hold';
            case 'SAVED':
            case 'DRAFT':
                return 'wf-draft';
            default:
                return 'wf-waiting';
        }
    }

    goBack(): void {
        this.router.navigate(['/vehicle-permission/list']);
    }
}