/**
 * A themed user avatar component with support for custom sizing and fallbacks.
 */

import React, { useMemo } from "react";
import { Image, Pressable, Text, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { cn } from "@lib/utils";

type AvatarWrapperProps = PressableProps & {
  size?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

type UserAvatarProps = {
  imageUrl?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number;
  className?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

const getInitials = (name?: string | null, email?: string | null): string => {
  if (name) {
    const [first, second] = name
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean);

    if (first && second) {
      return `${first[0]}${second[0]}`.toUpperCase();
    }

    if (first) {
      return first.slice(0, 2).toUpperCase();
    }
  }

  if (email) {
    return email.slice(0, 2).toUpperCase();
  }

  return "??";
};

const AvatarWrapper: React.FC<AvatarWrapperProps> = ({
  size = 40,
  className,
  style,
  children,
  ...pressableProps
}) => (
  <Pressable
    {...pressableProps}
    style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    className={cn(
      "overflow-hidden items-center justify-center",
      "bg-surface dark:bg-surface-dark border border-border dark:border-border-dark",
      className,
    )}
  >
    {children}
  </Pressable>
);
AvatarWrapper.displayName = "UserAvatarWrapper";

const UserAvatar: React.FC<UserAvatarProps> & { Wrapper: typeof AvatarWrapper } = ({
  imageUrl,
  name,
  email,
  size = 40,
  className,
  onPress,
  accessibilityLabel,
  testID,
}) => {
  const fallback = useMemo(() => getInitials(name, email), [name, email]);
  const isInteractive = typeof onPress === "function";
  const label = accessibilityLabel
    ?? (isInteractive
      ? name
        ? `Open profile options for ${name}`
        : "Open profile options"
      : name
        ? `${name}'s avatar`
        : "User avatar");

  return (
    <AvatarWrapper
      size={size}
      onPress={onPress}
      accessibilityRole={isInteractive ? "button" : undefined}
      accessibilityLabel={label}
      className={className}
      testID={testID}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          className="w-full h-full"
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text className="text-sm font-semibold text-text dark:text-text-dark">
          {fallback}
        </Text>
      )}
    </AvatarWrapper>
  );
};

UserAvatar.Wrapper = AvatarWrapper;
UserAvatar.displayName = "UserAvatar";

export default UserAvatar;
