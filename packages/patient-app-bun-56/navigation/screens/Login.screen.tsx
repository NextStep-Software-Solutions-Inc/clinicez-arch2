import { Button } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "contexts/AuthContext";
import { useState } from "react";
import { ScrollView, Text } from "react-native";

export default function LoginScreen() {
    const { login, unlock } = useAuth();
    const navigation = useNavigation();

    const handleLogin = async () => {
        await login();
        await unlock();
        navigation.navigate("BottomTabs", {
            screen: "HomeScreen"
        });
    }

    const handleForgotPassword = () => {
        navigation.navigate("Auth", {
            screen: "ForgotPassword"
        });
    }

    const handleCreateAccount = () => {
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
            <Text>Login Screen</Text>
            <Button onPressIn={handleLogin}>Go to Home Screen</Button>
            <Button onPressIn={handleForgotPassword}>Forgot Password</Button>
            <Button onPressIn={handleCreateAccount}>Create Account</Button>
        </ScrollView>
    )
}