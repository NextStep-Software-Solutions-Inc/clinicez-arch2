import ThemedText from "@ui/ThemedText";
import { ScrollView, Text } from "react-native";

export default function AppointmentsScreen() {
    return (
        <ScrollView contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ 
                padding: 16,
                gap: 16
             }}
        >
            <ThemedText>Appointments Screen</ThemedText>
        </ScrollView>
    )
}