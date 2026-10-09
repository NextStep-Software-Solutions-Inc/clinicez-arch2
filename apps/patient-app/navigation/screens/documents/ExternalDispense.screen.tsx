import { useState } from 'react';
import { View } from 'react-native';
import { useNavigation, type StaticScreenProps } from '@react-navigation/native';
import { eq } from 'drizzle-orm';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import Button from '@ui/Button';
import EmptyState from '@ui/EmptyState';
import Input from '@ui/Input';
import { Skeleton } from '@ui/Skeleton';
import { dialog } from '@utils/dialog';
import { db } from '@db/index';
import { inboxPrescriptions, type InboxPrescription } from '@db/schema/inboxPrescriptions';
import Screen from 'components/layout/Screen';
import PickedFileRow from 'components/documents/PickedFileRow';
import { useAppTheme } from 'contexts/ThemeContext';
import { useAuth } from 'contexts/AuthContext';
import { usePatientId } from 'hooks/usePatientId';
import { useLocalQuery } from 'hooks/useDocuments';
import { ApiError } from 'services/api/apiClient';
import { submitExternalDispense } from 'services/api/documentsApi';
import { pullDocumentChanges } from 'services/sync/documentsSyncService';
import { MediaPermissionError, pickPhotoFile, type PickedFile } from 'services/documents/filePicker';
import {
  UPLOAD_LIMITS_HINT,
  uploadFailureMessage,
  validateUploadFile,
} from 'services/documents/uploadRules';
import { canDispenseElsewhere, prescriptionStageChip } from 'services/documents/presentation';

type Props = StaticScreenProps<{ id: string }>;

const MAX_FIELD_LENGTH = 200;
const MAX_NOTES_LENGTH = 500;

export default function ExternalDispenseScreen({ route }: Props) {
  const { id } = route.params;
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const navigation = useNavigation();
  const { spacing } = useAppTheme();

  const { data: prescription, loaded } = useLocalQuery<InboxPrescription | null>(
    async () => {
      const [row] = await db.select().from(inboxPrescriptions).where(eq(inboxPrescriptions.id, id)).limit(1);
      return row && row.patientId === patientId ? row : null;
    },
    null,
    [id, patientId],
  );

  const [pharmacyName, setPharmacyName] = useState('');
  const [branchLocation, setBranchLocation] = useState('');
  const [pharmacistName, setPharmacistName] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<PickedFile | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [pharmacyError, setPharmacyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const choosePhoto = async () => {
    try {
      const result = await pickPhotoFile();
      if (!result) return;
      const problem = validateUploadFile({ mimeType: result.file.mimeType, size: result.size });
      setReceiptError(problem);
      setReceipt(problem ? null : result);
    } catch (err) {
      setReceiptError(err instanceof MediaPermissionError ? err.message : 'Could not open the photo library.');
    }
  };

  const submit = async () => {
    if (!prescription) return;
    const name = pharmacyName.trim();
    if (!name) {
      setPharmacyError('Enter the name of the pharmacy.');
      return;
    }
    setPharmacyError(null);
    setSubmitting(true);
    try {
      await submitExternalDispense(getToken, patientId, prescription.id, {
        pharmacyName: name,
        branchLocation: branchLocation.trim() || undefined,
        pharmacistName: pharmacistName.trim() || undefined,
        receiptNumber: receiptNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        receipt: receipt?.file,
      });
      setSubmitted(true);
      void pullDocumentChanges(patientId, getToken).catch((err) =>
        console.warn('[ExternalDispense] Refresh after submit failed:', err),
      );
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const fallback = err instanceof ApiError ? err.firstMessage : 'Could not save this. Please try again.';
      dialog.alert('Could not record dispensing', uploadFailureMessage(status, fallback));
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <Screen width="form">
        <Skeleton height={200} />
      </Screen>
    );
  }

  if (!prescription) {
    return (
      <Screen width="form">
        <EmptyState title="Prescription not found" message="It may have been removed. Pull down on the inbox to refresh." />
      </Screen>
    );
  }

  if (submitted) {
    const stage = prescriptionStageChip('externalDispensed');
    return (
      <Screen width="form" contentContainerStyle={{ gap: spacing.md }}>
        <Card style={{ gap: spacing.sm }}>
          <Badge label={stage.label} tone={stage.tone} icon={stage.icon} />
          <ThemedText variant="h3">Recorded</ThemedText>
          <ThemedText variant="body" color="textSecondary">
            Your doctor can now see that this prescription was filled at {pharmacyName.trim()}.
          </ThemedText>
        </Card>
        <Button label="Done" fullWidth onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  if (!canDispenseElsewhere(prescription.stage)) {
    return (
      <Screen width="form">
        <EmptyState
          title="Already dispensed"
          message="This prescription has already been dispensed, so it cannot be recorded again."
        />
      </Screen>
    );
  }

  return (
    <Screen width="form" contentContainerStyle={{ gap: spacing.md }}>
      <Card style={{ gap: spacing.xs }}>
        <ThemedText variant="h3">{`Prescription ${prescription.prescriptionNumber}`}</ThemedText>
        <ThemedText variant="body" color="textSecondary">
          Filled this prescription at a pharmacy outside ClinicEZ? Tell us where so your records stay accurate.
        </ThemedText>
      </Card>

      <Card>
        <Input
          label="Pharmacy name"
          required
          value={pharmacyName}
          onChangeText={setPharmacyName}
          error={pharmacyError}
          maxLength={MAX_FIELD_LENGTH}
          editable={!submitting}
        />
        <Input
          label="Branch (optional)"
          value={branchLocation}
          onChangeText={setBranchLocation}
          maxLength={MAX_FIELD_LENGTH}
          editable={!submitting}
        />
        <Input
          label="Pharmacist (optional)"
          value={pharmacistName}
          onChangeText={setPharmacistName}
          maxLength={MAX_FIELD_LENGTH}
          editable={!submitting}
        />
        <Input
          label="Receipt number (optional)"
          value={receiptNumber}
          onChangeText={setReceiptNumber}
          maxLength={MAX_FIELD_LENGTH}
          editable={!submitting}
        />
        <Input
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          maxLength={MAX_NOTES_LENGTH}
          multiline
          editable={!submitting}
          containerStyle={{ marginBottom: 0 }}
        />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <ThemedText variant="smallBold" color="textSecondary">Receipt photo (optional)</ThemedText>
        {receipt ? (
          <PickedFileRow picked={receipt} disabled={submitting} onRemove={() => setReceipt(null)} />
        ) : (
          <View style={{ gap: spacing.xs }}>
            <Button label="Attach receipt photo" icon="camera" variant="outline" fullWidth onPress={choosePhoto} />
            <ThemedText variant="caption" color="textMuted">{UPLOAD_LIMITS_HINT}</ThemedText>
          </View>
        )}
        {receiptError ? (
          <ThemedText variant="small" color="emergency">
            {receiptError}
          </ThemedText>
        ) : null}
      </Card>

      <Button label="Save" fullWidth loading={submitting} onPress={submit} />
    </Screen>
  );
}
