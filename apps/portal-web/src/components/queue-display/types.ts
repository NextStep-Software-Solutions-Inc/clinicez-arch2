export interface ServingTicket {
  queueItemId: string;
  ticketNumber: string;
  doctorName?: string | null;
  roomOrStation?: string | null;
  calledTime?: string | null;
  status: string;
}

export interface UpcomingTicket {
  queueItemId: string;
  ticketNumber: string;
  displayName: string;
  priority: 'Routine' | 'Urgent' | 'Emergency' | string;
  status: string;
  sequenceNumber: number;
  checkInTime?: string;
}

export interface PublicQueueDisplayData {
  clinicId: string;
  clinicName: string;
  tenantSlug?: string | null;
  facilitySlug?: string | null;
  logoUrl?: string | null;
  nowServing: ServingTicket[];
  upNext: UpcomingTicket[];
  maskPatientNames: boolean;
  generatedAtUtc: string;
  patientsWaitingCount: number;
}
