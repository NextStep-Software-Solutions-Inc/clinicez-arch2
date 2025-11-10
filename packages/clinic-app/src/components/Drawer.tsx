import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  View,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { cn } from "@lib/utils";
import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import { getThemeColor } from "@theme/colors";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type DrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  showCloseButton?: boolean;
  maxHeight?: number;
  className?: string;
};

const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  children,
  title,
  description,
  showCloseButton = false,
  maxHeight = SCREEN_HEIGHT * 0.9,
  className,
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const isAnimatingRef = useRef(false);
  const dragPositionRef = useRef(0);
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const SWIPE_THRESHOLD = 50;

  const animateIn = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      isAnimatingRef.current = false;
    });
  }, [slideAnim, fadeAnim]);

  const animateOut = useCallback((callback?: () => void) => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      isAnimatingRef.current = false;
      if (callback) callback();
    });
  }, [slideAnim, fadeAnim]);

  const handleClose = useCallback(() => {
    animateOut(() => {
      setModalVisible(false);
      onClose();
    });
  }, [animateOut, onClose]);

  useEffect(() => {
    if (isOpen) {
      setModalVisible(true);
      requestAnimationFrame(() => {
        animateIn();
      });
    } else if (modalVisible) {
      handleClose();
    }
  }, [isOpen]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [maxHeight, 0],
  });

  /**
   * PanResponder for the drag handle area only (not the entire modal content)
   * This prevents accidental modal dismissal when scrolling form content.
   * Only the top drag indicator responds to swipe-to-dismiss gestures.
   */
  const handlePanResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to significant vertical movement
        const isVerticalSwipe = Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.5;
        return isVerticalSwipe && Math.abs(gestureState.dy) > 5;
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: () => {
        dragPositionRef.current = 0;
        slideAnim.stopAnimation();
        fadeAnim.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          dragPositionRef.current = gestureState.dy;
          const progress = Math.max(0, Math.min(1, gestureState.dy / maxHeight));
          slideAnim.setValue(1 - progress);
          fadeAnim.setValue(1 - progress * 0.5);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldClose = gestureState.dy > SWIPE_THRESHOLD || gestureState.vy > 0.5;

        if (shouldClose) {
          handleClose();
        } else {
          animateIn();
        }

        dragPositionRef.current = 0;
      },
      onPanResponderTerminate: () => {
        animateIn();
        dragPositionRef.current = 0;
      },
    });
  }, [slideAnim, fadeAnim, maxHeight, handleClose, animateIn]);

  const backdropOpacity = fadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  const backgroundColor = getThemeColor("background", isDark ? "dark" : "light");
  const borderColor = getThemeColor("border", isDark ? "dark" : "light");

  if (!modalVisible) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View className="flex-1">
        <Animated.View
          className="absolute inset-0 bg-background-dark dark:bg-background-dark"
          style={{ opacity: backdropOpacity }}
        >
          <Pressable
            className="flex-1"
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close drawer"
          />
        </Animated.View>

        <Animated.View
          className={cn("absolute bottom-0 left-0 right-0 rounded-t-3xl", className)}
          style={{
            transform: [{ translateY }],
            maxHeight,
            backgroundColor,
            borderTopWidth: 1,
            borderTopColor: borderColor,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          {/* Drag Handle - Only this area can close the modal via swipe */}
          <View
            className="items-center py-3"
            {...handlePanResponder.panHandlers}
          >
            <View
              className="h-1.5 w-12 rounded-full bg-muted dark:bg-muted-dark"
            />
          </View>

          {(title || description) && (
            <View className="px-6 pb-4">
              {title && (
                <ThemedText variant="header" className="text-xl font-semibold">
                  {title}
                </ThemedText>
              )}
              {description && (
                <ThemedText variant="body" className="mt-1 text-muted-foreground dark:text-muted-foreground-dark">
                  {description}
                </ThemedText>
              )}
            </View>
          )}

          <View
            className="flex-1"
            style={{ paddingBottom: insets.bottom + 24 }}
          >
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

Drawer.displayName = "Drawer";

type DrawerTriggerProps = ViewProps & {
  onPress: () => void;
  children: React.ReactNode;
};

const DrawerTrigger: React.FC<DrawerTriggerProps> = ({ onPress, children, ...props }) => {
  return (
    <Pressable onPress={onPress} {...props}>
      {children}
    </Pressable>
  );
};

DrawerTrigger.displayName = "DrawerTrigger";

export { Drawer, DrawerTrigger };
export default Drawer;
