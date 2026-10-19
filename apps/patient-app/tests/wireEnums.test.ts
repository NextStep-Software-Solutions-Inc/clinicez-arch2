import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  APPOINTMENT_STATUSES,
  GRANT_SOURCES,
  GRANT_STATUSES,
  LAB_REQUEST_STAGES,
  MEMBERSHIP_STATUSES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  PAYMENT_STATUSES,
  PRESCRIPTION_STAGES,
  RESULT_SOURCES,
  RESULT_VERIFICATIONS,
  SHARING_SCOPE_KEYS,
  SYNC_STATUSES,
  appointmentStatusSchema,
  grantSourceSchema,
  grantStatusSchema,
  labRequestStageSchema,
  membershipStatusSchema,
  notificationCategorySchema,
  notificationTypeSchema,
  paymentStatusSchema,
  prescriptionStageSchema,
  resultSourceSchema,
  resultVerificationSchema,
  sharingScopeSchema,
  syncStatusSchema,
} from '../services/api/wireEnums';
import { localAppointmentStatus } from '../services/appointments/statusMap';
import { localMembershipStatus } from '../services/discovery/membershipStatus';
import {
  localNotificationCategory,
  localNotificationType,
  wireNotificationCategory,
} from '../services/notifications/wireMapping';

const toCamelCase = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

const ENUMS: ReadonlyArray<readonly [string, z.ZodType, readonly string[]]> = [
  ['lab request stage', labRequestStageSchema, LAB_REQUEST_STAGES],
  ['payment status', paymentStatusSchema, PAYMENT_STATUSES],
  ['prescription stage', prescriptionStageSchema, PRESCRIPTION_STAGES],
  ['result source', resultSourceSchema, RESULT_SOURCES],
  ['result verification', resultVerificationSchema, RESULT_VERIFICATIONS],
  ['sharing scope', sharingScopeSchema, SHARING_SCOPE_KEYS],
  ['grant source', grantSourceSchema, GRANT_SOURCES],
  ['grant status', grantStatusSchema, GRANT_STATUSES],
  ['appointment status', appointmentStatusSchema, APPOINTMENT_STATUSES],
  ['membership status', membershipStatusSchema, MEMBERSHIP_STATUSES],
  ['notification type', notificationTypeSchema, NOTIFICATION_TYPES],
  ['notification category', notificationCategorySchema, NOTIFICATION_CATEGORIES],
  ['sync status', syncStatusSchema, SYNC_STATUSES],
];

describe('wire enums are PascalCase strings only', () => {
  for (const [name, schema, values] of ENUMS) {
    test(`${name}: accepts every PascalCase member`, () => {
      for (const value of values) expect(schema.safeParse(value).success).toBe(true);
    });

    test(`${name}: rejects camelCase, lowercase, numbers and unknown values`, () => {
      for (const value of values) {
        expect(schema.safeParse(toCamelCase(value)).success).toBe(false);
        expect(schema.safeParse(value.toLowerCase()).success).toBe(false);
      }
      expect(schema.safeParse(0).success).toBe(false);
      expect(schema.safeParse(1).success).toBe(false);
      expect(schema.safeParse('NotAMember').success).toBe(false);
      expect(schema.safeParse(null).success).toBe(false);
    });
  }

  test('camelCase literals from the old contract are rejected', () => {
    expect(labRequestStageSchema.safeParse('awaitingPayment').success).toBe(false);
    expect(prescriptionStageSchema.safeParse('externalDispensed').success).toBe(false);
    expect(resultSourceSchema.safeParse('patientUploaded').success).toBe(false);
    expect(sharingScopeSchema.safeParse('labResults').success).toBe(false);
    expect(grantStatusSchema.safeParse('active').success).toBe(false);
    expect(appointmentStatusSchema.safeParse('noShow').success).toBe(false);
  });
});

describe('appointment status boundary table', () => {
  test('maps every wire status to the local vocabulary', () => {
    expect(APPOINTMENT_STATUSES.map((status) => localAppointmentStatus(status))).toEqual([
      'pending',
      'confirmed',
      'canceled',
      'completed',
      'no_show',
      'action_required',
    ]);
  });
});

describe('membership status boundary', () => {
  test('maps PascalCase to local lowercase and null to undefined', () => {
    expect(localMembershipStatus('Active')).toBe('active');
    expect(localMembershipStatus('Pending')).toBe('pending');
    expect(localMembershipStatus(null)).toBeUndefined();
    expect(localMembershipStatus(undefined)).toBeUndefined();
  });
});

describe('notification boundary tables', () => {
  test('wire types map to the local snake_case types', () => {
    expect(localNotificationType('AppointmentReminder')).toBe('appointment_reminder');
    expect(localNotificationType('ClinicAnnouncement')).toBe('clinic_announcement');
    expect(localNotificationType('MedicationReminder')).toBe('medication_reminder');
    expect(localNotificationType('LabResult')).toBe('lab_result');
    expect(localNotificationType('NewMessage')).toBe('new_message');
    expect(localNotificationType('System')).toBe('system');
    expect(localNotificationType('SyncConflict')).toBe('system');
  });

  test('categories round-trip between wire and local', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(wireNotificationCategory(localNotificationCategory(category))).toBe(category);
    }
    expect(localNotificationCategory('Appointments')).toBe('appointments');
  });
});
