import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { AttachmentPreviewModal, MessageThread } from '@clinicez/comms-sdk/native-ui';
import type {
  AttachmentPreviewData,
  ThreadAttachment,
  ThreadMessage,
} from '@clinicez/comms-sdk/native-ui';
import {
  formatMessageCategory,
  isRedundantCategorySubject,
} from '@clinicez/comms-sdk/core';
import Screen from '../../../components/layout/Screen';
import IconButton from '../../../components/ui/IconButton';
import ThemedText from '../../../components/ui/ThemedText';
import {
  renderNativePdfPreview,
  supportsNativeInlinePdf,
} from '../../../components/files/NativePdfPreview';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { usePrivacy } from '../../../contexts/PrivacyContext';
import {
  communicationsService,
  type PatientConversationDetailDto,
} from '../../../services/comms/communicationsService';
import {
  mapPatientMessageToThreadMessage,
  resolvePatientThreadSenderName,
  sortThreadMessages,
} from '../../../services/comms/threadHelpers';
import { dialog } from '../../../utils/dialog';

export {
  mapPatientMessageToThreadMessage,
  resolvePatientThreadSenderName,
  sortThreadMessages,
};

type Props = StaticScreenProps<{
  conversationId: string;
  title?: string;
  scope?: string;
}>;

export default function ConversationThreadScreen({ route }: Props) {
  const { colors, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { getToken, internalPatientId, userId } = useAuth();
  const {
    privacyBlurEnabled,
    togglePrivacyBlur,
    hideConversation,
  } = usePrivacy();

  const { conversationId, title: initialTitle, scope: initialScope } = route.params;

  const [conversation, setConversation] = useState<PatientConversationDetailDto | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<ThreadAttachment | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const title = conversation?.facilityName ?? initialTitle ?? 'Conversation';
  const scope = conversation?.homeFacilityType ?? initialScope ?? 'Facility';

  const knownPatientNames = useMemo(() => {
    const names: string[] = [];
    for (const m of messages) {
      if ((m.senderType === 'Patient' || (m.senderType as string) === 'Guardian') && m.senderDisplayName) {
        names.push(m.senderDisplayName);
      }
    }
    return names;
  }, [messages]);

  const loadThread = useCallback(async () => {
    try {
      const detail = await communicationsService.getConversationDetail(getToken, conversationId);
      if (!mountedRef.current) return;
      setConversation(detail);
      const patientSideNames = (detail.messages ?? [])
        .filter((m) => m.senderType === 'Patient' || (m.senderType as string) === 'Guardian')
        .map((m) => m.senderName);
      const mapped = (detail.messages ?? []).map((m) =>
        mapPatientMessageToThreadMessage(m, detail.facilityName, patientSideNames),
      );
      setMessages(sortThreadMessages(mapped));
      setError(null);
    } catch (err: any) {
      console.warn('[ConversationThread] Failed to load messages:', err);
      if (!mountedRef.current) return;
      setError(err?.message ?? 'Failed to load conversation thread.');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [conversationId, getToken]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  useFocusEffect(
    useCallback(() => {
      loadThread();
      const timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        loadThread();
      }, 10_000);
      return () => clearInterval(timer);
    }, [loadThread]),
  );

  const handlePickAttachment = useCallback(async (): Promise<ThreadAttachment | null> => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const file = result.assets[0];
      const fileSize = file.size ?? file.file?.size;
      if (fileSize && fileSize > 15 * 1024 * 1024) {
        dialog.alert('File Too Large', 'Maximum file size is 15 MB.');
        return null;
      }

      const uploaded = await communicationsService.uploadAttachment(getToken, {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || file.file?.type || 'application/octet-stream',
        size: fileSize,
        file: file.file,
      });

      return {
        attachmentId: uploaded.attachmentId,
        fileKey: uploaded.fileKey,
        fileName: uploaded.fileName,
        contentType: uploaded.contentType,
        sizeBytes: uploaded.sizeBytes,
        isClean: true,
      };
    } catch (err: any) {
      dialog.alert('Upload Failed', err?.message ?? 'Could not upload attachment.');
      return null;
    }
  }, [getToken]);

  const handleOpenAttachment = useCallback((att: ThreadAttachment) => {
    if (!att.attachmentId) {
      dialog.alert('Attachment Pending', 'This attachment is still syncing. Please try again shortly.');
      return;
    }
    setPreviewAttachment(att);
  }, []);

  const handleLoadAttachmentPreview = useCallback(
    async (att: ThreadAttachment): Promise<AttachmentPreviewData> => {
      if (!att.attachmentId) {
        throw new Error('This attachment is still syncing. Please try again shortly.');
      }

      const { blob, mimeType } = await communicationsService.fetchAttachmentBlob(
        getToken,
        att.attachmentId,
        att.contentType,
      );

      if (
        Platform.OS === 'web' &&
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
      ) {
        const objectUrl = URL.createObjectURL(blob);
        return {
          uri: objectUrl,
          mimeType,
          fileName: att.fileName,
          sizeBytes: att.sizeBytes,
          blob,
          revoke: () => {
            if (typeof URL.revokeObjectURL === 'function') {
              URL.revokeObjectURL(objectUrl);
            }
          },
        };
      }

      const fileUri = await communicationsService.writeAttachmentBlobToCache(blob, att.fileName);
      return {
        uri: fileUri,
        mimeType,
        fileName: att.fileName,
        sizeBytes: att.sizeBytes,
        blob,
      };
    },
    [getToken],
  );

  const handleDownloadNativeAttachment = useCallback(
    async (att: ThreadAttachment, preview: AttachmentPreviewData) => {
      try {
        await communicationsService.shareAttachmentFile(
          preview.uri,
          preview.mimeType,
          preview.fileName || att.fileName,
        );
      } catch (err: any) {
        dialog.alert('Download Failed', err?.message ?? 'Could not save or open attachment.');
      }
    },
    [],
  );

  const handleSendMessage = useCallback(
    async (text: string, isInternal: boolean, attachments?: ThreadAttachment[]) => {
      // Patients are strictly forbidden from writing internal notes
      if (isInternal) {
        throw new Error('Patients cannot author internal clinical notes.');
      }

      const clientMessageId = randomUUID();
      const optimisticMsg: ThreadMessage = {
        id: clientMessageId,
        seq: Date.now(),
        conversationId,
        senderType: 'Patient',
        senderId: internalPatientId ?? userId ?? undefined,
        senderDisplayName: 'Me',
        contentText: text,
        visibility: 'Public',
        state: 'Sending',
        clientSentAtUtc: new Date().toISOString(),
        attachments: attachments ?? [],
      };

      setMessages((prev) => sortThreadMessages([...prev, optimisticMsg]));

      try {
        const sent = await communicationsService.sendMessage(
          getToken,
          conversationId,
          text,
          clientMessageId,
          attachments?.map((a) => ({
            attachmentId: a.attachmentId,
            fileKey: a.fileKey,
            fileName: a.fileName,
            contentType: a.contentType,
            sizeBytes: a.sizeBytes,
          })),
        );

        setMessages((prev) =>
          sortThreadMessages(
            prev.map((m) =>
              m.id === clientMessageId
                ? mapPatientMessageToThreadMessage(sent, conversation?.facilityName ?? initialTitle, knownPatientNames)
                : m,
            ),
          ),
        );
      } catch (err: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === clientMessageId ? { ...m, state: 'NotReceived' } : m,
          ),
        );
        throw err;
      }
    },
    [conversation?.facilityName, conversationId, getToken, initialTitle, internalPatientId, knownPatientNames, userId],
  );

  const handleResendMessage = useCallback(
    async (messageId: string) => {
      try {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, state: 'Sending', isResending: true } : m)),
        );
        const resent = await communicationsService.resendMessage(
          getToken,
          conversationId,
          messageId,
        );
        setMessages((prev) =>
          sortThreadMessages(
            prev.map((m) =>
              m.id === messageId
                ? mapPatientMessageToThreadMessage(resent, conversation?.facilityName ?? initialTitle, knownPatientNames)
                : m,
            ),
          ),
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, state: 'NotReceived', isResending: false } : m)),
        );
        dialog.alert('Resend Failed', 'Could not deliver message to facility. Please tap to try again.');
      }
    },
    [conversation?.facilityName, conversationId, getToken, initialTitle, knownPatientNames],
  );

  const handleAcknowledge = useCallback(
    async (messageId: string) => {
      try {
        await communicationsService.acknowledgeMessage(getToken, conversationId, messageId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  isAcknowledged: true,
                  acknowledgedAtUtc: new Date().toISOString(),
                  acknowledgedByName: 'Me',
                }
              : m,
          ),
        );
      } catch (err) {
        dialog.alert('Error', 'Failed to submit acknowledgement. Please try again.');
      }
    },
    [conversationId, getToken],
  );

  const handleHideCopy = useCallback(async () => {
    const ok = await dialog.confirm({
      title: 'Hide My Copy',
      message:
        'Are you sure you want to hide your copy of this conversation? The facility master record will remain intact, but it will be hidden from your inbox.',
      confirmLabel: 'Hide',
      destructive: true,
    });
    if (ok) {
      try {
        await hideConversation(conversationId, getToken);
        dialog.alert('Copy Hidden', 'This conversation copy was hidden.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch {
        navigation.goBack();
      }
    }
  }, [conversationId, getToken, hideConversation, navigation]);

  const formattedCategory = conversation?.category
    ? formatMessageCategory(conversation.category, 'patient')
    : null;
  const distinctSubject =
    conversation?.subject &&
    !isRedundantCategorySubject(conversation.subject, conversation.category)
      ? conversation.subject.trim()
      : null;
  const headerSubtitle = formattedCategory
    ? distinctSubject
      ? `${formattedCategory} • ${distinctSubject}`
      : formattedCategory
    : distinctSubject || scope;
  return (
    <Screen width="full" contentContainerStyle={styles.screenContainer}>
      {/* Thread Header Bar */}
      <View
        style={[
          styles.headerBar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            paddingHorizontal: spacing.md,
            paddingTop: Math.max(insets.top, spacing.sm),
            paddingBottom: spacing.sm,
          },
        ]}
      >
        <IconButton
          icon="back"
          accessibilityLabel="Back to Inbox"
          hitSize={44}
          onPress={() => navigation.goBack()}
        />

        <View style={styles.headerInfo}>
          <ThemedText variant="bodyBold" numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText variant="caption" color="textMuted">
            {headerSubtitle}
          </ThemedText>
        </View>

        <View style={styles.headerActions}>
          <IconButton
            icon={privacyBlurEnabled ? 'eyeOff' : 'eye'}
            accessibilityLabel={
              privacyBlurEnabled ? 'Disable Privacy Blur' : 'Enable Privacy Blur'
            }
            hitSize={44}
            tone={privacyBlurEnabled ? 'filled' : 'plain'}
            onPress={togglePrivacyBlur}
          />

          <IconButton
            icon="trash"
            accessibilityLabel="Hide My Copy"
            hitSize={44}
            onPress={handleHideCopy}
          />
        </View>
      </View>

      {/* Embedded SDK MessageThread component */}
      <View style={styles.threadWrapper}>
        <MessageThread
          conversationId={conversationId}
          conversationTitle={title}
          conversationScope={scope}
          messages={messages}
          currentUserId={internalPatientId ?? userId ?? 'me'}
          viewerType="Patient"
          onSendMessage={handleSendMessage}
          onResendMessage={handleResendMessage}
          onAcknowledgeMessage={handleAcknowledge}
          onPickAttachment={handlePickAttachment}
          onOpenAttachment={handleOpenAttachment}
          privacyBlurEnabled={privacyBlurEnabled}
          onTogglePrivacyBlur={togglePrivacyBlur}
          canWriteInternalNotes={false}
          isLoading={isLoading}
          error={error}
          colors={colors}
          style={styles.threadContent}
        />
      </View>

      {previewAttachment ? (
        <AttachmentPreviewModal
          visible={Boolean(previewAttachment)}
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
          loadPreview={handleLoadAttachmentPreview}
          onDownload={Platform.OS === 'web' ? undefined : handleDownloadNativeAttachment}
          renderNativePdf={
            supportsNativeInlinePdf
              ? (uri) => renderNativePdfPreview({ uri, backgroundColor: colors.background })
              : undefined
          }
          colors={colors}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    padding: 0,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  headerInfo: {
    flex: 1,
    marginHorizontal: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  threadWrapper: {
    flex: 1,
  },
  threadContent: {
    flex: 1,
  },
});
