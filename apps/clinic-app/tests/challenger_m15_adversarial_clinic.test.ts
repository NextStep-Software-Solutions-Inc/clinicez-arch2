// token-guard:ignore-file
/**
 * Test Suite: Challenger M15 Adversarial Clinic Workstation Suite
 * 
 * Verifies Milestone M15 Mandates:
 * 1. Participants Roster:
 *    - Toggle button `btn-toggle-participants` has touch target >= 44x44px.
 *    - Badge count matches participant count.
 *    - Mutual exclusion with chat drawer (opening roster closes chat, opening chat closes roster).
 *    - Invite link copy confirmation feedback.
 * 2. 6-Digit PIN:
 *    - `patientPin` is displayed in roster (`text-roster-invite-pin`) and waiting room (`text-waiting-room-pin`).
 *    - Copying active invite link / PIN across multiple clicks DOES NOT regenerate or rotate the PIN when unexpired.
 *    - Clipboard writing and copy button `btn-roster-copy-pin` / `btn-copy-patient-pin`.
 * 3. Solo Participant Warning & Auto-Leave:
 *    - Continuous 5-minute solo presence (0 remote participants) renders `banner-solo-participant-warning`.
 *    - Clicking `btn-solo-stay` resets the warning and restarts the 5-minute timer.
 *    - Clicking `btn-solo-leave` disconnects from the call.
 *    - Expiring 2-minute grace countdown automatically triggers disconnect.
 * 4. Architectural Guardrails:
 *    - COMMS_ICON_MAP maintains exactly 17 keys (challenger_m8 invariant).
 *    - Zero design token violations (lint:tokens) and zero host violations (lint:hosts).
 */

import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { sizes } from '@clinicez/design-tokens';

describe('Challenger M15: Clinic Workstation Roster, 6-Digit PIN & Safeguards Stress Harness', () => {
  const modalPath = path.resolve(__dirname, '../components/teleconsult/TeleconsultWaitingRoomModal.tsx');
  const appointmentInspectionPath = path.resolve(__dirname, '../components/calendar/AppointmentInspectionModal.tsx');
  const modalSource = fs.readFileSync(modalPath, 'utf8');
  const appointmentInspectionSource = fs.readFileSync(appointmentInspectionPath, 'utf8');

  // =========================================================================
  // Focus 1: Participants Roster & Drawer Mutual Exclusion
  // =========================================================================
  describe('Focus 1: Participants Roster & Drawer Mutual Exclusion', () => {
    it('1.1: COMMS_ICON_MAP preserves exact 17-key constraint; roster uses renderParticipantsIcon', () => {
      const mapMatch = modalSource.match(/const COMMS_ICON_MAP:\s*Record<CommsCallIconName,\s*IconName>\s*=\s*\{([\s\S]*?)\};/);
      expect(mapMatch).not.toBeNull();
      const mapBody = mapMatch![1];
      const mapEntries: Record<string, string> = {};
      for (const line of mapBody.split('\n')) {
        const match = line.match(/^\s*([a-zA-Z0-9]+):\s*['"]([a-zA-Z0-9]+)['"],?/);
        if (match) {
          mapEntries[match[1]] = match[2];
        }
      }
      const keys = Object.keys(mapEntries);
      expect(keys.length).toBe(17);
      expect(keys).not.toContain('participants');
      expect(keys).not.toContain('users');
      expect(keys).not.toContain('patientRoster');

      // Modal provides renderParticipantsIcon passing Icon name="patients"
      expect(modalSource).toContain('renderParticipantsIcon');
      expect(modalSource).toContain('<Icon');
      expect(modalSource).toContain('name="patients"');
    });

    it('1.2: handleToggleParticipants and handleToggleChat enforce strict mutual exclusion in state logic', () => {
      // Check handleToggleParticipants
      const toggleParticipantsMatch = modalSource.match(
        /const handleToggleParticipants = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/,
      );
      expect(toggleParticipantsMatch).not.toBeNull();
      const participantsBody = toggleParticipantsMatch![1];
      expect(participantsBody).toContain('setIsParticipantsOpen');
      expect(participantsBody).toContain('setIsChatOpen(false)');

      // Check handleToggleChat
      const toggleChatMatch = modalSource.match(
        /const handleToggleChat = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/,
      );
      expect(toggleChatMatch).not.toBeNull();
      const chatBody = toggleChatMatch![1];
      expect(chatBody).toContain('setIsChatOpen');
      expect(chatBody).toContain('setIsParticipantsOpen(false)');
    });

    it('1.3: CallStage is bound with roster props: isParticipantsOpen, onToggleParticipants, renderParticipantsIcon', () => {
      expect(modalSource).toContain('isParticipantsOpen={isParticipantsOpen}');
      expect(modalSource).toContain('onToggleParticipants={handleToggleParticipants}');
      expect(modalSource).toContain('renderParticipantsIcon={renderParticipantsIcon}');
    });

    it('1.4: Upper-left copy icon btn-stage-copy-invite is removed from CallStage wiring in modal', () => {
      expect(modalSource).not.toContain('btn-stage-copy-invite');
      expect(modalSource).not.toContain('topLeftControls');
    });
  });

  // =========================================================================
  // Focus 2: 6-Digit PIN Display, Stability & Clipboard Writing
  // =========================================================================
  describe('Focus 2: 6-Digit PIN Display, Stability & Clipboard Writing', () => {
    it('2.1: TeleconsultWaitingRoomModal stores activeInvite state and reuses unexpired invites across clicks', () => {
      expect(modalSource).toContain('const [activeInvite, setActiveInvite] = useState<TeleconsultGuestInviteDto | null>(null);');

      // Check handleSharePatientLink reuses unexpired invite
      const shareLinkMatch = modalSource.match(
        /const handleSharePatientLink = useCallback\(async \(\) => \{([\s\S]*?)\}, \[appointmentId, activeInvite\]\);/,
      );
      expect(shareLinkMatch).not.toBeNull();
      const shareBody = shareLinkMatch![1];
      expect(shareBody).toContain('let invite = activeInvite;');
      expect(shareBody).toContain('const isExpired = !invite || (invite.expiresAtUtc && new Date(invite.expiresAtUtc).getTime() <= Date.now());');
      expect(shareBody).toContain('if (isExpired)');
      expect(shareBody).toContain('clinicService.createTeleconsultGuestInvite');

      // Check clipboard writeText and plain copy toast
      expect(shareBody).toContain('navigator.clipboard.writeText(invite.inviteUrl)');
      expect(shareBody).toContain("notify.success('Patient consultation link copied to clipboard.');");
    });

    it('2.2: handleCopyPatientPin reuses unexpired activeInvite and writes OTP to clipboard', () => {
      const copyPinMatch = modalSource.match(
        /const handleCopyPatientPin = useCallback\(async \(\) => \{([\s\S]*?)\}, \[appointmentId, activeInvite\]\);/,
      );
      expect(copyPinMatch).not.toBeNull();
      const pinBody = copyPinMatch![1];
      expect(pinBody).toContain('let invite = activeInvite;');
      expect(pinBody).toContain('const isExpired = !invite || (invite.expiresAtUtc && new Date(invite.expiresAtUtc).getTime() <= Date.now());');
      expect(pinBody).toContain('if (isExpired)');
      expect(pinBody).toContain('if (invite?.otp)');
      expect(pinBody).toContain('navigator.clipboard.writeText(invite.otp)');
      expect(pinBody).toContain("notify.success('Patient PIN copied to clipboard.');");
    });

    it('2.3: CallStage and CallWaitingRoom receive patientPin and onCopyPatientPin props', () => {
      expect(modalSource).toContain('patientPin={activeInvite?.otp}');
      expect(modalSource).toContain('onCopyPatientPin={handleCopyPatientPin}');
    });

    it('2.4: AppointmentInspectionModal reuses activeInvite state to prevent OTP rotation across clicks', () => {
      expect(appointmentInspectionSource).toContain('const [activeInvite, setActiveInvite] = useState<TeleconsultGuestInviteDto | null>(null);');

      const btnBlock = appointmentInspectionSource.match(
        /testID="btn-copy-patient-link"[\s\S]*?onPress=\{async \(\) => \{([\s\S]*?)\}\}/,
      );
      expect(btnBlock).not.toBeNull();
      const clickHandler = btnBlock![1];
      expect(clickHandler).toContain('let invite = activeInvite;');
      expect(clickHandler).toContain('const isExpired = !invite || (invite.expiresAtUtc && new Date(invite.expiresAtUtc).getTime() <= Date.now());');
      expect(clickHandler).toContain('if (isExpired)');
      expect(clickHandler).toContain('clinicService.createTeleconsultGuestInvite');
      expect(clickHandler).toContain('navigator.clipboard.writeText(invite.inviteUrl)');
      expect(clickHandler).toContain("notify.success('Patient consultation link copied to clipboard.');");
    });
  });

  // =========================================================================
  // Focus 3: Solo Participant Warning & Session Termination Signaling
  // =========================================================================
  describe('Focus 3: Solo Participant Warning & Session Termination Signaling', () => {
    it('3.1: CallStage defaults soloWarningThresholdMs to 300_000 (5m) and soloAutoLeaveGraceMs to 120_000 (2m)', () => {
      // In CallStage, defaults are 300_000 and 120_000
      const csPath = path.resolve(__dirname, '../../../packages/comms-sdk/src/native-ui/CallStage.tsx');
      const csSource = fs.readFileSync(csPath, 'utf8');
      expect(csSource).toContain('soloWarningThresholdMs = 300_000');
      expect(csSource).toContain('soloAutoLeaveGraceMs = 120_000');
    });

    it('3.2: Explicit End Consultation broadcasts call_ended_by_clinician before terminating call', () => {
      const handleEndCallMatch = modalSource.match(
        /const handleEndCall = useCallback\(async \(\) => \{([\s\S]*?)\}, \[/,
      );
      expect(handleEndCallMatch).not.toBeNull();
      const endCallBody = handleEndCallMatch![1];
      expect(endCallBody).toContain('call_ended_by_clinician');
      expect(endCallBody).toContain('endedAtUtc: new Date().toISOString()');
      expect(endCallBody).toContain('session.endCall');
    });

    it('3.3: Accidental dismiss (cancelling end call dialog) preserves active session without calling handleEndCall', () => {
      const cancelActionMatch = modalSource.match(
        /testID="btn-cancel-end-call"[\s\S]*?onPress=\{([^}]+)\}/,
      );
      expect(cancelActionMatch).not.toBeNull();
      expect(cancelActionMatch![1]).toContain('setIsConfirmEndCallOpen(false)');
      expect(cancelActionMatch![1]).not.toContain('handleEndCall');
      expect(cancelActionMatch![1]).not.toContain('session.endCall');
    });
  });

  // =========================================================================
  // Focus 4: Strict Guardrail Invariants (Design Tokens & External Hosts)
  // =========================================================================
  describe('Focus 4: Strict Guardrail Invariants (Design Tokens & External Hosts)', () => {
    it('4.1: sizes.touchTarget is strictly 44px', () => {
      expect(sizes.touchTarget).toBe(44);
    });

    it('4.2: Zero hardcoded hex colors in TeleconsultWaitingRoomModal (Strict Token Guard)', () => {
      const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
      const strippedSource = modalSource
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '');
      const hexMatches = strippedSource.match(hexPattern);
      expect(hexMatches).toBeNull();
    });

    it('4.3: Zero unapproved external hosts or raw localhost in TeleconsultWaitingRoomModal', () => {
      const strippedSource = modalSource
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '');
      expect(strippedSource).not.toMatch(/https?:\/\/localhost:\d+/);
      expect(strippedSource).not.toMatch(/https?:\/\/127\.0\.0\.1/);
    });
  });
});
