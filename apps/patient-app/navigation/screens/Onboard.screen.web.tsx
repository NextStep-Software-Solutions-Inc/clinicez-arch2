import React, { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useOnboarding } from '../../contexts/OnboardingContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import { AppIcon, type IconName } from '@ui/Icon';

interface Slide {
  title: string;
  tagline: string;
  subtitle: string;
  badge: string;
  icon: IconName;
  features: string[];
}

const slides: Slide[] = [
  {
    title: 'Secure & Private',
    tagline: 'Your health privacy, protected end-to-end.',
    subtitle:
      'All your medical history, vitals, and personal data are encrypted in transit and at rest. Only you and your authorized care team have access.',
    badge: 'BANK-GRADE SECURITY',
    icon: 'lock',
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
    icon: 'hospital',
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
    icon: 'sync',
    features: [
      'Instant access to emergency records offline',
      'Automatic bi-directional background sync',
      'Optimized performance on any network connection',
    ],
  },
];

export default function OnboardScreenWeb() {
  const navigation = useNavigation<any>();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const { complete } = useOnboarding();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentSlide = slides[activeIndex];
  const isLast = activeIndex === slides.length - 1;

  const handleComplete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await complete();
      navigation.navigate('Auth', { screen: 'Login' });
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
      <View
        style={[
          styles.container,
          isDesktop ? styles.desktopRow : styles.mobileCol,
          { maxWidth: sizes.contentMaxWidth },
        ]}
      >
        {/* Left / Hero Showcase Panel */}
        <View
          style={[
            styles.heroPanel,
            isDesktop ? styles.heroPanelDesktop : styles.heroPanelMobile,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.border,
              borderRightWidth: isDesktop ? 1 : 0,
              borderBottomWidth: isDesktop ? 0 : 1,
              padding: spacing['2xl'],
            },
          ]}
        >
          <View style={[styles.brandRow, { gap: spacing.md }]}>
            <View
              style={[
                styles.brandBadge,
                {
                  backgroundColor: colors.primary,
                  borderRadius: radii.sm,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                },
              ]}
            >
              <ThemedText variant="smallBold" color="onPrimary">
                CLINIC EZ
              </ThemedText>
            </View>
            <ThemedText variant="captionBold" color="textMuted" style={{ letterSpacing: 1.2 }}>
              PATIENT PORTAL
            </ThemedText>
          </View>

          <View style={[styles.heroCenter, { gap: spacing.md }]}>
            <View
              style={[
                styles.iconCircle,
                {
                  width: sizes.avatarLg * 1.5,
                  height: sizes.avatarLg * 1.5,
                  borderRadius: radii.full,
                  backgroundColor: colors.primaryLight,
                },
              ]}
            >
              <AppIcon name={currentSlide.icon} size={sizes.iconXl * 1.5} color="primaryText" />
            </View>
            <View
              style={[
                styles.featureBadge,
                {
                  backgroundColor: colors.primaryLight,
                  borderColor: colors.primaryBorder,
                  borderRadius: radii.sm,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xxs,
                },
              ]}
            >
              <ThemedText variant="captionBold" color="primaryText">
                {currentSlide.badge}
              </ThemedText>
            </View>
            <ThemedText variant="h1">{currentSlide.title}</ThemedText>
            <ThemedText variant="h3" color="primaryText">
              {currentSlide.tagline}
            </ThemedText>
            <ThemedText variant="body" color="textSecondary" style={{ maxWidth: 520, lineHeight: 22 }}>
              {currentSlide.subtitle}
            </ThemedText>
          </View>

          {/* Interactive Feature Selector Pills */}
          <View style={[styles.featurePillsRow, { gap: spacing.sm }]}>
            {slides.map((s, index) => {
              const isActive = index === activeIndex;
              return (
                <Pressable
                  key={s.title}
                  onPress={() => setActiveIndex(index)}
                  style={({ pressed }) => [
                    styles.featurePill,
                    {
                      backgroundColor: isActive ? colors.primary : colors.surface,
                      borderColor: isActive ? colors.primary : colors.border,
                      borderRadius: radii.full,
                      paddingVertical: spacing.xs,
                      paddingHorizontal: spacing.md,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <AppIcon
                    name={s.icon}
                    size={sizes.iconSm}
                    color={isActive ? 'onPrimary' : 'textSecondary'}
                  />
                  <ThemedText
                    variant="smallBold"
                    color={isActive ? 'onPrimary' : 'textSecondary'}
                  >
                    {s.title}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Right / Stepper & Action Panel */}
        <View style={[styles.actionPanel, { backgroundColor: colors.card }]}>
          <ScrollView
            contentContainerStyle={[
              styles.actionContent,
              { padding: spacing['2xl'], gap: spacing.xl },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Top Bar with Step Progress and Skip */}
            <View style={styles.stepperHeader}>
              <View style={[styles.stepInfo, { gap: spacing.xs }]}>
                <ThemedText variant="captionBold" color="textMuted">
                  STEP {activeIndex + 1} OF {slides.length}
                </ThemedText>
                <View style={[styles.progressBar, { gap: spacing.xs }]}>
                  {slides.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.progressSegment,
                        {
                          backgroundColor: i <= activeIndex ? colors.primary : colors.surfaceSubtle,
                          borderRadius: radii.full,
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
                <ThemedText variant="smallBold" color="primary">
                  Skip to Login
                </ThemedText>
              </Pressable>
            </View>

            {/* Main Information & Key Points */}
            <View style={[styles.infoSection, { gap: spacing.md }]}>
              <ThemedText variant="h2">
                {activeIndex === 0
                  ? 'Your Health, In Your Hands'
                  : activeIndex === 1
                    ? 'Seamless Clinic Collaboration'
                    : 'Uninterrupted Health Tracking'}
              </ThemedText>
              <ThemedText variant="body" color="textSecondary" style={{ lineHeight: 24 }}>
                Clinic EZ connects you directly to your healthcare providers with high reliability,
                clear communication, and instant digital medical records.
              </ThemedText>

              {/* Highlight Checklist */}
              <View style={[styles.checklist, { gap: spacing.md, marginTop: spacing.sm }]}>
                {currentSlide.features.map((feat) => (
                  <View key={feat} style={[styles.checkItem, { gap: spacing.md }]}>
                    <View
                      style={[
                        styles.checkIconBadge,
                        {
                          width: sizes.iconLg,
                          height: sizes.iconLg,
                          borderRadius: radii.full,
                          backgroundColor: colors.successBg,
                        },
                      ]}
                    >
                      <AppIcon name="check" size={sizes.iconSm} color="success" />
                    </View>
                    <ThemedText variant="bodyLarge" style={{ flex: 1 }}>
                      {feat}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>

            {/* Navigation & Action Buttons */}
            <View style={[styles.actionFooter, { gap: spacing.lg }]}>
              {/* Stepper Dots */}
              <View style={[styles.dotsRow, { gap: spacing.sm }]}>
                {slides.map((_, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setActiveIndex(i)}
                    style={[
                      styles.dot,
                      {
                        borderRadius: radii.full,
                        backgroundColor: i === activeIndex ? colors.primary : colors.border,
                        width: i === activeIndex ? 24 : 8,
                      },
                    ]}
                  />
                ))}
              </View>

              {/* Action Buttons */}
              <View style={[styles.buttonsRow, { gap: spacing.md }]}>
                {activeIndex > 0 && (
                  <Button
                    label="Back"
                    variant="outline"
                    size="lg"
                    onPress={handlePrev}
                  />
                )}

                <Button
                  label={
                    isSubmitting
                      ? 'Opening Portal...'
                      : isLast
                        ? 'Continue to Login →'
                        : 'Next →'
                  }
                  variant="primary"
                  size="lg"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                  onPress={handleNext}
                  style={{ flex: 1 }}
                />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
  },
  desktopRow: {
    flexDirection: 'row',
  },
  mobileCol: {
    flexDirection: 'column',
  },
  heroPanel: {
    justifyContent: 'space-between',
  },
  heroPanelDesktop: {
    width: '52%',
  },
  heroPanelMobile: {
    width: '100%',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandBadge: {},
  heroCenter: {
    alignItems: 'flex-start',
    marginVertical: 'auto',
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  featureBadge: {
    borderWidth: 1,
  },
  featurePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
  },
  actionPanel: {
    flex: 1,
  },
  actionContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  stepperHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepInfo: {},
  progressBar: {
    flexDirection: 'row',
    width: 140,
  },
  progressSegment: {
    flex: 1,
    height: 4,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  infoSection: {},
  checklist: {},
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkIconBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionFooter: {},
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    height: 8,
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
