import React, { useState } from "react";
import { View, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "./Dialog";
import ThemedButton from "./ThemedButton";
import ThemedText from "./ThemedText";
import ThemedIcon from "./ThemedIcon";
import { useColorScheme } from "nativewind";

export type InvitePatientDialogProps = {
  /** The trigger element to open the dialog */
  trigger?: React.ReactNode;
  /** Whether the dialog is controlled externally */
  open?: boolean;
  /** Callback when dialog open state changes */
  onOpenChange?: (open: boolean) => void;
  /** The clinic link to share */
  clinicLink?: string;
  /** Callback when the invite is completed */
  onInviteComplete?: () => void;
};

const InvitePatientDialog: React.FC<InvitePatientDialogProps> = ({
  trigger,
  open,
  onOpenChange,
  clinicLink = "https://clinicez.app/invite/demo-clinic-123",
  onInviteComplete,
}) => {
  const { colorScheme } = useColorScheme();
  const [isCopying, setIsCopying] = useState(false);

  const handleCopyLink = async () => {
    try {
      setIsCopying(true);
      await Clipboard.setStringAsync(clinicLink);

      // Show success feedback
      Alert.alert(
        "Link Copied!",
        "The clinic invitation link has been copied to your clipboard.",
        [{ text: "OK", style: "default" }]
      );
    } catch (error) {
      Alert.alert(
        "Copy Failed",
        "Failed to copy the link. Please try again.",
        [{ text: "OK", style: "default" }]
      );
    } finally {
      setIsCopying(false);
    }
  };

  const handleDone = () => {
    onInviteComplete?.();
    onOpenChange?.(false);
  };

  const qrCodeColor = colorScheme === "dark" ? "#FFFFFF" : "#000000";
  const qrCodeBgColor = colorScheme === "dark" ? "#1F2937" : "#FFFFFF";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent size="lg" showCloseButton={true}>
        <DialogHeader>
          <DialogTitle>Share Clinic Link</DialogTitle>
          <DialogDescription>
            Once connected, they will appear in our patient list and can conveniently book appointments
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <View className="items-center gap-6">
            {/* QR Code Container */}
            <View className="bg-base dark:bg-surface-dark p-6 rounded-2xl border border-border dark:border-border-dark shadow-sm">
              <QRCode
                value={clinicLink}
                size={200}
                color={qrCodeColor}
                backgroundColor={qrCodeBgColor}
                quietZone={10}
              />
            </View>

            {/* Copy Link Button */}
            <ThemedButton
              variant="outline"
              className="w-full flex-row items-center justify-center gap-2 bg-accent dark:bg-accent-dark"
              onPress={handleCopyLink}
              disabled={isCopying}
            >
              <ThemedIcon
                icon={isCopying ? "check-circle" : "link"}
                size={18}
                className="text-primary dark:text-primary-dark"
              />
              <ThemedText className="font-semibold">
                {isCopying ? "Copied!" : "Copy Link"}
              </ThemedText>
            </ThemedButton>
          </View>
        </DialogBody>

        <DialogFooter orientation="horizontal">
          <DialogClose asChild>
            <ThemedButton
              variant="outline"
              className="flex-1 border-primary dark:border-primary-dark"
            >
              <ThemedText className="font-semibold">Cancel</ThemedText>
            </ThemedButton>
          </DialogClose>

          <ThemedButton
            className="flex-1"
            onPress={handleDone}
          >
            <ThemedText
              variant="button"
              className="text-primary-foreground dark:text-primary-contrast font-semibold"
            >
              Done
            </ThemedText>
          </ThemedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

InvitePatientDialog.displayName = "InvitePatientDialog";

export default InvitePatientDialog;
