import { View, StyleSheet, Pressable, Image, Alert } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import { useAuth } from 'contexts/AuthContext';
import ThemedText from '@ui/ThemedText';

export default function LockScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user } = useUser();
  const { logout } = useAuth();

  const displayName =
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.emailAddresses[0]?.emailAddress ||
    'User';

  const email = user?.emailAddresses[0]?.emailAddress ?? '';

  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); } },
    ]);
  };

  return (
    <View style={styles.page}>
      <View style={styles.content}>
        <ThemedText style={styles.icon}>🔒</ThemedText>
        <ThemedText style={styles.title}>App Locked</ThemedText>
        <ThemedText style={styles.subtitle}>Your session is protected. Unlock to continue.</ThemedText>
      </View>

      {/* Authenticated user identity */}
      <View style={styles.userCard}>
        {user?.imageUrl ? (
          <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.primary ?? '#3B82F6' }]}>
            <ThemedText style={styles.initials}>{initials}</ThemedText>
          </View>
        )}
        <ThemedText style={styles.userName}>{displayName}</ThemedText>
        {email ? <ThemedText style={styles.userEmail}>{email}</ThemedText> : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.cta, { backgroundColor: colors.primary ?? '#3B82F6' }, pressed && styles.ctaPressed]}
          onPress={() => navigation.navigate('LockFlow', { screen: 'Unlock' })}
          accessibilityRole='button'
          accessibilityLabel='Unlock app'
        >
          <ThemedText style={styles.ctaText}>Unlock</ThemedText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && styles.ctaPressed]}
          onPress={handleLogout}
          accessibilityRole='button'
          accessibilityLabel='Sign out'
        >
          <ThemedText style={styles.logoutText}>Not you? Sign out</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 40 },
  content: { alignItems: 'center', gap: 16 },
  icon: { fontSize: 64 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', opacity: 0.6 },
  userCard: { alignItems: 'center', gap: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: { justifyContent: 'center', alignItems: 'center' },
  initials: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  userName: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  userEmail: { fontSize: 14, textAlign: 'center', opacity: 0.6 },
  actions: { alignItems: 'center', gap: 16, width: '100%' },
  cta: { borderRadius: 14, paddingVertical: 16, paddingHorizontal: 64 },
  ctaPressed: { opacity: 0.8 },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  logoutBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  logoutText: { fontSize: 15, color: '#EF4444', fontWeight: '500' },
});