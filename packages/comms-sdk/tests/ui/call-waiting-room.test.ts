import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';
import { lightColors, createShadows } from '@clinicez/design-tokens';

// Mock react-native for headless test runner using HTML element string primitives
const RNMock = {
  View: 'div',
  Text: 'span',
  TouchableOpacity: 'button',
  TextInput: 'input',
  ScrollView: 'div',
  ActivityIndicator: 'div',
  Modal: (props: any) => (props.visible ? React.createElement('div', { ...props, 'data-modal': 'true' }) : null),
  StyleSheet: {
    create: (styles: any) => styles
  }
};

mock.module('react-native', () => RNMock);

import { CallWaitingRoom as WebCallWaitingRoom } from '../../src/web-ui/CallWaitingRoom';
import { OverlayTooltip as WebOverlayTooltip } from '../../src/web-ui/OverlayTooltip';
import { createHookHarness, act } from '../react/hook-test-harness';

let NativeCallWaitingRoom: any;
let NativeOverlayTooltip: any;
beforeAll(async () => {
  const mod = await import('../../src/native-ui/CallWaitingRoom');
  NativeCallWaitingRoom = mod.CallWaitingRoom;
  const tipMod = await import('../../src/native-ui/OverlayTooltip');
  NativeOverlayTooltip = tipMod.OverlayTooltip;
});

function getTextContent(element: any): string {
  if (!element) return '';
  if (typeof element === 'string') return element;
  if (typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(getTextContent).join(' ');
  if (element.props?.children) return getTextContent(element.props.children);
  return '';
}

function findElement(element: any, predicate: (el: any) => boolean): any {
  if (!element) return null;
  if (predicate(element)) return element;
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  if (element.props?.children) {
    if (Array.isArray(element.props.children)) {
      for (const child of element.props.children) {
        const found = findElement(child, predicate);
        if (found) return found;
      }
    } else {
      return findElement(element.props.children, predicate);
    }
  }
  return null;
}

function findAllElements(element: any, predicate: (el: any) => boolean): any[] {
  const results: any[] = [];
  function search(el: any) {
    if (!el) return;
    if (Array.isArray(el)) {
      el.forEach(search);
      return;
    }
    if (predicate(el)) results.push(el);
    if (el.props?.children) {
      if (Array.isArray(el.props.children)) {
        el.props.children.forEach(search);
      } else {
        search(el.props.children);
      }
    }
  }
  search(element);
  return results;
}

describe('Feature F17: Realignment of CallWaitingRoom (Native & Web)', () => {
  const baseNativeProps = {
    callId: 'call-12345678-1234-1234-1234-123456789abc',
    appointmentId: 'apt-001',
    userRole: 'Clinician' as const,
    patientName: 'Juan Dela Cruz',
    clinicianName: 'Dr. Maria Santos',
    scheduledTime: '10:00 AM',
    paymentPolicy: 'Prepaid' as const,
    paymentStatus: 'Unpaid' as const,
    isReadyToAdmit: false,
    recordingConsentStatus: 'Pending' as const,
    onChangePaymentPolicy: async (_policy: any) => {},
    onStaffPaymentOverride: async (_note: any) => {},
    onEmergencyPaymentOverride: async (_note: any) => {},
    onAdmitPatient: async () => {},
    onEnterCall: () => {},
    onCancelCall: () => {}
  };

  const baseWebProps = {
    ...baseNativeProps
  };

  describe('Tier 1: Standard UI Elements, Policy Selector & YAKAP Badge', () => {
    it('Native UI: renders staff payment policy selector pills (Prepaid, Postpaid, Exempt)', () => {
      const harness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          userRole: 'Clinician'
        })
      );

      const text = getTextContent(harness.result.current);
      expect(text).toContain('Facility Payment Policy');
      expect(text).toContain('Prepaid');
      expect(text).toContain('Postpaid');
      expect(text).toContain('Exempt');
      harness.unmount();
    });

    it('Web UI: renders staff payment policy selector pills (Prepaid, Postpaid, Exempt)', () => {
      const harness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          userRole: 'Staff'
        })
      );

      const text = getTextContent(harness.result.current);
      expect(text).toContain('Facility Payment Policy');
      expect(text).toContain('Prepaid');
      expect(text).toContain('Postpaid');
      expect(text).toContain('Exempt');
      harness.unmount();
    });

    it('Native UI: selecting policy pill triggers onChangePaymentPolicy', async () => {
      let changedPolicy: string | null = null;
      const harness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          onChangePaymentPolicy: async (policy: any) => {
            changedPolicy = policy;
          }
        })
      );

      const buttons = findAllElements(
        harness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Postpaid')
      );
      expect(buttons.length).toBeGreaterThan(0);

      await buttons[0].props.onPress();
      expect(changedPolicy).toBe('Postpaid');
      harness.unmount();
    });

    it('Web UI: selecting policy pill triggers onChangePaymentPolicy', async () => {
      let changedPolicy: string | null = null;
      const harness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          onChangePaymentPolicy: async (policy: any) => {
            changedPolicy = policy;
          }
        })
      );

      const buttons = findAllElements(
        harness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Exempt')
      );
      expect(buttons.length).toBeGreaterThan(0);

      await buttons[0].props.onClick();
      expect(changedPolicy).toBe('Exempt');
      harness.unmount();
    });

    it('Native & Web: renders informational PhilHealth YAKAP Enlisted badge without auto-exemption', () => {
      // Native
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          hasActiveYakapEnlistment: true
        })
      );
      const nativeText = getTextContent(nativeHarness.result.current);
      expect(nativeText).toContain('PHILHEALTH YAKAP');
      expect(nativeText).toContain('Active Konsulta Enlistment');
      nativeHarness.unmount();

      // Web
      const webHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          hasActiveYakapEnlistment: true
        })
      );
      const webText = getTextContent(webHarness.result.current);
      expect(webText).toContain('PHILHEALTH YAKAP');
      expect(webText).toContain('Active Konsulta Enlistment');
      webHarness.unmount();
    });

    it('Native & Web: opens plain-note override modal when override action is clicked', async () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps
        })
      );

      const overrideButtons = findAllElements(
        nativeHarness.result.current,
        (el) =>
          el.type === 'button' &&
          (getTextContent(el).includes('Override') || getTextContent(el).includes('Plain-Note'))
      );
      expect(overrideButtons.length).toBeGreaterThan(0);

      // Trigger modal open
      await act(async () => {
        await overrideButtons[0].props.onPress();
      });
      const textAfterOpen = getTextContent(nativeHarness.result.current);
      expect(textAfterOpen).toContain('Staff Admission Override');
      expect(textAfterOpen).toContain('Minimum 5 characters required');
      nativeHarness.unmount();
    });
  });

  describe('Tier 2: Boundary Conditions, Validation & Role Segregation', () => {
    it('Native UI: validates override note minimum length (>= 5 characters)', async () => {
      let submittedNote: string | null = null;
      const harness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          onStaffPaymentOverride: async (note: any) => {
            submittedNote = note;
          }
        })
      );

      // Open override modal
      const openBtn = findElement(
        harness.result.current,
        (el) =>
          el.type === 'button' &&
          (getTextContent(el).includes('Override') || getTextContent(el).includes('Plain-Note'))
      );
      expect(openBtn).not.toBeNull();
      await openBtn.props.onPress();

      // Find TextInput inside modal
      const textInput = findElement(
        harness.result.current,
        (el) => el.type === 'input'
      );
      expect(textInput).not.toBeNull();

      // 1. Enter < 5 chars: "Urgt"
      await act(() => {
        textInput.props.onChangeText('Urgt');
      });

      let submitBtn = findElement(
        harness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Audit & Admit')
      );
      expect(submitBtn.props.disabled).toBe(true);

      // 2. Enter >= 5 chars: "Urgent emergency visit"
      await act(() => {
        textInput.props.onChangeText('Urgent emergency visit');
      });

      submitBtn = findElement(
        harness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Audit & Admit')
      );
      expect(submitBtn.props.disabled).toBe(false);

      await submitBtn.props.onPress();
      expect(submittedNote).toBe('Urgent emergency visit');
      harness.unmount();
    });

    it('Web UI: validates override note minimum length (>= 5 characters)', async () => {
      let submittedNote: string | null = null;
      const harness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          onStaffPaymentOverride: async (note: any) => {
            submittedNote = note;
          }
        })
      );

      // Open override modal
      const openBtn = findElement(
        harness.result.current,
        (el) =>
          el.type === 'button' &&
          (getTextContent(el).includes('Override') || getTextContent(el).includes('Plain-Note'))
      );
      expect(openBtn).not.toBeNull();
      await openBtn.props.onClick();

      // Find textarea inside modal
      const textarea = findElement(
        harness.result.current,
        (el) => el.type === 'textarea'
      );
      expect(textarea).not.toBeNull();

      // 1. Enter < 5 chars: "sick"
      await act(() => {
        textarea.props.onChange({ target: { value: 'sick' } });
      });

      let submitBtn = findElement(
        harness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Audit & Admit')
      );
      expect(submitBtn.props.disabled).toBe(true);

      // 2. Enter >= 5 chars: "Acute trauma patient"
      await act(() => {
        textarea.props.onChange({ target: { value: 'Acute trauma patient' } });
      });

      submitBtn = findElement(
        harness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Audit & Admit')
      );
      expect(submitBtn.props.disabled).toBe(false);

      // Submit form
      const form = findElement(harness.result.current, (el) => el.type === 'form');
      expect(form).not.toBeNull();
      await form.props.onSubmit({ preventDefault: () => {} });
      expect(submittedNote).toBe('Acute trauma patient');

      harness.unmount();
    });

    it('Role Segregation: Patient role hides policy selector and override button', () => {
      // Native UI as Patient
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          userRole: 'Patient'
        })
      );
      const nativeText = getTextContent(nativeHarness.result.current);
      expect(nativeText).not.toContain('Staff Plain-Note Override');
      expect(nativeText).not.toContain('Facility Payment Policy');

      const policyButtons = findAllElements(
        nativeHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Prepaid')
      );
      expect(policyButtons.length).toBe(0);
      nativeHarness.unmount();

      // Web UI as Patient
      const webHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          userRole: 'Patient'
        })
      );
      const webText = getTextContent(webHarness.result.current);
      expect(webText).not.toContain('Staff Plain-Note Override');
      expect(webText).not.toContain('Facility Payment Policy');
      webHarness.unmount();
    });

    it('Informational Invariant: hasActiveYakapEnlistment=true with Prepaid+Unpaid remains blocked', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          paymentPolicy: 'Prepaid',
          paymentStatus: 'Unpaid',
          hasActiveYakapEnlistment: true,
          isYakapExempt: false
        })
      );

      const text = getTextContent(nativeHarness.result.current);
      expect(text).toContain('PHILHEALTH YAKAP');
      expect(text).toContain('Prepayment Gate: Settlement Required');

      // The admission button should be disabled
      const admitBtn = findElement(
        nativeHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Admit Patient to Call')
      );
      expect(admitBtn).not.toBeNull();
      expect(admitBtn.props.disabled).toBe(true);
      nativeHarness.unmount();
    });

    it('renders error banner when error prop is present', () => {
      const harness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          error: 'Camera device unavailable or permission denied'
        })
      );

      const text = getTextContent(harness.result.current);
      expect(text).toContain('Hardware or Media Connection Error');
      expect(text).toContain('Camera device unavailable or permission denied');
      harness.unmount();
    });

    it('renders loading state when isLoading is true', () => {
      const harness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          isLoading: true
        })
      );

      const text = getTextContent(harness.result.current);
      expect(text).toContain('Staging teleconsultation hardware');
      harness.unmount();
    });
  });

  describe('Tier 3: Cross-Platform Parity', () => {
    it('verifies property and interaction parity across Native and Web implementations', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt'
        })
      );
      const webHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt'
        })
      );

      const nativeText = getTextContent(nativeHarness.result.current);
      const webText = getTextContent(webHarness.result.current);

      expect(nativeText).toContain('Exempt');
      expect(webText).toContain('Exempt');
      expect(nativeText).toContain('Juan Dela Cruz');
      expect(webText).toContain('Juan Dela Cruz');

      nativeHarness.unmount();
      webHarness.unmount();
    });

    it('invokes onAdmitPatient with zero arguments even when click handlers receive a SyntheticEvent', async () => {
      const nativeAdmit = mock(async () => {});
      const webAdmit = mock(async () => {});

      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          onAdmitPatient: nativeAdmit
        })
      );
      const admitBtn = findElement(
        nativeHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Admit Patient')
      );
      expect(admitBtn).not.toBeNull();
      await act(async () => {
        await admitBtn.props.onPress({ nativeEvent: {}, currentTarget: {}, target: {} });
      });
      expect(nativeAdmit).toHaveBeenCalledTimes(1);
      expect(nativeAdmit.mock.calls[0].length).toBe(0);

      const webHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          onAdmitPatient: webAdmit
        })
      );
      const webAdmitBtn = findElement(
        webHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Admit Patient')
      );
      expect(webAdmitBtn).not.toBeNull();
      await act(async () => {
        await webAdmitBtn.props.onClick({ nativeEvent: {}, currentTarget: {}, target: {} });
      });
      expect(webAdmit).toHaveBeenCalledTimes(1);
      expect(webAdmit.mock.calls[0].length).toBe(0);

      nativeHarness.unmount();
      webHarness.unmount();
    });

    it('does not mount dormant override Modal when closed and hides consent card when Disabled', () => {
      const harness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          recordingConsentStatus: 'Disabled',
          renderIcon: (name: string) => React.createElement('span', { 'data-icon': name }, name)
        })
      );
      const tree = harness.result.current;
      const modalNode = findElement(tree, (el) => el.type === RNMock.Modal);
      expect(modalNode).toBeNull();
      expect(getTextContent(tree)).not.toContain('Informed Recording Disclosure');
      const videoIcon = findElement(tree, (el) => el.props?.['data-icon'] === 'video');
      expect(videoIcon).not.toBeNull();
      harness.unmount();
    });
  });

  describe('Tier 4: Milestone 8 Adaptations: Orientation & Link Sharing', () => {
    it('Native & Web: renders orientation toggle button and fires onToggleOrientation', async () => {
      let nativeToggled = false;
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          videoOrientation: 'portrait',
          onToggleOrientation: () => {
            nativeToggled = true;
          }
        })
      );

      const nativeBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-toggle-orientation'
      );
      expect(nativeBtn).not.toBeNull();
      await nativeBtn.props.onPress?.();
      expect(nativeToggled).toBe(true);
      nativeHarness.unmount();

      let webToggled = false;
      const webHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          videoOrientation: 'landscape',
          onToggleOrientation: () => {
            webToggled = true;
          }
        })
      );

      const webBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-toggle-orientation' || el.props?.id === 'btn-toggle-orientation'
      );
      expect(webBtn).not.toBeNull();
      await webBtn.props.onClick?.();
      expect(webToggled).toBe(true);
      webHarness.unmount();
    });

    it('Native & Web: renders patient link card and share button', async () => {
      let nativeShareTriggered = false;
      const inviteUrl = 'https://portal.clinicez.com/teleconsult/join?token=test-123';
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          patientLink: inviteUrl,
          onSharePatientLink: () => {
            nativeShareTriggered = true;
          }
        })
      );

      const nativeShareBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-share-patient-link'
      );
      expect(nativeShareBtn).not.toBeNull();
      await nativeShareBtn.props.onPress?.();
      expect(nativeShareTriggered).toBe(true);

      const nativeText = getTextContent(nativeHarness.result.current);
      expect(nativeText).toContain(inviteUrl);
      nativeHarness.unmount();

      let webShareTriggered = false;
      const webHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          patientLink: inviteUrl,
          onSharePatientLink: () => {
            webShareTriggered = true;
          }
        })
      );

      const webShareBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-share-patient-link' || el.props?.id === 'btn-share-patient-link'
      );
      expect(webShareBtn).not.toBeNull();
      await webShareBtn.props.onClick?.();
      expect(webShareTriggered).toBe(true);

      const webText = getTextContent(webHarness.result.current);
      expect(webText).toContain(inviteUrl);
      webHarness.unmount();
    });

    it('adapts cleared banner labels per facility payment policy and simplifies Call Recording notice', () => {
      for (const [policy, status, expectedTitle] of [
        ['Prepaid', 'Paid', 'Prepaid — Payment Cleared'],
        ['Prepaid', 'Overridden', 'Prepaid — Override Approved'],
        ['Postpaid', 'Unpaid', 'Postpaid — Admission Cleared'],
        ['Exempt', 'Exempt', 'Exempt — Admission Cleared'],
      ] as const) {
        const nativeHarness = createHookHarness(() =>
          NativeCallWaitingRoom({
            ...baseNativeProps,
            paymentPolicy: policy,
            paymentStatus: status,
          })
        );
        const nativeText = getTextContent(nativeHarness.result.current);
        expect(nativeText).toContain(expectedTitle);
        expect(nativeText).toContain('Call Recording');
        expect(nativeText).not.toContain('RA 10173');
        nativeHarness.unmount();

        const webHarness = createHookHarness(() =>
          WebCallWaitingRoom({
            ...baseWebProps,
            paymentPolicy: policy,
            paymentStatus: status,
          })
        );
        const webText = getTextContent(webHarness.result.current);
        expect(webText).toContain(expectedTitle);
        expect(webText).not.toContain('RA 10173');
        webHarness.unmount();
      }
    });

    it('renders Call Recording card with an accessible toggle switch that flips consent on and off', async () => {
      const consentCalls: Array<[boolean, string | undefined]> = [];
      const nativePending = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          recordingConsentStatus: 'Pending',
          onSubmitConsent: async (approved: boolean, reason?: string) => {
            consentCalls.push([approved, reason]);
          },
        })
      );
      const nativeSwitch = findElement(
        nativePending.result.current,
        (el) => el.props?.testID === 'switch-call-recording'
      );
      expect(nativeSwitch).not.toBeNull();
      expect(nativeSwitch.props.accessibilityRole).toBe('switch');
      expect(nativeSwitch.props.accessibilityState).toEqual({ checked: false });
      await nativeSwitch.props.onPress();
      expect(consentCalls[0]).toEqual([true, undefined]);
      nativePending.unmount();

      const webApproved = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          recordingConsentStatus: 'Approved',
          onSubmitConsent: async (approved: boolean, reason?: string) => {
            consentCalls.push([approved, reason]);
          },
        })
      );
      const webSwitch = findElement(
        webApproved.result.current,
        (el) => el.props?.['data-testid'] === 'switch-call-recording'
      );
      expect(webSwitch).not.toBeNull();
      expect(webSwitch.props.role).toBe('switch');
      expect(webSwitch.props['aria-checked']).toBe(true);
      await webSwitch.props.onClick();
      expect(consentCalls[1]).toEqual([false, 'Patient declined recording']);
      webApproved.unmount();
    });

    it('Native & Web: replaces Admit/Enter CTA with persistent in-place Video Server Error + Retry button without header banner', async () => {
      let nativeRetries = 0;
      let nativeAdmits = 0;
      const nativeDocHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          userRole: 'Clinician',
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          videoServerUnavailable: true,
          onAdmitPatient: async () => {
            nativeAdmits += 1;
          },
          onRetryVideoServer: async () => {
            nativeRetries += 1;
          },
        })
      );
      const nativeBanner = findElement(
        nativeDocHarness.result.current,
        (el) => el.props?.testID === 'banner-video-server-unavailable'
      );
      expect(nativeBanner).toBeNull();

      const nativeAdmitBtn = findElement(
        nativeDocHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Admit Patient to Call')
      );
      expect(nativeAdmitBtn).toBeNull();

      const nativeRetryBtn = findElement(
        nativeDocHarness.result.current,
        (el) => el.props?.testID === 'btn-retry-video-server'
      );
      expect(nativeRetryBtn).not.toBeNull();
      expect(getTextContent(nativeRetryBtn)).toContain('Video Server Unavailable');
      expect(getTextContent(nativeRetryBtn)).toContain('Retry');
      await act(async () => {
        await nativeRetryBtn.props.onPress?.();
      });
      expect(nativeRetries).toBe(1);
      expect(nativeAdmits).toBe(0);
      nativeDocHarness.unmount();

      let nativeFallbackEnters = 0;
      const nativePatientHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          userRole: 'Patient',
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          isReadyToAdmit: true,
          videoServerUnavailable: true,
          onEnterCall: () => {
            nativeFallbackEnters += 1;
          },
        })
      );
      const nativeEnterBtn = findElement(
        nativePatientHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Enter Consultation Room')
      );
      expect(nativeEnterBtn).toBeNull();

      const nativePatientRetryBtn = findElement(
        nativePatientHarness.result.current,
        (el) => el.props?.testID === 'btn-retry-video-server'
      );
      expect(nativePatientRetryBtn).not.toBeNull();
      expect(getTextContent(nativePatientRetryBtn)).toContain('Retry');
      await act(async () => {
        await nativePatientRetryBtn.props.onPress?.();
      });
      expect(nativeFallbackEnters).toBe(1);
      nativePatientHarness.unmount();

      let webRetries = 0;
      const webDocHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          userRole: 'Clinician',
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          videoServerUnavailable: true,
          onRetryVideoServer: async () => {
            webRetries += 1;
          },
        })
      );
      const webBanner = findElement(
        webDocHarness.result.current,
        (el) => el.props?.['data-testid'] === 'banner-video-server-unavailable'
      );
      expect(webBanner).toBeNull();

      const webAdmitBtn = findElement(
        webDocHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Admit Patient')
      );
      expect(webAdmitBtn).toBeNull();

      const webRetryBtn = findElement(
        webDocHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-retry-video-server'
      );
      expect(webRetryBtn).not.toBeNull();
      expect(getTextContent(webRetryBtn)).toContain('Video Server Unavailable');
      expect(getTextContent(webRetryBtn)).toContain('Retry');
      await act(async () => {
        await webRetryBtn.props.onClick?.();
      });
      expect(webRetries).toBe(1);
      webDocHarness.unmount();

      let webFallbackEnters = 0;
      const webPatientHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          userRole: 'Patient',
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          isReadyToAdmit: true,
          videoServerUnavailable: true,
          onEnterCall: () => {
            webFallbackEnters += 1;
          },
        })
      );
      const webEnterBtn = findElement(
        webPatientHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Enter Consultation Room')
      );
      expect(webEnterBtn).toBeNull();

      const webPatientRetryBtn = findElement(
        webPatientHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-retry-video-server'
      );
      expect(webPatientRetryBtn).not.toBeNull();
      expect(getTextContent(webPatientRetryBtn)).toContain('Retry');
      await act(async () => {
        await webPatientRetryBtn.props.onClick?.();
      });
      expect(webFallbackEnters).toBe(1);
      webPatientHarness.unmount();
    });

    it('Native & Web: btn-share-patient-link-card uses compact 28x28 sizing, 14px icon, and reveals tooltip label on hover', async () => {
      const inviteUrl = 'https://portal.clinicez.com/teleconsult/join?token=icon-tip-1';
      for (const [isWeb, Component, TooltipComp] of [
        [false, NativeCallWaitingRoom, NativeOverlayTooltip],
        [true, WebCallWaitingRoom, WebOverlayTooltip],
      ] as const) {
        const iconCalls: Array<{ name: string; size?: number }> = [];
        const harness = createHookHarness(() =>
          Component({
            ...(isWeb ? baseWebProps : baseNativeProps),
            patientLink: inviteUrl,
            onSharePatientLink: () => {},
            renderIcon: (name: string, opts?: { size?: number }) => {
              iconCalls.push({ name, size: opts?.size });
              return React.createElement('span', { 'data-icon': name }, name);
            },
          })
        );
        const shareBtn = findElement(harness.result.current, (el) =>
          isWeb
            ? el.props?.['data-testid'] === 'btn-share-patient-link-card'
            : el.props?.testID === 'btn-share-patient-link-card'
        );
        expect(shareBtn).not.toBeNull();
        expect(getTextContent(shareBtn)).not.toContain('Share / Copy');
        if (isWeb) {
          expect(String(shareBtn.props.className)).toContain('h-7 w-7');
        } else {
          expect(shareBtn.props.style).toMatchObject({ width: 28, height: 28 });
          expect(shareBtn.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
        }
        expect(iconCalls).toContainEqual({ name: 'share', size: 14 });

        const tooltipEl = findElement(
          harness.result.current,
          (el) =>
            el.props?.label === 'Copy patient invite link' &&
            Boolean(
              findElement(el.props?.children, (child) =>
                isWeb
                  ? child.props?.['data-testid'] === 'btn-share-patient-link-card'
                  : child.props?.testID === 'btn-share-patient-link-card'
              )
            )
        );
        expect(tooltipEl).not.toBeNull();
        harness.unmount();

        const tipHarness = createHookHarness(() =>
          TooltipComp({
            label: 'Copy patient invite link',
            placement: 'bottom',
            children: React.createElement('button', {}, 'icon'),
          })
        );
        expect(getTextContent(tipHarness.result.current)).not.toContain('Copy patient invite link');

        await act(async () => {
          tipHarness.result.current.props.onMouseEnter();
        });
        expect(getTextContent(tipHarness.result.current)).toContain('Copy patient invite link');
        if (isWeb) {
          const webTip = findElement(
            tipHarness.result.current,
            (el) => el.props?.role === 'tooltip'
          );
          expect(String(webTip?.props?.className)).toContain('z-[999999]');
        } else {
          expect(tipHarness.result.current.props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({ zIndex: 999999 })])
          );
        }

        await act(async () => {
          tipHarness.result.current.props.onMouseLeave();
        });
        expect(getTextContent(tipHarness.result.current)).not.toContain('Copy patient invite link');
        tipHarness.unmount();
      }
    });

    it('Native & Web: buttons, active policy tabs, and cards react dynamically to brand colors and drop shadows', () => {
      const roseColors = {
        ...lightColors,
        primary: '#E11D48',
        primaryDark: '#9F1239',
        primaryLight: '#FFE4E6',
        primarySubtle: '#FFF1F2',
        primaryBorder: '#FECDD3',
        onPrimary: '#FFFFFF',
        primaryShadowSubtle: 'rgba(225, 29, 72, 0.22)',
        primaryShadowSm: 'rgba(225, 29, 72, 0.34)',
        primaryShadowMd: 'rgba(225, 29, 72, 0.46)',
      };
      const nativeShadows = createShadows(roseColors, false);
      const webShadows = createShadows(roseColors, true);

      // 1. Native enabled state: brand fills + shadows on primary CTA, Cancel, and active policy tab
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeProps,
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          isReadyToAdmit: true,
          onAdmitPatient: async () => {},
          colors: roseColors,
          shadows: nativeShadows,
        })
      );
      const nativeAdmit = findElement(
        nativeHarness.result.current,
        (el) => el.props?.accessibilityRole === 'button' && getTextContent(el).includes('Admit Patient')
      );
      expect(nativeAdmit.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            backgroundColor: '#E11D48',
            shadowColor: 'rgba(225, 29, 72, 0.34)',
          }),
        ])
      );

      const nativeCancel = findElement(
        nativeHarness.result.current,
        (el) => el.props?.accessibilityRole === 'button' && getTextContent(el).includes('Cancel / Leave')
      );
      expect(nativeCancel.props.style).toMatchObject({
        backgroundColor: '#FFF1F2',
        borderColor: '#FECDD3',
        shadowColor: 'rgba(225, 29, 72, 0.22)',
      });

      const nativeExemptTab = findElement(
        nativeHarness.result.current,
        (el) => el.props?.accessibilityLabel === 'Set payment policy to Exempt'
      );
      expect(nativeExemptTab.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            backgroundColor: '#E11D48',
            borderColor: '#9F1239',
            shadowColor: 'rgba(225, 29, 72, 0.34)',
          }),
        ])
      );

      const nativePrepaidTab = findElement(
        nativeHarness.result.current,
        (el) => el.props?.accessibilityLabel === 'Set payment policy to Prepaid'
      );
      expect(nativePrepaidTab.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            backgroundColor: 'transparent',
            shadowOpacity: 0,
          }),
        ])
      );

      const nativeClearedBannerTitle = findElement(
        nativeHarness.result.current,
        (el) => el.props?.style && el.props?.children === 'Exempt — Admission Cleared'
      );
      expect(nativeClearedBannerTitle.props.style).toMatchObject({ color: '#9F1239' });
      const nativeClearedBannerCard = findElement(
        nativeHarness.result.current,
        (el) =>
          el.props?.style?.backgroundColor === '#FFF1F2' &&
          el.props?.style?.borderColor === '#FECDD3' &&
          getTextContent(el).includes('Exempt — Admission Cleared')
      );
      expect(nativeClearedBannerCard).not.toBeNull();
      expect(nativeClearedBannerCard.props.style).toMatchObject({
        backgroundColor: '#FFF1F2',
        borderColor: '#FECDD3',
        shadowColor: 'rgba(225, 29, 72, 0.22)',
      });
      nativeHarness.unmount();

      // 2. Web explicit brand theme + disabled CTA drops shadow to 'none'
      const webHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          isReadyToAdmit: true,
          onAdmitPatient: async () => {},
          colors: roseColors,
          shadows: webShadows,
        })
      );
      const webAdmit = findElement(
        webHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Admit Patient')
      );
      expect(webAdmit.props.style).toMatchObject({
        backgroundColor: '#E11D48',
        color: '#FFFFFF',
      });
      expect(String(webAdmit.props.style.boxShadow)).toContain('rgba(225, 29, 72, 0.34)');

      const webCancel = findElement(
        webHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Cancel / Leave')
      );
      expect(webCancel.props.style).toMatchObject({
        backgroundColor: '#FFF1F2',
        borderColor: '#FECDD3',
        color: '#9F1239',
      });
      expect(String(webCancel.props.style.boxShadow)).toContain('rgba(225, 29, 72, 0.22)');

      const webExemptTab = findElement(
        webHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el) === 'Exempt'
      );
      expect(webExemptTab.props.style).toMatchObject({
        backgroundColor: '#E11D48',
        borderColor: '#9F1239',
      });
      expect(String(webExemptTab.props.style.boxShadow)).toContain('rgba(225, 29, 72, 0.34)');

      const webClearedBanner = findElement(
        webHarness.result.current,
        (el) =>
          el.type === 'div' &&
          el.props?.style?.backgroundColor === '#FFF1F2' &&
          getTextContent(el).includes('Exempt — Admission Cleared')
      );
      expect(webClearedBanner).not.toBeNull();
      expect(webClearedBanner.props.style).toMatchObject({
        backgroundColor: '#FFF1F2',
        borderColor: '#FECDD3',
        color: '#9F1239',
      });
      expect(String(webClearedBanner.props.style.boxShadow)).toContain('rgba(225, 29, 72, 0.22)');
      expect(String(webClearedBanner.props.className)).not.toContain('emerald-');
      webHarness.unmount();

      // 3. Web CSS-var default mode (Next.js portal) & disabled CTA shadow removal
      const webDefaultDisabledHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          paymentPolicy: 'Prepaid',
          paymentStatus: 'Unpaid',
          isReadyToAdmit: false,
          onAdmitPatient: async () => {},
        })
      );
      const webDisabledAdmit = findElement(
        webDefaultDisabledHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Admit Patient')
      );
      expect(webDisabledAdmit.props.style.boxShadow).toBe('none');
      const webPrepaidActive = findElement(
        webDefaultDisabledHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el) === 'Prepaid'
      );
      expect(String(webPrepaidActive.props.style.backgroundColor)).toContain('var(--ez-primary');
      expect(String(webPrepaidActive.props.style.boxShadow)).toContain('var(--ez-primary-shadow-sm');
      webDefaultDisabledHarness.unmount();

      // 4. Web CSS-var default mode on Exempt — Admission Cleared notice banner (no static emerald)
      const webDefaultClearedHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebProps,
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          isReadyToAdmit: true,
        })
      );
      const webDefaultClearedBanner = findElement(
        webDefaultClearedHarness.result.current,
        (el) =>
          el.type === 'div' &&
          typeof el.props?.style?.backgroundColor === 'string' &&
          getTextContent(el).includes('Exempt — Admission Cleared')
      );
      expect(String(webDefaultClearedBanner.props.style.backgroundColor)).toContain('var(--ez-primary-subtle');
      expect(String(webDefaultClearedBanner.props.style.borderColor)).toContain('var(--ez-primary-border');
      expect(String(webDefaultClearedBanner.props.style.color)).toContain('var(--ez-primary-dark');
      expect(String(webDefaultClearedBanner.props.style.boxShadow)).toContain('var(--ez-primary-shadow-subtle');
      expect(String(webDefaultClearedBanner.props.className)).not.toContain('emerald-');
      webDefaultClearedHarness.unmount();
    });
  });
});
