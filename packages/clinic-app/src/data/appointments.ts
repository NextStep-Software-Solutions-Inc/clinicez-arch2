import { AppointmentData } from "@app-types/appointment";
import { PATIENT_PROFILES } from "./patients";

const HEALTHCARE_PROVIDERS = {
  drSmith: {
    id: 1,
    prefix: "Dr.",
    name: "Robert Smith",
    postfix: "MD",
    specialization: "Cardiologist",
  },
  drJohnson: {
    id: 2,
    prefix: "Dr.",
    name: "Emily Johnson",
    postfix: "MD",
    specialization: "Psychiatrist",
  },
  drLee: {
    id: 3,
    prefix: "Dr.",
    name: "David Lee",
    postfix: "MD",
    specialization: "Endocrinologist",
  },
  drWilson: {
    id: 4,
    prefix: "Dr.",
    name: "Amanda Wilson",
    postfix: "MD",
    specialization: "Pulmonologist",
  },
  drTaylor: {
    id: 5,
    prefix: "Dr.",
    name: "Karen Taylor",
    postfix: "MD, FACC",
    specialization: "Cardiologist",
  },
};

const SERVICES = {
  consultation: { id: 1, name: "Consultation", description: "General consultation", createdAt: "2025-01-01T00:00:00Z" },
  followUp: { id: 2, name: "Follow-up", description: "Follow-up visit", createdAt: "2025-01-01T00:00:00Z" },
  checkup: { id: 3, name: "Checkup", description: "Annual checkup", createdAt: "2025-01-01T00:00:00Z" },
};

const MODES = {
  inPerson: { id: 1, name: "In-Person", description: "Face-to-face consultation", createdAt: "2025-01-01T00:00:00Z" },
  virtual: { id: 2, name: "Virtual", description: "Online consultation", createdAt: "2025-01-01T00:00:00Z" },
};

const CHIEF_COMPLAINTS = {
  highBloodPressure: { id: 1, name: "High Blood Pressure", description: "Elevated blood pressure readings at home", createdAt: "2025-01-01T00:00:00Z" },
  persistentSadness: { id: 2, name: "Persistent Sadness", description: "Feeling sad and lack of interest in activities", createdAt: "2025-01-01T00:00:00Z" },
  bloodSugarManagement: { id: 3, name: "Blood Sugar Management", description: "Difficulty managing blood sugar levels", createdAt: "2025-01-01T00:00:00Z" },
  breathingDifficulty: { id: 4, name: "Breathing Difficulty", description: "Shortness of breath and wheezing episodes", createdAt: "2025-01-01T00:00:00Z" },
  cholesterolManagement: { id: 5, name: "Cholesterol Management", description: "High cholesterol levels on recent blood work", createdAt: "2025-01-01T00:00:00Z" },
};

export const mockAppointmentsData: AppointmentData[] = [
  {
    id: 1,
    patient: PATIENT_PROFILES[1],
    hp: HEALTHCARE_PROVIDERS.drSmith,
    service: SERVICES.consultation,
    chiefComplaint: CHIEF_COMPLAINTS.highBloodPressure,
    mode: MODES.inPerson,
    appointmentDate: "2025-10-17",
    startTime: "09:00",
    endTime: "09:30",
    status: "Pending",
    notes: "First consultation for hypertension management",
    createdAt: "2025-10-15T08:00:00Z",
  },
  {
    id: 2,
    patient: PATIENT_PROFILES[2],
    hp: HEALTHCARE_PROVIDERS.drJohnson,
    service: SERVICES.followUp,
    chiefComplaint: CHIEF_COMPLAINTS.persistentSadness,
    mode: MODES.virtual,
    appointmentDate: "2025-10-17",
    startTime: "10:00",
    endTime: "11:00",
    status: "Accepted",
    notes: "Monthly follow-up for depression treatment",
    createdAt: "2025-10-14T10:00:00Z",
  },
  {
    id: 3,
    patient: PATIENT_PROFILES[3],
    hp: HEALTHCARE_PROVIDERS.drLee,
    service: SERVICES.checkup,
    chiefComplaint: CHIEF_COMPLAINTS.bloodSugarManagement,
    mode: MODES.inPerson,
    appointmentDate: "2025-10-17",
    startTime: "14:00",
    endTime: "14:45",
    status: "Completed",
    notes: "Quarterly diabetes management checkup",
    createdAt: "2025-10-13T12:00:00Z",
  },
  {
    id: 4,
    patient: PATIENT_PROFILES[4],
    hp: HEALTHCARE_PROVIDERS.drWilson,
    service: SERVICES.consultation,
    chiefComplaint: CHIEF_COMPLAINTS.breathingDifficulty,
    mode: MODES.inPerson,
    appointmentDate: "2025-10-18",
    startTime: "11:00",
    endTime: "11:45",
    status: "Rejected",
    notes: "Patient requested reschedule",
    createdAt: "2025-10-15T09:00:00Z",
  },
  {
    id: 5,
    patient: PATIENT_PROFILES[5],
    hp: HEALTHCARE_PROVIDERS.drTaylor,
    service: SERVICES.followUp,
    chiefComplaint: CHIEF_COMPLAINTS.cholesterolManagement,
    mode: MODES.virtual,
    appointmentDate: "2025-10-18",
    startTime: "15:00",
    endTime: "15:30",
    status: "Pending",
    notes: "Follow-up on lipid panel results",
    createdAt: "2025-10-16T07:00:00Z",
  },
];