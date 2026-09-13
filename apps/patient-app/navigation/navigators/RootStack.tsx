import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';

import LoadingScreen from '../screens/Loading.screen';
import OnboardingStack from './OnboardingStack';
import AuthStack from './AuthStack';
import SetupPINStack from './SetupPINStack';
import MainStack from './MainStack';
import {
  useIsAppLoading,
  useIsOnboarding,
  useIsInAuthFlow,
  useIsSettingUpPIN,
  useIsMainReady,
} from '../../hooks/useNavState';

const RootStack = createNativeStackNavigator({
  screenOptions: { headerShown: false },
  screens: {
    Loading: createNativeStackScreen({
      screen: LoadingScreen,
      if: useIsAppLoading,
      options: { animation: 'none' },
    }),
    Onboarding: createNativeStackScreen({
      screen: OnboardingStack,
      if: useIsOnboarding,
    }),
    Auth: createNativeStackScreen({
      screen: AuthStack,
      if: useIsInAuthFlow,
    }),
    SetupPIN: createNativeStackScreen({
      screen: SetupPINStack,
      if: useIsSettingUpPIN,
    }),
    Main: createNativeStackScreen({
      screen: MainStack,
      if: useIsMainReady,
    }),
  },
});

export default RootStack;
