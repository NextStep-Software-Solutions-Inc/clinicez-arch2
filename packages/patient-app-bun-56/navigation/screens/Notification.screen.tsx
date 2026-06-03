import { ScrollView, Text } from "react-native";

export default function NotificationScreen() {
    return (
        <ScrollView contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ 
                padding: 16,
                gap: 16
             }}
        >
            <Text>Notification Screen</Text>
        </ScrollView>
    )
}