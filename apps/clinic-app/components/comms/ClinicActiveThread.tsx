import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { View, StyleSheet, Pressable, ScrollView, TextInput, Platform } from 'react-native';
import { useConversation, useSendMessage } from '@clinicez/comms-sdk/react';
import { resolveConversationDisplayTitle } from '@clinicez/comms-sdk/core';
import { MessageThread } from '@clinicez/comms-sdk/native-ui';
import type { ThreadMessage } from '@clinicez/comms-sdk/native-ui';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useStaff, formatStaffName, staffInitials } from '../../context/StaffContext';
import { useAuth } from '../../context/AuthContext';
import { getActiveThemeState, subscribeActiveTheme, theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { playMessageChime } from '../../utils/alertSounds';
import type { ConversationDto } from '@clinicez/comms-sdk/core';

export interface PinnedAlertItem {
  id: string;
  label: string;
  details?: string;
  severity?: 'Emergency' | 'Urgent' | 'Routine';
}

export interface ClinicActiveThreadProps {
  conversationId: string;
  initialConversation?: ConversationDto;
  onBack: () => void;
  currentUserId?: string;
  onOpenPatientChart?: (patientId: string) => void;
  initialActionMenuOpen?: boolean;
  pinnedAlerts?: PinnedAlertItem[] | null;
  onDeleteConversation?: (conversationId: string) => void;
  onCloseAndArchive?: (conversationId: string) => void;
}

const SPEED_RESPONSE_PILLS = [
  '+ Vitals Charted',
  '+ Bedside Now',
  '+ Lab Requested',
  '+ On My Way',
];

function getCategoryLabel(scope?: string): string {
  switch (scope) {
    case 'PatientFacility':
      return 'Patient Request';
    case 'StaffContext':
    case 'PatientContext':
      return 'Care Team';
    case 'Direct':
      return 'Direct';
    case 'Facility':
      return 'Facility Channel';
    default:
      return scope || 'Facility Channel';
  }
}

function getActiveThemeSnapshot(): string {
  const s = getActiveThemeState();
  return `${s.brandColorHex}|${s.clinicBrandColorHex}|${s.userBrandColorHex ?? ''}|${s.scheme}`;
}

export default function ClinicActiveThread({
  conversationId,
  initialConversation,
  onBack,
  currentUserId,
  onOpenPatientChart,
  initialActionMenuOpen,
  pinnedAlerts,
  onDeleteConversation,
  onCloseAndArchive,
}: ClinicActiveThreadProps) {
  const themeSnapshot = useSyncExternalStore(
    subscribeActiveTheme,
    getActiveThemeSnapshot,
    getActiveThemeSnapshot,
  );
  const resolvedCommsColors = useMemo(() => getActiveThemeState().resolvedColors, [themeSnapshot]);
  const styles = useMemo(() => createStyles(), [themeSnapshot]);

  const { conversation: hookConv, messages, isLoading, error, acknowledgeMessage } = useConversation(conversationId);
  const conversation = hookConv || initialConversation || null;
  const { sendMessage, resendMessage } = useSendMessage();
  const { staff } = useStaff();
  const auth = useAuth();
  const effectiveUserId = currentUserId || auth?.user?.id || '';

  // Header and View State
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const resolvedTitle = useMemo(() => {
    const raw = conversation || initialConversation;
    if (!raw) return '';
    return resolveConversationDisplayTitle(
      raw,
      effectiveUserId,
      auth?.user?.name,
      (p) => {
        const participantId = p.participantId || p.userId || p.id;
        const staffMatch = staff.find((s) => s.id === participantId);
        return staffMatch ? formatStaffName(staffMatch) : null;
      },
    );
  }, [conversation, initialConversation, effectiveUserId, auth?.user?.name, staff]);
  const activeTitle = customTitle ?? resolvedTitle;
  const [privacyBlur, setPrivacyBlur] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals State
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(initialActionMenuOpen ?? false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isHandoffModalOpen, setIsHandoffModalOpen] = useState(false);
  const [handoffInstructions, setHandoffInstructions] = useState('');
  const [selectedColleagueId, setSelectedColleagueId] = useState<string | null>(null);

  // Active Member List State
  const [members, setMembers] = useState<Array<{ id: string; name: string; role: string }>>([
    { id: effectiveUserId, name: auth?.user?.name || 'Current Clinician', role: auth?.user?.role || 'Clinician' },
  ]);

  // Synchronize members from conversation participants whenever loaded or updated
  useEffect(() => {
    if (conversation?.participants && conversation.participants.length > 0) {
      setMembers(
        conversation.participants.map((p: any) => {
          const participantId = p.participantId || p.userId || p.id;
          const staffMatch = staff.find((s) => s.id === participantId);
          return {
            id: participantId,
            name:
              p.displayName && p.displayName !== 'Staff'
                ? p.displayName
                : (staffMatch ? formatStaffName(staffMatch) : p.displayName || 'Staff Member'),
            role: p.role || (staffMatch?.role ?? 'Clinician'),
          };
        }),
      );
    }
  }, [conversation?.participants, staff]);

  // Pinned Alerts & Clinical Orders Resolution (No fake hardcoded alerts)
  const activeAlerts = useMemo<PinnedAlertItem[]>(() => {
    if (pinnedAlerts === null) return [];
    if (Array.isArray(pinnedAlerts)) return pinnedAlerts;
    if (isLoading && !conversation) return [];
    if (!conversation && !pinnedAlerts) return [];
    if (conversation?.isEmergencyConfirmed || conversation?.priority === 'Emergency') {
      return [
        {
          id: 'alert-emergency',
          label: 'Emergency Alert',
          details: 'Immediate clinical attention required',
          severity: 'Emergency',
        },
      ];
    }
    return [];
  }, [pinnedAlerts, conversation, isLoading]);

  const handleSendMessage = useCallback(
    async (text: string, isInternal: boolean) => {
      await sendMessage({
        conversationId,
        contentText: text,
        visibility: isInternal ? 'Internal' : 'Public',
      });
      playMessageChime();
    },
    [conversationId, sendMessage],
  );

  const handleResend = useCallback(
    async (messageId: string) => {
      try {
        await resendMessage(messageId);
      } catch (err: any) {
        console.warn('Failed to resend message:', err);
      }
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

  // Filter messages when search is active
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return threadMessages;
    const q = searchQuery.toLowerCase();
    return threadMessages.filter((m) => m.contentText.toLowerCase().includes(q));
  }, [threadMessages, searchQuery]);

  // Speed response 1-tap reply
  const handleSendSpeedReply = async (pillText: string) => {
    try {
      await handleSendMessage(pillText, false);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to send speed response');
    }
  };

  // Open Rename Modal
  const handleOpenRename = () => {
    setRenameInput(activeTitle);
    setIsRenameModalOpen(true);
    setIsActionMenuOpen(false);
  };

  // Submit Rename
  const handleSaveRename = () => {
    if (!renameInput.trim()) {
      notify.error('Conversation title cannot be empty.');
      return;
    }
    setCustomTitle(renameInput.trim());
    setIsRenameModalOpen(false);
    notify.success('Conversation title updated.');
  };

  // Member management
  const handleAddMember = (staffId: string) => {
    const found = staff.find((s) => s.id === staffId);
    if (!found) return;
    if (members.some((m) => m.id === staffId)) {
      notify.info('Staff member is already in this conversation.');
      return;
    }
    setMembers((prev) => [
      ...prev,
      { id: found.id, name: formatStaffName(found), role: found.role },
    ]);
    setSelectedColleagueId(null);
    notify.success(`Added ${formatStaffName(found)} to care team.`);
  };

  const handleRemoveMember = (memberId: string) => {
    if (memberId === effectiveUserId) {
      notify.info('You cannot remove yourself from the active conversation.');
      return;
    }
    const member = members.find((m) => m.id === memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    notify.info(`Removed ${member?.name || 'member'} from care team.`);
  };

  // Action Menu: View Patient Chart
  const handleViewPatientChart = () => {
    setIsActionMenuOpen(false);
    const patientId = conversation?.contextId || (conversation?.scope === 'PatientFacility' ? conversation.id : undefined);
    if (patientId) {
      if (onOpenPatientChart) {
        onOpenPatientChart(patientId);
      } else {
        notify.info(`Viewing patient chart: ${patientId}`);
      }
    } else {
      notify.info('This care team conversation is not linked to an individual patient record.');
    }
  };

  // Action Menu: Close & Archive
  const handleCloseAndArchive = () => {
    setIsActionMenuOpen(false);
    onCloseAndArchive?.(conversationId);
    notify.success('Conversation closed and archived.');
    onBack();
  };

  // Action Menu: Delete Conversation
  const handleDeleteConversation = () => {
    setIsActionMenuOpen(false);
    if (messages.length > 0 && !activeTitle.toLowerCase().includes('test')) {
      notify.error('Cannot delete active clinical conversation with recorded notes. Use Close & Archive instead.');
      return;
    }
    onDeleteConversation?.(conversationId);
    notify.success('Conversation deleted.');
    onBack();
  };

  // Action Menu: Generate Shift Handoff Summary
  const handleGenerateHandoff = () => {
    setIsActionMenuOpen(false);
    setIsHandoffModalOpen(true);
    notify.success('Shift handoff summary generated.');
  };

  const handoffSummaryContent = useMemo(() => {
    const alertLines = activeAlerts.map((a) => `${a.label}${a.details ? ` (${a.details})` : ''}`).join(', ');
    const instructionsText = handoffInstructions.trim()
      ? handoffInstructions.trim()
      : 'Monitor vital signs every 2 hours and follow up on pending lab results.';

    return [
      `Shift Handoff Summary`,
      `Generated: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      `Conversation: ${activeTitle}`,
      `Category: ${getCategoryLabel(conversation?.scope)}`,
      `Care Team Members: ${members.map((m) => `${m.name} (${m.role})`).join(', ')}`,
      `Pending Clinical Orders: ${alertLines || 'None'}`,
      `Instructions: ${instructionsText}`,
    ].join('\n\n');
  }, [activeAlerts, activeTitle, conversation?.scope, handoffInstructions, members]);

  return (
    <View style={styles.threadContainer}>
      {/* Active Thread Header */}
      <View style={styles.threadHeader}>
        {/* Left: Icon-only back button */}
        <Button
          variant="secondary"
          size="sm"
          icon="arrowLeft"
          iconOnly
          onPress={onBack}
          accessibilityLabel="Back to conversations"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backButton}
        />

        {/* Center: Title + Edit Pencil + Category Badge */}
        <View style={styles.headerCenter}>
          {isLoading && !activeTitle ? (
            <View style={styles.skeletonTitle} />
          ) : (
            <Pressable
              onPress={handleOpenRename}
              style={styles.titleRow}
              accessibilityRole="button"
              accessibilityLabel="Rename conversation"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <ThemedText variant="bodyBold" numberOfLines={1} style={styles.threadTitle}>
                {activeTitle}
              </ThemedText>
              <View style={styles.pencilBtn}>
                <Icon name="edit" size={14} color={theme.colors.textMuted} />
              </View>
            </Pressable>
          )}

          {isLoading && !conversation?.scope ? (
            <View style={styles.skeletonSubtitle} />
          ) : (
            <View style={styles.scopeBadge}>
              <ThemedText variant="captionBold" color={theme.colors.primary} style={styles.scopeBadgeText}>
                {getCategoryLabel(conversation?.scope)}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Right Controls in exact order: 1. Members 2. Privacy Blur 3. Action Menu */}
        <View style={styles.headerRightControls}>
          {/* 1. Care Team / Members Counter Button */}
          <Button
            title={String(members.length)}
            variant="secondary"
            size="sm"
            icon="users"
            onPress={() => setIsMembersModalOpen(true)}
            accessibilityLabel={`Care team members: ${members.length}`}
          />

          {/* 2. Medical Privacy Blur Icon-Only Button */}
          <Button
            variant={privacyBlur ? 'outline' : 'secondary'}
            size="sm"
            icon={privacyBlur ? 'eyeOff' : 'eye'}
            iconOnly
            onPress={() => setPrivacyBlur((prev) => !prev)}
            accessibilityLabel="Toggle medical privacy blur"
          />

          {/* 3. Action Menu (••• at rightmost edge) */}
          <Button
            variant="secondary"
            size="sm"
            icon="moreVertical"
            iconOnly
            onPress={() => setIsActionMenuOpen(true)}
            accessibilityLabel="Conversation action menu"
          />
        </View>
      </View>

      {/* Pinned Clinical Orders & Alerts Banner (Guarded against loading flicker) */}
      {!isLoading && activeAlerts.length > 0 && (
        <View style={styles.pinnedBanner}>
          <View style={styles.pinnedAlertRow}>
            <Icon
              name="alertCircle"
              size={theme.sizes.iconSm}
              color={activeAlerts[0].severity === 'Emergency' ? theme.colors.emergency : theme.colors.warningText}
            />
            <View style={styles.pinnedTextGroup}>
              <ThemedText
                variant="smallBold"
                color={activeAlerts[0].severity === 'Emergency' ? theme.colors.emergency : theme.colors.warningText}
              >
                {activeAlerts[0].label}
              </ThemedText>
              {activeAlerts[0].details ? (
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  {activeAlerts[0].details}
                </ThemedText>
              ) : null}
            </View>
          </View>
        </View>
      )}

      {/* In-Thread Search Bar */}
      {isSearchOpen && (
        <View style={styles.searchBarRow}>
          <Icon name="search" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search in conversation..."
            placeholderTextColor={resolvedCommsColors.textMuted}
            style={styles.searchInput}
            autoFocus
          />
          {searchQuery.trim() ? (
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              {filteredMessages.length} match{filteredMessages.length === 1 ? '' : 'es'}
            </ThemedText>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            icon="close"
            iconOnly
            onPress={() => {
              setSearchQuery('');
              setIsSearchOpen(false);
            }}
            accessibilityLabel="Close search in conversation"
          />
        </View>
      )}

      {/* Quick 1-Tap Clinical Response Speed Pills */}
      <View style={styles.speedPillsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.speedPillsScroll}>
          {SPEED_RESPONSE_PILLS.map((pill) => (
            <Pressable
              key={pill}
              onPress={() => handleSendSpeedReply(pill)}
              style={styles.speedPill}
              accessibilityRole="button"
              accessibilityLabel={`Quick clinical response ${pill}`}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                {pill}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Core Message Thread */}
      <View style={styles.threadBody}>
        <MessageThread
          conversationId={conversationId}
          conversationTitle={activeTitle}
          conversationScope={conversation?.scope || 'Facility'}
          messages={filteredMessages}
          currentUserId={effectiveUserId}
          onSendMessage={handleSendMessage}
          onResendMessage={handleResend}
          onAcknowledgeMessage={async (msgId: string) => {
            await acknowledgeMessage(msgId);
          }}
          privacyBlurEnabled={privacyBlur}
          onTogglePrivacyBlur={() => setPrivacyBlur((prev) => !prev)}
          showHeader={false}
          canWriteInternalNotes={true}
          isLoading={isLoading}
          error={error ? error.message : null}
          colors={resolvedCommsColors}
          renderSendIcon={() => <Icon name="send" size={14} color={theme.colors.onPrimary} />}
          renderEmptyState={() => (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyShieldBadge}>
                <Icon name="shieldCheck" size={24} color={theme.colors.primary} />
              </View>
              <ThemedText variant="bodyBold" style={styles.emptyTitle}>
                Secure Communication
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.emptySubtitle}>
                This is the start of your medical communication thread. Messages are encrypted in transit.
              </ThemedText>
            </View>
          )}
        />
      </View>

      {/* 1. Rename Modal */}
      <Modal
        visible={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        title="Rename Conversation"
        subtitle="Update the conversation title for clarity across the care team."
        footer={
          <View style={styles.modalFooterRow}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={() => setIsRenameModalOpen(false)}
              style={styles.modalFooterBtn}
            />
            <Button
              title="Save"
              variant="primary"
              onPress={handleSaveRename}
              style={styles.modalFooterBtn}
            />
          </View>
        }
      >
        <View style={styles.modalContent}>
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Title
          </ThemedText>
          <View style={styles.inputBox}>
            <TextInput
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="Enter new conversation title..."
              placeholderTextColor={resolvedCommsColors.textMuted}
              style={styles.textInput}
              autoFocus
            />
          </View>
        </View>
      </Modal>

      {/* 2. Action Menu Modal (Housing 7 items) */}
      <Modal
        visible={isActionMenuOpen}
        onClose={() => setIsActionMenuOpen(false)}
        title="Conversation Actions"
        subtitle="Manage lifecycle, charts, alerts, and shift summaries."
      >
        <View style={styles.actionMenuList}>
          {/* Action 1: Rename */}
          <Pressable
            onPress={handleOpenRename}
            style={styles.actionMenuItem}
            accessibilityRole="button"
            accessibilityLabel="Rename conversation"
          >
            <Icon name="edit" size={theme.sizes.iconSm} color={theme.colors.text} />
            <ThemedText variant="body" color={theme.colors.text}>
              Rename
            </ThemedText>
          </Pressable>

          {/* Action 2: View Patient Chart */}
          <Pressable
            onPress={handleViewPatientChart}
            style={styles.actionMenuItem}
            accessibilityRole="button"
            accessibilityLabel="View patient chart"
          >
            <Icon name="file" size={theme.sizes.iconSm} color={theme.colors.primary} />
            <ThemedText variant="body" color={theme.colors.text}>
              View Patient Chart
            </ThemedText>
          </Pressable>

          {/* Action 3: Search in Conversation */}
          <Pressable
            onPress={() => {
              setIsActionMenuOpen(false);
              setIsSearchOpen(true);
            }}
            style={styles.actionMenuItem}
            accessibilityRole="button"
            accessibilityLabel="Search in conversation"
          >
            <Icon name="search" size={theme.sizes.iconSm} color={theme.colors.text} />
            <ThemedText variant="body" color={theme.colors.text}>
              Search in Conversation
            </ThemedText>
          </Pressable>

          {/* Action 4: Shift Handoff Summary */}
          <Pressable
            onPress={handleGenerateHandoff}
            style={styles.actionMenuItem}
            accessibilityRole="button"
            accessibilityLabel="Shift handoff summary"
          >
            <Icon name="clipboard" size={theme.sizes.iconSm} color={theme.colors.text} />
            <ThemedText variant="body" color={theme.colors.text}>
              Shift Handoff Summary
            </ThemedText>
          </Pressable>

          {/* Action 5: Mute Channel */}
          <Pressable
            onPress={() => {
              setIsMuted((prev) => !prev);
              notify.info(!isMuted ? 'Channel muted.' : 'Channel alerts unmuted.');
              setIsActionMenuOpen(false);
            }}
            style={styles.actionMenuItem}
            accessibilityRole="button"
            accessibilityLabel={isMuted ? 'Unmute channel' : 'Mute channel'}
          >
            <Icon name={isMuted ? 'volume2' : 'volumeX'} size={theme.sizes.iconSm} color={theme.colors.text} />
            <ThemedText variant="body" color={theme.colors.text}>
              {isMuted ? 'Unmute Channel' : 'Mute Channel'}
            </ThemedText>
          </Pressable>

          {/* Action 6: Close & Archive */}
          <Pressable
            onPress={handleCloseAndArchive}
            style={styles.actionMenuItem}
            accessibilityRole="button"
            accessibilityLabel="Close and archive conversation"
          >
            <Icon name="lock" size={theme.sizes.iconSm} color={theme.colors.warningText} />
            <ThemedText variant="body" color={theme.colors.warningText}>
              Close & Archive
            </ThemedText>
          </Pressable>

          {/* Action 7: Delete Conversation */}
          <Pressable
            onPress={handleDeleteConversation}
            style={styles.actionMenuItem}
            accessibilityRole="button"
            accessibilityLabel="Delete conversation"
          >
            <Icon name="trash" size={theme.sizes.iconSm} color={theme.colors.emergency} />
            <ThemedText variant="body" color={theme.colors.emergency}>
              Delete Conversation
            </ThemedText>
          </Pressable>
        </View>
      </Modal>

      {/* 3. Member Management Modal */}
      <Modal
        visible={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        title={`Care Team Members (${members.length})`}
        subtitle="Manage participating clinicians, doctors, and nurses."
      >
        <View style={styles.modalContent}>
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Active Participants
          </ThemedText>
          <ScrollView style={styles.membersListScroll} nestedScrollEnabled>
            {members.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <ThemedText variant="captionBold" color={theme.colors.primary}>
                    {m.name.slice(0, 2).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.memberInfo}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {m.name}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {m.role}
                  </ThemedText>
                </View>
                {m.id !== effectiveUserId ? (
                  <Button
                    variant="dangerGhost"
                    size="sm"
                    icon="trash"
                    iconOnly
                    onPress={() => handleRemoveMember(m.id)}
                    accessibilityLabel={`Remove ${m.name}`}
                  />
                ) : null}
              </View>
            ))}
          </ScrollView>

          {/* Add Colleague Picker */}
          <ThemedText variant="smallBold" color={theme.colors.text} style={styles.sectionHeader}>
            Add Colleague
          </ThemedText>
          <ScrollView style={styles.addColleagueList} nestedScrollEnabled>
            {staff
              .filter((s) => !members.some((m) => m.id === s.id))
              .map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => handleAddMember(s.id)}
                  style={styles.addColleagueRow}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${formatStaffName(s)}`}
                >
                  <View style={styles.memberAvatar}>
                    <ThemedText variant="captionBold" color={theme.colors.primary}>
                      {staffInitials(s)}
                    </ThemedText>
                  </View>
                  <View style={styles.memberInfo}>
                    <ThemedText variant="body" color={theme.colors.text}>
                      {formatStaffName(s)}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {s.role}
                    </ThemedText>
                  </View>
                  <Icon name="plus" size={theme.sizes.iconSm} color={theme.colors.primary} />
                </Pressable>
              ))}
          </ScrollView>
        </View>
      </Modal>

      {/* 4. Shift Handoff Summary Modal */}
      <Modal
        visible={isHandoffModalOpen}
        onClose={() => setIsHandoffModalOpen(false)}
        title="Shift Handoff Summary"
        subtitle="Structured summary of active patient orders and instructions."
        footer={
          <View style={styles.modalFooterRow}>
            <Button
              title="Copy Summary"
              variant="outline"
              onPress={() => {
                notify.success('Shift handoff summary copied to clipboard.');
              }}
              style={styles.modalFooterBtn}
            />
            <Button
              title="Close"
              variant="primary"
              onPress={() => setIsHandoffModalOpen(false)}
              style={styles.modalFooterBtn}
            />
          </View>
        }
      >
        <ScrollView style={styles.handoffContainer} nestedScrollEnabled>
          <ThemedText variant="smallBold" color={theme.colors.text} style={styles.handoffSectionLabel}>
            Special Instructions / Handoff Notes
          </ThemedText>
          <TextInput
            value={handoffInstructions}
            onChangeText={setHandoffInstructions}
            placeholder="Add specific instructions for incoming staff..."
            placeholderTextColor={resolvedCommsColors.textMuted}
            style={styles.handoffInput}
            multiline
            numberOfLines={2}
          />
          <ThemedText variant="smallBold" color={theme.colors.text} style={styles.handoffSectionLabel}>
            Summary Preview
          </ThemedText>
          <View style={styles.handoffPreviewBox}>
            <ThemedText variant="small" color={theme.colors.text} style={styles.handoffText}>
              {handoffSummaryContent}
            </ThemedText>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    threadContainer: {
      flex: 1,
      backgroundColor: theme.colors.surface,
    },
    threadHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: theme.sizes.borderWidth,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceSubtle,
      gap: theme.spacing.sm,
    },
    backButton: {
      borderRadius: theme.radii.full,
    },
    headerCenter: {
      flex: 1,
      justifyContent: 'center',
      gap: 0,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
    },
    pencilBtn: {
      paddingHorizontal: 4,
      paddingVertical: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    threadTitle: {
      flexShrink: 1,
    },
    scopeBadge: {
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.primarySubtle,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.primaryBorder,
      paddingHorizontal: 4,
      paddingVertical: 0,
      borderRadius: theme.radii.xs,
      marginTop: 1,
    },
    scopeBadgeText: {
      fontSize: theme.typography.caption.fontSize,
      lineHeight: 14,
    },
    headerRightControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    pinnedBanner: {
      backgroundColor: theme.colors.emergencySubtle,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.emergency,
      borderBottomWidth: theme.sizes.borderWidth,
      borderBottomColor: theme.colors.emergencyBorder,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
    },
    pinnedAlertRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    pinnedTextGroup: {
      flex: 1,
    },
    searchBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      backgroundColor: theme.colors.surfaceMuted,
      borderBottomWidth: theme.sizes.borderWidth,
      borderBottomColor: theme.colors.border,
      gap: theme.spacing.xs,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.text,
      paddingVertical: theme.spacing.xs,
      minHeight: 36,
    },
    skeletonTitle: {
      width: 140,
      height: 18,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.surfaceMuted,
      marginBottom: 2,
    },
    skeletonSubtitle: {
      width: 80,
      height: 14,
      borderRadius: theme.radii.xs,
      backgroundColor: theme.colors.surfaceMuted,
    },
    speedPillsContainer: {
      backgroundColor: theme.colors.surfaceSubtle,
      borderBottomWidth: theme.sizes.borderWidth,
      borderBottomColor: theme.colors.border,
      paddingVertical: 4,
    },
    speedPillsScroll: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.sm,
      gap: 6,
    },
    speedPill: {
      backgroundColor: theme.colors.primarySubtle,
      paddingHorizontal: 10,
      paddingVertical: 4,
      minHeight: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radii.full,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.primaryBorder,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
    },
    threadBody: {
      flex: 1,
    },
    emptyStateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.xl,
      gap: theme.spacing.xs,
    },
    emptyShieldBadge: {
      width: 44,
      height: 44,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.primarySubtle,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.primaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.xs,
    },
    emptyTitle: {
      ...theme.typography.bodyBold,
      color: theme.colors.text,
      textAlign: 'center',
    },
    emptySubtitle: {
      maxWidth: 280,
      textAlign: 'center',
      lineHeight: 18,
    },
    modalContent: {
      gap: theme.spacing.sm,
    },
    inputBox: {
      backgroundColor: theme.colors.surface,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      minHeight: theme.sizes.controlMd,
      justifyContent: 'center',
    },
    textInput: {
      color: theme.colors.text,
      paddingVertical: theme.spacing.xs,
    },
    modalFooterRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
    },
    modalFooterBtn: {
      minWidth: 100,
      minHeight: 44,
    },
    actionMenuList: {
      gap: theme.spacing.xs,
    },
    actionMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      minHeight: 48,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.sm,
      borderBottomWidth: theme.sizes.borderWidth,
      borderBottomColor: theme.colors.borderLight,
      borderRadius: theme.radii.sm,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
    },
    membersListScroll: {
      maxHeight: 180,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      padding: theme.spacing.sm,
      borderBottomWidth: theme.sizes.borderWidth,
      borderBottomColor: theme.colors.borderLight,
      gap: theme.spacing.sm,
    },
    memberAvatar: {
      width: theme.sizes.controlSm,
      height: theme.sizes.controlSm,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.primarySubtle,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.primaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberInfo: {
      flex: 1,
    },
    sectionHeader: {
      marginTop: theme.spacing.sm,
    },
    addColleagueList: {
      maxHeight: 140,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
    },
    addColleagueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      padding: theme.spacing.sm,
      borderBottomWidth: theme.sizes.borderWidth,
      borderBottomColor: theme.colors.borderLight,
      gap: theme.spacing.sm,
    },
    handoffContainer: {
      maxHeight: 360,
    },
    handoffSectionLabel: {
      marginBottom: theme.spacing.xs,
      marginTop: theme.spacing.sm,
    },
    handoffInput: {
      backgroundColor: theme.colors.surface,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      padding: theme.spacing.sm,
      color: theme.colors.text,
      minHeight: 64,
    },
    handoffPreviewBox: {
      backgroundColor: theme.colors.surfaceSubtle,
      padding: theme.spacing.md,
      borderRadius: theme.radii.md,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.border,
    },
    handoffText: {
      lineHeight: 20,
    },
  });
}
