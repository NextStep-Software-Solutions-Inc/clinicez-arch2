import { useAuth } from "contexts/AuthContext";
import { useAuth as useClerkAuth } from "@clerk/expo";
import { Button } from "@react-navigation/elements";
import { ScrollView, Text, View, Switch } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";

export default function SettingsScreen() {
    const { signOut } = useClerkAuth();
    const { lock, biometricsEnabled, setBiometricsEnabled, hasPIN } = useAuth();
    const navigation = useNavigation();
    const [biometricsSupported, setBiometricsSupported] = useState(false);

    useEffect(() => {
        (async () => {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            setBiometricsSupported(hasHardware && isEnrolled);
        })();
    }, []);

    const handleLogout = () => {
        signOut();
    };

    const handleLock = () => {
        lock();
    };

    return (
        <ScrollView contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ padding: 16, gap: 16 }}>
            <Text>Settings Screen</Text>

            {hasPIN && biometricsSupported && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
                    <Text style={{ fontSize: 16 }}>Face ID / Biometrics unlock</Text>
                    <Switch
                        value={biometricsEnabled}
                        onValueChange={(value) => setBiometricsEnabled(value)}
                    />
                </View>
            )}

            <Button onPressIn={handleLock}>Lock</Button>
            <Button onPressIn={handleLogout}>Logout</Button>
        </ScrollView>
    );
}