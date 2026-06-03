import { Button } from "@react-navigation/elements";
import { useAuth } from "contexts/AuthContext";
import { ScrollView, Text } from "react-native";

export default function UnlockScreen() {
    const {unlock} = useAuth();
    return (
        <ScrollView>
            <Text>Unlock Screen</Text>
            <Button onPressIn={unlock}>Unlock</Button>
        </ScrollView>
    )
}