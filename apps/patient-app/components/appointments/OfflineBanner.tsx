import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import ThemedText from '@ui/ThemedText';

interface OfflineBannerProps {
    /** Force-show the banner even when online (e.g. data came from SQLite cache) */
    isFromCache?: boolean;
}

export default function OfflineBanner({ isFromCache = false }: OfflineBannerProps) {
    const netInfo = useNetInfo();
    const isOffline = netInfo.isConnected === false;
    const shouldShow = isOffline || isFromCache;

    const heightAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(heightAnim, {
            toValue: shouldShow ? 1 : 0,
            useNativeDriver: false,
            tension: 240,
            friction: 22,
        }).start();
    }, [shouldShow, heightAnim]);

    const animatedHeight = heightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 42],
    });

    const message = isOffline
        ? 'You are offline — showing cached schedule'
        : 'Viewing cached schedule — pull to refresh';

    return (
        <Animated.View style={[styles.wrapper, { height: animatedHeight, overflow: 'hidden' }]}>
            <View style={[styles.banner, isOffline ? styles.bannerOffline : styles.bannerCached]}>
                <ThemedText style={styles.icon}>{isOffline ? '⚡' : '🕐'}</ThemedText>
                <ThemedText style={styles.text}>{message}</ThemedText>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        overflow: 'hidden',
    },
    banner: {
        height: 42,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingHorizontal: 16,
    },
    bannerOffline: {
        backgroundColor: '#EF444422',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#EF4444',
    },
    bannerCached: {
        backgroundColor: '#F59E0B18',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#F59E0B',
    },
    icon: {
        fontSize: 14,
    },
    text: {
        fontSize: 12,
        fontWeight: '600',
        opacity: 0.85,
    },
});
