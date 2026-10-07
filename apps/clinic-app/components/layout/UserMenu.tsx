import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Input from '../ui/Input';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useConnection } from '../connection/ConnectionGate';
import { notify } from '../../utils/feedback';
import { validatePasswordPolicy } from '../../services/passwordPolicy';

export interface UserMenuProps {
  /** Avatar only (phones). */
  compact?: boolean;
  /** Visual variant: pill in the header, or a full-width card in the sidebar footer. */
  variant?: 'pill' | 'card';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`;
  return letters.toUpperCase() || '?';
}

/**
 * The signed-in staff member. Replaces the old "working as" picker: identity now comes from the session, so every
 * action is attributed to a real, authenticated account.
 */
export default function UserMenu({ compact = false, variant = 'pill' }: UserMenuProps) {
  const { user, offline, logout, changePassword } = useAuth();
  const { serverLabel } = useConnection();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const role = user.roleName || user.role;
  const close = () => {
    setOpen(false);
    setChanging(false);
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  };

  const submitPassword = async () => {
    const problems = validatePasswordPolicy(next);
    if (!current) return setError('Enter your current password.');
    if (problems.length > 0) return setError(problems.join(' '));
    if (next !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    const failure = await changePassword(current, next);
    setBusy(false);
    if (failure) return setError(failure);
    notify.success('Password changed.');
    close();
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Signed in as ${user.name}. Open account menu`}
        style={({ pressed }) => [variant === 'card' ? styles.card : styles.pill, pressed && styles.pressed]}
      >
        <View style={styles.avatar}>
          <ThemedText variant="captionBold" color={theme.colors.onPrimary}>
            {initialsOf(user.name)}
          </ThemedText>
        </View>
        {compact ? null : (
          <View style={styles.identity}>
            <ThemedText variant="smallBold" numberOfLines={1}>
              {user.name}
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
              {offline ? 'Offline' : role}
            </ThemedText>
          </View>
        )}
        {compact ? null : <Icon name="chevronDown" size={theme.sizes.iconSm} color={theme.colors.textMuted} />}
      </Pressable>

      <Modal
        visible={open}
        onClose={close}
        title={changing ? 'Change password' : user.name}
        subtitle={changing ? 'Use at least 10 characters with letters and numbers.' : `${role} · ${user.clinicName}`}
        maxWidth={440}
        footer={
          changing ? (
            <View style={styles.footer}>
              <Button title="Cancel" variant="secondary" onPress={() => setChanging(false)} disabled={busy} />
              <Button title="Save password" loading={busy} onPress={submitPassword} />
            </View>
          ) : undefined
        }
      >
        {changing ? (
          <View style={styles.form}>
            {error ? (
              <ThemedText variant="small" color={theme.colors.emergencyText}>
                {error}
              </ThemedText>
            ) : null}
            <Input label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
            <Input label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
            <Input label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.row}>
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                Server
              </ThemedText>
              <View style={styles.rowValue}>
                <ThemedText variant="smallBold">{serverLabel || 'This site'}</ThemedText>
                <Badge label={offline ? 'Offline' : 'Connected'} variant={offline ? 'warning' : 'success'} size="sm" />
              </View>
            </View>
            <Button title="Change password" variant="secondary" icon="key" onPress={() => setChanging(true)} disabled={offline} />
            <Button
              title="Sign out"
              variant="secondary"
              icon="logout"
              onPress={async () => {
                close();
                await logout();
              }}
            />
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingLeft: theme.spacing.xs,
    paddingRight: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    maxWidth: 260,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  avatar: {
    width: theme.sizes.controlMd - theme.spacing.xs,
    height: theme.sizes.controlMd - theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  form: {
    gap: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
});
