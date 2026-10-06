import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Animated,
  FlatList,
  Platform,
  useColorScheme,
} from 'react-native';
import { useRef, useEffect } from 'react';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';

export interface SelectOption {
  label: string;
  value: string;
}

interface ProfileSelectModalProps {
  visible: boolean;
  title: string;
  options: SelectOption[];
  selected: string | undefined | null;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export default function ProfileSelectModal({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: ProfileSelectModalProps) {
  const { colors, dark } = useTheme();
  const systemScheme = useColorScheme();
  const isDark = dark || systemScheme === 'dark';
  const scale = new Animated.Value(0.88);
  const opacity = new Animated.Value(0);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.timing(opacity, { toValue: 0, duration: 130, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleSelect = (value: string) => {
    onSelect(value);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale }], opacity },
          ]}
        >
          <ThemedText style={[styles.title, { color: colors.text }]}>{title}</ThemedText>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <FlatList
            data={options}
            keyExtractor={(item) => item.value}
            style={styles.list}
            renderItem={({ item }) => {
              const isSelected = item.value === selected;
              return (
                <Pressable
                  onPress={() => handleSelect(item.value)}
                  style={({ pressed }) => [
                    styles.option,
                    { borderBottomColor: colors.border },
                    pressed && { opacity: 0.6 },
                    isSelected && { backgroundColor: colors.primary },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.optionText,
                      { color: isSelected ? colors.card : colors.text },
                      isSelected && styles.optionTextSelected,
                    ]}
                  >
                    {item.label}
                  </ThemedText>
                  {isSelected && (
                    <AppIcon android="check" ios="checkmark" size={16} color={colors.card} />
                  )}
                </Pressable>
              );
            }}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.6 }]}
          >
            <ThemedText style={[styles.cancelText, { color: colors.text }]}>Cancel</ThemedText>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxHeight: 480,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  list: {
    maxHeight: 340,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 15,
  },
  optionTextSelected: {
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
