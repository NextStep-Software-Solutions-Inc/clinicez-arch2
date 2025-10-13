import React from "react";
import { View, Text } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@lib/utils";
import ThemedPicker, { type ThemedPickerProps, type PickerItem } from "./ThemedPicker";
import {
  getCountryCodes,
  getCountryByCode,
  defaultCountry,
  popularCountries,
  type CountryCode,
} from "@lib/country-codes";

const countryPickerVariants = cva(
  "min-w-28 max-w-36",
  {
    variants: {
      size: {
        sm: "min-w-24 max-w-32",
        md: "min-w-28 max-w-40",
        lg: "min-w-32 max-w-44",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export interface CountryCodePickerProps extends Omit<ThemedPickerProps, 'items' | 'selectedValue' | 'onValueChange'> {
  selectedCountryCode?: string;
  onCountryChange: (country: CountryCode) => void;
  showPopularFirst?: boolean;
}

const CountryCodePicker: React.FC<CountryCodePickerProps> = ({
  selectedCountryCode = defaultCountry.code,
  onCountryChange,
  showPopularFirst = true,
  size = 'md',
  className,
  ...props
}) => {
  const countries = React.useMemo(() => getCountryCodes(), []);
  const selectedCountry = React.useMemo(
    () => getCountryByCode(selectedCountryCode) || defaultCountry,
    [selectedCountryCode]
  );

  const getPickerItems = (): PickerItem[] => {
    if (!showPopularFirst) {
      return countries.map(country => ({
        label: `${country.emoji} ${country.name} ${country.phone}`,
        value: country.code,
      }));
    }

    const popular = popularCountries
      .map(code => getCountryByCode(code))
      .filter((country): country is CountryCode => country !== undefined);

    const remaining = countries.filter(country =>
      !popularCountries.includes(country.code)
    );

    const allCountries = [...popular, ...remaining];

    return allCountries.map(country => ({
      label: `${country.emoji} ${country.name} ${country.phone}`,
      value: country.code,
    }));
  };

  const handleValueChange = (value: string | string[]) => {
    if (typeof value === 'string') {
      const country = getCountryByCode(value);
      if (country) {
        onCountryChange(country);
      }
    }
  };

  const renderCustomDisplay = () => (
    <View className="flex-row items-center gap-2 pr-2">
      <Text className="text-lg">{selectedCountry.emoji}</Text>
      <Text className="text-base text-text dark:text-text-dark font-semibold tracking-wide">
        {selectedCountry.phone}
      </Text>
    </View>
  );

  return (
    <ThemedPicker
      items={getPickerItems()}
      selectedValue={selectedCountryCode}
      onValueChange={handleValueChange}
      placeholder="Select country"
      size={size}
      className={cn(countryPickerVariants({ size }), "px-2", className)}
      {...props}
      customDisplay={renderCustomDisplay}
    />
  );
};

export default CountryCodePicker;