import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Family suffix options for profile completion
export const familySuffix = [
  "Jr.",
  "Sr.",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "MD",
  "PhD",
  "Esq",
  "DDS",
  "DVM"
] as const;

export type FamilySuffix = typeof familySuffix[number];

type Name = {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
};

export function buildFullName(name: Name): string {
  return [name.firstName, name.middleName, name.lastName, name.suffix]
    .filter(Boolean)
    .join(" ")
    .trim();
}


export function getGenderInitial(gender: string) {
  return gender.charAt(0).toUpperCase();
}

const DEFAULT_INITIALS_LENGTH = 2;

const sanitizeNameParts = (name: string) =>
  name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

const formatInitials = (parts: string[], limit: number) =>
  parts
    .slice(0, limit)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

export function getInitials(name?: string | null, email?: string | null, maxLength = DEFAULT_INITIALS_LENGTH) {
  const limit = Math.max(1, maxLength);
  const trimmedName = name?.trim();

  if (trimmedName) {
    const parts = sanitizeNameParts(trimmedName);
    if (parts.length >= 2) {
      const initials = formatInitials(parts, limit);
      if (initials) {
        return initials.slice(0, limit);
      }
    }

    if (parts.length === 1) {
      const [single] = parts;
      const initials = single.slice(0, limit).toUpperCase();
      if (initials) {
        return initials;
      }
    }
  }

  const trimmedEmail = email?.trim();
  if (trimmedEmail) {
    const initials = trimmedEmail.slice(0, limit).toUpperCase();
    if (initials) {
      return initials;
    }
  }

  return "?".repeat(Math.min(limit, DEFAULT_INITIALS_LENGTH));
}