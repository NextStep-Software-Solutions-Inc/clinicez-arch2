/**
 * This is a custom themed badge component that adapts to light and dark modes.
 * It uses Tailwind CSS classes for styling and supports different variants and sizes.
 * Inspired by https://ui.shadcn.com/docs/components/badge
 */

import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Text, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

import { cn } from "@lib/utils";

const badgeVariants = cva(
  "flex-row items-center justify-center rounded-full",
  {
    variants: {
      variant: {
        default: "bg-muted-foreground/20 dark:bg-muted-foreground-dark/20",
        secondary: "bg-primary-soft dark:bg-primary-soft-dark",
        destructive: "bg-error dark:bg-error-dark",
        outline: "border border-border dark:border-border-dark bg-transparent",
      },
      size: {
        xs: "h-5 w-5 min-h-[20px] min-w-[20px]",
        sm: "px-2.5 py-0.5 min-h-[20px] min-w-[20px]",
        md: "px-3 py-1 min-h-[24px] min-w-[24px]",
        lg: "px-4 py-1.5 min-h-[28px] min-w-[28px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

const badgeTextColors: Record<NonNullable<VariantProps<typeof badgeVariants>["variant"]>, string> = {
  default: "text-text dark:text-text-dark",
  secondary: "text-primary dark:text-primary-dark",
  destructive: "text-primary-foreground dark:text-primary-foreground",
  outline: "text-text dark:text-text-dark",
};

const badgeTextSizes: Record<NonNullable<VariantProps<typeof badgeVariants>["size"]>, string> = {
  xs: "text-[10px]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

type ThemedBadgeProps = React.PropsWithChildren<
  Omit<ViewProps, "style"> &
  VariantProps<typeof badgeVariants> & {
    className?: string;
    textClassName?: string;
    style?: StyleProp<ViewStyle>;
  }
>;

const ThemedBadge: React.FC<ThemedBadgeProps> = ({
  variant,
  size,
  className,
  textClassName,
  children,
  style,
  ...viewProps
}) => {
  const currentVariant = variant ?? "default";
  const currentSize = size ?? "md";
  const textClasses = badgeTextColors[currentVariant];
  const textSize = badgeTextSizes[currentSize];

  const content =
    typeof children === "string" || typeof children === "number" ? (
      <Text className={cn("font-semibold", textClasses, textSize, textClassName)}>{children}</Text>
    ) : (
      children
    );

  return (
    <View
      className={cn(badgeVariants({ variant, size }), className)}
      style={style}
      {...viewProps}
    >
      {content}
    </View>
  );
};
ThemedBadge.displayName = "ThemedBadge";

export default ThemedBadge;