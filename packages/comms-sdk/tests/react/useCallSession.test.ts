import { describe, expect, it } from 'bun:test';
import { useCallSession } from '../../src/react/hooks/useCallSession';
import { createHookHarness } from './hook-test-harness';

describe('useCallSession Hook', () => {
  it('manages video call room status, payment gate, and recording consent', async () => {
    const harness = createHookHarness(() => useCallSession('call-session-999'));

    expect(harness.result.current.callId).toBe('call-session-999');
    expect(harness.result.current.roomName).toBe('call-call-session-999');
    expect(harness.result.current.isWaitingRoom).toBe(true);

    // Toggle camera and mic
    await harness.result.current.mediaTracks.toggleMic();
    expect(harness.result.current.mediaTracks.isMicEnabled).toBe(false);

    await harness.result.current.mediaTracks.toggleCamera();
    expect(harness.result.current.mediaTracks.isCameraEnabled).toBe(false);

    // Consent flow: request consent
    await harness.result.current.recordingState.requestRecordingConsent();
    expect(harness.result.current.consentState.status).toBe('requested');

    // Patient approves consent
    await harness.result.current.recordingState.respondToRecordingConsent(true);
    expect(harness.result.current.consentState.status).toBe('approved');
    expect(harness.result.current.recordingState.isRecording).toBe(true);

    // Patient revokes consent: recording stops immediately
    await harness.result.current.recordingState.revokeRecordingConsent('Patient withdrew consent');
    expect(harness.result.current.consentState.status).toBe('revoked');
    expect(harness.result.current.recordingState.isRecording).toBe(false);

    // Doctor admits patient to call
    await harness.result.current.admitPatient();
    expect(harness.result.current.isAdmitted).toBe(true);
    expect(harness.result.current.status).toBe('connected');

    // End call
    await harness.result.current.endCall();
    expect(harness.result.current.status).toBe('ended');
  });
});
