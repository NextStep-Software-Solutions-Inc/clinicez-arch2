import { createRouter } from '@tanstack/react-router';
import { Route as rootRoute } from './routes/__root';
import { Route as authRoute } from './routes/_auth';
import { Route as indexRoute } from './routes/index';
import { Route as tenantsIndexRoute } from './routes/tenants/index';
import { Route as tenantsSlugRoute } from './routes/tenants/$slug';
import { Route as plansRoute } from './routes/plans';
import { Route as leadsRoute } from './routes/leads';
import { Route as blogRoute } from './routes/blog';
import { Route as subscribersRoute } from './routes/subscribers';
import { Route as rolesRoute } from './routes/roles';
import { Route as usersRoute } from './routes/users';
import { Route as settingsRoute } from './routes/settings';
import { Route as signInRoute } from './routes/sign-in';
import { Route as signUpRoute } from './routes/sign-up';
import { Route as syncAuthRoute } from './routes/sync-auth';
import { Route as invitationsTokenRoute } from './routes/invitations/$token';
import { Route as resetPasswordTokenRoute } from './routes/reset-password/$token';

export const routeTree = rootRoute.addChildren([
  authRoute.addChildren([
    indexRoute,
    tenantsIndexRoute,
    tenantsSlugRoute,
    plansRoute,
    leadsRoute,
    blogRoute,
    subscribersRoute,
    rolesRoute,
    usersRoute,
    settingsRoute,
  ]),
  signInRoute,
  signUpRoute,
  syncAuthRoute,
  invitationsTokenRoute,
  resetPasswordTokenRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
