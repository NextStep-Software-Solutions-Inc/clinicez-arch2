import { Button } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { ScrollView, Text } from "react-native";

export default function SignupScreen() {
    const navigation = useNavigation();

    const handleLogin = () => {
        navigation.navigate("Auth", {
            screen: "Login"
        });
    }
    return (
        <ScrollView contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ 
                padding: 16,
                gap: 16
             }}>
            <Text>Signup Screen</Text>
                        <Button onPressIn={handleLogin}>Login</Button>

        </ScrollView>
    )
}