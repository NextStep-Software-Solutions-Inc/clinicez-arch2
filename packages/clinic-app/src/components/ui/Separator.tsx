/**
 * This is a ShadCN UI inspired separator component that adapts to light and dark modes.
 * It uses Tailwind CSS classes for styling.
 * Inspired by https://ui.shadcn.com/docs/components/separator
 */

import React from "react";
import { View, type ViewProps, type StyleProp, type ViewStyle } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@lib/utils";

const separatorVariants = cva("bg-border dark:bg-border-dark", {
  variants: {
    orientation: {
      horizontal: "h-px w-full",
      vertical: "w-px h-full",
    },
    inset: {
      none: "",
      start: "self-start",
      center: "self-center",
      end: "self-end",
    },
    length: {
      full: "w-full h-full",
      partial: "w-1/2 h-1/2",
      short: "w-1/4 h-1/4",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
    inset: "none",
    length: "full",
  },
});

export interface SeparatorProps extends ViewProps, VariantProps<typeof separatorVariants> {
  className?: string;
  style?: StyleProp<ViewStyle>;
}

const Separator: React.FC<SeparatorProps> = ({
  orientation,
  inset,
  length,
  className,
  style,
  ...props
}) => {
  return (
    <View
      className={cn(separatorVariants({ orientation, inset, length }), className)}
      style={style}
      {...props}
    />
  );
};

export default Separator;