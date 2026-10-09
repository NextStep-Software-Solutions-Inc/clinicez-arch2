# Deployment configuration (domains, subdomains, shared infrastructure)

No company domain, service subdomain or shared-infrastructure hostname is hardcoded.
Everything below is supplied by **GitHub Actions secrets / variables** (APIs) or **Vercel environment variables** (UIs).
Use neutral values such as `example.com` in docs and tests.

> [!TIP]
> All API URL variables (`EXPO_PUBLIC_*_API_URL`, `NEXT_PUBLIC_*_API_URL`, `SERVICES_*_API_URL`, `PORTAL_API_BASE_URL`) can be configured either with or without the `/api/v1` path suffix (e.g. `https://clinic-api.example.com` or `https://clinic-api.example.com/api/v1`). The clients and services automatically normalize paths to prevent `/api/v1/api/v1` duplication.

## 1. GitHub Actions (APIs)

Set each value as a repository / environment **secret or variable** (Settings → Secrets and variables → Actions).
`secrets.X` wins over `vars.X`. Deploys fail fast when `BASE_DOMAIN` is missing.

| Name | Required | Used by | Purpose |
|---|---|---|---|
| `BASE_DOMAIN` | yes | all APIs | Root domain of facility consoles (`<facility>.<service>.<BASE_DOMAIN>`). Drives CORS, Clerk authorized parties, console URLs, document verification links. |
| `CORS_ALLOWED_DOMAINS` | no | all APIs | Extra trusted domains (and their subdomains), comma separated. |
| `CORS_ALLOWED_ORIGINS` | no | all APIs | Extra exact origins (`*` wildcards allowed), comma separated. |
| `CLERK_AUTHORIZED_PARTIES` | no | portal-api | Extra Clerk `azp` origins. `https://<BASE_DOMAIN>`, `https://*.<BASE_DOMAIN>` and the CORS domains are added automatically. |
| `SERVICES_PORTAL_API_URL` | no | clinic-api | Portal API base URL. Defaults to `http://portal-api:8080` (internal Docker DNS). |
| `PORTAL_API_BASE_URL` | no | philhealth-proxy | Same, for the PhilHealth proxy. |
| `SERVICES_CLINIC_API_URL` | no | patient-api | Clinic API base URL. |
| `MESSAGING_HUB_URL` | yes | all APIs | Base URL of the Interop Hub (`Messaging__HubUrl`). Variable or secret. |
| `CLINIC_` / `LABORATORY_` / `PHARMACY_` / `ORGANIZATION_` / `PATIENT_` / `PORTAL_` / `BILLING_` + `MESSAGING_CLIENT_ID` / `MESSAGING_CLIENT_SECRET` | yes | matching API | Per-service hub credentials (`Messaging__ClientId` / `Messaging__ClientSecret`), e.g. `CLINIC_MESSAGING_CLIENT_SECRET`. Must match a client in the hub bootstrap. |
| `DATA_NETWORK` / `NPM_NETWORK` | no | all APIs | Names of the external Docker networks (defaults `data-network` / `npm-default`). |
| `INTEROP_HUB_DB_CONNECTION_STRING` / `INTEROP_HUB_PORTAL_CLIENT_SECRET` | yes | interop-hub | Hub database and the portal's bootstrap client secret. |
| `INTEROP_HUB_PAYLOAD_ENCRYPTION_KEY` | no | interop-hub | Base64 of 32 random bytes; encrypts stored envelopes at rest (AES-256-GCM). Empty stores plain JSON. |
| `BILLING_DB_CONNECTION_STRING` / `BILLING_JWT_SIGNING_KEY` / `INTERNAL_API_KEY` | yes | billing-api | Database connection string, local JWT signing key (`Jwt__SigningKey`) and internal API key (`Internal__ApiKey`) of the per-cell billing service. Hub credentials use `BILLING_MESSAGING_CLIENT_ID` / `BILLING_MESSAGING_CLIENT_SECRET`. Secrets. |
| `PATIENT_SHARING_SIGNING_KEY` | yes | patient-api | Signs the share tokens patients give to facilities (`Sharing__SigningKey`, at least 32 characters, the service refuses to start without it). Secret; the deploy fails when it is shorter. |
| `CLINIC_PUBLIC_UPLOAD_BASE_URL` | yes | clinic-api | Public URL where labs upload results for a requisition (`Clinic__PublicUploadBaseUrl`). Variable or secret. |
| `HUB_PUBLIC_URL` | yes | portal-api | Public base URL of the cloud hub, handed to on-premise sites with their credentials (`Hub__PublicUrl`). Variable or secret. |
| `SMTP_HOST` / `SMTP_FROM_EMAIL` | yes | portal-api | Outgoing mail server and sender address (`Smtp__Host` / `Smtp__FromEmail`); the portal refuses to start without them. Variable or secret. |
| `SMTP_PORT` / `SMTP_SECURITY` / `SMTP_FROM_NAME` | no | portal-api | Defaults `587` / `Auto` (`Auto`, `None`, `StartTls`, `SslOnConnect`) / `Clinic EZ`. Variables. |
| `SMTP_USER` / `SMTP_PASSWORD` | no | portal-api | Mail server credentials (secrets). Empty user means no authentication. |
| `NOTIFICATIONS_CONTACT_INBOX` | no | portal-api | Recipient of the public contact form (`Notifications__ContactInbox`). Empty disables it. |
| `FRONTEND_BASE_URL` | no | portal-api | Web portal base URL, used for billing redirects when a request carries no `Origin` / `Referer` (`FrontendBaseUrl`). Variable. |
| `FACILITY_SUBDOMAIN_CLINIC` / `_LABORATORY` / `_PHARMACY` / `_ORGANIZATION` | no | portal-api, patient-api | Service subdomain per facility type (defaults `clinic`, `lab`, `pharmacy`, `org`). |
| `VERIFICATION_BASE_URL` | no | clinic-api, laboratory-api | Public URL embedded in QR codes. Defaults to `https://<BASE_DOMAIN>`. |

### Container & image names

Containers, images and compose projects are named after the service only (`portal-api`, `clinic-api`, ...).
Shared infrastructure such as PostgreSQL and the Interop Hub is **not** prefixed with a product name (`postgres`,
`interop-hub`). Reverse-proxy hosts (Nginx Proxy Manager) must forward to the unprefixed names,
e.g. `portal-api:8080`.

## 2. Vercel (UIs)

`EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` values are inlined at build time. Redeploy after changing them.

### `apps/clinic-app`

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_CLINIC_API_URL` | Exact Clinic API URL (highest priority). |
| `EXPO_PUBLIC_BASE_DOMAIN` | Derive `https://{service}-api.<base domain>` when the exact URL is not set. |
| `EXPO_PUBLIC_API_URL_TEMPLATE` | Custom URL shape with `{service}`, `{baseDomain}`, `{facility}`. |
| `EXPO_PUBLIC_SERVICE_SUBDOMAIN` | Subdomain this app is served from (default `clinic`). |
| `EXPO_PUBLIC_SERVICE_SUBDOMAINS` | All service subdomains recognised (default `clinic,lab,pharmacy,org`). |
| `EXPO_PUBLIC_PORTAL_URL` | Root portal URL for "open portal" links. |
| `EXPO_PUBLIC_STORAGE_PUBLIC_URL` | Public base URL of document storage. |

Without `EXPO_PUBLIC_CLINIC_API_URL`/`EXPO_PUBLIC_BASE_DOMAIN`, the API URL is inferred from the page host
`<facility>.<service>.<baseDomain>` → `https://<service>-api.<baseDomain>`.

### `apps/portal-web`

`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLINIC_API_URL`, `NEXT_PUBLIC_BASE_DOMAIN`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_SERVICE_SUBDOMAINS`, `NEXT_PUBLIC_SUBDOMAIN_{CLINIC,LABORATORY,PHARMACY,ORGANIZATION}`,
`NEXT_PUBLIC_{CONTACT,SALES,BILLING,SUPPORT}_EMAIL`, `NEXT_PUBLIC_STORAGE_PUBLIC_URL`. See `apps/portal-web/.env.example`.

### `apps/patient-app`

`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLINIC_API_URL`, `EXPO_PUBLIC_PORTAL_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL`.
See `apps/patient-app/.env.example`.
