
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@lib/utils";
import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import { getThemeColor } from "@theme/colors";

type DialogContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be used within a Dialog provider");
  }
  return context;
};

export type DialogProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
};

const Dialog: React.FC<DialogProps> = ({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(newOpen);
      }
      onOpenChange?.(newOpen);
    },
    [isControlled, onOpenChange]
  );

  const value = useMemo(
    () => ({
      open,
      onOpenChange: handleOpenChange,
    }),
    [open, handleOpenChange]
  );

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
};
Dialog.displayName = "Dialog";

export type DialogTriggerProps = {
  asChild?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onPress?: () => void;
};

const DialogTrigger: React.FC<DialogTriggerProps> = ({
  asChild = false,
  children,
  onPress,
  ...props
}) => {
  const { onOpenChange } = useDialog();

  const handlePress = useCallback(() => {
    onOpenChange(true);
    onPress?.();
  }, [onOpenChange, onPress]);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onPress?: () => void }>, {
      onPress: handlePress,
      ...props,
    });
  }

  return (
    <Pressable onPress={handlePress} {...props}>
      {children}
    </Pressable>
  );
};
DialogTrigger.displayName = "DialogTrigger";

const contentVariants = cva(
  "rounded-2xl border overflow-hidden max-w-full",
  {
    variants: {
      size: {
        sm: "w-full max-w-[280px]",
        md: "w-full max-w-[360px]",
        lg: "w-full max-w-[440px]",
        xl: "w-full max-w-[520px]",
        full: "w-[90%] max-h-[85%]",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export type DialogContentProps = {
  size?: "sm" | "md" | "lg" | "xl" | "full";
  showCloseButton?: boolean;
  closeOnOverlayPress?: boolean;
  animationType?: "none" | "fade" | "scale";
  children: React.ReactNode;
};

const DialogContent: React.FC<DialogContentProps> = ({
  children,
  showCloseButton = true,
  closeOnOverlayPress = true,
  animationType = "fade",
  size = "md",
}) => {
  const { open, onOpenChange } = useDialog();
  const [modalVisible, setModalVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const isAnimatingRef = useRef(false);
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();

  const backdropColor = useMemo(
    () => getThemeColor("backgroundDark", colorScheme === "dark" ? "light" : "dark"),
    [colorScheme]
  );

  const animateIn = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    if (animationType === "none") {
      fadeAnim.setValue(1);
      scaleAnim.setValue(1);
      isAnimatingRef.current = false;
      return;
    }

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 10,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isAnimatingRef.current = false;
    });
  }, [fadeAnim, scaleAnim, animationType]);

  const animateOut = useCallback(
    (callback?: () => void) => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;

      if (animationType === "none") {
        fadeAnim.setValue(0);
        scaleAnim.setValue(0.95);
        isAnimatingRef.current = false;
        callback?.();
        return;
      }

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 150,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => {
        isAnimatingRef.current = false;
        callback?.();
      });
    },
    [fadeAnim, scaleAnim, animationType]
  );

  const handleClose = useCallback(() => {
    animateOut(() => {
      setModalVisible(false);
      onOpenChange(false);
    });
  }, [animateOut, onOpenChange]);

  useEffect(() => {
    if (open) {
      setModalVisible(true);
      requestAnimationFrame(() => {
        animateIn();
      });
    } else if (modalVisible) {
      handleClose();
    }
  }, [open]);

  const handleOverlayPress = useCallback(() => {
    if (closeOnOverlayPress) {
      handleClose();
    }
  }, [closeOnOverlayPress, handleClose]);

  if (!open && !modalVisible) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
      accessible
      accessibilityLabel="Dialog"
      accessibilityViewIsModal
    >
      <View className="flex-1 items-center justify-center px-6" style={{ paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }}>
        <Animated.View
          className="absolute inset-0"
          style={{
            backgroundColor: backdropColor,
            opacity: fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.65],
            }),
          }}
        >
          <Pressable
            className="flex-1"
            onPress={handleOverlayPress}
            accessible={false}
          />
        </Animated.View>

        <Animated.View
          className={cn(
            "w-full shadow-2xl border border-border dark:border-border-dark bg-base dark:bg-background-dark",
            contentVariants({ size })
          )}
          style={{
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          }}
        >
          {showCloseButton && (
            <Pressable
              onPress={handleClose}
              className="absolute top-4 right-4 z-10 h-8 w-8 items-center justify-center"
              accessibilityLabel="Close dialog"
              accessibilityRole="button"
            >
              <ThemedIcon icon="x" size="md" color="primary" />
            </Pressable>
          )}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};
DialogContent.displayName = "DialogContent";

export type DialogHeaderProps = ViewProps & {
  children: React.ReactNode;
};

const DialogHeader: React.FC<DialogHeaderProps> = ({ children, className, ...props }) => {
  return (
    <View
      className={cn("px-6 pt-6 pb-4 gap-2", className)}
      {...props}
    >
      {children}
    </View>
  );
};
DialogHeader.displayName = "DialogHeader";

export type DialogTitleProps = ViewProps & {
  children: React.ReactNode;
};

const DialogTitle: React.FC<DialogTitleProps> = ({ children, className, ...props }) => {
  return (
    <View {...props}>
      <ThemedText
        variant="header"
        className={cn("text-2xl font-semibold", className)}
      >
        {children}
      </ThemedText>
    </View>
  );
};
DialogTitle.displayName = "DialogTitle";

export type DialogDescriptionProps = ViewProps & {
  children: React.ReactNode;
};

const DialogDescription: React.FC<DialogDescriptionProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <View {...props}>
      <ThemedText
        variant="body"
        className={cn("text-muted dark:text-muted-dark", className)}
      >
        {children}
      </ThemedText>
    </View>
  );
};
DialogDescription.displayName = "DialogDescription";

export type DialogBodyProps = ViewProps & {
  children: React.ReactNode;
};

const DialogBody: React.FC<DialogBodyProps> = ({ children, className, ...props }) => {
  return (
    <View className={cn("px-6 py-4", className)} {...props}>
      {children}
    </View>
  );
};
DialogBody.displayName = "DialogBody";

export type DialogFooterProps = ViewProps & {
  children: React.ReactNode;
  orientation?: "horizontal" | "vertical";
};

const DialogFooter: React.FC<DialogFooterProps> = ({
  children,
  orientation = "horizontal",
  className,
  ...props
}) => {
  return (
    <View
      className={cn(
        "px-6 pb-6 pt-4 gap-3",
        orientation === "horizontal" ? "flex-row" : "flex-col",
        className
      )}
      {...props}
    >
      {children}
    </View>
  );
};
DialogFooter.displayName = "DialogFooter";

export type DialogCloseProps = PressableProps & {
  asChild?: boolean;
  children: React.ReactNode;
};

const DialogClose: React.FC<DialogCloseProps> = ({
  asChild = false,
  children,
  onPress,
  ...props
}) => {
  const { onOpenChange } = useDialog();

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      onOpenChange(false);
      onPress?.(event);
    },
    [onOpenChange, onPress]
  );

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onPress?: (event: GestureResponderEvent) => void }>, {
      onPress: handlePress,
      ...props,
    });
  }

  return (
    <Pressable onPress={handlePress} {...props}>
      {children}
    </Pressable>
  );
};
DialogClose.displayName = "DialogClose";

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
};