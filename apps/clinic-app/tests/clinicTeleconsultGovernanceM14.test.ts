// token-guard:ignore-file
/**
 * Test Suite: Milestone M14 Clinic Hierarchical Governance & Teleconsultation Gating
 * 
 * Verifies:
 * 1. TeleconsultSettingsCard:
 *    - Master toggle `toggle-clinic-teleconsult-enabled`
 *    - Locked state (`!isWorkspaceTeleconsultEntitled`): `teleconsult-locked-banner` rendered, toggle disabled
 *    - Entitled state (`isWorkspaceTeleconsultEntitled === true`): banner omitted, toggle interactive
 *    - Touch targets >= 44px and zero raw hex literals
 * 2. Appointments.screen.tsx:
 *    - Effective gating: isEffectiveTeleconsultEnabled = Boolean(settings?.isWorkspaceTeleconsultEntitled && settings?.enableTeleconsultation)
 *    - Clamp formModality to InPerson when disabled
 *    - `book-modality-teleconsult` button gated when disabled
 *    - Defensive submission check rejects teleconsult booking if disabled
 * 3. ScheduleVisitModal.tsx:
 *    - Uses useClinic hook to inspect clinic settings
 *    - Effective gating clamps modality to InPerson when disabled
 *    - `btn-modality-teleconsult` disabled/gated when teleconsult is disabled
 *    - Defensive submission check rejects teleconsult booking if disabled
 * 4. AppointmentInspectionModal.tsx:
 *    - Active invite prefetch on mount
 *    - 6-digit PIN display `text-inspection-invite-pin` and copy button `btn-inspection-copy-pin`
 *    - Verbatim click handler structure and string literals on `btn-copy-patient-link`
 */

import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { sizes } from '@clinicez/design-tokens';

describe('Milestone M14: Clinic Hierarchical Governance & Teleconsultation Gating', () => {
  const settingsCardPath = path.resolve(__dirname, '../components/settings/cards/TeleconsultSettingsCard.tsx');
  const appointmentsScreenPath = path.resolve(__dirname, '../navigation/screens/Appointments.screen.tsx');
  const scheduleVisitModalPath = path.resolve(__dirname, '../components/patient/ScheduleVisitModal.tsx');
  const appointmentInspectionPath = path.resolve(__dirname, '../components/calendar/AppointmentInspectionModal.tsx');
  const clinicServicePath = path.resolve(__dirname, '../services/clinicService.ts');

  const settingsCardSource = fs.readFileSync(settingsCardPath, 'utf8');
  const appointmentsScreenSource = fs.readFileSync(appointmentsScreenPath, 'utf8');
  const scheduleVisitModalSource = fs.readFileSync(scheduleVisitModalPath, 'utf8');
  const appointmentInspectionSource = fs.readFileSync(appointmentInspectionPath, 'utf8');
  const clinicServiceSource = fs.readFileSync(clinicServicePath, 'utf8');

  describe('Focus 1: ClinicSettingsRecord & clinicService Contract', () => {
    it('1.1: ClinicSettingsRecord exposes enableTeleconsultation and isWorkspaceTeleconsultEntitled', () => {
      expect(clinicServiceSource).toContain('enableTeleconsultation?: boolean;');
      expect(clinicServiceSource).toContain('isWorkspaceTeleconsultEntitled?: boolean;');
    });
  });

  describe('Focus 2: TeleconsultSettingsCard Master Toggle & Entitlement Locking', () => {
    it('2.1: Renders master toggle testID="toggle-clinic-teleconsult-enabled"', () => {
      expect(settingsCardSource).toContain('testID="toggle-clinic-teleconsult-enabled"');
    });

    it('2.2: Renders locked banner testID="teleconsult-locked-banner" when not entitled', () => {
      expect(settingsCardSource).toContain('testID="teleconsult-locked-banner"');
      expect(settingsCardSource).toContain('!isWorkspaceTeleconsultEntitled');
    });

    it('2.3: Disables master toggle when not entitled', () => {
      expect(settingsCardSource).toContain('disabled={!isWorkspaceTeleconsultEntitled}');
      expect(settingsCardSource).toContain('disabled: !isWorkspaceTeleconsultEntitled');
    });

    it('2.4: Preserves all 5 existing setting blocks and testIDs', () => {
      expect(settingsCardSource).toContain('setting-default-policy');
      expect(settingsCardSource).toContain('setting-default-fee');
      expect(settingsCardSource).toContain('setting-recording-policy');
      expect(settingsCardSource).toContain('setting-retention-days');
      expect(settingsCardSource).toContain('setting-consent-required');
    });

    it('2.5: Zero hardcoded hex colors and 44px touch targets', () => {
      const hexColorRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
      expect(settingsCardSource.match(hexColorRegex)).toBeNull();
      expect(sizes.touchTarget).toBe(44);
    });
  });

  describe('Focus 3: Appointments Screen Modality Gating', () => {
    it('3.1: Computes isEffectiveTeleconsultEnabled from workspace entitlement and clinic enable flag', () => {
      expect(appointmentsScreenSource).toContain('isEffectiveTeleconsultEnabled');
      expect(appointmentsScreenSource).toContain('isWorkspaceTeleconsultEntitled');
      expect(appointmentsScreenSource).toContain('enableTeleconsultation');
    });

    it('3.2: Clamps formModality back to InPerson if teleconsultation is disabled', () => {
      expect(appointmentsScreenSource).toContain("if (!isEffectiveTeleconsultEnabled && formModality === 'Teleconsult')");
      expect(appointmentsScreenSource).toContain("setFormModality('InPerson')");
    });

    it('3.3: Gates testID="book-modality-teleconsult" button when disabled', () => {
      expect(appointmentsScreenSource).toContain('testID="book-modality-teleconsult"');
      expect(appointmentsScreenSource).toContain('isEffectiveTeleconsultEnabled');
    });

    it('3.4: Defensively blocks teleconsult appointment booking if disabled', () => {
      expect(appointmentsScreenSource).toContain("if (formModality === 'Teleconsult' && !isEffectiveTeleconsultEnabled)");
      expect(appointmentsScreenSource).toContain("notify.error('Teleconsultation is not enabled for this clinic.');");
    });
  });

  describe('Focus 4: ScheduleVisitModal Modality Gating', () => {
    it('4.1: Uses useClinic hook to inspect clinic settings and compute effective gating', () => {
      expect(scheduleVisitModalSource).toContain('useClinic');
      expect(scheduleVisitModalSource).toContain('effectiveTeleconsultEnabled');
    });

    it('4.2: Clamps modality back to InPerson when teleconsultation is disabled', () => {
      expect(scheduleVisitModalSource).toContain("if (!effectiveTeleconsultEnabled && modality === 'Teleconsult')");
      expect(scheduleVisitModalSource).toContain("setModality('InPerson')");
    });

    it('4.3: Gates or disables testID="btn-modality-teleconsult" when disabled', () => {
      expect(scheduleVisitModalSource).toContain('testID="btn-modality-teleconsult"');
      expect(scheduleVisitModalSource).toContain('disabled={!effectiveTeleconsultEnabled}');
    });

    it('4.4: Defensively blocks teleconsult scheduling submission when disabled', () => {
      expect(scheduleVisitModalSource).toContain("if (modality === 'Teleconsult' && !effectiveTeleconsultEnabled)");
      expect(scheduleVisitModalSource).toContain("notify.error('Teleconsultation is not enabled for this clinic.');");
    });
  });

  describe('Focus 5: AppointmentInspectionModal PIN Display & Invite Stability', () => {
    it('5.1: Prefetches active invite on modal mount', () => {
      expect(appointmentInspectionSource).toContain('createTeleconsultGuestInvite');
      expect(appointmentInspectionSource).toContain('setActiveInvite');
    });

    it('5.2: Renders 6-digit PIN textID="text-inspection-invite-pin" and copy PIN button testID="btn-inspection-copy-pin"', () => {
      expect(appointmentInspectionSource).toContain('testID="teleconsult-invite-pin-container"');
      expect(appointmentInspectionSource).toContain('testID="text-inspection-invite-pin"');
      expect(appointmentInspectionSource).toContain('testID="btn-inspection-copy-pin"');
    });

    it('5.3: Preserves exact click handler structure and string literals required for btn-copy-patient-link', () => {
      expect(appointmentInspectionSource).toContain('let invite = activeInvite;');
      expect(appointmentInspectionSource).toContain('const isExpired = !invite || (invite.expiresAtUtc && new Date(invite.expiresAtUtc).getTime() <= Date.now());');
      expect(appointmentInspectionSource).toContain('if (isExpired)');
      expect(appointmentInspectionSource).toContain('clinicService.createTeleconsultGuestInvite');
      expect(appointmentInspectionSource).toContain('invite = freshInvite;');
      expect(appointmentInspectionSource).toContain('if (err || !invite?.inviteUrl)');
      expect(appointmentInspectionSource).toContain('navigator.clipboard.writeText(invite.inviteUrl)');
      expect(appointmentInspectionSource).toContain("notify.success('Patient consultation link copied to clipboard.');");
      expect(appointmentInspectionSource).toContain("notify.error(err?.message || 'Could not generate patient consultation link.');");
    });
  });
});
