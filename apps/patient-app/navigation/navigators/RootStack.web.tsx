import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';

import LoadingScreen from '../screens/Loading.screen';
import OnboardingStack from './OnboardingStack';
import AuthStack from './AuthStack';
import SetupPINStack from './SetupPINStack';
import MainStack from './MainStack';
import { useIsAppLoading } from '../../hooks/useNavState';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { resolveNavAccess } from '../../utils/sessionExpiry';

function useResolvedWebNavAccess() {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const clerkAuth = useClerkAuth();
  const isAppLoading = useIsAppLoading();
  const resolved = resolveNavAccess({
    isAuthenticated: auth.isAuthenticated,
    isInitialized: auth.isInitialized,
    internalPatientId: auth.internalPatientId,
    hasPIN: auth.hasPIN,
    isLocked: auth.isLocked,
    isLoading: auth.isLoading,
    onboardingComplete: onboarding.isComplete,
    onboardingLoading: onboarding.isLoading,
    isClerkLoaded: Boolean(clerkAuth.isLoaded),
    isClerkSignedIn: auth.isClerkSignedIn,
    isReauthenticating: auth.isReauthenticating,
  });
  return { ...resolved, isAppLoading };
}

/**
 * On Web, unauthenticated visitors can always access both Onboarding (Welcome & Onboard)
 * and Auth (Login, Signup, Verify, ForgotPassword) without being permanently locked out
 * by a first-launch mobile storage gate. When re-authenticating after session expiry,
 * Onboarding is suppressed so the visitor lands directly on Login.
 */
export const useIsOnboardingWeb = () => {
  const { isAppLoading, isOnboardingWeb } = useResolvedWebNavAccess();
  if (isAppLoading) return false;
  return isOnboardingWeb;
};

export const useIsUnauthenticatedWeb = () => {
  const { isAppLoading, isUnauthenticatedWeb } = useResolvedWebNavAccess();
  if (isAppLoading) return false;
  return isUnauthenticatedWeb;
};

export const useIsSettingUpPINWeb = () => {
  const { isAppLoading, isSettingUpPINWeb } = useResolvedWebNavAccess();
  if (isAppLoading) return false;
  return isSettingUpPINWeb;
};

export const useIsMainReadyWeb = () => {
  const { isAppLoading, isMainReadyWeb } = useResolvedWebNavAccess();
  if (isAppLoading) return false;
  return isMainReadyWeb;
};

const RootStackWeb = createNativeStackNavigator({
  screenOptions: { headerShown: false },
  screens: {
    Loading: createNativeStackScreen({
      screen: LoadingScreen,
      if: useIsAppLoading,
      options: { animation: 'none' },
    }),
    Onboarding: createNativeStackScreen({
      screen: OnboardingStack,
      if: useIsOnboardingWeb,
    }),
    Auth: createNativeStackScreen({
      screen: AuthStack,
      if: useIsUnauthenticatedWeb,
    }),
    SetupPIN: createNativeStackScreen({
      screen: SetupPINStack,
      if: useIsSettingUpPINWeb,
    }),
    Main: createNativeStackScreen({
      screen: MainStack,
      if: useIsMainReadyWeb,
    }),
  },
});

export default RootStackWeb;
