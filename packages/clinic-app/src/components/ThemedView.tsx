import React, { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { View, type ViewProps } from "react-native";
import { cn } from "@lib/utils";

const themeVariants = cva("", {
  variants: {
    variant: {
      default: "bg-surface dark:bg-surface-dark",
      elevated: "bg-surface-elevated dark:bg-surface-elevated-dark shadow-sm",
      outlined: "bg-surface-elevated dark:bg-surface-elevated-dark border border-border dark:border-border-dark",
      transparent: "bg-transparent",
      surface: "bg-surface dark:bg-surface-dark",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface ThemedViewProps extends ViewProps,
  VariantProps<typeof themeVariants> { }

export const ThemedView = forwardRef<View, ThemedViewProps>(
  ({ variant, className, style, ...props }, ref) => {
    return (
      <View
        ref={ref}
        className={cn(themeVariants({ variant }), className)}
        {...props}
        style={style}
      />
    );
  }
);

ThemedView.displayName = "ThemedView";

export default ThemedView;