import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import ClinicEzMark from '@ui/ClinicEzMark';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useNotificationContext } from '../../contexts/NotificationContext';

interface WebPageHeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  showBrand?: boolean;
  showAccountActions?: boolean;
  onOpenNotifications?: () => void;
  onOpenSettings?: () => void;
  right?: React.ReactNode;
}

/**
 * Top bar for web pages:
 *  - Pushed / nested pages: back button, title, and optional trailing actions.
 *  - Compact (< 768px) bottom-tab pages: ClinicEzMark brand icon, screen title + subtitle,
 *    and Notifications + Settings action buttons.
 */
export default function WebPageHeader({
  title,
  subtitle,
  onBack,
  showBrand,
  showAccountActions,
  onOpenNotifications,
  onOpenSettings,
  right,
}: WebPageHeaderProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { unreadCount } = useNotificationContext();

  return (
    <View
      accessibilityRole="header"
      style={[
        styles.root,
        {
          height: sizes.headerHeight,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={(s) => {
            const hovered = (s as { hovered?: boolean }).hovered;
            return [
              styles.back,
              {
                width: sizes.controlMd,
                height: sizes.controlMd,
                borderRadius: radii.md,
                marginRight: spacing.md,
                backgroundColor: hovered ? colors.surfaceSubtle : colors.transparent,
              },
            ];
          }}
        >
          <AppIcon name="back" size={sizes.iconLg} color="text" />
        </Pressable>
      ) : null}

      {showBrand && !onBack ? (
        <View style={{ marginRight: spacing.sm }}>
          <ClinicEzMark size={sizes.controlSm} variant="color" />
        </View>
      ) : null}

      <View style={styles.titleWrap}>
        <ThemedText variant={subtitle ? 'h3' : 'title'} numberOfLines={1}>
          {title ?? ''}
        </ThemedText>
        {subtitle ? (
          <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>

      {showAccountActions ? (
        <View style={[styles.actionsRow, { gap: spacing.xs }]}>
          {onOpenNotifications ? (
            <Pressable
              onPress={onOpenNotifications}
              accessibilityRole="button"
              accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              style={(s) => {
                const hovered = (s as { hovered?: boolean }).hovered;
                return [
                  styles.actionBtn,
                  {
                    width: sizes.controlMd,
                    height: sizes.controlMd,
                    borderRadius: radii.md,
                    borderColor: colors.border,
                    backgroundColor: hovered ? colors.surfaceSubtle : colors.transparent,
                  },
                ];
              }}
            >
              <AppIcon
                name={unreadCount > 0 ? 'notificationsActive' : 'notifications'}
                size={sizes.iconMd}
                color="text"
              />
              {unreadCount > 0 ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: colors.emergency, borderRadius: radii.full },
                  ]}
                >
                  <ThemedText variant="captionBold" color="textInverted">
                    {unreadCount > 9 ? '9+' : String(unreadCount)}
                  </ThemedText>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {onOpenSettings ? (
            <Pressable
              onPress={onOpenSettings}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              style={(s) => {
                const hovered = (s as { hovered?: boolean }).hovered;
                return [
                  styles.actionBtn,
                  {
                    width: sizes.controlMd,
                    height: sizes.controlMd,
                    borderRadius: radii.md,
                    borderColor: colors.border,
                    backgroundColor: hovered ? colors.surfaceSubtle : colors.transparent,
                  },
                ];
              }}
            >
              <AppIcon name="settings" size={sizes.iconMd} color="text" />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  back: { alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, minWidth: 0 },
  actionsRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
