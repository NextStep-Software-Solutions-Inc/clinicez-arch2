import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Modal, ThemedText, Button, Input, Icon, Badge } from '../ui';
import { theme } from '../../constants/theme';

export const STANDARD_REJECTION_REASONS = [
  'Illegible image / Unreadable film',
  'Expired medical clearance / Outdated test',
  'Incorrect patient name or identification mismatch',
  'Unrelated or incomplete medical record',
  'Missing official physician signature or stamp',
  'Other / Custom reason',
];

export interface RejectionReasonModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  documentTitle?: string;
  fileName?: string;
  loading?: boolean;
}

export default function RejectionReasonModal({
  visible,
  onClose,
  onConfirm,
  documentTitle,
  fileName,
  loading = false,
}: RejectionReasonModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>(STANDARD_REJECTION_REASONS[0]);
  const [customRemarks, setCustomRemarks] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSelectedPreset(STANDARD_REJECTION_REASONS[0]);
      setCustomRemarks('');
      setErrorMessage(null);
    }
  }, [visible]);

  const handleConfirm = async () => {
    let finalReason = '';
    if (selectedPreset === 'Other / Custom reason') {
      finalReason = customRemarks.trim();
    } else {
      finalReason = customRemarks.trim()
        ? `${selectedPreset}: ${customRemarks.trim()}`
        : selectedPreset;
    }

    if (!finalReason || !finalReason.trim()) {
      setErrorMessage('A rejection reason is mandatory when rejecting outside documents');
      return;
    }

    setErrorMessage(null);
    await onConfirm(finalReason.trim());
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Reject External Document">
      <View style={styles.container}>
        {/* Document Context Preview */}
        <View style={styles.contextBox}>
          <View style={styles.contextHeader}>
            <Icon name="alert" size={14} color={theme.colors.emergencyText} />
            <ThemedText variant="captionBold" color={theme.colors.emergencyText}>
              Quarantine Rejection
            </ThemedText>
            <Badge label="Clinical Review" variant="emergency" size="sm" />
          </View>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            {documentTitle || fileName || 'Outside Document'}
          </ThemedText>
          {fileName && documentTitle && documentTitle !== fileName ? (
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              File: {fileName}
            </ThemedText>
          ) : null}
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Uploaded by patient during registration. Specifying an exact clinical rationale is required.
          </ThemedText>
        </View>

        {/* Reason Presets */}
        <View style={styles.section}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Select Standard Clinical Reason *
          </ThemedText>
          <View style={styles.presetGrid}>
            {STANDARD_REJECTION_REASONS.map((preset) => {
              const isSelected = selectedPreset === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() => {
                    setSelectedPreset(preset);
                    setErrorMessage(null);
                  }}
                  style={[
                    styles.presetChip,
                    isSelected && styles.presetChip_selected,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <ThemedText
                    variant="captionBold"
                    color={isSelected ? theme.colors.emergencyText : theme.colors.textSecondary}
                  >
                    {preset}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Remarks Input */}
        <View style={styles.section}>
          <Input
            label={
              selectedPreset === 'Other / Custom reason'
                ? 'Clinical Rejection Remarks *'
                : 'Additional Clinical Notes (Optional)'
            }
            placeholder={
              selectedPreset === 'Other / Custom reason'
                ? 'Specify why this document is invalid or unacceptable...'
                : 'Optional instructions or explanation for nursing triage...'
            }
            value={customRemarks}
            onChangeText={(val) => {
              setCustomRemarks(val);
              if (errorMessage) setErrorMessage(null);
            }}
            multiline
            numberOfLines={3}
            error={errorMessage || undefined}
          />
        </View>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <Button
            title="Cancel"
            variant="secondary"
            onPress={onClose}
            disabled={loading}
          />
          <Button
            title="Confirm Rejection"
            variant="danger"
            icon="close"
            onPress={handleConfirm}
            loading={loading}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
  },
  contextBox: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: 4,
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  section: {
    gap: 6,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  presetChip_selected: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
});
