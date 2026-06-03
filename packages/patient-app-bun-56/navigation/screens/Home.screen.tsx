import { ScrollView, Text } from "react-native";
import ThemedText from "@ui/ThemedText";

export default function HomeScreen() {
    return (
        <ScrollView contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ 
                padding: 16,
                gap: 16
             }}
        >
            <ThemedText>Home Screen</ThemedText>
        </ScrollView>
    )
}