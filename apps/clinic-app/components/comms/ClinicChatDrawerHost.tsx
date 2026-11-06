import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Platform, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  useComms,
  useConversations,
  useTriageQueue,
} from '@clinicez/comms-sdk/react';
import {
  ChatDrawer,
  TriageQueueView,
} from '@clinicez/comms-sdk/native-ui';
import type {
  ChatDrawerItem,
  ConversationScopeFilter,
  TriageDispositionPayload,
  TriageQueueItem,
} from '@clinicez/comms-sdk/native-ui';
import ClinicActiveThread from './ClinicActiveThread';
import NewConversationModal from './NewConversationModal';
import { useClinicComms } from '../../context/ClinicCommsContext';
import { useAuth } from '../../context/AuthContext';
import { useClinic } from '../../context/ClinicContext';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { theme } from '../../constants/theme';
import { PERMISSIONS } from '../../constants/permissions';
import { notify } from '../../utils/feedback';
import { playMessageChime } from '../../utils/alertSounds';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';

export default function ClinicChatDrawerHost() {
  const { isChatDrawerOpen, closeChatDrawer, activeConversationId, setActiveConversationId } = useClinicComms();
  const { user, can } = useAuth();
  const { facilityName, license } = useClinic();
  const { isWorkstation } = useBreakpoint();
  const comms = useComms();
  const status = comms?.status || 'connected';
  const reconnect = comms?.reconnect;
  const isReconnecting = comms?.isReconnecting || false;
  const navigation = useNavigation<any>();

  const facilityId = license?.clinicId || user?.clinicId || '';
  const canViewTriage = can(PERMISSIONS.triageRead) || can('messaging:triage') || user?.role === 'Admin';

  const [drawerTab, setDrawerTab] = useState<'conversations' | 'triage'>('conversations');
  const [triageFilter, setTriageFilter] = useState<'All' | 'Emergency' | 'Urgent' | 'Routine'>('All');
  const [isManualReconnecting, setIsManualReconnecting] = useState(false);
  const [isNewConvModalOpen, setIsNewConvModalOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Play audio chime when any incoming message is received
  useEffect(() => {
    if (!comms?.client?.events) return;
    const unsub = comms.client.events.on('messageReceived', () => {
      playMessageChime();
    });
    return () => {
      unsub();
    };
  }, [comms?.client]);

  // Reset tab to conversations whenever drawer is opened/closed
  useEffect(() => {
    if (!isChatDrawerOpen) {
      setDrawerTab('conversations');
      setIsMaximized(false);
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
    refresh: refreshConversations,
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

  const isSpinning = isReconnecting || isManualReconnecting;

  const handleManualReconnect = useCallback(async () => {
    if (isManualReconnecting) return;
    setIsManualReconnecting(true);
    try {
      if (typeof reconnect === 'function') {
        await reconnect();
      }
      await Promise.allSettled([
        refreshConversations?.(),
        refreshTriage?.(),
      ]);
      notify.success('Reconnected to clinic communications.');
    } catch (err: any) {
      notify.error(err?.message || 'Reconnect attempt failed.');
    } finally {
      setIsManualReconnecting(false);
    }
  }, [reconnect, refreshConversations, refreshTriage, isManualReconnecting]);

  const handleNewConversation = useCallback(() => {
    setIsNewConvModalOpen(true);
  }, []);

  const handleToggleMaximize = useCallback(() => {
    setIsMaximized((prev) => !prev);
  }, []);

  if (!isChatDrawerOpen) {
    return null;
  }

  const drawerContent = (
    <View style={styles.drawerPane}>
      {/* Top Header Control Row */}
      <View style={styles.topControlRow}>
        <View style={styles.headerLeftGroup}>
          <ThemedText variant="title" color={theme.colors.text}>
            Messages
          </ThemedText>

          {/* Live Connection Indicator Pill & Manual Reconnect */}
          <View style={styles.connectionGroup}>
            <View
              style={[
                styles.connectionPill,
                status === 'connected'
                  ? styles.connectionPillConnected
                  : isSpinning || status === 'connecting' || status === 'reconnecting' || status === 'acquiring_ticket'
                  ? styles.connectionPillReconnecting
                  : styles.connectionPillOffline,
              ]}
            >
              <View
                style={[
                  styles.connectionDot,
                  status === 'connected'
                    ? styles.connectionDotConnected
                    : isSpinning || status === 'connecting' || status === 'reconnecting' || status === 'acquiring_ticket'
                    ? styles.connectionDotReconnecting
                    : styles.connectionDotOffline,
                ]}
              />
              <ThemedText
                variant="captionBold"
                color={
                  status === 'connected'
                    ? theme.colors.successText
                    : isSpinning || status === 'connecting' || status === 'reconnecting' || status === 'acquiring_ticket'
                    ? theme.colors.warningText
                    : theme.colors.textMuted
                }
              >
                {status === 'connected'
                  ? 'Connected'
                  : isSpinning || status === 'connecting' || status === 'reconnecting' || status === 'acquiring_ticket'
                  ? 'Reconnecting...'
                  : 'Offline'}
              </ThemedText>
            </View>

            {/* Manual Reconnect Icon Button positioned right beside connection pill */}
            <Pressable
              onPress={handleManualReconnect}
              style={styles.reconnectBtn}
              accessibilityRole="button"
              accessibilityLabel="Manual reconnect to clinic communications"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="refresh" size={theme.sizes.iconSm} color={theme.colors.textSecondary} spin={isSpinning} />
            </Pressable>
          </View>
        </View>

        <View style={styles.headerActionsGroup}>
          <Pressable
            onPress={handleToggleMaximize}
            style={styles.headerIconButton}
            accessibilityRole="button"
            accessibilityLabel={isMaximized ? "Collapse side panel" : "Expand side panel"}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name={isMaximized ? "minimize" : "maximize"} size={theme.sizes.iconSm} color={theme.colors.textMuted} />
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
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
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
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
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
            initialConversation={conversations.find((c) => c.id === activeConversationId)}
            onBack={() => setActiveConversationId(undefined)}
            currentUserId={user?.id || ''}
          />
        ) : drawerTab === 'triage' && canViewTriage ? (
          <TriageQueueView
            items={mappedTriageItems}
            facilityName={facilityName || 'Clinic EZ'}
            onExecuteDisposition={handleExecuteDisposition}
            onRefresh={refreshTriage}
            onSelectCard={(conversationId) => setActiveConversationId(conversationId)}
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

      {/* New Conversation Modal */}
      <NewConversationModal
        visible={isNewConvModalOpen}
        onClose={() => setIsNewConvModalOpen(false)}
        onCreateConversation={async (params) => {
          const created = await createConversation({
            scope: params.scope,
            title: params.title,
            contextId: params.patientId,
            category: params.department as any,
            participantStaffIds: params.participantStaffIds,
          });
          setActiveConversationId(created.id);
          setIsNewConvModalOpen(false);
        }}
      />
    </View>
  );

  // If workstation, render as an overlay docked to the right edge
  if (isWorkstation) {
    return (
      <View style={styles.desktopOverlay}>
        <Pressable style={styles.backdrop} onPress={closeChatDrawer} />
        <View style={[styles.dockedPanel, isMaximized && styles.dockedPanelMaximized]}>{drawerContent}</View>
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
  dockedPanelMaximized: {
    width: '100%',
    maxWidth: 960,
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
    gap: theme.spacing.xs,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
    flexWrap: 'wrap',
  },
  connectionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    gap: 6,
  },
  connectionPillConnected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderLight,
  },
  connectionPillReconnecting: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.warningBorder,
  },
  connectionPillOffline: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.emergencyBorder,
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radii.full,
  },
  connectionDotConnected: {
    backgroundColor: theme.colors.successText,
  },
  connectionDotReconnecting: {
    backgroundColor: theme.colors.warning,
  },
  connectionDotOffline: {
    backgroundColor: theme.colors.emergency,
  },
  reconnectBtn: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  headerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  tabSegmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.xs,
    padding: 3,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  tabButton: {
    flex: 1,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.transparent,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.transparent,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  tabButtonActive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderLight,
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
});
