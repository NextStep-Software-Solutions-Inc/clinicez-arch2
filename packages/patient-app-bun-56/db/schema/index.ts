// Part A — Patient Self-Entry
export * from './patients';
export * from './patientGovernmentIds';
export * from './patientAddresses';
export * from './emergencyContacts';
export * from './patientHealthcareProviders';
export * from './patientAllergies';
export * from './patientMedications';
export * from './patientSurgicalHistory';
export * from './patientPastIllnesses';
export * from './patientChronicConditions';
export * from './patientDisabilities';
export * from './patientImmunizationsSelf';
export * from './patientSocialHistory';
export * from './patientFamilyHistory';
export * from './patientOccupation';
export * from './patientTravelHistory';
export * from './patientObstetricProfile';
export * from './patientPregnancies';
export * from './patientContraceptiveHistory';
export * from './patientMaleReproductive';
export * from './patientDentalVision';
export * from './patientMentalHealthProfile';

// Support tables
export * from './clinics';
export * from './filesMetadata';

// Part B — HCW Entry (read-only for patient)
export * from './vitalSigns';
export * from './consultations';
export * from './prescriptions';
export * from './labResults';
export * from './imagingResults';
export * from './vaccinationsAdministered';
export * from './clinicalAssessments';

// Infrastructure
export * from './syncQueue';
export * from './auditLogs';
