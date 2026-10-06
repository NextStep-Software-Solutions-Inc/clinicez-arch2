import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';

import LoadingScreen from '../screens/Loading.screen';
import OnboardingStack from './OnboardingStack';
import AuthStack from './AuthStack';
import SetupPINStack from './SetupPINStack';
import MainStack from './MainStack';
import { useIsAppLoading } from '../../hooks/useNavState';
import { useAuth } from 'contexts/AuthContext';

/**
 * On Web, unauthenticated visitors can always access both Onboarding (Welcome & Onboard)
 * and Auth (Login, Signup, Verify, ForgotPassword) without being permanently locked out
 * by a first-launch mobile storage gate.
 */
export const useIsUnauthenticatedWeb = () => {
  const auth = useAuth();
  const isAppLoading = useIsAppLoading();
  if (isAppLoading) return false;
  return !auth.isAuthenticated;
};

export const useIsSettingUpPINWeb = () => {
  const auth = useAuth();
  const isAppLoading = useIsAppLoading();
  if (isAppLoading) return false;
  return auth.isAuthenticated && !auth.hasPIN;
};

export const useIsMainReadyWeb = () => {
  const auth = useAuth();
  const isAppLoading = useIsAppLoading();
  if (isAppLoading) return false;
  return auth.isAuthenticated && auth.hasPIN;
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
      if: useIsUnauthenticatedWeb,
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
