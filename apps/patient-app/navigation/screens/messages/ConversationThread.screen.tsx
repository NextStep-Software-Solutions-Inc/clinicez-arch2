import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { MessageThread } from '@clinicez/comms-sdk/native-ui';
import type { ThreadAttachment, ThreadMessage } from '@clinicez/comms-sdk/native-ui';
import Screen from '../../../components/layout/Screen';
import IconButton from '../../../components/ui/IconButton';
import ThemedText from '../../../components/ui/ThemedText';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { usePrivacy } from '../../../contexts/PrivacyContext';
import {
  communicationsService,
  type PatientConversationDetailDto,
  type PatientMessageDto,
} from '../../../services/comms/communicationsService';
import { dialog } from '../../../utils/dialog';

type Props = StaticScreenProps<{
  conversationId: string;
  title?: string;
  scope?: string;
}>;

function mapPatientMessageToThreadMessage(msg: PatientMessageDto): ThreadMessage {
  // Wire deliveryState: 'Sending' | 'Waiting' | 'Received' | 'NotReceived'
  const state: 'Sending' | 'Waiting' | 'Received' | 'NotReceived' =
    msg.deliveryState === 'Sending'
      ? 'Sending'
      : msg.deliveryState === 'Waiting'
        ? 'Waiting'
        : msg.deliveryState === 'Received'
          ? 'Received'
          : 'NotReceived';

  const attachments: ThreadAttachment[] = (msg.attachments ?? []).map((att) => ({
    fileKey: att.storageKey,
    fileName: att.fileName,
    contentType: att.contentType,
    sizeBytes: att.fileSizeBytes,
    isClean: att.scanStatus === 'Clean',
  }));

  return {
    id: msg.id,
    seq: msg.seq,
    conversationId: msg.conversationId,
    senderType: msg.senderType,
    senderId: msg.senderId ?? undefined,
    senderDisplayName: msg.senderName,
    contentText: msg.contentText,
    visibility: 'Public', // Patients never see or send internal messages
    state,
    clientSentAtUtc: msg.createdAtUtc,
    serverReceivedAtUtc: msg.receivedAtUtc,
    requiresAcknowledgement: msg.requiresAcknowledgement,
    isAcknowledged: msg.isAcknowledged,
    acknowledgedByName: msg.acknowledgedByName,
    acknowledgedAtUtc: msg.acknowledgedAtUtc,
    attachments,
  };
}

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

  const loadThread = useCallback(async () => {
    try {
      const detail = await communicationsService.getConversationDetail(getToken, conversationId);
      setConversation(detail);
      setMessages((detail.messages ?? []).map(mapPatientMessageToThreadMessage));
      setError(null);
    } catch (err: any) {
      console.warn('[ConversationThread] Failed to load messages:', err);
      setError(err?.message ?? 'Failed to load conversation thread.');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, getToken]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  const handleSendMessage = useCallback(
    async (text: string, isInternal: boolean, attachments?: ThreadAttachment[]) => {
      // Patients are strictly forbidden from writing internal notes
      if (isInternal) {
        throw new Error('Patients cannot author internal clinical notes.');
      }

      const clientMessageId = crypto.randomUUID();
      const optimisticMsg: ThreadMessage = {
        id: clientMessageId,
        seq: Date.now(),
        conversationId,
        senderType: 'Patient',
        senderDisplayName: 'Me',
        contentText: text,
        visibility: 'Public',
        state: 'Sending',
        clientSentAtUtc: new Date().toISOString(),
        attachments: attachments ?? [],
      };

      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        const sent = await communicationsService.sendMessage(
          getToken,
          conversationId,
          text,
          clientMessageId,
          attachments?.map((a) => ({
            fileKey: a.fileKey,
            fileName: a.fileName,
            contentType: a.contentType,
            sizeBytes: a.sizeBytes,
          })),
        );

        setMessages((prev) =>
          prev.map((m) => (m.id === clientMessageId ? mapPatientMessageToThreadMessage(sent) : m)),
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
    [conversationId, getToken],
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
          prev.map((m) => (m.id === messageId ? mapPatientMessageToThreadMessage(resent) : m)),
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, state: 'NotReceived', isResending: false } : m)),
        );
        dialog.alert('Resend Failed', 'Could not deliver message to facility. Please tap to try again.');
      }
    },
    [conversationId, getToken],
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

  const title = conversation?.facilityName ?? initialTitle ?? 'Conversation';
  const scope = conversation?.homeFacilityType ?? initialScope ?? 'Facility';

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
            {conversation?.subject ? `${conversation.category} • ${conversation.subject}` : scope}
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
          onSendMessage={handleSendMessage}
          onResendMessage={handleResendMessage}
          onAcknowledgeMessage={handleAcknowledge}
          privacyBlurEnabled={privacyBlurEnabled}
          onTogglePrivacyBlur={togglePrivacyBlur}
          canWriteInternalNotes={false}
          isLoading={isLoading}
          error={error}
          style={styles.threadContent}
        />
      </View>
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
