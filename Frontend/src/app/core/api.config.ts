// import { environment } from '../../environments/environment';

// export const API_CONFIG = {
//   BASE_URL         : environment.apiBaseUrl,
//   API_KEY          : environment.apiKey,

//   // ── AUTH ──────────────────────────────────────────
//   // Authority login: /api/authority/{empCode} → 200 if found, 404 if not
//   AUTHORITY_BY_EMP : `${environment.apiBaseUrl}/api/authority`,
//   // Employee fallback: /api/reports/employee-department
//   EMPLOYEE_REPORT  : `${environment.apiBaseUrl}/api/reports/employee-department`,

//   // ── VEHICLES ──────────────────────────────────────
//   VEHICLES         : `${environment.apiBaseUrl}/api/vehicles/list`,
//   VEHICLES_REGISTER: `${environment.apiBaseUrl}/api/vehicles/register`,
//   VEHICLES_UPDATE  : `${environment.apiBaseUrl}/api/vehicles/update`,
//   VEHICLES_DELETE  : `${environment.apiBaseUrl}/api/vehicles/delete`,

//   // ── PASSES ────────────────────────────────────────
//   PASSES           : `${environment.apiBaseUrl}/api/passes/list`,
//   PASSES_ISSUE     : `${environment.apiBaseUrl}/api/passes/issue`,
//   PASSES_UPDATE    : `${environment.apiBaseUrl}/api/passes/update`,

//   // ── DOCUMENTS ─────────────────────────────────────
//   DOCUMENTS        : `${environment.apiBaseUrl}/api/documents/list`,
//   DOCUMENTS_UPLOAD : `${environment.apiBaseUrl}/api/documents/upload`,
//   DOCUMENTS_UPDATE : `${environment.apiBaseUrl}/api/documents/update`,
//   DOCUMENTS_DOWNLOAD:`${environment.apiBaseUrl}/api/documents/download`,

//   // ── GATE / COMPLIANCE ─────────────────────────────
//   GATE_LOGS        : `${environment.apiBaseUrl}/api/gate-logs/list`,
//   COMPLIANCE       : `${environment.apiBaseUrl}/api/compliance/list`,

//   // ── HISTORY / AUDIT ───────────────────────────────
//   HISTORY_LIST     : `${environment.apiBaseUrl}/api/history/list`,
//   HISTORY_LOG      : `${environment.apiBaseUrl}/api/history/log`,
//   HISTORY          : `${environment.apiBaseUrl}/api/history/list`,

//   // ── AUTHORITY ─────────────────────────────────────
//   AUTHORITY        : `${environment.apiBaseUrl}/api/authority/list`,
//   AUTHORITY_GRANT  : `${environment.apiBaseUrl}/api/authority/grant`,

//   // paste at the bottom of the existing api.config.ts, inside the object

//   // ── CVPS — CONTRACTOR VEHICLE PERMISSION SYSTEM ────────────────
//   CVPS_BASE              : `${environment.cvpsBaseUrl}/api/v1/permissions`,
//   CVPS_SUBMIT            : `${environment.cvpsBaseUrl}/api/v1/permissions`,
//   CVPS_UPLOAD_DOCS       : (requestNo: number) => `${environment.cvpsBaseUrl}/api/v1/permissions/${requestNo}/upload-all-documents`,
//   CVPS_ADD_PERSONNEL     : (requestNo: number) => `${environment.cvpsBaseUrl}/api/v1/permissions/${requestNo}/add-personnel`,
//   CVPS_WORKFLOW_ACTION   : (requestNo: number) => `${environment.cvpsBaseUrl}/api/v1/permissions/${requestNo}/workflow-action`,
//   CVPS_REPLACE_DOC       : (requestNo: number) => `${environment.cvpsBaseUrl}/api/v1/permissions/${requestNo}/replace-document`,
//   CVPS_MODIFY            : (requestNo: number) => `${environment.cvpsBaseUrl}/api/v1/permissions/${requestNo}/modify`,
//   CVPS_GET_BY_VEHICLE    : (vehicleNo: string) => `${environment.cvpsBaseUrl}/api/v1/permissions/${vehicleNo}`,
//   CVPS_FILTER_STATUS     : (status: string)   => `${environment.cvpsBaseUrl}/api/v1/permissions/summary/filter?status=${status}`,
//   CVPS_VALIDATE_GATE     : (vehicleNo: string) => `${environment.cvpsBaseUrl}/api/v1/permissions/summary/validate-gate/${vehicleNo}`,
//   CVPS_DOWNLOAD_DOC      : (documentId: number)=> `${environment.cvpsBaseUrl}/api/v1/permissions/documents/${documentId}/download`,
//   CVPS_DOWNLOAD_EXCEL    : `${environment.cvpsBaseUrl}/api/v1/permissions/summary/download-excel`,
//   CVPS_GET_ALL           : `${environment.cvpsBaseUrl}/api/v1/permissions`,
// };

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
  CVPS_BASE            : `${environment.cvpsBaseUrl}/api/v1/permissions`,
  CVPS_GET_ALL         : `${environment.cvpsBaseUrl}/api/v1/permissions`,
  CVPS_FILTER          : `${environment.cvpsBaseUrl}/api/v1/permissions/summary/filter`,
  CVPS_VALIDATE_GATE   : `${environment.cvpsBaseUrl}/api/v1/permissions/summary/validate-gate`,
  CVPS_DOWNLOAD_DOC    : `${environment.cvpsBaseUrl}/api/v1/permissions/documents`,
  CVPS_DOWNLOAD_EXCEL  : `${environment.cvpsBaseUrl}/api/v1/permissions/summary/download-excel`,
} as const;

// ── CVPS parameterised URL builders (kept separate to avoid const type conflicts) ──
export const CVPS_URLS = {
  uploadDocs     : (requestNo: number) => `${environment.cvpsBaseUrl}/api/v1/permissions/${requestNo}/upload-all-documents`,
  addPersonnel   : (requestNo: number) => `${environment.cvpsBaseUrl}/api/v1/permissions/${requestNo}/add-personnel`,
  workflowAction : (requestNo: number) => `${environment.cvpsBaseUrl}/api/v1/permissions/${requestNo}/workflow-action`,
  replaceDoc     : (requestNo: number) => `${environment.cvpsBaseUrl}/api/v1/permissions/${requestNo}/replace-document`,
  modify         : (requestNo: number) => `${environment.cvpsBaseUrl}/api/v1/permissions/${requestNo}/modify`,
  getByVehicle   : (vehicleNo : string) => `${environment.cvpsBaseUrl}/api/v1/permissions/${vehicleNo}`,
  validateGate   : (vehicleNo : string) => `${environment.cvpsBaseUrl}/api/v1/permissions/summary/validate-gate/${vehicleNo}`,
  downloadDoc    : (documentId: number) => `${environment.cvpsBaseUrl}/api/v1/permissions/documents/${documentId}/download`,
};