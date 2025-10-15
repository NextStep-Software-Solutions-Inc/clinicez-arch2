import type { DayData } from "../types/calendar";

// Mock appointment data - replace with actual data fetching
export const mockAppointmentsData: Record<string, DayData> = {
  "2025-10-15": {
    status: "fullyBooked",
    appointments: [
      {
        id: "1",
        patientName: "John Doe",
        service: "General Checkup",
        mode: "In-Person",
        duration: "30 mins",
        timeRange: "10:30 AM - 11:00 AM",
      },
      {
        id: "2",
        patientName: "Jane Smith",
        service: "Follow-up",
        mode: "Virtual",
        duration: "1 hr",
        timeRange: "2:00 PM - 3:00 PM",
      },
    ],
  },
  "2025-10-18": {
    status: "fullyBooked",
    appointments: [
      {
        id: "3",
        patientName: "Mike Johnson",
        service: "Consultation",
        mode: "In-Person",
        duration: "45 mins",
        timeRange: "9:00 AM - 9:45 AM",
      },
    ],
  },
  "2025-10-20": {
    status: "unavailable",
  },
  "2025-10-25": {
    status: "fullyBooked",
    appointments: [
      {
        id: "4",
        patientName: "Sarah Williams",
        service: "Lab Review",
        mode: "Virtual",
        duration: "30 mins",
        timeRange: "11:00 AM - 11:30 AM",
      },
    ],
  },
};
