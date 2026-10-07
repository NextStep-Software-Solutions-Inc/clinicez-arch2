import React, { useRef, useState, useCallback } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import { AppIcon, type IconName } from '@ui/Icon';

type Slide = {
  title: string;
  tagline: string;
  subtitle: string;
  icon: IconName;
};

const slides: Slide[] = [
  {
    title: 'Secure',
    tagline: 'Your privacy, protected end-to-end.',
    subtitle:
      'All your health data is encrypted in transit and at rest. Only you and your care team have access.',
    icon: 'lock',
  },
  {
    title: 'Multi-Clinic',
    tagline: 'One app. Every clinic you trust.',
    subtitle:
      'Seamlessly switch between clinics, manage separate records, and stay connected to every care provider.',
    icon: 'hospital',
  },
  {
    title: 'Offline Ready',
    tagline: 'Works anywhere. Even without signal.',
    subtitle:
      'Your records and appointments are always available, with smart sync when your connection returns.',
    icon: 'sync',
  },
];

export default function OnboardScreen() {
  const { width, height } = useWindowDimensions();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { complete } = useOnboarding();
  const scrollRef = useRef<ScrollView | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleComplete = useCallback(async () => {
    await complete();
  }, [complete]);

  const handleNext = () => {
    if (activeIndex < slides.length - 1) {
      scrollRef.current?.scrollTo({ x: width * (activeIndex + 1), animated: true });
    } else {
      handleComplete();
    }
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor={colors.transparent} />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ width: width * slides.length }}
      >
        {slides.map((slide) => (
          <LinearGradient
            key={slide.title}
            colors={[colors.primaryDark, colors.background]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={[styles.slide, { width, height }]}
          >
            <View
              style={[
                styles.content,
                {
                  paddingHorizontal: spacing.xl,
                  paddingTop: spacing['5xl'],
                  paddingBottom: spacing['5xl'] * 3,
                },
              ]}
            >
              <ThemedText variant="captionBold" color="primaryText" style={styles.brand}>
                CLINIC EZ
              </ThemedText>

              <View style={styles.iconArea}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      width: sizes.avatarLg * 1.8,
                      height: sizes.avatarLg * 1.8,
                      borderRadius: radii.full,
                      backgroundColor: colors.primaryLight,
                    },
                  ]}
                >
                  <AppIcon name={slide.icon} size={sizes.iconXl * 1.8} color="primaryText" />
                </View>
              </View>

              <View style={[styles.copy, { gap: spacing.md }]}>
                <ThemedText variant="display" color="text">
                  {slide.title}
                </ThemedText>
                <ThemedText variant="h3" color="textSecondary">
                  {slide.tagline}
                </ThemedText>
                <ThemedText variant="body" color="textMuted">
                  {slide.subtitle}
                </ThemedText>
              </View>
            </View>
          </LinearGradient>
        ))}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing['3xl'],
            paddingTop: spacing.lg,
          },
        ]}
      >
        <View style={[styles.pager, { gap: spacing.sm, marginBottom: spacing.lg }]}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  borderRadius: radii.full,
                  backgroundColor: index === activeIndex ? colors.primary : colors.border,
                  width: index === activeIndex ? 28 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Button
          label={activeIndex === slides.length - 1 ? 'Continue to Login' : 'Next'}
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleNext}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  slide: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  brand: {
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  iconArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {},
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    height: 8,
  },
});
