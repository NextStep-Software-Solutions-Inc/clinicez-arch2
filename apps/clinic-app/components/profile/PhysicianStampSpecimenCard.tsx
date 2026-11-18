import React, { useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import SegmentedControl from '../ui/SegmentedControl';
import { Card, CardContent } from '../ui/Card';
import { Skeleton, SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import type { SignatureMode } from '../../services/clinicService';
import SignatureSpecimenModal from '../settings/SignatureSpecimenModal';

export interface PhysicianStampSpecimenCardProps {
  title: string;
  firstName: string;
  lastName: string;
  specialty: string;
  prc: string;
  ptr: string;
  pan: string;
  s2: string;
  signatureSpecimen: string | null;
  defaultSignatureMode: SignatureMode;
  isDirty: boolean;
  saving: boolean;
  offline: boolean;
  showSkeletons?: boolean;
  onChangeSignature: (specimen: string | null, mode: SignatureMode) => void;
  onChangeSignatureMode: (mode: SignatureMode) => void;
  onSave: () => void | Promise<void>;
  onReset: () => void;
}

export default function PhysicianStampSpecimenCard({
  title,
  firstName,
  lastName,
  specialty,
  prc,
  ptr,
  pan,
  s2,
  signatureSpecimen,
  defaultSignatureMode,
  isDirty,
  saving,
  offline,
  showSkeletons = false,
  onChangeSignature,
  onChangeSignatureMode,
  onSave,
  onReset,
}: PhysicianStampSpecimenCardProps) {
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  const composedName = [title.trim(), firstName.trim(), lastName.trim()]
    .filter(Boolean)
    .join(' ');
  const stampNameLine = composedName.toUpperCase();

  if (showSkeletons) {
    return (
      <Card>
        <CardContent style={styles.cardBody}>
          <View style={styles.stampHeaderRow}>
            <ThemedText variant="h3" color={theme.colors.text}>
              Prescription Stamp & Signature
            </ThemedText>
            <Skeleton width={110} height={22} radius={theme.radii.full} />
          </View>
          <SkeletonList rows={4} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent style={styles.cardBody}>
        <View style={styles.specimenSplitRow}>
          <View style={styles.specimenColumn}>
            <View style={styles.stampBox}>
              {defaultSignatureMode === 'ESignatureSpecimen' ? (
                signatureSpecimen ? (
                  <View style={styles.stampSignatureOverlay}>
                    <Image
                      source={{ uri: signatureSpecimen }}
                      style={styles.stampSignatureImage}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <View style={styles.stampSignatureEmpty}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      No e-signature added yet - click Upload / Draw Signature
                    </ThemedText>
                  </View>
                )
              ) : defaultSignatureMode === 'WetSignature' ? (
                <View style={styles.stampWetSignatureBox}>
                  <View style={styles.stampWetLine} />
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Handwritten Signature (Sign with Pen)
                  </ThemedText>
                </View>
              ) : null}

              <ThemedText variant="bodyBold" color={theme.colors.primary} style={styles.stampName}>
                {stampNameLine || 'Name not configured'}
              </ThemedText>
              {specialty.trim() ? (
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  {specialty.trim()}
                </ThemedText>
              ) : null}
              <View style={styles.stampDivider} />
              <ThemedText variant="small" color={theme.colors.text}>
                {prc ? `PRC License No. ${prc}` : 'PRC License No. [Required for Prescriptions]'}
              </ThemedText>
              {ptr ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {ptr}
                </ThemedText>
              ) : null}
              {pan ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {`PhilHealth PAN: ${pan}`}
                </ThemedText>
              ) : null}
              {s2 ? (
                <ThemedText variant="captionBold" color={theme.colors.emergency}>
                  {s2}
                </ThemedText>
              ) : null}
            </View>
          </View>

          <View style={styles.controlsColumn}>
            <View style={styles.stampHeaderRow}>
              <ThemedText variant="h3" color={theme.colors.text}>
                Prescription Stamp & Signature
              </ThemedText>
              {defaultSignatureMode === 'ESignatureSpecimen' ? (
                <Badge label="E-Signature Ready" variant="success" size="sm" icon="check" />
              ) : defaultSignatureMode === 'DigitalSealOnly' ? (
                <Badge label="Printed Stamp" variant="primary" size="sm" icon="shield" />
              ) : (
                <Badge label="Sign by Hand" variant="neutral" size="sm" />
              )}
            </View>

            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Printed on your prescriptions, lab requests, medical certificates, and consultation summaries.
            </ThemedText>

            <View style={styles.controlBlock}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                HOW YOU SIGN PRESCRIPTIONS
              </ThemedText>
              <SegmentedControl<SignatureMode>
                value={defaultSignatureMode}
                onChange={onChangeSignatureMode}
                options={[
                  { value: 'ESignatureSpecimen', label: 'E-Signature' },
                  { value: 'DigitalSealOnly', label: 'Printed Stamp' },
                  { value: 'WetSignature', label: 'Sign by Hand' },
                ]}
              />
            </View>

            <View style={styles.signatureActionsRow}>
              <Button
                title={signatureSpecimen ? 'Edit Signature' : 'Upload / Draw Signature'}
                variant="outline"
                size="sm"
                icon="edit"
                onPress={() => setSignatureModalVisible(true)}
              />
            </View>
          </View>
        </View>

        <SignatureSpecimenModal
          visible={signatureModalVisible}
          onClose={() => setSignatureModalVisible(false)}
          initialSignature={signatureSpecimen}
          initialMode={defaultSignatureMode}
          doctorName={composedName}
          credentials={{
            specialty,
            prc,
            ptr,
            s2,
            pan,
          }}
          onSave={async (newSig, newMode) => {
            onChangeSignature(newSig, newMode);
          }}
        />

        {isDirty || saving ? (
          <View style={[styles.dirtyBar, styles.dirtyBarActive]}>
            <View style={styles.dirtyInfo}>
              <Icon
                name="alertCircle"
                size={theme.sizes.iconSm}
                color={theme.colors.warning}
              />
              <ThemedText
                variant="captionBold"
                color={theme.colors.warningText}
              >
                You have unsaved license or signature changes.
              </ThemedText>
            </View>

            <View style={styles.dirtyActions}>
              <Button
                title="Discard"
                variant="ghost"
                size="sm"
                icon="undo"
                onPress={onReset}
                disabled={saving}
              />
              <Button
                title="Save Licenses & Signature"
                variant="primary"
                size="sm"
                icon="save"
                onPress={onSave}
                loading={saving}
                disabled={offline}
              />
            </View>
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardBody: {
    gap: theme.spacing.lg,
  },
  specimenSplitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xl,
    alignItems: 'stretch',
  },
  specimenColumn: {
    flex: 1,
    minWidth: 260,
    justifyContent: 'center',
  },
  controlsColumn: {
    flex: 1,
    minWidth: 260,
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  stampHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  controlBlock: {
    gap: theme.spacing.xs,
  },
  signatureActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  stampBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    gap: 4,
  },
  stampSignatureOverlay: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  stampSignatureImage: {
    width: 220,
    height: 54,
  },
  stampSignatureEmpty: {
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  stampWetSignatureBox: {
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  stampWetLine: {
    width: 200,
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.textMuted,
  },
  stampName: {
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  stampDivider: {
    width: '60%',
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
  },
  dirtyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
  dirtyBarActive: {
    backgroundColor: theme.colors.warningBg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.warningBorder,
  },
  dirtyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
    minWidth: 200,
  },
  dirtyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
