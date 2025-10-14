import React, {
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  PressableProps,
  View,
  ViewProps,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { cn } from "@lib/utils";
import ThemedIcon from "@components/ThemedIcon";

type CollapsibleContextValue = {
  open: boolean;
  disabled: boolean;
  toggle: () => void;
};

const CollapsibleContext = React.createContext<CollapsibleContextValue | undefined>(
  undefined,
);

const useCollapsibleContext = (component: string): CollapsibleContextValue => {
  const context = useContext(CollapsibleContext);
  if (!context) {
    throw new Error(`${component} must be used within a Collapsible`);
  }
  return context;
};

interface CollapsibleBaseProps extends Omit<ViewProps, "children"> {
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

interface CollapsibleControlledProps extends CollapsibleBaseProps {
  open: boolean;
  defaultOpen?: never;
  onOpenChange?: (open: boolean) => void;
}

interface CollapsibleUncontrolledProps extends CollapsibleBaseProps {
  open?: undefined;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type CollapsibleProps =
  | CollapsibleControlledProps
  | CollapsibleUncontrolledProps;

const Collapsible = ({
  open,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  children,
  className,
  style,
  ...rest
}: CollapsibleProps) => {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState<boolean>(defaultOpen);
  const currentOpen = isControlled ? (open as boolean) : internalOpen;

  const setOpenState = useCallback(
    (next: boolean) => {
      if (disabled) {
        return;
      }
      if (!isControlled) {
        setInternalOpen(next);
      }
      if (onOpenChange) {
        onOpenChange(next);
      }
    },
    [disabled, isControlled, onOpenChange],
  );

  const toggle = useCallback(() => {
    setOpenState(!currentOpen);
  }, [setOpenState, currentOpen]);

  const contextValue = useMemo<CollapsibleContextValue>(
    () => ({
      open: currentOpen,
      disabled,
      toggle,
    }),
    [currentOpen, disabled, toggle],
  );

  return (
    <CollapsibleContext.Provider value={contextValue}>
      <View
        className={cn("w-full", className)}
        style={style}
        {...rest}
      >
        {children}
      </View>
    </CollapsibleContext.Provider>
  );
};
Collapsible.displayName = "Collapsible";

interface CollapsibleTriggerProps
  extends Omit<PressableProps, "children"> {
  className?: string;
  children: ReactNode;
}

const CollapsibleTrigger = ({
  className,
  children,
  style,
  onPress,
  ...rest
}: CollapsibleTriggerProps) => {
  const { open, disabled, toggle } = useCollapsibleContext("CollapsibleTrigger");

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (!disabled) {
        toggle();
      }
      if (onPress) {
        onPress(event);
      }
    },
    [disabled, toggle, onPress],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open, disabled }}
      disabled={disabled}
      className={cn(
        "flex-row items-center justify-between",
        disabled ? "opacity-60" : "active:opacity-80",
        className,
      )}
      style={style}
      onPress={handlePress}
      {...rest}
    >
      {children}
      <ThemedIcon
        icon={open ? "chevron-up" : "chevron-down"}
        size="sm"
        color="muted"
      />
    </Pressable>
  );
};
CollapsibleTrigger.displayName = "CollapsibleTrigger";

interface CollapsibleContentProps extends Omit<ViewProps, "style"> {
  className?: string;
  children: ReactNode;
  style?: ViewProps["style"];
}

const CollapsibleContent = ({
  className,
  children,
  style,
  ...rest
}: CollapsibleContentProps) => {
  const { open } = useCollapsibleContext("CollapsibleContent");

  const [contentHeight, setContentHeight] = useState<number>(0);
  const animatedHeight = useSharedValue(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const measuredHeight = event.nativeEvent.layout.height;
    if (measuredHeight > 0 && contentHeight !== measuredHeight) {
      setContentHeight(measuredHeight);
    }
  }, [contentHeight]);

  useEffect(() => {
    if (contentHeight > 0) {
      animatedHeight.value = withTiming(open ? contentHeight : 0, {
        duration: 300,
      });
    }
  }, [open, contentHeight, animatedHeight]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: animatedHeight.value,
      opacity: animatedHeight.value === 0 ? 0 : 1,
      overflow: 'hidden' as const,
    };
  });

  return (
    <Animated.View
      className={cn("w-full", className)}
      style={[animatedStyle, style]}
      {...rest}
    >
      <View
        style={{ position: 'absolute', opacity: 0 }}
        pointerEvents="none"
        onLayout={onLayout}
      >
        {children}
      </View>
      {contentHeight > 0 && children}
    </Animated.View>
  );
};
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
