import { useAuth } from "contexts/AuthContext";
import { useAuth as useClerkAuth } from "@clerk/expo";
import { Button } from "@react-navigation/elements";
import { ScrollView, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";

export default function SettingsScreen() {
    const {signOut} = useClerkAuth();
    const {lock} = useAuth();
    const navigation = useNavigation();

    const handleLogout = () => {
        signOut();
    }

    const handleLock = () => {
        lock();
        navigation.navigate("Auth", { screen: "Lock" });   
    }

    return (
        <ScrollView contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ padding: 16, gap: 16 }}>
            <Text>Settings Screen</Text>
            <Button onPressIn={handleLogout}>Logout</Button>
            <Button onPressIn={handleLock}>Lock</Button>
        </ScrollView>
    )
}