import type { DayData, Appointment } from "../types/calendar";
import { mockAppointmentsData as appointments } from "./appointments";

const convertToCalendarAppointment = (apt: typeof appointments[0]): Appointment => {
  const patientName = `${apt.patient.name.firstName} ${apt.patient.name.lastName}`;
  const timeRange = `${apt.startTime} - ${apt.endTime}`;

  return {
    id: apt.id.toString(),
    patientName,
    service: apt.service.name,
    mode: apt.mode.name as "In-Person" | "Virtual",
    duration: "",
    timeRange,
  };
};

export const mockCalendarData: Record<string, DayData> = appointments.reduce((acc, apt) => {
  const date = apt.appointmentDate;

  if (!acc[date]) {
    acc[date] = {
      status: "fullyBooked",
      appointments: [],
    };
  }

  acc[date].appointments = acc[date].appointments || [];
  acc[date].appointments.push(convertToCalendarAppointment(apt));

  return acc;
}, {} as Record<string, DayData>);

mockCalendarData["2025-10-20"] = {
  status: "unavailable",
};
