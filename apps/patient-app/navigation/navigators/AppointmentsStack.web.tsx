import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import AppointmentsScreen from '../screens/Appointments.screen';

const AppointmentsStackWeb = createNativeStackNavigator({
  screenOptions: {
    headerShown: false,
  },
  screens: {
    Appointments: createNativeStackScreen({
      screen: AppointmentsScreen,
      options: {
        headerShown: false,
      },
    }),
  },
});

export default AppointmentsStackWeb;
