import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error) => {
      let msg = 'Unknown error';
      if (error.status === 0)   msg = 'Cannot reach server. Check network or backend IP.';
      if (error.status === 401) msg = 'Unauthorized (401). Check API key.';
      if (error.status === 403) msg = 'Forbidden (403). Access denied.';
      if (error.status === 404) msg = 'API endpoint not found (404).';
      if (error.status === 500) msg = 'Server error (500). Contact backend team.';

      console.error(`[VPMS HTTP Error] ${error.status} — ${msg}`);

      // ✅ CRITICAL FIX: Re-throw the ORIGINAL HttpErrorResponse, not a new Error()
      // Throwing `new Error(msg)` destroys err.status and err.error in downstream catchError()
      return throwError(() => error);
    })
  );
};