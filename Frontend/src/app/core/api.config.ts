
import { environment } from '../../environments/environment';

export const API_CONFIG = {
  BASE_URL         : environment.apiBaseUrl,
  API_KEY          : environment.apiKey,

  // ── AUTH ──────────────────────────────────────────
  AUTHORITY_BY_EMP : `${environment.apiBaseUrl}/api/authority`,
  EMPLOYEE_REPORT  : `${environment.apiBaseUrl}/api/reports/employee-department`,

  // ── VEHICLES ──────────────────────────────────────
  VEHICLES         : `${environment.apiBaseUrl}/api/vehicles/list`,
  VEHICLES_REGISTER: `${environment.apiBaseUrl}/api/vehicles/register`,
  VEHICLES_UPDATE  : `${environment.apiBaseUrl}/api/vehicles/update`,
  VEHICLES_DELETE  : `${environment.apiBaseUrl}/api/vehicles/delete`,

  // ── PASSES ────────────────────────────────────────
  PASSES           : `${environment.apiBaseUrl}/api/passes/list`,
  PASSES_ISSUE     : `${environment.apiBaseUrl}/api/passes/issue`,
  PASSES_UPDATE    : `${environment.apiBaseUrl}/api/passes/update`,

  // ── DOCUMENTS ─────────────────────────────────────
  DOCUMENTS        : `${environment.apiBaseUrl}/api/documents/list`,
  DOCUMENTS_UPLOAD : `${environment.apiBaseUrl}/api/documents/upload`,
  DOCUMENTS_UPDATE : `${environment.apiBaseUrl}/api/documents/update`,
  DOCUMENTS_DOWNLOAD:`${environment.apiBaseUrl}/api/documents/download`,

  // ── GATE / COMPLIANCE ─────────────────────────────
  GATE_LOGS        : `${environment.apiBaseUrl}/api/gate-logs/list`,
  COMPLIANCE       : `${environment.apiBaseUrl}/api/compliance/list`,

  // ── HISTORY / AUDIT ───────────────────────────────
  HISTORY_LIST     : `${environment.apiBaseUrl}/api/history/list`,
  HISTORY_LOG      : `${environment.apiBaseUrl}/api/history/log`,
  HISTORY          : `${environment.apiBaseUrl}/api/history/list`,

  // ── AUTHORITY ─────────────────────────────────────
  AUTHORITY        : `${environment.apiBaseUrl}/api/authority/list`,
  AUTHORITY_GRANT  : `${environment.apiBaseUrl}/api/authority/grant`,

  // ════════════════════════════════════════════════════════════════════
  // CVPS — Contractor Vehicle Permission System  (port 8086)
  // Static base strings + function keys for parameterised endpoints
  // ════════════════════════════════════════════════════════════════════
  CVPS_BASE            : `${environment.cvpsBaseUrl}/api/requests`,
  CVPS_CREATE_REQUEST  : `${environment.cvpsBaseUrl}/api/requests/create`,
  CVPS_UPDATE_REQUEST  :  `${environment.cvpsBaseUrl}/api/requests/update`,
  CVPS_GET_REQUEST_BY_ID: `${environment.cvpsBaseUrl}/api/requests`,
  CVPS_GET_ALL_REQUESTS: `${environment.cvpsBaseUrl}/api/requests`,
  CVPS_DELETE_REQUEST: `${environment.cvpsBaseUrl}/api/requests`,
  
  
} as const;


// ── CVPS parameterised URL builders (kept separate to avoid const type conflicts) ──
export const CVPS_URLS = {
  createRequest :  (requestNo: number) => `${environment.cvpsBaseUrl}/create`,
  // workflowApprove : (requestNo: number) => `${API_CONFIG.CVPS_BASE}/approve/${requestNo}`,
  // workflowReject  : (requestNo: number) => `${API_CONFIG.CVPS_BASE}/reject/${requestNo}`,
  // workflowHold    : (requestNo: number) => `${API_CONFIG.CVPS_BASE}/hold/${requestNo}`
  // workflowConfirm : (requestNo: number) => `${API_CONFIG.CVPS_BASE}/confirm/${requestNo}`,
};