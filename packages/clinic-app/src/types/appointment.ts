import { PatientProfile } from "./patient";
import { HealthcareProviderReference } from "./healthcare-provider-common";

export type ServiceType = {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
}

export type AppointmentMode = {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
}

export type ChiefComplaint = {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
}

export type AppointmentStatus = "Accepted" | "Completed" | "Pending" | "Rejected";

export type AppointmentData = {
  id: number;
  patient: PatientProfile;
  hp: HealthcareProviderReference;
  service: ServiceType;
  chiefComplaint: ChiefComplaint;
  mode: AppointmentMode;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  notes?: string;
  createdAt: string;
};