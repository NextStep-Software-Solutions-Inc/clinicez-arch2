import { beforeAll, describe, expect, it, mock } from 'bun:test';
import React from 'react';
import { darkColors, lightColors } from '@clinicez/design-tokens';
import { formatRequestStatus, REQUEST_STATUS_LABELS } from '../../src/core/conversationFilters';
import type { RequestStatus } from '../../src/core/types';
import type {
  AttachmentPreviewData,
  ThreadAttachment,
  ThreadMessage,
} from '../../src/native-ui/types';
import { createHookHarness } from '../react/hook-test-harness';

mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj?.web ?? obj?.default },
  View: 'div',
  Text: 'span',
  Image: 'img',
  TouchableOpacity: 'button',
  TextInput: 'input',
  ScrollView: 'div',
  ActivityIndicator: 'div',
  Modal: (props: any) => (props.visible ? React.createElement('div', { ...props }) : null),
  StyleSheet: {
    create: (styles: any) => styles,
    flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
  },
}));

let MessageThread: any;
let AttachmentPreviewModal: any;
let getAttachmentPreviewKind: any;
let formatAttachmentPreviewSize: any;

beforeAll(async () => {
  const threadMod = await import('../../src/native-ui/MessageThread');
  MessageThread = threadMod.MessageThread;
  const previewMod = await import('../../src/native-ui/AttachmentPreviewModal');
  AttachmentPreviewModal = previewMod.AttachmentPreviewModal;
  getAttachmentPreviewKind = previewMod.getAttachmentPreviewKind;
  formatAttachmentPreviewSize = previewMod.formatAttachmentPreviewSize;
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
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(element)) return element;
  if (element.props?.children) {
    return findElement(element.props.children, predicate);
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

function flattenStyle(style: any): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.flat(Infinity).filter(Boolean));
  }
  return style;
}

describe('Issue #297 — Dark Mode MessageThread, Shared AttachmentPreviewModal & RequestStatus Formatting', () => {
  describe('1. formatRequestStatus', () => {
    it('formats every canonical RequestStatus enum value into human-readable labels', () => {
      const expected: Record<RequestStatus, string> = {
        Submitted: 'Submitted',
        WithTriage: 'With Triage',
        Routed: 'Routed',
        Answered: 'Answered',
        NeedsVisit: 'Needs Visit',
        Declined: 'Declined',
        Resolved: 'Resolved',
        Closed: 'Closed',
      };

      for (const [status, label] of Object.entries(expected)) {
        expect(REQUEST_STATUS_LABELS[status as RequestStatus]).toBe(label);
        expect(formatRequestStatus(status)).toBe(label);
        expect(formatRequestStatus(status.toLowerCase())).toBe(label);
      }
    });

    it('handles PascalCase fallbacks, already-formatted labels, and empty values cleanly', () => {
      expect(formatRequestStatus('AwaitingClinicianReview')).toBe('Awaiting Clinician Review');
      expect(formatRequestStatus('With Triage')).toBe('With Triage');
      expect(formatRequestStatus('Closed / Archived')).toBe('Closed / Archived');
      expect(formatRequestStatus('')).toBe('');
      expect(formatRequestStatus(null)).toBe('');
      expect(formatRequestStatus(undefined)).toBe('');
    });
  });

  describe('2. MessageThread Dark Mode Tokens & Attachment Chip Copy', () => {
    const sampleMessages: ThreadMessage[] = [
      {
        id: 'msg-pat-dark-1',
        seq: 1,
        conversationId: 'conv-dark-1',
        senderType: 'Patient',
        senderId: 'pat-1',
        senderDisplayName: 'Me',
        contentText: 'Here is my prescription PDF.',
        visibility: 'Public',
        state: 'Received',
        clientSentAtUtc: '2026-11-27T10:00:00Z',
        attachments: [
          {
            attachmentId: 'att-pdf-1',
            fileKey: 'comms/pat-1/epress.pdf',
            fileName: 'EPRESS_2026.pdf',
            contentType: 'application/pdf',
            sizeBytes: 153600,
            isClean: true,
          },
        ],
      },
      {
        id: 'msg-staff-dark-2',
        seq: 2,
        conversationId: 'conv-dark-1',
        senderType: 'Staff',
        senderId: 'staff-1',
        senderDisplayName: 'Nextstep OPD',
        contentText: 'Received, thank you!',
        visibility: 'Public',
        state: 'Received',
        clientSentAtUtc: '2026-11-27T10:05:00Z',
      },
    ];

    it('applies darkColors across thread container, subheader, bubbles, attachment cards, and composer', () => {
      const harness = createHookHarness(() =>
        MessageThread({
          conversationId: 'conv-dark-1',
          conversationTitle: 'Nextstep OPD',
          conversationScope: 'Clinic',
          viewerType: 'Patient',
          currentUserId: 'pat-1',
          messages: sampleMessages,
          onSendMessage: async () => {},
          onResendMessage: async () => {},
          onOpenAttachment: () => {},
          privacyBlurEnabled: false,
          onTogglePrivacyBlur: () => {},
          colors: darkColors,
        }),
      );

      const tree = harness.result.current;
      const rootStyle = flattenStyle(tree.props.style);
      expect(rootStyle.backgroundColor).toBe(darkColors.background);

      // Subheader uses dark surface & border
      const allViews = findAllElements(tree, (el) => el.type === 'div');
      expect(
        allViews.some((v) => {
          const st = flattenStyle(v.props.style);
          return st.backgroundColor === darkColors.surface && st.borderBottomColor === darkColors.border;
        }),
      ).toBe(true);

      // Outgoing bubble uses dark primaryLight + primaryBorder; incoming bubble uses dark surface + border
      expect(
        allViews.some((v) => {
          const st = flattenStyle(v.props.style);
          return st.backgroundColor === darkColors.primaryLight && st.borderColor === darkColors.primaryBorder;
        }),
      ).toBe(true);
      expect(
        allViews.some((v) => {
          const st = flattenStyle(v.props.style);
          return st.backgroundColor === darkColors.surface && st.borderColor === darkColors.border;
        }),
      ).toBe(true);

      // Attachment chip uses dark surface, high-contrast primaryText label, and "Preview" copy
      const attachmentBtn = findElement(
        tree,
        (el) => el.props?.accessibilityLabel === 'Open attachment EPRESS_2026.pdf',
      );
      expect(attachmentBtn).not.toBeNull();
      const chipStyle = flattenStyle(attachmentBtn.props.style);
      expect(chipStyle.backgroundColor).toBe(darkColors.surface);
      expect(chipStyle.borderColor).toBe(darkColors.primaryBorder);

      const chipText = getTextContent(attachmentBtn);
      expect(chipText).toContain('EPRESS_2026.pdf');
      expect(chipText).toContain('Preview');
      expect(chipText).not.toContain('Download');

      const attNameEl = findElement(
        attachmentBtn,
        (el) => el.type === 'span' && getTextContent(el).trim() === 'EPRESS_2026.pdf',
      );
      expect(flattenStyle(attNameEl.props.style).color).toBe(darkColors.primaryText);

      // Composer input adapts to dark surfaceSubtle + border + light text
      const inputEl = findElement(
        tree,
        (el) => el.props?.accessibilityLabel === 'Message input field',
      );
      expect(inputEl).not.toBeNull();
      const inputStyle = flattenStyle(inputEl.props.style);
      expect(inputStyle.backgroundColor).toBe(darkColors.surfaceSubtle);
      expect(inputStyle.borderColor).toBe(darkColors.border);
      expect(inputStyle.color).toBe(darkColors.text);
      expect(inputEl.props.placeholderTextColor).toBe(darkColors.textMuted);

      harness.unmount();
    });
  });

  describe('3. AttachmentPreviewModal (Images, PDFs, Actions, Lifecycle & Dark Mode)', () => {
    const pdfAttachment: ThreadAttachment = {
      attachmentId: 'att-pdf-1',
      fileKey: 'comms/epress.pdf',
      fileName: 'EPRESS_Prescription.pdf',
      contentType: 'application/pdf',
      sizeBytes: 204800,
      isClean: true,
    };

    const imageAttachment: ThreadAttachment = {
      attachmentId: 'att-img-1',
      fileKey: 'comms/xray.png',
      fileName: 'chest_xray.png',
      contentType: 'image/png',
      sizeBytes: 512000,
      isClean: true,
    };

    it('classifies attachment MIME types and formats sizes accurately', () => {
      expect(getAttachmentPreviewKind('image/jpeg', 'photo.jpg')).toBe('image');
      expect(getAttachmentPreviewKind('application/octet-stream', 'scan.webp')).toBe('image');
      expect(getAttachmentPreviewKind('application/pdf', 'rx.pdf')).toBe('pdf');
      expect(getAttachmentPreviewKind('application/octet-stream', 'report.PDF')).toBe('pdf');
      expect(getAttachmentPreviewKind('text/csv', 'export.csv')).toBe('other');

      expect(formatAttachmentPreviewSize(0)).toBe('');
      expect(formatAttachmentPreviewSize(512)).toBe('512 B');
      expect(formatAttachmentPreviewSize(2048)).toBe('2.0 KB');
      expect(formatAttachmentPreviewSize(2 * 1024 * 1024)).toBe('2.0 MB');
    });

    it('renders embedded PDF iframe on web with Download & Open in New Tab actions in Dark Mode', () => {
      const previewData: AttachmentPreviewData = {
        uri: 'blob:https://my.dev.clinicez.net/pdf-1',
        mimeType: 'application/pdf',
        fileName: pdfAttachment.fileName,
        sizeBytes: pdfAttachment.sizeBytes,
      };
      const downloaded: string[] = [];
      const openedTabs: string[] = [];

      const harness = createHookHarness(() =>
        AttachmentPreviewModal({
          visible: true,
          attachment: pdfAttachment,
          preview: previewData,
          onClose: () => {},
          onDownload: (_att: ThreadAttachment, p: AttachmentPreviewData) => {
            downloaded.push(p.uri);
          },
          onOpenInNewTab: (_att: ThreadAttachment, p: AttachmentPreviewData) => {
            openedTabs.push(p.uri);
          },
          colors: darkColors,
        }),
      );

      const tree = harness.result.current;
      const overlay = findElement(
        tree,
        (el) => el.props?.testID === 'attachment-preview-modal-overlay',
      );
      expect(flattenStyle(overlay.props.style).backgroundColor).toBe(darkColors.overlay);

      const card = findElement(
        tree,
        (el) => el.props?.testID === 'attachment-preview-modal-card',
      );
      expect(flattenStyle(card.props.style).backgroundColor).toBe(darkColors.surface);
      expect(flattenStyle(card.props.style).borderColor).toBe(darkColors.border);

      const iframe = findElement(tree, (el) => el.type === 'iframe');
      expect(iframe).not.toBeNull();
      expect(iframe.props.src).toBe('blob:https://my.dev.clinicez.net/pdf-1');
      expect(iframe.props.title).toBe('EPRESS_Prescription.pdf');

      const downloadBtn = findElement(
        tree,
        (el) => el.props?.testID === 'attachment-preview-modal-download-btn',
      );
      const openTabBtn = findElement(
        tree,
        (el) => el.props?.testID === 'attachment-preview-modal-open-tab-btn',
      );
      expect(downloadBtn).not.toBeNull();
      expect(openTabBtn).not.toBeNull();

      downloadBtn.props.onPress();
      openTabBtn.props.onPress();
      expect(downloaded).toEqual(['blob:https://my.dev.clinicez.net/pdf-1']);
      expect(openedTabs).toEqual(['blob:https://my.dev.clinicez.net/pdf-1']);

      harness.unmount();
    });

    it('renders inline image preview for image/* attachments', () => {
      const previewData: AttachmentPreviewData = {
        uri: 'blob:https://my.dev.clinicez.net/img-1',
        mimeType: 'image/png',
        fileName: imageAttachment.fileName,
        sizeBytes: imageAttachment.sizeBytes,
      };

      const harness = createHookHarness(() =>
        AttachmentPreviewModal({
          visible: true,
          attachment: imageAttachment,
          preview: previewData,
          onClose: () => {},
          colors: lightColors,
        }),
      );

      const tree = harness.result.current;
      const imageContainer = findElement(
        tree,
        (el) => el.props?.testID === 'attachment-preview-modal-image-container',
      );
      expect(imageContainer).not.toBeNull();
      const imgEl = findElement(imageContainer, (el) => el.type === 'img');
      expect(imgEl).not.toBeNull();
      expect(imgEl.props.source?.uri ?? imgEl.props.src).toBe('blob:https://my.dev.clinicez.net/img-1');
      expect(findElement(tree, (el) => el.type === 'iframe')).toBeNull();

      harness.unmount();
    });

    it('loads preview asynchronously via loadPreview, handles errors with Retry, and revokes blob URLs on unmount', async () => {
      let attempts = 0;
      let revokedCount = 0;

      const loadPreview = async (att: ThreadAttachment): Promise<AttachmentPreviewData> => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('Temporary network error');
        }
        return {
          uri: 'blob:https://nextstep.clinic.dev.clinicez.net/loaded-pdf',
          mimeType: att.contentType,
          fileName: att.fileName,
          sizeBytes: att.sizeBytes,
          revoke: () => {
            revokedCount += 1;
          },
        };
      };

      const harness = createHookHarness(() =>
        AttachmentPreviewModal({
          visible: true,
          attachment: pdfAttachment,
          loadPreview,
          onClose: () => {},
          colors: darkColors,
        }),
      );

      // Wait for first failing load
      await new Promise((r) => setTimeout(r, 10));
      const errorBox = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'attachment-preview-modal-error',
      );
      expect(errorBox).not.toBeNull();
      expect(getTextContent(errorBox)).toContain('Temporary network error');

      // Retry succeeds
      const retryBtn = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'attachment-preview-modal-retry-btn',
      );
      expect(retryBtn).not.toBeNull();
      retryBtn.props.onPress();
      await new Promise((r) => setTimeout(r, 10));

      const iframe = findElement(harness.result.current, (el) => el.type === 'iframe');
      expect(iframe).not.toBeNull();
      expect(iframe.props.src).toBe('blob:https://nextstep.clinic.dev.clinicez.net/loaded-pdf');
      expect(revokedCount).toBe(0);

      // Unmount revokes the active preview blob URL cleanly
      harness.unmount();
      expect(revokedCount).toBe(1);
    });

    it('returns null when visible is false or attachment is null', () => {
      const harness = createHookHarness(() =>
        AttachmentPreviewModal({
          visible: false,
          attachment: pdfAttachment,
          onClose: () => {},
        }),
      );
      expect(harness.result.current).toBeNull();
      harness.unmount();
    });
  });
});
