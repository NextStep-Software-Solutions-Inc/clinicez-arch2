import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import { AppIcon, type IconName } from '@ui/Icon';
import ClinicEzLogo from '@ui/ClinicEzLogo';

interface FeatureCardProps {
  icon: IconName;
  badge?: string;
  title: string;
  description: string;
}

function FeatureCard({ icon, badge, title, description }: FeatureCardProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();

  return (
    <Card padding="lg" elevation="sm" style={[styles.featureCard, { flex: 1, gap: spacing.md }]}>
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.cardIconBox,
            {
              width: sizes.controlLg,
              height: sizes.controlLg,
              borderRadius: radii.md,
              backgroundColor: colors.primaryLight,
            },
          ]}
        >
          <AppIcon name={icon} size={sizes.iconMd} color="primaryText" />
        </View>
        {badge ? <Badge label={badge} tone="neutral" size="sm" /> : null}
      </View>
      <ThemedText variant="h3">{title}</ThemedText>
      <ThemedText variant="small" color="textSecondary" style={{ lineHeight: 22 }}>
        {description}
      </ThemedText>
    </Card>
  );
}

export default function WelcomeScreenWeb() {
  const navigation = useNavigation<any>();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { isDesktop } = useBreakpoint();

  const handleGetStarted = () => {
    navigation.navigate('Onboarding', { screen: 'Onboard' });
  };

  const handleDirectLogin = () => {
    navigation.navigate('Auth', { screen: 'Login' });
  };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing['2xl'],
          maxWidth: sizes.contentMaxWidth,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Top Header Bar */}
      <View style={[styles.header, { marginBottom: spacing['3xl'] }]}>
        <ClinicEzLogo size={36} subtitle="Patient Portal" />

        <Pressable
          onPress={handleDirectLogin}
          style={({ pressed }) => [styles.signInLink, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <ThemedText variant="bodyBold" color="primary">
            Sign In →
          </ThemedText>
        </Pressable>
      </View>

      {/* Hero Section */}
      <View style={[styles.heroSection, { maxWidth: sizes.formMaxWidth, gap: spacing.lg, marginBottom: spacing['4xl'] }]}>
        <View
          style={[
            styles.pillBanner,
            {
              backgroundColor: colors.primaryLight,
              borderColor: colors.primaryBorder,
              borderRadius: radii.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
            },
          ]}
        >
          <ThemedText variant="captionBold" color="primaryText" style={styles.pillText}>
            MODERN PATIENT CARE
          </ThemedText>
        </View>

        <ThemedText variant="display" style={{ textAlign: 'center' }}>
          Healthcare made simple, personal, and connected.
        </ThemedText>

        <ThemedText variant="bodyLarge" color="textSecondary" style={{ textAlign: 'center', maxWidth: 640 }}>
          Access your clinical records, connect with accredited care clinics, track prescriptions,
          and securely manage your health from any browser.
        </ThemedText>

        {/* CTA Buttons */}
        <View
          style={[
            styles.ctaRow,
            isDesktop ? styles.ctaRowDesktop : styles.ctaRowMobile,
            { gap: spacing.md, marginTop: spacing.sm },
          ]}
        >
          <Button
            label="Get Started Now"
            variant="primary"
            size="lg"
            onPress={handleGetStarted}
            style={isDesktop ? { minWidth: 200 } : { width: '100%' }}
          />

          <Button
            label="Already have an account? Sign In"
            variant="outline"
            size="lg"
            onPress={handleDirectLogin}
            style={isDesktop ? { minWidth: 200 } : { width: '100%' }}
          />
        </View>
      </View>

      {/* Feature Grid */}
      <View
        style={[
          styles.featuresGrid,
          isDesktop ? styles.featuresGridDesktop : styles.featuresGridMobile,
          { gap: spacing.lg, marginBottom: spacing['3xl'] },
        ]}
      >
        <FeatureCard
          icon="activity"
          badge="FAST"
          title="Instant Clinic Access"
          description="Schedule appointments with accredited doctors and clinics without waiting on hold."
        />
        <FeatureCard
          icon="shield"
          badge="SECURE"
          title="Encrypted Health Records"
          description="View prescriptions, lab results, and consultations protected by bank-grade encryption."
        />
        <FeatureCard
          icon="sync"
          badge="CONNECTED"
          title="Works Everywhere"
          description="Access critical medical details across all your devices with seamless real-time synchronization."
        />
      </View>

      {/* Footer Info */}
      <View style={[styles.footer, { borderTopColor: colors.border, paddingTop: spacing.xl }]}>
        <ThemedText variant="small" color="textMuted">
          Clinic EZ Healthcare Network • Secure Patient Data Architecture
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    marginHorizontal: 'auto',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {},
  logoText: {
    letterSpacing: 1.2,
  },
  signInLink: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  heroSection: {
    alignItems: 'center',
    marginHorizontal: 'auto',
  },
  pillBanner: {
    borderWidth: 1,
  },
  pillText: {
    letterSpacing: 1,
  },
  ctaRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaRowDesktop: {
    flexDirection: 'row',
  },
  ctaRowMobile: {
    flexDirection: 'column',
  },
  featuresGrid: {
    width: '100%',
  },
  featuresGridDesktop: {
    flexDirection: 'row',
  },
  featuresGridMobile: {
    flexDirection: 'column',
  },
  featureCard: {},
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardIconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    borderTopWidth: 1,
    alignItems: 'center',
  },
});
