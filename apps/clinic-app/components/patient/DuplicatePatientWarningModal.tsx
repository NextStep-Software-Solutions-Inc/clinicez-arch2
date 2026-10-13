import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
} from 'react-native';
import ThemedText from '../ui/ThemedText';
import { IconSlot } from '../ui/Icon';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { theme } from '../../constants/theme';
import { DuplicateMatch } from '../../services/clinicService';

export interface DuplicatePatientWarningModalProps {
  visible: boolean;
  matches: DuplicateMatch[];
  onUseExistingProfile: (patientId: string) => void;
  onCreateNewProfileAnyway: () => void;
  onClose: () => void;
  isRegistering?: boolean;
  testID?: string;
}

export default function DuplicatePatientWarningModal({
  visible,
  matches,
  onUseExistingProfile,
  onCreateNewProfileAnyway,
  onClose,
  isRegistering = false,
  testID = 'duplicate-patient-warning-modal',
}: DuplicatePatientWarningModalProps) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.overlay}>
        <View style={styles.cardContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconContainer}>
              <IconSlot value="alert" size={theme.sizes.iconLg} color={theme.colors.warning} />
            </View>
            <View style={styles.headerTextGroup}>
              <ThemedText variant="h3" color={theme.colors.text}>
                Possible Duplicate Patient Detected
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.subtitle}>
                One or more existing patient records closely match the details you entered. Please verify whether this patient already has an existing chart in ClinicEZ.
              </ThemedText>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={theme.spacing.sm}
              testID="close-duplicate-warning-modal-btn"
            >
              <IconSlot value="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          {/* Matches List */}
          <ScrollView
            style={styles.listScrollView}
            contentContainerStyle={styles.listContent}
          >
            {matches.map((item) => {
              const matchPercent = item.similarityScore != null
                ? Math.round(item.similarityScore * 100)
                : null;

              return (
                <View
                  key={item.patientId}
                  style={styles.matchCard}
                  testID={`duplicate-match-card-${item.patientId}`}
                >
                  <View style={styles.matchCardHeader}>
                    <View style={styles.nameRow}>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        {item.fullName}
                      </ThemedText>
                      <Badge
                        label={item.patientCode}
                        variant="neutral"
                        size="sm"
                      />
                      {matchPercent != null ? (
                        <Badge
                          label={`${matchPercent}% Match`}
                          variant="warning"
                          size="sm"
                        />
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.demographicsRow}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      DOB: {item.dateOfBirth}
                      {item.contactNumber ? ` • Phone: ${item.contactNumber}` : ''}
                      {item.philHealthNumber ? ` • PIN: ${item.philHealthNumber}` : ''}
                    </ThemedText>
                  </View>

                  <View style={styles.reasonRow}>
                    <Badge
                      label={item.matchReason}
                      variant="warning"
                      size="sm"
                      icon="alertCircle"
                    />
                  </View>

                  <View style={styles.matchCardActions}>
                    <Button
                      title="Use Existing Profile"
                      variant="primary"
                      size="sm"
                      icon="arrowRight"
                      onPress={() => onUseExistingProfile(item.patientId)}
                      testID={`use-existing-profile-${item.patientId}`}
                    />
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Footer Decision Bar */}
          <View style={styles.footer}>
            <Button
              title="Create New Profile Anyway"
              variant="outline"
              onPress={onCreateNewProfileAnyway}
              loading={isRegistering}
              disabled={isRegistering}
              testID="create-new-profile-anyway-btn"
            />
            <Button
              title="Review / Edit Details"
              variant="ghost"
              onPress={onClose}
              disabled={isRegistering}
              testID="review-edit-details-btn"
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  cardContainer: {
    width: '92%',
    maxWidth: 640,
    maxHeight: '90%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  headerIconContainer: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextGroup: {
    flex: 1,
  },
  subtitle: {
    marginTop: theme.spacing.xs,
  },
  closeBtn: {
    padding: theme.spacing.xs,
  },
  listScrollView: {
    maxHeight: 320,
    marginBottom: theme.spacing.lg,
  },
  listContent: {
    gap: theme.spacing.md,
  },
  matchCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.warningBorder,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  matchCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  demographicsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  matchCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
});
