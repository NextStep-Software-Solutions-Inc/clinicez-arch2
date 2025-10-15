import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { CalendarList, DateData } from "react-native-calendars";
import { useCalendar } from "@hooks/useCalendar";
import { mockAppointmentsData } from "@data/calendar";
import { CalendarHeader } from "@components/calendar/CalendarHeader";
import { CalendarLegend } from "@components/calendar/CalendarLegend";
import { EventDisplay } from "@components/calendar/EventDisplay";

const CalendarScreen: React.FC = () => {
  // Use mock data - replace with actual data fetching later
  const appointmentsData = useMemo(() => mockAppointmentsData, []);

  const {
    isDark,
    selectedDate,
    setSelectedDate,
    currentMonth,
    setCurrentMonth,
    markedDates,
    calendarTheme,
    currentDayData,
    today,
  } = useCalendar(appointmentsData);

  const handleSchedulePress = () => {
    console.log("Schedule pressed");
  };

  const handleDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
    console.log("Selected day:", day);
  };

  const handleMonthChange = (months: DateData[]) => {
    if (months && months.length > 0) {
      const date = new Date(months[0].dateString);
      const monthName = date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
      setCurrentMonth(monthName);
    }
  };

  const handleStartConsultation = (appointmentId: string) => {
    console.log("Start consultation:", appointmentId);
  };

  const handleMakeAvailable = () => {
    console.log("Make available:", selectedDate);
  };

  const handleMakeUnavailable = () => {
    console.log("Make unavailable:", selectedDate);
  };

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <CalendarHeader
        currentMonth={currentMonth}
        onSchedulePress={handleSchedulePress}
      />

      <View style={styles.calendarContainer}>
        <CalendarList
          key={`calendar-${isDark ? 'dark' : 'light'}`}
          current={today}
          markedDates={markedDates}
          markingType="custom"
          onDayPress={handleDayPress}
          onVisibleMonthsChange={handleMonthChange}
          theme={calendarTheme}
          horizontal={true}
          pagingEnabled={true}
          pastScrollRange={12}
          futureScrollRange={12}
          hideExtraDays={true}
          firstDay={0}
          showScrollIndicator={false}
          calendarHeight={320}
          style={styles.calendar}
        />
      </View>

      <CalendarLegend />

      <EventDisplay
        dayData={currentDayData}
        selectedDate={selectedDate}
        onStartConsultation={handleStartConsultation}
        onMakeAvailable={handleMakeAvailable}
        onMakeUnavailable={handleMakeUnavailable}
      />
    </View>
  );
};

CalendarScreen.displayName = "CalendarScreen";

const styles = StyleSheet.create({
  calendarContainer: {},
  calendar: {
    backgroundColor: 'transparent',
  },
});

CalendarScreen.displayName = "CalendarScreen";

export default CalendarScreen;
