import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigation, navigationRef } from './navigation/Navigation';
import { linking } from './navigation/linking';
import WebShell from 'components/ui/WebShell';
import { useOTAUpdate } from 'hooks/useOTAUpdate';
import { ThemeProvider } from "@react-navigation/native";
import { useFonts } from 'expo-font';
import { ActivityIndicator, ColorValue, Platform, StyleSheet, View } from 'react-native';
import { AppThemeProvider, useAppTheme } from 'contexts/ThemeContext';
import { buildNavigationTheme } from './constants/navigationTheme';
import { fontAssets, setCustomFontsAvailable } from './constants/fonts';
import { lightTheme } from './constants/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { AuthProvider, useAuth } from 'contexts/AuthContext';
import CustomAlertModal from 'components/ui/CustomAlertModal';
import DialogHost from 'components/ui/DialogHost';
import { OnboardingProvider } from 'contexts/OnboardingContext';
import { AppearanceProvider } from 'contexts/AppearanceContext';
import { NotificationProvider } from 'contexts/NotificationContext';
import { ClerkProvider, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { resourceCache } from '@clerk/expo/resource-cache'
import DatabaseProvider from 'components/DatabaseProvider';
import SyncManager from 'components/SyncManager';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineAlertProvider } from 'contexts/OfflineAlertContext';
import { useIsLocked } from 'hooks/useNavState';
import LockScreen from './navigation/screens/Lock.screen';
import UnlockScreen from './navigation/screens/Unlock.screen';
import * as ExpoNotifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { ErrorBoundary } from 'components/ui/ErrorBoundary';
import { VercelInsights } from 'components/analytics/VercelInsights';
import { scheduleLocalNotification } from 'services/notifications/notificationService';
import { PrivacyProvider } from 'contexts/PrivacyContext';
import { CommsProvider } from '@clinicez/comms-sdk';
import { communicationsService } from 'services/comms/communicationsService';

// ─── Background notification task ─────────────────────────────────────────────
// This task runs when a push notification is received while the app is
// killed or in the background. It lets the OS deliver the notification
// and keeps the notification handler available at the module level.
// Note: on iOS the task only fires when the app is woken by a background
// push (content-available: 1). Android handles background delivery via FCM
// without needing this task.
const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

if (Platform.OS !== 'web') {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error) {
      console.error('[BackgroundNotification] Task error:', error);
      return;
    }
    
    const payload = data as any;
    const raw = payload.notification?.request?.content;
    if (!raw) return;
    
    const rawData = raw.data as Record<string, any>;
    
    // If a silent push contains title/body inside the data payload (significant change),
    // we wake up and display it as a local follow-up notification.
    if (rawData?.title && rawData?.body) {
      await scheduleLocalNotification(
        rawData.title,
        rawData.body,
        rawData,
        null // Trigger immediately
      );
    }
  });

  // Show banners, sounds, and badges while app is in foreground
  ExpoNotifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  // Register the background task so expo-notifications knows to wake it.
  // Must be called before the app renders (module level).
  ExpoNotifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(
    // Swallow the error — on Expo Go / simulators this will throw because
    // background tasks are not supported; it is safe to ignore.
    () => { },
  );
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  if (typeof document !== 'undefined' && !document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.json';
    document.head.appendChild(link);
  }

  if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Registration successful
        })
        .catch((err) => {
          console.error('[SW] Service Worker registration failed:', err);
        });
    });
  }
}

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function LockOverlay({ backgroundColor }: { backgroundColor: ColorValue }) {
  const isLocked = useIsLocked();
  const [screen, setScreen] = useState<'locked' | 'unlock'>('locked');

  useEffect(() => {
    if (!isLocked) setScreen('locked');
  }, [isLocked]);

  if (!isLocked) return null;

  return (
    <View style={[styles.lockOverlay, { backgroundColor }]}>
      {screen === 'unlock' ? <UnlockScreen /> : <LockScreen onUnlockPress={() => setScreen('unlock')} />}
    </View>
  );
}

function OTAUpdater() {
  useOTAUpdate();
  return null;
}

function AppWithTheme() {
  const theme = useAppTheme();
  const { showUserNotFoundAlert, setShowUserNotFoundAlert, userId, logout, getToken, internalPatientId } = useAuth();
  const { user } = useUser();

  const selectedTheme = useMemo(() => buildNavigationTheme(theme), [theme]);

  const getCommsTicket = useCallback(async () => {
    return communicationsService.getCommsTicket(getToken);
  }, [getToken]);

  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <DatabaseProvider>
        <SyncManager />
        <NotificationProvider>
          <BottomSheetModalProvider>
            <ThemeProvider value={selectedTheme}>
              <OfflineAlertProvider>
                <PrivacyProvider>
                  <CommsProvider
                    baseUrl={process.env.EXPO_PUBLIC_API_URL ?? ''}
                    getCommsTicket={getCommsTicket}
                    tenantId="patient-home"
                    facilityId="patient-portal"
                    staffId={internalPatientId ?? userId ?? 'patient'}
                    staffDisplayName={user?.fullName ?? 'Patient'}
                    options={{ autoConnect: false }}
                  >
                    <WebShell>
                      <Navigation ref={navigationRef} theme={selectedTheme} linking={linking} />
                      <LockOverlay backgroundColor={selectedTheme.colors.background} />
                    </WebShell>
                    <DialogHost />
                    <CustomAlertModal
                      visible={showUserNotFoundAlert}
                      title="Profile Setup Incomplete"
                      message="We could not find a health profile linked to this account yet. Please sign out and try again when connected, or contact clinic support."
                      buttonText="Sign Out"
                      iconName="alert"
                      onClose={async () => {
                        setShowUserNotFoundAlert(false);
                        await logout();
                      }}
                    />
                  </CommsProvider>
                </PrivacyProvider>
              </OfflineAlertProvider>
            </ThemeProvider>
          </BottomSheetModalProvider>
        </NotificationProvider>
      </DatabaseProvider>
    </>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  // If the typeface fails to load, fall back to the system font instead of rendering
  // text against missing font families.
  if (fontError) {
    setCustomFontsAvailable(false);
  }

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={lightTheme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ClerkProvider
          publishableKey={publishableKey}
          tokenCache={Platform.OS !== 'web' ? tokenCache : undefined}
          __experimental_resourceCache={Platform.OS !== 'web' ? resourceCache : undefined}
        >
          <AppearanceProvider>
            <AppThemeProvider>
              <OnboardingProvider>
                <AuthProvider>
                  <OTAUpdater />
                  <ErrorBoundary>
                    <AppWithTheme />
                  </ErrorBoundary>
                </AuthProvider>
              </OnboardingProvider>
            </AppThemeProvider>
          </AppearanceProvider>
        </ClerkProvider>
      </GestureHandlerRootView>
      <VercelInsights />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.colors.background,
  },
  lockOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1000,
  },
});
