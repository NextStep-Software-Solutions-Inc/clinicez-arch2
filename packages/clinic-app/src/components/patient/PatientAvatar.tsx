import React from "react";
import { cn, getInitials } from "@lib/utils";
import { AccessibilityProps, Image, ImageProps, Text, View } from "react-native";

interface PatientAvatarProps extends Omit<ImageProps, "source">, AccessibilityProps {
  uri?: string;
  name?: string;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
}

export default function PatientAvatar({
  uri,
  name,
  alt,
  className,
  fallbackClassName,
  accessibilityHint,
  accessibilityLabel,
  onError,
  ...rest
}: PatientAvatarProps) {
  const [hasLoadError, setHasLoadError] = React.useState(false);

  React.useEffect(() => {
    setHasLoadError(false);
  }, [uri]);

  const handleImageError = (
    event: Parameters<NonNullable<ImageProps["onError"]>>[0],
  ) => {
    setHasLoadError(true);
    onError?.(event);
  };

  const trimmedName = name?.trim();
  const label = accessibilityLabel ?? trimmedName ?? alt;
  const shouldRenderImage = Boolean(uri) && !hasLoadError;
  const isAccessible = Boolean(label);
  const fallback = (
    <Text className={cn("text-lg font-semibold", fallbackClassName)}>
      {trimmedName ? getInitials(trimmedName) : "?"}
    </Text>
  );

  return (
    <View className={cn("overflow-hidden items-center justify-center rounded-full w-28 h-28", className)}>
      {shouldRenderImage ? (
        <Image
          source={{ uri: uri! }}
          alt={alt}
          resizeMode="cover"
          className="h-full w-full"
          onError={handleImageError}
          accessible={isAccessible}
          accessibilityLabel={label}
          accessibilityHint={accessibilityHint}
          accessibilityRole="image"
          accessibilityIgnoresInvertColors
          {...rest}
        />
      ) : (
        fallback
      )}
    </View>
  );
}
