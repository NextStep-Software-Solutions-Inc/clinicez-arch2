/**
 * Date utility helpers for form validation and date manipulation
 */

/**
 * Creates a date representing the start of today
 * @returns Date object with hours set to 00:00:00
 */
export const getTodayStartOfDay = (): Date => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

/**
 * Creates a date representing the end of today
 * @returns Date object with hours set to 23:59:59
 */
export const getTodayEndOfDay = (): Date => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
};

/**
 * Creates a date in the past by subtracting years from today
 * @param years - Number of years to subtract
 * @returns Date object representing years ago from today
 */
export const getYearsAgo = (years: number): Date => {
  const today = new Date();
  return new Date(today.getFullYear() - years, today.getMonth(), today.getDate());
};

/**
 * Creates a date in the future by adding years to today
 * @param years - Number of years to add
 * @returns Date object representing years from now
 */
export const getYearsFromNow = (years: number): Date => {
  const today = new Date();
  return new Date(today.getFullYear() + years, today.getMonth(), today.getDate());
};

/**
 * Creates age cutoff date for minimum age validation
 * @param minimumAge - Minimum age in years
 * @returns Date representing the cutoff date
 */
export const createAgeCutoffDate = (minimumAge: number): Date => {
  return getYearsAgo(minimumAge);
};

/**
 * Validates if a date is in the past or today
 * @param date - Date to validate
 * @returns True if date is past or today, false otherwise
 */
export const isPastOrToday = (date: Date): boolean => {
  const today = getTodayStartOfDay();
  const candidate = new Date(date);
  candidate.setHours(0, 0, 0, 0);
  return candidate <= today;
};

/**
 * Validates if a date is in the future (after today)
 * @param date - Date to validate
 * @returns True if date is in the future, false otherwise
 */
export const isFutureDate = (date: Date): boolean => {
  const today = getTodayStartOfDay();
  const candidate = new Date(date);
  candidate.setHours(0, 0, 0, 0);
  return candidate > today;
};

/**
 * Validates if a date is today or in the future
 * @param date - Date to validate
 * @returns True if date is today or future, false otherwise
 */
export const isTodayOrFuture = (date: Date): boolean => {
  const today = getTodayStartOfDay();
  const candidate = new Date(date);
  candidate.setHours(0, 0, 0, 0);
  return candidate >= today;
};

/**
 * Checks if a date meets minimum age requirement
 * @param dateOfBirth - Date of birth to check
 * @param minimumAge - Minimum required age
 * @returns True if age requirement is met, false otherwise
 */
export const meetsMinimumAge = (dateOfBirth: Date, minimumAge: number): boolean => {
  const cutoff = createAgeCutoffDate(minimumAge);
  cutoff.setHours(0, 0, 0, 0);
  const candidate = new Date(dateOfBirth);
  candidate.setHours(0, 0, 0, 0);
  return candidate <= cutoff;
};

/**
 * Calculates age from date of birth
 * @param dateOfBirth - Date of birth
 * @returns Age in years
 */
export const calculateAge = (dateOfBirth: Date): number => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

/**
 * Sets minimum date for date pickers (e.g., 120 years ago)
 * @param yearsAgo - Number of years to go back
 * @returns Date object representing the minimum selectable date
 */
export const getMinimumSelectableDate = (yearsAgo: number = 120): Date => {
  return getYearsAgo(yearsAgo);
};

/**
 * Sets maximum date for date pickers (e.g., 100 years from now)
 * @param yearsFromNow - Number of years into the future
 * @returns Date object representing the maximum selectable date
 */
export const getMaximumSelectableDate = (yearsFromNow: number = 100): Date => {
  return getYearsFromNow(yearsFromNow);
};
