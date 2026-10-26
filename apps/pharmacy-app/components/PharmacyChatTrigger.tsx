import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePharmacyComms } from '../context/PharmacyCommsContext';
import { useConversations } from '@clinicez/comms-sdk/react';
import { lightColors, radiusScale, spaceScale, sizes, fontSizeScale } from '@clinicez/design-tokens';

export function PharmacyChatTrigger() {
  const { toggleChat } = usePharmacyComms();
  const { conversations } = useConversations();

  const totalUnread = useMemo(() => {
    return conversations.reduce((acc, c) => acc + ((c as any).unreadCount || 0), 0);
  }, [conversations]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.trigger,
        pressed && styles.triggerPressed,
      ]}
      onPress={toggleChat}
      accessibilityRole="button"
      accessibilityLabel={`Toggle pharmacy communications${totalUnread > 0 ? `, ${totalUnread} unread messages` : ''}`}
    >
      <View style={styles.content}>
        <Text style={styles.triggerText}>Comms</Text>
        {totalUnread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    position: 'absolute',
    bottom: spaceScale['2xl'],
    right: spaceScale['2xl'],
    backgroundColor: lightColors.primary,
    paddingHorizontal: spaceScale.lg,
    paddingVertical: spaceScale.md,
    borderRadius: radiusScale.full,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: lightColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 999,
  },
  triggerPressed: {
    backgroundColor: lightColors.primaryHover,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.sm,
  },
  triggerText: {
    color: lightColors.onPrimary,
    fontSize: fontSizeScale.md,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: lightColors.emergency,
    minWidth: spaceScale.xl,
    height: spaceScale.xl,
    borderRadius: radiusScale.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spaceScale.xs,
  },
  badgeText: {
    color: lightColors.onPrimary,
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
  },
});
