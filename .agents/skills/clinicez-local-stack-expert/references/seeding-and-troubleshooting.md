# Local Stack Seeding, Auth, Mailpit & Troubleshooting Reference

## 1. Syncing Clerk Identities & Seeding Local Mock Data

Because **Admin Web**, **Portal Web**, and **Patient App** authenticate via Clerk and match the Clerk `sub` (`user_...`) / email against local PostgreSQL tables:

1. **Admin Web (`CLINICEZ-PORTAL_DB`):** Ensure an `AdminUsers` row exists with the user's `ClerkUserId` (`user_...`) and `Email`, linked to the Super Admin role (`IsActive = true`, `Status = Active`).
2. **Workspace & Facility (`CLINICEZ-PORTAL_DB`):** Seed a `Tenants` row (`OwnerId = <ClerkUserId>`) and a `Facilities` row (`Status = Active`, `IsPatientDiscoveryEligible = true`, `PlatformVerificationStatus = Verified` for direct practitioner testing or `Unverified` for LTO submission testing).
3. **Canonical Practitioner (for `Awaiting Confirmation` / OTP flow testing):** Insert a `Practitioners` row in `CLINICEZ-PORTAL_DB` with `VerificationStatus = Verified` and a matching `ProfessionKind` + `NormalizedPrcLicenseNo`, plus an `Active` `PractitionerAffiliations` row at a first facility so submitting the same PRC at a second clinic triggers `AwaitingOtp`.
4. **Patient App (`CLINICEZ-PATIENT_DB`):** Ensure `clinics` has the matching `FacilityId` (`is_public = true`, `supports_appointments = true`). Remember that `DirectoryCatalogSearchService.IsEligibleDirectoryClinician` requires a linked `practitioner_id` with `VerificationLevel = Verified` — doctors in `Awaiting Confirmation` will intentionally be excluded from public search and booking until OTP confirmation completes.

---

## 2. Bootstrapping a Local Clinic & Signing Facility Licenses

`clinic-api` requires a valid ECDSA-signed `FacilityLicensePayload` to bootstrap a workspace:

1. Sign a short-lived local payload using `FacilityLicenseSigner` (`packages/shared-dotnet`) with `FacilityLicense__PrivateKeyPem` from `/tmp/clinicez-local-stack/portal-api.local.env`.
2. Call `POST http://127.0.0.1:5245/api/v1/bootstrap` (or let Interop `facility.provision.requested` deliver it) to initialize `FacilitySettings` and the initial Clinic Admin account.
3. **Clinic API Authentication Header:** Always include `X-Facility-Slug: <slug>` on `POST http://127.0.0.1:5245/api/v1/auth/login` and authenticated clinic API calls. Login returns `data.accessToken`.

### Creating Doctor Schedules & Uploading Valid PRC Proof
- **Schedule templates route:** `POST /api/v1/doctors/{doctorId}/schedules/templates`
  - `dayOfWeek` MUST be the string enum (`"Monday"`, `"Tuesday"`, `"Wednesday"`, `"Thursday"`, `"Friday"`), NOT an integer.
- **Check availability:** `GET /api/v1/doctors/{doctorId}/availability?date=YYYY-MM-DD`
- **Upload PRC proof:** Always upload a real PNG/PDF file via `POST /api/v1/staff/{staffId}/prc-proof` (`multipart/form-data`, field name `file`) instead of setting a fake `PrcEvidenceObjectKey` directly in SQL, so `GET /api/v1/staff/{staffId}/prc-proof` and Admin Web `/evidence` return HTTP 200 image/PDF previews.

---

## 3. Debugging Interop Hub & Hangfire Delivery

### Inspect Interop Outbox & Delivered Messages
```bash
# Portal API outbox
docker exec clinicez-local-pg17 psql -U clinicez_local -d "CLINICEZ-PORTAL_DB" \
  -c 'SELECT "Type", "Status", "CreatedAt", "Error" FROM "InteropOutbox" ORDER BY "CreatedAt" DESC LIMIT 10;'

# Interop Hub message log
docker exec clinicez-local-pg17 psql -U clinicez_local -d "CLINICEZ-INTEROP_DB" \
  -c 'SELECT "Type", "FromAddress", "ToAddress", "State", "CreatedAt" FROM "InteropMessages" ORDER BY "CreatedAt" DESC LIMIT 15;'

# Clinic API outbox
docker exec clinicez-local-pg17 psql -U clinicez_local -d "CLINICEZ-CLINIC_DB" \
  -c 'SELECT "Type", "Status", "CreatedAt", "Error" FROM "InteropOutbox" ORDER BY "CreatedAt" DESC LIMIT 10;'
```

### Inspect Hangfire Email Jobs (Portal API)
- Dashboard URL: `http://127.0.0.1:5000/hangfire` (local password `devlocal`).
- Or query PostgreSQL directly:
```bash
docker exec clinicez-local-pg17 psql -U clinicez_local -d "CLINICEZ-PORTAL_DB" \
  -c 'SELECT id, statename, createdat FROM hangfire.job ORDER BY id DESC LIMIT 10;'
```

---

## 4. Mailpit vs. Live Resend SMTP

### Default Local Mode (Mailpit — Safe, Zero External Delivery)
- Container: `clinicez-local-mailpit` with `MP_SMTP_BIND_ADDR=0.0.0.0:2525`
- `CLINICEZ-PORTAL_DB` `"SystemSettings"`:
  - `Mailer:SmtpHost = clinicez-local-mailpit`
  - `Mailer:SmtpPort = 2525`
  - `Mailer:SmtpSecurity = Auto`
- `portal-api` env: `Smtp__Mode=Smtp` (never `Console` when testing actual SMTP dispatch).
- Inspect captured mail at `http://localhost:8025` or via `./scripts/local-stack.sh mailpit`.

### Switching to Live Resend (Only When Explicitly Requested by the User)
1. Ask the user for their Resend API key (`re_...`) if `SMTP_PASSWORD` is blank in `configuration.txt`.
2. Add `Smtp__Username=resend` and `Smtp__Password=<RESEND_API_KEY>` to `/tmp/clinicez-local-stack/portal-api.local.env` and recreate `clinicez-local-portal-api`.
3. Update `CLINICEZ-PORTAL_DB` `"SystemSettings"` to `Mailer:SmtpHost=smtp.resend.com`, `Mailer:SmtpPort=587`, `Mailer:SmtpSecurity=StartTls`.

---

## 5. Common Local Pitfalls & Instant Fixes

| Symptom | Root Cause | Fix |
|---|---|---|
| Edits in `apps/admin-web` do not appear on `localhost:3001` | A Vite server from a sibling git worktree is holding port `3001` | Run `lsof -iTCP:3001 -sTCP:LISTEN` to verify the PID/CWD, kill it, and run `"$STACK" start-frontend admin-web` from the active workspace. |
| `patient-app` or `clinic-app` returns HTTP 500 `UnableToResolveError` | Missing JS/font package or stale Metro cache | Run `bun install --frozen-lockfile` at repo root, then restart with `EXPO_CLEAR=1 "$STACK" start-frontend patient-app`. |
| Mailpit gets `Connection refused` on port `587` | Legacy `SystemSettings` pointed at `localhost:1025` or `smtp.resend.com:587` | Re-run `"$STACK" up` or update `Mailer:SmtpHost=clinicez-local-mailpit`, `Mailer:SmtpPort=2525`, `Mailer:SmtpSecurity=Auto`. |
| Past time slots show `available: true` in `patient-api` | Running an older `clinicez-local-patient-api:latest` image | Run `"$STACK" rebuild patient-api`. |
| Clerk Google sign-in required in browser subagent | Fresh browser profile without cached Clerk session | Pause and ask the user to sign in via Google in the visible browser pane, then resume the same browser subagent via `send_message`. |
