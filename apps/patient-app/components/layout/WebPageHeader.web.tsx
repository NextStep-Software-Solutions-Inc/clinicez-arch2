import { Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

interface WebPageHeaderProps {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

/** Top bar for pushed (non-tab) pages on web: back button, title and optional actions. */
export default function WebPageHeader({ title, onBack, right }: WebPageHeaderProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  return (
    <View
      accessibilityRole="header"
      style={[
        styles.root,
        {
          height: sizes.headerHeight,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={(s) => {
            const hovered = (s as { hovered?: boolean }).hovered;
            return [
              styles.back,
              {
                width: sizes.controlMd,
                height: sizes.controlMd,
                borderRadius: radii.md,
                marginRight: spacing.md,
                backgroundColor: hovered ? colors.surfaceSubtle : 'transparent',
              },
            ];
          }}
        >
          <AppIcon name="back" size={sizes.iconLg} color="text" />
        </Pressable>
      ) : null}
      <ThemedText variant="title" numberOfLines={1} style={styles.title}>
        {title ?? ''}
      </ThemedText>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  back: { alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
});
