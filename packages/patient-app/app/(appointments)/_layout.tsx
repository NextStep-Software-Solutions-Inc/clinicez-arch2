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
    <Stack screenOptions={{ headerShown: false }} >
      <Stack.Screen
        name="[appointmentId]"
        options={(props) => ({
          title: 'Appointment Details',
          // headerLeft({ canGoBack }) {
          //   return (
          //     <>{
          //       canGoBack && (
          //         <TouchableOpacity onPress={() => props.navigation.goBack()}>
          //           <ThemedView className="flex-row items-center gap-1">
          //             <Feather name="chevron-left" size={24} color="black" />
          //             <ThemedText>Back</ThemedText>
          //           </ThemedView>
          //         </TouchableOpacity>
          //       )
          //     }</>
          //   );
          // },
          headerShown: true
        })} />
      <Stack.Screen
        name="create"
        options={(props) => ({
          headerShown: true,
          title: 'Book New Appointment',
          // headerLeft: ({ }) => (
          //   <Feather name="chevron-left" size={28} color="#334155" style={{ marginLeft: 8 }} onPress={() => props.navigation.goBack()} accessibilityLabel="Back" />
          // ),
        })}
      />
    </Stack>
  );
}
