import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { Card, CardContent } from '../ui/Card';
import { Skeleton, SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import type { SignatureMode } from '../../services/clinicService';
import PhysicianStampSpecimenCard from './PhysicianStampSpecimenCard';
import type { ProfileCredentialVisibility } from './types';

export interface ProfileCredentialsTabProps {
  visibility: ProfileCredentialVisibility;
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
  error?: string | null;
  panInputSlot?: React.ReactNode;
  onChangePrc: (value: string) => void;
  onChangePtr: (value: string) => void;
  onChangePan: (value: string) => void;
  onChangeS2: (value: string) => void;
  onChangeSignature: (specimen: string | null, mode: SignatureMode) => void;
  onChangeSignatureMode: (mode: SignatureMode) => void;
  onSave: () => void | Promise<void>;
  onReset: () => void;
}

export default function ProfileCredentialsTab({
  visibility,
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
  error,
  panInputSlot,
  onChangePrc,
  onChangePtr,
  onChangePan,
  onChangeS2,
  onChangeSignature,
  onChangeSignatureMode,
  onSave,
  onReset,
}: ProfileCredentialsTabProps) {
  if (!visibility.showCredentialsTab) {
    return null;
  }

  return (
    <View style={styles.tabContainer}>
      {error ? (
        <View style={styles.errorBox}>
          <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
          <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
            {error}
          </ThemedText>
        </View>
      ) : null}

      <Card>
        <CardContent style={styles.cardBody}>
          <View style={styles.splitRow}>
            <View style={styles.contextColumn}>
              <View style={styles.contextHeader}>
                <View style={styles.iconTile}>
                  <Icon name="shieldCheck" size={theme.sizes.iconMd} color={theme.colors.primary} />
                </View>
                {showSkeletons ? (
                  <Skeleton width={88} height={20} radius={theme.radii.full} />
                ) : (
                  <Badge
                    label={
                      visibility.requirePrc && !prc.trim()
                        ? 'PRC Required'
                        : prc.trim()
                        ? 'PRC Recorded'
                        : 'Optional'
                    }
                    variant={
                      visibility.requirePrc && !prc.trim()
                        ? 'warning'
                        : prc.trim()
                        ? 'success'
                        : 'neutral'
                    }
                    size="xs"
                    icon={prc.trim() ? 'check' : 'shield'}
                  />
                )}
              </View>
              <ThemedText variant="h3" color={theme.colors.text}>
                {visibility.isPhysician
                  ? 'Professional Licenses'
                  : 'Professional License'}
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                {visibility.isPhysician
                  ? 'License numbers printed on your prescriptions, lab requests, and PhilHealth claims.'
                  : 'Your professional license number for clinical notes and patient records.'}
              </ThemedText>
            </View>

            <View style={styles.formColumn}>
              {showSkeletons ? (
                <SkeletonList rows={3} />
              ) : (
                <>
                  <View style={styles.gridRow}>
                    <Input
                      containerStyle={styles.colHalf}
                      label={
                        visibility.requirePrc
                          ? 'PRC License Number *'
                          : 'PRC / Professional License Number'
                      }
                      required={visibility.requirePrc}
                      value={prc}
                      onChangeText={onChangePrc}
                      placeholder="PRC license number"
                      helperText={
                        visibility.requirePrc
                          ? 'Required for doctors on all prescriptions.'
                          : 'Optional license number for clinical staff.'
                      }
                    />
                    {visibility.showPtrAndPan ? (
                      <Input
                        containerStyle={styles.colHalf}
                        label="Professional Tax Receipt (PTR)"
                        value={ptr}
                        onChangeText={onChangePtr}
                        placeholder="PTR number"
                        helperText="Your annual PTR number and issuing city or municipality."
                      />
                    ) : null}
                  </View>

                  {visibility.showPtrAndPan || visibility.showS2 ? (
                    <View style={styles.gridRow}>
                      {visibility.showPtrAndPan ? (
                        panInputSlot ?? (
                          <Input
                            containerStyle={styles.colHalf}
                            label="PhilHealth Accreditation Number (PAN)"
                            value={pan}
                            onChangeText={onChangePan}
                            placeholder="PhilHealth accreditation number"
                            helperText="Filled in automatically on PhilHealth consultations."
                          />
                        )
                      ) : null}

                      {visibility.showS2 ? (
                        <Input
                          containerStyle={styles.colHalf}
                          label="PDEA S2 License Number"
                          value={s2}
                          onChangeText={onChangeS2}
                          placeholder="S2 license number (optional)"
                          helperText="Required only when prescribing regulated yellow-pad medicines."
                        />
                      ) : null}
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </View>

          {!visibility.showPhysicianStamp && !showSkeletons && (isDirty || saving) ? (
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
                  You have unsaved license changes.
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
                  title="Save Licenses"
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

      {visibility.showPhysicianStamp ? (
        <PhysicianStampSpecimenCard
          title={title}
          firstName={firstName}
          lastName={lastName}
          specialty={specialty}
          prc={prc}
          ptr={ptr}
          pan={pan}
          s2={s2}
          signatureSpecimen={signatureSpecimen}
          defaultSignatureMode={defaultSignatureMode}
          isDirty={isDirty}
          saving={saving}
          offline={offline}
          showSkeletons={showSkeletons}
          onChangeSignature={onChangeSignature}
          onChangeSignatureMode={onChangeSignatureMode}
          onSave={onSave}
          onReset={onReset}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    width: '100%',
    alignSelf: 'stretch',
    gap: theme.spacing.lg,
  },
  cardBody: {
    gap: theme.spacing.lg,
  },
  splitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xl,
    alignItems: 'flex-start',
  },
  contextColumn: {
    flex: 1,
    minWidth: 220,
    maxWidth: 280,
    gap: theme.spacing.sm,
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  iconTile: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formColumn: {
    flex: 1,
    minWidth: 280,
    gap: theme.spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  colHalf: {
    flex: 1,
    minWidth: 200,
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
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.emergencySubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
  flex1: {
    flex: 1,
  },
});
