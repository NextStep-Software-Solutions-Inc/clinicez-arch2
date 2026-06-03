import ThemedText from "@ui/ThemedText";
import { ScrollView, Text } from "react-native";

export default function ProfileScreen() {
    return (
        <ScrollView contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ 
                padding: 16,
                gap: 16
             }}
        >
            <ThemedText>Profile Screen</ThemedText>
        </ScrollView>
    )
}