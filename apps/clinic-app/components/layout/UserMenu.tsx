import React from 'react';
import { View, StyleSheet, Pressable, PressableStateCallbackType } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Icon, { type IconName } from '../ui/Icon';
import { Skeleton } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useStaff, formatStaffName } from '../../context/StaffContext';
import { useThemeMode } from '../../context/ThemeModeContext';
import {
  getActiveAudioPreferences,
  setActiveAudioPreferences,
} from '../../utils/alertSounds';

type InteractionState = PressableStateCallbackType & { hovered?: boolean };

export interface UserMenuProps {
  /** Avatar only (phones / collapsed icon rail). */
  compact?: boolean;
  /** Visual variant: pill in the header, or a full-width card in the sidebar footer. */
  variant?: 'pill' | 'card';
  /** Custom navigation callback from parent layout. */
  onNavigate?: (route: string) => void;
  /** Currently active route name. */
  currentRoute?: string;
}

function initialsOf(name?: string | null): string {
  const clean = (name ?? '').trim();
  if (!clean) return '';
  const parts = clean.split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`;
  return letters.toUpperCase();
}

/**
 * The signed-in staff member avatar / card + 1-click Dark/Light Mode quick toggle.
 * Clicking the profile row navigates directly to "My Profile & Preferences" (/profile),
 * while the companion quick-toggle flips Dark/Light Mode in a single click.
 */
export default function UserMenu({
  compact = false,
  variant = 'pill',
  onNavigate,
  currentRoute,
}: UserMenuProps) {
  const { state: authState, user, offline } = useAuth();
  const { current: staffCurrent, loading: staffLoading } = useStaff();
  const { isDark, toggleDarkMode } = useThemeMode();
  const navigation = useNavigation<any>();

  const resolvedName = (staffCurrent ? formatStaffName(staffCurrent) : (user?.name ?? '')).trim();
  const resolvedEmail = (staffCurrent?.email || user?.email || '').trim();
  const isIdentityLoading =
    authState === 'booting' || (Boolean(staffLoading) && !resolvedName && !resolvedEmail);

  if (!user && !isIdentityLoading) return null;

  const role = (staffCurrent?.roleName || user?.roleName || staffCurrent?.role || user?.role || '').trim();
  const isSelected = currentRoute === 'Profile';
  const displayName = resolvedName || resolvedEmail;

  const handlePress = () => {
    if (onNavigate) {
      onNavigate('Profile');
    } else {
      navigation.navigate('Profile');
    }
  };

  const handleToggleDarkMode = () => {
    const nextMode = isDark ? 'light' : 'dark';
    setActiveAudioPreferences({
      ...getActiveAudioPreferences(),
      themeMode: nextMode,
    });
    toggleDarkMode();
  };

  if (isIdentityLoading || !displayName) {
    return (
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Loading profile"
        accessibilityState={{ selected: isSelected }}
        hitSlop={compact ? theme.spacing.xs : undefined}
        style={[
          variant === 'card' ? styles.card : styles.pill,
          compact && styles.compactContainer,
        ]}
      >
        <Skeleton width={32} height={32} radius={theme.radii.full} />
        {compact ? null : (
          <View style={styles.identity}>
            <Skeleton width={112} height={12} />
            <Skeleton width={84} height={10} />
          </View>
        )}
      </Pressable>
    );
  }

  const subtitleLabel = offline
    ? 'Offline | My Profile & Preferences'
    : variant === 'card' || !role
    ? 'My Profile & Preferences'
    : `${role} | My Profile & Preferences`;
  const tooltipLabel = role
    ? `${displayName} (${role}) - My Profile & Preferences`
    : `${displayName} - My Profile & Preferences`;

  const quickToggleLabel = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  const quickToggleIcon: IconName = isDark ? 'sun' : 'moon';

  const profileButton = (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Signed in as ${displayName}. Open My Profile & Preferences`}
      accessibilityState={{ selected: isSelected }}
      hitSlop={compact ? theme.spacing.xs : undefined}
      testID="user-menu-profile-button"
      style={(state: InteractionState) => [
        variant === 'card' ? styles.card : styles.pill,
        compact && styles.compactContainer,
        variant === 'card' && !compact && isSelected && styles.cardActive,
        variant === 'pill' && !compact && isSelected && styles.pillActive,
        compact && isSelected && styles.compactActive,
        state.hovered && (compact ? styles.compactHover : styles.hover),
        state.pressed && styles.pressed,
      ]}
      {...({ title: tooltipLabel } as any)}
    >
      <View style={[styles.avatar, isSelected && styles.avatarActive]}>
        <ThemedText variant="captionBold" color={theme.colors.onPrimary}>
          {initialsOf(displayName)}
        </ThemedText>
      </View>
      {compact ? null : (
        <View style={styles.identity}>
          <ThemedText
            variant="smallBold"
            numberOfLines={1}
            color={isSelected ? theme.colors.primary : theme.colors.text}
          >
            {displayName}
          </ThemedText>
          <View style={styles.subtitleRow}>
            <Icon
              name={offline ? 'alert' : 'settings'}
              size={theme.fontSizes.xs}
              color={isSelected ? theme.colors.primary : theme.colors.textMuted}
            />
            <ThemedText
              variant="caption"
              color={theme.colors.textMuted}
              numberOfLines={1}
              style={styles.subtitleText}
            >
              {subtitleLabel}
            </ThemedText>
          </View>
        </View>
      )}
      {compact ? null : (
        <Icon
          name="chevronRight"
          size={theme.sizes.iconSm}
          color={isSelected ? theme.colors.primary : theme.colors.textMuted}
        />
      )}
    </Pressable>
  );

  const quickToggleButton = compact ? (
    <Button
      variant="outline"
      size="sm"
      icon={quickToggleIcon}
      iconOnly
      accessibilityLabel={quickToggleLabel}
      tooltip={quickToggleLabel}
      testID="user-menu-theme-toggle"
      onPress={handleToggleDarkMode}
      style={styles.compactToggleBtn}
    />
  ) : (
    <Button
      title={quickToggleLabel}
      variant="subtle"
      size="xs"
      icon={quickToggleIcon}
      accessibilityLabel={quickToggleLabel}
      tooltip={quickToggleLabel}
      testID="user-menu-theme-toggle"
      onPress={handleToggleDarkMode}
      style={variant === 'card' ? styles.quickToggleCardBtn : styles.quickTogglePillBtn}
    />
  );

  return (
    <View
      style={
        compact
          ? variant === 'card'
            ? styles.compactCardStack
            : styles.compactPillCluster
          : variant === 'card'
          ? styles.cardMenuStack
          : styles.pillMenuCluster
      }
    >
      {compact && variant === 'pill' ? (
        <>
          {quickToggleButton}
          {profileButton}
        </>
      ) : (
        <>
          {profileButton}
          {quickToggleButton}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardMenuStack: {
    width: '100%',
    gap: theme.spacing.xs,
  },
  pillMenuCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  compactCardStack: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  compactPillCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
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
  pillActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
    ...theme.shadows.brandSubtle,
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
    width: '100%',
  },
  cardActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
    ...theme.shadows.brandSubtle,
  },
  quickToggleCardBtn: {
    width: '100%',
    justifyContent: 'flex-start',
    borderRadius: theme.radii.md,
  },
  quickTogglePillBtn: {
    borderRadius: theme.radii.full,
  },
  compactToggleBtn: {
    borderRadius: theme.radii.full,
  },
  compactContainer: {
    width: theme.sizes.controlSm + 2,
    minHeight: theme.sizes.controlSm + 2,
    padding: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderWidth: 0,
    borderColor: theme.colors.transparent,
    backgroundColor: theme.colors.transparent,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.full,
    gap: 0,
    maxWidth: undefined,
  },
  compactActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  compactHover: {
    backgroundColor: theme.colors.primarySubtle,
  },
  hover: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: {
    backgroundColor: theme.colors.primary,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  subtitleText: {
    flex: 1,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.8,
  },
});
