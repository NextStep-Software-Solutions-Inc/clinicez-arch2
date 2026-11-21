import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import { AppIcon } from '@ui/Icon';

export default function LoadingScreen() {
  const { colors, spacing, sizes } = useAppTheme();
  const { verificationError, retryVerification, logout, isInitialized } = useAuth();
  const [isRetrying, setIsRetrying] = useState(false);
  const wasOfflineRef = useRef(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (verificationError) {
      setIsRetrying(false);
    }
  }, [verificationError]);

  useEffect(() => {
    const handleNetChange = (isConnected: boolean) => {
      setIsOffline(!isConnected);
      if (isConnected && wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setIsRetrying(true);
        retryVerification();
      } else if (!isConnected) {
        wasOfflineRef.current = true;
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onOnline = () => handleNetChange(true);
      const onOffline = () => handleNetChange(false);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      if (!navigator.onLine) {
        handleNetChange(false);
      }
      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      handleNetChange(online);
    });

    NetInfo.fetch().then((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (!online) {
        handleNetChange(false);
      }
    });

    return () => unsubscribe();
  }, [retryVerification]);

  const handleManualRetry = () => {
    setIsRetrying(true);
    retryVerification();
  };

  const isHalted = Boolean(verificationError) || (!isInitialized && isOffline);

  if (isHalted) {
    return (
      <View style={[styles.page, { backgroundColor: colors.background, padding: spacing['2xl'] }]}>
        <View style={[styles.errorCard, { maxWidth: sizes.dialogWidth }]}>
          <AppIcon name="warning" size={sizes.iconXl * 1.5} color="warning" />
          <ThemedText
            variant="h2"
            style={{ textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.sm }}
          >
            Unable to Connect
          </ThemedText>
          <ThemedText
            variant="body"
            color="textSecondary"
            style={{ textAlign: 'center', marginBottom: spacing['2xl'] }}
          >
            Clinic EZ requires an internet connection to set up your health vault. Please check your network connection and try again.
          </ThemedText>

          <Button
            label={isRetrying ? 'Connecting...' : 'Retry Connection'}
            variant="primary"
            fullWidth
            loading={isRetrying}
            onPress={handleManualRetry}
            style={{ marginBottom: spacing.md }}
          />

          <Button
            label="Sign Out"
            variant="outline"
            fullWidth
            onPress={logout}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorCard: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
