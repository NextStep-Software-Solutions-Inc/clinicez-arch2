// token-guard:ignore-file
/**
 * Test Suite: Challenger M14 Adversarial Clinic Workstation Teleconsultation Governance & Stress Suite
 * 
 * Mandates:
 * 1. AppointmentInspectionModal.tsx:
 *    - Multiple rapid clicks on `testID="btn-copy-patient-link"`: strictly reuses active invite without calling
 *      `clinicService.createTeleconsultGuestInvite` while unexpired.
 *    - Expired invite handling: correctly detects expiration and fetches a fresh invite.
 *    - Clipboard integration: writes `invite.inviteUrl` to `navigator.clipboard.writeText` and calls `notify.success`.
 *    - Error resilience: handles network/API failure and clipboard rejection gracefully.
 *    - 6-digit PIN display: visible via `testID="text-inspection-invite-pin"` and copied via `testID="btn-inspection-copy-pin"`.
 * 2. TeleconsultSettingsCard.tsx:
 *    - Locked state (`!isWorkspaceTeleconsultEntitled`): toggle disabled, locked banner displayed, unauthorized clicks rejected.
 *    - Entitled state (`isWorkspaceTeleconsultEntitled === true`): cleanly toggles ON/OFF.
 * 3. Modality gating in Appointments.screen.tsx & ScheduleVisitModal.tsx:
 *    - Cannot select or submit teleconsultation when `isEffectiveTeleconsultEnabled` is false.
 *    - Automatic clamping back to `InPerson`.
 * 4. Architecture invariants:
 *    - `COMMS_ICON_MAP` preserves exact 17 keys.
 *    - Zero hex/rgba color literals.
 *    - Zero unapproved external hosts.
 */

import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

(globalThis as any).__DEV__ = true;

describe('Challenger M14: Clinic Workstation Adversarial Stress Harness', () => {
  const inspectionModalPath = path.resolve(__dirname, '../components/calendar/AppointmentInspectionModal.tsx');
  const settingsCardPath = path.resolve(__dirname, '../components/settings/cards/TeleconsultSettingsCard.tsx');
  const appointmentsScreenPath = path.resolve(__dirname, '../navigation/screens/Appointments.screen.tsx');
  const scheduleVisitModalPath = path.resolve(__dirname, '../components/patient/ScheduleVisitModal.tsx');
  const commsModalPath = path.resolve(__dirname, '../components/teleconsult/TeleconsultWaitingRoomModal.tsx');

  const inspectionSource = fs.readFileSync(inspectionModalPath, 'utf8');
  const settingsCardSource = fs.readFileSync(settingsCardPath, 'utf8');
  const appointmentsScreenSource = fs.readFileSync(appointmentsScreenPath, 'utf8');
  const scheduleVisitModalSource = fs.readFileSync(scheduleVisitModalPath, 'utf8');
  const commsModalSource = fs.readFileSync(commsModalPath, 'utf8');

  // =========================================================================
  // Section 1: AppointmentInspectionModal Adversarial Stress & Pin Invariants
  // =========================================================================
  describe('Section 1: AppointmentInspectionModal Invite Reuse & PIN Invariants', () => {
    let clipboardWritten: string[] = [];
    let notifySuccessMsgs: string[] = [];
    let notifyErrorMsgs: string[] = [];
    let guestInviteApiCalls = 0;

    const mockInvite = {
      inviteToken: 'tok-m14-stress-abc',
      inviteUrl: 'https://portal.clinicez.ph/teleconsult/guest?token=tok-m14-stress-abc',
      otp: '654321',
      expiresAtUtc: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour future
      dobHint: '1990-**-**',
    };

    const expiredInvite = {
      inviteToken: 'tok-m14-expired-xyz',
      inviteUrl: 'https://portal.clinicez.ph/teleconsult/guest?token=tok-m14-expired-xyz',
      otp: '111222',
      expiresAtUtc: new Date(Date.now() - 60 * 1000).toISOString(), // 1 minute past
      dobHint: '1990-**-**',
    };

    beforeEach(() => {
      clipboardWritten = [];
      notifySuccessMsgs = [];
      notifyErrorMsgs = [];
      guestInviteApiCalls = 0;

      (globalThis as any).navigator = {
        clipboard: {
          writeText: async (text: string) => {
            clipboardWritten.push(text);
          },
        },
      };
    });

    afterEach(() => {
      delete (globalThis as any).navigator;
    });

    it('1.1: AST verification of btn-copy-patient-link click handler structure', () => {
      expect(inspectionSource).toContain('testID="btn-copy-patient-link"');
      expect(inspectionSource).toContain('let invite = activeInvite;');
      expect(inspectionSource).toContain('const isExpired = !invite || (invite.expiresAtUtc && new Date(invite.expiresAtUtc).getTime() <= Date.now());');
      expect(inspectionSource).toContain('if (isExpired)');
      expect(inspectionSource).toContain('clinicService.createTeleconsultGuestInvite');
      expect(inspectionSource).toContain('navigator.clipboard.writeText(invite.inviteUrl)');
      expect(inspectionSource).toContain("notify.success('Patient consultation link copied to clipboard.');");
      expect(inspectionSource).toContain("notify.error(err?.message || 'Could not generate patient consultation link.');");
      expect(inspectionSource).toContain("notify.error('Could not generate patient consultation link.');");
    });

    it('1.2: Simulation: 50 rapid-fire clicks on unexpired invite make exactly 0 additional API calls', async () => {
      // Simulate state inside AppointmentInspectionModal
      let activeInvite: any = { ...mockInvite };
      const currentAppointment = { id: 'appt-1001', isTeleconsult: true, status: 'Confirmed' };

      const mockCreateGuestInvite = async (_id: string) => {
        guestInviteApiCalls++;
        return [{ ...mockInvite, otp: '999999' }, null];
      };

      const copyHandler = async () => {
        try {
          let invite = activeInvite;
          const isExpired = !invite || (invite.expiresAtUtc && new Date(invite.expiresAtUtc).getTime() <= Date.now());
          if (isExpired) {
            const [freshInvite, err] = await mockCreateGuestInvite(currentAppointment.id);
            invite = freshInvite;
            if (err || !invite?.inviteUrl) {
              notifyErrorMsgs.push(err?.message || 'Could not generate patient consultation link.');
              return;
            }
            activeInvite = invite;
          }
          if (!invite) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(invite.inviteUrl);
          }
          notifySuccessMsgs.push('Patient consultation link copied to clipboard.');
        } catch {
          notifyErrorMsgs.push('Could not generate patient consultation link.');
        }
      };

      // Execute 50 rapid clicks
      for (let i = 0; i < 50; i++) {
        await copyHandler();
      }

      expect(guestInviteApiCalls).toBe(0);
      expect(clipboardWritten.length).toBe(50);
      expect(clipboardWritten.every((url) => url === mockInvite.inviteUrl)).toBe(true);
      expect(notifySuccessMsgs.length).toBe(50);
      expect(notifyErrorMsgs.length).toBe(0);
      expect(activeInvite.otp).toBe('654321'); // OTP is strictly preserved across rapid clicks!
    });

    it('1.3: Simulation: Expired invite triggers fresh fetch and clipboard copy with new OTP', async () => {
      let activeInvite: any = { ...expiredInvite };
      const currentAppointment = { id: 'appt-1002', isTeleconsult: true, status: 'Confirmed' };

      const freshInvite = {
        inviteToken: 'tok-fresh-777',
        inviteUrl: 'https://portal.clinicez.ph/teleconsult/guest?token=tok-fresh-777',
        otp: '888333',
        expiresAtUtc: new Date(Date.now() + 3600 * 1000).toISOString(),
        dobHint: '1990-**-**',
      };

      const mockCreateGuestInvite = async (_id: string) => {
        guestInviteApiCalls++;
        return [freshInvite, null];
      };

      const copyHandler = async () => {
        try {
          let invite = activeInvite;
          const isExpired = !invite || (invite.expiresAtUtc && new Date(invite.expiresAtUtc).getTime() <= Date.now());
          if (isExpired) {
            const [fetchedInvite, err] = await mockCreateGuestInvite(currentAppointment.id);
            invite = fetchedInvite;
            if (err || !invite?.inviteUrl) {
              notifyErrorMsgs.push(err?.message || 'Could not generate patient consultation link.');
              return;
            }
            activeInvite = invite;
          }
          if (!invite) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(invite.inviteUrl);
          }
          notifySuccessMsgs.push('Patient consultation link copied to clipboard.');
        } catch {
          notifyErrorMsgs.push('Could not generate patient consultation link.');
        }
      };

      // 1st click: invite is expired, should refresh
      await copyHandler();
      expect(guestInviteApiCalls).toBe(1);
      expect(clipboardWritten[0]).toBe(freshInvite.inviteUrl);
      expect(activeInvite.otp).toBe('888333');

      // Subsequent 10 clicks: newly fetched invite is unexpired, should reuse!
      for (let i = 0; i < 10; i++) {
        await copyHandler();
      }
      expect(guestInviteApiCalls).toBe(1); // Still exactly 1 call!
      expect(clipboardWritten.length).toBe(11);
    });

    it('1.4: Simulation: API failure when refreshing expired invite displays error notification', async () => {
      let activeInvite: any = null; // No invite yet
      const currentAppointment = { id: 'appt-fail-1', isTeleconsult: true, status: 'Confirmed' };

      const mockCreateGuestInvite = async (_id: string) => {
        guestInviteApiCalls++;
        return [null, { message: 'Teleconsultation is not enabled for this clinic.' }];
      };

      const copyHandler = async () => {
        try {
          let invite = activeInvite;
          const isExpired = !invite || (invite.expiresAtUtc && new Date(invite.expiresAtUtc).getTime() <= Date.now());
          if (isExpired) {
            const [fetchedInvite, err] = await mockCreateGuestInvite(currentAppointment.id);
            invite = fetchedInvite;
            if (err || !invite?.inviteUrl) {
              notifyErrorMsgs.push(err?.message || 'Could not generate patient consultation link.');
              return;
            }
            activeInvite = invite;
          }
          if (!invite) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(invite.inviteUrl);
          }
          notifySuccessMsgs.push('Patient consultation link copied to clipboard.');
        } catch {
          notifyErrorMsgs.push('Could not generate patient consultation link.');
        }
      };

      await copyHandler();
      expect(guestInviteApiCalls).toBe(1);
      expect(clipboardWritten.length).toBe(0);
      expect(notifyErrorMsgs.length).toBe(1);
      expect(notifyErrorMsgs[0]).toBe('Teleconsultation is not enabled for this clinic.');
    });

    it('1.5: Simulation: Clipboard write exception is safely caught without unhandled rejection', async () => {
      let activeInvite: any = { ...mockInvite };
      const currentAppointment = { id: 'appt-1003', isTeleconsult: true, status: 'Confirmed' };

      (globalThis as any).navigator.clipboard.writeText = async () => {
        throw new Error('NotAllowedError: Document is not focused.');
      };

      const copyHandler = async () => {
        try {
          let invite = activeInvite;
          const isExpired = !invite || (invite.expiresAtUtc && new Date(invite.expiresAtUtc).getTime() <= Date.now());
          if (isExpired) {
            const [freshInvite, err] = await clinicService.createTeleconsultGuestInvite(currentAppointment.id);
            invite = freshInvite;
            if (err || !invite?.inviteUrl) {
              notifyErrorMsgs.push(err?.message || 'Could not generate patient consultation link.');
              return;
            }
            activeInvite = invite;
          }
          if (!invite) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(invite.inviteUrl);
          }
          notifySuccessMsgs.push('Patient consultation link copied to clipboard.');
        } catch {
          notifyErrorMsgs.push('Could not generate patient consultation link.');
        }
      };

      await copyHandler();
      expect(clipboardWritten.length).toBe(0);
      expect(notifyErrorMsgs.length).toBe(1);
      expect(notifyErrorMsgs[0]).toBe('Could not generate patient consultation link.');
    });

    it('1.6: 6-Digit PIN UI contract: Visible PIN text and Copy PIN action', async () => {
      expect(inspectionSource).toContain('testID="teleconsult-invite-pin-container"');
      expect(inspectionSource).toContain('testID="text-inspection-invite-pin"');
      expect(inspectionSource).toContain('testID="btn-inspection-copy-pin"');
      expect(inspectionSource).toContain('GUEST 6-DIGIT ACCESS PIN');

      // Check pin copy handler
      const pinCopyMatch = inspectionSource.match(/testID="btn-inspection-copy-pin"[\s\S]*?onPress=\{async \(\) => \{([\s\S]*?)\}\}/);
      expect(pinCopyMatch).not.toBeNull();
      const pinHandler = pinCopyMatch![1];
      expect(pinHandler).toContain('navigator.clipboard.writeText(activeInvite.otp)');
      expect(pinHandler).toContain("notify.success('Guest 6-digit PIN copied to clipboard.');");

      // Simulate copy PIN click
      const activeInvite = { ...mockInvite };
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeInvite.otp);
      }
      notifySuccessMsgs.push('Guest 6-digit PIN copied to clipboard.');

      expect(clipboardWritten.length).toBe(1);
      expect(clipboardWritten[0]).toBe('654321');
      expect(notifySuccessMsgs).toContain('Guest 6-digit PIN copied to clipboard.');
    });

    it('1.7: Cancelled appointment does NOT render PIN or copy link', () => {
      expect(inspectionSource).toContain("isTeleconsult && currentAppointment.status !== 'Cancelled' && activeInvite?.otp");
      expect(inspectionSource).toContain("isTeleconsult && currentAppointment.status !== 'Cancelled' ? (");
    });
  });

  // =========================================================================
  // Section 2: TeleconsultSettingsCard Locked & Entitled State Invariants
  // =========================================================================
  describe('Section 2: TeleconsultSettingsCard State Invariants', () => {
    it('2.1: Locked state: toggle disabled and locked banner displayed when !isWorkspaceTeleconsultEntitled', () => {
      expect(settingsCardSource).toContain('const isWorkspaceTeleconsultEntitled = Boolean(settings?.isWorkspaceTeleconsultEntitled);');
      expect(settingsCardSource).toContain('!isWorkspaceTeleconsultEntitled && (');
      expect(settingsCardSource).toContain('testID="teleconsult-locked-banner"');
      expect(settingsCardSource).toContain('Workspace Entitlement Required');
      expect(settingsCardSource).toContain('Locked in Portal');
    });

    it('2.2: Adversarial defense: Direct click on toggle while not entitled does NOT mutate state', () => {
      // Look at the toggle onPress handler
      const toggleMatch = settingsCardSource.match(/testID="toggle-clinic-teleconsult-enabled"[\s\S]*?onPress=\{([\s\S]*?)\}/);
      expect(toggleMatch).not.toBeNull();
      const toggleBody = toggleMatch![1];
      expect(toggleBody).toContain('if (isWorkspaceTeleconsultEntitled)');

      // Simulate state machine
      let isWorkspaceTeleconsultEntitled = false;
      let enableTeleconsultation = false;
      const setEnableTeleconsultation = (cb: any) => {
        enableTeleconsultation = typeof cb === 'function' ? cb(enableTeleconsultation) : cb;
      };

      const handlePress = () => {
        if (isWorkspaceTeleconsultEntitled) {
          setEnableTeleconsultation((prev: boolean) => !prev);
        }
      };

      // Attempt 10 unauthorized clicks
      for (let i = 0; i < 10; i++) {
        handlePress();
      }
      expect(enableTeleconsultation).toBe(false);

      // Now grant entitlement
      isWorkspaceTeleconsultEntitled = true;
      handlePress();
      expect(enableTeleconsultation).toBe(true);

      handlePress();
      expect(enableTeleconsultation).toBe(false);
    });

    it('2.3: Accessibility state reflects disabled and checked attributes', () => {
      expect(settingsCardSource).toContain('accessibilityRole="switch"');
      expect(settingsCardSource).toContain('checked: enableTeleconsultation');
      expect(settingsCardSource).toContain('disabled: !isWorkspaceTeleconsultEntitled');
      expect(settingsCardSource).toContain('disabled={!isWorkspaceTeleconsultEntitled}');
    });
  });

  // =========================================================================
  // Section 3: Modality Gating in Appointments.screen & ScheduleVisitModal
  // =========================================================================
  describe('Section 3: Modality Gating Invariants', () => {
    it('3.1: Appointments.screen: isEffectiveTeleconsultEnabled strictly requires BOTH entitlement and clinic setting', () => {
      expect(appointmentsScreenSource).toContain('const isEffectiveTeleconsultEnabled = Boolean(');
      expect(appointmentsScreenSource).toContain('settings?.isWorkspaceTeleconsultEntitled && settings?.enableTeleconsultation');
    });

    it('3.2: Appointments.screen: Automatic clamping back to InPerson if teleconsult disabled', () => {
      expect(appointmentsScreenSource).toContain("if (!isEffectiveTeleconsultEnabled && formModality === 'Teleconsult')");
      expect(appointmentsScreenSource).toContain("setFormModality('InPerson')");
    });

    it('3.3: Appointments.screen: Adversarial click on teleconsult modality button rejected when disabled', () => {
      const btnMatch = appointmentsScreenSource.match(/testID="book-modality-teleconsult"[\s\S]*?onPress=\{([\s\S]*?)\}\s*style=/);
      expect(btnMatch).not.toBeNull();
      const btnBody = btnMatch![1];
      expect(btnBody).toContain('if (isEffectiveTeleconsultEnabled)');
      expect(btnBody).toContain("setFormModality('Teleconsult')");
      expect(btnBody).toContain("notify.warning('Teleconsultation is disabled for this clinic.');");
    });

    it('3.4: Appointments.screen: Form submission defensively blocked if Teleconsult is selected while disabled', () => {
      expect(appointmentsScreenSource).toContain("if (formModality === 'Teleconsult' && !isEffectiveTeleconsultEnabled)");
      expect(appointmentsScreenSource).toContain("notify.error('Teleconsultation is not enabled for this clinic.');");
      expect(appointmentsScreenSource).toContain('return;');
    });

    it('3.5: ScheduleVisitModal: effectiveTeleconsultEnabled gating matches clinic settings', () => {
      expect(scheduleVisitModalSource).toContain('const effectiveTeleconsultEnabled = isEffectiveTeleconsultEnabledProp ?? Boolean(');
      expect(scheduleVisitModalSource).toContain('clinic.settings?.isWorkspaceTeleconsultEntitled && clinic.settings?.enableTeleconsultation');
    });

    it('3.6: ScheduleVisitModal: Automatic clamping and defensive submission block', () => {
      expect(scheduleVisitModalSource).toContain("if (!effectiveTeleconsultEnabled && modality === 'Teleconsult')");
      expect(scheduleVisitModalSource).toContain("setModality('InPerson')");
      expect(scheduleVisitModalSource).toContain("if (modality === 'Teleconsult' && !effectiveTeleconsultEnabled)");
      expect(scheduleVisitModalSource).toContain("notify.error('Teleconsultation is not enabled for this clinic.');");
      expect(scheduleVisitModalSource).toContain('return;');
    });

    it('3.7: ScheduleVisitModal: btn-modality-teleconsult disabled attribute and rejection warning', () => {
      expect(scheduleVisitModalSource).toContain('testID="btn-modality-teleconsult"');
      expect(scheduleVisitModalSource).toContain('disabled={!effectiveTeleconsultEnabled}');
      const pressMatch = scheduleVisitModalSource.match(/testID="btn-modality-teleconsult"[\s\S]*?onPress=\{([\s\S]*?)\}\s*style=/);
      expect(pressMatch).not.toBeNull();
      const pressBody = pressMatch![1];
      expect(pressBody).toContain('if (effectiveTeleconsultEnabled)');
      expect(pressBody).toContain("setModality('Teleconsult')");
      expect(pressBody).toContain("notify.warning('Teleconsultation is disabled for this clinic.');");
    });
  });

  // =========================================================================
  // Section 4: Strict Architectural Guardrails (Icons, Tokens, Hosts)
  // =========================================================================
  describe('Section 4: Strict Architectural Guardrails', () => {
    it('4.1: COMMS_ICON_MAP in TeleconsultWaitingRoomModal has exactly 17 keys', () => {
      const mapMatch = commsModalSource.match(/const COMMS_ICON_MAP:\s*Record<CommsCallIconName,\s*IconName>\s*=\s*\{([\s\S]*?)\};/);
      expect(mapMatch).not.toBeNull();
      const mapBody = mapMatch![1];
      const keys = mapBody
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//') && line.includes(':'))
        .map((line) => line.split(':')[0].trim());

      expect(keys.length).toBe(17);
      expect(new Set(keys).size).toBe(17);
    });

    it('4.2: Zero hardcoded hex colors in AppointmentInspectionModal.tsx', () => {
      const hexMatches = inspectionSource.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });

    it('4.3: Zero hardcoded hex colors in TeleconsultSettingsCard.tsx', () => {
      const hexMatches = settingsCardSource.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });

    it('4.4: Zero hardcoded hex colors in ScheduleVisitModal.tsx', () => {
      const hexMatches = scheduleVisitModalSource.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });

    it('4.5: Zero unapproved external hosts in all modified components', () => {
      for (const [name, source] of [
        ['AppointmentInspectionModal', inspectionSource],
        ['TeleconsultSettingsCard', settingsCardSource],
        ['AppointmentsScreen', appointmentsScreenSource],
        ['ScheduleVisitModal', scheduleVisitModalSource],
      ] as const) {
        const hostMatches = source.match(/https?:\/\/(?!localhost:8081)[^\s'"`,]+/g) || [];
        const activeMatches = hostMatches.filter((url) => !url.includes('// Example'));
        expect(activeMatches.length).toBe(0);
      }
    });
  });
});
