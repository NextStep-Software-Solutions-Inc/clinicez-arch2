import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { TouchableOpacity } from 'react-native';
export type AppointmentDetailParams = { appointmentId: string };

export type AppointmentsStackParamList = {
  '[appointmentId]': AppointmentDetailParams;
};

export default function AppointmentsStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade_from_bottom',
      }}
    >
      <Stack.Screen
        name="[appointmentId]"
        options={(props) => ({
          title: 'Appointment Details',
          headerShown: true
        })}
      />
      <Stack.Screen
        name="create"
        options={(props) => ({
          headerShown: true,
          title: 'Book New Appointment',
        })}
      />
    </Stack>
  );
}
