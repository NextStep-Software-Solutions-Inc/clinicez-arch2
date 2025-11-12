import React, { useMemo } from "react";
import {
  Image,
  Pressable,
  Text,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle
} from "react-native";

import { cn, getInitials } from "@lib/utils";

type AvatarWrapperProps = {
  size?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  testID?: string;
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

const AvatarWrapper: React.FC<AvatarWrapperProps> = ({
  size = 40,
  className,
  style,
  children,
  onPress,
  accessibilityRole,
  accessibilityLabel,
  testID,
}) => {
  const baseStyle = [{ width: size, height: size, borderRadius: size / 2 }, style];
  const baseClassName = cn(
    "overflow-hidden items-center justify-center",
    "bg-surface dark:bg-surface-dark border border-border dark:border-border-dark",
    className,
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={baseStyle}
        className={baseClassName}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View
      style={baseStyle}
      className={baseClassName}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {children}
    </View>
  );
};
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
        <Text className="text-xl font-semibold text-text dark:text-text-dark">
          {fallback}
        </Text>
      )}
    </AvatarWrapper>
  );
};

UserAvatar.Wrapper = AvatarWrapper;
UserAvatar.displayName = "UserAvatar";

export default UserAvatar;
