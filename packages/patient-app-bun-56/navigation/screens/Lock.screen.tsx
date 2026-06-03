import { View, StyleSheet, Pressable } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';

export default function LockScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  return (
    <View style={styles.page}>
      <View style={styles.content}>
        <ThemedText style={styles.icon}>🔒</ThemedText>
        <ThemedText style={styles.title}>App Locked</ThemedText>
        <ThemedText style={styles.subtitle}>Your session is protected. Unlock to continue.</ThemedText>
      </View>
      <Pressable
        style={({ pressed }) => [styles.cta, { backgroundColor: colors.primary ?? '#3B82F6' }, pressed && styles.ctaPressed]}
        onPress={() => navigation.navigate('LockFlow', { screen: 'Unlock' })}
        accessibilityRole='button'
        accessibilityLabel='Unlock app'
      >
        <ThemedText style={styles.ctaText}>Unlock</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 48 },
  content: { alignItems: 'center', gap: 16 },
  icon: { fontSize: 64 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', opacity: 0.6 },
  cta: { borderRadius: 14, paddingVertical: 16, paddingHorizontal: 64 },
  ctaPressed: { opacity: 0.8 },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});