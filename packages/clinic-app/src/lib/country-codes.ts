import countryCodes from "../../assets/public/json/country-codes.json";

interface CountryCodeJson {
  name: string;
  region: string;
  phone: string[];
  emoji: string;
  [key: string]: unknown;
}

const rawCountryCodes = countryCodes as Record<string, CountryCodeJson>;

export interface CountryCode {
  code: string;
  name: string;
  phone: string;
  emoji: string;
  region: string;
}

const mapCountryDto = (code: string, data: CountryCodeJson): CountryCode => ({
  code,
  name: data.name,
  phone: data.phone[0],
  emoji: data.emoji,
  region: data.region,
});

export const getCountryCodes = (): CountryCode[] =>
  Object.entries(rawCountryCodes)
    .map(([code, data]) => mapCountryDto(code, data))
    .sort((a, b) => a.name.localeCompare(b.name));

export const getCountryByCode = (code: string): CountryCode | undefined => {
  const data = rawCountryCodes[code];
  if (!data) return undefined;

  return mapCountryDto(code, data);
};

export const getCountryByPhone = (phoneCode: string): CountryCode | undefined => {
  const entry = Object.entries(rawCountryCodes).find(([, data]) =>
    data.phone.includes(phoneCode)
  );

  if (!entry) return undefined;

  const [code, data] = entry;
  return mapCountryDto(code, data);
};

export const defaultCountry: CountryCode =
  getCountryByCode("PH") ?? {
    code: "PH",
    name: "Philippines",
    phone: "+63",
    emoji: "��",
    region: "Asia",
  };

export const popularCountries = [
  "PH",
  "US",
  "CA",
  "GB",
  "AU",
  "SG",
  "JP",
  "KR",
  "CN",
  "IN",
];