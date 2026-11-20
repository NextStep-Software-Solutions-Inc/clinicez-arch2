import type { ClinicPatient, PhilHealthPatientProfile } from '../services/clinicService';

/**
 * @deprecated Replaced by `PhilHealthCoverageModal` (administrative PhilHealth Info & YAKAP Enlistment)
 * and `HealthScreeningModal` (guided 4-station clinical Health Screening workstation).
 */
export interface PhilHealthProfileModalProps {
  visible: boolean;
  onClose: () => void;
  patient: ClinicPatient | null;
  onSaved?: (updated: PhilHealthPatientProfile) => void;
}

/**
 * @deprecated Replaced by `PhilHealthCoverageModal` and `HealthScreeningModal`.
 * Retained solely as a compatibility stub and renders `null`.
 */
export default function PhilHealthProfileModal(_props: PhilHealthProfileModalProps): null {
  return null;
}
