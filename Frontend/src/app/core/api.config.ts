
import { environment } from '../../environments/environment';

export const API_CONFIG = {
  BASE_URL         : environment.apiBaseUrl,
  API_KEY          : environment.apiKey,

  // ── AUTH ──────────────────────────────────────────
  AUTHORITY_BY_EMP : `${environment.apiBaseUrl}/api/authority`,
  EMPLOYEE_REPORT  : `${environment.apiBaseUrl}/api/reports/employee-department`,

  // ── PASSES / SAVE ─────────────────────────────────
  PASS_SAVE        : `${environment.apiBaseUrl}/api/passes/save`,
  PASS_UPDATE      : `${environment.apiBaseUrl}/api/passes/update`,
  PASS_LIST        : `${environment.apiBaseUrl}/api/passes/list`,
  PASS_HISTORY    : `${environment.apiBaseUrl}/api/history`,
  PASS_STATUS_UPDATE: `${environment.apiBaseUrl}/api/passes/status`,

  

  // ── PASSES ────────────────────────────────────────
  
  DOCUMENTS_DOWNLOAD: `${environment.apiBaseUrl}/api/passes/documents/download`,

  // ── GATE / COMPLIANCE ─────────────────────────────
  GATE_LOGS        : `${environment.apiBaseUrl}/api/gate-logs/list`,
  COMPLIANCE       : `${environment.apiBaseUrl}/api/compliance/list`,

  // ── AUTHORITY ─────────────────────────────────────
  AUTHORITY        : `${environment.apiBaseUrl}/api/authority/list`,
  AUTHORITY_GRANT  : `${environment.apiBaseUrl}/api/authority/grant`,

  // ── CVPS ──────────────────────────────────────────
  CVPS_BASE             : `${environment.cvpsBaseUrl}/api/requests`,
  CVPS_CREATE_REQUEST   : `${environment.cvpsBaseUrl}/api/requests/create`,
  CVPS_UPDATE_REQUEST   : `${environment.cvpsBaseUrl}/api/requests/update`,
  CVPS_GET_REQUEST_BY_ID: `${environment.cvpsBaseUrl}/api/requests`,
  CVPS_GET_ALL_REQUESTS : `${environment.cvpsBaseUrl}/api/requests`,
  CVPS_DELETE_REQUEST   : `${environment.cvpsBaseUrl}/api/requests`,
} as const;


// ── CVPS parameterised URL builders (kept separate to avoid const type conflicts) ──
export const CVPS_URLS = {
  createRequest :  (requestNo: number) => `${environment.cvpsBaseUrl}/create`,
  
};