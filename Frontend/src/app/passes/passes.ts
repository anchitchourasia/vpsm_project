import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject
} from '@angular/core';

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


  currentPage = signal(1);

  pageSize = signal(10);





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



    return this.allPasses()
      .filter(row => {


        const matchSearch =

          !search ||

          row.vehicleNo.toLowerCase().includes(search) ||

          row.employeeNo.toLowerCase().includes(search) ||

          row.contractorCode.toLowerCase().includes(search) ||

          row.empType.toLowerCase().includes(search);



        const matchStatus =

          status === 'ALL' ||

          row.status === status;



        return matchSearch && matchStatus;



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


  viewPass(row: PassListRow) {


    this.router.navigate(

      [

        '/pass-entry',

        row.passId

      ],

      {

        queryParams: {
          mode: 'view'
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



}