import { Button } from "@react-navigation/elements";
import { ScrollView, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";

export default function ForgotPasswordScreen() {
    const navigation = useNavigation();

    const handleLogin = () => {
        navigation.navigate("Auth", {
            screen: "Login"
        });
    }
    const handleSignup = () => {
        navigation.navigate("Auth", {
            screen: "Signup"
        });
    }
    return (
        <ScrollView contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ 
                padding: 16,
                gap: 16
             }}>
            <Text>Forgot Password Screen</Text>
            <Button onPressIn={handleLogin}>Login</Button>
            <Button onPressIn={handleSignup}>Signup</Button>
        </ScrollView>
    )
}