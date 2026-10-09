import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import { useAuth } from '../../components/AuthGate';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <ThemedText style={styles.title}>{user?.fullName}</ThemedText>
        <ThemedText style={styles.meta}>{user?.email}</ThemedText>
        <ThemedText style={styles.meta}>
          {user?.role} · Counter {user?.facilityId} · Tenant {user?.tenantId}
        </ThemedText>
        <Button title="Sign out" variant="secondary" onPress={signOut} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  card: { gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  meta: { fontSize: 13, color: '#475569' },
});
