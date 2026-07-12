import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';

import HomeScreen from '../screens/Home.screen';
import BottomTabsHeaderRight from '../../components/BottomTabsHeaderRight';

const HomeStack = createNativeStackNavigator({
  screenOptions: {
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    Home: createNativeStackScreen({
      screen: HomeScreen,
      options: {
        title: 'Home',
        headerLargeTitleEnabled: true,
        headerRight: () => <BottomTabsHeaderRight />,
      },
    }),
  },
});

export default HomeStack;
