import { useNavigation, useTheme } from "@react-navigation/core";
import { MaterialSymbol, SFSymbol } from "@react-navigation/native";
import { View, Pressable, Platform } from "react-native";

export default function BottomTabsHeaderRight() {
    const navigation = useNavigation();
    const {colors} = useTheme();

    return (
        <View style={{ flexDirection: 'row', gap: 12, marginRight: 16 }}>
            <Pressable onPressIn={() => navigation.navigate("Main", { screen: "NotificationScreen" })}>
                {Platform.select({
                    android: <MaterialSymbol name="notifications" size={24} color={colors.text} />,
                    ios: <SFSymbol name="bell.fill" size={24} color={colors.text} />
                })}
            </Pressable>
            <Pressable onPressIn={() => navigation.navigate("Main", { screen: "SettingsScreen" })}>
                {Platform.select({
                    android: <MaterialSymbol name="settings" size={24} color={colors.text} />,
                    ios: <SFSymbol name="gear" size={24} color={colors.text} />
                })}
            </Pressable>
        </View>
    );
};
