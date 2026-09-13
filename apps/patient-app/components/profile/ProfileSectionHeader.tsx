import { View, StyleSheet } from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';

interface ProfileSectionHeaderProps {
  title: string;
  description?: string;
}

export default function ProfileSectionHeader({ title, description }: ProfileSectionHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <ThemedText style={[styles.title, { color: colors.text }]}>{title}</ThemedText>
      {description && (
        <ThemedText style={[styles.description, { color: colors.text }]}>{description}</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '700' },
  description: { fontSize: 13, marginTop: 3, lineHeight: 18, opacity: 0.6 },
});
