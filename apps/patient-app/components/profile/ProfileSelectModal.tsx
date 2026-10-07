import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Animated,
  FlatList,
} from 'react-native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

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
  const { colors, radii, sizes } = useAppTheme();
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
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.xl,
              transform: [{ scale }],
              opacity,
            },
          ]}
        >
          <ThemedText variant="bodyBold" style={[styles.title, { color: colors.text }]}>
            {title}
          </ThemedText>
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <FlatList
            data={options}
            keyExtractor={(item) => item.value}
            style={styles.list}
            renderItem={({ item }) => {
              const isSelected = item.value === selected;
              return (
                <Pressable
                  onPress={() => handleSelect(item.value)}
                  style={({ pressed, hovered }: any) => [
                    styles.option,
                    { borderBottomColor: colors.borderLight },
                    hovered && { backgroundColor: colors.surfaceSubtle },
                    pressed && { opacity: 0.6 },
                    isSelected && { backgroundColor: colors.primarySubtle },
                  ]}
                >
                  <ThemedText
                    variant={isSelected ? 'bodyBold' : 'body'}
                    style={{ color: isSelected ? colors.primary : colors.text }}
                  >
                    {item.label}
                  </ThemedText>
                  {isSelected && (
                    <AppIcon name="check" size={sizes.iconSm} color="primary" />
                  )}
                </Pressable>
              );
            }}
          />
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <Pressable
            onPress={onClose}
            style={({ pressed, hovered }: any) => [
              styles.cancelBtn,
              hovered && { backgroundColor: colors.surfaceSubtle },
              pressed && { opacity: 0.6 },
            ]}
          >
            <ThemedText variant="body" style={{ color: colors.text }}>
              Cancel
            </ThemedText>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxHeight: 480,
  },
  title: {
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
  cancelBtn: {
    paddingVertical: 15,
    alignItems: 'center',
  },
});
