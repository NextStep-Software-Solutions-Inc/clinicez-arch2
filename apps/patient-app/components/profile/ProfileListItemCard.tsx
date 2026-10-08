import React from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { AppIcon } from '@ui/Icon';
import ThemedText from '@ui/ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';

const ACTION_W = 130; // total width of the revealed action panel

interface ProfileListItemCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  onEdit: () => void;
  onDelete: () => void;
  deleteMessage?: string;
}

export default function ProfileListItemCard({
  title,
  subtitle,
  badge,
  onEdit,
  onDelete,
  deleteMessage = 'Are you sure you want to delete this entry?',
}: ProfileListItemCardProps) {
  const { colors, radii, sizes } = useAppTheme();
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  const close = () => {
    translateX.value = withSpring(0, { damping: 20 });
  };
  const open = () => {
    translateX.value = withSpring(-ACTION_W, { damping: 20 });
  };

  const pan = Gesture.Pan()
    .enabled(Platform.OS !== 'web')
    .activeOffsetX([-8, 8])
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      translateX.value = Math.max(-ACTION_W, Math.min(0, startX.value + e.translationX));
    })
    .onEnd((e) => {
      if (e.velocityX < -300 || translateX.value < -ACTION_W / 2) {
        runOnJS(open)();
      } else {
        runOnJS(close)();
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleDelete = () => {
    close();
    onDelete();
  };

  const handleEdit = () => {
    close();
    onEdit();
  };

  return (
    <View style={[styles.wrapper, { borderRadius: radii.md }]}>
      {/* Action panel — hidden behind the card on mobile, revealed on swipe-left */}
      {Platform.OS !== 'web' && (
        <View style={[styles.actionsPanel, { backgroundColor: colors.surface }]}>
          <Pressable
            onPress={handleEdit}
            style={({ pressed, hovered }: any) => [
              styles.actionBtn,
              hovered && { backgroundColor: colors.primarySubtle },
              pressed && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Edit"
          >
            <AppIcon name="edit" size={sizes.iconSm} color="primary" />
            <ThemedText variant="captionBold" color="primary">
              Edit
            </ThemedText>
          </Pressable>
          <View style={[styles.actionDivider, { backgroundColor: colors.borderLight }]}>
          </View>
          <Pressable
            onPress={handleDelete}
            style={({ pressed, hovered }: any) => [
              styles.actionBtn,
              hovered && { backgroundColor: colors.emergencyBg },
              pressed && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Delete"
          >
            <AppIcon name="trash" size={sizes.iconSm} color="emergency" />
            <ThemedText variant="captionBold" color="emergency">
              Delete
            </ThemedText>
          </Pressable>
        </View>
      )}

      {/* Card face — slides left to reveal action panel on mobile, stationary with buttons on web */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.card,
            cardStyle,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.md,
            },
          ]}
        >
          <View style={styles.content}>
            <View style={styles.text}>
              <ThemedText variant="bodyBold" numberOfLines={1}>
                {title}
              </ThemedText>
              {subtitle ? (
                <ThemedText variant="small" color="textSecondary" numberOfLines={1} style={styles.subtitle}>
                  {subtitle}
                </ThemedText>
              ) : null}
            </View>
            {badge && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: colors.primarySubtle,
                    borderRadius: radii.xs,
                  },
                ]}
              >
                <ThemedText variant="badge" color="primary">
                  {badge}
                </ThemedText>
              </View>
            )}
            {Platform.OS === 'web' && (
              <View style={styles.webActions}>
                <Pressable
                  onPress={onEdit}
                  style={({ pressed, hovered }: any) => [
                    styles.webActionBtn,
                    { borderRadius: radii.sm },
                    hovered && { backgroundColor: colors.primarySubtle },
                    pressed && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Edit"
                >
                  <AppIcon name="edit" size={sizes.iconSm} color="primary" />
                </Pressable>
                <Pressable
                  onPress={onDelete}
                  style={({ pressed, hovered }: any) => [
                    styles.webActionBtn,
                    { borderRadius: radii.sm },
                    hovered && { backgroundColor: colors.emergencyBg },
                    pressed && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete"
                >
                  <AppIcon name="trash" size={sizes.iconSm} color="emergency" />
                </Pressable>
              </View>
            )}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 10,
    overflow: 'hidden',
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  text: {
    flex: 1,
  },
  subtitle: {
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  actionsPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    width: ACTION_W / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
  },
  webActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  webActionBtn: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
