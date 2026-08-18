// import { environment } from '../../environments/environment';

// export const API_CONFIG = {
//   BASE_URL: environment.apiBaseUrl,
//   API_KEY: environment.apiKey,
//   APIKEY: environment.apiKey,

//   // AUTH
//   AUTHORITY_BY_EMP: `${environment.apiBaseUrl}/api/authority`,
//   AUTHORITY_UPDATE: `${environment.apiBaseUrl}/api/authority/update`,
//   EMPLOYEE_REPORT: `${environment.apiBaseUrl}/api/reports/employee-department`,
//   EMPLOYEEREPORT: `${environment.apiBaseUrl}/api/reports/employee-department`,

//   // PASSES / SAVE
//   PASS_SAVE: `${environment.apiBaseUrl}/api/passes/save`,
//   PASS_UPDATE: `${environment.apiBaseUrl}/api/passes/update`,
//   PASS_LIST_V1: `${environment.apiBaseUrl}/api/passes/listV1`,
//   PASS_LIST: `${environment.apiBaseUrl}/api/passes/list`,
//   PASS_HISTORY: `${environment.apiBaseUrl}/api/history`,
//   PASS_STATUS_UPDATE: `${environment.apiBaseUrl}/api/passes/status`,

//   // aliases used by pass-entry.ts
//   PASSSAVE: `${environment.apiBaseUrl}/api/passes/save`,
//   PASSUPDATE: `${environment.apiBaseUrl}/api/passes/update`,
//   PASSLISTV1: `${environment.apiBaseUrl}/api/passes/listV1`,
//   PASSLIST: `${environment.apiBaseUrl}/api/passes/list`,
//   PASSHISTORY: `${environment.apiBaseUrl}/api/history`,
//   PASSSTATUSUPDATE: `${environment.apiBaseUrl}/api/passes/status`,

//   DOCUMENTS_DOWNLOAD: `${environment.apiBaseUrl}/api/passes/documents/download`,
//   DOCUMENTSDOWNLOAD: `${environment.apiBaseUrl}/api/passes/documents/download`,

//   // GATE / COMPLIANCE
//   GATE_LOGS: `${environment.apiBaseUrl}/api/gate-logs/list`,
//   COMPLIANCE: `${environment.apiBaseUrl}/api/compliance/list`,

//   // AUTHORITY
//   AUTHORITY: `${environment.apiBaseUrl}/api/authority/list`,
//   AUTHORITY_GRANT: `${environment.apiBaseUrl}/api/authority/grant`,

//   // CVPS
//   CVPS_BASE: `${environment.cvpsBaseUrl}/api/requests`,
//   CVPS_CREATE_REQUEST: `${environment.cvpsBaseUrl}/api/requests/create`,
//   CVPS_UPDATE_REQUEST: `${environment.cvpsBaseUrl}/api/requests/update`,
//   CVPS_GET_REQUEST_BY_ID: `${environment.cvpsBaseUrl}/api/requests`,
//   CVPS_GET_ALL_REQUESTS: `${environment.cvpsBaseUrl}/api/requests`,
//   CVPS_DELETE_REQUEST: `${environment.cvpsBaseUrl}/api/requests`,
//   CVPS_BP_RECORDS: `${environment.cvpsBaseUrl}/api/bp-records`,
// } as const;

// export const CVPS_URLS = {
//   createRequest: (requestNo: number) => `${environment.cvpsBaseUrl}/create`,
// };



import { environment } from '../../environments/environment';

export const API_CONFIG = {
  BASE_URL           : environment.apiBaseUrl,
  API_KEY            : environment.apiKey,

  // ── PASSES & REGISTRY ───────────────────────────────────
  PASS_SAVE           : `${environment.apiBaseUrl}/api/passes`,
  PASS_UPDATE         : `${environment.apiBaseUrl}/api/passes`,
  PASS_SUBMIT         : `${environment.apiBaseUrl}/api/passes`,
  PASS_LIST           : `${environment.apiBaseUrl}/api/passes`,
  PASS_LIST_V1        : `${environment.apiBaseUrl}/api/passes`,
  PASSES_BASE         : `${environment.apiBaseUrl}/api/passes`,
  PASS_STATUS_UPDATE  : `${environment.apiBaseUrl}/api/passes/status`,
  PASS_BY_ID          : (id: string) => `${environment.apiBaseUrl}/api/passes/${id}`,
  PASS_STATUS         : (id: string) => `${environment.apiBaseUrl}/api/passes/${id}/status`,
  PASS_CANCEL         : (id: string) => `${environment.apiBaseUrl}/api/passes/${id}/cancel`,
  PASS_REJECT         : (id: string) => `${environment.apiBaseUrl}/api/passes/${id}/reject`,
  PASS_FORWARD        : (id: string) => `${environment.apiBaseUrl}/api/passes/${id}/forward-to-authority`,
  PASS_SURRENDER      : (id: string) => `${environment.apiBaseUrl}/api/passes/${id}/surrender`,
  PASS_RENEW          : (id: string) => `${environment.apiBaseUrl}/api/passes/${id}/renew`,
  PASS_REISSUE        : (id: string) => `${environment.apiBaseUrl}/api/passes/${id}/reissue`,
  PASS_REPLACE_VEHICLE: (id: string) => `${environment.apiBaseUrl}/api/passes/${id}/replace-vehicle`,
  PASS_GATE_ENTRY     : (id: string) => `${environment.apiBaseUrl}/api/passes/${id}/gate-entry`,
  PASS_GATE_EXIT      : (id: string) => `${environment.apiBaseUrl}/api/passes/${id}/gate-exit`,

  // ── DOCUMENTS & HISTORY ─────────────────────────────────
  DOCUMENT_UPLOAD     : `${environment.apiBaseUrl}/api/passes/upload-doc`,
  DOCUMENT_DOWNLOAD   : (docId: string | number) => `${environment.apiBaseUrl}/api/passes/download-doc/${docId}`,
  PASS_HISTORY        : `${environment.apiBaseUrl}/api/history`,

  // ── GATE LOGS & COMPLIANCE ──────────────────────────────
  GATE_LOGS           : `${environment.apiBaseUrl}/api/passes/gate-entry`,
  COMPLIANCE          : `${environment.cvpsBaseUrl}/api/compliance`,

  // ── EMPLOYEE REPORT ─────────────────────────────────────
  EMPLOYEE_REPORT     : `${environment.apiBaseUrl}/api/employee-report`,

  // ── AUTHORITY MODULE (Original frontend requirements) ───
  AUTHORITY           : `${environment.apiBaseUrl}/api/admin/users`,
  AUTHORITY_GRANT     : `${environment.apiBaseUrl}/api/auth/register`,
  AUTHORITY_SUBMIT    : `${environment.apiBaseUrl}/api/auth/register`,
  AUTHORITY_UPDATE    : `${environment.apiBaseUrl}/api/auth/change-password`,
  AUTHORITY_BY_EMP    : `${environment.apiBaseUrl}/api/admin/users`,
  AUTHORITY_USERS     : `${environment.apiBaseUrl}/api/admin/users`,
  AUTHORITY_STATUS    : (username: string) => `${environment.apiBaseUrl}/api/admin/users/${username}/status`,

  // ── AUTHENTICATION ──────────────────────────────────────
  AUTH_LOGIN          : `${environment.apiBaseUrl}/api/auth/login`,
  AUTH_REGISTER       : `${environment.apiBaseUrl}/api/auth/register`,
  AUTH_CHANGE_PASSWORD: `${environment.apiBaseUrl}/api/auth/change-password`,

  // ── CVPS (External Integration) ─────────────────────────
  CVPS_VEHICLES       : `${environment.cvpsBaseUrl}/api/vehicles`,
  CVPS_VEHICLE_BY_REG : (regNo: string) => `${environment.cvpsBaseUrl}/api/vehicles/${regNo}`,
  CVPS_PARKING_SLOTS  : `${environment.cvpsBaseUrl}/api/parking-slots`,
  CVPS_SYNC           : `${environment.cvpsBaseUrl}/api/sync`,
};