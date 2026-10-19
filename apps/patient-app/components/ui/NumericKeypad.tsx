import React, { useEffect } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import ThemedText from './ThemedText';
import { AppIcon } from './Icon';

interface NumericKeypadProps {
  onPress: (digit: string) => void;
  onDelete: () => void;
  onEnter?: () => void;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
] as const;

export default function NumericKeypad({ onPress, onDelete, onEnter }: NumericKeypadProps) {
  const { colors, radii, shadows, sizes } = useAppTheme();

  // Web hardware keyboard support
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        onPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onDelete();
      } else if (e.key === 'Enter' && onEnter) {
        e.preventDefault();
        onEnter();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPress, onDelete, onEnter]);

  return (
    <View style={styles.container}>
      {ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key, keyIndex) => {
            if (key === '') {
              return <View key={keyIndex} style={styles.key} />;
            }
            const isDelete = key === 'del';
            return (
              <Pressable
                key={keyIndex}
                style={({ pressed, hovered }: any) => [
                  styles.key,
                  shadows.sm,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.borderLight,
                    borderRadius: radii.full,
                  },
                  pressed && styles.keyPressed,
                  hovered && { backgroundColor: colors.surfaceSubtle },
                ]}
                onPress={() => (isDelete ? onDelete() : onPress(key))}
                accessibilityRole="button"
                accessibilityLabel={isDelete ? 'Delete' : key}
              >
                {isDelete ? (
                  <AppIcon name="back" size={sizes.iconLg} color="text" />
                ) : (
                  <ThemedText variant="title" style={styles.keyText}>
                    {key}
                  </ThemedText>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  key: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  keyPressed: {
    opacity: 0.6,
  },
  keyText: {
    fontWeight: '400',
  },
});
