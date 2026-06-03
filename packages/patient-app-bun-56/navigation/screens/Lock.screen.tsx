import { Button } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import ThemedText from "@ui/ThemedText";
import { ScrollView, Text } from "react-native";

export default function LockScreen() {
    const navigation = useNavigation();
    return (
        <ScrollView contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ 
                padding: 16,
                gap: 16
            }}>
            <ThemedText style={{ fontSize: 24, fontWeight: "bold" }}>Lock Screen</ThemedText>
            <Button onPressIn={() => navigation.navigate("Auth", {
                screen: "Unlock"
            })}>Unlock Screen</Button>
        </ScrollView>
    )
}