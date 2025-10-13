import { getCountryByCode, type CountryCode } from './country-codes';

export interface PhoneValidationResult {
  isValid: boolean;
  message?: string;
  formattedNumber?: string;
}

const getMinDigitsByCountry = (countryCode: string): number => {
  const digitRules: Record<string, number> = {
    'US': 10,
    'CA': 10,
    'GB': 10,
    'AU': 9,
    'DE': 11,
    'FR': 10,
    'JP': 11,
    'CN': 11,
    'IN': 10,
    'BR': 11,
  };

  return digitRules[countryCode] || 7;
};

const getMaxDigitsByCountry = (countryCode: string): number => {
  const digitRules: Record<string, number> = {
    'US': 10,
    'CA': 10,
    'GB': 11,
    'AU': 9,
    'DE': 12,
    'FR': 10,
    'JP': 11,
    'CN': 11,
    'IN': 10,
    'BR': 11,
  };

  return digitRules[countryCode] || 15;
};

export const validatePhoneNumber = (
  phoneNumber: string,
  countryCode: string = 'US'
): PhoneValidationResult => {
  const country = getCountryByCode(countryCode);
  if (!country) {
    return {
      isValid: false,
      message: 'Invalid country code',
    };
  }

  const cleanNumber = phoneNumber.replace(/\D/g, '');

  if (!cleanNumber) {
    return {
      isValid: false,
      message: 'Phone number is required',
    };
  }

  const minDigits = getMinDigitsByCountry(countryCode);
  const maxDigits = getMaxDigitsByCountry(countryCode);

  if (cleanNumber.length < minDigits) {
    return {
      isValid: false,
      message: `Phone number must be at least ${minDigits} digits for ${country.name}`,
    };
  }

  if (cleanNumber.length > maxDigits) {
    return {
      isValid: false,
      message: `Phone number cannot exceed ${maxDigits} digits for ${country.name}`,
    };
  }

  return {
    isValid: true,
    formattedNumber: formatPhoneNumber(cleanNumber, countryCode),
  };
};

export const formatPhoneNumber = (phoneNumber: string, countryCode: string = 'US'): string => {
  const cleanNumber = phoneNumber.replace(/\D/g, '');

  if (countryCode === 'US' || countryCode === 'CA') {
    if (cleanNumber.length === 10) {
      return `(${cleanNumber.slice(0, 3)}) ${cleanNumber.slice(3, 6)}-${cleanNumber.slice(6)}`;
    }
  }

  return cleanNumber;
};

export const getFullPhoneNumber = (phoneNumber: string, country: CountryCode): string => {
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  return `${country.phone}${cleanNumber}`;
};