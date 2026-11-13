import { describe, expect, it, mock, beforeAll } from 'bun:test';
import { useCallSession } from '../src/react/hooks/useCallSession';
import { createHookHarness, act } from './react/hook-test-harness';
import { CommsContext, InternalCommsContextValue } from '../src/react/CommsContext';
import { MockCommsClient } from './mocks/MockCommsClient';
import { OptimisticStore } from '../src/react/internal/OptimisticStore';
import { SubscriptionTracker } from '../src/react/internal/SubscriptionTracker';
import { LocalPreviewMediaAdapter } from '../src/core/media/LocalPreviewMediaAdapter';
import type {
  EmergencyOverrideInput,
  TeleconsultPaymentPolicy,
  TeleconsultPaymentStatus
} from '../src/react/types';

describe('Challenger M4: Adversarial Verification & Stress Harness', () => {
  // =========================================================================
  // Dimension 1: Zero-Arg Fallback Stress & Invariants
  // =========================================================================
  describe('Dimension 1: Zero-Arg Fallback Backward Compatibility & Invariants', () => {
    it('initializes cleanly with useCallSession("call-session-999") without throwing or undefined access', async () => {
      const harness = createHookHarness(() => useCallSession('call-session-999'));

      // 1. Core identifiers & initial status
      expect(harness.result.current.callId).toBe('call-session-999');
      expect(harness.result.current.roomName).toBe('call-call-session-999');
      expect(harness.result.current.status).toBe('in_waiting_room');
      expect(harness.result.current.isWaitingRoom).toBe(true);
      expect(harness.result.current.isAdmitted).toBe(false);
      expect(harness.result.current.isDoctor).toBe(true);
      expect(harness.result.current.isE2eeEnabled).toBe(true);
      expect(harness.result.current.error).toBeNull();

      // 2. Default payment state (Exempt, canAdmit: true)
      expect(harness.result.current.paymentState).toEqual({
        policy: 'Exempt',
        status: 'Exempt',
        canAdmit: true,
        isYakapExempt: true,
        hasActiveYakapEnlistment: false,
        isEmergencyOverride: false,
        overrideReason: undefined
      });

      // 3. Default consent state
      expect(harness.result.current.consentState.status).toBe('none');
      expect(harness.result.current.consentState.consentRequired).toBe(true);
      expect(harness.result.current.consentState.recordingSessionId).toBeNull();
      expect(harness.result.current.consentState.requestedAt).toBeNull();
      expect(harness.result.current.consentState.decidedAt).toBeNull();

      // 4. Default recording state
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.recordingState.recordingDurationSeconds).toBe(0);

      // 5. Default media tracks
      expect(harness.result.current.mediaTracks.isCameraEnabled).toBe(true);
      expect(harness.result.current.mediaTracks.isMicEnabled).toBe(true);
      expect(harness.result.current.mediaTracks.isScreenSharing).toBe(false);

      // 6. Default participants
      expect(harness.result.current.participants.length).toBe(1);
      expect(harness.result.current.participants[0].identity).toBe('staff-current');
      expect(harness.result.current.participants[0].name).toBe('Dr. Clinician');
      expect(harness.result.current.participants[0].isDoctor).toBe(true);

      harness.unmount();
    });

    it('executes all actions cleanly in zero-arg fallback mode without throwing', async () => {
      const harness = createHookHarness(() => useCallSession('call-session-999'));

      // Toggling tracks without mediaAdapter should not throw
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

      await harness.result.current.mediaTracks.switchCamera(); // No-op, should not throw

      // Recording consent lifecycle
      await harness.result.current.recordingState.requestRecordingConsent();
      expect(harness.result.current.consentState.status).toBe('requested');

      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.consentState.status).toBe('approved');
      expect(harness.result.current.recordingState.isRecording).toBe(true);

      await harness.result.current.recordingState.revokeRecordingConsent('Stopped');
      expect(harness.result.current.consentState.status).toBe('revoked');
      expect(harness.result.current.recordingState.isRecording).toBe(false);

      // Admission
      await harness.result.current.admitPatient();
      expect(harness.result.current.isAdmitted).toBe(true);
      expect(harness.result.current.status).toBe('connected');

      // End call
      await harness.result.current.endCall();
      expect(harness.result.current.status).toBe('ended');

      harness.unmount();
    });

    it('handles various call ID formats in zero-arg fallback mode', () => {
      const testIds = [
        'call-session-999',
        'c4a3e75e-881b-4fbf-b6fa-90235b2e6730',
        'call-1234',
        'CUSTOM_CALL_ROOM_ALPHA'
      ];

      for (const id of testIds) {
        const harness = createHookHarness(() => useCallSession(id));
        expect(harness.result.current.callId).toBe(id);
        expect(harness.result.current.roomName).toBe(`call-${id}`);
        harness.unmount();
      }
    });
  });

  // =========================================================================
  // Dimension 2: Plain-Note Override Boundary Analysis
  // =========================================================================
  describe('Dimension 2: Plain-Note Admission Override Boundary Analysis (< 5 fail, >= 5 succeed)', () => {
    // Boundary test matrix: Note inputs with < 5 characters (Strictly MUST FAIL)
    const invalidNotes: Array<{ description: string; note: any }> = [
      { description: 'Empty string', note: '' },
      { description: 'Whitespace only (3 spaces)', note: '   ' },
      { description: 'Whitespace only (tabs and newlines)', note: '\t\n \r' },
      { description: 'Single character', note: 'A' },
      { description: 'Single character with whitespace padding', note: '   A   ' },
      { description: 'Two characters', note: 'OK' },
      { description: 'Three characters', note: 'Doc' },
      { description: 'Four characters', note: 'Urgt' },
      { description: 'Four characters with leading/trailing spaces', note: '   Urgt   ' },
      { description: 'Undefined note', note: undefined },
      { description: 'Null note', note: null }
    ];

    for (const testCase of invalidNotes) {
      it(`REJECTS admission override with ${testCase.description} [note=${JSON.stringify(testCase.note)}]`, async () => {
        let admitCallbackFired = false;
        const harness = createHookHarness(() =>
          useCallSession('call-override-neg', {
            initialPaymentState: {
              policy: 'Prepaid',
              status: 'Unpaid',
              canAdmit: false,
              isYakapExempt: false
            },
            onAdmitPatient: async () => {
              admitCallbackFired = true;
            }
          })
        );

        expect(harness.result.current.paymentState.canAdmit).toBe(false);
        expect(harness.result.current.isAdmitted).toBe(false);

        const overrideInput = {
          reasonCode: 'STAFF-OVERRIDE',
          reasonNote: testCase.note as string
        };

        await expect(harness.result.current.admitPatient(overrideInput)).rejects.toThrow(
          /Override reason note must be at least 5 characters/
        );

        // Verification of state integrity post-rejection
        expect(harness.result.current.isAdmitted).toBe(false);
        expect(harness.result.current.status).toBe('in_waiting_room');
        expect(harness.result.current.paymentState.status).toBe('Unpaid');
        expect(harness.result.current.paymentState.canAdmit).toBe(false);
        expect(harness.result.current.paymentState.isEmergencyOverride).toBe(false);
        expect(admitCallbackFired).toBe(false);

        harness.unmount();
      });
    }

    // Boundary test matrix: Note inputs with >= 5 characters (Strictly MUST SUCCEED)
    const validNotes: Array<{ description: string; note: string; expectedOverride: string }> = [
      {
        description: 'Exactly 5 characters ("12345")',
        note: '12345',
        expectedOverride: '12345'
      },
      {
        description: 'Exactly 5 characters with whitespace padding ("  12345  ")',
        note: '  12345  ',
        expectedOverride: '  12345  '
      },
      {
        description: 'Exactly 5 characters with spaces ("a b c")',
        note: 'a b c',
        expectedOverride: 'a b c'
      },
      {
        description: '6 characters ("Urgent")',
        note: 'Urgent',
        expectedOverride: 'Urgent'
      },
      {
        description: 'Statutory emergency clinical rationale (> 30 chars)',
        note: 'STAFF-OVERRIDE: Urgent triage for acute respiratory distress',
        expectedOverride: 'STAFF-OVERRIDE: Urgent triage for acute respiratory distress'
      },
      {
        description: 'Filipino clinical dialect note',
        note: 'Buntis 9 na buwan masakit ang tiyan',
        expectedOverride: 'Buntis 9 na buwan masakit ang tiyan'
      },
      {
        description: 'Multiline note with newlines',
        note: 'Line 1: Severe fever\nLine 2: Doctor approved',
        expectedOverride: 'Line 1: Severe fever\nLine 2: Doctor approved'
      }
    ];

    for (const testCase of validNotes) {
      it(`ACCEPTS admission override with ${testCase.description}`, async () => {
        let recordedOverride: EmergencyOverrideInput | undefined;
        let joinCallFired = false;

        const harness = createHookHarness(() =>
          useCallSession('call-override-pos', {
            initialPaymentState: {
              policy: 'Prepaid',
              status: 'Unpaid',
              canAdmit: false,
              isYakapExempt: false
            },
            onAdmitPatient: async (override) => {
              recordedOverride = override;
            },
            onJoinCall: async () => {
              joinCallFired = true;
            }
          })
        );

        expect(harness.result.current.paymentState.canAdmit).toBe(false);

        await harness.result.current.admitPatient({
          reasonCode: 'STAFF-OVERRIDE',
          reasonNote: testCase.note
        });

        // Verification of state mutations post-admission
        expect(harness.result.current.isAdmitted).toBe(true);
        expect(harness.result.current.status).toBe('connected');
        expect(harness.result.current.paymentState.status).toBe('Overridden');
        expect(harness.result.current.paymentState.canAdmit).toBe(true);
        expect(harness.result.current.paymentState.isEmergencyOverride).toBe(true);
        expect(harness.result.current.paymentState.overrideReason).toBe(testCase.note);

        // Verification of callbacks
        expect(recordedOverride).toBeDefined();
        expect(recordedOverride?.reasonNote).toBe(testCase.note);
        expect(joinCallFired).toBe(true);

        harness.unmount();
      });
    }

    it('strictly blocks admission when Prepaid + Unpaid and NO override is provided', async () => {
      const harness = createHookHarness(() =>
        useCallSession('call-no-override', {
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Unpaid',
            canAdmit: false,
            isYakapExempt: false
          }
        })
      );

      await expect(harness.result.current.admitPatient()).rejects.toThrow(
        /Cannot admit patient: Prepaid consultation is unpaid/
      );
      expect(harness.result.current.isAdmitted).toBe(false);
      expect(harness.result.current.status).toBe('in_waiting_room');

      harness.unmount();
    });

    it('preserves override state and does not revert to unpaid if called multiple times', async () => {
      const harness = createHookHarness(() =>
        useCallSession('call-idempotent-override', {
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Unpaid',
            canAdmit: false,
            isYakapExempt: false
          }
        })
      );

      // First override
      await harness.result.current.admitPatient({
        reasonCode: 'STAFF-OVERRIDE',
        reasonNote: 'Severe dyspnea override'
      });
      expect(harness.result.current.isAdmitted).toBe(true);
      expect(harness.result.current.paymentState.status).toBe('Overridden');

      // Subsequent admission call should succeed smoothly
      await harness.result.current.admitPatient();
      expect(harness.result.current.isAdmitted).toBe(true);
      expect(harness.result.current.paymentState.status).toBe('Overridden');

      harness.unmount();
    });
  });

  // =========================================================================
  // Dimension 3: Prepayment Policy Switching Stress
  // =========================================================================
  describe('Dimension 3: Prepayment Policy Switching Stress & State Transitions', () => {
    it('executes full policy switching transitions: Prepaid -> Postpaid -> Exempt -> Prepaid', async () => {
      const policyAuditLog: TeleconsultPaymentPolicy[] = [];

      const harness = createHookHarness(() =>
        useCallSession('call-switch-stress', {
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Unpaid',
            canAdmit: false,
            isYakapExempt: false
          },
          onUpdatePaymentPolicy: async (p) => {
            policyAuditLog.push(p);
          }
        })
      );

      // Step 1: Initial state is Prepaid + Unpaid (Blocked)
      expect(harness.result.current.paymentState.policy).toBe('Prepaid');
      expect(harness.result.current.paymentState.status).toBe('Unpaid');
      expect(harness.result.current.paymentState.canAdmit).toBe(false);
      await expect(harness.result.current.admitPatient()).rejects.toThrow(
        /Cannot admit patient: Prepaid consultation is unpaid/
      );

      // Step 2: Switch to Postpaid (Admission unblocked)
      await harness.result.current.updatePaymentPolicy('Postpaid');
      expect(harness.result.current.paymentState.policy).toBe('Postpaid');
      expect(harness.result.current.paymentState.status).toBe('Unpaid');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);
      expect(policyAuditLog).toEqual(['Postpaid']);

      // Step 3: Switch to Exempt (Admission remains unblocked, status becomes Exempt)
      await harness.result.current.updatePaymentPolicy('Exempt');
      expect(harness.result.current.paymentState.policy).toBe('Exempt');
      expect(harness.result.current.paymentState.status).toBe('Exempt');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);
      expect(policyAuditLog).toEqual(['Postpaid', 'Exempt']);

      // Step 4: Switch back to Prepaid (Admission strictly re-blocked!)
      await harness.result.current.updatePaymentPolicy('Prepaid');
      expect(harness.result.current.paymentState.policy).toBe('Prepaid');
      expect(harness.result.current.paymentState.status).toBe('Unpaid');
      expect(harness.result.current.paymentState.canAdmit).toBe(false);
      expect(policyAuditLog).toEqual(['Postpaid', 'Exempt', 'Prepaid']);

      // Admission must fail again now that it is Prepaid and unpaid
      await expect(harness.result.current.admitPatient()).rejects.toThrow(
        /Cannot admit patient: Prepaid consultation is unpaid/
      );

      // Step 5: Switch back to Postpaid and successfully admit
      await harness.result.current.updatePaymentPolicy('Postpaid');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);
      await harness.result.current.admitPatient();
      expect(harness.result.current.isAdmitted).toBe(true);
      expect(harness.result.current.status).toBe('connected');

      harness.unmount();
    });

    it('preserves Paid status across policy changes', async () => {
      const harness = createHookHarness(() =>
        useCallSession('call-paid-switch', {
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Paid',
            canAdmit: true,
            isYakapExempt: false
          }
        })
      );

      expect(harness.result.current.paymentState.status).toBe('Paid');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);

      // Switch to Postpaid
      await harness.result.current.updatePaymentPolicy('Postpaid');
      expect(harness.result.current.paymentState.policy).toBe('Postpaid');
      expect(harness.result.current.paymentState.status).toBe('Paid');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);

      // Switch back to Prepaid: status is still Paid, so canAdmit remains TRUE
      await harness.result.current.updatePaymentPolicy('Prepaid');
      expect(harness.result.current.paymentState.policy).toBe('Prepaid');
      expect(harness.result.current.paymentState.status).toBe('Paid');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);

      // Can admit without issues
      await harness.result.current.admitPatient();
      expect(harness.result.current.isAdmitted).toBe(true);

      harness.unmount();
    });

    it('stress test: 50 sequential rapid policy switches execute without race condition or corruption', async () => {
      const harness = createHookHarness(() =>
        useCallSession('call-rapid-switch', {
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Unpaid',
            canAdmit: false,
            isYakapExempt: false
          }
        })
      );

      const targetPolicies: TeleconsultPaymentPolicy[] = ['Postpaid', 'Exempt', 'Prepaid'];

      for (let i = 0; i < 50; i++) {
        const nextPolicy = targetPolicies[i % targetPolicies.length];
        await harness.result.current.updatePaymentPolicy(nextPolicy);
        expect(harness.result.current.paymentState.policy).toBe(nextPolicy);

        if (nextPolicy === 'Prepaid') {
          expect(harness.result.current.paymentState.canAdmit).toBe(false);
        } else {
          expect(harness.result.current.paymentState.canAdmit).toBe(true);
        }
      }

      harness.unmount();
    });

    it('aborts state update if onUpdatePaymentPolicy callback throws an error', async () => {
      const harness = createHookHarness(() =>
        useCallSession('call-failed-switch', {
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Unpaid',
            canAdmit: false,
            isYakapExempt: false
          },
          onUpdatePaymentPolicy: async () => {
            throw new Error('Network error: Facility policy update rejected');
          }
        })
      );

      await expect(harness.result.current.updatePaymentPolicy('Postpaid')).rejects.toThrow(
        /Network error: Facility policy update rejected/
      );

      // Local state should NOT have been mutated
      expect(harness.result.current.paymentState.policy).toBe('Prepaid');
      expect(harness.result.current.paymentState.canAdmit).toBe(false);

      harness.unmount();
    });
  });

  // =========================================================================
  // Dimension 4: Single-Party Recording Stop Mechanics
  // =========================================================================
  describe('Dimension 4: Single-Party Recording Stop & Consent Mechanics', () => {
    it('immediately halts recording and sets status="revoked" upon revokeRecordingConsent()', async () => {
      let revokedReasonLogged: string | undefined;

      const harness = createHookHarness(() =>
        useCallSession('call-recording-stop', {
          onRevokeRecordingConsent: async (reason) => {
            revokedReasonLogged = reason;
          }
        })
      );

      // Step 1: Initial state
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.consentState.status).toBe('none');

      // Step 2: Request consent
      await harness.result.current.recordingState.requestRecordingConsent();
      expect(harness.result.current.consentState.status).toBe('requested');

      // Step 3: Approve consent -> recording starts
      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.consentState.status).toBe('approved');
      expect(harness.result.current.recordingState.isRecording).toBe(true);

      // Step 4: Unilateral revocation by either party
      await harness.result.current.recordingState.revokeRecordingConsent('Clinician clicked Stop Recording');

      // Step 5: Verification of immediate stop invariants
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.consentState.status).toBe('revoked');
      expect(harness.result.current.consentState.rejectionReason).toBe('Clinician clicked Stop Recording');
      expect(revokedReasonLogged).toBe('Clinician clicked Stop Recording');

      harness.unmount();
    });

    it('resets recording duration timer to 0 immediately when recording stops', async () => {
      const harness = createHookHarness(() => useCallSession('call-timer-reset'));

      // Start recording
      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.recordingState.isRecording).toBe(true);

      // Stop recording
      await harness.result.current.recordingState.revokeRecordingConsent('Single party stopped');
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.recordingState.recordingDurationSeconds).toBe(0);

      harness.unmount();
    });

    it('enforces stop recording when endCall() is invoked during an active recording session', async () => {
      let revokedReason: string | undefined;
      let endCallCalled = false;

      const harness = createHookHarness(() =>
        useCallSession('call-end-recording', {
          onRevokeRecordingConsent: async (reason) => {
            revokedReason = reason;
          },
          onEndCall: async () => {
            endCallCalled = true;
          }
        })
      );

      // Start recording
      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.recordingState.isRecording).toBe(true);

      // End call
      await harness.result.current.endCall();

      // Both recording revocation and call ending must be enforced
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.status).toBe('ended');
      expect(revokedReason).toBe('Call ended');
      expect(endCallCalled).toBe(true);

      harness.unmount();
    });

    it('handles remote SignalR revocation event from peer device', async () => {
      const mockClient = new MockCommsClient();
      const mockStore = new OptimisticStore();
      const mockTracker = new SubscriptionTracker();

      const mockContextValue: InternalCommsContextValue = {
        client: mockClient,
        store: mockStore,
        subscriptionTracker: mockTracker,
        connectionState: 'Connected',
        conversations: [],
        activeConversation: null,
        unreadCount: 0,
        triageQueue: [],
        connect: async () => {},
        disconnect: async () => {},
        reconnect: async () => {}
      };

      const contextMap = new Map<any, any>();
      contextMap.set(CommsContext, mockContextValue);

      const harness = createHookHarness(
        () => useCallSession('call-signalr-stop'),
        { contextValues: contextMap }
      );

      // Clinician starts recording locally
      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.recordingState.isRecording).toBe(true);
      expect(harness.result.current.consentState.status).toBe('approved');

      // Patient on remote device clicks "Stop Recording" -> SignalR event arrives
      act(() => {
        mockClient.events.emit('recordingConsentLogged', {
          callId: 'call-signalr-stop',
          decision: 'revoked',
          loggedAtUtc: new Date().toISOString()
        });
      });

      // Local session must immediately halt recording
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.consentState.status).toBe('revoked');

      harness.unmount();
    });

    it('allows re-requesting and re-approving consent after prior revocation', async () => {
      const harness = createHookHarness(() => useCallSession('call-reconsent'));

      // Cycle 1: Start and stop
      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.recordingState.isRecording).toBe(true);

      await harness.result.current.recordingState.revokeRecordingConsent('Stop 1');
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.consentState.status).toBe('revoked');

      // Cycle 2: Patient agrees again
      await harness.result.current.recordingState.requestRecordingConsent();
      expect(harness.result.current.consentState.status).toBe('requested');

      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.recordingState.isRecording).toBe(true);
      expect(harness.result.current.consentState.status).toBe('approved');

      // Stop 2
      await harness.result.current.recordingState.revokeRecordingConsent('Stop 2');
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.consentState.status).toBe('revoked');

      harness.unmount();
    });
  });

  // =========================================================================
  // Dimension 5: Remote Participant & Media Adapter Synchronization
  // =========================================================================
  describe('Dimension 5: MediaAdapter & Multi-Party Synchronization', () => {
    it('dynamically tracks participant join/leave events from MediaAdapter', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true });
      await adapter.connect({ url: 'wss://sfu.internal.mock', token: 'mock-token' });

      const harness = createHookHarness(() =>
        useCallSession('call-multi-party', {
          mediaAdapter: adapter,
          participantIdentity: 'staff-dr-smith',
          participantName: 'Dr. John Smith'
        })
      );

      expect(harness.result.current.participants.length).toBe(1);
      expect(harness.result.current.participants[0].identity).toBe('staff-dr-smith');

      // Participant joins
      act(() => {
        adapter.addMockParticipant({
          identity: 'patient-maria-clara',
          name: 'Maria Clara',
          isVideoEnabled: true,
          isAudioEnabled: true
        });
      });

      expect(harness.result.current.participants.length).toBe(2);
      expect(harness.result.current.participants.some((p) => p.identity === 'patient-maria-clara')).toBe(true);

      // Duplicate join should be ignored idempotently
      act(() => {
        adapter.emit('participantJoined', {
          identity: 'patient-maria-clara',
          name: 'Maria Clara'
        });
      });
      expect(harness.result.current.participants.length).toBe(2);

      // Another participant joins
      act(() => {
        adapter.addMockParticipant({
          identity: 'guest-interpreter',
          name: 'Medical Interpreter',
          isVideoEnabled: false,
          isAudioEnabled: true
        });
      });
      expect(harness.result.current.participants.length).toBe(3);

      // Participant leaves
      act(() => {
        adapter.removeMockParticipant('guest-interpreter');
      });
      expect(harness.result.current.participants.length).toBe(2);
      expect(harness.result.current.participants.some((p) => p.identity === 'guest-interpreter')).toBe(false);

      // Disconnect on endCall
      await harness.result.current.endCall();
      expect(adapter.isConnected()).toBe(false);

      harness.unmount();
    });
  });
});
