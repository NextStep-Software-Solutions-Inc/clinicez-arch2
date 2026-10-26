import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, Platform, Modal } from 'react-native';
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
import { useClinicComms } from '../../context/ClinicCommsContext';
import { useAuth } from '../../context/AuthContext';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';

interface ClinicActiveThreadProps {
  conversationId: string;
  onBack: () => void;
  currentUserId: string;
}

function ClinicActiveThread({ conversationId, onBack, currentUserId }: ClinicActiveThreadProps) {
  const { conversation, messages, isLoading, error, acknowledgeMessage } = useConversation(conversationId);
  const { sendMessage, resendMessage } = useSendMessage();
  const [privacyBlur, setPrivacyBlur] = useState(false);

  const handleSendMessage = useCallback(
    async (text: string, isInternal: boolean) => {
      await sendMessage({
        conversationId,
        contentText: text,
        visibility: isInternal ? 'Internal' : 'Public',
      });
    },
    [conversationId, sendMessage],
  );

  const handleResend = useCallback(
    async (messageId: string) => {
      await resendMessage(messageId);
    },
    [resendMessage],
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
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to conversations"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="arrowLeft" size={theme.sizes.iconSm} color={theme.colors.text} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Conversations
          </ThemedText>
        </Pressable>

        <ThemedText variant="bodyBold" numberOfLines={1} style={styles.threadTitle}>
          {conversation?.title || 'Conversation'}
        </ThemedText>
      </View>

      <MessageThread
        conversationId={conversationId}
        conversationTitle={conversation?.title || 'Conversation'}
        conversationScope={conversation?.scope || 'Facility'}
        messages={threadMessages}
        currentUserId={currentUserId}
        onSendMessage={handleSendMessage}
        onResendMessage={handleResend}
        onAcknowledgeMessage={async (msgId: string) => {
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

export default function ClinicChatDrawerHost() {
  const { isChatDrawerOpen, closeChatDrawer, activeConversationId, setActiveConversationId } = useClinicComms();
  const { user } = useAuth();
  const { isWorkstation } = useBreakpoint();
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
        title: 'New Clinic Channel',
      });
      setActiveConversationId(created.id);
    } catch {
      // Handled by comms store
    }
  }, [createConversation, setActiveConversationId]);

  if (!isChatDrawerOpen) {
    return null;
  }

  const drawerContent = (
    <View style={styles.drawerPane}>
      <View style={styles.topControlRow}>
        <ThemedText variant="title" color={theme.colors.text}>
          Clinic Communications
        </ThemedText>
        <Pressable
          onPress={closeChatDrawer}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close communications panel"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.drawerBody}>
        {activeConversationId ? (
          <ClinicActiveThread
            conversationId={activeConversationId}
            onBack={() => setActiveConversationId(undefined)}
            currentUserId={user?.id || ''}
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
  );

  // If workstation, render as an overlay docked to the right edge
  if (isWorkstation) {
    return (
      <View style={styles.desktopOverlay}>
        <Pressable style={styles.backdrop} onPress={closeChatDrawer} />
        <View style={styles.dockedPanel}>{drawerContent}</View>
      </View>
    );
  }

  // Mobile / compact: use modal
  return (
    <Modal visible={isChatDrawerOpen} animationType="slide" transparent onRequestClose={closeChatDrawer}>
      <View style={styles.mobileModalContainer}>
        <Pressable style={styles.backdrop} onPress={closeChatDrawer} />
        <View style={styles.mobilePanel}>{drawerContent}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  desktopOverlay: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.overlay,
  },
  dockedPanel: {
    width: 440,
    height: '100%',
    backgroundColor: theme.colors.surface,
    borderLeftWidth: theme.sizes.borderWidth,
    borderLeftColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  mobileModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  mobilePanel: {
    height: '85%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    overflow: 'hidden',
  },
  drawerPane: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: theme.colors.surface,
  },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  closeBtn: {
    minWidth: theme.sizes.touchTarget,
    minHeight: theme.sizes.touchTarget,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  drawerBody: {
    flex: 1,
  },
  threadContainer: {
    flex: 1,
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.md,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.sizes.touchTarget,
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  threadTitle: {
    flex: 1,
  },
});
