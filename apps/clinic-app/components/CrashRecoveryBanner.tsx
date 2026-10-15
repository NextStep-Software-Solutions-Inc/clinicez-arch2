import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Modal, ScrollView, TextInput, Pressable } from 'react-native';
import ThemedText from './ui/ThemedText';
import Button from './ui/Button';
import Icon from './ui/Icon';
import Badge from './ui/Badge';
import { theme } from '../constants/theme';
import {
  CrashReport,
  clearLastCrashReport,
  formatCrashReport,
  getLastCrashReport,
  shareCrashReport,
  subscribeCrash,
} from '../services/crashReporter';
import { notify } from '../utils/feedback';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Checks on app startup if the app recovered from an unexpected crash or fatal exception.
 * If so, displays an unobtrusive alert bar allowing the user or clinician to inspect,
 * copy, and transmit the diagnostic log to developers/tech support immediately.
 */
export function CrashRecoveryBanner() {
  const [report, setReport] = useState<CrashReport | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // 1. Check for last persisted crash report on mount
    const last = getLastCrashReport();
    if (last) {
      const elapsed = Date.now() - new Date(last.timestamp).getTime();
      if (elapsed < TWENTY_FOUR_HOURS_MS) {
        setReport(last);
      } else {
        clearLastCrashReport();
      }
    }

    // 2. Listen to active crash events
    return subscribeCrash((newReport) => {
      setReport(newReport);
    });
  }, []);

  const handleDismiss = useCallback(() => {
    clearLastCrashReport();
    setReport(null);
    setModalVisible(false);
  }, []);

  const handleShare = useCallback(async () => {
    if (!report) return;
    const ok = await shareCrashReport(report);
    if (ok) {
      setCopied(true);
      notify.success('Crash report copied to clipboard. Share this with support.');
      setTimeout(() => setCopied(false), 4000);
    }
  }, [report]);

  if (!report) return null;

  const formattedLog = formatCrashReport(report);

  return (
    <>
      {/* Floating Alert Bar */}
      <View style={styles.bannerContainer}>
        <View style={styles.bannerInner}>
          <Icon name="alertCircle" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
          <View style={styles.bannerTextBlock}>
            <ThemedText variant="smallBold" color={theme.colors.emergencyText} numberOfLines={1}>
              Previous crash recovered: {report.name}
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
              {report.message}
            </ThemedText>
          </View>
          <View style={styles.bannerActions}>
            <Button
              title="View log"
              size="sm"
              variant="secondary"
              onPress={() => setModalVisible(true)}
            />
            <Pressable
              onPress={handleDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss crash banner"
              style={styles.dismissButton}
            >
              <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Modal with full diagnostic details */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleBlock}>
                <Badge label="Diagnostic Report" variant="emergency" icon="alertCircle" />
                <ThemedText variant="h2">Crash Diagnostics</ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  Share this technical report with support to resolve and patch the issue quickly.
                </ThemedText>
              </View>
              <Pressable
                onPress={() => setModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                style={styles.modalCloseButton}
              >
                <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            {/* Error metadata */}
            <View style={styles.metaRow}>
              <View style={styles.metaCol}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>Error Name:</ThemedText>
                <ThemedText variant="captionBold">{report.name}</ThemedText>
              </View>
              <View style={styles.metaCol}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>Platform:</ThemedText>
                <ThemedText variant="captionBold">{report.platform} (OS {report.osVersion})</ThemedText>
              </View>
              <View style={styles.metaCol}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>Workspace:</ThemedText>
                <ThemedText variant="captionBold">{report.workspace || '(none)'}</ThemedText>
              </View>
              <View style={styles.metaCol}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>Time:</ThemedText>
                <ThemedText variant="captionBold">{report.formattedTime}</ThemedText>
              </View>
            </View>

            {/* Log view */}
            <ScrollView style={styles.logContainer}>
              <TextInput
                style={styles.logText}
                multiline
                editable={false}
                value={formattedLog}
                selectTextOnFocus
              />
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <Button
                title={copied ? 'Report copied to clipboard!' : 'Copy / Share Diagnostic Report'}
                icon="copy"
                size="lg"
                onPress={handleShare}
              />
              <Button
                title="Dismiss & clear"
                variant="ghost"
                onPress={handleDismiss}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
    backgroundColor: theme.colors.background,
  },
  bannerInner: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  bannerTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs / 2,
  },
  bannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  dismissButton: {
    padding: theme.spacing.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing['2xl'],
    width: '100%',
    maxWidth: 680,
    maxHeight: '90%',
    gap: theme.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modalTitleBlock: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  modalCloseButton: {
    padding: theme.spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
  },
  metaCol: {
    minWidth: 120,
    gap: theme.spacing.xs / 2,
  },
  logContainer: {
    backgroundColor: theme.colors.surfaceInverse,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    maxHeight: 280,
  },
  logText: {
    fontFamily: theme.fonts.mono['400'],
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textInverted,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
  },
});
