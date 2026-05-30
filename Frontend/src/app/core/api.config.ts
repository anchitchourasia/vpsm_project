import { environment } from '../../environments/environment';

export const API_CONFIG = {
  BASE_URL        : environment.apiBaseUrl,
  API_KEY         : environment.apiKey,
  VEHICLES        : `${environment.apiBaseUrl}/api/vehicles/list`,
  VEHICLES_REGISTER: `${environment.apiBaseUrl}/api/vehicles/register`,
  VEHICLES_UPDATE : `${environment.apiBaseUrl}/api/vehicles/update`,
  VEHICLES_DELETE : `${environment.apiBaseUrl}/api/vehicles/delete`,
  PASSES          : `${environment.apiBaseUrl}/api/passes/list`,
  GATE_LOGS       : `${environment.apiBaseUrl}/api/gate-logs/list`,
  COMPLIANCE      : `${environment.apiBaseUrl}/api/compliance/list`,
};