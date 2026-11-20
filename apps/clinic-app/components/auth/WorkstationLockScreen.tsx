import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import ThemedText from '../ui/ThemedText';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useFacilityLicense } from '../FacilityActivationGate';
import { PIN_LENGTH } from '../../services/pinCrypto';
import { AuthScreen, ErrorNotice, InfoNotice, authStyles } from './AuthScreen';

function initialsOf(name?: string | null): string {
  const clean = (name ?? '').trim();
  if (!clean) return 'ST';
  const parts = clean.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase() || 'ST';
}

/**
 * Server-enforced workstation lock screen.
 * Hides all patient data behind an unmounted AuthGate while preserving the staff member's
 * current route so unlocking via 6-digit PIN or password restores their exact workflow.
 */
export default function WorkstationLockScreen() {
  const { lockedSession, unlockWithPin, unlockWithPassword, switchStaffAccount } = useAuth();
  const { license } = useFacilityLicense();

  const canUsePin = Boolean(lockedSession?.hasQuickUnlockPin && lockedSession?.allowStaffPinUnlock);
  const [mode, setMode] = useState<'pin' | 'password'>(() => (canUsePin ? 'pin' : 'password'));
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canUsePin && mode === 'pin') {
      setMode('password');
    }
  }, [canUsePin, mode]);

  const roleLabel = useMemo(
    () => (lockedSession?.roleName || lockedSession?.role || '').trim(),
    [lockedSession?.roleName, lockedSession?.role],
  );

  const clinicName = lockedSession?.clinicName || license?.clinicName || 'Clinic EZ';

  const submitPin = async (digits: string) => {
    const clean = digits.replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (clean.length !== PIN_LENGTH || busy || switching) return;
    setBusy(true);
    setError(null);
    const err = await unlockWithPin(clean);
    if (err) {
      setPin('');
      setError(err);
      setBusy(false);
    }
  };

  const submitPassword = async () => {
    if (!password) {
      setError('Enter your password to unlock.');
      return;
    }
    if (busy || switching) return;
    setBusy(true);
    setError(null);
    const err = await unlockWithPassword(password);
    if (err) {
      setPassword('');
      setError(err);
      setBusy(false);
    }
  };

  const handleSwitchStaff = async () => {
    if (busy || switching) return;
    setSwitching(true);
    await switchStaffAccount();
  };

  const displayName = lockedSession?.name || 'Clinic Staff';

  return (
    <AuthScreen
      title="Workstation locked"
      subtitle={`Locked for patient privacy at ${clinicName}.`}
      clinicName={clinicName}
      clinicLogo={license?.primaryLogoUrl}
      primaryColor={license?.primaryColorHex}
      topRight={<Badge label="Locked" variant="warning" icon="lock" size="sm" />}
    >
      <View style={authStyles.form}>
        <View style={styles.identityCard} testID="workstation-locked-identity">
          <View style={styles.avatar}>
            <ThemedText variant="smallBold" color={theme.colors.onPrimary}>
              {initialsOf(displayName)}
            </ThemedText>
          </View>
          <View style={styles.identityDetails}>
            <ThemedText variant="bodyBold" color={theme.colors.text} numberOfLines={1}>
              {displayName}
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
              {[roleLabel, lockedSession?.email].filter(Boolean).join(' · ') || 'Signed-in staff'}
            </ThemedText>
          </View>
          <Icon name="shieldCheck" size={theme.sizes.iconMd} color={theme.colors.primary} />
        </View>

        <InfoNotice message="Unlock to return directly to your open screen and drafts." />
        {error ? <ErrorNotice message={error} /> : null}

        {mode === 'pin' ? (
          <View style={styles.unlockForm}>
            <Input
              label={`${PIN_LENGTH}-digit Quick-Unlock PIN`}
              value={pin}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, '').slice(0, PIN_LENGTH);
                setPin(digits);
                if (error) setError(null);
                if (digits.length === PIN_LENGTH) {
                  void submitPin(digits);
                }
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={PIN_LENGTH}
              placeholder="Enter 6-digit PIN"
              autoFocus
              editable={!busy && !switching}
              returnKeyType="go"
              onSubmitEditing={() => void submitPin(pin)}
              testID="workstation-lock-pin-input"
            />
            <Button
              title="Unlock with PIN"
              size="lg"
              icon="lock"
              loading={busy}
              disabled={pin.length !== PIN_LENGTH || switching}
              onPress={() => void submitPin(pin)}
              testID="workstation-lock-pin-submit"
            />
            <Button
              title="Use password instead"
              variant="ghost"
              size="sm"
              disabled={busy || switching}
              onPress={() => {
                setError(null);
                setPin('');
                setMode('password');
              }}
              testID="workstation-lock-use-password"
            />
          </View>
        ) : (
          <View style={styles.unlockForm}>
            <Input
              label="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (error) setError(null);
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              autoFocus
              editable={!busy && !switching}
              returnKeyType="go"
              onSubmitEditing={() => void submitPassword()}
              rightIcon={showPassword ? 'lock' : 'eye'}
              onRightIconPress={() => setShowPassword((v) => !v)}
              testID="workstation-lock-password-input"
            />
            <Button
              title="Unlock workstation"
              size="lg"
              icon="lock"
              loading={busy}
              disabled={switching}
              onPress={() => void submitPassword()}
              testID="workstation-lock-password-submit"
            />
            {canUsePin ? (
              <Button
                title="Use 6-digit PIN instead"
                variant="ghost"
                size="sm"
                disabled={busy || switching}
                onPress={() => {
                  setError(null);
                  setPassword('');
                  setMode('pin');
                }}
                testID="workstation-lock-use-pin"
              />
            ) : lockedSession?.allowStaffPinUnlock ? (
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Tip: Set a 6-digit Quick-Unlock PIN in My Profile → Security for faster resume next time.
              </ThemedText>
            ) : null}
          </View>
        )}

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Shared workstation?
          </ThemedText>
          <View style={styles.dividerLine} />
        </View>

        <Button
          title="Switch staff member"
          variant="outline"
          icon="logout"
          loading={switching}
          disabled={busy}
          onPress={() => void handleSwitchStaff()}
          testID="workstation-lock-switch-staff"
        />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  avatar: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityDetails: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  unlockForm: {
    gap: theme.spacing.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.border,
  },
});
