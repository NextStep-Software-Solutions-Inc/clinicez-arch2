import type { AppointmentItem, AppointmentStatus } from '../../services/clinicService';

export type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

export type ClinicalUrgency = 'STAT' | 'Urgent' | 'Routine';

export type CalendarUrgency =
  | 'emergency'
  | 'urgent'
  | 'routine'
  | 'checkedIn'
  | 'completed'
  | 'cancelled';

export interface ExtendedAppointmentItem extends AppointmentItem {
  urgency?: ClinicalUrgency;
  roomName?: string;
}

export interface CalendarTimeSlot {
  timeStr: string; // "07:00", "07:30", etc.
  hour: number;
  minute: number;
}

export interface CalendarMonthCell {
  date: Date;
  dateString: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  appointments: ExtendedAppointmentItem[];
}

export interface CalendarWeekDayColumn {
  date: Date;
  dateString: string; // YYYY-MM-DD
  dayName: string;   // 'Sun', 'Mon', etc.
  isToday: boolean;
  appointments: ExtendedAppointmentItem[];
}

export interface DoctorShiftOverlay {
  doctorId: string;
  doctorName: string;
  isOnDuty: boolean;
  shiftStart: string; // e.g. "08:00"
  shiftEnd: string;   // e.g. "17:00"
  breaks: Array<{ start: string; end: string; description: string }>;
  leave?: { type: string; reason: string };
  roomName?: string;
}

export type SlotAvailabilityStatus = 'Available' | 'Break' | 'Leave' | 'OffDuty';

export interface SlotAvailabilityResult {
  isAvailable: boolean;
  status: SlotAvailabilityStatus;
  reason?: string;
}

export interface CalendarViewProps {
  currentDate: Date;
  appointments: ExtendedAppointmentItem[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onSelectDate: (date: Date) => void;
  onSelectSlot?: (date: Date, timeStr: string, doctorId?: string) => void;
  onSelectAppointment: (appointment: ExtendedAppointmentItem) => void;
  activeDoctorId?: string;
  doctorOverlays?: DoctorShiftOverlay[];
  onCheckIn?: (appointment: ExtendedAppointmentItem) => void;
  onReschedule?: (appointment: ExtendedAppointmentItem) => void;
  onCancel?: (appointment: ExtendedAppointmentItem) => void;
  onViewModeChange?: (mode: CalendarViewMode) => void;
}

export interface CalendarHeaderProps {
  viewMode: CalendarViewMode;
  currentDate: Date;
  title?: string;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelectDate?: (date: Date) => void;
  activeDoctorId?: string;
  onDoctorChange?: (doctorId: string | undefined) => void;
  doctors?: Array<{ id: string; name: string }>;
}
