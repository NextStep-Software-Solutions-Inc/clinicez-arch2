import React from "react";
import { Text, View, type TextProps, type ViewProps } from "react-native";

import { cn } from "@lib/utils";

type NativeViewProps = ViewProps & {
  className?: string;
};

type NativeTextProps = TextProps & {
  className?: string;
};

const Card = ({ className, ...props }: NativeViewProps) => (
  <View
    {...props}
    className={cn(
      "rounded-2xl border border-border dark:border-border-dark bg-background dark:bg-background-dark",
      "shadow-sm overflow-hidden",
      className,
    )}
  />
);
Card.displayName = "ThemedCard";

const CardHeader = ({ className, ...props }: NativeViewProps) => (
  <View
    {...props}
    className={cn("px-6 pt-6 pb-4 flex-col gap-2", className)}
  />
);
CardHeader.displayName = "ThemedCardHeader";

const CardTitle = ({ className, ...props }: NativeTextProps) => (
  <Text
    {...props}
    className={cn("text-lg font-semibold tracking-tight text-text dark:text-text-dark", className)}
  />
);
CardTitle.displayName = "ThemedCardTitle";

const CardDescription = ({ className, ...props }: NativeTextProps) => (
  <Text
    {...props}
    className={cn("text-sm text-muted dark:text-muted-dark", className)}
  />
);
CardDescription.displayName = "ThemedCardDescription";

const CardContent = ({ className, ...props }: NativeViewProps) => (
  <View
    {...props}
    className={cn("px-6 pb-6 flex-col gap-4", className)}
  />
);
CardContent.displayName = "ThemedCardContent";

const CardFooter = ({ className, ...props }: NativeViewProps) => (
  <View
    {...props}
    className={cn("px-6 pb-6 pt-2 flex-row items-center justify-between gap-4", className)}
  />
);
CardFooter.displayName = "ThemedCardFooter";

export const ThemedCard = Object.assign(Card, {
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Content: CardContent,
  Footer: CardFooter,
});

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };

export default ThemedCard;