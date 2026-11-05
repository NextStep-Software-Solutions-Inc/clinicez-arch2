import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Platform, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  useComms,
  useConversations,
  useConversation,
  useSendMessage,
  useTriageQueue,
} from '@clinicez/comms-sdk/react';
import {
  ChatDrawer,
  MessageThread,
  TriageQueueView,
} from '@clinicez/comms-sdk/native-ui';
import type {
  ChatDrawerItem,
  ConversationScopeFilter,
  ThreadMessage,
  TriageDispositionPayload,
  TriageQueueItem,
} from '@clinicez/comms-sdk/native-ui';
import { useClinicComms } from '../../context/ClinicCommsContext';
import { useAuth } from '../../context/AuthContext';
import { useClinic } from '../../context/ClinicContext';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { theme } from '../../constants/theme';
import { PERMISSIONS } from '../../constants/permissions';
import { notify } from '../../utils/feedback';
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
  const { user, can } = useAuth();
  const { facilityName, license } = useClinic();
  const { isWorkstation } = useBreakpoint();
  const { status } = useComms();
  const navigation = useNavigation<any>();

  const facilityId = license?.clinicId || user?.clinicId || '';
  const canViewTriage = can(PERMISSIONS.triageRead) || can('messaging:triage') || user?.role === 'Admin';

  const [drawerTab, setDrawerTab] = useState<'conversations' | 'triage'>('conversations');
  const [triageFilter, setTriageFilter] = useState<'All' | 'Emergency' | 'Urgent' | 'Routine'>('All');

  // Reset tab to conversations whenever drawer is opened/closed
  useEffect(() => {
    if (!isChatDrawerOpen) {
      setDrawerTab('conversations');
    }
  }, [isChatDrawerOpen]);

  // If user cannot view triage, ensure drawerTab stays on conversations
  useEffect(() => {
    if (!canViewTriage && drawerTab === 'triage') {
      setDrawerTab('conversations');
    }
  }, [canViewTriage, drawerTab]);

  const {
    conversations,
    unreadCount,
    isLoading,
    error,
    createConversation,
  } = useConversations();

  const {
    items: triageItems,
    pendingCount: pendingTriageCount,
    urgentCount: urgentTriageCount,
    isLoading: isTriageLoading,
    error: triageError,
    refresh: refreshTriage,
    answerRequest,
    requestVisit,
    declineRequest,
    routeToStaff,
  } = useTriageQueue(facilityId);

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

  const mappedTriageItems: TriageQueueItem[] = useMemo(() => {
    return triageItems.map((i) => ({
      conversationId: i.id,
      requestId: i.id,
      patientId: i.contextId || i.id,
      patientNameMasked: i.patientFullName || i.title || 'Patient Inquiry',
      patientDobMasked: '',
      patientAgeGender: `${i.patientAge || 'Adult'} • ${i.patientSex || 'Patient'}`,
      category: i.category || 'General',
      contentText: i.lastMessageSnippet || 'Patient inquiry pending triage review.',
      priority: (i.priority as 'Emergency' | 'Urgent' | 'Routine') || 'Routine',
      status: (i.status as 'Submitted' | 'WithTriage' | 'Routed') || 'Submitted',
      submittedAtUtc: i.createdAtUtc,
      triageDueAtUtc: i.triageDueAtUtc || i.createdAtUtc,
      isOffHours: false,
      slaBreached: i.isSlaBreached,
      slaTimeRemainingSeconds: i.slaTimeRemainingSeconds,
      isEmergencyConfirmed: i.isEmergencyConfirmed ?? false,
      assignedStaffId: i.assignedStaffId ?? undefined,
      assignedStaffName: i.assignedStaffName ?? undefined,
    }));
  }, [triageItems]);

  const handleExecuteDisposition = useCallback(
    async (payload: TriageDispositionPayload) => {
      try {
        if (payload.disposition === 'Answered') {
          await answerRequest(
            payload.conversationId,
            payload.replyText || 'Inquiry answered by clinic staff.',
          );
          notify.success('Inquiry disposition recorded: Answered.');
        } else if (payload.disposition === 'NeedsVisit') {
          await requestVisit(
            payload.conversationId,
            payload.replyText || 'In-clinic consultation recommended for patient evaluation.',
          );
          notify.success('Inquiry disposition recorded: In-Clinic Visit Requested.');
        } else if (payload.disposition === 'Declined') {
          await declineRequest(
            payload.conversationId,
            payload.declineReasonCode || 'OTHER',
            payload.declineNotes || 'Request could not be processed.',
          );
          notify.success('Inquiry disposition recorded: Declined.');
        } else if (payload.disposition === 'Routed') {
          await routeToStaff(
            payload.conversationId,
            payload.routedStaffId || user?.id || 'staff',
            'Attending Clinician',
            payload.routedPriority || 'Routine',
            payload.replyText,
          );
          notify.success('Inquiry routed to attending clinician.');
        }
      } catch (err: any) {
        notify.error(err?.message || 'Failed to record triage disposition.');
      }
    },
    [answerRequest, requestVisit, declineRequest, routeToStaff, user?.id],
  );

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

  const handleExpandFullscreen = useCallback(() => {
    closeChatDrawer();
    navigation.navigate('Triage');
  }, [closeChatDrawer, navigation]);

  if (!isChatDrawerOpen) {
    return null;
  }

  const drawerContent = (
    <View style={styles.drawerPane}>
      {/* Top Header Control Row */}
      <View style={styles.topControlRow}>
        <ThemedText variant="title" color={theme.colors.text}>
          Clinic Communications
        </ThemedText>
        <View style={styles.headerActionsGroup}>
          <Pressable
            onPress={handleExpandFullscreen}
            style={styles.headerIconButton}
            accessibilityRole="button"
            accessibilityLabel="Expand to full screen"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="maximize" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </Pressable>
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
      </View>

      {/* Segmented Dual-Tab Bar (rendered when no active thread and staff has triage permission) */}
      {!activeConversationId && canViewTriage && (
        <View style={styles.tabSegmentBar}>
          <Pressable
            onPress={() => setDrawerTab('conversations')}
            style={[
              styles.tabButton,
              drawerTab === 'conversations' && styles.tabButtonActive,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: drawerTab === 'conversations' }}
          >
            <View style={styles.tabBadgeRow}>
              <ThemedText
                variant="smallBold"
                color={drawerTab === 'conversations' ? theme.colors.primary : theme.colors.textSecondary}
              >
                Conversations
              </ThemedText>
              {unreadCount > 0 ? (
                <View style={styles.tabUnreadBadge}>
                  <ThemedText variant="badge" color={theme.colors.onPrimary}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </Pressable>

          <Pressable
            onPress={() => setDrawerTab('triage')}
            style={[
              styles.tabButton,
              drawerTab === 'triage' && styles.tabButtonActive,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: drawerTab === 'triage' }}
          >
            <View style={styles.tabBadgeRow}>
              <ThemedText
                variant="smallBold"
                color={drawerTab === 'triage' ? theme.colors.primary : theme.colors.textSecondary}
              >
                Triage Requests
              </ThemedText>
              {pendingTriageCount > 0 ? (
                <View
                  style={[
                    styles.triageCountPill,
                    urgentTriageCount > 0 && styles.triageCountPillUrgent,
                  ]}
                >
                  <ThemedText variant="badge" color={theme.colors.onPrimary}>
                    {pendingTriageCount > 99 ? '99+' : pendingTriageCount}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </Pressable>
        </View>
      )}

      {/* Main Drawer Body */}
      <View style={styles.drawerBody}>
        {activeConversationId ? (
          <ClinicActiveThread
            conversationId={activeConversationId}
            onBack={() => setActiveConversationId(undefined)}
            currentUserId={user?.id || ''}
          />
        ) : drawerTab === 'triage' && canViewTriage ? (
          <TriageQueueView
            items={mappedTriageItems}
            facilityName={facilityName || 'Clinic EZ'}
            onExecuteDisposition={handleExecuteDisposition}
            onRefresh={refreshTriage}
            isLoading={isTriageLoading}
            error={triageError ? triageError.message : null}
            activeFilter={triageFilter}
            onFilterChange={setTriageFilter}
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
    width: 460,
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
  headerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  headerIconButton: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  closeBtn: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  tabSegmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  tabButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.transparent,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.transparent,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tabBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  tabUnreadBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 5,
    minWidth: 16,
    height: 16,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triageCountPill: {
    backgroundColor: theme.colors.urgent,
    paddingHorizontal: 5,
    minWidth: 16,
    height: 16,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triageCountPillUrgent: {
    backgroundColor: theme.colors.emergency,
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
