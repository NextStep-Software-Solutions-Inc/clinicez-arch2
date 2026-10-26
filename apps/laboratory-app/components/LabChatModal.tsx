import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Modal, Pressable, Text } from 'react-native';
import {
  useComms,
  useConversations,
  useConversation,
  useSendMessage,
} from '@clinicez/comms-sdk/react';
import {
  ChatDrawer,
  MessageThread,
} from '@clinicez/comms-sdk/native-ui';
import type {
  ChatDrawerItem,
  ConversationScopeFilter,
  ThreadMessage,
} from '@clinicez/comms-sdk/native-ui';
import { lightColors, radiusScale, spaceScale, sizes, fontSizeScale } from '@clinicez/design-tokens';
import { useLabComms } from '../context/LabCommsContext';
import { useFacilityLicense } from './FacilityActivationGate';

interface ActiveThreadViewProps {
  conversationId: string;
  onBack: () => void;
  currentUserId: string;
}

function ActiveThreadView({ conversationId, onBack, currentUserId }: ActiveThreadViewProps) {
  const { conversation, messages, isLoading, error, acknowledgeMessage } = useConversation(conversationId);
  const { sendMessage, resendMessage } = useSendMessage();
  const [privacyBlur, setPrivacyBlur] = useState(false);

  const handleSend = useCallback(
    async (text: string, isInternal: boolean) => {
      await sendMessage({
        conversationId,
        contentText: text,
        visibility: isInternal ? 'Internal' : 'Public',
      });
    },
    [conversationId, sendMessage],
  );

  const threadMessages: ThreadMessage[] = useMemo(() => {
    return messages.map((m) => ({
      id: m.messageId,
      seq: m.seq,
      conversationId: m.conversationId,
      senderType: (m.senderType as ThreadMessage['senderType']) || 'Staff',
      senderId: m.senderId ?? undefined,
      senderDisplayName: m.senderDisplayName,
      senderRole: undefined,
      contentText: m.contentText,
      visibility: m.visibility as ThreadMessage['visibility'],
      state: m.deliveryState as ThreadMessage['state'],
      clientSentAtUtc: m.sentAtUtc,
      serverReceivedAtUtc: undefined,
      requiresAcknowledgement: m.requiresAcknowledgement,
      isAcknowledged: m.isAcknowledged,
      acknowledgedByName: m.acknowledgedByName ?? undefined,
      acknowledgedAtUtc: m.acknowledgedAtUtc ?? undefined,
    }));
  }, [messages]);

  return (
    <View style={styles.threadContainer}>
      <View style={styles.threadHeader}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backBtnText}>← Channels</Text>
        </Pressable>
        <Text style={styles.threadTitle} numberOfLines={1}>
          {conversation?.title || 'Specimen Inquiry'}
        </Text>
      </View>

      <MessageThread
        conversationId={conversationId}
        conversationTitle={conversation?.title || 'Specimen Inquiry'}
        conversationScope={conversation?.scope || 'Facility'}
        messages={threadMessages}
        currentUserId={currentUserId}
        onSendMessage={handleSend}
        onResendMessage={async (msgId) => {
          await resendMessage(msgId);
        }}
        onAcknowledgeMessage={async (msgId) => {
          await acknowledgeMessage(msgId);
        }}
        privacyBlurEnabled={privacyBlur}
        onTogglePrivacyBlur={() => setPrivacyBlur((prev) => !prev)}
        canWriteInternalNotes={true}
        isLoading={isLoading}
        error={error ? error.message : null}
      />
    </View>
  );
}

export default function LabChatModal() {
  const { isChatOpen, closeChat, activeConversationId, setActiveConversationId } = useLabComms();
  const { license } = useFacilityLicense();
  const { status } = useComms();

  const {
    conversations,
    isLoading,
    error,
    createConversation,
  } = useConversations();

  const [selectedScope, setSelectedScope] = useState<ConversationScopeFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const chatItems: ChatDrawerItem[] = useMemo(() => {
    return conversations
      .filter((c) => {
        if (selectedScope !== 'All' && c.scope !== selectedScope) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            c.title.toLowerCase().includes(q) ||
            (c.lastMessageSnippet && c.lastMessageSnippet.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .map((c) => ({
        id: c.id,
        scope: c.scope as ChatDrawerItem['scope'],
        title: c.title,
        lastMessageSnippet: c.lastMessageSnippet ?? undefined,
        lastMessageAtUtc: c.lastMessageAtUtc ?? undefined,
        unreadCount: (c as any).unreadCount ?? 0,
        urgentCount: c.priority === 'Urgent' ? 1 : 0,
        isEmergency: c.priority === 'Critical',
        isActive: c.id === activeConversationId,
      }));
  }, [conversations, selectedScope, searchQuery, activeConversationId]);

  const connectionStateDisplay =
    status === 'connected'
      ? 'Connected'
      : status === 'connecting' || status === 'reconnecting' || status === 'acquiring_ticket'
      ? 'Reconnecting'
      : 'Disconnected';

  const handleNewConversation = useCallback(async () => {
    try {
      const created = await createConversation({
        scope: 'Facility',
        title: 'Specimen Clarification',
      });
      setActiveConversationId(created.id);
    } catch {
      // Ignored
    }
  }, [createConversation, setActiveConversationId]);

  if (!isChatOpen) return null;

  return (
    <Modal visible={isChatOpen} animationType="slide" transparent onRequestClose={closeChat}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={closeChat} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Laboratory Communications</Text>
            <Pressable onPress={closeChat} style={styles.closeBtn} accessibilityRole="button">
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.body}>
            {activeConversationId ? (
              <ActiveThreadView
                conversationId={activeConversationId}
                onBack={() => setActiveConversationId(undefined)}
                currentUserId={license?.laboratoryId || 'lab-staff'}
              />
            ) : (
              <ChatDrawer
                items={chatItems}
                activeConversationId={activeConversationId}
                onSelectConversation={(id) => setActiveConversationId(id)}
                selectedScope={selectedScope}
                onSelectScope={(scope) => setSelectedScope(scope)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                connectionState={connectionStateDisplay}
                loading={isLoading}
                error={error ? error.message : null}
                onNewConversation={handleNewConversation}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: lightColors.overlay,
  },
  panel: {
    width: 440,
    maxWidth: '100%',
    height: '100%',
    backgroundColor: lightColors.surface,
    borderLeftWidth: 1,
    borderLeftColor: lightColors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spaceScale.lg,
    paddingVertical: spaceScale.md,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    backgroundColor: lightColors.surfaceSubtle,
  },
  headerTitle: {
    fontSize: fontSizeScale.lg,
    fontWeight: '700',
    color: lightColors.text,
  },
  closeBtn: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  closeBtnText: {
    fontSize: fontSizeScale.md,
    color: lightColors.textSecondary,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
  threadContainer: {
    flex: 1,
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.md,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.sm,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    backgroundColor: lightColors.surfaceMuted,
  },
  backBtn: {
    paddingVertical: spaceScale.xs,
    paddingHorizontal: spaceScale.sm,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  backBtnText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.text,
  },
  threadTitle: {
    flex: 1,
    fontSize: fontSizeScale.md,
    fontWeight: '700',
    color: lightColors.text,
  },
});
