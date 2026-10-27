import React, { useState } from 'react';
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
  fontSizeScale,
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
  canWriteInternalNotes = false,
  isLoading = false,
  error = null,
  hasMoreHistory = false,
  onLoadMoreHistory,
  style
}) => {
  const [inputText, setInputText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [peekingMessageId, setPeekingMessageId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          <View style={styles.deliveryRow}>
            <Text style={styles.deliveryIcon}>...</Text>
            <Text style={styles.deliveryTextMuted}>Sending...</Text>
          </View>
        );
      case 'Waiting':
        return (
          <View style={styles.deliveryRow}>
            <Text style={styles.deliveryIcon}>OK</Text>
            <Text style={styles.deliveryTextMuted}>Sent, waiting</Text>
          </View>
        );
      case 'Received':
        return (
          <View style={styles.deliveryRow}>
            <Text style={styles.deliveryIconTeal}>ACK</Text>
            <Text style={styles.deliveryTextTeal}>Delivered</Text>
          </View>
        );
      case 'NotReceived':
        return (
          <View style={styles.deliveryRow}>
            <Text style={styles.deliveryIconRed}>!</Text>
            <Text style={styles.deliveryTextRed}>Not delivered</Text>
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
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {conversationTitle}
          </Text>
          <Text style={styles.headerSubtitle}>
            Scope: {conversationScope}
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

      {/* Content States */}
      {isLoading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="small" color={lightColors.primary} />
          <Text style={styles.stateText}>Loading messages...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorTitle}>Error Loading Thread</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.stateContainer}>
          <Text style={styles.emptyIcon}>E2EE</Text>
          <Text style={styles.emptyTitle}>Secure Communication</Text>
          <Text style={styles.emptySubtitle}>
            This is the start of your medical communication thread. Messages are encrypted in transit.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.messageList} contentContainerStyle={styles.messageListContent}>
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
                      INTERNAL NOTE — NEVER VISIBLE TO PATIENT
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
            placeholderTextColor={lightColors.textMuted}
            multiline
            accessibilityLabel="Message input field"
          />

          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isSubmitting}
            accessibilityLabel="Send message"
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background
  },
  header: {
    padding: spaceScale.md,
    backgroundColor: lightColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
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
    color: lightColors.text
  },
  headerSubtitle: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textMuted,
    marginTop: 2
  },
  privacyButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center'
  },
  privacyButtonActive: {
    backgroundColor: lightColors.warningBg,
    borderColor: lightColors.warningBorder,
    borderWidth: 1
  },
  privacyButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.textSecondary
  },
  privacyButtonTextActive: {
    color: lightColors.warningText
  },
  messageList: {
    flex: 1
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
    color: lightColors.primary,
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
    color: lightColors.textSecondary,
    marginBottom: 2,
    marginLeft: spaceScale.xs
  },
  bubble: {
    padding: spaceScale.md,
    borderRadius: radiusScale.md
  },
  bubbleMe: {
    backgroundColor: lightColors.primary,
    borderBottomRightRadius: radiusScale.xs
  },
  bubbleOther: {
    backgroundColor: lightColors.surface,
    borderColor: lightColors.border,
    borderWidth: 1,
    borderBottomLeftRadius: radiusScale.xs
  },
  bubbleTextMe: {
    color: lightColors.onPrimary,
    fontSize: fontSizeScale.md,
    lineHeight: 20
  },
  bubbleTextOther: {
    color: lightColors.text,
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
    color: lightColors.onPrimary,
    opacity: 0.8
  },
  timeTextOther: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textMuted
  },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2
  },
  deliveryIcon: {
    fontSize: fontSizeScale.xs
  },
  deliveryIconTeal: {
    fontSize: fontSizeScale.xs,
    color: lightColors.onPrimary
  },
  deliveryIconRed: {
    fontSize: fontSizeScale.xs
  },
  deliveryTextMuted: {
    fontSize: fontSizeScale.xs,
    color: lightColors.onPrimary,
    opacity: 0.8
  },
  deliveryTextTeal: {
    fontSize: fontSizeScale.xs,
    color: lightColors.onPrimary,
    fontWeight: '600'
  },
  deliveryTextRed: {
    fontSize: fontSizeScale.xs,
    color: lightColors.onPrimary,
    fontWeight: '700'
  },
  resendButton: {
    minHeight: 24,
    marginLeft: 4,
    backgroundColor: lightColors.onPrimary,
    paddingHorizontal: spaceScale.xs,
    borderRadius: radiusScale.xs,
    justifyContent: 'center'
  },
  resendButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.emergencyText
  },
  internalContainer: {
    width: '100%',
    padding: spaceScale.md,
    backgroundColor: lightColors.warningBg,
    borderColor: lightColors.warningBorder,
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
    fontSize: fontSizeScale.xs
  },
  internalHeaderText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.warningText
  },
  internalText: {
    fontSize: fontSizeScale.sm,
    color: lightColors.warningText,
    lineHeight: 18
  },
  internalMeta: {
    fontSize: fontSizeScale.xs,
    color: lightColors.warningText,
    marginTop: spaceScale.xs,
    opacity: 0.8
  },
  ackBox: {
    marginTop: spaceScale.xs,
    paddingTop: spaceScale.xs,
    borderTopWidth: 1,
    borderTopColor: lightColors.border
  },
  ackButton: {
    minHeight: sizes.touchTarget,
    backgroundColor: lightColors.routineBg,
    borderColor: lightColors.routineBorder,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  ackButtonText: {
    color: lightColors.routineText,
    fontSize: fontSizeScale.xs,
    fontWeight: '600'
  },
  ackConfirmedText: {
    fontSize: fontSizeScale.xs,
    color: lightColors.routineText,
    fontWeight: '600'
  },
  ackPendingText: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textMuted
  },
  inputContainer: {
    padding: spaceScale.sm,
    backgroundColor: lightColors.surface,
    borderTopWidth: 1,
    borderTopColor: lightColors.border
  },
  internalToggle: {
    paddingVertical: spaceScale.xs,
    paddingHorizontal: spaceScale.sm,
    borderRadius: radiusScale.xs,
    backgroundColor: lightColors.surfaceSubtle,
    alignSelf: 'flex-start',
    marginBottom: spaceScale.xs
  },
  internalToggleActive: {
    backgroundColor: lightColors.warningBg,
    borderColor: lightColors.warningBorder,
    borderWidth: 1
  },
  internalToggleText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.textSecondary
  },
  internalToggleTextActive: {
    color: lightColors.warningText
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spaceScale.xs
  },
  input: {
    flex: 1,
    backgroundColor: lightColors.surfaceSubtle,
    borderRadius: radiusScale.sm,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.sm,
    minHeight: sizes.touchTarget,
    maxHeight: 120,
    fontSize: fontSizeScale.md,
    color: lightColors.text
  },
  inputInternal: {
    backgroundColor: lightColors.warningBg,
    borderColor: lightColors.warningBorder,
    borderWidth: 1,
    color: lightColors.warningText
  },
  sendButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.lg,
    backgroundColor: lightColors.primary,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendButtonDisabled: {
    opacity: 0.5
  },
  sendButtonText: {
    color: lightColors.onPrimary,
    fontWeight: '700',
    fontSize: fontSizeScale.sm
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spaceScale.xl
  },
  stateText: {
    marginTop: spaceScale.sm,
    fontSize: fontSizeScale.sm,
    color: lightColors.textMuted
  },
  emptyIcon: {
    fontSize: fontSizeScale['3xl'],
    marginBottom: spaceScale.sm
  },
  emptyTitle: {
    fontSize: fontSizeScale.lg,
    fontWeight: '600',
    color: lightColors.text,
    marginBottom: spaceScale.xs
  },
  emptySubtitle: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textMuted,
    textAlign: 'center'
  },
  errorIcon: {
    fontSize: fontSizeScale['3xl'],
    marginBottom: spaceScale.sm
  },
  errorTitle: {
    fontSize: fontSizeScale.lg,
    fontWeight: '600',
    color: lightColors.emergencyText,
    marginBottom: spaceScale.xs
  },
  errorSubtitle: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textMuted,
    textAlign: 'center'
  }
});
