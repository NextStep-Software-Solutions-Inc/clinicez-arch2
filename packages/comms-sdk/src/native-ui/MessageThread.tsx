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
  ThreadAttachment,
  ThreadMessage
} from './types';
import { OverlayTooltip } from './OverlayTooltip';

function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MessageThread: React.FC<MessageThreadProps> = ({
  conversationId,
  conversationTitle,
  conversationScope,
  messages,
  currentUserId,
  viewerType = 'Staff',
  onSendMessage,
  onResendMessage,
  onAcknowledgeMessage,
  onOpenAttachment,
  onPickAttachment,
  privacyBlurEnabled,
  onTogglePrivacyBlur,
  renderPrivacyIcon,
  onClose,
  renderCloseIcon,
  showHeader = true,
  renderEmptyState,
  renderSendIcon,
  canWriteInternalNotes = false,
  isLoading = false,
  error = null,
  hasMoreHistory = false,
  onLoadMoreHistory,
  isArchived = false,
  archivedBannerText,
  isReadOnly = false,
  readOnlyBanner,
  noticeBannerText,
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
  const [pendingAttachments, setPendingAttachments] = useState<ThreadAttachment[]>([]);
  const [isPickingAttachment, setIsPickingAttachment] = useState(false);
  const [peekingMessageId, setPeekingMessageId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const effectiveReadOnly = Boolean(isReadOnly || isArchived);

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

  const handlePickAttachment = async () => {
    if (!onPickAttachment || effectiveReadOnly || isPickingAttachment) return;
    setIsPickingAttachment(true);
    try {
      const picked = await onPickAttachment();
      if (!picked) return;
      const items = Array.isArray(picked) ? picked : [picked];
      setPendingAttachments((prev) => {
        const seen = new Set(prev.map((a) => a.fileKey));
        const next = [...prev];
        for (const item of items) {
          if (item && !seen.has(item.fileKey)) {
            seen.add(item.fileKey);
            next.push(item);
          }
        }
        return next;
      });
    } catch {
      // Handled by parent
    } finally {
      setIsPickingAttachment(false);
    }
  };

  const handleRemovePendingAttachment = (fileKey: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.fileKey !== fileKey));
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    const hasAttachments = pendingAttachments.length > 0;
    if (effectiveReadOnly || (!trimmed && !hasAttachments) || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const attachmentsToSend = hasAttachments ? [...pendingAttachments] : undefined;
      await onSendMessage(trimmed || 'Sent attachment', isInternal, attachmentsToSend);
      setInputText('');
      setIsInternal(false);
      setPendingAttachments([]);
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

  const renderInternalLockGlyph = () => {
    if (isLiveWebDom) {
      return React.createElement(
        'svg',
        {
          width: 13,
          height: 13,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: c.warningText,
          strokeWidth: 2.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true
        },
        [
          React.createElement('rect', {
            key: 'r',
            width: 18,
            height: 11,
            x: 3,
            y: 11,
            rx: 2,
            ry: 2
          }),
          React.createElement('path', {
            key: 'p',
            d: 'M7 11V7a5 5 0 0 1 10 0v4'
          })
        ]
      );
    }
    return (
      <View style={styles.internalLockBox}>
        <View style={styles.internalLockShackle} />
        <View style={styles.internalLockBody} />
      </View>
    );
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

          <View style={styles.headerActions}>
            <OverlayTooltip
              label={privacyBlurEnabled ? 'Disable privacy blur' : 'Enable privacy blur'}
              placement="bottom"
              colors={c}
              shadows={s}
            >
              <TouchableOpacity
                testID="btn-toggle-privacy-blur"
                style={[styles.privacyButton, privacyBlurEnabled && styles.privacyButtonActive]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                onPress={onTogglePrivacyBlur}
                accessibilityRole="button"
                accessibilityLabel={privacyBlurEnabled ? 'Disable patient privacy blur' : 'Enable patient privacy blur'}
              >
                {renderPrivacyIcon ? (
                  renderPrivacyIcon(privacyBlurEnabled)
                ) : isLiveWebDom ? (
                  React.createElement(
                    'svg',
                    {
                      width: 16,
                      height: 16,
                      viewBox: '0 0 24 24',
                      fill: 'none',
                      stroke: privacyBlurEnabled ? c.warningText : c.textSecondary,
                      strokeWidth: 2,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round',
                      'aria-hidden': true,
                    },
                    privacyBlurEnabled
                      ? [
                          React.createElement('path', {
                            key: 'e1',
                            d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49',
                          }),
                          React.createElement('path', {
                            key: 'e2',
                            d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242',
                          }),
                          React.createElement('path', {
                            key: 'e3',
                            d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143',
                          }),
                          React.createElement('path', {
                            key: 'e4',
                            d: 'm2 2 20 20',
                          }),
                        ]
                      : [
                          React.createElement('path', {
                            key: 'e1',
                            d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
                          }),
                          React.createElement('circle', {
                            key: 'e2',
                            cx: 12,
                            cy: 12,
                            r: 3,
                          }),
                        ],
                  )
                ) : (
                  <View style={[styles.privacyEyeOuter, privacyBlurEnabled && styles.privacyEyeOuterActive]}>
                    <View style={[styles.privacyEyePupil, privacyBlurEnabled && styles.privacyEyePupilActive]} />
                    {privacyBlurEnabled ? <View style={styles.privacyEyeSlash} /> : null}
                  </View>
                )}
              </TouchableOpacity>
            </OverlayTooltip>

            {onClose && (
              <TouchableOpacity
                testID="btn-close-chat-drawer"
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close chat"
              >
                {renderCloseIcon ? (
                  renderCloseIcon()
                ) : (
                  <View style={styles.closeGlyphBox}>
                    <View style={[styles.closeGlyphBar, { transform: [{ rotate: '45deg' }] }]} />
                    <View style={[styles.closeGlyphBar, { transform: [{ rotate: '-45deg' }] }]} />
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Inline Notice Banner */}
      {Boolean(noticeBannerText) && (
        <View
          style={styles.noticeBanner}
          testID="message-thread-notice-banner"
          accessibilityRole="text"
        >
          <Text style={styles.noticeBannerText}>{noticeBannerText}</Text>
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
            const isMe =
              viewerType === 'Patient'
                ? msg.senderType === 'Patient' ||
                  (msg.senderType as string) === 'Guardian' ||
                  (Boolean(msg.senderId) &&
                    msg.senderId === currentUserId &&
                    msg.senderType !== 'Staff' &&
                    msg.senderType !== 'System')
                : msg.senderType === 'Staff' && msg.senderId === currentUserId;
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
                    {renderInternalLockGlyph()}
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

                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <View style={styles.attachmentsList} testID="message-attachments-list">
                      {msg.attachments.map((att) => (
                        <TouchableOpacity
                          key={att.attachmentId ?? att.fileKey}
                          style={[styles.attachmentChip, isMe ? styles.attachmentChipMe : styles.attachmentChipOther]}
                          disabled={!onOpenAttachment || att.isClean === false || isObscured}
                          onPress={() => onOpenAttachment?.(att, msg)}
                          accessibilityRole="button"
                          accessibilityLabel={`Open attachment ${att.fileName}`}
                        >
                          <View style={styles.attachmentInfo}>
                            <Text
                              style={[styles.attachmentName, isObscured && styles.obscuredText]}
                              numberOfLines={1}
                            >
                              {isObscured ? '[Hidden attachment]' : att.fileName}
                            </Text>
                            <Text style={styles.attachmentMeta}>
                              {formatAttachmentSize(att.sizeBytes)}
                              {att.isClean === false ? ' • Pending scan' : onOpenAttachment ? ' • Download' : ''}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

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

      {/* Input Bar or Archived Read-Only Banner */}
      {effectiveReadOnly ? (
        readOnlyBanner !== undefined && readOnlyBanner !== null ? (
          typeof readOnlyBanner === 'string' || typeof readOnlyBanner === 'number' ? (
            <View
              style={styles.archivedBanner}
              testID="message-thread-archived-banner"
              accessibilityRole="text"
            >
              <Text style={styles.archivedBannerText}>{readOnlyBanner}</Text>
            </View>
          ) : (
            readOnlyBanner
          )
        ) : (
          <View
            style={styles.archivedBanner}
            testID="message-thread-archived-banner"
            accessibilityRole="text"
          >
            <Text style={styles.archivedBannerText}>
              {archivedBannerText ?? 'This conversation is closed and archived. Message history is read-only.'}
            </Text>
          </View>
        )
      ) : (
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

          {pendingAttachments.length > 0 && (
            <View style={styles.pendingAttachmentsRow} testID="pending-attachments-row">
              {pendingAttachments.map((att) => (
                <View key={att.fileKey} style={styles.pendingAttachmentPill}>
                  <Text style={styles.pendingAttachmentText} numberOfLines={1}>
                    {att.fileName}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemovePendingAttachment(att.fileKey)}
                    accessibilityLabel={`Remove attachment ${att.fileName}`}
                    style={styles.pendingAttachmentRemove}
                  >
                    <Text style={styles.pendingAttachmentRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.inputRow}>
            {onPickAttachment && (
              <TouchableOpacity
                style={[styles.attachButton, isPickingAttachment && styles.sendButtonDisabled]}
                onPress={handlePickAttachment}
                disabled={isPickingAttachment || isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Attach file"
              >
                <Text style={styles.attachButtonText}>{isPickingAttachment ? '...' : '+'}</Text>
              </TouchableOpacity>
            )}

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
              style={[
                styles.sendButton,
                !inputText.trim() && pendingAttachments.length === 0 && styles.sendButtonDisabled
              ]}
              onPress={handleSend}
              disabled={(!inputText.trim() && pendingAttachments.length === 0) || isSubmitting}
              accessibilityLabel="Send message"
            >
              {renderSendIcon ? renderSendIcon() : null}
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
      paddingHorizontal: spaceScale.md,
      paddingVertical: spaceScale.sm,
      gap: spaceScale.sm,
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
      fontSize: fontSizeScale.sm,
      fontWeight: '600',
      color: c.text
    },
    headerSubtitle: {
      fontSize: fontSizeScale.xs,
      color: c.textMuted,
      marginTop: 1
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spaceScale.xs
    },
    privacyButton: {
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      minWidth: sizes.touchTarget,
      minHeight: sizes.touchTarget,
      borderRadius: radiusScale.sm,
      backgroundColor: c.surfaceSubtle,
      borderColor: c.border,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
      ...s.brandSubtle
    },
    closeButton: {
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      minWidth: sizes.touchTarget,
      minHeight: sizes.touchTarget,
      borderRadius: radiusScale.sm,
      backgroundColor: c.surfaceSubtle,
      borderColor: c.border,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center'
    },
    closeGlyphBox: {
      width: 14,
      height: 14,
      justifyContent: 'center',
      alignItems: 'center'
    },
    closeGlyphBar: {
      position: 'absolute',
      width: 14,
      height: 2,
      backgroundColor: c.textSecondary,
      borderRadius: radiusScale.xs
    },
    internalLockBox: {
      width: 12,
      height: 13,
      alignItems: 'center',
      justifyContent: 'flex-end'
    },
    internalLockShackle: {
      width: 7,
      height: 5,
      borderTopLeftRadius: radiusScale.full,
      borderTopRightRadius: radiusScale.full,
      borderWidth: 1.5,
      borderBottomWidth: 0,
      borderColor: c.warningText,
      marginBottom: -1
    },
    internalLockBody: {
      width: 10,
      height: 7,
      borderRadius: radiusScale.xs,
      borderWidth: 1.5,
      borderColor: c.warningText,
      backgroundColor: c.transparent
    },
    privacyButtonActive: {
      backgroundColor: c.warningBg,
      borderColor: c.warningBorder,
      borderWidth: 1,
      ...s.sm
    },
    privacyEyeOuter: {
      width: 16,
      height: 10,
      borderRadius: radiusScale.full,
      borderWidth: 1.5,
      borderColor: c.textSecondary,
      alignItems: 'center',
      justifyContent: 'center'
    },
    privacyEyeOuterActive: {
      borderColor: c.warningText
    },
    privacyEyePupil: {
      width: 4,
      height: 4,
      borderRadius: radiusScale.full,
      backgroundColor: c.textSecondary
    },
    privacyEyePupilActive: {
      backgroundColor: c.warningText
    },
    privacyEyeSlash: {
      position: 'absolute',
      width: 16,
      height: 1.5,
      backgroundColor: c.warningText,
      transform: [{ rotate: '-45deg' }]
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
    noticeBanner: {
      paddingHorizontal: spaceScale.md,
      paddingVertical: spaceScale.xs,
      backgroundColor: c.surfaceSubtle,
      borderBottomWidth: 1,
      borderBottomColor: c.border
    },
    noticeBannerText: {
      fontSize: fontSizeScale.xs,
      color: c.textSecondary,
      lineHeight: 16
    },
    archivedBanner: {
      paddingHorizontal: spaceScale.md,
      paddingVertical: spaceScale.md,
      backgroundColor: c.surfaceSubtle,
      borderTopWidth: 1,
      borderTopColor: c.border,
      alignItems: 'center',
      justifyContent: 'center'
    },
    archivedBannerText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '600',
      color: c.textMuted,
      textAlign: 'center'
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
    attachmentsList: {
      marginTop: spaceScale.xs,
      gap: spaceScale.xs,
    },
    attachmentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spaceScale.sm,
      paddingVertical: spaceScale.xs,
      borderRadius: radiusScale.sm,
      borderWidth: 1,
      minHeight: sizes.touchTarget,
    },
    attachmentChipMe: {
      backgroundColor: c.surface,
      borderColor: c.primaryBorder,
    },
    attachmentChipOther: {
      backgroundColor: c.surfaceSubtle,
      borderColor: c.border,
    },
    attachmentInfo: {
      flex: 1,
    },
    attachmentName: {
      fontSize: fontSizeScale.xs,
      fontWeight: '600',
      color: c.primaryDark,
    },
    attachmentMeta: {
      fontSize: fontSizeScale.xs,
      color: c.textMuted,
      marginTop: 2,
    },
    pendingAttachmentsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spaceScale.xs,
      marginBottom: spaceScale.xs,
    },
    pendingAttachmentPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.primarySubtle,
      borderColor: c.primaryBorder,
      borderWidth: 1,
      borderRadius: radiusScale.full,
      paddingLeft: spaceScale.sm,
      paddingRight: spaceScale.xs,
      paddingVertical: 4,
      maxWidth: 220,
      gap: 4,
    },
    pendingAttachmentText: {
      fontSize: fontSizeScale.xs,
      color: c.primaryDark,
      fontWeight: '600',
      flexShrink: 1,
    },
    pendingAttachmentRemove: {
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pendingAttachmentRemoveText: {
      fontSize: fontSizeScale.sm,
      color: c.primaryDark,
      fontWeight: '700',
      lineHeight: 16,
    },
    attachButton: {
      width: sizes.touchTarget,
      height: sizes.touchTarget,
      minWidth: sizes.touchTarget,
      minHeight: sizes.touchTarget,
      borderRadius: radiusScale.md,
      backgroundColor: c.surfaceSubtle,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachButtonText: {
      fontSize: fontSizeScale.lg,
      fontWeight: '600',
      color: c.textSecondary,
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
