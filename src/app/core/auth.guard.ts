// Frontend/src/app/core/auth.guard.ts
import { inject }                    from '@angular/core';
import { CanActivateFn, Router }     from '@angular/router';
import { AuthService }               from './auth.service';
import { toObservable }              from '@angular/core/rxjs-interop';
import { filter, map, take }         from 'rxjs/operators';

// Interview Term: "Async Route Guard"
// Guard returns an Observable<boolean|UrlTree> instead of plain boolean
// Angular waits for the Observable to EMIT before allowing/blocking navigation
// This solves the race condition: API call finishes THEN guard decides
export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  // Interview Term: "toObservable(signal)" — converts Angular signal to RxJS Observable
  // filter(ready => ready) — waits until sessionReady becomes TRUE
  // take(1)               — takes only 1 emission then auto-unsubscribes
  // map(...)              — after ready, check if logged in
  return toObservable(auth.sessionReady).pipe(
    filter(ready => ready === true),   // wait for API resolve
    take(1),
    map(() => {
      if (auth.isLoggedIn()) return true;
      return router.createUrlTree(['/login']);
    })
  );
};