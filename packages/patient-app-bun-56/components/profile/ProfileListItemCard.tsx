import { View, Pressable, StyleSheet, Alert, Platform } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { SFSymbol, MaterialSymbol } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';

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

  const handleDelete = () => {
    Alert.alert('Delete Entry', deleteMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
          <View style={[styles.badge, { backgroundColor: colors.primary + '22' }]}>
            <ThemedText style={[styles.badgeText, { color: colors.primary }]}>{badge}</ThemedText>
          </View>
        )}
      </View>
      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        <Pressable
          onPress={onEdit}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
        >
          {Platform.select({
            ios: <SFSymbol name="pencil" size={14} color={colors.primary} />,
            android: <MaterialSymbol name="edit" size={16} color={colors.primary} />,
          })}
          <ThemedText style={[styles.actionText, { color: colors.primary }]}>Edit</ThemedText>
        </Pressable>
        <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
        >
          {Platform.select({
            ios: <SFSymbol name="trash" size={14} color="#EF4444" />,
            android: <MaterialSymbol name="delete" size={16} color="#EF4444" />,
          })}
          <ThemedText style={[styles.actionText, { color: '#EF4444' }]}>Delete</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    overflow: 'hidden',
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
  actions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
  },
  actionText: { fontSize: 13, fontWeight: '500' },
  actionDivider: { width: StyleSheet.hairlineWidth },
});
