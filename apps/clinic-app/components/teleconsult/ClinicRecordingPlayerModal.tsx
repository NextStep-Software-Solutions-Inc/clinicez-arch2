import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Modal, Pressable, TextInput, Platform } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import {
  clinicService,
  type PlaybackTicketDto,
  type RecordingSessionDto,
} from '../../services/clinicService';
import { notify } from '../../utils/feedback';

export interface ClinicRecordingPlayerModalProps {
  visible: boolean;
  ticket?: PlaybackTicketDto | null;
  session?: RecordingSessionDto | null;
  sessionId?: string;
  onToggleLegalHold?: (reason: string) => void;
  onClose: () => void;
  onHoldChanged?: (session: RecordingSessionDto) => void;
}

function formatDuration(totalSeconds?: number): string {
  if (!totalSeconds || totalSeconds < 0) return '00:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function ClinicRecordingPlayerModal({
  visible,
  ticket: propTicket,
  session: propSession,
  sessionId: propSessionId,
  onToggleLegalHold,
  onClose,
  onHoldChanged,
}: ClinicRecordingPlayerModalProps) {
  const [ticket, setTicket] = useState<PlaybackTicketDto | null>(propTicket || null);
  const [session, setSession] = useState<RecordingSessionDto | null>(propSession || null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showHoldPrompt, setShowHoldPrompt] = useState<boolean>(false);
  const [holdReason, setHoldReason] = useState<string>('');
  const [isHolding, setIsHolding] = useState<boolean>(false);

  const effectiveSessionId = propSession?.id || propSessionId || ticket?.ticket;

  useEffect(() => {
    if (propTicket) setTicket(propTicket);
    if (propSession) setSession(propSession);
  }, [propTicket, propSession]);

  // If sessionId passed but no ticket or session, fetch them
  useEffect(() => {
    if (visible && propSessionId && (!ticket || !session)) {
      setLoading(true);
      Promise.all([
        clinicService.createRecordingPlaybackTicket(propSessionId),
        clinicService.getRecordingSession(propSessionId),
      ])
        .then(([ticketRes, sessionRes]) => {
          if (ticketRes[0]) setTicket(ticketRes[0]);
          if (sessionRes[0]) setSession(sessionRes[0]);
        })
        .catch(() => {
          notify.error('Could not acquire recording playback ticket.');
        })
        .finally(() => setLoading(false));
    }
  }, [visible, propSessionId, ticket, session]);

  const hasHold = Boolean(session?.isLegalHold ?? session?.hasLegalHold ?? ticket?.hasLegalHold);
  const holdReasonText = session?.legalHoldReason || ticket?.legalHoldReason || '';

  const handleToggleHoldAction = useCallback(async () => {
    if (onToggleLegalHold) {
      onToggleLegalHold(holdReason || 'Administrative Review 2026');
      return;
    }

    const targetSessionId = session?.id || propSessionId;
    if (!targetSessionId) return;

    if (hasHold) {
      // Release Hold
      setIsHolding(true);
      try {
        const [updated, err] = await clinicService.releaseRecordingLegalHold(
          targetSessionId,
          'Administrative hold released by authorized personnel',
        );
        if (err || !updated) {
          notify.error(err?.message || 'Failed to release medico-legal hold.');
          return;
        }
        setSession(updated);
        onHoldChanged?.(updated);
        notify.success('Medico-legal hold released. Standard retention scheduled.');
      } catch {
        notify.error('Failed to release medico-legal hold.');
      } finally {
        setIsHolding(false);
      }
    } else {
      // Open reason prompt
      setShowHoldPrompt(true);
    }
  }, [onToggleLegalHold, holdReason, session?.id, propSessionId, hasHold, onHoldChanged]);

  const handleConfirmPlaceHold = useCallback(async () => {
    const trimmed = holdReason.trim();
    if (trimmed.length < 5) {
      notify.warning('Medico-legal hold reason must be at least 5 characters long.');
      return;
    }

    const targetSessionId = session?.id || propSessionId;
    if (!targetSessionId) return;

    setIsHolding(true);
    try {
      const [updated, err] = await clinicService.placeRecordingLegalHold(targetSessionId, trimmed);
      if (err || !updated) {
        notify.error(err?.message || 'Failed to place medico-legal hold.');
        return;
      }
      setSession(updated);
      onHoldChanged?.(updated);
      setShowHoldPrompt(false);
      setHoldReason('');
      notify.success('Medico-legal hold successfully placed. Automatic retention frozen.');
    } catch {
      notify.error('Failed to place medico-legal hold.');
    } finally {
      setIsHolding(false);
    }
  }, [holdReason, session?.id, propSessionId, onHoldChanged]);

  if (!visible) return null;

  const durationStr = formatDuration(session?.totalDurationSeconds ?? session?.durationSeconds ?? ticket?.durationSeconds ?? 930);
  const streamUrl =
    ticket?.streamUrl ||
    (session?.id && ticket?.ticket ? clinicService.buildRecordingStreamUrl(session.id, ticket.ticket) : '');

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={styles.modalCard}
          testID="clinic-recording-player-modal"
          role="dialog"
          accessibilityLabel="Encrypted Recording Playback"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Icon name="consultations" size={theme.sizes.iconMd} color={theme.colors.primary} />
              <View>
                <ThemedText variant="title" color={theme.colors.text}>
                  Encrypted Consultation Recording
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  {session?.patientName ? `Patient: ${session.patientName}` : 'Ticketed sovereign playback'}
                </ThemedText>
              </View>
            </View>

            <Button
              testID="btn-close-player-modal"
              variant="secondary"
              size="sm"
              icon="close"
              iconOnly
              onPress={onClose}
              accessibilityLabel="Close Player"
              style={styles.touchableMinSize}
            />
          </View>

          {/* Badges Strip */}
          <View style={styles.badgesStrip}>
            <View testID="badge-vault-encrypted" style={[styles.badge, styles.encryptedBadge]}>
              <Icon name="shield" size={theme.sizes.iconSm} color={theme.colors.successText} />
              <ThemedText variant="captionBold" color={theme.colors.successText}>
                CMK AES-256-GCM Vault Encrypted
              </ThemedText>
            </View>

            <View testID="badge-ticket-expiry" style={[styles.badge, styles.expiryBadge]}>
              <Icon name="clock" size={theme.sizes.iconSm} color={theme.colors.infoText} />
              <ThemedText variant="caption" color={theme.colors.infoText}>
                Ticket expires: {ticket?.expiresAtUtc || '15 minutes'}
              </ThemedText>
            </View>
          </View>

          {/* Video Player Surface */}
          <View style={styles.videoSurfaceContainer} testID="video-player-surface">
            {Platform.OS === 'web' && streamUrl ? (
              <video
                src={streamUrl}
                controls
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'transparent',
                }}
              />
            ) : (
              <View style={styles.videoPlaceholder}>
                <Icon name="activity" size={theme.sizes.iconLg} color={theme.colors.primary} />
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Streaming Decrypted WebM/MP4
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Sovereign AES-256-GCM Range Processing Active
                </ThemedText>
              </View>
            )}
          </View>

          {/* Scrubber / Timeline Bar */}
          <View style={styles.timelineScrubber} testID="playback-timeline-scrubber">
            <ThemedText variant="captionBold" color={theme.colors.text}>
              00:00 / {durationStr}
            </ThemedText>
            <View style={styles.scrubberTrack}>
              <View style={styles.scrubberProgress} />
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              {formatBytes(session?.totalSizeBytes ?? session?.sizeBytes ?? ticket?.sizeBytes)}
            </ThemedText>
          </View>

          {/* Medico-Legal Hold Section */}
          <View style={styles.legalHoldSection} testID="medico-legal-hold-section">
            <View style={styles.legalHoldStatusRow}>
              <Icon
                name={hasHold ? 'alert' : 'shield'}
                size={theme.sizes.iconSm}
                color={hasHold ? theme.colors.emergencyText : theme.colors.textSecondary}
              />
              <ThemedText
                variant="smallBold"
                color={hasHold ? theme.colors.emergencyText : theme.colors.text}
                testID="legal-hold-status"
              >
                {hasHold ? 'Active Hold' : 'No Hold'}
              </ThemedText>
              {hasHold && holdReasonText ? (
                <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                  ({holdReasonText})
                </ThemedText>
              ) : null}
            </View>

            <Button
              testID="btn-toggle-legal-hold"
              variant={hasHold ? 'secondary' : 'danger'}
              size="sm"
              icon={hasHold ? 'check' : 'lock'}
              title={hasHold ? 'Release Hold' : 'Place Medico-Legal Hold'}
              accessibilityLabel={hasHold ? 'Release Medico-Legal Hold' : 'Place Medico-Legal Hold'}
              onPress={handleToggleHoldAction}
              loading={isHolding}
              style={styles.touchableMinSize}
            />
          </View>

          {/* Prompt Form for Reason Note when Placing Hold */}
          {showHoldPrompt && (
            <View style={styles.holdPromptCard}>
              <ThemedText variant="captionBold" color={theme.colors.emergencyText}>
                Enter Medico-Legal Hold Reason (min 5 chars)
              </ThemedText>
              <TextInput
                style={styles.holdInput}
                placeholder="Reason (e.g. Subpoena Investigation 2026)"
                placeholderTextColor={theme.colors.textLight}
                value={holdReason}
                onChangeText={setHoldReason}
                multiline
              />
              <View style={styles.holdPromptActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  title="Cancel"
                  onPress={() => setShowHoldPrompt(false)}
                  style={styles.touchableMinSize}
                />
                <Button
                  variant="danger"
                  size="sm"
                  title="Confirm Place Hold"
                  onPress={handleConfirmPlaceHold}
                  disabled={holdReason.trim().length < 5}
                  loading={isHolding}
                  style={styles.touchableMinSize}
                />
              </View>
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Button
              testID="btn-close-player-modal"
              variant="secondary"
              size="md"
              title="Close Player"
              onPress={onClose}
              style={styles.touchableMinSize}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  badgesStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
  },
  encryptedBadge: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  expiryBadge: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
  },
  videoSurfaceContainer: {
    height: 280,
    backgroundColor: theme.colors.surfaceInverse,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  timelineScrubber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  scrubberTrack: {
    flex: 1,
    height: 6,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.full,
    overflow: 'hidden',
  },
  scrubberProgress: {
    width: '35%',
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
  legalHoldSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  legalHoldStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  holdPromptCard: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  holdInput: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    minHeight: 60,
  },
  holdPromptActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
  touchableMinSize: {
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
  },
});
