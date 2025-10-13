import React, { useRef, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  Platform,
  Modal,
  View,
  Pressable,
  Animated,
  Easing,
  type ViewStyle,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@lib/utils";
import ThemedIcon from "./ThemedIcon";

const absoluteFill: ViewStyle = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

const datePickerVariants = cva(
  "text-base text-text dark:text-text-dark bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded px-3 py-2 flex-row items-center justify-between",
  {
    variants: {
      variant: {
        default: "border-border dark:border-border-dark",
        filled: "bg-surface dark:bg-surface-dark border border-border dark:border-border-dark",
        outlined: "bg-background dark:bg-background-dark border border-border dark:border-border-dark",
      },
      size: {
        sm: "text-sm py-2 px-2 min-h-9",
        md: "text-base py-3 px-3 min-h-12",
        lg: "text-lg py-4 px-4 min-h-14",
      },
      state: {
        default: "",
        error: "border-error dark:border-error",
        success: "border-success dark:border-success",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      state: "default",
    },
  }
);

export interface DatePickerProps extends VariantProps<typeof datePickerVariants> {
  value?: Date;
  onChange: (date: Date) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  mode?: 'date' | 'time' | 'datetime';
}

const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  className,
  variant,
  size,
  state,
  minimumDate,
  maximumDate,
  mode = 'date',
}) => {
  const [iosPickerVisible, setIosPickerVisible] = useState(false);
  const [iosTempDate, setIosTempDate] = useState<Date>(value || new Date());
  const iosSheetAnim = useRef(new Animated.Value(0)).current;
  const overlayOpacity = iosSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });
  const sheetTranslate = iosSheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [240, 0],
  });

  const presentIosPicker = () => {
    setIosTempDate(value || new Date());
    iosSheetAnim.setValue(0);
    setIosPickerVisible(true);
    Animated.timing(iosSheetAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const dismissIosPicker = (onDismissed?: () => void) => {
    Animated.timing(iosSheetAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIosPickerVisible(false);
        onDismissed?.();
      }
    });
  };

  const formatDate = (date: Date): string => {
    if (mode === 'date') {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } else if (mode === 'time') {
      return date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } else {
      return date.toLocaleString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  };

  const openPicker = () => {
    if (disabled) {
      return;
    }

    if (Platform.OS === 'ios') {
      presentIosPicker();
      return;
    }

    const initialDate = value || new Date();

    if (mode === 'datetime') {
      DateTimePickerAndroid.open({
        value: initialDate,
        onChange: (event, selectedDate) => {
          if (event.type !== 'set' || !selectedDate) {
            return;
          }

          const baseDate = new Date(selectedDate);
          const referenceTime = value || new Date();
          baseDate.setHours(referenceTime.getHours(), referenceTime.getMinutes(), referenceTime.getSeconds(), referenceTime.getMilliseconds());

          DateTimePickerAndroid.open({
            value: baseDate,
            onChange: (timeEvent, selectedTime) => {
              if (timeEvent.type === 'set' && selectedTime) {
                const combined = new Date(baseDate);
                combined.setHours(selectedTime.getHours(), selectedTime.getMinutes(), selectedTime.getSeconds(), selectedTime.getMilliseconds());
                onChange(combined);
              }
            },
            mode: 'time',
            is24Hour: true,
            display: 'clock',
          });
        },
        mode: 'date',
        minimumDate,
        maximumDate,
        display: 'calendar',
      });

      return;
    }

    DateTimePickerAndroid.open({
      value: initialDate,
      onChange: (event, selectedDate) => {
        if (event.type === 'set' && selectedDate) {
          onChange(selectedDate);
        }
      },
      mode,
      minimumDate,
      maximumDate,
      is24Hour: mode !== 'date',
      display: mode === 'date' ? 'calendar' : mode === 'time' ? 'clock' : 'default',
    });
  };

  const displayText = value ? formatDate(value) : placeholder;

  return (
    <>
      <TouchableOpacity
        className={cn(
          datePickerVariants({ variant, size, state }),
          disabled && "opacity-50",
          className
        )}
        onPress={openPicker}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text
          className={cn(
            "flex-1",
            disabled
              ? "text-muted dark:text-muted-dark"
              : value
                ? "text-text dark:text-text-dark"
                : "text-muted dark:text-muted-dark"
          )}
          numberOfLines={1}
        >
          {displayText}
        </Text>
        <ThemedIcon
          icon="calendar"
          size="sm"
          color={disabled ? "muted" : state === "error" ? "error" : "muted"}
        />
      </TouchableOpacity>
      {Platform.OS === 'ios' && (
        <Modal
          visible={iosPickerVisible}
          transparent
          animationType="none"
          presentationStyle="overFullScreen"
          onRequestClose={() => dismissIosPicker()}
        >
          <View className="flex-1 justify-end">
            <Animated.View
              pointerEvents="none"
              style={[
                absoluteFill,
                {
                  backgroundColor: '#000',
                  opacity: overlayOpacity,
                },
              ]}
            />
            <Pressable
              className="flex-1 w-full"
              onPress={() => dismissIosPicker()}
              accessibilityRole="button"
              accessibilityLabel="Dismiss date picker"
            />
            <Animated.View
              className="bg-surface-elevated dark:bg-surface-elevated-dark rounded-t-3xl p-4"
              style={{
                transform: [{ translateY: sheetTranslate }],
              }}
            >
              <View className="flex-row justify-between mb-3">
                <TouchableOpacity onPress={() => dismissIosPicker()}>
                  <Text className="text-base font-semibold text-muted dark:text-muted-dark">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => dismissIosPicker(() => onChange(iosTempDate))}
                >
                  <Text className="text-base font-semibold text-primary dark:text-primary-dark">Done</Text>
                </TouchableOpacity>
              </View>

              <DateTimePicker
                mode={mode}
                value={iosTempDate}
                onChange={(event, selectedDate) => {
                  if (event.type === 'set' && selectedDate) {
                    setIosTempDate(selectedDate);
                  }
                }}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                display="spinner"
                locale={mode === 'date' ? 'en-US' : 'en-GB'}
                style={{ alignSelf: 'center' }}
              />
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
};

export default DatePicker;