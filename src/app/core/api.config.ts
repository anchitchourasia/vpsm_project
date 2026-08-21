import { environment } from '../../environments/environment';

export const API_CONFIG = {
  API_KEY: environment.apiKey,
  APIKEY: environment.apiKey,

  // AUTH
  AUTHORITY_BY_EMP: `${environment.cvpsBaseUrl}/api/auth/user`,
  AUTHORITY_UPDATE: `${environment.apiBaseUrl}/api/authority/update`,
  EMPLOYEE_REPORT: `${environment.apiBaseUrl}/api/reports/employee-department`,
  EMPLOYEEREPORT: `${environment.apiBaseUrl}/api/reports/employee-department`,


 

  DOCUMENTS_DOWNLOAD: `${environment.apiBaseUrl}/api/passes/documents/download`,
  DOCUMENTSDOWNLOAD: `${environment.apiBaseUrl}/api/passes/documents/download`,


  // AUTHORITY
  AUTHORITY: `${environment.apiBaseUrl}/api/authority/list`,
  AUTHORITY_GRANT: `${environment.apiBaseUrl}/api/authority/grant`,

  // CVPS
  CVPS_BASE: `${environment.cvpsBaseUrl}/api/requests`,
  CVPS_CREATE_REQUEST: `${environment.cvpsBaseUrl}/api/requests/create`,
  CVPS_UPDATE_REQUEST: `${environment.cvpsBaseUrl}/api/requests/update`,
  CVPS_GET_REQUEST_BY_ID: `${environment.cvpsBaseUrl}/api/requests`,
  CVPS_GET_ALL_REQUESTS: `${environment.cvpsBaseUrl}/api/requests`,
  CVPS_DELETE_REQUEST: `${environment.cvpsBaseUrl}/api/requests`,
  CVPS_BP_RECORDS: `${environment.cvpsBaseUrl}/api/bp-records`,
  CVPS_GET_MANPOWER_DOCUMENTS:
  `${environment.cvpsBaseUrl}/api/manpower/documents/{empNo}`,
  CVPS_DOWNLOAD_MANPOWER_DOCUMENT:
  `${environment.cvpsBaseUrl}/api/manpower/documents/download/{fileName}`,
  

  // Department master API
  DEPARTMENT_LIST: `${environment.cvpsBaseUrl}/api/dept`,
} as const;

export const CVPS_URLS = {
  createRequest: (requestNo: number) => `${environment.cvpsBaseUrl}/create`,
};