import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';

import MessagesInboxScreen from '../screens/messages/MessagesInbox.screen';
import BottomTabsHeaderRight from '../../components/BottomTabsHeaderRight';

const MessagesStack = createNativeStackNavigator({
  screenOptions: {
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    MessagesInbox: createNativeStackScreen({
      screen: MessagesInboxScreen,
      options: {
        title: 'Messages',
        headerLargeTitleEnabled: true,
        headerRight: () => <BottomTabsHeaderRight />,
      },
    }),
  },
});

export default MessagesStack;
