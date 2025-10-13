import React from 'react';
import { View } from 'react-native';
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@lib/utils";
import { ThemedInput, type ThemedInputProps } from './ThemedInput';
import CountryCodePicker from './CountryCodePicker';
import { defaultCountry, type CountryCode } from '@lib/country-codes';
import { formatPhoneNumber } from '@lib/phone-validation';

const phoneInputVariants = cva(
  "flex-row items-stretch gap-2",
  {
    variants: {
      size: {
        sm: "gap-1",
        md: "gap-2",
        lg: "gap-3",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export interface PhoneInputProps extends Omit<ThemedInputProps, 'leftIcon'>, VariantProps<typeof phoneInputVariants> {
  countryCode?: string;
  onCountryChange?: (country: CountryCode) => void;
  containerClassName?: string;
  showCountryPicker?: boolean;
  autoFormat?: boolean;
}

const PhoneInput: React.FC<PhoneInputProps> = ({
  countryCode = defaultCountry.code,
  onCountryChange,
  containerClassName,
  showCountryPicker = true,
  autoFormat = true,
  variant = "outlined",
  size = "md",
  state,
  className,
  onChangeText,
  ...inputProps
}) => {
  const handleCountryChange = (country: CountryCode) => {
    onCountryChange?.(country);
  };

  const handleTextChange = (text: string) => {
    if (autoFormat && onChangeText) {
      const formatted = formatPhoneNumber(text, countryCode);
      onChangeText(formatted);
    } else {
      onChangeText?.(text);
    }
  };

  if (!showCountryPicker) {
    return (
      <ThemedInput
        variant={variant}
        size={size}
        state={state}
        className={className}
        keyboardType="phone-pad"
        autoComplete="tel"
        onChangeText={handleTextChange}
        {...inputProps}
      />
    );
  }

  return (
    <View className={cn(phoneInputVariants({ size }), containerClassName)}>
      <CountryCodePicker
        selectedCountryCode={countryCode}
        onCountryChange={handleCountryChange}
        variant={variant}
        size={size}
        state={state}
      />
      <ThemedInput
        variant={variant}
        size={size}
        state={state}
        className={cn("flex-1", className)}
        keyboardType="phone-pad"
        autoComplete="tel"
        onChangeText={handleTextChange}
        {...inputProps}
      />
    </View>
  );
};

export default PhoneInput;