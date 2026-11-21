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

export interface ProfileContactTabProps {
  title: string;
  firstName: string;
  middleName: string;
  lastName: string;
  accountEmail: string;
  phone: string;
  specialty: string;
  isPhysician: boolean;
  isDirty: boolean;
  saving: boolean;
  offline: boolean;
  showSkeletons?: boolean;
  error?: string | null;
  onChangeTitle: (value: string) => void;
  onChangeFirstName: (value: string) => void;
  onChangeMiddleName: (value: string) => void;
  onChangeLastName: (value: string) => void;
  onChangePhone: (value: string) => void;
  onChangeSpecialty: (value: string) => void;
  onSave: () => void | Promise<void>;
  onReset: () => void;
}

export default function ProfileContactTab({
  title,
  firstName,
  middleName,
  lastName,
  accountEmail,
  phone,
  specialty,
  isPhysician,
  isDirty,
  saving,
  offline,
  showSkeletons = false,
  error,
  onChangeTitle,
  onChangeFirstName,
  onChangeMiddleName,
  onChangeLastName,
  onChangePhone,
  onChangeSpecialty,
  onSave,
  onReset,
}: ProfileContactTabProps) {
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
                  <Icon name="patient" size={theme.sizes.iconMd} color={theme.colors.primary} />
                </View>
                {showSkeletons ? (
                  <Skeleton width={76} height={20} radius={theme.radii.full} />
                ) : (
                  <Badge
                    label={isDirty ? 'Unsaved Changes' : 'Saved'}
                    variant={isDirty ? 'warning' : 'success'}
                    size="xs"
                    icon={isDirty ? 'edit' : 'check'}
                  />
                )}
              </View>
              <ThemedText variant="h3" color={theme.colors.text}>
                Personal Information
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Your name, contact phone number, and specialty shown on schedules, consultation notes, and patient receipts.
              </ThemedText>
            </View>

            <View style={styles.formColumn}>
              {showSkeletons ? (
                <>
                  <SkeletonList rows={3} />
                  {accountEmail.trim() ? (
                    <Input
                      label="Sign-in email address"
                      value={accountEmail}
                      editable={false}
                      placeholder="Email address"
                      helperText="Your sign-in email address (contact your clinic admin to change it)."
                    />
                  ) : null}
                </>
              ) : (
                <>
                  <View style={styles.gridRow}>
                    <Input
                      containerStyle={styles.colNarrow}
                      label="Title"
                      value={title}
                      onChangeText={onChangeTitle}
                      placeholder="Title (optional)"
                    />
                    <Input
                      containerStyle={styles.colWide}
                      label="First name *"
                      required
                      value={firstName}
                      onChangeText={onChangeFirstName}
                      placeholder="First name"
                    />
                  </View>

                  <View style={styles.gridRow}>
                    <Input
                      containerStyle={styles.colHalf}
                      label="Middle name"
                      value={middleName}
                      onChangeText={onChangeMiddleName}
                      placeholder="Middle name (optional)"
                    />
                    <Input
                      containerStyle={styles.colHalf}
                      label="Last name *"
                      required
                      value={lastName}
                      onChangeText={onChangeLastName}
                      placeholder="Last name"
                    />
                  </View>

                  <View style={styles.gridRow}>
                    <Input
                      containerStyle={styles.colHalf}
                      label="Sign-in email address"
                      value={accountEmail}
                      editable={false}
                      placeholder="Email address"
                      helperText="Your sign-in email address (contact your clinic admin to change it)."
                    />
                    <Input
                      containerStyle={styles.colHalf}
                      label="Contact phone number"
                      value={phone}
                      onChangeText={onChangePhone}
                      placeholder="Phone number"
                      keyboardType="phone-pad"
                    />
                  </View>

                  <Input
                    label="Specialty or job title"
                    value={specialty}
                    onChangeText={onChangeSpecialty}
                    placeholder={isPhysician ? 'Medical specialty' : 'Role or department'}
                    helperText="Shown on consultation summaries, prescriptions, and clinic printouts."
                  />
                </>
              )}
            </View>
          </View>

          {!showSkeletons && (isDirty || saving) ? (
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
                  You have unsaved changes in Personal Info.
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
                  title="Save Profile"
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
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    width: '100%',
    alignSelf: 'stretch',
    gap: theme.spacing.md,
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
  colNarrow: {
    flex: 1,
    minWidth: 120,
  },
  colWide: {
    flex: 2,
    minWidth: 200,
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
    borderTopWidth: theme.sizes.borderWidth,
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
