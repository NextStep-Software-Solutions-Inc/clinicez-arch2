import { useMemo, useState } from "react";
import { useColorScheme } from "nativewind";
import { getThemeColor } from "@theme/colors";
import type { DayData, CalendarMarking } from "../types/calendar";

export const useCalendar = (appointmentsData: Record<string, DayData>) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const initialMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const [currentMonth, setCurrentMonth] = useState(initialMonth);

  const getStatusColors = (status: DayData["status"]) => {
    const colorMap = {
      fullyBooked: {
        background: getThemeColor("pastelGreen", isDark ? "dark" : "light"),
        border: getThemeColor("pastelGreenBorder", isDark ? "dark" : "light"),
      },
      unavailable: {
        background: getThemeColor("pastelPink", isDark ? "dark" : "light"),
        border: getThemeColor("pastelPinkBorder", isDark ? "dark" : "light"),
      },
      noBookings: {
        background: getThemeColor("lightGray", isDark ? "dark" : "light"),
        border: getThemeColor("lightGrayBorder", isDark ? "dark" : "light"),
      },
    };

    return colorMap[status];
  };

  const createMarking = (
    color: string,
    borderColor: string,
    isSelected: boolean
  ): CalendarMarking => {
    const baseMarking: CalendarMarking = {
      selected: true,
      selectedColor: color,
      selectedTextColor: getThemeColor("text", isDark ? "dark" : "light"),
    };

    if (isSelected) {
      baseMarking.customStyles = {
        container: {
          backgroundColor: color,
          borderWidth: 2,
          borderColor: borderColor,
          borderRadius: 8,
        },
        text: {
          color: getThemeColor("text", isDark ? "dark" : "light"),
        },
      };
    }

    return baseMarking;
  };

  const markedDates = useMemo(() => {
    const marked: Record<string, CalendarMarking> = {};

    Object.entries(appointmentsData).forEach(([date, dayData]) => {
      const { background, border } = getStatusColors(dayData.status);
      const isSelected = date === selectedDate;
      marked[date] = createMarking(background, border, isSelected);
    });

    if (selectedDate && !marked[selectedDate]) {
      const { background, border } = getStatusColors("noBookings");
      marked[selectedDate] = createMarking(background, border, true);
    }

    return marked;
  }, [isDark, appointmentsData, selectedDate]);

  const calendarTheme = useMemo(() => {
    const bgColor = isDark ? '#0F172A' : '#F8FAFC';
    return {
      backgroundColor: bgColor,
      calendarBackground: bgColor,
      textSectionTitleColor: getThemeColor("textSecondary", isDark ? "dark" : "light"),
      selectedDayBackgroundColor: getThemeColor("primary", isDark ? "dark" : "light"),
      selectedDayTextColor: getThemeColor("text", isDark ? "dark" : "light"),
      todayTextColor: getThemeColor("primary", isDark ? "dark" : "light"),
      dayTextColor: getThemeColor("text", isDark ? "dark" : "light"),
      textDisabledColor: getThemeColor("muted", isDark ? "dark" : "light"),
      arrowColor: getThemeColor("primary", isDark ? "dark" : "light"),
      monthTextColor: getThemeColor("text", isDark ? "dark" : "light"),
      indicatorColor: getThemeColor("primary", isDark ? "dark" : "light"),
      textDayFontSize: 16,
      textMonthFontSize: 0,
      textDayHeaderFontSize: 14,
      textDayFontWeight: "400" as const,
      textMonthFontWeight: "bold" as const,
      textDayHeaderFontWeight: "600" as const,
      'stylesheet.day.basic': {
        selected: {
          borderRadius: 8,
        },
      },
      'stylesheet.calendar.header': {
        monthText: {
          fontSize: 0,
          height: 0,
          margin: 0,
        },
        week: {
          marginTop: 0,
          flexDirection: 'row' as const,
          justifyContent: 'space-around' as const,
        },
      },
    };
  }, [isDark]);

  const currentDayData = appointmentsData[selectedDate] || { status: "noBookings" as const };

  return {
    isDark,
    selectedDate,
    setSelectedDate,
    currentMonth,
    setCurrentMonth,
    markedDates,
    calendarTheme,
    currentDayData,
    today,
  };
};
