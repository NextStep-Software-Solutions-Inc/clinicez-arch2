import { Text } from "react-native";
import { useTheme } from "@react-navigation/native";

export default function ThemedText(props: React.ComponentProps<typeof Text>) {
    const {colors} = useTheme();
    return (
        <Text {...props} style={{ color: colors.text, ...props.style }} />
    );
}