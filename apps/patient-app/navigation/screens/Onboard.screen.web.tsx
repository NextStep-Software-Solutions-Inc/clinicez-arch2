import React, { useState } from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import { useOnboarding } from 'contexts/OnboardingContext';

interface Slide {
  title: string;
  tagline: string;
  subtitle: string;
  badge: string;
  icon: string;
  gradient: readonly [string, string, ...string[]];
  features: string[];
}

const slides: Slide[] = [
  {
    title: 'Secure & Private',
    tagline: 'Your health privacy, protected end-to-end.',
    subtitle:
      'All your medical history, vitals, and personal data are encrypted in transit and at rest. Only you and your authorized care team have access.',
    badge: 'BANK-GRADE SECURITY',
    icon: '🔒',
    gradient: ['#0f172a', '#1e1b4b', '#311042'],
    features: [
      'End-to-end encrypted medical records',
      'Granular consent & sharing controls',
      'Compliant with healthcare privacy standards',
    ],
  },
  {
    title: 'Multi-Clinic Access',
    tagline: 'One portal. Every clinic and doctor you trust.',
    subtitle:
      'Seamlessly view records from multiple care providers, switch clinics instantly, and coordinate your care in one unified dashboard.',
    badge: 'CONNECTED CARE',
    icon: '🏥',
    gradient: ['#042f2e', '#064e3b', '#065f46'],
    features: [
      'Single sign-in across all participating clinics',
      'Centralized prescription & appointment history',
      'Direct messaging and updates from your doctors',
    ],
  },
  {
    title: 'Offline Resilience',
    tagline: 'Works anywhere. Even without an active signal.',
    subtitle:
      'Your critical medical information, allergies, and upcoming appointments are always available offline, synchronizing automatically when reconnected.',
    badge: 'OFFLINE FIRST',
    icon: '📡',
    gradient: ['#1e1b4b', '#4c1d95', '#581c87'],
    features: [
      'Instant access to emergency records offline',
      'Automatic bi-directional background sync',
      'Optimized performance on any network connection',
    ],
  },
];

export default function OnboardScreenWeb() {
  const { width } = useWindowDimensions();
  const { colors, dark: isDark } = useTheme();
  const { complete } = useOnboarding();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDesktop = width >= 860;
  const currentSlide = slides[activeIndex];
  const isLast = activeIndex === slides.length - 1;

  const handleComplete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await complete();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (!isLast) {
      setActiveIndex((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (activeIndex > 0) {
      setActiveIndex((prev) => prev - 1);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.container, isDesktop ? styles.desktopRow : styles.mobileCol]}>
        {/* Left / Hero Showcase Panel */}
        <LinearGradient
          colors={currentSlide.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroPanel, isDesktop ? styles.heroPanelDesktop : styles.heroPanelMobile]}
        >
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <ThemedText style={styles.brandText}>CLINIC EZ</ThemedText>
            </View>
            <ThemedText style={styles.portalTag}>PATIENT PORTAL</ThemedText>
          </View>

          <View style={styles.heroCenter}>
            <View style={styles.iconCircle}>
              <ThemedText style={styles.heroIcon}>{currentSlide.icon}</ThemedText>
            </View>
            <View style={styles.featureBadge}>
              <ThemedText style={styles.featureBadgeText}>{currentSlide.badge}</ThemedText>
            </View>
            <ThemedText style={styles.heroTitle}>{currentSlide.title}</ThemedText>
            <ThemedText style={styles.heroTagline}>{currentSlide.tagline}</ThemedText>
            <ThemedText style={styles.heroSubtitle}>{currentSlide.subtitle}</ThemedText>
          </View>

          {/* Interactive Feature Selector Pills */}
          <View style={styles.featurePillsRow}>
            {slides.map((s, index) => {
              const isActive = index === activeIndex;
              return (
                <Pressable
                  key={s.title}
                  onPress={() => setActiveIndex(index)}
                  style={({ pressed }) => [
                    styles.featurePill,
                    isActive && styles.featurePillActive,
                    pressed && styles.pillPressed,
                  ]}
                >
                  <ThemedText style={styles.pillIcon}>{s.icon}</ThemedText>
                  <ThemedText style={[styles.pillLabel, isActive && styles.pillLabelActive]}>
                    {s.title}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </LinearGradient>

        {/* Right / Stepper & Action Panel */}
        <View style={[styles.actionPanel, { backgroundColor: isDark ? '#111827' : '#FFFFFF' }]}>
          <ScrollView
            contentContainerStyle={styles.actionContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Top Bar with Step Progress and Skip */}
            <View style={styles.stepperHeader}>
              <View style={styles.stepInfo}>
                <ThemedText style={[styles.stepLabel, { color: colors.text }]}>
                  Step {activeIndex + 1} of {slides.length}
                </ThemedText>
                <View style={styles.progressBar}>
                  {slides.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.progressSegment,
                        {
                          backgroundColor:
                            i <= activeIndex
                              ? '#3B82F6'
                              : isDark
                                ? 'rgba(255,255,255,0.15)'
                                : '#E5E7EB',
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>

              <Pressable
                onPress={handleComplete}
                disabled={isSubmitting}
                style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.7 }]}
              >
                <ThemedText style={styles.skipButtonText}>Skip to Login</ThemedText>
              </Pressable>
            </View>

            {/* Main Information & Key Points */}
            <View style={styles.infoSection}>
              <ThemedText style={[styles.infoHeading, { color: colors.text }]}>
                {activeIndex === 0
                  ? 'Your Health, In Your Hands'
                  : activeIndex === 1
                    ? 'Seamless Clinic Collaboration'
                    : 'Uninterrupted Health Tracking'}
              </ThemedText>
              <ThemedText
                style={[
                  styles.infoDescription,
                  { color: isDark ? '#9CA3AF' : '#6B7280' },
                ]}
              >
                Clinic EZ connects you directly to your healthcare providers with high reliability,
                clear communication, and instant digital medical records.
              </ThemedText>

              {/* Highlight Checklist */}
              <View style={styles.checklist}>
                {currentSlide.features.map((feat) => (
                  <View key={feat} style={styles.checkItem}>
                    <View style={styles.checkIconBadge}>
                      <ThemedText style={styles.checkIconText}>✓</ThemedText>
                    </View>
                    <ThemedText style={[styles.checkText, { color: colors.text }]}>
                      {feat}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>

            {/* Navigation & Action Buttons */}
            <View style={styles.actionFooter}>
              {/* Stepper Dots */}
              <View style={styles.dotsRow}>
                {slides.map((_, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setActiveIndex(i)}
                    style={[
                      styles.dot,
                      i === activeIndex
                        ? [styles.dotActive, { backgroundColor: '#3B82F6' }]
                        : { backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : '#D1D5DB' },
                    ]}
                  />
                ))}
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonsRow}>
                {activeIndex > 0 && (
                  <Pressable
                    onPress={handlePrev}
                    style={({ pressed }) => [
                      styles.backButton,
                      { borderColor: colors.border },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <ThemedText style={[styles.backButtonText, { color: colors.text }]}>
                      Back
                    </ThemedText>
                  </Pressable>
                )}

                <Pressable
                  onPress={handleNext}
                  disabled={isSubmitting}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    isSubmitting && { opacity: 0.6 },
                  ]}
                >
                  <ThemedText style={styles.primaryButtonText}>
                    {isSubmitting
                      ? 'Opening Portal...'
                      : isLast
                        ? 'Continue to Login →'
                        : 'Next →'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  desktopRow: {
    flexDirection: 'row',
  },
  mobileCol: {
    flexDirection: 'column',
  },
  heroPanel: {
    padding: 36,
    justifyContent: 'space-between',
  },
  heroPanelDesktop: {
    width: '52%',
    height: '100%',
  },
  heroPanelMobile: {
    width: '100%',
    minHeight: 380,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  brandText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1.5,
  },
  portalTag: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  heroCenter: {
    marginVertical: 'auto',
    alignItems: 'flex-start',
    gap: 14,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroIcon: {
    fontSize: 38,
  },
  featureBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.5)',
  },
  featureBadgeText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroTagline: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.92)',
    lineHeight: 26,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.72)',
    lineHeight: 22,
    maxWidth: 520,
  },
  featurePillsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  featurePillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  pillPressed: {
    opacity: 0.8,
  },
  pillIcon: {
    fontSize: 14,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  pillLabelActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  actionPanel: {
    flex: 1,
  },
  actionContent: {
    flexGrow: 1,
    padding: 40,
    justifyContent: 'space-between',
  },
  stepperHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepInfo: {
    gap: 8,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  progressBar: {
    flexDirection: 'row',
    gap: 6,
    width: 140,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipButtonText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '600',
  },
  infoSection: {
    marginVertical: 32,
    gap: 16,
  },
  infoHeading: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  infoDescription: {
    fontSize: 15,
    lineHeight: 24,
  },
  checklist: {
    marginTop: 12,
    gap: 14,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIconText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '800',
  },
  checkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionFooter: {
    gap: 24,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  backButton: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
