import { format, isValid, parseISO, isToday } from "date-fns";

/**
 * Formats an ISO date string to YYYY-MM-DD format
 * @param dateString - ISO date string to format
 * @returns Formatted date string or original string if invalid
 */
export const formatToYYYYMMDD = (dateString: string): string => {
  if (!dateString) return "";
  const parsed = parseISO(dateString);
  if (!isValid(parsed)) return dateString;
  return format(parsed, "yyyy-MM-dd");
};

/**
 * Formats an ISO date string to human-readable format (MMM d, yyyy)
 * @param dateString - ISO date string to format
 * @returns Formatted date string or original string if invalid
 */
export const formatToReadable = (dateString: string): string => {
  if (!dateString) return "";
  const parsed = parseISO(dateString);
  if (!isValid(parsed)) return dateString;
  return format(parsed, "MMM d, yyyy");
};

/**
 * Formats an ISO date string with custom format
 * @param dateString - ISO date string to format
 * @param formatString - date-fns format string
 * @returns Formatted date string or original string if invalid
 */
export const formatDate = (dateString: string, formatString: string = "yyyy-MM-dd"): string => {
  if (!dateString) return "";
  const parsed = parseISO(dateString);
  if (!isValid(parsed)) return dateString;
  return format(parsed, formatString);
};

/**
 * Formats an appointment date string with "Today" for current date
 * @param dateString - ISO date string to format
 * @returns "Today" if date is today, otherwise formatted as "MMM. dd, yyyy"
 */
export const formatAppointmentDate = (dateString: string): string => {
  try {
    const date = parseISO(dateString);

    if (!isValid(date)) {
      return dateString;
    }

    if (isToday(date)) {
      return "Today";
    }

    return format(date, "MMM. dd, yyyy");
  } catch (error) {
    return dateString;
  }
};
