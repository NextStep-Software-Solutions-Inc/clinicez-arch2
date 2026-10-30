import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import MessagesInboxScreen from '../screens/messages/MessagesInbox.screen';

const MessagesStackWeb = createNativeStackNavigator({
  screenOptions: {
    headerShown: false,
  },
  screens: {
    MessagesInbox: createNativeStackScreen({
      screen: MessagesInboxScreen,
      options: {
        headerShown: false,
      },
    }),
  },
});

export default MessagesStackWeb;
