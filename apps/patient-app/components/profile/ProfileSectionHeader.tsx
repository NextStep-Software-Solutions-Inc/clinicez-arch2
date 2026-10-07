import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';

interface ProfileSectionHeaderProps {
  title: string;
  description?: string;
}

export default function ProfileSectionHeader({ title, description }: ProfileSectionHeaderProps) {
  const { colors, spacing } = useAppTheme();

  return (
    <View style={[styles.container, { marginTop: spacing.sm, marginBottom: spacing.md }]}>
      <ThemedText variant="h3" style={{ color: colors.text }}>
        {title}
      </ThemedText>
      {description && (
        <ThemedText variant="small" color="textSecondary" style={styles.description}>
          {description}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  description: {
    marginTop: 3,
    lineHeight: 18,
  },
});
