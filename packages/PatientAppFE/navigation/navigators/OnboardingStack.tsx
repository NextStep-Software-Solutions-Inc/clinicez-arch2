import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';

import WelcomeScreen from '../screens/Welcome.screen';
import OnboardScreen from '../screens/Onboard.screen';

const OnboardingStack = createNativeStackNavigator({
  screens: {
    Welcome: createNativeStackScreen({
      screen: WelcomeScreen,
      options: { headerShown: false },
    }),
    Onboard: createNativeStackScreen({
      screen: OnboardScreen,
      options: { headerShown: false },
    }),
  },
});

export default OnboardingStack;
