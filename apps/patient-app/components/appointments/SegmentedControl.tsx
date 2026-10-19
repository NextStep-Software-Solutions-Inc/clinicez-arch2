import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';

interface SegmentedControlProps {
  options: [string, string];
  selectedIndex: 0 | 1;
  onChange: (index: 0 | 1) => void;
}

export default function SegmentedControl({ options, selectedIndex, onChange }: SegmentedControlProps) {
  const { colors, radii } = useAppTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (containerWidth === 0) return;
    // Each pill is exactly half the inner container (minus 2px padding on each side)
    const pillWidth = (containerWidth - 4) / 2;
    Animated.spring(translateX, {
      toValue: selectedIndex * pillWidth,
      useNativeDriver: true,
      tension: 300,
      friction: 28,
    }).start();
  }, [selectedIndex, translateX, containerWidth]);

  const pillWidth = containerWidth > 0 ? (containerWidth - 4) / 2 : 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.full,
        },
      ]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* Sliding background pill — only render once container is measured */}
      {pillWidth > 0 && (
        <Animated.View
          style={[
            styles.activePill,
            {
              backgroundColor: colors.primary,
              width: pillWidth,
              borderRadius: radii.full,
              transform: [{ translateX }],
            },
          ]}
        />
      )}
      {options.map((label, idx) => {
        const isActive = selectedIndex === idx;
        return (
          <Pressable
            key={label}
            onPress={() => onChange(idx as 0 | 1)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={({ hovered }: any) => [
              styles.option,
              hovered && !isActive && { opacity: 0.8 },
            ]}
          >
            <ThemedText
              variant={isActive ? 'bodyBold' : 'body'}
              style={{ color: isActive ? colors.onPrimary : colors.text }}
            >
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  activePill: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
  },
  option: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
