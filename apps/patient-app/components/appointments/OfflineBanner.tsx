import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

interface OfflineBannerProps {
  /** Force-show the banner even when online (e.g. data came from SQLite cache) */
  isFromCache?: boolean;
}

export default function OfflineBanner({ isFromCache = false }: OfflineBannerProps) {
  const { colors, sizes } = useAppTheme();
  const netInfo = useNetInfo();

  // Web online-first detection using window online/offline events
  const [webOnline, setWebOnline] = useState(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleOnline = () => setWebOnline(true);
    const handleOffline = () => setWebOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isWeb = Platform.OS === 'web';
  const isOffline = isWeb ? !webOnline : netInfo.isConnected === false;
  // On web: no sync-queue / cached schedule messaging, show only when offline
  const shouldShow = isWeb ? isOffline : (isOffline || isFromCache);

  const heightAnim = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(shouldShow);

  useEffect(() => {
    if (shouldShow) {
      setRendered(true);
    }
    Animated.spring(heightAnim, {
      toValue: shouldShow ? 1 : 0,
      useNativeDriver: false,
      tension: 240,
      friction: 22,
    }).start(({ finished }) => {
      if (finished && !shouldShow) {
        setRendered(false);
      }
    });
  }, [shouldShow, heightAnim]);

  if (!rendered && !shouldShow) {
    return null;
  }

  const animatedHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 42],
  });

  const message = isWeb
    ? 'You are offline — reconnect to continue'
    : isOffline
      ? 'You are offline — showing cached schedule'
      : 'Viewing cached schedule — pull to refresh';

  const isEmergency = isOffline;
  const bannerBg = isEmergency ? colors.emergencyBg : colors.warningBg;
  const bannerBorder = isEmergency ? colors.emergencyBorder : colors.warningBorder;
  const textColor = isEmergency ? colors.emergencyText : colors.warningText;

  return (
    <Animated.View style={[styles.wrapper, { height: animatedHeight, overflow: 'hidden' }]}>
      <View
        style={[
          styles.banner,
          {
            backgroundColor: bannerBg,
            borderBottomColor: bannerBorder,
          },
        ]}
      >
        <AppIcon
          name={isOffline ? 'cloudOff' : 'clock'}
          size={sizes.iconSm}
          color={isEmergency ? 'emergencyText' : 'warningText'}
        />
        <ThemedText variant="smallBold" style={{ color: textColor }}>
          {message}
        </ThemedText>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
