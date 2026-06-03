import { View, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@react-navigation/native';

interface NumericKeypadProps {
  onPress: (digit: string) => void;
  onDelete: () => void;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
] as const;

export default function NumericKeypad({ onPress, onDelete }: NumericKeypadProps) {
  const { colors } = useTheme();

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
                style={({ pressed }) => [
                  styles.key,
                  styles.keyButton,
                  { backgroundColor: colors.card },
                  pressed && styles.keyPressed,
                ]}
                onPress={() => (isDelete ? onDelete() : onPress(key))}
                accessibilityLabel={isDelete ? 'Delete' : key}
              >
                <Text style={[styles.keyText, { color: colors.text }]}>
                  {isDelete ? '⌫' : key}
                </Text>
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
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyButton: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  keyPressed: {
    opacity: 0.6,
  },
  keyText: {
    fontSize: 24,
    fontWeight: '400',
  },
});
