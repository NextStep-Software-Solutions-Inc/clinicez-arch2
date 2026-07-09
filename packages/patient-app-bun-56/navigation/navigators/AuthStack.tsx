import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';

import LoginScreen from '../screens/Login.screen';
import SignupScreen from '../screens/Signup.screen';
import VerifyScreen from '../screens/Verify.screen';
import ForgotPasswordScreen from '../screens/ForgotPassword.screen';

const AuthStack = createNativeStackNavigator({
  screens: {
    Login: createNativeStackScreen({
      screen: LoginScreen,
      options: { title: 'Sign in', headerBackVisible: false },
    }),
    Signup: createNativeStackScreen({
      screen: SignupScreen,
      options: { title: 'Create account' },
    }),
    Verify: createNativeStackScreen({
      screen: VerifyScreen,
      options: { title: 'Verify email' },
    }),
    ForgotPassword: createNativeStackScreen({
      screen: ForgotPasswordScreen,
      options: { title: 'Forgot password' },
    }),
  },
});

export default AuthStack;
