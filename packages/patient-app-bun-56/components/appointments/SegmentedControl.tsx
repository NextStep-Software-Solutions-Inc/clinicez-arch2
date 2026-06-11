import { useEffect, useRef } from 'react';
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
    const translateX = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(translateX, {
            toValue: selectedIndex === 0 ? 0 : 1,
            useNativeDriver: true,
            tension: 280,
            friction: 26,
        }).start();
    }, [selectedIndex, translateX]);

    return (
        <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Sliding background pill */}
            <Animated.View
                style={[
                    styles.activePill,
                    { backgroundColor: colors.primary },
                    {
                        transform: [{
                            translateX: translateX.interpolate({
                                inputRange: [0, 1],
                                outputRange: [2, 0],   // resolved via onLayout
                            }),
                        }],
                    },
                ]}
            />
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
                        <ThemedText style={[
                            styles.optionText,
                            { color: isActive ? '#fff' : colors.text },
                            isActive && styles.optionTextActive,
                        ]}>
                            {label}
                        </ThemedText>
                    </Pressable>
                );
            })}
        </View>
    );
}

const PILL_HEIGHT = 36;

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
        right: '50%',
        borderRadius: 999,
        height: PILL_HEIGHT,
    },
    option: {
        flex: 1,
        height: PILL_HEIGHT,
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
