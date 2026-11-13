import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';

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
import { createHookHarness, act } from '../react/hook-test-harness';

let NativeCallWaitingRoom: any;
beforeAll(async () => {
  const mod = await import('../../src/native-ui/CallWaitingRoom');
  NativeCallWaitingRoom = mod.CallWaitingRoom;
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
  });
});
