import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { Skeleton, SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import { PIN_LENGTH, isWeakPin } from '../../services/pinCrypto';
import { notify } from '../../utils/feedback';

export interface ProfileSecurityTabProps {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  savingPassword: boolean;
  passwordError?: string | null;
  offline: boolean;
  serverLabel?: string | null;
  serverUrl?: string | null;
  facilityName?: string | null;
  planTier?: string | null;
  showSkeletons?: boolean;
  clinicLoading?: boolean;
  hasQuickUnlockPin?: boolean;
  allowStaffPinUnlock?: boolean;
  onSetQuickUnlockPin?: (currentPassword: string, pin: string) => Promise<string | null>;
  onRemoveQuickUnlockPin?: (currentPassword: string) => Promise<string | null>;
  onChangeCurrentPassword: (value: string) => void;
  onChangeNewPassword: (value: string) => void;
  onChangeConfirmPassword: (value: string) => void;
  onUpdatePassword: () => void | Promise<void>;
  onChangeServer?: () => void;
}

export default function ProfileSecurityTab({
  currentPassword,
  newPassword,
  confirmPassword,
  savingPassword,
  passwordError,
  offline,
  serverLabel,
  serverUrl,
  facilityName,
  planTier,
  showSkeletons = false,
  clinicLoading = false,
  hasQuickUnlockPin = false,
  allowStaffPinUnlock = true,
  onSetQuickUnlockPin,
  onRemoveQuickUnlockPin,
  onChangeCurrentPassword,
  onChangeNewPassword,
  onChangeConfirmPassword,
  onUpdatePassword,
  onChangeServer,
}: ProfileSecurityTabProps) {
  const isNative = Platform.OS !== 'web';
  const cleanServerLabel = (serverLabel ?? '').trim();
  const cleanServerUrl = (serverUrl ?? '').trim();
  const cleanFacility = (facilityName ?? '').trim();

  const [pinMode, setPinMode] = useState<'idle' | 'set' | 'remove'>('idle');
  const [pinPassword, setPinPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const resetPinForm = () => {
    setPinMode('idle');
    setPinPassword('');
    setNewPin('');
    setConfirmPin('');
    setPinError(null);
  };

  const handleSavePin = async () => {
    if (!onSetQuickUnlockPin) return;
    if (!pinPassword) {
      setPinError('Enter your current password to verify your identity.');
      return;
    }
    if (isWeakPin(newPin)) {
      setPinError(`Choose a ${PIN_LENGTH}-digit PIN that is not a simple sequence or repeated digit.`);
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('The two PINs do not match.');
      return;
    }
    setPinBusy(true);
    setPinError(null);
    const err = await onSetQuickUnlockPin(pinPassword, newPin);
    setPinBusy(false);
    if (err) {
      setPinError(err);
      return;
    }
    notify.success('Workstation Quick-Unlock PIN saved.');
    resetPinForm();
  };

  const handleRemovePin = async () => {
    if (!onRemoveQuickUnlockPin) return;
    if (!pinPassword) {
      setPinError('Enter your current password to remove your PIN.');
      return;
    }
    setPinBusy(true);
    setPinError(null);
    const err = await onRemoveQuickUnlockPin(pinPassword);
    setPinBusy(false);
    if (err) {
      setPinError(err);
      return;
    }
    notify.success('Workstation Quick-Unlock PIN removed.');
    resetPinForm();
  };

  return (
    <View style={styles.tabContainer}>
      {/* Card 1: Password Change */}
      <Card>
        <CardContent style={styles.cardBody}>
          <View style={styles.splitRow}>
            <View style={styles.contextColumn}>
              <View style={styles.iconTile}>
                <Icon name="key" size={theme.sizes.iconMd} color={theme.colors.primary} />
              </View>
              <ThemedText variant="h3" color={theme.colors.text}>
                Change Password
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Update the password you use to sign in. Use at least 10 characters with both letters and numbers.
              </ThemedText>
            </View>

            <View style={styles.formColumn}>
              {showSkeletons ? (
                <SkeletonList rows={3} />
              ) : (
                <>
                  {passwordError ? (
                    <View style={styles.errorBox}>
                      <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
                      <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
                        {passwordError}
                      </ThemedText>
                    </View>
                  ) : null}

                  <Input
                    label="Current password"
                    value={currentPassword}
                    onChangeText={onChangeCurrentPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    placeholder="Enter current password"
                  />

                  <View style={styles.gridRow}>
                    <Input
                      containerStyle={styles.colHalf}
                      label="New password"
                      value={newPassword}
                      onChangeText={onChangeNewPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      placeholder="Minimum 10 characters"
                      helperText="At least 10 characters with letters and numbers."
                    />
                    <Input
                      containerStyle={styles.colHalf}
                      label="Confirm new password"
                      value={confirmPassword}
                      onChangeText={onChangeConfirmPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      placeholder="Re-type new password"
                    />
                  </View>

                  {currentPassword.length > 0 ||
                  newPassword.length > 0 ||
                  confirmPassword.length > 0 ||
                  savingPassword ? (
                    <View style={styles.actionsRow}>
                      <Button
                        title="Update Password"
                        variant="primary"
                        size="sm"
                        icon="key"
                        onPress={onUpdatePassword}
                        loading={savingPassword}
                        disabled={offline}
                      />
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </View>
        </CardContent>
      </Card>

      {/* Card 2: Workstation Quick-Unlock PIN */}
      <Card>
        <CardContent style={styles.cardBody}>
          <View style={styles.splitRow}>
            <View style={styles.contextColumn}>
              <View style={styles.iconTile}>
                <Icon name="lock" size={theme.sizes.iconMd} color={theme.colors.primary} />
              </View>
              <View style={styles.titleBadgeRow}>
                <ThemedText variant="h3" color={theme.colors.text}>
                  Quick-Unlock PIN
                </ThemedText>
                <Badge
                  label={
                    !allowStaffPinUnlock
                      ? 'Disabled by admin'
                      : hasQuickUnlockPin
                        ? 'Active'
                        : 'Not set'
                  }
                  variant={
                    !allowStaffPinUnlock
                      ? 'neutral'
                      : hasQuickUnlockPin
                        ? 'success'
                        : 'neutral'
                  }
                  size="sm"
                />
              </View>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Resume a locked clinic workstation quickly with a 6-digit PIN instead of re-typing your full password. Five wrong attempts automatically sign out the session.
              </ThemedText>
            </View>

            <View style={styles.formColumn}>
              {showSkeletons ? (
                <SkeletonList rows={2} />
              ) : !allowStaffPinUnlock ? (
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  Quick-Unlock PINs are currently disabled in your clinic security settings. Unlocking a locked workstation requires your account password.
                </ThemedText>
              ) : pinMode === 'set' ? (
                <>
                  {pinError ? (
                    <View style={styles.errorBox}>
                      <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
                      <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
                        {pinError}
                      </ThemedText>
                    </View>
                  ) : null}
                  <Input
                    label="Current password"
                    value={pinPassword}
                    onChangeText={(val) => {
                      setPinPassword(val);
                      if (pinError) setPinError(null);
                    }}
                    secureTextEntry
                    autoCapitalize="none"
                    placeholder="Confirm your current password"
                    testID="quick-pin-current-password"
                  />
                  <View style={styles.gridRow}>
                    <Input
                      containerStyle={styles.colHalf}
                      label={`New ${PIN_LENGTH}-digit PIN`}
                      value={newPin}
                      onChangeText={(val) => {
                        setNewPin(val.replace(/\D/g, '').slice(0, PIN_LENGTH));
                        if (pinError) setPinError(null);
                      }}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={PIN_LENGTH}
                      placeholder="6 digits"
                      helperText="Avoid repeating or sequential digits."
                      testID="quick-pin-new"
                    />
                    <Input
                      containerStyle={styles.colHalf}
                      label="Confirm PIN"
                      value={confirmPin}
                      onChangeText={(val) => {
                        setConfirmPin(val.replace(/\D/g, '').slice(0, PIN_LENGTH));
                        if (pinError) setPinError(null);
                      }}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={PIN_LENGTH}
                      placeholder="Re-type 6-digit PIN"
                      testID="quick-pin-confirm"
                    />
                  </View>
                  <View style={styles.pinActionsRow}>
                    <Button
                      title="Cancel"
                      variant="secondary"
                      size="sm"
                      onPress={resetPinForm}
                      disabled={pinBusy}
                    />
                    <Button
                      title={hasQuickUnlockPin ? 'Update PIN' : 'Save PIN'}
                      variant="primary"
                      size="sm"
                      icon="lock"
                      loading={pinBusy}
                      disabled={offline || !onSetQuickUnlockPin}
                      onPress={() => void handleSavePin()}
                      testID="quick-pin-save"
                    />
                  </View>
                </>
              ) : pinMode === 'remove' ? (
                <>
                  {pinError ? (
                    <View style={styles.errorBox}>
                      <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
                      <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
                        {pinError}
                      </ThemedText>
                    </View>
                  ) : null}
                  <Input
                    label="Current password"
                    value={pinPassword}
                    onChangeText={(val) => {
                      setPinPassword(val);
                      if (pinError) setPinError(null);
                    }}
                    secureTextEntry
                    autoCapitalize="none"
                    placeholder="Confirm password to remove PIN"
                    testID="quick-pin-remove-password"
                  />
                  <View style={styles.pinActionsRow}>
                    <Button
                      title="Cancel"
                      variant="secondary"
                      size="sm"
                      onPress={resetPinForm}
                      disabled={pinBusy}
                    />
                    <Button
                      title="Remove PIN"
                      variant="danger"
                      size="sm"
                      loading={pinBusy}
                      disabled={offline || !onRemoveQuickUnlockPin}
                      onPress={() => void handleRemovePin()}
                      testID="quick-pin-confirm-remove"
                    />
                  </View>
                </>
              ) : (
                <View style={styles.pinActionsRow}>
                  <Button
                    title={hasQuickUnlockPin ? 'Change 6-digit PIN' : 'Set 6-digit PIN'}
                    variant="primary"
                    size="sm"
                    icon="lock"
                    disabled={offline || !onSetQuickUnlockPin}
                    onPress={() => {
                      setPinError(null);
                      setPinMode('set');
                    }}
                    testID="quick-pin-open-setup"
                  />
                  {hasQuickUnlockPin ? (
                    <Button
                      title="Remove PIN"
                      variant="secondary"
                      size="sm"
                      disabled={offline || !onRemoveQuickUnlockPin}
                      onPress={() => {
                        setPinError(null);
                        setPinMode('remove');
                      }}
                      testID="quick-pin-open-remove"
                    />
                  ) : null}
                </View>
              )}
            </View>
          </View>
        </CardContent>
      </Card>

      {/* Card 3: Server Connection Summary */}
      <Card>
        <CardHeader
          icon="wifi"
          title="Server Connection"
          subtitle="See which clinic server your account is connected to"
          rightAction={
            showSkeletons || clinicLoading ? (
              <Skeleton width={84} height={22} radius={theme.radii.full} />
            ) : (
              <Badge
                label={offline ? 'Offline' : 'Connected'}
                variant={offline ? 'warning' : 'success'}
                size="sm"
                icon={offline ? 'alert' : 'check'}
              />
            )
          }
        />
        <CardContent style={styles.connectionBody}>
          <View style={styles.nodeGrid}>
            <View style={styles.nodeTile}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Clinic Server
              </ThemedText>
              {showSkeletons ? (
                <Skeleton width={120} height={14} />
              ) : (
                <>
                  <ThemedText variant="smallBold" color={theme.colors.text}>
                    {cleanServerLabel || cleanServerUrl || 'Not configured'}
                  </ThemedText>
                  {cleanServerUrl && cleanServerLabel && cleanServerUrl !== cleanServerLabel ? (
                    <ThemedText variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
                      {cleanServerUrl}
                    </ThemedText>
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.nodeTile}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Clinic
              </ThemedText>
              {showSkeletons || clinicLoading ? (
                <Skeleton width={120} height={14} />
              ) : (
                <>
                  <ThemedText variant="smallBold" color={theme.colors.text}>
                    {cleanFacility || 'Not configured'}
                  </ThemedText>
                  {planTier ? (
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      {planTier} Plan
                    </ThemedText>
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.nodeTile}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Connection Status
              </ThemedText>
              {showSkeletons ? (
                <Skeleton width={120} height={14} />
              ) : (
                <>
                  <ThemedText variant="smallBold" color={theme.colors.text}>
                    {offline ? 'Working Offline' : 'Connected Online'}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {offline ? 'Changes will save online when reconnected' : 'Saving changes automatically'}
                  </ThemedText>
                </>
              )}
            </View>
          </View>

          {isNative && onChangeServer ? (
            <View style={styles.nativeActionRow}>
              <Button
                title="Change Clinic Server"
                variant="outline"
                size="sm"
                icon="settings"
                onPress={onChangeServer}
              />
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
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: theme.spacing.xs,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  pinActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  connectionBody: {
    gap: theme.spacing.md,
  },
  nodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  nodeTile: {
    flex: 1,
    minWidth: 200,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: 2,
  },
  nativeActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingTop: theme.spacing.xs,
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
