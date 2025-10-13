import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, PanResponder, Pressable, View, type ViewProps } from "react-native";
import { useColorScheme } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cn } from "@lib/utils";
import { getThemeColor } from "@theme/colors";

const absoluteFill = {
  position: "absolute" as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

type SidebarPosition = "left" | "right";

type SlidingSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  sidebar: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  position?: SidebarPosition;
  overlayOpacity?: number;
  pushContent?: boolean;
  sidebarClassName?: string;
  contentContainerProps?: (ViewProps & { className?: string });
};

const SlidingSidebar: React.FC<SlidingSidebarProps> = ({
  isOpen,
  onClose,
  sidebar,
  children,
  width = 288,
  position = "right",
  overlayOpacity = 0.45,
  pushContent = true,
  sidebarClassName,
  contentContainerProps,
  onOpen,
}) => {
  const animation = useRef(new Animated.Value(isOpen ? 1 : 0)).current;
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === "dark";
  const animatedValueRef = useRef(isOpen ? 1 : 0);
  const isGestureActive = useRef(false);

  useEffect(() => {
    const id = animation.addListener(({ value }) => {
      animatedValueRef.current = value;
    });
    return () => {
      animation.removeListener(id);
    };
  }, [animation]);

  const animateTo = useCallback(
    (toValue: number, customDuration?: number) => {
      animation.stopAnimation();
      const isOpening = toValue > animatedValueRef.current;
      const duration = customDuration ?? (isOpening ? 180 : 160);
      Animated.timing(animation, {
        toValue,
        duration,
        easing: isOpening ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          animatedValueRef.current = toValue;
        }
      });
    },
    [animation],
  );

  useEffect(() => {
    if (isGestureActive.current) {
      return;
    }
    animateTo(isOpen ? 1 : 0);
  }, [animateTo, isOpen]);

  const overlayAnimatedStyle = useMemo(
    () => ({
      opacity: animation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, overlayOpacity],
      }),
    }),
    [animation, overlayOpacity],
  );

  const contentTransform = pushContent
    ? [
      {
        translateX: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [0, position === "right" ? -width : width],
        }),
      },
    ]
    : undefined;

  const panelTransform = [
    {
      translateX: animation.interpolate({
        inputRange: [0, 1],
        outputRange: [position === "right" ? width : -width, 0],
      }),
    },
  ];

  const panelPositionStyle = position === "right" ? { right: 0 } : { left: 0 };
  const borderStyle = position === "right" ? { borderLeftWidth: 1 } : { borderRightWidth: 1 };

  const sidebarBackground = getThemeColor("background", isDark ? "dark" : "light");
  const sidebarBorder = getThemeColor("border", isDark ? "dark" : "light");

  const clamp = useCallback((value: number) => Math.min(1, Math.max(0, value)), []);

  const panResponder = useMemo(() => {
    let startValue = 0;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        if (!isOpen) return false;

        const isHorizontalGesture = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2;
        if (!isHorizontalGesture) {
          return false;
        }

        if (position === "right") {
          return gesture.dx > 8;
        }

        return gesture.dx < -8;
      },
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        if (!isOpen) return false;

        const isHorizontalGesture = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2;
        if (!isHorizontalGesture) {
          return false;
        }

        if (position === "right") {
          return gesture.dx > 8;
        }
        return gesture.dx < -8;
      },
      onPanResponderGrant: () => {
        isGestureActive.current = true;
        animation.stopAnimation((value) => {
          if (typeof value === "number") {
            startValue = value;
            animatedValueRef.current = value;
          }
        });
      },
      onPanResponderMove: (_, gesture) => {
        const gestureDistance = position === "right" ? gesture.dx : -gesture.dx;
        const dragProgress = gestureDistance / width;
        const newValue = clamp(startValue - dragProgress);

        animation.setValue(newValue);
        animatedValueRef.current = newValue;
      },
      onPanResponderRelease: (_, gesture) => {
        isGestureActive.current = false;

        const currentValue = animatedValueRef.current;
        const velocity = position === "right" ? gesture.vx : -gesture.vx;

        const draggedPastHalf = currentValue < 0.5;
        const hasSignificantVelocity = Math.abs(velocity) > 0.5;
        const velocityIndicatesClose = velocity > 0;

        let shouldClose = draggedPastHalf;

        if (hasSignificantVelocity) {
          shouldClose = velocityIndicatesClose;
        }

        if (shouldClose) {
          const duration = hasSignificantVelocity ? 200 : 250;
          animateTo(0, duration);
          onClose();
        } else {
          const duration = hasSignificantVelocity ? 200 : 250;
          animateTo(1, duration);
        }
      },
      onPanResponderTerminate: () => {
        isGestureActive.current = false;
        animateTo(isOpen ? 1 : 0);
      },
    });
  }, [animateTo, clamp, isOpen, onClose, position, width, animation]);

  return (
    <View className="flex-1" {...panResponder.panHandlers}>
      <Animated.View
        {...contentContainerProps}
        className={cn("flex-1", contentContainerProps?.className)}
        style={[
          contentContainerProps?.style,
          contentTransform ? { transform: contentTransform } : null,
        ]}
      >
        {children}
      </Animated.View>

      {isOpen && (
        <Animated.View
          pointerEvents="auto"
          style={[absoluteFill, overlayAnimatedStyle]}
        >
          <Pressable
            style={absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close sidebar"
            className="bg-background-dark dark:bg-background-dark"
          />
        </Animated.View>
      )}

      {isOpen && (
        <Animated.View
          pointerEvents="auto"
          style={[
            {
              position: "absolute",
              top: 0,
              bottom: 0,
              width,
            },
            panelPositionStyle,
            { transform: panelTransform },
          ]}
        >
          <View
            className={cn("flex-1", sidebarClassName)}
            style={{
              paddingTop: insets.top + 24,
              paddingBottom: insets.bottom + 24,
              backgroundColor: sidebarBackground,
              borderColor: sidebarBorder,
              ...borderStyle,
            }}
          >
            {sidebar}
          </View>
        </Animated.View>
      )}
    </View>
  );
};

SlidingSidebar.displayName = "SlidingSidebar";

export default SlidingSidebar;
