# Design Tokens & UI/UX Component Reference

This reference document presents complete token tables, typography scales, light/dark mode pairings, mobile touch standards, accessibility criteria, and core component architecture patterns bounded by `@clinicez/design-tokens`.

---

## 1. Complete Semantic Token Reference (`semantic.ts`)

| Token Name | Light Mode Value | Dark Mode Value | UI/UX Usage & Intent |
|---|---|---|---|
| `primary` | `#0D6963` (Teal 600) | `#34C3A6` (Teal 400) | Primary CTA buttons, key active navigation, brand focal points |
| `primaryHover` | `#0A5651` (Teal 700) | `#6EDCC3` (Teal 300) | Hover/Active feedback on primary actions |
| `primaryLight` | `#D9FAF1` (Teal 100) | `#052E2B` (Teal 900) | Avatar background, light tint badges |
| `primarySubtle` | `#F0FDF9` (Teal 50) | `#031C1A` (Teal 950) | Table row hover, selected card background |
| `primaryBorder` | `#A8EEDC` (Teal 200) | `#0A5651` (Teal 700) | Primary card outline, avatar border |
| `primaryText` | `#0A5651` (Teal 700) | `#A8EEDC` (Teal 200) | Accent link text, high-emphasis teal label |
| `onPrimary` | `#FFFFFF` | `#0A1020` | High-contrast text on primary background |
| `emergency` | `#DC2626` (Red 600) | `#F87171` (Red 400) | STAT alerts, emergency triage badge, critical vitals |
| `emergencyBg` | `#FEE2E2` (Red 100) | `#450A0A` (Red 900) | STAT banner fill, emergency indicator pill |
| `emergencyText` | `#991B1B` (Red 800) | `#FECACA` (Red 200) | STAT text label (>=4.5:1 contrast) |
| `urgent` | `#EA580C` (Orange 600) | `#FB923C` (Orange 400) | Priority queue tag, pending medication alert |
| `urgentBg` | `#FFEDD5` (Orange 100) | `#431407` (Orange 900) | Urgent pill fill |
| `urgentText` | `#C2410C` (Orange 700) | `#FED7AA` (Orange 200) | Urgent text label (>=4.5:1 contrast) |
| `routine` | `#0D6963` (Teal 600) | `#34C3A6` (Teal 400) | Routine queue badge, normal care plan |
| `routineBg` | `#D9FAF1` (Teal 100) | `#052E2B` (Teal 900) | Routine badge fill |
| `routineText` | `#0A5651` (Teal 700) | `#A8EEDC` (Teal 200) | Routine text label (>=4.5:1 contrast) |
| `telemetryNormal` | `#0D6963` (Teal 600) | `#34C3A6` (Teal 400) | Optimal vital sign indicator (Heart Rate, BP) |
| `telemetryNormalBg` | `#D9FAF1` (Teal 100) | `#052E2B` (Teal 900) | Vitals card status badge background |
| `telemetryNormalText`| `#0A5651` (Teal 700) | `#A8EEDC` (Teal 200) | Vitals "Optimal" / "Normal" label |
| `telemetryElevated` | `#D97706` (Amber 600) | `#FBBF24` (Amber 400) | Pre-hypertensive, fasting glucose alert |
| `telemetryElevatedBg`| `#FEF3C7` (Amber 100) | `#451A03` (Amber 900) | Elevated vitals badge background |
| `telemetryElevatedText`| `#B45309` (Amber 700)| `#FDE68A` (Amber 200) | Elevated vitals text label |
| `chip` | `#F1F5F9` (Slate 100) | `#1E293B` (Slate 800) | Inactive filter chip background |
| `chipText` | `#334155` (Slate 700) | `#E2E8F0` (Slate 200) | Inactive filter chip text |
| `chipBorder` | `#E2E8F0` (Slate 200) | `#334155` (Slate 700) | Filter chip border |
| `chipActive` | `#0D6963` (Teal 600) | `#34C3A6` (Teal 400) | Selected filter chip background |
| `chipActiveText` | `#FFFFFF` (Slate 0) | `#0A1020` (Slate 950) | Selected filter chip text |
| `background` | `#F8FAFC` (Slate 50) | `#0A1020` (Slate 950) | Main app viewport background |
| `surface` | `#FFFFFF` (Slate 0) | `#0F172A` (Slate 900) | Cards, modals, drawers, dropdown menus |
| `surfaceMuted` | `#F8FAFC` (Slate 50) | `#1E293B` (Slate 800) | Secondary card background, table headers |
| `surfaceSubtle` | `#F1F5F9` (Slate 100) | `#1E293B` (Slate 800) | Icon button circles, subtle pill backgrounds |
| `border` | `#E2E8F0` (Slate 200) | `#1E293B` (Slate 800) | Input borders, card dividers |
| `borderLight` | `#F1F5F9` (Slate 100) | `#1E293B` (Slate 800) | Subtle inner dividers, top bar bottom border |
| `text` | `#0F172A` (Slate 900) | `#F8FAFC` (Slate 50) | Primary body text and headers |
| `textSecondary` | `#475569` (Slate 600) | `#CBD5E1` (Slate 300) | Subtitles, secondary descriptions |
| `textMuted` | `#64748B` (Slate 500) | `#94A3B8` (Slate 400) | Field labels, timestamp metadata |
| `textLight` | `#94A3B8` (Slate 400) | `#64748B` (Slate 500) | Placeholder text, disabled labels |

---

## 2. Scale & Touch Dimension Tokens (`scales.ts`)

```typescript
export const sizes = {
  /** Minimum hit area on touch devices (iOS HIG: 44pt). */
  touchTarget: 44,
  /** Android Material Design recommendation (48dp). */
  touchTargetAndroid: 48,
  /** Minimum spacing between adjacent touch targets to prevent mis-taps. */
  touchTargetGap: 8,
  controlSm: 32,
  controlMd: 40,
  controlLg: 48,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
  iconXl: 32,
  avatarSm: 32,
  avatarMd: 40,
  avatarLg: 64,
  headerHeight: 64,
  borderWidth: 1,

  // Layout & Micro-Interaction Metrics
  cardCarouselWidth: 300,
  cardCarouselGap: 12,
  headerScrollThreshold: 48, // 0 to 48px scroll range
  headerScrollOffsetTranslate: 6, // 6px translateY delta
};
```

---

## 3. Core Token-Bounded Component Architecture Patterns

### Pattern A: Digital Pass / Verified Credential Card
Bounded by: `colors.primaryDark`, `colors.primary`, `radii.xl`, `spacing.lg`, `colors.onPrimary`, `shadows.md`.

```tsx
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../contexts/ThemeContext';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';

export function VerifiedCredentialCard({
  title,
  identifier,
  subjectName,
  onPressAction,
  actionLabel,
}) {
  const { colors, spacing, radii, shadows } = useAppTheme();

  return (
    <View style={[styles.wrapper, shadows.md]}>
      <LinearGradient
        colors={[colors.primaryDark, colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { borderRadius: radii.xl, padding: spacing.lg }]}
      >
        <View style={styles.topRow}>
          <ThemedText variant="captionBold" color="onPrimary">{title}</ThemedText>
          <View style={styles.verifiedBadge}>
            <ThemedText variant="captionBold" color="onPrimary">VERIFIED</ThemedText>
          </View>
        </View>

        <ThemedText variant="h2" color="onPrimary" style={{ marginVertical: spacing.md }}>
          {subjectName}
        </ThemedText>

        <View style={styles.bottomRow}>
          <ThemedText variant="code" color="onPrimary">{identifier}</ThemedText>
          <Pressable onPress={onPressAction} style={styles.actionButton}>
            <ThemedText variant="captionBold" color="onPrimary">{actionLabel}</ThemedText>
            <AppIcon name="qr_code" size={16} color="onPrimary" />
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}
```

### Pattern B: Telemetry Bento Grid / Metric Tiles
Bounded by: `colors.surface`, `radii.lg`, `spacing.sm`, `colors.telemetryNormalText`, `colors.telemetryElevatedText`, `colors.border`.

```tsx
export function MetricTile({
  label,
  value,
  unit,
  statusLabel,
  isElevated = false,
}) {
  const { colors, spacing, radii } = useAppTheme();

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.lg,
          padding: spacing.md,
        },
      ]}
    >
      <ThemedText variant="caption" color="textMuted">{label}</ThemedText>
      <ThemedText variant="h2" color="text">
        {value != null ? `${value} ${unit ?? ''}`.trim() : '--'}
      </ThemedText>
      <ThemedText
        variant="caption"
        color={isElevated ? 'telemetryElevatedText' : 'telemetryNormalText'}
      >
        {statusLabel ?? 'Normal'}
      </ThemedText>
    </View>
  );
}
```

### Pattern C: Interactive Filter Chips Bar
Bounded by: `colors.chip`, `colors.chipText`, `colors.chipBorder`, `colors.chipActive`, `colors.chipActiveText`, `radii.full`, `sizes.touchTarget`.

```tsx
export function FilterChipBar<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { id: T; label: string }[];
  selected: T;
  onSelect: (val: T) => void;
}) {
  const { colors, spacing, radii, sizes } = useAppTheme();

  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const isActive = opt.id === selected;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onSelect(opt.id)}
            style={[
              styles.chip,
              {
                backgroundColor: isActive ? colors.chipActive : colors.chip,
                borderColor: isActive ? colors.chipActive : colors.chipBorder,
                borderRadius: radii.full,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                minHeight: sizes.touchTarget,
              },
            ]}
          >
            <ThemedText
              variant="captionBold"
              color={isActive ? 'onPrimary' : 'textSecondary'}
            >
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}
```

---

## 4. Mobile Ergonomics & Quality Standards (Checklist)

1. **Touch Targets**: All interactive elements satisfy `>= 44×44pt` (`sizes.touchTarget`) with `>= 8px` spacing.
2. **Thumb Zone Compliance**: Primary CTAs placed within natural thumb reach.
3. **60fps Animations**: Only GPU-accelerated `transform` and `opacity` properties animated.
4. **4-State Completion**: Explicit Skeleton, Empty, Error, and Active states verified.
5. **Zero Mock Fallbacks**: Live APIs only; neutral placeholders when data is absent.
6. **WCAG 4.5:1**: Contrast verified across light and dark modes via `bun test packages/design-tokens/src/tokens.test.ts`.
