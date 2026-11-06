import React, { memo } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import ClinicEzMark from '../ui/ClinicEzMark';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import { extractInitials } from '../../services/home/homeDashboardService';

export interface AppointmentsHeaderProps {
  fullName: string;
  avatarUrl?: string | null;
  unreadCount?: number;
  showBrand?: boolean;
  onNotificationsPress: () => void;
  onAvatarPress: () => void;
  onBookNewPress: () => void;
  onBrandPress?: () => void;
}

function AppointmentsHeaderComponent({
  fullName,
  avatarUrl,
  unreadCount = 0,
  showBrand = true,
  onNotificationsPress,
  onAvatarPress,
  onBookNewPress,
  onBrandPress,
}: AppointmentsHeaderProps) {
  const { colors, typography, radii, spacing } = useClinicalEmpathyTheme();
  const initials = extractInitials(fullName);

  return (
    <View style={styles.container}>
      {/* Top row: Brand + Bell & Avatar */}
      <View style={styles.topRow}>
        <View style={styles.brandContainer}>
          {showBrand ? (
            <Pressable
              accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
              accessibilityLabel="Clinic EZ Home"
              onPress={onBrandPress}
              hitSlop={8}
            >
              <ClinicEzMark size={36} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.rightActions, { gap: spacing.md }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Notifications, ${unreadCount} unread`}
            onPress={onNotificationsPress}
            hitSlop={8}
            style={[
              styles.iconButton,
              {
                width: 40,
                height: 40,
                borderRadius: radii.full,
              },
            ]}
          >
            <AppIcon name="notifications" size={22} color={colors.navyText} />
            {unreadCount > 0 ? (
              <View
                style={[
                  styles.notificationDot,
                  {
                    backgroundColor: colors.roseAccent,
                    borderColor: colors.surface,
                    borderRadius: radii.full,
                    borderWidth: 1.5,
                  },
                ]}
              />
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Profile, ${fullName}`}
            onPress={onAvatarPress}
            hitSlop={4}
            style={[
              styles.avatarButton,
              {
                width: 40,
                height: 40,
                borderRadius: radii.full,
                borderColor: colors.border,
                borderWidth: 1.5,
                backgroundColor: colors.mintSoftBg,
              },
            ]}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text
                style={[
                  typography.labelSm,
                  {
                    color: colors.primaryDeep,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                  },
                ]}
              >
                {initials}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Title & Action Row: Appointments + Book New */}
      <View style={[styles.titleRow, { marginTop: spacing.md }]}>
        <View style={styles.titleColumn}>
          <Text
            style={[
              typography.headlineLg,
              {
                color: colors.navyText,
                fontWeight: '700',
              },
            ]}
          >
            Appointments
          </Text>
          <Text
            style={[
              typography.bodySm,
              {
                color: colors.mutedText,
                marginTop: 2,
              },
            ]}
          >
            Scheduled visits across open network
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Book New Appointment"
          onPress={onBookNewPress}
          style={({ pressed }) => [
            styles.bookNewBtn,
            {
              backgroundColor: colors.primaryDeep,
              borderRadius: radii.full,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm + 2,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <AppIcon name="plus" size={16} color={colors.onPrimary} strokeWidth={2.5} />
          <Text
            style={[
              typography.labelMd,
              {
                color: colors.onPrimary,
                fontWeight: '600',
              },
            ]}
          >
            Book New
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export const AppointmentsHeader = memo(AppointmentsHeaderComponent);
export default AppointmentsHeader;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  brandContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 9,
    height: 9,
  },
  avatarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleColumn: {
    flex: 1,
    paddingRight: 12,
  },
  bookNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
