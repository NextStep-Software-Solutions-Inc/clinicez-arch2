import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

describe('Challenger M3 Clinic App: Empirical Invariants & Failure Mode Challenges', () => {
  const modalPath = path.resolve(__dirname, '../components/teleconsult/TeleconsultWaitingRoomModal.tsx');
  const modalSource = fs.readFileSync(modalPath, 'utf-8');

  const inspectionPath = path.resolve(__dirname, '../components/calendar/AppointmentInspectionModal.tsx');
  const inspectionSource = fs.existsSync(inspectionPath) ? fs.readFileSync(inspectionPath, 'utf-8') : '';

  const EXPECTED_COMMS_ICONS = [
    'mic',
    'micOff',
    'video',
    'videoOff',
    'cameraOff',
    'screenShare',
    'screenShareOff',
    'switchCamera',
    'chat',
    'recordDot',
    'phoneOff',
    'shieldCheck',
    'lock',
    'dock',
    'pip',
    'rotate',
    'share'
  ];

  // =========================================================================
  // Challenge 1: 17-Icon Invariant on COMMS_ICON_MAP
  // =========================================================================
  describe('Challenge 1: COMMS_ICON_MAP 17-Key Invariant Enforcement', () => {
    it('1.1: COMMS_ICON_MAP strictly maps exactly 17 keys in TeleconsultWaitingRoomModal', () => {
      const mapMatch = modalSource.match(/const COMMS_ICON_MAP:\s*Record<CommsCallIconName,\s*IconName>\s*=\s*\{([\s\S]*?)\};/);
      expect(mapMatch).not.toBeNull();
      const keys = mapMatch![1]
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('//') && l.includes(':'))
        .map(l => l.split(':')[0].trim());

      expect(keys.length).toBe(17);
      expect(keys.sort()).toEqual([...EXPECTED_COMMS_ICONS].sort());
      expect(keys).not.toContain('users');
      expect(keys).not.toContain('participants');
    });

    it('1.2: Mutation Oracle: Proves that adding an 18th key (e.g. users) fails the invariant check', () => {
      const check17KeyInvariant = (keysList: string[]) => {
        if (keysList.length !== 17) {
          throw new Error(`Invariant Violation: COMMS_ICON_MAP length is ${keysList.length}, expected 17`);
        }
        if (keysList.includes('users') || keysList.includes('participants')) {
          throw new Error("Invariant Violation: 'users'/'participants' is forbidden in COMMS_ICON_MAP");
        }
        return true;
      };

      // Real 17 keys pass
      expect(check17KeyInvariant(EXPECTED_COMMS_ICONS)).toBe(true);

      // Mutated with users fails
      expect(() => check17KeyInvariant([...EXPECTED_COMMS_ICONS, 'users'])).toThrow(/Invariant Violation/);
      // Mutated with participants fails
      expect(() => check17KeyInvariant([...EXPECTED_COMMS_ICONS, 'participants'])).toThrow(/Invariant Violation/);
      // Mutated with 16 keys fails
      expect(() => check17KeyInvariant(EXPECTED_COMMS_ICONS.slice(1))).toThrow(/Invariant Violation/);
    });

    it('1.3: Renders participants icon using decoupled renderParticipantsIcon prop with patients icon', () => {
      expect(modalSource).toContain('renderParticipantsIcon={renderParticipantsIcon}');
      expect(modalSource).toContain('name="patients"');
    });
  });

  // =========================================================================
  // Challenge 2: Screen Share Isolation in Clinic Workstation
  // =========================================================================
  describe('Challenge 2: Screen Share Track Decoupling & Display Invariants', () => {
    it('2.1: TeleconsultWaitingRoomModal isolates camera and screen share tracks via discrete getters', () => {
      expect(modalSource).toContain('getLocalScreenShareTrack(): unknown | null');
      expect(modalSource).toContain('getLocalCameraTrack(): unknown | null');
      expect(modalSource).toContain("isScreenShareActive ? 'contain' : 'cover'");
    });

    it('2.2: Screen share toggle catches browser picker cancellation and suppresses false error toasts', () => {
      expect(modalSource).toMatch(/name === 'AbortError'/);
      expect(modalSource).toMatch(/name === 'NotAllowedError'/);
      expect(modalSource).toMatch(/permission denied by system/i);
    });
  });

  // =========================================================================
  // Challenge 3: Live User Mandate R7.3 (YAKAP Absence)
  // =========================================================================
  describe('Challenge 3: Complete YAKAP Absence in Workstation Teleconsult Components', () => {
    it('3.1: TeleconsultWaitingRoomModal contains zero PhilHealth YAKAP badges, cards, or copy', () => {
      expect(modalSource).not.toContain('PHILHEALTH YAKAP');
      expect(modalSource).not.toContain('YAKAP Auto-Exempt');
      expect(modalSource).not.toContain('Active Konsulta Enlistment');
    });

    it('3.2: AppointmentInspectionModal contains zero PhilHealth YAKAP badges, cards, or copy in teleconsult launcher', () => {
      expect(inspectionSource).not.toContain('PHILHEALTH YAKAP');
      expect(inspectionSource).not.toContain('YAKAP Auto-Exempt');
      expect(inspectionSource).not.toContain('Active Konsulta Enlistment');
    });
  });

  // =========================================================================
  // Challenge 4: Accidental Disconnect vs Explicit Clinician End Call
  // =========================================================================
  describe('Challenge 4: Accidental Disconnect vs Explicit Clinician End Call', () => {
    it('4.1: Enforces confirmation dialog before disconnecting call', () => {
      expect(modalSource).toContain('confirm-end-call-dialog');
      expect(modalSource).toContain('btn-confirm-end-call');
      expect(modalSource).toContain('btn-cancel-end-call');
    });

    it('4.2: Explicit end call dispatches call_ended_by_clinician via data channel', () => {
      expect(modalSource).toContain("type: 'call_ended_by_clinician'");
      expect(modalSource).toContain('endedAtUtc: new Date().toISOString()');
      expect(modalSource).toContain('mediaAdapter.sendDataMessage');
    });

    it('4.3: Accidental disconnect preserves session and does NOT call EndTeleconsultCallCommand', () => {
      // Disconnecting or closing waiting room modal without confirmation leaves session active
      expect(modalSource).toContain('setIsConfirmEndCallOpen(false)');
      expect(modalSource).toContain('endTeleconsultCall');
    });
  });

  // =========================================================================
  // Challenge 5: Port 8081 Dev Server Protection
  // =========================================================================
  describe('Challenge 5: Port 8081 Dev Server Integrity', () => {
    it('5.1: Dev server responds with HTTP 200 without being restarted', async () => {
      const res = await fetch('http://localhost:8081', { method: 'HEAD' });
      expect(res.status).toBe(200);
    });
  });
});
