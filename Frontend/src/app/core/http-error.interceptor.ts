import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error) => {
      let msg = 'Unknown error';
      if (error.status === 0)   msg = 'Cannot reach server. Check network.';
      if (error.status === 404) msg = 'API endpoint not found (404).';
      if (error.status === 500) msg = 'Server error (500). Contact backend team.';
      console.error(`[VPMS HTTP Error] ${error.status} — ${msg}`);
      return throwError(() => new Error(msg));
    })
  );
};