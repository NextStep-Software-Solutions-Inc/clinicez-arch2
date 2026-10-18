import React from 'react';
import { View, StyleSheet, Pressable, PressableStateCallbackType } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useStaff, formatStaffName } from '../../context/StaffContext';

type InteractionState = PressableStateCallbackType & { hovered?: boolean };

export interface UserMenuProps {
  /** Avatar only (phones). */
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
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`;
  return letters.toUpperCase() || '?';
}

/**
 * The signed-in staff member avatar / card.
 * Clicking directly navigates to the dedicated full "My Profile & Credentials" screen.
 */
export default function UserMenu({
  compact = false,
  variant = 'pill',
  onNavigate,
  currentRoute,
}: UserMenuProps) {
  const { user, offline } = useAuth();
  const { current: staffCurrent } = useStaff();
  const navigation = useNavigation<any>();

  if (!user) return null;

  const role = user.roleName || user.role;
  const isSelected = currentRoute === 'Profile';
  const displayName = staffCurrent ? formatStaffName(staffCurrent) : (user.name || 'Staff');

  const handlePress = () => {
    if (onNavigate) {
      onNavigate('Profile');
    } else {
      navigation.navigate('Profile');
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Signed in as ${displayName}. Open my profile and credentials`}
      accessibilityState={{ selected: isSelected }}
      hitSlop={compact ? theme.spacing.xs : undefined}
      style={(state: InteractionState) => [
        variant === 'card' ? styles.card : styles.pill,
        compact && styles.compactContainer,
        variant === 'card' && !compact && isSelected && styles.cardActive,
        compact && isSelected && styles.compactActive,
        state.hovered && (compact ? styles.compactHover : styles.hover),
        state.pressed && styles.pressed,
      ]}
      {...(compact ? ({ title: displayName } as any) : {})}
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
          <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
            {offline ? 'Offline' : role}
          </ThemedText>
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
    width: '100%',
  },
  cardActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
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
    borderColor: 'transparent',
    backgroundColor: 'transparent',
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
    backgroundColor: theme.colors.surfaceSubtle,
  },
  hover: {
    backgroundColor: theme.colors.surfaceSubtle,
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
  },
  pressed: {
    opacity: 0.8,
  },
});
