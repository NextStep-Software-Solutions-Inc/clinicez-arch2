
// Format date to mm/dd/yyyy
type DateInput = {
  toDateString: () => string;
  toISOString: () => string;
  format?: (formatString: string) => string;  // For date-fns or moment compatibility
}

export function formatDate(date: DateInput | string | null | undefined): string {
  if (!date) {
    return "";
  }

  let dateObj: Date;
  if (typeof date === "string") {
    dateObj = new Date(date);
  } else {
    dateObj = new Date(date.toISOString());
  }

  if (isNaN(dateObj.getTime())) {
    return "";
  }

  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const day = dateObj.getDate().toString().padStart(2, "0");
  const year = dateObj.getFullYear();

  return `${month}/${day}/${year}`;
}

export function formatTime(date: DateInput | string | null | undefined): string {
  if (!date) {
    return "";
  }

  let dateObj: Date;
  if (typeof date === "string") {
    dateObj = new Date(date);
  } else {
    dateObj = new Date(date.toISOString());
  }

  if (isNaN(dateObj.getTime())) {
    return "";
  }

  const hours = dateObj.getHours();
  const minutes = dateObj.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const formattedHours = (hours % 12 || 12).toString().padStart(2, "0");

  return `${formattedHours}:${minutes} ${ampm}`;
}

export function formatDateTime(date: DateInput | string | null | undefined): string {
  if (!date) {
    return "";
  }

  let dateObj: Date;
  if (typeof date === "string") {
    dateObj = new Date(date);
  } else {
    dateObj = new Date(date.toISOString());
  }

  if (isNaN(dateObj.getTime())) {
    return "";
  }

  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const day = dateObj.getDate().toString().padStart(2, "0");
  const year = dateObj.getFullYear();

  const hours = dateObj.getHours();
  const minutes = dateObj.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const formattedHours = (hours % 12 || 12).toString().padStart(2, "0");

  return `${month}/${day}/${year} ${formattedHours}:${minutes} ${ampm}`;
}

export function parseDate(dateStr: string): Date | null {
  const [month, day, year] = dateStr.split("/").map(part => parseInt(part, 10));
  if (!month || !day || !year) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  return isNaN(date.getTime()) ? null : date;
}