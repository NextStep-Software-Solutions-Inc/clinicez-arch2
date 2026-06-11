import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';

interface SegmentedControlProps {
    options: [string, string];
    selectedIndex: 0 | 1;
    onChange: (index: 0 | 1) => void;
}

export default function SegmentedControl({ options, selectedIndex, onChange }: SegmentedControlProps) {
    const { colors } = useTheme();
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
            style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}
            onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
        >
            {/* Sliding background pill — only render once container is measured */}
            {pillWidth > 0 && (
                <Animated.View
                    style={[
                        styles.activePill,
                        {
                            backgroundColor: colors.primary,
                            width: pillWidth,
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
                        style={styles.option}
                    >
                        <ThemedText
                            style={[
                                styles.optionText,
                                { color: isActive ? '#fff' : colors.text },
                                isActive && styles.optionTextActive,
                            ]}
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
        borderRadius: 999,
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
        borderRadius: 999,
    },
    option: {
        flex: 1,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    optionText: {
        fontSize: 14,
        fontWeight: '500',
    },
    optionTextActive: {
        fontWeight: '700',
    },
});

