import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function NotFoundScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 items-center justify-center" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="mb-4">
        <View className="text-4xl font-bold">404</View>
        <View className="text-lg">Page Not Found</View>
      </View>
    </View>
  );
}
