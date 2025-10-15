export type AppointmentMode = "In-Person" | "Virtual";

export type Appointment = {
  id: string;
  patientName: string;
  service: string;
  mode: AppointmentMode;
  duration: string;
  timeRange: string;
};

export type DayStatus = "fullyBooked" | "unavailable" | "noBookings";

export type DayData = {
  status: DayStatus;
  appointments?: Appointment[];
};

export type CalendarMarking = {
  selected: boolean;
  selectedColor: string;
  selectedTextColor: string;
  customStyles?: {
    container: {
      backgroundColor: string;
      borderWidth: number;
      borderColor: string;
      borderRadius: number;
    };
    text: {
      color: string;
    };
  };
};
