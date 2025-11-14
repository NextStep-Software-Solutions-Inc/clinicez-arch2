import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import { GestureResponderEvent, Pressable, Text, View } from "react-native";

export interface ItemProps {
  id?: string;
  title: string;
  description?: string;
  onPress?: (event: GestureResponderEvent) => void;
}

const Item = ({
  title,
  description,
  onPress
}: ItemProps) => {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
    >
      {({ pressed }) => (
        <View className="flex-row items-center gap-3 shadow-muted shadow-sm rounded-lg border border-muted/10 dark:border-muted-dark/5 bg-white dark:bg-background-dark px-4 py-3 w-full" style={{ elevation: 5 }}>
          <View className="flex-1">
            <Text className="text-lg font-medium text-text dark:text-text-dark">
              {title}
            </Text>
            {description && (
              <ThemedText variant="caption" className="text-muted dark:text-muted-dark">
                {description}
              </ThemedText>
            )}
          </View>
          <View className="flex-row items-center justify-center">
            <ThemedIcon icon="chevron-right" size={20} color="muted" />
          </View>
        </View>
      )}
    </Pressable>
  );
};

export default Item;
