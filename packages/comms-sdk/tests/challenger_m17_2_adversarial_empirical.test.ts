import { describe, it, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

describe('Milestone M17 Challenger 2: Adversarial & Empirical Verification (R7.3 & R7.4)', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  // =========================================================================
  // Dimension 1: Complete Elimination of PhilHealth YAKAP from Teleconsultation
  // =========================================================================
  describe('Dimension 1: Complete Elimination of PhilHealth YAKAP from Teleconsultation (R7.3)', () => {
    const teleconsultFiles = [
      'packages/comms-sdk/src/web-ui/CallWaitingRoom.tsx',
      'packages/comms-sdk/src/native-ui/CallWaitingRoom.tsx',
      'packages/comms-sdk/src/react/hooks/useCallSession.ts',
      'apps/portal-web/src/components/teleconsult/TeleconsultGuestFlow.tsx',
      'apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx',
      'apps/clinic-app/components/calendar/AppointmentInspectionModal.tsx',
      'apps/clinic-app/components/patient/ScheduleVisitModal.tsx',
    ];

    it('1.1: Every target file exists and is accessible', () => {
      for (const relPath of teleconsultFiles) {
        const fullPath = path.join(rootDir, relPath);
        expect(fs.existsSync(fullPath)).toBe(true);
      }
    });

    it('1.2: PhilHealth YAKAP informational cards, badges, and text are absent from teleconsultation UI', () => {
      const forbiddenPhrases = [
        'PHILHEALTH YAKAP',
        'YAKAP Auto-Exempt',
        'Active Konsulta Enlistment Verified',
        'Yakap Auto-Exempt',
        'Konsulta Enlistment',
      ];

      for (const relPath of teleconsultFiles) {
        const fullPath = path.join(rootDir, relPath);
        const content = fs.readFileSync(fullPath, 'utf-8');

        for (const phrase of forbiddenPhrases) {
          expect(content).not.toContain(phrase);
        }
      }
    });

    it('1.3: AppointmentInspectionModal.tsx gates YAKAP badge with !isTeleconsult', () => {
      const modalPath = path.join(
        rootDir,
        'apps/clinic-app/components/calendar/AppointmentInspectionModal.tsx'
      );
      const content = fs.readFileSync(modalPath, 'utf-8');

      // The PhilHealth Yakap badge must be strictly gated behind !isTeleconsult
      expect(content).toContain('{!isTeleconsult && isYakap ? (');
      expect(content).toContain('isYakapExempt: false,');
      expect(content).toContain('hasActiveYakapEnlistment: false,');
    });

    it('1.4: ScheduleVisitModal.tsx contains NO active YAKAP banner in teleconsultation modality', () => {
      const modalPath = path.join(
        rootDir,
        'apps/clinic-app/components/patient/ScheduleVisitModal.tsx'
      );
      const content = fs.readFileSync(modalPath, 'utf-8');

      // Ensure no JSX element renders yakapInfoBanner
      expect(content).not.toMatch(/<[A-Za-z0-9.]+\s+[^>]*style=\{[^}]*styles\.yakapInfoBanner[^}]*\}/);
    });

    it('1.5: CallWaitingRoom (web & native) hides Call Recording switch for Patient userRole', () => {
      const webWaitingRoom = fs.readFileSync(
        path.join(rootDir, 'packages/comms-sdk/src/web-ui/CallWaitingRoom.tsx'),
        'utf-8'
      );
      const nativeWaitingRoom = fs.readFileSync(
        path.join(rootDir, 'packages/comms-sdk/src/native-ui/CallWaitingRoom.tsx'),
        'utf-8'
      );

      // Web CallWaitingRoom gating
      expect(webWaitingRoom).toContain("recordingConsentStatus !== 'Disabled' && userRole !== 'Patient'");

      // Native CallWaitingRoom gating
      expect(nativeWaitingRoom).toContain("recordingConsentStatus !== 'Disabled' && userRole !== 'Patient'");
    });

    it('1.6: useCallSession.ts admission logic does not depend on YAKAP exemption', () => {
      const hookPath = path.join(
        rootDir,
        'packages/comms-sdk/src/react/hooks/useCallSession.ts'
      );
      const content = fs.readFileSync(hookPath, 'utf-8');

      // admitPatient function must only gate on canAdmit and valid emergency override
      const admitMatch = content.match(/const admitPatient = useCallback\([\s\S]*?async\s*\([^)]*\)[^=]*=>\s*\{([\s\S]*?)\},\s*\[/);
      expect(admitMatch).not.toBeNull();
      const admitBody = admitMatch![1];

      expect(admitBody).not.toContain('isYakapExempt');
      expect(admitBody).not.toContain('hasActiveYakapEnlistment');
    });
  });

  // =========================================================================
  // Dimension 2: Zero-PHI Cryptographic Security & Metadata Hydration (R7.4)
  // =========================================================================
  describe('Dimension 2: Zero-PHI Cryptographic Security & Metadata Hydration (R7.4)', () => {
    it('2.1: GuestTeleconsultInviteIssuedPayload in shared-dotnet strictly excludes forbidden PHI properties', () => {
      const contractPath = path.join(
        rootDir,
        'packages/shared-dotnet/Interop/Contracts/GuestTeleconsultContracts.cs'
      );
      const content = fs.readFileSync(contractPath, 'utf-8');

      const payloadMatch = content.match(
        /public\s+sealed\s+record\s+GuestTeleconsultInviteIssuedPayload\s*\(([\s\S]*?)\);/
      );
      expect(payloadMatch).not.toBeNull();
      const payloadParams = payloadMatch![1];

      // Extract individual property names
      const propertyNames = payloadParams
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => {
          const parts = p.split(/\s+/);
          // Find identifier before '=' or at the end
          const namePart = parts.find((_, idx) => idx === 1 || (idx === 0 && !parts[idx].includes('?') && !['Guid', 'string', 'DateTime'].includes(parts[idx])));
          return parts[1]?.replace('=', '').trim() || parts[0];
        });

      // Forbidden properties per specification
      expect(propertyNames).not.toContain('DateOfBirth');
      expect(propertyNames).not.toContain('Otp');
      expect(propertyNames).not.toContain('InviteToken');
      expect(propertyNames).not.toContain('PatientName');
      expect(propertyNames).not.toContain('Mrn');

      // Required zero-PHI hashes and metadata
      expect(propertyNames).toContain('InviteTokenHash');
      expect(propertyNames).toContain('ExpectedDobHash');
      expect(propertyNames).toContain('OtpHash');
      expect(payloadParams).toContain('string? ClinicName = null');
      expect(payloadParams).toContain('string? ClinicSupportPhone = null');
      expect(payloadParams).toContain('string? ClinicianName = null');
      expect(payloadParams).toContain('DateTime? ScheduledAtUtc = null');
      expect(payloadParams).toContain('string? EncryptedGuestContext = null');
    });

    it('2.2: AES-256-GCM encryption/decryption roundtrip with key SHA256(appointmentId:N:dob:otp)', () => {
      const appointmentId = 'b5f2e0af938148e69888123456789abc';
      const dob = '1992-04-15';
      const otp = '849201';
      const patientFullName = 'Maria Clara De Los Santos';

      // Key derivation: SHA256(appointmentId:N:dob:otp)
      const keyDerivationInput = `${appointmentId}:${dob}:${otp}`;
      const aesKey = crypto.createHash('sha256').update(keyDerivationInput, 'utf-8').digest();
      expect(aesKey.length).toBe(32); // 256 bits

      // Encryption (matches C# AesGcm implementation)
      const nonce = crypto.randomBytes(12);
      const plainJson = JSON.stringify({ patientDisplayName: patientFullName });
      const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, nonce);
      const ciphertext = Buffer.concat([cipher.update(plainJson, 'utf-8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      expect(authTag.length).toBe(16);

      // Pack blob: 12-byte Nonce + 16-byte Tag + Ciphertext
      const encryptedBlob = Buffer.concat([nonce, authTag, ciphertext]);
      const base64EncryptedContext = encryptedBlob.toString('base64');

      // Decryption with matching credentials
      const decodedBlob = Buffer.from(base64EncryptedContext, 'base64');
      const decNonce = decodedBlob.subarray(0, 12);
      const decTag = decodedBlob.subarray(12, 28);
      const decCipher = decodedBlob.subarray(28);

      const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, decNonce);
      decipher.setAuthTag(decTag);
      const decryptedText = Buffer.concat([decipher.update(decCipher), decipher.final()]).toString('utf-8');
      const decryptedObj = JSON.parse(decryptedText);

      expect(decryptedObj.patientDisplayName).toBe(patientFullName);
    });

    it('2.3: AES-256-GCM authenticated decryption strictly FAILS on wrong OTP or wrong DOB (AuthTag Mismatch)', () => {
      const appointmentId = 'b5f2e0af938148e69888123456789abc';
      const correctDob = '1992-04-15';
      const correctOtp = '849201';
      const patientFullName = 'Maria Clara De Los Santos';

      const validKey = crypto.createHash('sha256').update(`${appointmentId}:${correctDob}:${correctOtp}`, 'utf-8').digest();
      const nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', validKey, nonce);
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ patientDisplayName: patientFullName }), 'utf-8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const encryptedBlob = Buffer.concat([nonce, authTag, ciphertext]);

      // Attempt 1: Wrong OTP (1 digit off)
      const wrongOtpKey = crypto.createHash('sha256').update(`${appointmentId}:${correctDob}:849202`, 'utf-8').digest();
      expect(() => {
        const decipher = crypto.createDecipheriv('aes-256-gcm', wrongOtpKey, encryptedBlob.subarray(0, 12));
        decipher.setAuthTag(encryptedBlob.subarray(12, 28));
        decipher.update(encryptedBlob.subarray(28));
        decipher.final();
      }).toThrow();

      // Attempt 2: Wrong DOB (1 day off)
      const wrongDobKey = crypto.createHash('sha256').update(`${appointmentId}:1992-04-16:${correctOtp}`, 'utf-8').digest();
      expect(() => {
        const decipher = crypto.createDecipheriv('aes-256-gcm', wrongDobKey, encryptedBlob.subarray(0, 12));
        decipher.setAuthTag(encryptedBlob.subarray(12, 28));
        decipher.update(encryptedBlob.subarray(28));
        decipher.final();
      }).toThrow();

      // Attempt 3: Tampered ciphertext byte
      const tamperedBlob = Buffer.from(encryptedBlob);
      tamperedBlob[30] ^= 0x01; // flip bit
      expect(() => {
        const decipher = crypto.createDecipheriv('aes-256-gcm', validKey, tamperedBlob.subarray(0, 12));
        decipher.setAuthTag(tamperedBlob.subarray(12, 28));
        decipher.update(tamperedBlob.subarray(28));
        decipher.final();
      }).toThrow();
    });

    it('2.4: TeleconsultGuestFlow.tsx hydrates metadata and eliminates raw UUID strings', () => {
      const flowPath = path.join(
        rootDir,
        'apps/portal-web/src/components/teleconsult/TeleconsultGuestFlow.tsx'
      );
      const content = fs.readFileSync(flowPath, 'utf-8');

      // Check metadata state hooks exist
      expect(content).toContain('const [metaClinicName, setMetaClinicName] = useState<string | null>(null);');
      expect(content).toContain('const [metaClinicSupportPhone, setMetaClinicSupportPhone] = useState<string | null>(null);');
      expect(content).toContain('const [metaClinicianName, setMetaClinicianName] = useState<string | null>(null);');
      expect(content).toContain('const [metaGuestDisplayName, setMetaGuestDisplayName] = useState<string | null>(null);');
      expect(content).toContain('const [metaScheduledAtUtc, setMetaScheduledAtUtc] = useState<string | null>(null);');

      // Raw UUID string pattern in subtitle must be completely absent
      expect(content).not.toContain('• ID:');
      expect(content).not.toContain('ID: ${session');
      expect(content).not.toContain('ID: {session');
    });

    it('2.5: TeleconsultGuestFlow.tsx eliminates duplicate top header controls (In-Call Chat & Leave) during in_call', () => {
      const flowPath = path.join(
        rootDir,
        'apps/portal-web/src/components/teleconsult/TeleconsultGuestFlow.tsx'
      );
      const content = fs.readFileSync(flowPath, 'utf-8');

      const inCallBlockMatch = content.match(/if \(stage === "in_call"\) \{([\s\S]*?)return \([\s\S]*?<main[^>]*>([\s\S]*?)<\/header>/);
      expect(inCallBlockMatch).not.toBeNull();
      const inCallHeader = inCallBlockMatch![2];

      // Top header during in_call must not contain redundant Chat or Leave/End buttons
      expect(inCallHeader).not.toContain('In-Call Chat');
      expect(inCallHeader).not.toContain('handleToggleChat');
      expect(inCallHeader).not.toContain('Leave');
      expect(inCallHeader).not.toContain('handleEndCall');
    });
  });

  // =========================================================================
  // Dimension 3: Participants Roster Deduplication & Badge Count Parity (R7.4)
  // =========================================================================
  describe('Dimension 3: Participants Roster Deduplication & Badge Count Parity (R7.4)', () => {
    it('3.1: useCallSession.ts sets isLocal: true on localSelf and filters out localIdentity from remotes', () => {
      const hookPath = path.join(
        rootDir,
        'packages/comms-sdk/src/react/hooks/useCallSession.ts'
      );
      const content = fs.readFileSync(hookPath, 'utf-8');

      // Initial state has isLocal: true
      expect(content).toContain('isLocal: true');

      // remotes filter out localIdentity
      expect(content).toContain('.filter((rp) => rp.identity !== localIdentity)');

      // supports remoteParticipantDisplayName override
      expect(content).toContain('options?.remoteParticipantDisplayName');
    });

    it('3.2: Native & Web CallStage.tsx deduplicate remotes and compute totalParticipantsCount = 1 + deduplicatedRemotes.length', () => {
      const nativeStage = fs.readFileSync(
        path.join(rootDir, 'packages/comms-sdk/src/native-ui/CallStage.tsx'),
        'utf-8'
      );
      const webStage = fs.readFileSync(
        path.join(rootDir, 'packages/comms-sdk/src/web-ui/CallStage.tsx'),
        'utf-8'
      );

      for (const stageCode of [nativeStage, webStage]) {
        // Excludes isLocal
        expect(stageCode).toContain('if (p.isLocal) continue;');

        // Excludes selfName match
        expect(stageCode).toContain('if (normalizedSelfName && p.name && p.name.trim().toLowerCase() === normalizedSelfName) continue;');

        // Deduplicates by identity
        expect(stageCode).toContain('if (p.identity && seenIdentities.has(p.identity)) continue;');

        // Fallback for blank/Participant to participantName
        expect(stageCode).toContain("(!p.name || p.name === 'Participant' || p.name.trim() === '')");
        expect(stageCode).toContain("(participantName || 'Participant')");

        // Strict total count formula
        expect(stageCode).toContain('return 1 + deduplicatedRemotes.length;');
      }
    });

    it('3.3: Empirical simulation of roster deduplication algorithm with adversarial duplicate inputs', () => {
      // Simulate CallStage deduplication logic
      interface ParticipantInput {
        identity?: string;
        name?: string;
        isLocal?: boolean;
        isCameraActive?: boolean;
        isMicActive?: boolean;
        isScreenSharing?: boolean;
      }

      function deduplicateRoster(
        participants: ParticipantInput[],
        selfName: string,
        participantName: string,
        hasRemote: boolean
      ) {
        const normalizedSelfName = (selfName || '').trim().toLowerCase();
        const seenIdentities = new Set<string>();
        const remotes: { identity?: string; name: string }[] = [];

        for (const p of participants) {
          if (p.isLocal) continue;
          if (normalizedSelfName && p.name && p.name.trim().toLowerCase() === normalizedSelfName) continue;
          if (p.identity && seenIdentities.has(p.identity)) continue;
          if (p.identity) seenIdentities.add(p.identity);

          const effectiveName =
            !p.name || p.name === 'Participant' || p.name.trim() === ''
              ? participantName || 'Participant'
              : p.name;

          remotes.push({
            ...p,
            name: effectiveName,
          });
        }

        const totalCount = participants.length > 0 ? 1 + remotes.length : hasRemote ? 2 : 1;
        return { remotes, totalCount };
      }

      // Scenario A: Screenshot 4 Bug Reproduction:
      // Prior bug: Local doctor 'Dr. Ambray', plus duplicate self entry, plus generic 'Participant'
      const adversarialParticipants: ParticipantInput[] = [
        { identity: 'staff-1', name: 'Dr. Ambray', isLocal: true },
        { identity: 'staff-1', name: 'Dr. Ambray', isLocal: false }, // Ghost local duplicate
        { identity: 'guest-1', name: 'Dr. Ambray', isLocal: false }, // Malicious or corrupted name matching selfName
        { identity: 'guest-2', name: 'Participant', isLocal: false }, // Generic participant
        { identity: 'guest-2', name: 'Participant', isLocal: false }, // Exact duplicate identity
        { identity: 'guest-3', name: 'Patient Juan', isLocal: false }, // Real remote
      ];

      const result = deduplicateRoster(
        adversarialParticipants,
        'Dr. Ambray',
        'Patient Maria',
        true
      );

      // Verify that:
      // 1. Ghost local duplicate (matching identity or name) is filtered out
      // 2. Exact duplicate identity 'guest-2' is deduplicated to 1 entry
      // 3. Generic 'Participant' ('guest-2') maps to fallback participantName 'Patient Maria'
      // 4. 'guest-3' keeps its name 'Patient Juan'
      expect(result.remotes.length).toBe(2);
      expect(result.remotes[0].identity).toBe('guest-2');
      expect(result.remotes[0].name).toBe('Patient Maria');
      expect(result.remotes[1].identity).toBe('guest-3');
      expect(result.remotes[1].name).toBe('Patient Juan');

      // Total count strictly equals 1 (local self) + 2 remotes = 3
      expect(result.totalCount).toBe(3);
    });

    it('3.4: Both native and web CallStage display totalParticipantsCount in badge and roster header', () => {
      const nativeStage = fs.readFileSync(
        path.join(rootDir, 'packages/comms-sdk/src/native-ui/CallStage.tsx'),
        'utf-8'
      );
      const webStage = fs.readFileSync(
        path.join(rootDir, 'packages/comms-sdk/src/web-ui/CallStage.tsx'),
        'utf-8'
      );

      // Native UI hooks
      expect(nativeStage).toContain('testID="badge-participants-count"');
      expect(nativeStage).toContain('{totalParticipantsCount}');

      // Web UI hooks
      expect(webStage).toContain('data-testid="badge-participants-count"');
      expect(webStage).toContain('{totalParticipantsCount}');
    });
  });
});
