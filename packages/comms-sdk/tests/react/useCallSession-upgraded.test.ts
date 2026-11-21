import { describe, expect, it } from 'bun:test';
import { useCallSession } from '../../src/react/hooks/useCallSession';
import { createHookHarness, act } from './hook-test-harness';
import { CommsContext, InternalCommsContextValue } from '../../src/react/CommsContext';
import { MockCommsClient } from '../mocks/MockCommsClient';
import { OptimisticStore } from '../../src/react/internal/OptimisticStore';
import { SubscriptionTracker } from '../../src/react/internal/SubscriptionTracker';
import { LocalPreviewMediaAdapter } from '../../src/core/media/LocalPreviewMediaAdapter';
import {
  TeleconsultPaymentPolicy,
  TeleconsultPaymentStatus
} from '../../src/react/types';

describe('Feature F16: Upgraded useCallSession Hook', () => {
  describe('Tier 1: Standard Happy Path & Callback Dispatch', () => {
    it('preserves 100% backward compatibility in zero-argument fallback mode', async () => {
      const harness = createHookHarness(() => useCallSession('call-session-999'));

      expect(harness.result.current.callId).toBe('call-session-999');
      expect(harness.result.current.roomName).toBe('call-call-session-999');
      expect(harness.result.current.isWaitingRoom).toBe(true);
      expect(harness.result.current.isAdmitted).toBe(false);
      expect(harness.result.current.paymentState.policy).toBe('Exempt');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);

      // Admit without args succeeds
      await harness.result.current.admitPatient();
      expect(harness.result.current.isAdmitted).toBe(true);
      expect(harness.result.current.status).toBe('connected');

      // End call succeeds
      await harness.result.current.endCall();
      expect(harness.result.current.status).toBe('ended');
    });

    it('dispatches onUpdatePaymentPolicy callback and updates payment state', async () => {
      let dispatchedPolicy: TeleconsultPaymentPolicy | null = null;
      const harness = createHookHarness(() =>
        useCallSession('call-session-101', {
          onUpdatePaymentPolicy: async (policy) => {
            dispatchedPolicy = policy;
          }
        })
      );

      await harness.result.current.updatePaymentPolicy('Prepaid');
      expect(dispatchedPolicy).toBe('Prepaid');
      expect(harness.result.current.paymentState.policy).toBe('Prepaid');
    });

    it('dispatches onAdmitPatient and onJoinCall callbacks on patient admission', async () => {
      let admitCalled = false;
      let joinCalled = false;
      const harness = createHookHarness(() =>
        useCallSession('call-session-102', {
          onAdmitPatient: async () => {
            admitCalled = true;
          },
          onJoinCall: async () => {
            joinCalled = true;
          }
        })
      );

      await harness.result.current.admitPatient();
      expect(admitCalled).toBe(true);
      expect(joinCalled).toBe(true);
      expect(harness.result.current.isAdmitted).toBe(true);
      expect(harness.result.current.status).toBe('connected');
    });

    it('dispatches onEndCall callback and cleans up call state', async () => {
      let endCalled = false;
      const harness = createHookHarness(() =>
        useCallSession('call-session-103', {
          onEndCall: async () => {
            endCalled = true;
          }
        })
      );

      await harness.result.current.endCall();
      expect(endCalled).toBe(true);
      expect(harness.result.current.status).toBe('ended');
      expect(harness.result.current.recordingState.isRecording).toBe(false);
    });

    it('handles consent approval and unilateral single-party revocation', async () => {
      let revokeReason: string | null = null;
      const harness = createHookHarness(() =>
        useCallSession('call-session-104', {
          onRevokeRecordingConsent: async (reason) => {
            revokeReason = reason || null;
          }
        })
      );

      await harness.result.current.recordingState.requestRecordingConsent();
      expect(harness.result.current.consentState.status).toBe('requested');

      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.consentState.status).toBe('approved');
      expect(harness.result.current.recordingState.isRecording).toBe(true);

      // Unilateral revocation by either party immediately halts recording
      await harness.result.current.recordingState.revokeRecordingConsent('Clinician stopped recording');
      expect(harness.result.current.consentState.status).toBe('revoked');
      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(revokeReason).toBe('Clinician stopped recording');
    });
  });

  describe('Tier 2: Boundary Analysis, Prepayment Lockout & Overrides', () => {
    it('strictly blocks admission when payment is Prepaid and Unpaid without exemption', async () => {
      const harness = createHookHarness(() =>
        useCallSession('call-session-201', {
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Unpaid',
            canAdmit: false,
            isYakapExempt: false
          }
        })
      );

      expect(harness.result.current.paymentState.canAdmit).toBe(false);
      await expect(harness.result.current.admitPatient()).rejects.toThrow(
        /Cannot admit patient: Prepaid consultation is unpaid/
      );
      expect(harness.result.current.isAdmitted).toBe(false);
    });

    it('rejects clinical override with reason note fewer than 5 characters', async () => {
      const harness = createHookHarness(() =>
        useCallSession('call-session-202', {
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Unpaid',
            canAdmit: false,
            isYakapExempt: false
          }
        })
      );

      // < 5 chars: rejected
      await expect(
        harness.result.current.admitPatient({
          reasonCode: 'STAFF-OVERRIDE',
          reasonNote: 'Urgt'
        })
      ).rejects.toThrow(/Override reason note must be at least 5 characters/);
      expect(harness.result.current.isAdmitted).toBe(false);
    });

    it('accepts clinical override with reason note >= 5 characters and unblocks admission', async () => {
      let admittedOverrideNote: string | null = null;
      const harness = createHookHarness(() =>
        useCallSession('call-session-203', {
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Unpaid',
            canAdmit: false,
            isYakapExempt: false
          },
          onAdmitPatient: async (override) => {
            admittedOverrideNote = override?.reasonNote || null;
          }
        })
      );

      await harness.result.current.admitPatient({
        reasonCode: 'STAFF-OVERRIDE',
        reasonNote: 'Acute chest pain emergency override'
      });

      expect(harness.result.current.isAdmitted).toBe(true);
      expect(harness.result.current.paymentState.isEmergencyOverride).toBe(true);
      expect(harness.result.current.paymentState.overrideReason).toBe('Acute chest pain emergency override');
      expect(harness.result.current.paymentState.status).toBe('Overridden');
      expect(admittedOverrideNote).toBe('Acute chest pain emergency override');
    });

    it('unblocks admission when staff updates payment policy from Prepaid to Postpaid or Exempt', async () => {
      const harness = createHookHarness(() =>
        useCallSession('call-session-204', {
          initialPaymentState: {
            policy: 'Prepaid',
            status: 'Unpaid',
            canAdmit: false,
            isYakapExempt: false
          }
        })
      );

      expect(harness.result.current.paymentState.canAdmit).toBe(false);

      // Staff switches policy to Postpaid
      await harness.result.current.updatePaymentPolicy('Postpaid');
      expect(harness.result.current.paymentState.policy).toBe('Postpaid');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);

      // Admission now succeeds without override
      await harness.result.current.admitPatient();
      expect(harness.result.current.isAdmitted).toBe(true);
    });

    it('binds mediaAdapter track toggling and teardown', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true });
      await adapter.connect({ url: 'wss://sfu.internal.mock', token: 'mock-token' });

      const harness = createHookHarness(() =>
        useCallSession('call-session-205', {
          mediaAdapter: adapter
        })
      );

      expect(harness.result.current.mediaAdapter).toBe(adapter);

      await harness.result.current.mediaTracks.toggleMic();
      expect(harness.result.current.mediaTracks.isMicEnabled).toBe(false);

      await harness.result.current.mediaTracks.toggleCamera();
      expect(harness.result.current.mediaTracks.isCameraEnabled).toBe(false);

      await harness.result.current.endCall();
      expect(adapter.isConnected()).toBe(false);
    });

    it('integrates with SignalR CommsContext callPaymentCleared and remote revocation events', async () => {
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
        () =>
          useCallSession('call-session-206', {
            initialPaymentState: {
              policy: 'Prepaid',
              status: 'Unpaid',
              canAdmit: false,
              isYakapExempt: false
            }
          }),
        { contextValues: contextMap }
      );

      expect(harness.result.current.paymentState.status).toBe('Unpaid');
      expect(harness.result.current.paymentState.canAdmit).toBe(false);

      // Simulate SignalR event broadcast: Cashier marks invoice paid
      act(() => {
        mockClient.events.emit('callPaymentCleared', {
          callId: 'call-session-206',
          invoiceId: 'inv-999',
          paymentMethod: 'CashierCounter'
        });
      });

      expect(harness.result.current.paymentState.status).toBe('Paid');
      expect(harness.result.current.paymentState.canAdmit).toBe(true);

      // Start recording then simulate SignalR remote consent revocation
      await harness.result.current.recordingState.respondToRecordingConsent(true);
      expect(harness.result.current.recordingState.isRecording).toBe(true);

      act(() => {
        mockClient.events.emit('recordingConsentLogged', {
          callId: 'call-session-206',
          decision: 'revoked'
        });
      });

      expect(harness.result.current.recordingState.isRecording).toBe(false);
      expect(harness.result.current.consentState.status).toBe('revoked');
    });
  });

  describe('Tier 3: Pairwise Combinatorial Prepayment Gate Matrix (12 combinations)', () => {
    const policies: TeleconsultPaymentPolicy[] = ['Prepaid', 'Postpaid', 'Exempt'];
    const statuses: TeleconsultPaymentStatus[] = ['Unpaid', 'Paid', 'Exempt', 'Overridden'];

    for (const policy of policies) {
      for (const status of statuses) {
        const isPrepaidUnpaid = policy === 'Prepaid' && status === 'Unpaid';
        const expectedBlocked = isPrepaidUnpaid;

        it(`evaluates policy=${policy} x status=${status}: should ${expectedBlocked ? 'BLOCK' : 'ALLOW'} admission`, async () => {
          const harness = createHookHarness(() =>
            useCallSession(`call-matrix-${policy}-${status}`, {
              initialPaymentState: {
                policy,
                status,
                canAdmit: !expectedBlocked,
                isYakapExempt: false
              }
            })
          );

          if (expectedBlocked) {
            expect(harness.result.current.paymentState.canAdmit).toBe(false);
            await expect(harness.result.current.admitPatient()).rejects.toThrow(
              /Cannot admit patient: Prepaid consultation is unpaid/
            );
          } else {
            expect(harness.result.current.paymentState.canAdmit).toBe(true);
            await harness.result.current.admitPatient();
            expect(harness.result.current.isAdmitted).toBe(true);
          }
        });
      }
    }
  });
});
