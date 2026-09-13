import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';

import CreatePINScreen from '../screens/CreatePIN.screen';

const SetupPINStack = createNativeStackNavigator({
  screens: {
    CreatePIN: createNativeStackScreen({
      screen: CreatePINScreen,
      options: {
        title: 'Create PIN',
        headerBackVisible: false,
        headerShown: false
      },
    }),
  },
});

export default SetupPINStack;
