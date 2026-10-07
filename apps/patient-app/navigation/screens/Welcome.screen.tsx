import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../contexts/ThemeContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import { AppIcon } from '@ui/Icon';

export default function WelcomeScreen() {
  const navigation = useNavigation<any>();
  const { colors, spacing } = useAppTheme();

  return (
    <View style={[styles.page, { backgroundColor: colors.background, paddingHorizontal: spacing.xl, paddingVertical: spacing['3xl'] }]}>
      <View style={[styles.hero, { gap: spacing.md }]}>
        <ThemedText variant="captionBold" color="primary" style={styles.brand}>
          Clinic EZ
        </ThemedText>
        <ThemedText variant="display">
          Healthcare made simple, personal, and mobile.
        </ThemedText>
        <ThemedText variant="body" color="textSecondary" style={styles.subtitle}>
          Complete your onboarding to access appointments, records, and secure care
          from your phone.
        </ThemedText>
      </View>

      <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.lg }]}>
        <View style={[styles.feature, { gap: spacing.xs }]}>
          <View style={[styles.featureHeader, { gap: spacing.xs }]}>
            <AppIcon name="activity" size={20} color="primary" />
            <ThemedText variant="bodyBold">Fast access</ThemedText>
          </View>
          <ThemedText variant="small" color="textSecondary">
            Start your care journey quickly with a clean, guided experience.
          </ThemedText>
        </View>

        <View style={[styles.feature, { gap: spacing.xs }]}>
          <View style={[styles.featureHeader, { gap: spacing.xs }]}>
            <AppIcon name="shield" size={20} color="primary" />
            <ThemedText variant="bodyBold">Secure records</ThemedText>
          </View>
          <ThemedText variant="small" color="textSecondary">
            Keep your health data protected and available when you need it.
          </ThemedText>
        </View>

        <View style={[styles.feature, { gap: spacing.xs }]}>
          <View style={[styles.featureHeader, { gap: spacing.xs }]}>
            <AppIcon name="heartPulse" size={20} color="primary" />
            <ThemedText variant="bodyBold">Patient first</ThemedText>
          </View>
          <ThemedText variant="small" color="textSecondary">
            Designed for clarity, calm, and confidence at every step.
          </ThemedText>
        </View>
      </Card>

      <Button
        label="Get started"
        variant="primary"
        size="lg"
        fullWidth
        onPress={() =>
          navigation.navigate('Onboarding', {
            screen: 'Onboard',
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'space-between',
  },
  hero: {
    marginTop: 16,
  },
  brand: {
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  subtitle: {
    maxWidth: 340,
  },
  card: {
    width: '100%',
  },
  feature: {},
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});