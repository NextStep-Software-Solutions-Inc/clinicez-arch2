import React, { type FC } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { TouchableOpacity, type TouchableOpacityProps, ActivityIndicator, View } from "react-native";
import { useColorScheme } from "nativewind";
import { cn } from "@lib/utils";
import { getThemeColor, type ThemeColorToken } from "@theme/colors";
import ThemedText from "./ThemedText";
import ThemedIcon, { type IconColor, type IconName } from "./ThemedIcon";

const buttonVariants = cva(
  "items-center justify-center rounded-lg px-4 py-3 active:scale-95 transition-transform",
  {
    variants: {
      variant: {
        default: "bg-primary dark:bg-primary-dark",
        destructive: "bg-error dark:bg-error-dark",
        outline: "border border-primary dark:border-primary-dark bg-transparent",
        ghost: "bg-transparent",
        link: "bg-transparent underline"
      },
      size: {
        default: "px-4 py-2",
        sm: "px-3 py-2",
        lg: "px-5 py-3",
        icon: "px-2 py-2 items-center justify-center rounded-full",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ThemedButtonProps
  extends Omit<TouchableOpacityProps, "style">,
  VariantProps<typeof buttonVariants> {
  children?: React.ReactNode;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: IconName | React.ReactNode;
  rightIcon?: IconName | React.ReactNode;
  leftIconColor?: IconColor | string;
  rightIconColor?: IconColor | string;
}

export const ThemedButton: FC<ThemedButtonProps> = ({
  variant,
  size,
  className,
  loading = false,
  children,
  leftIcon,
  rightIcon,
  leftIconColor,
  rightIconColor,
  ...props
}) => {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const isOutlineLike = variant === "outline" || variant === "ghost" || variant === "link";
  const textColorToken: ThemeColorToken = isOutlineLike ? "primary" : "primaryForeground";
  const textColor = getThemeColor(textColorToken, scheme);
  const hasIcons = Boolean(leftIcon || rightIcon);

  const resolveIcon = (icon: IconName | React.ReactNode, color?: IconColor | string) => {
    if (typeof icon === "string") {
      const tint = color ?? (isOutlineLike ? textColorToken : "primaryForeground");
      const iconSize = size === "sm" ? "sm" : size === "lg" ? "md" : "default";
      return <ThemedIcon icon={icon} color={tint} size={iconSize} />;
    }
    return icon;
  };

  const renderLeftIcon = () => {
    if (!leftIcon) {
      return null;
    }

    const shouldAddSpacing = Boolean(rightIcon || children);
    return (
      <View className={shouldAddSpacing ? "mr-2" : undefined}>
        {resolveIcon(leftIcon, leftIconColor)}
      </View>
    );
  };

  const renderRightIcon = () => {
    if (!rightIcon) {
      return null;
    }

    const shouldAddSpacing = Boolean(leftIcon || children);
    return (
      <View className={shouldAddSpacing ? "ml-2" : undefined}>
        {resolveIcon(rightIcon, rightIconColor)}
      </View>
    );
  };

  const renderContent = () => {
    const isTextPrimitive = typeof children === "string" || typeof children === "number";
    const content = isTextPrimitive ? (
      <ThemedText
        variant="button"
        className={
          isOutlineLike
            ? "text-primary dark:text-primary-dark"
            : "text-primary-contrast dark:text-primary-contrast-dark"
        }
        style={{ color: textColor }}
      >
        {children}
      </ThemedText>
    ) : (
      children
    );

    if (!hasIcons) {
      return content;
    }

    return (
      <View className="flex-row items-center justify-center">
        {renderLeftIcon()}
        {content}
        {renderRightIcon()}
      </View>
    );
  };

  return (
    <TouchableOpacity
      className={cn(buttonVariants({ variant, size }), className)}
      activeOpacity={0.6}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "outline" || variant === "ghost" || variant === "link"
              ? textColor
              : getThemeColor("primaryForeground", scheme)
          }
        />
      ) : (
        renderContent()
      )}
    </TouchableOpacity>
  );
};

export default ThemedButton;