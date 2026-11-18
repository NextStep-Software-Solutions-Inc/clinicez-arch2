import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { Skeleton, SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';

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

      {/* Card 2: Server Connection Summary (No Offline PIN/Biometrics or OTA stubs on Web) */}
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
