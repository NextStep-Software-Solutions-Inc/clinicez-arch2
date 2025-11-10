import {
  Modal,
  type ModalProps,
  Pressable,
  type PressableProps,
  View,
  type ViewProps,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
  type GestureResponderEvent,
} from "react-native";
import {
  createContext,
  useContext,
  useState,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";
import { cn } from "@lib/utils";
import ThemedText, { type ThemedTextProps } from "@components/ThemedText";

interface DialogContextType {
  isVisible: boolean;
  onClose: () => void;
  onOpen: () => void;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

const useDialogContext = (): DialogContextType => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be used within a Dialog provider");
  }
  return context;
};

interface DialogProps {
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

const Dialog = ({ children, defaultOpen = false, open, onOpenChange }: DialogProps): ReactElement => {
  const [internalOpen, setInternalOpen] = useState<boolean>(defaultOpen);
  const isControlled = open !== undefined;
  const isVisible = isControlled ? open : internalOpen;

  const onOpen = (): void => {
    if (!isControlled) setInternalOpen(true);
    onOpenChange?.(true);
  };

  const onClose = (): void => {
    if (!isControlled) setInternalOpen(false);
    onOpenChange?.(false);
  };

  return (
    <DialogContext.Provider value={{ isVisible, onClose, onOpen }}>
      {children}
    </DialogContext.Provider>
  );
};

interface DialogTriggerProps extends Omit<PressableProps, "children"> {
  children: ReactNode;
  asChild?: boolean;
}

const DialogTrigger = ({ children, asChild = false, onPress, ...props }: DialogTriggerProps): ReactElement => {
  const { onOpen } = useDialogContext();

  const handlePress = (event: GestureResponderEvent): void => {
    onOpen();
    onPress?.(event);
  };

  if (asChild && isValidElement(children)) {
    const childProps = children.props as any;
    return cloneElement(children, {
      ...childProps,
      onPress: (event: GestureResponderEvent) => {
        handlePress(event);
        // Call the original onPress if it exists
        if (typeof childProps.onPress === 'function') {
          childProps.onPress(event);
        }
      },
    });
  }

  return (
    <Pressable onPress={handlePress} hitSlop={8} accessible accessibilityRole="button" accessibilityLabel="Open dialog" {...props}>
      {children}
    </Pressable>
  );
};

interface DialogOverlayProps extends ViewProps {
  visible?: boolean;
  onPress?: () => void;
}

const DialogOverlay = ({ visible = true, onPress, className, style, ...props }: DialogOverlayProps): ReactElement | null => {
  if (!visible) return null;
  return (
    <TouchableWithoutFeedback onPress={onPress}>
      <View className={cn("absolute inset-0 bg-black/50", className)} style={[styles.overlay, style]} {...props} />
    </TouchableWithoutFeedback>
  );
};

interface DialogContentProps extends Omit<ModalProps, "visible" | "onRequestClose"> {
  children: ReactNode;
  className?: string;
  style?: ViewProps["style"];
  dismissOnBackdropPress?: boolean;
  showOverlay?: boolean;
}

const DialogContent = ({
  children,
  className,
  style,
  transparent = true,
  animationType = "fade",
  dismissOnBackdropPress = true,
  showOverlay = true,
  statusBarTranslucent = true,
  ...props
}: DialogContentProps): ReactElement | null => {
  const { isVisible, onClose } = useDialogContext();

  if (!isVisible) return null;

  const handleBackdropPress = (): void => {
    if (dismissOnBackdropPress) onClose();
  };

  return (
    <Modal
      visible={isVisible}
      transparent={transparent}
      animationType={animationType}
      onRequestClose={onClose}
      statusBarTranslucent={statusBarTranslucent}
      accessibilityViewIsModal
      presentationStyle={transparent ? "overFullScreen" : "pageSheet"}
      {...props}
    >
      <View style={styles.modalContainer}>
        {showOverlay && <DialogOverlay visible={isVisible} onPress={handleBackdropPress} />}
        <View style={[styles.dialogWrapper]} pointerEvents="box-none">
          <View
            className={cn("bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden", className)}
            style={[styles.dialog, style]}
            accessible
            accessibilityViewIsModal
          >
            {children}
          </View>
        </View>
      </View>
    </Modal>
  );
};

interface DialogHeaderProps extends ViewProps {
  children: ReactNode;
  className?: string;
}

const DialogHeader = ({ children, className, ...props }: DialogHeaderProps): ReactElement => {
  return (
    <View className={cn("px-6 pt-6 pb-4 flex-col gap-2", className)} {...props}>
      {children}
    </View>
  );
};

interface DialogTitleProps extends ThemedTextProps {
  children: ReactNode;
  className?: string;
}

const DialogTitle = ({ children, className, ...props }: DialogTitleProps): ReactElement => {
  return (
    <ThemedText className={cn("text-2xl font-bold text-gray-900 dark:text-white", className)} accessible accessibilityRole="header" {...props}>
      {children}
    </ThemedText>
  );
};

interface DialogDescriptionProps extends ThemedTextProps {
  children: ReactNode;
  className?: string;
}

const DialogDescription = ({ children, className, ...props }: DialogDescriptionProps): ReactElement => {
  return (
    <ThemedText className={cn("text-base text-gray-600 dark:text-gray-400", className)} {...props}>
      {children}
    </ThemedText>
  );
};

interface DialogFooterProps extends ViewProps {
  children: ReactNode;
  className?: string;
}

const DialogFooter = ({ children, className, ...props }: DialogFooterProps): ReactElement => {
  return (
    <View className={cn("px-6 pb-6 pt-4 flex-row justify-end items-center gap-3", className)} {...props}>
      {children}
    </View>
  );
};

interface DialogCloseProps extends Omit<PressableProps, "onPress"> {
  children?: ReactNode;
  asChild?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
}

const DialogClose = ({ children, asChild = false, onPress, ...props }: DialogCloseProps): ReactElement => {
  const { onClose } = useDialogContext();

  const handlePress = (event: GestureResponderEvent): void => {
    onClose();
    onPress?.(event);
  };

  if (asChild && isValidElement(children)) {
    const childProps = children.props as any;
    return cloneElement(children, {
      ...childProps,
      onPress: (event: GestureResponderEvent) => {
        handlePress(event);
        // Call the original onPress if it exists
        if (typeof childProps.onPress === 'function') {
          childProps.onPress(event);
        }
      },
    });
  }

  return (
    <Pressable onPress={handlePress} hitSlop={8} accessible accessibilityRole="button" accessibilityLabel="Close dialog" {...props}>
      {children || (
        <View className="py-2 px-4 bg-gray-200 dark:bg-gray-700 rounded-lg">
          <ThemedText className="text-gray-900 dark:text-white font-semibold">Close</ThemedText>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  modalContainer: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  dialogWrapper: { flex: 1, justifyContent: "center", alignItems: "center" },
  dialog: {
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
      android: { elevation: 24 },
    }),
  },
});

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogOverlay };

export type {
  DialogProps,
  DialogTriggerProps,
  DialogContentProps,
  DialogHeaderProps,
  DialogTitleProps,
  DialogDescriptionProps,
  DialogFooterProps,
  DialogCloseProps,
  DialogOverlayProps,
};
