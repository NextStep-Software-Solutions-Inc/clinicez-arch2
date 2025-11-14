import ThemedView from "@components/ThemedView";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function HPProfileEditScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ThemedView className="flex-1 items-center justify-center" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <Text>HP Profile Edit Screen</Text>
    </ThemedView>
  );
}
