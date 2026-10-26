import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';

// Mock react-native before importing native-ui to bypass Flow syntax in node_modules/react-native
mock.module('react-native', () => ({
  View: (props: any) => React.createElement('div', { ...props, 'data-rn': 'View' }),
  Text: (props: any) => React.createElement('span', { ...props, 'data-rn': 'Text' }),
  TouchableOpacity: (props: any) => React.createElement('button', { ...props, 'data-rn': 'TouchableOpacity', onClick: props.onPress }),
  TextInput: (props: any) => React.createElement('input', { ...props, 'data-rn': 'TextInput' }),
  ScrollView: (props: any) => React.createElement('div', { ...props, 'data-rn': 'ScrollView' }),
  ActivityIndicator: (props: any) => React.createElement('div', { ...props, 'data-rn': 'ActivityIndicator' }),
  StyleSheet: {
    create: (styles: any) => styles
  }
}));

import { MessageThread as WebMessageThread } from '../../src/web-ui/MessageThread';
let NativeMessageThread: any;

beforeAll(async () => {
  const mod = await import('../../src/native-ui/MessageThread');
  NativeMessageThread = mod.MessageThread;
});
import { ThreadMessage } from '../../src/web-ui/types';
import { createHookHarness, act } from '../react/hook-test-harness';

function findAllElements(element: any, predicate: (el: any) => boolean): any[] {
  const results: any[] = [];
  function search(el: any) {
    if (!el) return;
    if (Array.isArray(el)) {
      el.forEach(search);
      return;
    }
    if (predicate(el)) results.push(el);
    if (el.props && el.props.children) {
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

function findElement(element: any, predicate: (el: any) => boolean): any {
  if (!element) return null;
  if (Array.isArray(element)) {
    for (const item of element) {
      const found = findElement(item, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(element)) return element;
  if (element.props && element.props.children) {
    return findElement(element.props.children, predicate);
  }
  return null;
}

const sampleMessages: ThreadMessage[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-100',
    senderId: 'patient-42',
    senderDisplayName: 'Juan Dela Cruz',
    senderType: 'Patient',
    visibility: 'Public',
    contentText: 'Patient diagnosed with Stage 2 Hypertension. Experiencing severe headaches.',
    requiresAcknowledgement: false,
    isAcknowledged: false,
    state: 'Received',
    clientSentAtUtc: '2026-10-27T08:00:00Z',
    attachments: [
      {
        fileKey: 'att-1',
        fileName: 'Biopsy_Positive_Malignant.pdf',
        contentType: 'application/pdf',
        fileSizeBytes: 204800
      }
    ]
  },
  {
    id: 'msg-2',
    conversationId: 'conv-100',
    senderId: 'doctor-01',
    senderDisplayName: 'Dr. Maria Santos',
    senderType: 'Staff',
    visibility: 'Public',
    contentText: 'Prescribing Amlodipine 10mg once daily. Please monitor morning blood pressure.',
    requiresAcknowledgement: true,
    isAcknowledged: false,
    state: 'Received',
    clientSentAtUtc: '2026-10-27T08:05:00Z'
  },
  {
    id: 'msg-3',
    conversationId: 'conv-100',
    senderId: 'doctor-01',
    senderDisplayName: 'Dr. Maria Santos',
    senderType: 'Staff',
    visibility: 'Internal',
    contentText: 'INTERNAL NOTE: Patient has poor medication adherence and family history of stroke.',
    requiresAcknowledgement: false,
    isAcknowledged: false,
    state: 'Received',
    clientSentAtUtc: '2026-10-27T08:06:00Z'
  }
];

describe('Adversarial Stress Test: Privacy Mode (PHI Obscure) & Peek Isolation', () => {
  // --- Scenario 1: Web UI MessageThread Instant Obscuring ---
  it('instantly applies blur-sm select-none to all messages when Privacy Mode is enabled in Web UI', async () => {
    let privacyEnabled = false;

    const harness = createHookHarness(() =>
      WebMessageThread({
        conversationId: 'conv-100',
        conversationTitle: 'Patient Juan Dela Cruz',
        conversationScope: 'PatientFacility',
        messages: sampleMessages,
        currentUserId: 'doctor-01',
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        privacyBlurEnabled: privacyEnabled,
        onTogglePrivacyBlur: () => {
          privacyEnabled = !privacyEnabled;
          harness.rerender();
        }
      })
    );

    // Initial state: Privacy Mode OFF
    let paragraphs = findAllElements(harness.result.current, (el) =>
      typeof el.props?.className === 'string' && el.props.className.includes('text-sm')
    );
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);

    // Verify none have blur-sm initially
    for (const p of paragraphs) {
      expect(p.props.className).not.toContain('blur-sm');
    }

    // Toggle Privacy Mode ON
    const toggleButton = findElement(harness.result.current, (el) =>
      el.type === 'button' && el.props?.['aria-label']?.includes('privacy blur')
    );
    expect(toggleButton).toBeDefined();

    await act(() => {
      toggleButton.props.onClick();
    });

    // Re-query paragraphs in Privacy Mode ON
    paragraphs = findAllElements(harness.result.current, (el) =>
      typeof el.props?.className === 'string' && el.props.className.includes('text-sm')
    );

    // Verify all message paragraphs are blurred
    const blurredCount = paragraphs.filter((p) => p.props.className.includes('blur-sm select-none')).length;
    expect(blurredCount).toBe(3); // msg-1, msg-2, msg-3 (internal note)
  });

  // --- Scenario 2: Web UI Hover-Peek Isolation (Strict Single Message) ---
  it('strictly unblurs only the hovered message and preserves blur on all surrounding messages in Web UI', async () => {
    const harness = createHookHarness(() =>
      WebMessageThread({
        conversationId: 'conv-100',
        conversationTitle: 'Patient Juan Dela Cruz',
        conversationScope: 'PatientFacility',
        messages: sampleMessages,
        currentUserId: 'doctor-01',
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        privacyBlurEnabled: true,
        onTogglePrivacyBlur: () => {}
      })
    );

    // Find the container for Message 2 (Amlodipine)
    // The container has onMouseEnter / onMouseLeave
    const messageContainers = findAllElements(harness.result.current, (el) =>
      typeof el.props?.onMouseEnter === 'function' && typeof el.props?.onMouseLeave === 'function'
    );
    expect(messageContainers.length).toBe(3);

    const msg2Container = messageContainers[1]; // msg-2

    // Simulate Hover (onMouseEnter) on Message 2
    await act(() => {
      msg2Container.props.onMouseEnter();
    });

    // Check paragraphs after hover
    const paragraphs = findAllElements(harness.result.current, (el) =>
      typeof el.props?.className === 'string' && el.props.className.includes('text-sm')
    );

    // Paragraph 1 (msg-1) must REMAIN blurred
    expect(paragraphs[0].props.className).toContain('blur-sm select-none');
    expect(paragraphs[0].props.children).toContain('Patient diagnosed with Stage 2 Hypertension');

    // Paragraph 2 (msg-2) must be UNBLURRED (revealed)
    expect(paragraphs[1].props.className).not.toContain('blur-sm');
    expect(paragraphs[1].props.children).toContain('Prescribing Amlodipine 10mg once daily');

    // Paragraph 3 (msg-3 internal note) must REMAIN blurred
    expect(paragraphs[2].props.className).toContain('blur-sm select-none');
    expect(paragraphs[2].props.children).toContain('INTERNAL NOTE: Patient has poor medication adherence');

    // Simulate Mouse Leave (onMouseLeave) on Message 2
    await act(() => {
      msg2Container.props.onMouseLeave();
    });

    // Re-verify that Message 2 immediately re-obscures
    const afterLeaveParagraphs = findAllElements(harness.result.current, (el) =>
      typeof el.props?.className === 'string' && el.props.className.includes('text-sm')
    );
    expect(afterLeaveParagraphs[1].props.className).toContain('blur-sm select-none');
  });

  // --- Scenario 3: Native UI MessageThread Text Replacement ---
  it('instantly replaces text with bullet obscuring in Native UI MessageThread', async () => {
    let privacyEnabled = false;

    const harness = createHookHarness(() =>
      NativeMessageThread({
        conversationId: 'conv-100',
        conversationTitle: 'Patient Juan Dela Cruz',
        conversationScope: 'PatientFacility',
        messages: sampleMessages,
        currentUserId: 'doctor-01',
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        privacyBlurEnabled: privacyEnabled,
        onTogglePrivacyBlur: () => {
          privacyEnabled = !privacyEnabled;
          harness.rerender();
        }
      })
    );

    // Initial state: Privacy Mode OFF -> actual clinical text visible
    let textElements = findAllElements(harness.result.current, (el) =>
      typeof el.props?.children === 'string' &&
      (el.props.children.includes('Hypertension') || el.props.children.includes('Amlodipine') || el.props.children.includes('poor medication adherence'))
    );
    expect(textElements.length).toBe(3);

    // Toggle Privacy Mode ON
    const toggleButton = findElement(harness.result.current, (el) =>
      el.props?.accessibilityLabel?.includes('privacy blur')
    );
    expect(toggleButton).toBeDefined();

    await act(() => {
      toggleButton.props.onPress();
    });

    // In Privacy Mode ON: real clinical text is replaced with bullet strings
    textElements = findAllElements(harness.result.current, (el) =>
      typeof el.props?.children === 'string' &&
      (el.props.children.includes('Hypertension') || el.props.children.includes('Amlodipine') || el.props.children.includes('poor medication adherence'))
    );
    expect(textElements.length).toBe(0); // Zero real clinical text exposed

    // Bullet characters are present
    const bulletElements = findAllElements(harness.result.current, (el) =>
      typeof el.props?.children === 'string' && el.props.children.startsWith('••••')
    );
    expect(bulletElements.length).toBe(3);
  });

  // --- Scenario 4: Native UI Touch-Peek Isolation ---
  it('strictly reveals only the touched message on onTouchStart and conceals on onTouchEnd in Native UI', async () => {
    const harness = createHookHarness(() =>
      NativeMessageThread({
        conversationId: 'conv-100',
        conversationTitle: 'Patient Juan Dela Cruz',
        conversationScope: 'PatientFacility',
        messages: sampleMessages,
        currentUserId: 'doctor-01',
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        privacyBlurEnabled: true,
        onTogglePrivacyBlur: () => {}
      })
    );

    // Find touch-interactive bubble wrappers
    const touchWrappers = findAllElements(harness.result.current, (el) =>
      typeof el.props?.onTouchStart === 'function' && typeof el.props?.onTouchEnd === 'function'
    );
    expect(touchWrappers.length).toBe(3);

    // Touch Message 2 (Amlodipine)
    await act(() => {
      touchWrappers[1].props.onTouchStart();
    });

    // Message 2 text should now be revealed
    const revealedMsg2 = findElement(harness.result.current, (el) =>
      el.props?.children === 'Prescribing Amlodipine 10mg once daily. Please monitor morning blood pressure.'
    );
    expect(revealedMsg2).toBeDefined();

    // Surrounding Message 1 and Message 3 must REMAIN bullets
    const revealedMsg1 = findElement(harness.result.current, (el) =>
      typeof el.props?.children === 'string' && el.props.children.includes('Hypertension')
    );
    expect(revealedMsg1).toBeNull(); // Still bullet-obscured

    const revealedMsg3 = findElement(harness.result.current, (el) =>
      typeof el.props?.children === 'string' && el.props.children.includes('adherence')
    );
    expect(revealedMsg3).toBeNull(); // Still bullet-obscured

    // Release touch (onTouchEnd)
    await act(() => {
      touchWrappers[1].props.onTouchEnd();
    });

    // Message 2 should revert to bullet obscuring
    const msg2AfterRelease = findElement(harness.result.current, (el) =>
      el.props?.children === 'Prescribing Amlodipine 10mg once daily. Please monitor morning blood pressure.'
    );
    expect(msg2AfterRelease).toBeNull();
  });

  // --- Scenario 5: Attachment Filename Obscuring in Web UI ---
  it('verifies attachment filenames (Biopsy_Positive_Malignant.pdf) are obscured in Web UI Privacy Mode', () => {
    const harness = createHookHarness(() =>
      WebMessageThread({
        conversationId: 'conv-100',
        conversationTitle: 'Patient Juan Dela Cruz',
        conversationScope: 'PatientFacility',
        messages: sampleMessages,
        currentUserId: 'doctor-01',
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        privacyBlurEnabled: true, // Privacy Mode is ON
        onTogglePrivacyBlur: () => {}
      })
    );

    // Look for the attachment filename element
    const attElement = findElement(harness.result.current, (el) =>
      Array.isArray(el.props?.children)
        ? el.props.children.join('').includes('Biopsy_Positive_Malignant.pdf')
        : typeof el.props?.children === 'string' && el.props.children.includes('Biopsy_Positive_Malignant.pdf')
    );

    // Verified: In Privacy Mode, attachment filename span has blur-sm select-none applied
    expect(attElement).toBeDefined();
    expect(attElement.props.className).toContain('blur-sm select-none');
  });
});
