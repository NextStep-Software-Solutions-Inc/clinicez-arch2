import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  Dimensions,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { cva, type VariantProps } from "class-variance-authority";
import { useColorScheme } from "nativewind";
import { cn } from "@lib/utils";
import ThemedIcon from "./ThemedIcon";

export interface PickerItem {
  label: string;
  value: string;
}

const pickerVariants = cva(
  "text-base text-text dark:text-text-dark bg-surface-elevated dark:bg-surface-elevated-dark border border-border dark:border-border-dark rounded px-3 py-2",
  {
    variants: {
      variant: {
        default: "border-border dark:border-border-dark",
        filled: "bg-surface dark:bg-surface-dark border border-border dark:border-border-dark",
        outlined: "bg-surface-elevated dark:bg-surface-elevated-dark border border-border dark:border-border-dark",
      },
      size: {
        sm: "text-sm py-2 px-2 min-h-9",
        md: "text-base py-3 px-3 min-h-12",
        lg: "text-lg py-4 px-4 min-h-14",
      },
      state: {
        default: "",
        error: "border-error dark:border-error-dark",
        success: "border-success dark:border-success-dark",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      state: "default",
    },
  }
);

export interface ThemedPickerProps extends VariantProps<typeof pickerVariants> {
  items: PickerItem[];
  selectedValue?: string | string[];
  onValueChange: (value: string | string[]) => void;
  placeholder?: string;
  multiSelect?: boolean;
  disabled?: boolean;
  className?: string;
  customDisplay?: () => React.ReactNode;
}

const ThemedPicker: React.FC<ThemedPickerProps> = ({
  items,
  selectedValue,
  onValueChange,
  placeholder = "Select an option",
  multiSelect = false,
  disabled = false,
  variant,
  size,
  state,
  className,
  customDisplay,
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const { width: screenWidth } = Dimensions.get('window');
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const getDisplayText = (): string => {
    if (multiSelect) {
      const selectedArray = Array.isArray(selectedValue) ? selectedValue : [];
      if (selectedArray.length === 0) return placeholder;
      if (selectedArray.length === 1) {
        const item = items.find(item => item.value === selectedArray[0]);
        return item?.label || placeholder;
      }
      return `${selectedArray.length} items selected`;
    } else {
      const item = items.find(item => item.value === selectedValue);
      return item?.label || placeholder;
    }
  };

  const handleSingleSelect = (value: string) => {
    onValueChange(value);
    setIsModalVisible(false);
  };

  const handleMultiSelect = (value: string) => {
    const selectedArray = Array.isArray(selectedValue) ? selectedValue : [];
    let newSelection: string[];

    if (selectedArray.includes(value)) {
      newSelection = selectedArray.filter(item => item !== value);
    } else {
      newSelection = [...selectedArray, value];
    }

    onValueChange(newSelection);
  };

  const showIOSActionSheet = () => {
    const options = items.map(item => item.label);
    options.push('Cancel');

    const cancelButtonIndex = options.length - 1;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: placeholder,
      },
      (buttonIndex) => {
        if (buttonIndex !== cancelButtonIndex) {
          const selectedItem = items[buttonIndex];
          if (selectedItem) {
            handleSingleSelect(selectedItem.value);
          }
        }
      }
    );
  };

  const handlePickerPress = () => {
    if (disabled) return;

    // Use native iOS ActionSheet for single-select on iOS
    if (Platform.OS === 'ios' && !multiSelect) {
      showIOSActionSheet();
    } else {
      // Use modal for Android or multi-select
      setIsModalVisible(true);
    }
  };

  const isSelected = (value: string): boolean => {
    if (multiSelect) {
      const selectedArray = Array.isArray(selectedValue) ? selectedValue : [];
      return selectedArray.includes(value);
    }
    return selectedValue === value;
  };

  const renderItem = ({ item }: { item: PickerItem }) => {
    const selected = isSelected(item.value);

    return (
      <TouchableOpacity
        className={cn(
          "px-5 py-3 border-b border-border dark:border-border-dark",
          selected && "bg-primary-soft dark:bg-primary-soft-dark"
        )}
        onPress={() => multiSelect ? handleMultiSelect(item.value) : handleSingleSelect(item.value)}
        activeOpacity={0.7}
      >
        <View className="flex-row items-center">
          {multiSelect && (
            <View className={cn(
              "w-5 h-5 border-2 rounded mr-3 items-center justify-center",
              "border-border dark:border-border-dark",
              selected && "bg-primary dark:bg-primary-dark border-primary dark:border-primary-dark"
            )}>
              {selected && (
                <Text className="text-primary-contrast dark:text-primary-contrast-dark text-xs font-bold">✓</Text>
              )}
            </View>
          )}
          <Text className={cn(
            "text-base flex-1",
            selected
              ? "text-primary dark:text-primary-dark font-medium"
              : "text-text dark:text-text-dark"
          )}>
            {item.label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <TouchableOpacity
        className={cn(
          pickerVariants({ variant, size, state }),
          "flex-row items-center justify-between",
          disabled && "opacity-50",
          className
        )}
        onPress={handlePickerPress}
        disabled={disabled}
        activeOpacity={0.7}
      >
        {customDisplay ? (
          <View className="flex-1">
            {customDisplay()}
          </View>
        ) : (
          <Text
            className={cn(
              "flex-1",
              disabled
                ? "text-muted-foreground dark:text-muted-foreground-dark"
                : getDisplayText() === placeholder
                  ? "text-muted-foreground dark:text-muted-foreground-dark"
                  : "text-text dark:text-text-dark"
            )}
            numberOfLines={1}
            style={{
              lineHeight: undefined,
              includeFontPadding: false,
            }}
          >
            {getDisplayText()}
          </Text>
        )}
        <ThemedIcon
          icon="chevron-down"
          size="sm"
          color={disabled ? "muted" : state === "error" ? "error" : "muted"}
        />
      </TouchableOpacity>

      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center"
          onPress={() => setIsModalVisible(false)}
        >
          <View
            className="bg-surface-elevated dark:bg-surface-elevated-dark rounded-xl max-h-4/5 shadow-lg"
            style={{ width: Math.min(screenWidth - 40, 400) }}
          >
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-border dark:border-border-dark">
              <Text className="text-lg font-semibold text-text dark:text-text-dark">
                {multiSelect ? 'Select Options' : 'Select Option'}
              </Text>
              <TouchableOpacity
                onPress={() => setIsModalVisible(false)}
                className="p-1"
              >
                <Text className="text-lg text-muted dark:text-muted-dark">✕</Text>
              </TouchableOpacity>
            </View>

            <View className="max-h-96 min-h-24">
              <FlatList
                data={items}
                renderItem={renderItem}
                keyExtractor={(item) => item.value}
                className="flex-grow-0 max-h-96"
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                bounces={true}
                alwaysBounceVertical={false}
                contentContainerStyle={{ flexGrow: 1 }}
              />
            </View>

            {multiSelect && (
              <View className="px-5 py-4 border-t border-border dark:border-border-dark">
                <TouchableOpacity
                  className="bg-primary dark:bg-primary-dark py-3 px-6 rounded-lg items-center"
                  onPress={() => setIsModalVisible(false)}
                >
                  <Text className="text-primary-contrast dark:text-primary-contrast-dark text-base font-semibold">
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
};



export default ThemedPicker;
export { ThemedPicker };