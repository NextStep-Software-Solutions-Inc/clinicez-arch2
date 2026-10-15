import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable, PressableStateCallbackType } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import UserMenu from './UserMenu';
import { theme } from '../../constants/theme';
import { useClinic } from '../../context/ClinicContext';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { useSidebar } from '../../context/SidebarContext';

export interface ClinicHeaderBarProps {
  /** Page title. This is the single source of the page heading - screens must not repeat it in the body. */
  title?: string;
  /** Defaults to the active facility name. */
  subtitle?: string;
  /** Page-level actions (e.g. "New patient"). */
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

type InteractionState = PressableStateCallbackType & { hovered?: boolean };

export default function ClinicHeaderBar({
  title,
  subtitle,
  rightAction,
  style,
}: ClinicHeaderBarProps) {
  const { facilityName } = useClinic();
  const { isCompact } = useBreakpoint();
  const { mode, cycleMode } = useSidebar();

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const resolvedSubtitle = subtitle ?? facilityName;

  const toggleTitle =
    mode === 'close'
      ? 'Open sidebar (Ctrl+B)'
      : mode === 'icon'
      ? 'Expand sidebar (Ctrl+B)'
      : 'Collapse sidebar to icon rail (Ctrl+B)';

  return (
    <View style={[styles.container, style]}>
      <View style={styles.leftSection}>
        {!isCompact && (
          <Pressable
            onPress={cycleMode}
            accessibilityRole="button"
            accessibilityLabel={toggleTitle}
            style={(state: InteractionState) => [
              styles.sidebarToggle,
              mode === 'close' && styles.sidebarToggleActive,
              state.hovered && styles.sidebarToggleHover,
              state.pressed && styles.sidebarTogglePressed,
            ]}
            {...({ title: toggleTitle } as any)}
          >
            <Icon
              name={mode === 'close' ? 'menu' : mode === 'icon' ? 'chevronRight' : 'chevronLeft'}
              size={theme.sizes.iconMd}
              color={mode === 'close' ? theme.colors.primary : theme.colors.textSecondary}
            />
          </Pressable>
        )}

        <View style={styles.titleBlock}>
          <ThemedText variant={isCompact ? 'title' : 'h2'} numberOfLines={1}>
            {title || facilityName || 'Clinic EZ'}
          </ThemedText>
          {resolvedSubtitle && title ? (
            <ThemedText variant="small" color={theme.colors.textMuted} numberOfLines={1}>
              {resolvedSubtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <View style={styles.rightSection}>
        {isCompact ? null : (
          <View style={styles.dateBadge}>
            <Icon name="calendar" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              {currentDate}
            </ThemedText>
          </View>
        )}

        {rightAction ?? null}

        {/* On workstation widths the picker lives in the sidebar footer. */}
        {isCompact ? <UserMenu compact /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing['2xl'],
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.lg,
    minHeight: theme.sizes.headerHeight,
  },
  leftSection: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  sidebarToggle: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarToggleActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
  },
  sidebarToggleHover: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  sidebarTogglePressed: {
    opacity: 0.8,
  },
  titleBlock: {
    minWidth: 0,
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
});
