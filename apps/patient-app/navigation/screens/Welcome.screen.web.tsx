import React from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions, ScrollView } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import { useOnboarding } from 'contexts/OnboardingContext';

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  badge?: string;
}

function FeatureCard({ icon, title, description, badge }: FeatureCardProps) {
  const { colors, dark: isDark } = useTheme();

  return (
    <View
      style={[
        styles.featureCard,
        {
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardIconBox}>
          <ThemedText style={styles.cardIcon}>{icon}</ThemedText>
        </View>
        {badge && (
          <View style={styles.cardBadge}>
            <ThemedText style={styles.cardBadgeText}>{badge}</ThemedText>
          </View>
        )}
      </View>
      <ThemedText style={[styles.cardTitle, { color: colors.text }]}>{title}</ThemedText>
      <ThemedText style={[styles.cardDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
        {description}
      </ThemedText>
    </View>
  );
}

export default function WelcomeScreenWeb() {
  const navigation = useNavigation<any>();
  const { colors, dark: isDark } = useTheme();
  const { width } = useWindowDimensions();
  const { complete } = useOnboarding();

  const isDesktop = width >= 860;

  const handleGetStarted = () => {
    navigation.navigate('Onboarding', {
      screen: 'Onboard',
    });
  };

  const handleDirectLogin = async () => {
    // If the user already wants to log in directly from the welcome landing page,
    // mark onboarding as complete so the auth stack opens cleanly
    await complete();
  };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <ThemedText style={styles.logoText}>CLINIC EZ</ThemedText>
          </View>
          <ThemedText style={[styles.tagline, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            Patient Portal
          </ThemedText>
        </View>

        <Pressable
          onPress={handleDirectLogin}
          style={({ pressed }) => [styles.signInLink, pressed && { opacity: 0.7 }]}
        >
          <ThemedText style={styles.signInLinkText}>Sign In →</ThemedText>
        </Pressable>
      </View>

      {/* Hero Section */}
      <View style={styles.heroSection}>
        <View style={styles.pillBanner}>
          <ThemedText style={styles.pillText}>✨ MODERN PATIENT CARE</ThemedText>
        </View>

        <ThemedText style={[styles.heroTitle, { color: colors.text }]}>
          Healthcare made simple, personal, and connected.
        </ThemedText>

        <ThemedText style={[styles.heroSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
          Access your clinical records, connect with accredited care clinics, track prescriptions,
          and securely manage your health from any browser.
        </ThemedText>

        {/* CTA Buttons */}
        <View style={[styles.ctaRow, isDesktop ? styles.ctaRowDesktop : styles.ctaRowMobile]}>
          <Pressable
            onPress={handleGetStarted}
            style={({ pressed }) => [styles.primaryCta, pressed && styles.ctaPressed]}
          >
            <ThemedText style={styles.primaryCtaText}>Get Started Now</ThemedText>
          </Pressable>

          <Pressable
            onPress={handleDirectLogin}
            style={({ pressed }) => [
              styles.secondaryCta,
              { borderColor: isDark ? '#334155' : '#CBD5E1' },
              pressed && styles.ctaPressed,
            ]}
          >
            <ThemedText style={[styles.secondaryCtaText, { color: colors.text }]}>
              Already have an account? Sign In
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Feature Grid */}
      <View style={[styles.featuresGrid, isDesktop ? styles.featuresGridDesktop : styles.featuresGridMobile]}>
        <FeatureCard
          icon="⚡"
          badge="FAST"
          title="Instant Clinic Access"
          description="Schedule appointments with accredited doctors and clinics without waiting on hold."
        />
        <FeatureCard
          icon="🔒"
          badge="SECURE"
          title="Encrypted Health Records"
          description="View prescriptions, lab results, and consultations protected by bank-grade encryption."
        />
        <FeatureCard
          icon="📡"
          badge="OFFLINE FIRST"
          title="Works Everywhere"
          description="Access critical medical details even with weak connectivity, with automatic sync."
        />
      </View>

      {/* Footer Info */}
      <View style={[styles.footer, { borderTopColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
        <ThemedText style={[styles.footerText, { color: isDark ? '#64748B' : '#94A3B8' }]}>
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
    paddingHorizontal: 24,
    paddingVertical: 32,
    maxWidth: 1140,
    width: '100%',
    marginHorizontal: 'auto',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 48,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1.2,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '600',
  },
  signInLink: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  signInLinkText: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 14,
  },
  heroSection: {
    alignItems: 'center',
    textAlign: 'center',
    maxWidth: 780,
    marginHorizontal: 'auto',
    marginBottom: 56,
    gap: 18,
  },
  pillBanner: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pillText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 44,
    fontWeight: '800',
    lineHeight: 52,
    textAlign: 'center',
    letterSpacing: -1,
  },
  heroSubtitle: {
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
    maxWidth: 640,
  },
  ctaRow: {
    marginTop: 12,
    gap: 14,
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
  primaryCta: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
    minWidth: 180,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryCta: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 180,
  },
  secondaryCtaText: {
    fontSize: 15,
    fontWeight: '600',
  },
  ctaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  featuresGrid: {
    width: '100%',
    gap: 20,
    marginBottom: 48,
  },
  featuresGridDesktop: {
    flexDirection: 'row',
  },
  featuresGridMobile: {
    flexDirection: 'column',
  },
  featureCard: {
    flex: 1,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    fontSize: 22,
  },
  cardBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cardBadgeText: {
    color: '#3B82F6',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardDesc: {
    fontSize: 14,
    lineHeight: 22,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
  },
});
