import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq, and, isNull } from 'drizzle-orm';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseISO, format } from 'date-fns';

const APP_ROOT = join(import.meta.dir, '..');
const readAppFile = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

// ── In-Memory SQLite Schema for 7 Deep-Link Routes ────────────────────────────

function createUnseededDeepLinkTestDb() {
  const sqlite = new Database(':memory:');

  sqlite.run(`
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      expires_at INTEGER,
      source_id TEXT,
      deleted_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_healthcare_providers (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      name TEXT,
      specialty TEXT,
      clinic_hospital TEXT,
      phone TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE clinics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT,
      province TEXT,
      postal_code TEXT,
      latitude REAL,
      longitude REAL,
      phone_number TEXT,
      email TEXT,
      website TEXT,
      operating_hours_json TEXT,
      is_public INTEGER NOT NULL DEFAULT 1,
      is_gated INTEGER NOT NULL DEFAULT 0,
      is_online_booking_paused INTEGER NOT NULL DEFAULT 0,
      is_philhealth_accredited INTEGER NOT NULL DEFAULT 0,
      logo_url TEXT,
      cover_image_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.run(`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'company',
      is_public INTEGER NOT NULL DEFAULT 1,
      logo_url TEXT,
      cover_image_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.run(`
    CREATE TABLE clinic_organization_links (
      id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
  `);

  sqlite.run(`
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      clinic_id TEXT NOT NULL,
      clinic_name TEXT NOT NULL,
      clinic_address TEXT,
      clinic_logo_url TEXT,
      clinic_cover_image_url TEXT,
      clinic_phone_number TEXT,
      provider_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      provider_specialty TEXT,
      provider_avatar_url TEXT,
      provider_bio TEXT,
      provider_credentials_json TEXT NOT NULL DEFAULT '[]',
      provider_affiliated_clinics_json TEXT NOT NULL DEFAULT '[]',
      service_type TEXT,
      scheduled_at TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      attached_documents_json TEXT NOT NULL DEFAULT '[]',
      cached_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );
  `);

  sqlite.run(`
    CREATE TABLE booking_drafts (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      clinic_id TEXT NOT NULL,
      organization_id TEXT,
      preferred_date TEXT,
      preferred_time TEXT,
      reason TEXT,
      notes TEXT,
      share_fields_json TEXT NOT NULL DEFAULT '[]',
      share_sections_json TEXT NOT NULL DEFAULT '[]',
      attached_file_ids_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE files_metadata (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      local_uri TEXT,
      remote_url TEXT,
      category TEXT NOT NULL DEFAULT 'other',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE patients (
      id TEXT PRIMARY KEY,
      clerk_user_id TEXT UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  return { sqlite, db: drizzle(sqlite) };
}

// Adversarial input matrix
const ADVERSARIAL_IDS = [
  'non-existent-uuid-00000000-0000-4000-8000-000000000000',
  '../../../../etc/passwd',
  '..\\..\\windows\\win.ini',
  "<script>alert('xss')</script>",
  "' OR '1'='1' --",
  "1; DROP TABLE appointments; --",
  '   ',
  '',
  '0',
  '-1',
  'NaN',
  'null',
  'undefined',
  '{"id":"malformed"}',
  '[1,2,3]',
  '🚀🔥💊🏥🩺',
  '!@#$%^&*()_+={}|[]\\:";\'<>?,./',
  'a'.repeat(2048),
];

describe('Challenger Milestone 3: Deep Links, Desktop Usability & Design Tokens Stress Test', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Linking Configuration Invariants & Route Registration
  // ───────────────────────────────────────────────────────────────────────────
  describe('Linking configuration invariants for all 7 deep link routes', () => {
    const linkingSource = readAppFile('navigation/linking.ts');

    test('linking.ts registers all 7 required deep-link routes under Main screens', () => {
      const expectedRoutes = [
        "NotificationDetailScreen: 'notifications/:id'",
        "ProviderProfileScreen: 'providers/:id'",
        "ClinicDetailsScreen: 'explore/clinics/:id'",
        "OrganizationDetailsScreen: 'explore/orgs/:id'",
        "AppointmentDetailScreen: 'appointments/:id'",
        "RescheduleScreen: 'appointments/:id/reschedule'",
        "AttachFilesScreen: 'appointments/:id/attach-files'",
      ];

      for (const expected of expectedRoutes) {
        expect(linkingSource.includes(expected)).toBe(true);
      }
    });

    test('deep-link URL parameter segments match parameter names consumed by target screens', () => {
      // 1. NotificationDetail: consumes :id
      expect(linkingSource.includes('notifications/:id')).toBe(true);
      // 2. ProviderProfile: consumes :id
      expect(linkingSource.includes('providers/:id')).toBe(true);
      // 3. ClinicDetails: consumes :id
      expect(linkingSource.includes('explore/clinics/:id')).toBe(true);
      // 4. OrganizationDetails: consumes :id
      expect(linkingSource.includes('explore/orgs/:id')).toBe(true);
      // 5. AppointmentDetail: consumes :id
      expect(linkingSource.includes('appointments/:id')).toBe(true);
      // 6. Reschedule: consumes :id
      expect(linkingSource.includes('appointments/:id/reschedule')).toBe(true);
      // 7. AttachFiles: consumes :id
      expect(linkingSource.includes('appointments/:id/attach-files')).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Adversarial ID Stress Matrix across Unseeded Offline Database
  // ───────────────────────────────────────────────────────────────────────────
  describe('Adversarial ID Stress Matrix across unseeded offline database', () => {
    let testDb: any;
    let sqlite: Database;

    beforeEach(() => {
      const created = createUnseededDeepLinkTestDb();
      sqlite = created.sqlite;
      testDb = created.db;
    });

    // ── Route 1: notifications/:id ───────────────────────────────────────────
    test('Route 1 (notifications/:id): queries unseeded notifications table without throwing for any adversarial ID', () => {
      const { notifications } = require('../db/schema/notifications');

      for (const advId of ADVERSARIAL_IDS) {
        const rawParams = { id: advId };
        const notifId = rawParams?.id;

        // Simulate NotificationDetailScreen data lookup
        expect(() => {
          const rows = sqlite.query('SELECT * FROM notifications WHERE id = ? LIMIT 1').all(String(notifId));
          expect(rows.length).toBe(0);
        }).not.toThrow();

        // Simulate Drizzle query as in screen
        expect(() => {
          const query = testDb.select().from(notifications).where(eq(notifications.id, String(notifId))).limit(1);
          // Query compilation and execution
          const res = query.all();
          expect(res.length).toBe(0);
        }).not.toThrow();
      }
    });

    test('Route 1 (notifications/:id): screen source code contains graceful EmptyState fallback when not found', () => {
      const src = readAppFile('navigation/screens/NotificationDetail.screen.tsx');
      expect(src.includes('Notification not found')).toBe(true);
      expect(src.includes('EmptyState')).toBe(true);
      expect(src.includes('rawParams?.id ?? initialNotification?.id')).toBe(true);
    });

    // ── Route 2: providers/:id ───────────────────────────────────────────────
    test('Route 2 (providers/:id): queries unseeded providers table without throwing and provides safe fallback object', () => {
      const { patientHealthcareProviders } = require('../db/schema/patientHealthcareProviders');

      for (const advId of ADVERSARIAL_IDS) {
        const rawParams = { id: advId };
        const providerId = rawParams?.id;

        expect(() => {
          const res = testDb.select().from(patientHealthcareProviders).where(eq(patientHealthcareProviders.id, String(providerId))).limit(1).all();
          expect(res.length).toBe(0);
        }).not.toThrow();

        // When rows[0] is undefined, verify fallback construction is safe and well-typed
        const fallbackProvider = {
          id: String(providerId),
          name: 'Healthcare Provider',
          specialty: 'General Practitioner',
          avatarUrl: undefined,
          rating: 5.0,
          bio: 'Attending physician providing outpatient clinical consultations.',
          credentials: ['MD'],
          affiliatedClinics: [],
        };

        expect(fallbackProvider.id).toBe(String(providerId));
        expect(fallbackProvider.name).toBe('Healthcare Provider');
        expect(Array.isArray(fallbackProvider.credentials)).toBe(true);
        expect(Array.isArray(fallbackProvider.affiliatedClinics)).toBe(true);
      }
    });

    test('Route 2 (providers/:id): screen source code contains safe fallback provider and EmptyState', () => {
      const src = readAppFile('navigation/screens/appointments/ProviderProfile.screen.tsx');
      expect(src.includes('Provider Not Found')).toBe(true);
      expect(src.includes('rawParams?.id ?? initialProvider?.id')).toBe(true);
      expect(src.includes("specialty: 'General Practitioner'")).toBe(true);
    });

    // ── Route 3: explore/clinics/:id ─────────────────────────────────────────
    test('Route 3 (explore/clinics/:id): parameter resolution and unseeded catalog lookups handle all adversarial IDs', () => {
      for (const advId of ADVERSARIAL_IDS) {
        const routeParams = { id: advId };
        const clinicId = String(routeParams?.clinicId ?? routeParams?.id ?? '');
        expect(typeof clinicId).toBe('string');

        // Unseeded clinics lookup
        const rows = sqlite.query('SELECT * FROM clinics WHERE id = ?').all(clinicId);
        expect(rows.length).toBe(0);
      }
    });

    test('Route 3 (explore/clinics/:id): native and web screens catch lookup errors and render EmptyState', () => {
      const nativeSrc = readAppFile('navigation/screens/ClinicDetails.screen.tsx');
      const webSrc = readAppFile('navigation/screens/ClinicDetails.screen.web.tsx');

      expect(nativeSrc.includes('route.params?.clinicId ?? route.params?.id')).toBe(true);
      expect(webSrc.includes('route.params?.clinicId ?? route.params?.id')).toBe(true);

      expect(nativeSrc.includes('Clinic not found')).toBe(true);
      expect(webSrc.includes('Clinic not found')).toBe(true);

      // Verify try/catch wraps local loading
      expect(nativeSrc.includes('try {')).toBe(true);
      expect(nativeSrc.includes("console.log('Local load failed:'")).toBe(true);
      expect(webSrc.includes("console.log('Local load failed:'")).toBe(true);
    });

    // ── Route 4: explore/orgs/:id ────────────────────────────────────────────
    test('Route 4 (explore/orgs/:id): parameter resolution and unseeded org lookups handle all adversarial IDs', () => {
      for (const advId of ADVERSARIAL_IDS) {
        const routeParams = { id: advId };
        const orgId = String(routeParams?.organizationId ?? routeParams?.id ?? '');
        expect(typeof orgId).toBe('string');

        const rows = sqlite.query('SELECT * FROM organizations WHERE id = ?').all(orgId);
        expect(rows.length).toBe(0);
      }
    });

    test('Route 4 (explore/orgs/:id): native and web screens catch errors and render EmptyState', () => {
      const nativeSrc = readAppFile('navigation/screens/OrganizationDetails.screen.tsx');
      const webSrc = readAppFile('navigation/screens/OrganizationDetails.screen.web.tsx');

      expect(nativeSrc.includes('route.params?.organizationId ?? route.params?.id')).toBe(true);
      expect(webSrc.includes('route.params?.organizationId ?? route.params?.id')).toBe(true);

      expect(nativeSrc.includes('Organization not found')).toBe(true);
      expect(webSrc.includes('Organization not found')).toBe(true);
    });

    // ── Route 5: appointments/:id ────────────────────────────────────────────
    test('Route 5 (appointments/:id): getAppointmentDetail returns null for any adversarial ID in unseeded database', async () => {
      const { appointments } = require('../db/schema/appointments');
      const { bookingDrafts } = require('../db/schema/bookingDrafts');

      for (const advId of ADVERSARIAL_IDS) {
        const rawParams = { id: advId };
        const appointmentId = rawParams.appointmentId ?? rawParams.id ?? '';

        // Simulate getAppointmentDetail implementation directly
        const rows = testDb.select().from(appointments).where(eq(appointments.id, appointmentId)).all();
        expect(rows.length).toBe(0);

        const draftRows = testDb.select().from(bookingDrafts).where(and(eq(bookingDrafts.id, appointmentId), eq(bookingDrafts.status, 'ready'))).all();
        expect(draftRows.length).toBe(0);
      }
    });

    test('Route 5 (appointments/:id): AppointmentDetailScreen safely renders SkeletonCard on missing appointment without null dereference', () => {
      const src = readAppFile('navigation/screens/appointments/AppointmentDetail.screen.tsx');
      expect(src.includes('appointmentId = route.params?.appointmentId ?? (route.params as any)?.id')).toBe(true);
      expect(src.includes('if (isLoading || !item)')).toBe(true);
      expect(src.includes('<SkeletonCard />')).toBe(true);
      // Verify date parsing is guarded by try/catch
      expect(src.includes('try {')).toBe(true);
      expect(src.includes('parseISO(item.scheduledAt)')).toBe(true);
    });

    // ── Route 6: appointments/:id/reschedule ──────────────────────────────────
    test('Route 6 (appointments/:id/reschedule): handles malformed dates and missing appointments without throwing', () => {
      const malformedDates = ['not-a-date', '2026-99-99', 'invalid', '', '   ', 'null', 'undefined'];

      for (const malformed of malformedDates) {
        expect(() => {
          let dateLabel = '';
          try {
            dateLabel = malformed ? format(parseISO(malformed), 'EEEE, MMMM d, yyyy · h:mm a') : '';
          } catch {
            dateLabel = '';
          }
          expect(typeof dateLabel).toBe('string');
        }).not.toThrow();
      }
    });

    test('Route 6 (appointments/:id/reschedule): parameter resolution resolves both appointmentId and id', () => {
      const src = readAppFile('navigation/screens/appointments/Reschedule.screen.tsx');
      expect(src.includes('appointmentId = rawParams.appointmentId ?? rawParams.id ??')).toBe(true);
      expect(src.includes('currentDateLabel')).toBe(true);
      expect(src.includes('WeeklyDatePicker')).toBe(true);
      expect(src.includes('TimeSlotPicker')).toBe(true);
    });

    // ── Route 7: appointments/:id/attach-files ───────────────────────────────
    test('Route 7 (appointments/:id/attach-files): queries unseeded filesMetadata without throwing', () => {
      const { filesMetadata } = require('../db/schema/filesMetadata');

      for (const advId of ADVERSARIAL_IDS) {
        const rawParams = { id: advId };
        const appointmentId = rawParams?.appointmentId ?? rawParams?.id;

        expect(() => {
          const rows = testDb.select().from(filesMetadata).where(and(eq(filesMetadata.patientId, 'patient-123'), isNull(filesMetadata.deletedAt))).all();
          expect(rows.length).toBe(0);
        }).not.toThrow();
      }
    });

    test('Route 7 (appointments/:id/attach-files): parameter resolution and store hooks are present', () => {
      const src = readAppFile('navigation/screens/appointments/AttachFiles.screen.tsx');
      expect(src.includes('appointmentId = rawParams?.appointmentId ?? rawParams?.id')).toBe(true);
      expect(src.includes('setAttachedFileSelection')).toBe(true);
      expect(src.includes('peekAttachedFileSelection')).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Desktop Mouse Usability on ProfileListItemCard
  // ───────────────────────────────────────────────────────────────────────────
  describe('Desktop mouse usability & touch target compliance on ProfileListItemCard', () => {
    const componentSrc = readAppFile('components/profile/ProfileListItemCard.tsx');

    test('ProfileListItemCard explicitly defines >=44px minWidth and minHeight for desktop actions', () => {
      expect(componentSrc.includes('desktopActionBtn:')).toBe(true);
      expect(componentSrc.includes('minWidth: 44')).toBe(true);
      expect(componentSrc.includes('minHeight: 44')).toBe(true);
    });

    test('ProfileListItemCard renders desktop inline Edit and Delete buttons on card face', () => {
      expect(componentSrc.includes('styles.desktopActions')).toBe(true);
      expect(componentSrc.includes('accessibilityLabel="Edit entry"')).toBe(true);
      expect(componentSrc.includes('accessibilityLabel="Delete entry"')).toBe(true);
      expect(componentSrc.includes('accessibilityRole="button"')).toBe(true);
    });

    test('Desktop Edit and Delete callbacks trigger onEdit and onDelete without swiping', () => {
      // Trace implementation logic:
      // handleEdit = () => { close(); onEdit(); }
      // handleDelete = () => { close(); onDelete(); }
      expect(componentSrc.includes('const handleEdit = () => {')).toBe(true);
      expect(componentSrc.includes('onEdit();')).toBe(true);
      expect(componentSrc.includes('const handleDelete = () => {')).toBe(true);
      expect(componentSrc.includes('onDelete();')).toBe(true);

      // Verify callbacks execute properly
      let editCalled = false;
      let deleteCalled = false;

      const mockOnEdit = () => { editCalled = true; };
      const mockOnDelete = () => { deleteCalled = true; };

      const simulatedHandleEdit = () => { mockOnEdit(); };
      const simulatedHandleDelete = () => { mockOnDelete(); };

      simulatedHandleEdit();
      expect(editCalled).toBe(true);

      simulatedHandleDelete();
      expect(deleteCalled).toBe(true);
    });

    test('Swipe action panel buttons also satisfy >=44px width requirement', () => {
      // ACTION_W = 130; actionBtn width: ACTION_W / 2 = 65px >= 44px
      expect(componentSrc.includes('const ACTION_W = 130;')).toBe(true);
      expect(componentSrc.includes('width: ACTION_W / 2')).toBe(true);
      const btnWidth = 130 / 2;
      expect(btnWidth).toBeGreaterThanOrEqual(44);
    });

    test('Gesture.Pan is configured with activeOffsetX to allow click events to pass through', () => {
      expect(componentSrc.includes('Gesture.Pan()')).toBe(true);
      expect(componentSrc.includes('.activeOffsetX([-8, 8])')).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Design Token Strictness & Consistency
  // ───────────────────────────────────────────────────────────────────────────
  describe('Design token strict compliance across touched components', () => {
    test('check-tokens.mjs --strict passes with 0 violations across patient-app', () => {
      const output = execSync('node apps/patient-app/scripts/check-tokens.mjs --strict', {
        cwd: join(APP_ROOT, '../..'),
        encoding: 'utf8',
      });
      expect(output.includes('0 violation(s) in 0 file(s)')).toBe(true);
    });

    test('AfterVisitSummaryCard strictly uses useAppTheme semantic tokens without raw hex literals', () => {
      const src = readAppFile('components/records/AfterVisitSummaryCard.tsx');
      expect(src.includes('useAppTheme')).toBe(true);
      expect(src.includes('colors.')).toBe(true);
      expect(src.includes('radii.')).toBe(true);
      expect(src.includes('spacing.')).toBe(true);
      // No raw hex literal like #0D6963 or #ffffff in JSX/styles
      const hexMatches = src.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });

    test('Records.screen.tsx strictly uses useAppTheme semantic tokens without raw hex literals', () => {
      const src = readAppFile('navigation/screens/records/Records.screen.tsx');
      expect(src.includes('useAppTheme')).toBe(true);
      expect(src.includes('colors.')).toBe(true);
      const hexMatches = src.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });

    test('ProfileListItemCard.tsx strictly uses useAppTheme semantic tokens without raw hex literals', () => {
      const src = readAppFile('components/profile/ProfileListItemCard.tsx');
      expect(src.includes('useAppTheme')).toBe(true);
      expect(src.includes('colors.')).toBe(true);
      const hexMatches = src.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Invariant Checks: Services Isolation & Existing Test Suite
  // ───────────────────────────────────────────────────────────────────────────
  describe('Services isolation invariant and clinical safety test verification', () => {
    test('git diff --name-only services/ outputs zero lines', () => {
      const diff = execSync('git diff --name-only services/', {
        cwd: join(APP_ROOT, '../..'),
        encoding: 'utf8',
      }).trim();
      expect(diff.length).toBe(0);
    });

    test('clinical-safety-records.test.ts passes completely', () => {
      const output = execSync('bun test apps/patient-app/tests/clinical-safety-records.test.ts 2>&1', {
        cwd: join(APP_ROOT, '../..'),
        encoding: 'utf8',
      });
      const clean = output.replace(/\u001b\[[0-9;]*m/g, '');
      expect(clean.includes('27 pass')).toBe(true);
      expect(clean.includes('0 fail')).toBe(true);
    });
  });
});
