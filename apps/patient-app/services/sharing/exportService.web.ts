import { format } from 'date-fns';
import { fetchPatientExport } from '../api/sharingApi';

/** Web export: the JSON is saved through a temporary download link (no share sheet in browsers). */
export async function exportPatientData(
  getToken: () => Promise<string | null>,
  patientId: string,
): Promise<void> {
  const json = await fetchPatientExport(getToken, patientId);

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `clinicez-export-${format(new Date(), 'yyyyMMdd-HHmmss')}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
