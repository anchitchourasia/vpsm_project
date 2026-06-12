import { environment } from '../../environments/environment';

export const API_CONFIG = {
  BASE_URL         : environment.apiBaseUrl,
  API_KEY          : environment.apiKey,

  VEHICLES         : `${environment.apiBaseUrl}/api/vehicles/list`,
  VEHICLES_REGISTER: `${environment.apiBaseUrl}/api/vehicles/register`,
  VEHICLES_UPDATE  : `${environment.apiBaseUrl}/api/vehicles/update`,
  VEHICLES_DELETE  : `${environment.apiBaseUrl}/api/vehicles/delete`,

  PASSES           : `${environment.apiBaseUrl}/api/passes/list`,
  PASSES_ISSUE     : `${environment.apiBaseUrl}/api/passes/issue`,
  PASSES_UPDATE    : `${environment.apiBaseUrl}/api/passes/update`,

  DOCUMENTS        : `${environment.apiBaseUrl}/api/documents/list`,
  DOCUMENTS_UPLOAD : `${environment.apiBaseUrl}/api/documents/upload`,
  DOCUMENTS_UPDATE : `${environment.apiBaseUrl}/api/documents/update`,
  DOCUMENTS_DOWNLOAD: `${environment.apiBaseUrl}/api/documents/download`,

  GATE_LOGS        : `${environment.apiBaseUrl}/api/gate-logs/list`,
  COMPLIANCE       : `${environment.apiBaseUrl}/api/compliance/list`,

  // ── HISTORY / AUDIT LOG ──
  HISTORY_LIST     : `${environment.apiBaseUrl}/api/history/list`,   // GET
  HISTORY_LOG      : `${environment.apiBaseUrl}/api/history/log`,    // POST
  HISTORY          : `${environment.apiBaseUrl}/api/history/list`,
  AUTHORITY        : `${environment.apiBaseUrl}/api/authority/list`,
  AUTHORITY_GRANT  : `${environment.apiBaseUrl}/api/authority/grant`,  // POST
};