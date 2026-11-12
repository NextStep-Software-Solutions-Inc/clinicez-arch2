import React, { useCallback, useMemo, useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { View, StyleSheet, Pressable, Platform, Modal, Animated, useWindowDimensions } from 'react-native';
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
import { getActiveThemeState, subscribeActiveTheme, theme } from '../../constants/theme';
import { PERMISSIONS } from '../../constants/permissions';
import { notify } from '../../utils/feedback';
import { playMessageChime } from '../../utils/alertSounds';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import Button from '../ui/Button';

function getActiveThemeSnapshot(): string {
  const s = getActiveThemeState();
  return `${s.brandColorHex}|${s.clinicBrandColorHex}|${s.userBrandColorHex ?? ''}|${s.scheme}`;
}

export default function ClinicChatDrawerHost() {
  const themeSnapshot = useSyncExternalStore(
    subscribeActiveTheme,
    getActiveThemeSnapshot,
    getActiveThemeSnapshot,
  );
  const resolvedCommsColors = useMemo(() => getActiveThemeState().resolvedColors, [themeSnapshot]);
  const styles = useMemo(() => createStyles(), [themeSnapshot]);

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

  const { width: windowWidth } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(isChatDrawerOpen);

  const slideAnim = useRef(new Animated.Value(isChatDrawerOpen ? 0 : 1)).current;
  const opacityAnim = useRef(new Animated.Value(isChatDrawerOpen ? 1 : 0)).current;
  const widthAnim = useRef(new Animated.Value(isMaximized ? 1 : 0)).current;

  useEffect(() => {
    if (isChatDrawerOpen) {
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start(() => {
        setIsMounted(false);
      });
    }
  }, [isChatDrawerOpen, opacityAnim, slideAnim]);

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: isMaximized ? 1 : 0,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [isMaximized, widthAnim]);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(() => {
      setIsMounted(false);
      closeChatDrawer();
    });
  }, [closeChatDrawer, opacityAnim, slideAnim]);

  const handleOpenPatientChart = useCallback(
    (patientId: string) => {
      handleClose();
      navigation.navigate('Patients', {
        screen: 'PatientDetail',
        params: { patientId, initialTab: 'chart' },
      });
    },
    [handleClose, navigation],
  );

  const connectionStateDisplay =
    status === 'connected'
      ? 'Connected'
      : status === 'reconnecting'
      ? 'Reconnecting'
      : status === 'connecting' || status === 'acquiring_ticket'
      ? 'Connecting'
      : 'Disconnected';

  const isSpinning = isReconnecting || isManualReconnecting || status === 'connecting' || status === 'acquiring_ticket';

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

  if (!isMounted && !isChatDrawerOpen) {
    return null;
  }

  const drawerContent = (
    <View style={styles.drawerPane}>
      {/* Top Header Control Row */}
      <View style={styles.topControlRow}>
        <View style={styles.headerLeftGroup}>
          <ThemedText variant="title" color={theme.colors.primary}>
            Messages
          </ThemedText>

          {/* Live Connection Indicator Pill & Manual Reconnect */}
          <View style={styles.connectionGroup}>
            <View
              style={[
                styles.connectionPill,
                status === 'connected'
                  ? styles.connectionPillConnected
                  : isSpinning || status === 'reconnecting'
                  ? styles.connectionPillReconnecting
                  : styles.connectionPillOffline,
              ]}
            >
              <View
                style={[
                  styles.connectionDot,
                  status === 'connected'
                    ? styles.connectionDotConnected
                    : isSpinning || status === 'reconnecting'
                    ? styles.connectionDotReconnecting
                    : styles.connectionDotOffline,
                ]}
              />
              <ThemedText
                variant="captionBold"
                color={
                  status === 'connected'
                    ? theme.colors.successText
                    : status === 'reconnecting' || isReconnecting || isManualReconnecting || status === 'connecting' || status === 'acquiring_ticket'
                    ? theme.colors.warningText
                    : theme.colors.textMuted
                }
              >
                {status === 'connected'
                  ? 'Connected'
                  : status === 'reconnecting' || isReconnecting || isManualReconnecting || status === 'connecting' || status === 'acquiring_ticket'
                  ? 'Reconnecting...'
                  : 'Offline'}
              </ThemedText>
            </View>

            {/* Manual Reconnect Icon Button positioned right beside connection pill */}
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              iconOnly
              loading={isSpinning}
              onPress={handleManualReconnect}
              accessibilityLabel="Manual reconnect to clinic communications"
            >
              <Icon name="refresh" size={theme.sizes.iconSm} color={theme.colors.textSecondary} spin={isSpinning} />
            </Button>
          </View>
        </View>

        <View style={styles.headerActionsGroup}>
          <Button
            variant="secondary"
            size="sm"
            icon={isMaximized ? 'minimize' : 'maximize'}
            iconOnly
            onPress={handleToggleMaximize}
            accessibilityLabel={isMaximized ? 'Collapse side panel' : 'Expand side panel'}
          >
            <Icon name={isMaximized ? 'minimize' : 'maximize'} size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="close"
            iconOnly
            onPress={handleClose}
            accessibilityLabel="Close communications panel"
          >
            <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </Button>
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
                color={drawerTab === 'conversations' ? theme.colors.primaryDark : theme.colors.textSecondary}
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
                color={drawerTab === 'triage' ? theme.colors.primaryDark : theme.colors.textSecondary}
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
            onOpenPatientChart={handleOpenPatientChart}
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
            colors={resolvedCommsColors}
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
            colors={resolvedCommsColors}
            renderSearchIcon={() => (
              <Icon name="search" size={16} color={theme.colors.textMuted} />
            )}
            renderScopeIcon={(scope) => {
              switch (scope) {
                case 'Direct':
                  return null; // Monogram initials rendered by ChatDrawer
                case 'StaffContext':
                  return <Icon name="users" size={16} color={theme.colors.primary} />;
                case 'Facility':
                  return <Icon name="clinic" size={16} color={theme.colors.primary} />;
                case 'PatientFacility':
                  return <Icon name="heartPulse" size={16} color={theme.colors.primary} />;
                default:
                  return <Icon name="message" size={16} color={theme.colors.primary} />;
              }
            }}
            renderEmptyState={() => (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconBadge}>
                  <Icon name="message" size={28} color={theme.colors.primary} />
                </View>
                <ThemedText variant="bodyBold" style={styles.emptyTitle}>
                  No Conversations
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.emptySubtitle}>
                  No messages match your selected filter.
                </ThemedText>
                <Button
                  title="Start Conversation"
                  variant="primary"
                  onPress={handleNewConversation}
                  style={styles.emptyButton}
                />
              </View>
            )}
          />
        )}
      </View>

      {/* New Conversation Modal */}
      <NewConversationModal
        visible={isNewConvModalOpen}
        onClose={() => setIsNewConvModalOpen(false)}
        onCreateConversation={async (params) => {
          const isFacility = params.scope === 'Facility';
          const isStaffContext = params.scope === 'StaffContext';

          const created = await createConversation({
            scope: params.scope,
            title: params.title,
            contextType: isFacility && params.department ? 'Department' : isStaffContext && params.patientId ? 'Patient' : undefined,
            contextId: isFacility ? params.department : isStaffContext ? params.patientId : undefined,
            department: isFacility ? params.department : undefined,
            participantStaffIds: params.participantStaffIds,
          });
          setActiveConversationId(created.id);
          setIsNewConvModalOpen(false);
        }}
      />
    </View>
  );

  const normalWidth = Math.min(460, windowWidth);
  const targetWidth = windowWidth;
  const animatedWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [normalWidth, targetWidth],
  });
  const slideX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.min(windowWidth, 500)],
  });

  // If workstation, render as an overlay docked to the right edge with slide and width expansion
  if (isWorkstation) {
    return (
      <View style={styles.desktopOverlay}>
        <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.dockedPanel,
            {
              width: animatedWidth,
              transform: [{ translateX: slideX }],
            },
          ]}
        >
          {drawerContent}
        </Animated.View>
      </View>
    );
  }

  // Mobile / compact: use modal
  return (
    <Modal visible={isChatDrawerOpen} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.mobileModalContainer}>
        <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.mobilePanel,
            {
              width: animatedWidth,
              transform: [{ translateX: slideX }],
            },
          ]}
        >
          {drawerContent}
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles() {
  return StyleSheet.create({
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
      ...theme.shadows.lg,
    },
    dockedPanelMaximized: {
      width: '100%',
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
    mobilePanelMaximized: {
      height: '100%',
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
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
    headerActionsGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
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
      backgroundColor: theme.colors.primaryLight,
      borderColor: theme.colors.primaryBorder,
      ...theme.shadows.brandSubtle,
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
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.xl,
    },
    emptyIconBadge: {
      width: 56,
      height: 56,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.md,
    },
    emptyTitle: {
      marginBottom: theme.spacing.xs,
      textAlign: 'center',
    },
    emptySubtitle: {
      textAlign: 'center',
      marginBottom: theme.spacing.lg,
    },
    emptyButton: {
      minWidth: 160,
    },
  });
}
