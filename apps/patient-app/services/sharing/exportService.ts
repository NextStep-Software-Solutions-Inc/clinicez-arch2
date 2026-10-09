import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { fetchPatientExport } from '../api/sharingApi';

/**
 * Downloads the patient's full data export (JSON) into the cache directory and opens the
 * system share sheet so the patient can save or send it.
 */
export async function exportPatientData(
  getToken: () => Promise<string | null>,
  patientId: string,
): Promise<void> {
  const json = await fetchPatientExport(getToken, patientId);

  const file = new File(Paths.cache, `clinicez-export-${format(new Date(), 'yyyyMMdd-HHmmss')}.json`);
  file.create({ overwrite: true });
  file.write(json);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export my ClinicEZ data',
    UTI: 'public.json',
  });
}
