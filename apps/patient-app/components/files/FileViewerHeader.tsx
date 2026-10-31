import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

interface FileViewerHeaderProps {
  title: string;
  subtitle?: string;
  categoryLabel?: string | null;
  onBack: () => void;
  onShare?: () => void;
}

export default function FileViewerHeader({
  title,
  subtitle,
  categoryLabel,
  onBack,
  onShare,
}: FileViewerHeaderProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="header"
      style={[
        styles.header,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.borderLight,
          paddingTop: Math.max(insets.top, spacing.xs),
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      <View style={[styles.inner, { height: sizes.headerHeight }]}>
        <Pressable
          onPress={onBack}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
        >
          <AppIcon name="back" size={sizes.iconLg - 2} color="text" />
        </Pressable>

        <View style={styles.titleColumn}>
          <View style={styles.titleRow}>
            <ThemedText variant="bodyBold" numberOfLines={1} style={styles.titleText}>
              {title}
            </ThemedText>
            {categoryLabel ? (
              <View
                style={[
                  styles.categoryBadge,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderRadius: radii.sm,
                    borderColor: colors.borderLight,
                  },
                ]}
              >
                <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
                  {categoryLabel}
                </ThemedText>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>

        {onShare ? (
          <Pressable
            onPress={onShare}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Share file"
            style={({ pressed }) => [
              styles.iconBtn,
              styles.shareBtn,
              { backgroundColor: colors.surfaceSubtle, borderRadius: radii.full },
              pressed && styles.btnPressed,
            ]}
          >
            <AppIcon name="share" size={sizes.iconMd} color="primary" />
          </Pressable>
        ) : (
          <View style={styles.iconBtnPlaceholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtn: {
    width: 36,
    height: 36,
  },
  btnPressed: {
    opacity: 0.6,
  },
  iconBtnPlaceholder: {
    width: 44,
  },
  titleColumn: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleText: {
    flexShrink: 1,
  },
  categoryBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexShrink: 0,
  },
});
