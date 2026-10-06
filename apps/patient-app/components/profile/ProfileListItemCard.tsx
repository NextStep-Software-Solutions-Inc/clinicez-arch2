import { View, Pressable, StyleSheet, Alert, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '@react-navigation/native';
import { AppIcon } from '@ui/Icon';
import ThemedText from '@ui/ThemedText';

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
  const { colors } = useTheme();
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  const close = () => { translateX.value = withSpring(0, { damping: 20 }); };
  const open = () => { translateX.value = withSpring(-ACTION_W, { damping: 20 }); };

  const pan = Gesture.Pan()
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
    Alert.alert('Delete Entry', deleteMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  const handleEdit = () => {
    close();
    onEdit();
  };

  return (
    <View style={[styles.wrapper, { borderRadius: 12 }]}>
      {/* Action panel — hidden behind the card, revealed on swipe-left */}
      <View style={[styles.actionsPanel, { backgroundColor: colors.card }]}>
        <Pressable
          onPress={handleEdit}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
        >
          <AppIcon android="edit" ios="pencil" size={16} color={colors.primary} />
          <ThemedText style={[styles.actionText, { color: colors.primary }]}>Edit</ThemedText>
        </Pressable>
        <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
        >
          <AppIcon android="delete" ios="trash" size={16} color="#EF4444" />
          <ThemedText style={[styles.actionText, { color: '#EF4444' }]}>Delete</ThemedText>
        </Pressable>
      </View>

      {/* Card face — slides left to reveal action panel */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.card, cardStyle, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.content}>
            <View style={styles.text}>
              <ThemedText style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {title}
              </ThemedText>
              {subtitle ? (
                <ThemedText style={[styles.subtitle, { color: colors.text }]} numberOfLines={1}>
                  {subtitle}
                </ThemedText>
              ) : null}
            </View>
            {badge && (
              <View style={[styles.badge, { backgroundColor: String(colors.primary) + '22' }]}>
                <ThemedText style={[styles.badgeText, { color: colors.primary }]}>{badge}</ThemedText>
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
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  text: { flex: 1 },
  title: { fontSize: 15, fontWeight: '500' },
  subtitle: { fontSize: 12, marginTop: 2, opacity: 0.6 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
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
  actionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionDivider: { width: StyleSheet.hairlineWidth },
});
