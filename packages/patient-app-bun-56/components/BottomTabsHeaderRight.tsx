import { useNavigation } from "@react-navigation/core";
import { MaterialSymbol, SFSymbol } from "@react-navigation/native";
import { View, Pressable, Platform } from "react-native";

export default function BottomTabsHeaderRight() {
    const navigation = useNavigation();

    return (
        <View style={{ flexDirection: 'row', gap: 12, marginRight: 16 }}>
            <Pressable onPressIn={() => navigation.navigate("NotificationScreen")}>
                {Platform.select({
                    android: <MaterialSymbol name="notifications" size={24} />,
                    ios: <SFSymbol name="bell.fill" size={24} />
                })}
            </Pressable>
            <Pressable onPressIn={() => navigation.navigate("SettingsScreen")}>
                {Platform.select({
                    android: <MaterialSymbol name="settings" size={24} />,
                    ios: <SFSymbol name="gear" size={24} />
                })}
            </Pressable>
        </View>
    );
};
