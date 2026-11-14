import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import {
  createShadows,
  fontSizeScale,
  isLiveWebDom,
  lightColors,
  radiusScale,
  sizes,
  spaceScale
} from '@clinicez/design-tokens';
import {
  MessageThreadProps,
  ThreadMessage
} from './types';

export const MessageThread: React.FC<MessageThreadProps> = ({
  conversationId,
  conversationTitle,
  conversationScope,
  messages,
  currentUserId,
  onSendMessage,
  onResendMessage,
  onAcknowledgeMessage,
  privacyBlurEnabled,
  onTogglePrivacyBlur,
  showHeader = true,
  renderEmptyState,
  renderSendIcon,
  canWriteInternalNotes = false,
  isLoading = false,
  error = null,
  hasMoreHistory = false,
  onLoadMoreHistory,
  colors,
  shadows: shadowsProp,
  style
}) => {
  const colorsKey = colors
    ? `${colors.primary ?? ''}|${colors.primaryLight ?? ''}|${colors.primarySubtle ?? ''}|${colors.primaryBorder ?? ''}|${colors.primaryDark ?? ''}|${colors.background ?? ''}|${colors.surface ?? ''}|${colors.text ?? ''}`
    : '';
  const c = useMemo<ResolvedCommsColors>(() => ({ ...lightColors, ...colors }), [colors, colorsKey]);
  const s = useMemo(
    () => ({ ...createShadows(c, isLiveWebDom), ...(shadowsProp ?? {}) }),
    [c, shadowsProp]
  );
  const styles = useMemo(() => createStyles(c, s), [c, s]);

  const [inputText, setInputText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [peekingMessageId, setPeekingMessageId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const isNearBottomRef = useRef(true);
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false);
  const prevMessagesCountRef = useRef(messages.length);

  const handleScroll = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 80;
    const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    isNearBottomRef.current = isNearBottom;
    if (isNearBottom) {
      setShowNewMessagesPill(false);
    }
  }, []);

  const scrollToBottom = useCallback((animated: boolean = true) => {
    scrollViewRef.current?.scrollToEnd({ animated });
    setShowNewMessagesPill(false);
    isNearBottomRef.current = true;
  }, []);

  useEffect(() => {
    if (messages.length > prevMessagesCountRef.current) {
      if (isNearBottomRef.current) {
        // User is at the bottom: smoothly scroll down
        setTimeout(() => {
          scrollToBottom(true);
        }, 50);
      } else {
        // User has scrolled up to read history: do not yank their scroll position!
        setShowNewMessagesPill(true);
      }
    }
    prevMessagesCountRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

  const handleKeyPress = (e: any) => {
    if (e.nativeEvent?.key === 'Enter' && !e.nativeEvent?.shiftKey) {
      if (typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSendMessage(inputText.trim(), isInternal);
      setInputText('');
      setIsInternal(false);
    } catch {
      // Handled by parent or queue
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDeliveryState = (msg: ThreadMessage) => {
    switch (msg.state) {
      case 'Sending':
        return (
          <View style={styles.deliveryRow} accessibilityLabel="Sending">
            <Text style={styles.deliveryIconMuted}>• Sending</Text>
          </View>
        );
      case 'Waiting':
        return (
          <View style={styles.deliveryRow} accessibilityLabel="Sent">
            <Text style={styles.deliveryIconMuted}>• Sent</Text>
          </View>
        );
      case 'Received':
        return (
          <View style={styles.deliveryRow} accessibilityLabel="Delivered">
            <Text style={styles.deliveryIconTeal}>• Delivered</Text>
          </View>
        );
      case 'NotReceived':
        return (
          <View style={styles.deliveryRow} accessibilityLabel="Not delivered">
            <Text style={styles.deliveryIconRed}>!</Text>
            <TouchableOpacity
              style={styles.resendButton}
              onPress={() => onResendMessage(msg.id)}
              accessibilityLabel="Resend message"
            >
              <Text style={styles.resendButtonText}>Resend</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Thread Header */}
      {showHeader && (
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {!conversationTitle || conversationTitle.toLowerCase() === 'conversation'
                ? (conversationScope === 'PatientFacility'
                    ? 'Patient Request'
                    : conversationScope === 'StaffContext' || conversationScope === 'PatientContext'
                      ? 'Care Team'
                      : conversationScope === 'Direct'
                        ? 'Direct Message'
                        : conversationScope === 'Facility'
                          ? 'Facility Channel'
                          : conversationScope || 'Facility Channel')
                : conversationTitle}
            </Text>
            <Text style={styles.headerSubtitle}>
              {conversationScope === 'PatientFacility'
                ? 'Patient Request'
                : conversationScope === 'StaffContext' || conversationScope === 'PatientContext'
                  ? 'Care Team'
                  : conversationScope === 'Direct'
                    ? 'Direct Message'
                    : conversationScope === 'Facility'
                      ? 'Facility Channel'
                      : conversationScope}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.privacyButton, privacyBlurEnabled && styles.privacyButtonActive]}
            onPress={onTogglePrivacyBlur}
            accessibilityLabel={privacyBlurEnabled ? 'Disable patient privacy blur' : 'Enable patient privacy blur'}
          >
            <Text style={[styles.privacyButtonText, privacyBlurEnabled && styles.privacyButtonTextActive]}>
              {privacyBlurEnabled ? 'Peek Mode: ON' : 'Privacy Blur'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content States */}
      {isLoading ? (
        <View style={styles.skeletonContainer}>
          <View style={[styles.skeletonBubble, styles.skeletonBubbleLeft, { width: '65%' }]}>
            <View style={styles.skeletonBarLong} />
            <View style={styles.skeletonBarShort} />
          </View>
          <View style={[styles.skeletonBubble, styles.skeletonBubbleRight, { width: '50%' }]}>
            <View style={styles.skeletonBarMedium} />
          </View>
          <View style={[styles.skeletonBubble, styles.skeletonBubbleLeft, { width: '75%' }]}>
            <View style={styles.skeletonBarLong} />
            <View style={styles.skeletonBarMedium} />
          </View>
          <View style={[styles.skeletonBubble, styles.skeletonBubbleRight, { width: '60%' }]}>
            <View style={styles.skeletonBarMedium} />
          </View>
        </View>
      ) : error ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorTitle}>Error Loading Thread</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
        </View>
      ) : messages.length === 0 ? (
        renderEmptyState ? (
          renderEmptyState()
        ) : (
          <View style={styles.stateContainer}>
            <View style={styles.emptyShieldBadge}>
              <View style={styles.emptyShieldCheckGlyph} />
            </View>
            <Text style={styles.emptyTitle}>Secure Communication</Text>
            <Text style={styles.emptySubtitle}>
              This is the start of your medical communication thread. Messages are encrypted in transit.
            </Text>
          </View>
        )
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {hasMoreHistory && onLoadMoreHistory && (
            <TouchableOpacity style={styles.loadMoreButton} onPress={onLoadMoreHistory}>
              <Text style={styles.loadMoreText}>Load earlier messages</Text>
            </TouchableOpacity>
          )}

          {messages.map((msg) => {
            const isMe = msg.senderType === 'Staff' && msg.senderId === currentUserId;
            const isInternalNote = msg.visibility === 'Internal';
            const isObscured = privacyBlurEnabled && peekingMessageId !== msg.id;

            if (isInternalNote) {
              return (
                <View
                  key={msg.id}
                  style={styles.internalContainer}
                  onTouchStart={() => setPeekingMessageId(msg.id)}
                  onTouchEnd={() => setPeekingMessageId(null)}
                >
                  <View style={styles.internalHeader}>
                    <Text style={styles.internalHeaderIcon}>LOCK</Text>
                    <Text style={styles.internalHeaderText}>
                      Private Staff Note (Care Team Only)
                    </Text>
                  </View>
                  <Text style={[styles.internalText, isObscured && styles.obscuredText]}>
                    {isObscured ? '••••••••••••••••••••••••••••••••••••••••' : msg.contentText}
                  </Text>
                  <Text style={styles.internalMeta}>
                    {msg.senderDisplayName} •{' '}
                    {new Date(msg.clientSentAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              );
            }

            return (
              <View
                key={msg.id}
                style={[styles.bubbleWrapper, isMe ? styles.bubbleWrapperMe : styles.bubbleWrapperOther]}
                onTouchStart={() => setPeekingMessageId(msg.id)}
                onTouchEnd={() => setPeekingMessageId(null)}
              >
                {!isMe && (
                  <Text style={styles.senderName}>{msg.senderDisplayName}</Text>
                )}

                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                  <Text
                    style={[
                      isMe ? styles.bubbleTextMe : styles.bubbleTextOther,
                      isObscured && styles.obscuredText
                    ]}
                  >
                    {isObscured ? '••••••••••••••••••••••••' : msg.contentText}
                  </Text>

                  {/* Acknowledgement Action ("Understood") */}
                  {msg.requiresAcknowledgement && (
                    <View style={styles.ackBox}>
                      {msg.isAcknowledged ? (
                        <Text style={styles.ackConfirmedText}>
                          Understood by {msg.acknowledgedByName ?? 'recipient'}
                        </Text>
                      ) : onAcknowledgeMessage && !isMe ? (
                        <TouchableOpacity
                          style={styles.ackButton}
                          onPress={() => onAcknowledgeMessage(msg.id)}
                          accessibilityLabel="Acknowledge message as understood"
                        >
                          <Text style={styles.ackButtonText}>Mark as Understood</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.ackPendingText}>Awaiting acknowledgement</Text>
                      )}
                    </View>
                  )}

                  <View style={styles.metaRow}>
                    <Text style={isMe ? styles.timeTextMe : styles.timeTextOther}>
                      {new Date(msg.clientSentAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {isMe && renderDeliveryState(msg)}
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Floating Jump to New Messages Pill */}
      {showNewMessagesPill && (
        <View style={styles.newMessagesPillContainer} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.newMessagesPill}
            onPress={() => scrollToBottom(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Scroll to new messages"
          >
            <Text style={styles.newMessagesPillText}>New messages</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input Bar */}
      <View style={styles.inputContainer}>
        {canWriteInternalNotes && (
          <TouchableOpacity
            style={[styles.internalToggle, isInternal && styles.internalToggleActive]}
            onPress={() => setIsInternal((prev) => !prev)}
            accessibilityLabel="Toggle internal staff note"
          >
            <Text style={[styles.internalToggleText, isInternal && styles.internalToggleTextActive]}>
              {isInternal ? 'Internal Note: ACTIVE' : 'Note'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, isInternal && styles.inputInternal]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={isInternal ? 'Type internal note for care team...' : 'Type message...'}
            placeholderTextColor={c.textMuted}
            multiline
            onKeyPress={handleKeyPress}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            accessibilityLabel="Message input field"
          />

          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isSubmitting}
            accessibilityLabel="Send message"
          >
            {renderSendIcon ? renderSendIcon() : null}
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

type ResolvedCommsColors = Record<keyof typeof lightColors, string>;

function createStyles(
  c: ResolvedCommsColors,
  s: ReturnType<typeof createShadows>
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background
    },
    header: {
      padding: spaceScale.md,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    headerInfo: {
      flex: 1
    },
    headerTitle: {
      fontSize: fontSizeScale.lg,
      fontWeight: '700',
      color: c.text
    },
    headerSubtitle: {
      fontSize: fontSizeScale.xs,
      color: c.textMuted,
      marginTop: 2
    },
    privacyButton: {
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.md,
      borderRadius: radiusScale.sm,
      backgroundColor: c.surfaceSubtle,
      justifyContent: 'center',
      alignItems: 'center',
      ...s.brandSubtle
    },
    privacyButtonActive: {
      backgroundColor: c.warningBg,
      borderColor: c.warningBorder,
      borderWidth: 1,
      ...s.sm
    },
    privacyButtonText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '600',
      color: c.textSecondary
    },
    privacyButtonTextActive: {
      color: c.warningText
    },
    messageList: {
      flex: 1
    },
    newMessagesPillContainer: {
      position: 'absolute',
      bottom: 84,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 10,
    },
    newMessagesPill: {
      backgroundColor: c.primary,
      paddingHorizontal: spaceScale.md,
      paddingVertical: spaceScale.xs,
      borderRadius: radiusScale.full,
      ...s.brandSm
    },
    newMessagesPillText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '700',
      color: c.onPrimary,
    },
    messageListContent: {
      padding: spaceScale.md
    },
    loadMoreButton: {
      minHeight: sizes.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spaceScale.md
    },
    loadMoreText: {
      fontSize: fontSizeScale.xs,
      color: c.primary,
      fontWeight: '600'
    },
    bubbleWrapper: {
      marginBottom: spaceScale.md,
      maxWidth: '80%'
    },
    bubbleWrapperMe: {
      alignSelf: 'flex-end'
    },
    bubbleWrapperOther: {
      alignSelf: 'flex-start'
    },
    senderName: {
      fontSize: fontSizeScale.xs,
      color: c.textSecondary,
      marginBottom: 2,
      marginLeft: spaceScale.xs
    },
    bubble: {
      padding: spaceScale.md,
      borderRadius: radiusScale.md
    },
    bubbleMe: {
      backgroundColor: c.primaryLight,
      borderColor: c.primaryBorder,
      borderWidth: 1,
      borderBottomRightRadius: radiusScale.xs,
      ...s.sm
    },
    bubbleOther: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderBottomLeftRadius: radiusScale.xs,
      ...s.sm
    },
    bubbleTextMe: {
      color: c.text,
      fontSize: fontSizeScale.md,
      lineHeight: 20
    },
    bubbleTextOther: {
      color: c.text,
      fontSize: fontSizeScale.md,
      lineHeight: 20
    },
    obscuredText: {
      letterSpacing: 2,
      opacity: 0.6
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginTop: spaceScale.xs,
      gap: spaceScale.xs
    },
    timeTextMe: {
      fontSize: fontSizeScale.xs,
      color: c.primaryDark,
      opacity: 0.8
    },
    timeTextOther: {
      fontSize: fontSizeScale.xs,
      color: c.textMuted
    },
    deliveryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2
    },
    deliveryIconMuted: {
      fontSize: fontSizeScale.xs,
      color: c.textMuted,
      marginLeft: 2,
    },
    deliveryIconTeal: {
      fontSize: fontSizeScale.xs,
      color: c.primary,
      fontWeight: '700',
      marginLeft: 2,
    },
    deliveryIconRed: {
      fontSize: fontSizeScale.xs,
      color: c.emergencyText,
      fontWeight: '700',
      marginLeft: 2,
    },
    deliveryTextMuted: {
      fontSize: fontSizeScale.xs,
      color: c.textMuted,
    },
    deliveryTextTeal: {
      fontSize: fontSizeScale.xs,
      color: c.primary,
      fontWeight: '600'
    },
    deliveryTextRed: {
      fontSize: fontSizeScale.xs,
      color: c.emergencyText,
      fontWeight: '700'
    },
    resendButton: {
      minHeight: 24,
      marginLeft: 4,
      backgroundColor: c.emergencyBg,
      borderColor: c.emergencyBorder,
      borderWidth: 1,
      paddingHorizontal: spaceScale.xs,
      borderRadius: radiusScale.xs,
      justifyContent: 'center',
      ...s.dangerSm
    },
    resendButtonText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '700',
      color: c.emergencyText
    },
    internalContainer: {
      width: '100%',
      padding: spaceScale.md,
      backgroundColor: c.warningBg,
      borderColor: c.warningBorder,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: radiusScale.md,
      marginBottom: spaceScale.md
    },
    internalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spaceScale.xs,
      gap: spaceScale.xs
    },
    internalHeaderIcon: {
      fontSize: fontSizeScale.xs,
      color: c.warningText
    },
    internalHeaderText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '700',
      color: c.warningText
    },
    internalText: {
      fontSize: fontSizeScale.sm,
      color: c.warningText,
      lineHeight: 18
    },
    internalMeta: {
      fontSize: fontSizeScale.xs,
      color: c.warningText,
      marginTop: spaceScale.xs,
      opacity: 0.8
    },
    ackBox: {
      marginTop: spaceScale.xs,
      paddingTop: spaceScale.xs,
      borderTopWidth: 1,
      borderTopColor: c.border
    },
    ackButton: {
      minHeight: sizes.touchTarget,
      backgroundColor: c.routineBg,
      borderColor: c.routineBorder,
      borderWidth: 1,
      borderRadius: radiusScale.sm,
      justifyContent: 'center',
      alignItems: 'center',
      ...s.brandSubtle
    },
    ackButtonText: {
      color: c.routineText,
      fontSize: fontSizeScale.xs,
      fontWeight: '600'
    },
    ackConfirmedText: {
      fontSize: fontSizeScale.xs,
      color: c.routineText,
      fontWeight: '600'
    },
    ackPendingText: {
      fontSize: fontSizeScale.xs,
      color: c.textMuted
    },
    inputContainer: {
      padding: spaceScale.sm,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border
    },
    internalToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spaceScale.xs,
      paddingHorizontal: spaceScale.sm,
      borderRadius: radiusScale.full,
      backgroundColor: c.surfaceSubtle,
      borderWidth: 1,
      borderColor: c.border,
      alignSelf: 'flex-start',
      marginBottom: spaceScale.xs,
      gap: spaceScale.xs,
    },
    internalToggleActive: {
      backgroundColor: c.warningBg,
      borderColor: c.warningBorder,
    },
    internalToggleText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '600',
      color: c.textSecondary,
    },
    internalToggleTextActive: {
      color: c.warningText,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spaceScale.sm,
    },
    input: {
      flex: 1,
      backgroundColor: c.surfaceSubtle,
      borderRadius: radiusScale.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spaceScale.md,
      paddingVertical: spaceScale.sm,
      minHeight: sizes.touchTarget,
      maxHeight: 120,
      fontSize: fontSizeScale.sm,
      color: c.text,
    },
    inputInternal: {
      backgroundColor: c.warningBg,
      borderColor: c.warningBorder,
      borderWidth: 1,
      color: c.warningText,
    },
    sendButton: {
      minWidth: 76,
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.md,
      backgroundColor: c.primary,
      borderRadius: radiusScale.md,
      flexDirection: 'row',
      gap: 4,
      justifyContent: 'center',
      alignItems: 'center',
      ...s.brandSm
    },
    sendButtonDisabled: {
      opacity: 0.5,
      ...s.none
    },
    sendIconText: {
      color: c.onPrimary,
      fontSize: fontSizeScale.xs,
    },
    sendButtonText: {
      color: c.onPrimary,
      fontWeight: '600',
      fontSize: fontSizeScale.sm,
    },
    stateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spaceScale.xl,
    },
    emptyShieldBadge: {
      width: 56,
      height: 56,
      borderRadius: radiusScale.full,
      backgroundColor: c.primarySubtle,
      borderWidth: 1,
      borderColor: c.primaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spaceScale.md,
    },
    emptyShieldCheckGlyph: {
      width: 12,
      height: 20,
      borderBottomWidth: 2.5,
      borderRightWidth: 2.5,
      borderColor: c.primary,
      transform: [{ rotate: '45deg' }],
      marginBottom: spaceScale.xxs,
    },
    stateText: {
      marginTop: spaceScale.sm,
      fontSize: fontSizeScale.sm,
      color: c.textMuted
    },
    emptyIcon: {
      fontSize: fontSizeScale['3xl'],
      marginBottom: spaceScale.sm
    },
    emptyTitle: {
      fontSize: fontSizeScale.lg,
      fontWeight: '600',
      color: c.text,
      marginBottom: spaceScale.xs
    },
    emptySubtitle: {
      fontSize: fontSizeScale.sm,
      color: c.textMuted,
      textAlign: 'center'
    },
    errorIcon: {
      fontSize: fontSizeScale['3xl'],
      marginBottom: spaceScale.sm,
      color: c.emergencyText
    },
    errorTitle: {
      fontSize: fontSizeScale.lg,
      fontWeight: '600',
      color: c.emergencyText,
      marginBottom: spaceScale.xs
    },
    errorSubtitle: {
      fontSize: fontSizeScale.sm,
      color: c.textMuted,
      textAlign: 'center'
    },
    skeletonContainer: {
      flex: 1,
      padding: spaceScale.md,
      gap: spaceScale.md,
    },
    skeletonBubble: {
      padding: spaceScale.md,
      borderRadius: radiusScale.lg,
      gap: spaceScale.xs,
    },
    skeletonBubbleLeft: {
      alignSelf: 'flex-start',
      backgroundColor: c.surfaceSubtle,
      borderBottomLeftRadius: radiusScale.xs,
    },
    skeletonBubbleRight: {
      alignSelf: 'flex-end',
      backgroundColor: c.primarySubtle,
      borderBottomRightRadius: radiusScale.xs,
    },
    skeletonBarLong: {
      height: 12,
      width: '90%',
      backgroundColor: c.border,
      borderRadius: radiusScale.xs,
      opacity: 0.6,
    },
    skeletonBarMedium: {
      height: 12,
      width: '65%',
      backgroundColor: c.border,
      borderRadius: radiusScale.xs,
      opacity: 0.5,
    },
    skeletonBarShort: {
      height: 12,
      width: '40%',
      backgroundColor: c.border,
      borderRadius: radiusScale.xs,
      opacity: 0.4,
    }
  });
}
