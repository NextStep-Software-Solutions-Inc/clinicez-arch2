import { useNavigation, useTheme } from "@react-navigation/core";
import { AppIcon } from "@ui/Icon";
import { View, Pressable, StyleSheet } from "react-native";
import { useNotificationContext } from "contexts/NotificationContext";
import ThemedText from "@ui/ThemedText";

export default function BottomTabsHeaderRight() {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const { unreadCount } = useNotificationContext();

    return (
        // 1. Cleaned up the wrapper view and added alignItems to keep buttons centered
        <View style={{ flexDirection: 'row', gap: 4, marginRight: 16, alignItems: 'center' }}>
            <Pressable
                onPressIn={() => navigation.navigate("Main", { screen: "NotificationScreen" })}
                style={styles.iconBtn}
            >
                <AppIcon android="notifications" ios="bell.fill" size={24} color={colors.text} />
                {/* Note: Kept your 32 > 0 condition, assuming it's for testing */}
                {unreadCount > 0 && (
                    <View style={styles.badge}>
                        <ThemedText style={styles.badgeText}>
                            {unreadCount > 9 ? '9+' : String(unreadCount)}
                        </ThemedText>
                    </View>
                )}
            </Pressable>

            <Pressable
                onPressIn={() => navigation.navigate("Main", { screen: "SettingsScreen" })}
                style={styles.iconBtn} // 2. Applied the same style here for alignment
            >
                <AppIcon android="settings" ios="gear" size={24} color={colors.text} />
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    iconBtn: {
        position: 'relative',
        padding: 6, // 3. Expanded the bounding box to give the badge room
    },
    badge: {
        position: 'absolute',
        top: 2,   // 4. Adjusted to positive coordinates inside the padded area
        right: 1, // 4. Adjusted to positive coordinates inside the padded area
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
        zIndex: 10, // Ensures it draws above the icon
    },
    badgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '800',
        lineHeight: 12,
    },
});