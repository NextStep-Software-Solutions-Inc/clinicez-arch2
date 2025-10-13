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

export function getGenderInitial(gender: string) {
  return gender.charAt(0).toUpperCase();
}