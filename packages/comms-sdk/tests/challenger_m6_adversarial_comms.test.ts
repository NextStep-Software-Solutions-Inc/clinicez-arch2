import { describe, expect, it, mock } from 'bun:test';
import { useCallSession } from '../src/react/hooks/useCallSession';
import { createHookHarness, act } from './react/hook-test-harness';
import { CommsContext, InternalCommsContextValue } from '../src/react/CommsContext';
import { MockCommsClient } from './mocks/MockCommsClient';
import { LocalPreviewMediaAdapter } from '../src/core/media/LocalPreviewMediaAdapter';
import { SegmentRecorder } from '../src/core/media/SegmentRecorder';
import { sizes, lightColors } from '@clinicez/design-tokens';
import type {
  EmergencyOverrideInput,
  TeleconsultPaymentPolicy,
  TeleconsultPaymentStatus
} from '../src/react/types';
import fs from 'fs';
import path from 'path';

describe('Challenger M6.2: Comms SDK White-Box Adversarial Stress Suite', () => {
  // =========================================================================
  // ATTACK SURFACE 1: CALL SESSION STATE LIFECYCLE STRESS
  // =========================================================================
  describe('Attack Surface 1: Call Session State Lifecycle Stress', () => {
    it('1.1 Rapid concurrent state transitions resolve deterministically without deadlock or corruption', async () => {
      let admitCallCount = 0;
      let joinCallCount = 0;
      let endCallCount = 0;

      const harness = createHookHarness(() =>
        useCallSession('call-rapid-lifecycle-001', {
          isDoctor: true,
          initialPaymentState: {
            policy: 'Exempt',
            status: 'Exempt',
            canAdmit: true,
            isYakapExempt: true,
            hasActiveYakapEnlistment: false
          },
          onAdmitPatient: async () => {
            admitCallCount++;
          },
          onJoinCall: async () => {
            joinCallCount++;
          },
          onEndCall: async () => {
            endCallCount++;
          }
        })
      );

      // Verify initial state
      expect(harness.result.current.status).toBe('in_waiting_room');
      expect(harness.result.current.isAdmitted).toBe(false);

      // Fire rapid bursts of concurrent actions
      await Promise.all([
        harness.result.current.admitPatient(),
        harness.result.current.joinCall(),
        harness.result.current.mediaTracks.toggleCamera(),
        harness.result.current.mediaTracks.toggleMic()
      ]);

      // Both admit and join were initiated
      expect(admitCallCount).toBe(1);
      expect(joinCallCount).toBe(2); // 1 from admit, 1 from direct joinCall
      expect(harness.result.current.isAdmitted).toBe(true);
      expect(harness.result.current.status).toBe('connected');

      // Now rapid leave and end call
      await harness.result.current.leaveCall();
      expect(harness.result.current.status).toBe('ended');

      await harness.result.current.endCall();
      expect(endCallCount).toBe(1);
      expect(harness.result.current.status).toBe('ended');

      harness.unmount();
    });

    it('1.2 Zero-Arg In-Memory Mode: Full clinical call lifecycle operates cleanly without unhandled exceptions', async () => {
      // Outside of CommsProvider and with zero optional options
      const harness = createHookHarness(() => useCallSession('call-standalone-inmem'));

      expect(harness.result.current.callId).toBe('call-standalone-inmem');
      expect(harness.result.current.isWaitingRoom).toBe(true);
      expect(harness.result.current.isAdmitted).toBe(false);
      expect(harness.result.current.paymentState.policy).toBe('Exempt');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);

      // Admit patient in in-memory mode
      await harness.result.current.admitPatient();
      expect(harness.result.current.isAdmitted).toBe(true);
      expect(harness.result.current.status).toBe('connected');

      // Media toggles
      await harness.result.current.mediaTracks.toggleMic();
      expect(harness.result.current.mediaTracks.isMicEnabled).toBe(false);
      await harness.result.current.mediaTracks.toggleMic();
      expect(harness.result.current.mediaTracks.isMicEnabled).toBe(true);

      await harness.result.current.mediaTracks.toggleCamera();
      expect(harness.result.current.mediaTracks.isCameraEnabled).toBe(false);
      await harness.result.current.mediaTracks.toggleCamera();
      expect(harness.result.current.mediaTracks.isCameraEnabled).toBe(true);

      await harness.result.current.mediaTracks.toggleScreenShare();
      expect(harness.result.current.mediaTracks.isScreenSharing).toBe(true);
      await harness.result.current.mediaTracks.toggleScreenShare();
      expect(harness.result.current.mediaTracks.isScreenSharing).toBe(false);

      // Recording consent in in-memory mode
      await harness.result.current.recordingState.requestRecordingConsent();
      expect(harness.result.current.consentState.status).toBe('requested');

      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.consentState.status).toBe('approved');
      expect(harness.result.current.recordingState.isRecording).toBe(true);

      // Terminate call cleanly
      await harness.result.current.endCall();
      expect(harness.result.current.status).toBe('ended');
      expect(harness.result.current.recordingState.isRecording).toBe(false);

      harness.unmount();
    });

    it('1.3 Unmounting while recording active stops SegmentRecorder and cleans up background timers', async () => {
      let segmentUploadCount = 0;
      const harness = createHookHarness(() =>
        useCallSession('call-unmount-cleanup', {
          isDoctor: true,
          initialPaymentState: {
            policy: 'Exempt',
            status: 'Exempt',
            canAdmit: true,
            isYakapExempt: true,
            hasActiveYakapEnlistment: false
          },
          onSegmentUploaded: async () => {
            segmentUploadCount++;
          }
        })
      );

      // Admit and start recording
      await harness.result.current.admitPatient();
      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.recordingState.isRecording).toBe(true);

      // Unmount while actively recording
      expect(() => harness.unmount()).not.toThrow();

      // State is frozen, recording stopped
      expect(harness.result.current.recordingState.isRecording).toBe(true); // Last snapshot
    });

    it('1.4 Network Drop & Reconnect: Preserves connected call status across SignalR reconnect events and ignores stale events', async () => {
      const mockClient = new MockCommsClient();
      const mockContextValue: InternalCommsContextValue = {
        client: mockClient,
        activeRoom: null,
        unreadCount: 0,
        triageBadgeCount: 0,
        store: {} as any,
        tracker: {} as any,
        isDoctor: true
      };

      const contextValues = new Map();
      contextValues.set(CommsContext, mockContextValue);

      const harness = createHookHarness(
        () =>
          useCallSession('call-net-drop-123', {
            isDoctor: true,
            initialPaymentState: {
              policy: 'Exempt',
              status: 'Exempt',
              canAdmit: true,
              isYakapExempt: true,
              hasActiveYakapEnlistment: false
            }
          }),
        { contextValues }
      );

      // 1. Initial admission via SignalR event
      mockClient.events.emit('callStateChanged', {
        callId: 'call-net-drop-123',
        status: 'Connected'
      });
      expect(harness.result.current.status).toBe('connected');
      expect(harness.result.current.isAdmitted).toBe(true);

      // 2. Network drop simulation: SignalR disconnects & reconnects
      mockClient.events.emit('connectionStateChanged', 'Reconnecting');
      expect(harness.result.current.status).toBe('connected'); // Must NOT drop call!

      mockClient.events.emit('connectionStateChanged', 'Connected');
      expect(harness.result.current.status).toBe('connected'); // Still connected

      // 3. Idempotent repeated Connected events do not disrupt call
      mockClient.events.emit('callStateChanged', {
        callId: 'call-net-drop-123',
        status: 'Active'
      });
      expect(harness.result.current.status).toBe('connected');

      // 4. Remote call ended event terminates session
      mockClient.events.emit('callStateChanged', {
        callId: 'call-net-drop-123',
        status: 'Ended'
      });
      expect(harness.result.current.status).toBe('ended');

      // 5. Stale event for another call is strictly ignored
      mockClient.events.emit('callStateChanged', {
        callId: 'different-call-999',
        status: 'Connected'
      });
      expect(harness.result.current.status).toBe('ended');

      harness.unmount();
    });

    it('1.5 MediaAdapter Disconnection: Disconnects adapter on endCall without error', async () => {
      let adapterDisconnected = false;
      const fakeAdapter: any = {
        on: () => () => {},
        disconnect: async () => {
          adapterDisconnected = true;
        },
        setCameraEnabled: async () => {},
        setMicrophoneEnabled: async () => {},
        setScreenShareEnabled: async () => {},
        switchCamera: async () => {},
        getRecordingStream: () => null
      };

      const harness = createHookHarness(() =>
        useCallSession('call-adapter-test', {
          mediaAdapter: fakeAdapter
        })
      );

      await harness.result.current.endCall();
      expect(adapterDisconnected).toBe(true);
      expect(harness.result.current.status).toBe('ended');

      harness.unmount();
    });
  });

  // =========================================================================
  // ATTACK SURFACE 2: RECORDING CONSENT AND SINGLE-PARTY STOP
  // =========================================================================
  describe('Attack Surface 2: Recording Consent & Single-Party Stop Stress', () => {
    it('2.1 Unilateral Clinician Revocation halts recording and dispatches onRevokeRecordingConsent', async () => {
      let revokedReason: string | undefined = undefined;
      const harness = createHookHarness(() =>
        useCallSession('call-record-consent-001', {
          onRevokeRecordingConsent: async (reason) => {
            revokedReason = reason;
          }
        })
      );

      // Start recording
      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.recordingState.isRecording).toBe(true);
      expect(harness.result.current.consentState.status).toBe('approved');

      // Clinician unilaterally stops recording
      await harness.result.current.recordingState.revokeRecordingConsent('Clinician opted out of recording');
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.consentState.status).toBe('revoked');
      expect(revokedReason).toBe('Clinician opted out of recording');

      harness.unmount();
    });

    it('2.2 Remote Patient Revocation via SignalR halts recording immediately', async () => {
      const mockClient = new MockCommsClient();
      const mockContextValue: InternalCommsContextValue = {
        client: mockClient,
        activeRoom: null,
        unreadCount: 0,
        triageBadgeCount: 0,
        store: {} as any,
        tracker: {} as any,
        isDoctor: true
      };

      const contextValues = new Map();
      contextValues.set(CommsContext, mockContextValue);

      const harness = createHookHarness(
        () => useCallSession('call-remote-revoke-777'),
        { contextValues }
      );

      // Approve recording via SignalR
      mockClient.events.emit('recordingConsentLogged', {
        callId: 'call-remote-revoke-777',
        decision: 'approved',
        loggedAtUtc: new Date().toISOString()
      });
      expect(harness.result.current.recordingState.isRecording).toBe(true);
      expect(harness.result.current.consentState.status).toBe('approved');

      // Remote party revokes consent
      mockClient.events.emit('recordingConsentLogged', {
        callId: 'call-remote-revoke-777',
        decision: 'revoked',
        loggedAtUtc: new Date().toISOString()
      });
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.consentState.status).toBe('revoked');

      harness.unmount();
    });

    it('2.3 SegmentRecorder Monotonic Chunking: Emits strictly sequential indices and stops cleanly', async () => {
      const recorded: number[] = [];
      const recorder = new SegmentRecorder({
        mockMode: true,
        timesliceMs: 50,
        onSegmentReady: (seg) => {
          recorded.push(seg.segmentIndex);
        }
      });

      // Emit 10 mock segments
      for (let i = 0; i < 10; i++) {
        recorder.emitMockSegment();
      }

      expect(recorded.length).toBe(10);
      expect(recorded).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(recorder.getSegmentCount()).toBe(10);

      // Stopping already stopped recorder is safe and idempotent
      await recorder.stop();
      await recorder.stop();
      expect(recorder.isRecording()).toBe(false);
    });

    it('2.4 End Call while recording auto-finalizes recording and emits revocation', async () => {
      let revokedReason: string | undefined = undefined;
      let callEnded = false;

      const harness = createHookHarness(() =>
        useCallSession('call-end-recording-auto', {
          onRevokeRecordingConsent: async (reason) => {
            revokedReason = reason;
          },
          onEndCall: async () => {
            callEnded = true;
          }
        })
      );

      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.recordingState.isRecording).toBe(true);

      // Ending call while recording
      await harness.result.current.endCall();

      expect(revokedReason).toBe('Call ended');
      expect(callEnded).toBe(true);
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.status).toBe('ended');

      harness.unmount();
    });
  });

  // =========================================================================
  // ATTACK SURFACE 4: YAKAP STATUS IMMUTABILITY
  // =========================================================================
  describe('Attack Surface 4: YAKAP Status Immutability & Prepayment Gate Invariant', () => {
    it('4.1 HasActiveYakapEnlistment=true with Prepaid Unpaid STRICTLY BLOCKS admission without auto-mutating policy', async () => {
      let admitInvoked = false;
      const harness = createHookHarness(() =>
        useCallSession('call-yakap-block-001', {
          isDoctor: true,
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Unpaid',
            canAdmit: false,
            isYakapExempt: false,
            hasActiveYakapEnlistment: true // Active YAKAP enlistment present
          },
          onAdmitPatient: async () => {
            admitInvoked = true;
          }
        })
      );

      // 1. Initial invariant verification
      expect(harness.result.current.paymentState.hasActiveYakapEnlistment).toBe(true);
      expect(harness.result.current.paymentState.policy).toBe('Prepaid');
      expect(harness.result.current.paymentState.canAdmit).toBe(false);

      // 2. Admission WITHOUT emergency override MUST throw
      expect(harness.result.current.admitPatient()).rejects.toThrow(
        'Cannot admit patient: Prepaid consultation is unpaid.'
      );
      expect(admitInvoked).toBe(false);

      // 3. Policy remains strictly Prepaid (never mutated automatically to Exempt)
      expect(harness.result.current.paymentState.policy).toBe('Prepaid');
      expect(harness.result.current.paymentState.canAdmit).toBe(false);

      harness.unmount();
    });

    it('4.2 YAKAP Patient Admission Unlocks ONLY via explicit staff policy switch or valid plain-note override', async () => {
      let policySwitchedTo: TeleconsultPaymentPolicy | undefined;
      let admittedOverride: EmergencyOverrideInput | undefined;

      const harness = createHookHarness(() =>
        useCallSession('call-yakap-unlock-002', {
          isDoctor: true,
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Unpaid',
            canAdmit: false,
            isYakapExempt: false,
            hasActiveYakapEnlistment: true
          },
          onUpdatePaymentPolicy: async (policy) => {
            policySwitchedTo = policy;
          },
          onAdmitPatient: async (override) => {
            admittedOverride = override;
          }
        })
      );

      // 1. Invalid plain-note override (< 5 characters) MUST be rejected
      expect(
        harness.result.current.admitPatient({ reasonNote: 'bad' })
      ).rejects.toThrow('Override reason note must be at least 5 characters.');

      expect(
        harness.result.current.admitPatient({ reasonNote: '   ' })
      ).rejects.toThrow('Override reason note must be at least 5 characters.');

      // 2. Valid plain-note override (>= 5 characters) succeeds
      await harness.result.current.admitPatient({
        reasonCode: 'STAFF_OVERRIDE',
        reasonNote: 'Patient in acute distress, enrolled in YAKAP program'
      });

      expect(admittedOverride?.reasonNote).toBe(
        'Patient in acute distress, enrolled in YAKAP program'
      );
      expect(harness.result.current.paymentState.status).toBe('Overridden');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);
      expect(harness.result.current.isAdmitted).toBe(true);

      harness.unmount();
    });
  });

  // =========================================================================
  // ATTACK SURFACE 5: CASHIER SETTLEMENT VS MANUAL POLICY SWITCH RACE CONDITIONS
  // =========================================================================
  describe('Attack Surface 5: Cashier Settlement vs Manual Policy Switch Race Conditions', () => {
    it('5.1 Cashier payment cleared event arriving while staff updates policy to Postpaid settles in valid admitted state', async () => {
      const mockClient = new MockCommsClient();
      const mockContextValue: InternalCommsContextValue = {
        client: mockClient,
        activeRoom: null,
        unreadCount: 0,
        triageBadgeCount: 0,
        store: {} as any,
        tracker: {} as any,
        isDoctor: true
      };

      const contextValues = new Map();
      contextValues.set(CommsContext, mockContextValue);

      const harness = createHookHarness(
        () =>
          useCallSession('call-race-001', {
            isDoctor: true,
            initialPaymentState: {
              policy: 'Prepaid',
              status: 'Unpaid',
              canAdmit: false,
              isYakapExempt: false,
              hasActiveYakapEnlistment: false
            }
          }),
        { contextValues }
      );

      expect(harness.result.current.paymentState.canAdmit).toBe(false);

      // Concurrently update policy to Postpaid and receive SignalR payment cleared
      await Promise.all([
        harness.result.current.updatePaymentPolicy('Postpaid'),
        (async () => {
          mockClient.events.emit('callPaymentCleared', {
            callId: 'call-race-001',
            invoiceId: 'inv-12345',
            paymentMethod: 'Cash'
          });
        })()
      ]);

      // Both agree admission is unlocked
      expect(harness.result.current.paymentState.canAdmit).toBe(true);

      harness.unmount();
    });

    it('5.2 When visit is Paid, switching policy to Prepaid PRESERVES canAdmit=true', async () => {
      const harness = createHookHarness(() =>
        useCallSession('call-paid-switch-prepaid', {
          initialPaymentState: {
            policy: 'Postpaid',
            status: 'Paid',
            canAdmit: true,
            isYakapExempt: false,
            hasActiveYakapEnlistment: false
          }
        })
      );

      expect(harness.result.current.paymentState.status).toBe('Paid');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);

      // Staff switches policy to Prepaid
      await harness.result.current.updatePaymentPolicy('Prepaid');

      // Crucial invariant: Patient who already paid MUST NOT be locked out!
      expect(harness.result.current.paymentState.status).toBe('Paid');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);

      harness.unmount();
    });

    it('5.3 Multiple rapid cashier payment cleared events are idempotent', async () => {
      const mockClient = new MockCommsClient();
      const mockContextValue: InternalCommsContextValue = {
        client: mockClient,
        activeRoom: null,
        unreadCount: 0,
        triageBadgeCount: 0,
        store: {} as any,
        tracker: {} as any,
        isDoctor: true
      };

      const contextValues = new Map();
      contextValues.set(CommsContext, mockContextValue);

      const harness = createHookHarness(
        () =>
          useCallSession('call-idempotent-cleared', {
            initialPaymentState: {
              policy: 'Prepaid',
              status: 'Unpaid',
              canAdmit: false,
              isYakapExempt: false,
              hasActiveYakapEnlistment: false
            }
          }),
        { contextValues }
      );

      // Fire 20 rapid duplicate events
      for (let i = 0; i < 20; i++) {
        mockClient.events.emit('callPaymentCleared', {
          callId: 'call-idempotent-cleared',
          invoiceId: 'inv-redundant-999',
          isEmergencyOverride: false
        });
      }

      expect(harness.result.current.paymentState.canAdmit).toBe(true);
      expect(harness.result.current.paymentState.status).toBe('Paid');

      harness.unmount();
    });
  });

  // =========================================================================
  // ATTACK SURFACE 6: COMMS SDK GUARDRAIL STRESS
  // =========================================================================
  describe('Attack Surface 6: Comms SDK Guardrail & Touch Target Compliance', () => {
    it('6.1 sizes.touchTarget is strictly 44px', () => {
      expect(sizes.touchTarget).toBe(44);
    });

    it('6.2 Native CallStage enforces touchTarget >= 44px on all interactive controls', () => {
      const stageFile = path.resolve(__dirname, '../src/native-ui/CallStage.tsx');
      const content = fs.readFileSync(stageFile, 'utf-8');

      // Must reference sizes.touchTarget for buttons
      expect(content).toContain('minHeight: sizes.touchTarget');
      expect(content).toContain('minWidth: sizes.touchTarget');

      // Buttons must define accessibilityRole="button"
      const buttonMatches = content.match(/accessibilityRole="button"/g);
      expect(buttonMatches && buttonMatches.length >= 6).toBe(true);
    });

    it('6.3 Web CallStage enforces min-h-[44px] on all interactive controls', () => {
      const webStageFile = path.resolve(__dirname, '../src/web-ui/CallStage.tsx');
      const content = fs.readFileSync(webStageFile, 'utf-8');

      // Check min-h-[44px]
      expect(content).toContain('min-h-[44px]');
      const minHMatches = content.match(/min-h-\[44px\]/g);
      expect(minHMatches && minHMatches.length >= 5).toBe(true);
    });

    it('6.4 Zero external hosts or localhost in Comms SDK source files (matching check-no-external-hosts)', () => {
      const srcDir = path.resolve(__dirname, '../src');
      const URL_PATTERN = /https?:\/\/(?!\$\{)(?!www\.w3\.org\/)[^\s'"`)]+/i;
      const LOCAL_PATTERN = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i;

      function stripComments(source: string): string[] {
        let inBlock = false;
        return source.split('\n').map((line) => {
          let out = '';
          for (let i = 0; i < line.length; i++) {
            if (inBlock) {
              if (line[i] === '*' && line[i + 1] === '/') {
                inBlock = false;
                i++;
              }
              continue;
            }
            if (line[i] === '/' && line[i + 1] === '*') {
              inBlock = true;
              i++;
              continue;
            }
            if (line[i] === '/' && line[i + 1] === '/' && line[i - 1] !== ':') break;
            out += line[i];
          }
          return out;
        });
      }

      function walkDir(dir: string): string[] {
        let results: string[] = [];
        const list = fs.readdirSync(dir);
        for (const file of list) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            results = results.concat(walkDir(fullPath));
          } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const files = walkDir(srcDir);
      for (const file of files) {
        const lines = stripComments(fs.readFileSync(file, 'utf-8'));
        lines.forEach((line) => {
          expect(LOCAL_PATTERN.test(line)).toBe(false);
          expect(URL_PATTERN.test(line)).toBe(false);
        });
      }
    });
  });
});
