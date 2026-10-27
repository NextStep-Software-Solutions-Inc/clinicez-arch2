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
| `CORS_ALLOWED_DOMAINS` | no | clinic, laboratory, pharmacy, organization, billing, portal | Extra trusted domains (and their subdomains), comma separated (`Cors__AllowedDomains`). |
| `CORS_ALLOWED_ORIGINS` | no | same as above | Extra exact origins (`*` wildcards allowed), comma separated (`Cors__AllowedOrigins`). Outside Development these APIs no longer allow every origin: only `https://<BASE_DOMAIN>` (and subdomains), the CORS domains and these origins pass, so `BASE_DOMAIN` (required) or this list must be set. patient-api still allows any origin in its code (not configurable here). |
| `CLERK_AUTHORIZED_PARTIES` | no | portal-api | Extra Clerk `azp` origins. `https://<BASE_DOMAIN>`, `https://*.<BASE_DOMAIN>` and the CORS domains are added automatically. |
| `PORTAL_API_BASE_URL` | yes | philhealth-proxy | Portal API base URL the PhilHealth proxy reads tenant credentials from (`PortalApi__BaseUrl`). Required, no localhost fallback. Variable or secret. |
| `HUB_URL` | yes | all APIs | Base URL of the Interop Hub (`Messaging__HubUrl`). Variable or secret. |
| `CLINIC_` / `LABORATORY_` / `PHARMACY_` / `ORGANIZATION_` / `PATIENT_` / `PORTAL_` / `BILLING_` + `HUB_CLIENT_ID` / `HUB_CLIENT_SECRET` | yes | matching API | Per-service hub credentials (`Messaging__ClientId` / `Messaging__ClientSecret`), e.g. `CLINIC_HUB_CLIENT_SECRET`. Must match a client in the hub bootstrap. |
| `DATA_NETWORK` / `NPM_NETWORK` | no | all APIs | Names of the external Docker networks (defaults `data-network` / `npm-default`). |
| `INTEROP_HUB_DB_CONNECTION_STRING` / `INTEROP_HUB_PORTAL_CLIENT_SECRET` | yes | interop-hub | Hub database and the portal's bootstrap client secret. |
| `INTEROP_HUB_PAYLOAD_ENCRYPTION_KEY` | recommended | interop-hub | Base64 of 32 random bytes; encrypts stored envelopes at rest (AES-256-GCM). Empty stores plain JSON; generate with `scripts/generate-secrets`. Secret. |
| `BILLING_DB_CONNECTION_STRING` / `BILLING_JWT_SIGNING_KEY` | yes | billing-api | Database connection string and local JWT signing key (`Jwt__SigningKey`, at least 32 characters) of the per-cell billing service. Hub credentials use `BILLING_HUB_CLIENT_ID` / `BILLING_HUB_CLIENT_SECRET`. Secrets. |
| `PATIENT_SHARING_SIGNING_KEY` (the plain name `SHARING_SIGNING_KEY` is also accepted) | yes | patient-api | Signs the share tokens patients give to facilities. Compose variable and config key: `SHARING_SIGNING_KEY` -> `Sharing__SigningKey`; at least 32 characters, the service refuses to start without it. Secret; the deploy fails when it is shorter. |
| `PATIENT_ENCRYPTION_KEY` | yes | patient-api | Base64 of 32 random bytes for payload encryption (`Encryption__Base64Key`). Must decode to exactly 32 bytes (the deploy checks this; `openssl rand -base64 32` or `scripts/generate-secrets`). Required for any non-Development deployment (the compose file and the deploy fail without it); ignored in Development. Never change it once data exists. Secret. |
| `PORTAL_BASE_URL` | yes | clinic-api | Public base URL of the portal web app; lab orders link to `{PORTAL_BASE_URL}/upload/lab/{token}` (`Clinic__PortalBaseUrl`). Variable or secret. |
| `HUB_PUBLIC_URL` | yes | portal-api | Public base URL of the cloud hub, handed to on-premise sites with their credentials (`Hub__PublicUrl`). Variable or secret. |
| `SMTP_USER` / `SMTP_PASSWORD` | no | portal-api | Mail server credentials (secrets, e.g. Resend API key). Non-secret mail configuration (Host, Port, Security, FromEmail, FromName, ReplyTo, ContactInbox) is managed dynamically in Platform Settings (`/admin/settings`). |
| `FRONTEND_BASE_URL` | no | portal-api | Web portal base URL, used for billing redirects when a request carries no `Origin` / `Referer` (`FrontendBaseUrl`). Variable. |
| `CLERK_AUTHORITY` | yes | portal-api | Clerk issuer URL tokens are validated against (`Clerk__Authority`). Variable or secret `PORTAL_CLERK_AUTHORITY`; the dev workflow falls back to the Clerk development instance. |
| `PATIENT_CLERK_AUTHORITY` / `PATIENT_CLERK_AUDIENCE` | authority: yes | patient-api | Clerk issuer and audience patient tokens are validated against (`Clerk__Authority` / `Clerk__Audience`). The authority has no built-in default: the compose file and the deploy fail without it. Secret or variable. |
| `HUB_CLOUD_CELL_ID` | no | portal-api | Cell hosting every shared-cloud facility (`Hub__CloudCellId`, default `cloud`). Must equal the cloud hub's `Hub__CloudCellId`. Variable. |
| `SERVICES_PATIENT_API_URL` | no | portal-api | Patient API the portal calls with the internal key (`Services__PatientApiUrl`, default `http://patient-api:8080`). Variable. |
| `WORKSPACE_MAX_OWNED_PER_USER` | no | portal-api | Workspaces one user may own (`Workspace__MaxOwnedPerUser`, default `1`). Variable. |
| `LAB_UPLOAD_MAX_FILE_BYTES` / `LAB_UPLOAD_RATE_LIMIT_PERMITS` / `LAB_UPLOAD_RATE_LIMIT_WINDOW_MINUTES` | no | portal-api | Limits of the public lab-result upload relay (`LabUploads__MaxFileBytes` / `__RateLimitPermits` / `__RateLimitWindowMinutes`; defaults `5242880` / `20` / `10`). The allowed content types stay at the code default (PDF, JPEG, PNG). Variables. |
| `LICENSING_TTL_DAYS` / `LICENSING_GRACE_DAYS` / `LICENSING_RENEW_BEFORE_DAYS` | no | portal-api | Facility license lifetime (clamped to 30-90), read-only grace after expiry, renewal lead time (`Licensing__*`; defaults `30` / `14` / `10`). Variables. |
| `BILLING_DEFAULT_PLAN_SLUG` / `BILLING_TRIAL_DAYS` | no | portal-api | Plan a new workspace starts on and its trial length (`Billing__DefaultPlanSlug` / `__TrialDays`; defaults `starter` / `14`). The plan catalog itself (limits, features, prices) lives in the portal's `appsettings.json`. Variables. |
| `CLINIC_ENCRYPTION_MASTER_SECRET` | yes | clinic-api | Wraps the per-file keys of stored clinical records (`ClinicEncryption__MasterSecret`). Required, at least 32 characters, there is no built-in fallback any more. Changing it makes files written under the old secret unreadable unless the old value is kept in `CLINIC_ENCRYPTION_PREVIOUS_MASTER_SECRET_0` / `_1` (see Rotation); keep it with the backups. Secret. |
| `CLINIC_R2_BUCKET_NAME` / `_ACCOUNT_ID` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | yes (if cloud) | clinic-api | Cloudflare R2 bucket credentials for encrypted clinical attachments. Falls back to shared `R2_*` values. |
| `S3_SERVICE_URL` / `S3_BUCKET_NAME` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | no | clinic-api | Generic S3 adapter settings for on-premise subscribers hosting their own storage server (MinIO, Ceph, Wasabi). |
| `PHILHEALTH_PROXY_URL` | no | clinic-api | Base URL of the PhilHealth proxy (`PhilHealthProxy__BaseUrl`, default `http://philhealth-proxy:8080`). Variable. |
| `FACILITY_SUBDOMAIN_CLINIC` / `_LABORATORY` / `_PHARMACY` / `_ORGANIZATION` | no | portal-api, patient-api | Service subdomain per facility type (defaults `clinic`, `lab`, `pharmacy`, `org`). |
| `VERIFICATION_BASE_URL` | no | clinic-api, laboratory-api | Public URL embedded in QR codes. Defaults to `https://<BASE_DOMAIN>`. |

### Secrets, keys and signing

Everything in this section is **required outside Development** (the compose files refuse to start, and the deploy workflows
fail before copying anything, when a required value is missing) unless marked *optional*. No secret has a default value in a
file. Random values and key pairs come from the scripts in `scripts/`:

| Script (`.sh` Linux/macOS/WSL, `.ps1` Windows PowerShell 5.1+) | What it prints |
|---|---|
| `generate-license-keys` | ECDSA P-256 key pair of the facility license authority: `FACILITY_LICENSE_PRIVATE_KEY` (portal only) and `FACILITY_LICENSE_PUBLIC_KEY` (everything else), as one-line base64 of the PEM. |
| `generate-signing-key` | ECDSA P-256 key pair of one hub client: `SIGNING_KEY` (private, goes to that service) and `PUBLIC_KEY` (registered at the hub). Run it once per service. |
| `generate-secrets` | Random `NAME=value` lines for every plain shared secret in the tables below (`--list` / `-List` shows the names). Optional name filter, e.g. `generate-secrets.sh 'CLINIC_*'`. |

All three print to the terminal only (the key scripts can also write files with `--out-dir` / `-Out`, mode 600 / current-user ACL).
Copy each value into Settings → Secrets and variables → Actions and clear the terminal; do not commit them. A key accepted as
a **PEM** (multi-line GitHub secret) or as **base64 of a PEM** is turned into one-line base64 by the workflows
(`scripts/ci/prepare-key-env.sh`), and a value that is not an ECDSA P-256 key fails the deploy with an `::error::` line.

| GitHub name | Config key (compose variable) | Needed by | Notes |
|---|---|---|---|
| `FACILITY_LICENSE_PRIVATE_KEY` (secret) | `FacilityLicense__PrivateKeyPem` (`FACILITY_LICENSE_PRIVATE_KEY`) | portal-api | Signs facility licenses. Only the portal holds it. |
| `FACILITY_LICENSE_PUBLIC_KEY` (variable or secret) | `FacilityLicense__PublicKeyPem` | portal-api, clinic-api, laboratory-api, pharmacy-api, organization-api, edge bundle | Must be the public half of the private key above. Hand the same value to every on-premise site (installer `--license-public-key`). |
| `FACILITY_LICENSE_PUBLIC_KEY_PREVIOUS` | `FacilityLicense__PreviousPublicKeyPem` | same | *Optional.* Only during a license-key rotation. |
| `<SVC>_HUB_SIGNING_KEY` (`CLINIC_`, `LABORATORY_`, `PHARMACY_`, `ORGANIZATION_`, `PATIENT_`, `PORTAL_`, `BILLING_`) | `Messaging__SigningKey` (`HUB_SIGNING_KEY`) | matching API | P-256 **private** key that signs this client's hub envelopes. Its public half must be registered at the hub for this client id. |
| `PORTAL_HUB_SIGNING_PUBLIC_KEY` (variable or secret) | `Hub__Bootstrap__Clients__0__PublicKey` (`PORTAL_HUB_SIGNING_PUBLIC_KEY`) | interop-hub | The **public** half of `PORTAL_HUB_SIGNING_KEY`. The cloud hub bootstraps only the portal client; register every other client's public key through the hub admin API (clients are created there with their id, secret and public key). |
| `HUB_SIGNING_REQUIRED` (variable) | `Hub__Signing__Required` | interop-hub | Default `true`: unsigned or wrongly signed envelopes are rejected. Leave it unset. |
| `CLINIC_DOCUMENT_SIGNING_KEY` / `LABORATORY_DOCUMENT_SIGNING_KEY` | `Documents__SigningKey` (`DOCUMENT_SIGNING_KEY`) | clinic-api / laboratory-api | HMAC key of the document digests behind verification QR codes. At least 32 characters; changing it stops previously printed QR codes from verifying. |
| `PHARMACY_GAMOT_UPSC_SECRET_KEY` | `Gamot__UpscSecretKey` (`GAMOT_UPSC_SECRET_KEY`) | pharmacy-api | Key behind the GAMOT UPSC codes. At least 32 characters; changing it invalidates codes issued under the old one. |
| `CLINIC_ENCRYPTION_MASTER_SECRET` | `ClinicEncryption__MasterSecret` | clinic-api | At least 32 characters. See the table above and Rotation. |
| `CLINIC_ENCRYPTION_PREVIOUS_MASTER_SECRET_0` / `_1` | `ClinicEncryption__PreviousMasterSecrets__0` / `__1` | clinic-api | *Optional.* Older master secrets that stay readable. |
| `CLINICAPP_HANGFIRE_PASSWORD` / `CLINIC_HANGFIRE_PASSWORD` / `HANGFIRE_PASSWORD` | `Hangfire__DashboardPassword` | clinic-api (required); other APIs (optional, empty = dashboard denied) | Basic-auth password of the Hangfire dashboard. The first name that is set wins (each API has its own prefixes, see its workflow). |
| `CLINIC_JWT_SIGNING_KEY` / `LAB_JWT_SIGNING_KEY` / `PHARMACY_JWT_SIGNING_KEY` / `BILLING_JWT_SIGNING_KEY` | `Jwt__SigningKey` | clinic-api / laboratory-api / pharmacy-api / billing-api | Signs the facility-local session tokens. At least 32 characters (base64 of 64 random bytes works). One key **per service**: every service has its own issuer/audience and does not accept another's tokens. Without it a key would be generated on the container's disk and sessions would not survive re-creation, so it is now required. |
| `PORTAL_DB_CONNECTION_STRING`, `PORTAL_CLERK_SECRET_KEY`, `PORTAL_XENDIT_SECRET_KEY`, `PORTAL_XENDIT_CALLBACK_TOKEN` | `ConnectionStrings__DefaultConnection`, `Clerk__SecretKey`, `Xendit__SecretKey`, `Xendit__CallbackToken` | portal-api | All four required (no development fallbacks). |
| `PORTAL_DATA_PROTECTION_CERT_BASE64` / `_PASSWORD`, `PHILHEALTH_DATA_PROTECTION_CERT_BASE64` / `_PASSWORD` | `DataProtection__CertificateBase64` / `__CertificatePassword` | portal-api, philhealth-proxy | *Optional.* Base64 of a `.pfx` that encrypts the ASP.NET Data Protection key ring at rest. For `portal-api`, key ring XMLs are stored directly in PostgreSQL via EF Core (`public.DataProtectionKeys`). |
| `CORS_ALLOWED_ORIGINS` / `CORS_ALLOWED_DOMAINS` | `Cors__AllowedOrigins` / `Cors__AllowedDomains` | see the table above | *Optional* when `BASE_DOMAIN` is set. |
| `MEDIATR_LICENSE_KEY` (secret or variable) | `MediatR__LicenseKey` (`MEDIATR_LICENSE_KEY`) | portal-api, clinic-api, laboratory-api, pharmacy-api, organization-api, philhealth-proxy, edge bundle | *Optional* (falls back to the bundled Lucky Penny Software license key in `MediatRLicense.DefaultKey`; set to override/rotate). |

#### GitHub secrets checklist (cloud deploy)

Generate the plain secrets with `scripts/generate-secrets` and the key pairs with `generate-license-keys` /
`generate-signing-key`; every row must exist before the first deploy of that service.

- [ ] Once: license pair (`FACILITY_LICENSE_PRIVATE_KEY` secret on the portal; `FACILITY_LICENSE_PUBLIC_KEY` for portal, clinic, laboratory, pharmacy, organization).
- [ ] Once per service (7): `<SVC>_HUB_SIGNING_KEY` (private) + register its public key at the hub; `PORTAL_HUB_SIGNING_PUBLIC_KEY` is the portal's public key.
- [ ] Hub: `INTEROP_HUB_DB_CONNECTION_STRING`, `INTEROP_HUB_PORTAL_CLIENT_SECRET`, `INTEROP_HUB_PAYLOAD_ENCRYPTION_KEY`, `PORTAL_HUB_SIGNING_PUBLIC_KEY`.
- [ ] Hub client secrets: `<SVC>_HUB_CLIENT_ID` / `<SVC>_HUB_CLIENT_SECRET` for the 7 services.
- [ ] portal-api: `PORTAL_DB_CONNECTION_STRING`, `PORTAL_CLERK_SECRET_KEY`, `PORTAL_XENDIT_SECRET_KEY`, `PORTAL_XENDIT_CALLBACK_TOKEN`, Hangfire password, `BASE_DOMAIN`.
- [ ] clinic-api: `CLINIC_DB_CONNECTION_STRING`, `CLINIC_ENCRYPTION_MASTER_SECRET`, `CLINIC_DOCUMENT_SIGNING_KEY`, `CLINIC_JWT_SIGNING_KEY`, `CLINICAPP_HANGFIRE_PASSWORD` (or `HANGFIRE_PASSWORD`), `CLINIC_R2_*` (or shared `R2_*` or on-premise `S3_*` / MinIO credentials).
- [ ] laboratory-api: `LABORATORY_DB_CONNECTION_STRING`, `LABORATORY_DOCUMENT_SIGNING_KEY`, `LAB_JWT_SIGNING_KEY`.
- [ ] pharmacy-api: `PHARMACY_DB_CONNECTION_STRING`, `PHARMACY_GAMOT_UPSC_SECRET_KEY`, `PHARMACY_JWT_SIGNING_KEY`.
- [ ] billing-api: `BILLING_DB_CONNECTION_STRING`, `BILLING_JWT_SIGNING_KEY`.
- [ ] patient-api (no Redis; the old `PATIENT_REDIS_CONNECTION_STRING` secret is gone): `PATIENT_DB_CONNECTION_STRING`, `PATIENT_CLERK_AUTHORITY` (secret or variable, required, no built-in default), optional `PATIENT_CLERK_AUDIENCE`, `PATIENT_CLERK_WEBHOOK_SECRET`, `PATIENT_ENCRYPTION_KEY` (32-byte base64), `PATIENT_SHARING_SIGNING_KEY` (>= 32 chars), `PATIENT_HUB_CLIENT_ID` / `_CLIENT_SECRET` / `_SIGNING_KEY` + `HUB_URL`, `PATIENT_R2_*` (or the shared `R2_*`), `PATIENT_FIREBASE_JSON`, Hangfire password (`PATIENTAPP_HANGFIRE_PASSWORD`, `PATIENT_HANGFIRE_PASSWORD` or `HANGFIRE_PASSWORD`; empty = dashboard denied), `BASE_DOMAIN`, optional `CORS_ALLOWED_*`.
- [ ] organization-api: `ORGANIZATION_DB_CONNECTION_STRING`.
- [ ] philhealth-proxy: `PORTAL_API_BASE_URL`.
- [ ] Optional: the Data Protection certificates, `*_PREVIOUS` values, `CORS_ALLOWED_*`.

#### Key pairs must match

- `FACILITY_LICENSE_PUBLIC_KEY` must be the public half of the portal's `FACILITY_LICENSE_PRIVATE_KEY`; a mismatch makes every license fail validation.
- A hub client's `Messaging__SigningKey` must be the private half of the public key registered at the hub for that client id. The cloud hub's bootstrap registers the portal client only (`INTEROP_HUB_PORTAL_PUBLIC_KEY`); the other clients' public keys are registered through the hub admin API.
- An edge cell's local hub registers one public key per local service (the installer generates the pairs, see `deploy/edge/README.md`) and signs towards the cloud with the cell's portal-issued key (`EDGE_HUB_SIGNING_KEY`).

#### Rotation

- **License keys:** generate a new pair, set the OLD public key as `FACILITY_LICENSE_PUBLIC_KEY_PREVIOUS` and the new one as `FACILITY_LICENSE_PUBLIC_KEY`, deploy the portal with the new private key and the verifiers, hand sites the new public key. Remove `_PREVIOUS` once every license was renewed (licenses live at most 90 days).
- **Hub signing keys:** generate a new pair, replace the public key at the hub (admin API / `INTEROP_HUB_PORTAL_PUBLIC_KEY` for the portal), then deploy the service with the new private key. Envelopes signed with the old key are rejected afterwards, so do both in one maintenance window.
- **Clinic master secret:** re-encrypting stored files under a new secret is **not supported yet**. A new `CLINIC_ENCRYPTION_MASTER_SECRET` only works for new files; keep every older value in `CLINIC_ENCRYPTION_PREVIOUS_MASTER_SECRET_0` / `_1` so the old files stay readable (two slots, so at most two retired secrets).
- **Document signing and UPSC keys:** a new value invalidates codes/QR already issued; rotate only when that is acceptable.
- **Data Protection:** the key ring rotates itself inside PostgreSQL; keep the database (and certificate, if used) and do nothing else.
- **JWT signing keys:** a new value signs everyone out of that service once.

#### Migrating an existing deployment

- **Clinic master secret.** Earlier builds fell back to a secret compiled into the code (the value that was compiled into `ClinicEncryptionService`). The fallback is gone. Before the first deploy of this version, set `CLINIC_ENCRYPTION_MASTER_SECRET` to a new random value AND put the value that was compiled into `ClinicEncryptionService` into `CLINIC_ENCRYPTION_PREVIOUS_MASTER_SECRET_0` (copy it from the source of the version you ran; it is not repeated here), otherwise records written before cannot be opened. The cloud workflows write it from a GitHub secret unchanged. The edge installers cannot carry it: that value contains `#`, and the installers reject `$`, quotes, backslash, backtick and `#` in every `.env` value, so an on-premise site that already holds records under the old built-in secret needs a manual procedure (not covered by the installer); new sites are unaffected.
- **GAMOT UPSC.** Earlier builds used the literal `ClinicEzPhilHealthGamotSecretKey` (exactly 32 characters, so it passes the length check). To keep UPSC codes issued so far valid, set `PHARMACY_GAMOT_UPSC_SECRET_KEY` to that value; otherwise use a random value and accept that the codes issued under the old key stop verifying. New deployments should always use a random value.
- **License keys, signing keys, document keys, JWT keys, internal keys:** none existed as configuration before; generate them as above, deploy the portal first (it holds the license private key), then the other services, then register the public keys at the hub.

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

`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_PORTAL_API_URL`, `PORTAL_API_URL`, `NEXT_PUBLIC_BASE_DOMAIN`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_SERVICE_SUBDOMAINS`, `NEXT_PUBLIC_SUBDOMAIN_{CLINIC,LABORATORY,PHARMACY,ORGANIZATION}`,
`NEXT_PUBLIC_{CONTACT,SALES,BILLING,SUPPORT}_EMAIL`, `NEXT_PUBLIC_STORAGE_PUBLIC_URL`. See `apps/portal-web/.env.example`.

### `apps/patient-app`

`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_PORTAL_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL`.
See `apps/patient-app/.env.example`.
