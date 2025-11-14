import { Image, View } from "react-native";

interface AvatarProps {
  uri?: string;
  alt?: string;
}

const Avatar = ({
  uri,
  alt
}: AvatarProps) => {
  return (
    <View className="flex-row justify-center items-center w-32 h-32 rounded-full overflow-hidden bg-surface dark:bg-surface-dark border border-border dark:border-border-dark">
      <Image
        source={{ uri }}
        resizeMode="cover"
        className="w-full h-full"
        accessibilityLabel={alt}
        accessibilityHint={alt}
        accessibilityRole="image"
      />
    </View>
  );
};

export default Avatar;
