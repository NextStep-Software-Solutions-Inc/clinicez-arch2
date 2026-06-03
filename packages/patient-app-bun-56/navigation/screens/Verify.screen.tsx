import { Button } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { ScrollView, Text } from "react-native";

export default function VerifyScreen() {
    const navigation = useNavigation();
    return (
        <ScrollView contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
                padding: 16,
                gap: 16
            }}
        >
            <Text>Verify Screen</Text>
            <Button onPressIn={() => navigation.navigate("BottomTabs")}>Go to Bottom Tabs</Button>
        </ScrollView>
    )
}