import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject
} from '@angular/core';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  Subject,
  takeUntil,
  timeout,
  catchError,
  of
} from 'rxjs';

import { API_CONFIG } from '../core/api.config';


const HTTP_TIMEOUT_MS = 12000;


/*
=====================================================
 PASS LIST RESPONSE
 Native Query Response Mapping
=====================================================
*/
interface PassListRow {

  id: number;
  passId: number;

  passNo: string;

  vehicleNo: string;
  vehicleType: string;

  employeeNo: string;
  empType: string;

  name: string;

  deptCode: string;
  deptName: string;

  contractorCode: string;
  contractorName: string;

  aadhaarNo: string;

  status: string;
  passStatus: string;

  issueDate: string;
  validityDate: string;

  gateNo: string;

}



@Component({

  selector: 'app-passes',

  standalone: true,

  imports: [
    CommonModule,
    FormsModule
  ],

  templateUrl: './passes.html',

  styleUrl: './passes.css'

})


export class Passes implements OnInit, OnDestroy {


  private http = inject(HttpClient);

  private router = inject(Router);



  private destroy$ = new Subject<void>();



  private readonly HEADERS = new HttpHeaders({

    'x-api-key': API_CONFIG.API_KEY,

    'Content-Type': 'application/json'

  });





  /*
  =====================================================
   LIST DATA
  =====================================================
  */

  allPasses = signal<PassListRow[]>([]);


  isLoading = signal(false);

  hasError = signal(false);



  /*
  =====================================================
   FILTER
  =====================================================
  */


  searchText = signal('');

  filterStatus = signal('ALL');
  filterEmpType = signal('ALL');
  filterVehicleType = signal('ALL');


  currentPage = signal(1);

  pageSize = signal(10);
  isApprover = signal(false);




  /*
  =====================================================
   SEARCH + FILTER
  =====================================================
  */


  filteredPasses = computed(() => {

    const search = this.searchText()
      .trim()
      .toLowerCase();

    const status = this.filterStatus();
    const empType = this.filterEmpType();
    const vehicleType = this.filterVehicleType();

    return this.allPasses()
      .filter(row => {
        const matchEmpType =
          empType === 'ALL' ||
          (row.empType || '').trim().toUpperCase() === empType;

        const matchVehicleType =
          vehicleType === 'ALL' ||
          (row.vehicleType || '').trim().toUpperCase() === vehicleType;

        const matchSearch =
          !search ||
          (row.vehicleNo || '').toLowerCase().includes(search) ||
          (row.employeeNo || '').toLowerCase().includes(search) ||
          (row.contractorCode || '').toLowerCase().includes(search) ||
          (row.empType || '').toLowerCase().includes(search);

        const matchStatus =
          status === 'ALL' ||
          (row.status || '').trim().toUpperCase() === status;

        return matchSearch && matchStatus && matchEmpType && matchVehicleType;
      });

  });





  /*
  =====================================================
   PAGINATION
  =====================================================
  */


  pagedPasses = computed(() => {


    const start =

      (this.currentPage() - 1)
      *
      this.pageSize();



    return this.filteredPasses()
      .slice(
        start,
        start + this.pageSize()
      );

  });





  get totalPages(): number {


    return Math.max(

      1,

      Math.ceil(
        this.filteredPasses().length /
        this.pageSize()
      )

    );


  }





  get totalPagesArray(): number[] {


    return Array.from(

      {

        length: this.totalPages

      },

      (_, i) => i + 1


    );


  }





  /*
  =====================================================
   INIT
  =====================================================
  */


  ngOnInit(): void {
    const session = sessionStorage.getItem('vpsm_session');

    if (session) {
      try {
        const user = JSON.parse(session);

        const primaryRole = String(user?.primaryRole || '').trim().toUpperCase();
        const roles = Array.isArray(user?.roles)
          ? user.roles.map((r: any) => String(r).trim().toUpperCase())
          : [];

        this.isApprover.set(
          primaryRole === 'APPROVER' || roles.includes('APPROVER')
        );
      } catch (e) {
        console.error('Session parse error', e);
        this.isApprover.set(false);
      }
    } else {
      this.isApprover.set(false);
    }

    this.loadPasses();
  }



  ngOnDestroy(): void {

    this.destroy$.next();

    this.destroy$.complete();

  }






  /*
  =====================================================
   LOAD LIST
   Native Query API
  =====================================================
  */


  loadPasses(): void {


    this.isLoading.set(true);

    this.hasError.set(false);



    this.http.get<any[]>(

      API_CONFIG.PASS_LIST_V1,

      {
        headers: this.HEADERS
      }

    )


      .pipe(

        timeout(HTTP_TIMEOUT_MS),

        takeUntil(this.destroy$),


        catchError(err => {


          console.error(
            "PASS LIST ERROR",
            err
          );


          this.hasError.set(true);


          return of([]);


        })

      )


      .subscribe({
        next: (data) => {
          console.log('PASS_LIST_V1 Response:', data);

          const rows = data.map(x => this.mapListData(x));

          this.allPasses.set(rows);

          this.isLoading.set(false);
        },

        error: (err) => {
          console.error('PASS_LIST_V1 Error:', err);
          this.isLoading.set(false);
        }
      });



  }
  /*
 =====================================================
  canEditPass
 =====================================================
 */



  canEditPass(row: PassListRow): boolean {
    if (this.isApproverUser()) {
      return false;
    }

    const status = (row?.status || '').trim().toUpperCase();
    return status !== 'ACTIVE' && status !== 'APPROVED' && status !== 'CONFIRMED';
  }







  /*
  =====================================================
   MAP NATIVE QUERY RESPONSE
  =====================================================
  */


  private mapListData(row: any): PassListRow {

    return {

      id: row.id,
      passId: row.id,

      passNo: row.passNo,

      vehicleNo: row.vehicleNo,
      vehicleType: row.vehicleType,

      employeeNo: String(row.employeeNo),
      empType: row.empType,

      name: row.name,

      deptCode: row.deptCode,
      deptName: row.deptName,

      contractorCode: row.contractorCode,
      contractorName: row.contractorName,

      aadhaarNo: row.aadhaarNo,

      status: row.status,
      passStatus: row.status,

      issueDate: row.issueDate,
      validityDate: row.validityDate,

      gateNo: row.gateNo

    };

  }







  /*
  =====================================================
   SEARCH
  =====================================================
  */


  onSearch(value: string) {

    this.searchText.set(value);

    this.currentPage.set(1);

  }





  /*
  =====================================================
   STATUS FILTER
  =====================================================
  */


  onStatusChange(value: string) {

    this.filterStatus.set(value);

    this.currentPage.set(1);

  }
  onEmpTypeChange(value: string) {
    this.filterEmpType.set(value);
    this.currentPage.set(1);
  }

  onVehicleTypeChange(value: string) {
    this.filterVehicleType.set(value);
    this.currentPage.set(1);
  }





  /*
  =====================================================
   PAGE
  =====================================================
  */


  changePage(page: number) {

    if (
      page >= 1 &&
      page <= this.totalPages
    ) {

      this.currentPage.set(page);

    }

  }




  onPageSizeChange(value: string) {

    this.pageSize.set(
      Number(value)
    );

    this.currentPage.set(1);

  }






  /*
  =====================================================
   EDIT
   Only redirect with ID
   Complete data loaded in Entry Page
  =====================================================
  */


  editPass(row: PassListRow) {


    this.router.navigate(

      [

        '/pass-entry',

        row.passId

      ]

    );


  }




  /*
  =====================================================
   VIEW
  =====================================================
  */


  viewPass(row: PassListRow): void {
    if (!row || !row.id) {
      console.error('Pass ID not found.', row);
      return;
    }

    console.log('Opening View Page for ID :', row.id);

    this.router.navigate(
      ['/pass-entry'],
      {
        queryParams: {
          mode: 'view',
          id: row.id
        }
      }
    );
  }







  formatDate(date: string): string {


    if (!date)
      return '-';



    return new Date(date)

      .toLocaleDateString(
        'en-GB'
      );


  }





  getStatusClass(status: string) {


    switch (
    status?.toUpperCase()
    ) {

      case 'SAVED':

        return 'badge bg-primary';



      case 'SUBMITTED':

        return 'badge bg-warning';



      case 'CONFIRMED':

        return 'badge bg-success';



      case 'REJECTED':

        return 'badge bg-danger';



      default:

        return 'badge bg-secondary';


    }



  }

  /*
=====================================================
 EDIT REDIRECT
 List -> Entry Page
 Load complete data by ID
=====================================================
*/
  //=====================================================
  // EDIT REDIRECT
  // Pass List -> Pass Entry
  //=====================================================
  openEditInPassEntry(row: PassListRow): void {

    // Validate ID
    if (!row || !row.id) {

      console.error('Pass ID not found.', row);

      return;

    }

    console.log('Opening Edit Page for ID :', row.id);

    this.router.navigate(
      ['/pass-entry'],
      {
        queryParams: {
          mode: 'edit',
          id: row.id
        }
      }
    );

  }



  isApproverUser(): boolean {
    const session = sessionStorage.getItem('vpsm_session');
    if (!session) return false;

    try {
      const user = JSON.parse(session);

      const primaryRole = String(user?.primaryRole || '').trim().toUpperCase();
      const roles = Array.isArray(user?.roles)
        ? user.roles.map((r: any) => String(r).trim().toUpperCase())
        : [];

      return primaryRole === 'APPROVER' || roles.includes('APPROVER');
    } catch {
      return false;
    }
  }



  //=====================================================
  // downloadExcel
  //=====================================================

  downloadExcel(): void {
    const rows = this.filteredPasses();

    if (!rows || rows.length === 0) {
      alert('No pass data available to export.');
      return;
    }

    const exportData = rows.map((p, index) => ({
      'Sr No': index + 1,
      'ID': p.id ?? '',
      'Pass No': p.passNo ?? '',
      'Vehicle No': p.vehicleNo ?? '',
      'Vehicle Type': p.vehicleType ?? '',
      'Employee Type': p.empType ?? '',
      'Name': p.name ?? '',
      'EC No': p.employeeNo ?? '',
      'Department': p.deptName ?? '',
      'Mobile No': p.aadhaarNo ?? '',
      'Contractor Name': p.contractorName ?? '',
      'Contractor Code': p.contractorCode ?? '',
      'Status': p.status ?? '',
    }));

    const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(exportData);
    const workbook: XLSX.WorkBook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pass Registry');

    const fileName = `Pass_Registry_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }



}