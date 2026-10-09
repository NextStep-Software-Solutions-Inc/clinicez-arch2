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
import { inboxLabRequests, type InboxLabRequest } from '@db/schema/inboxLabRequests';
import Screen from 'components/layout/Screen';
import PickedFileRow from 'components/documents/PickedFileRow';
import { useAppTheme } from 'contexts/ThemeContext';
import { useAuth } from 'contexts/AuthContext';
import { usePatientId } from 'hooks/usePatientId';
import { useLocalQuery } from 'hooks/useDocuments';
import { ApiError } from 'services/api/apiClient';
import { uploadLabResult } from 'services/api/documentsApi';
import { pullDocumentChanges } from 'services/sync/documentsSyncService';
import {
  MediaPermissionError,
  pickDocumentFile,
  pickPhotoFile,
  type PickedFile,
} from 'services/documents/filePicker';
import {
  UPLOAD_LIMITS_HINT,
  uploadFailureMessage,
  validateUploadFile,
} from 'services/documents/uploadRules';
import { verificationBadge } from 'services/documents/presentation';

type Props = StaticScreenProps<{ id: string }>;

const MAX_NOTES_LENGTH = 500;

export default function UploadLabResultScreen({ route }: Props) {
  const { id } = route.params;
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const navigation = useNavigation();
  const { spacing } = useAppTheme();

  const { data: request, loaded } = useLocalQuery<InboxLabRequest | null>(
    async () => {
      const [row] = await db.select().from(inboxLabRequests).where(eq(inboxLabRequests.id, id)).limit(1);
      return row && row.patientId === patientId ? row : null;
    },
    null,
    [id, patientId],
  );

  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [notes, setNotes] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const choose = async (pick: () => Promise<PickedFile | null>) => {
    try {
      const result = await pick();
      if (!result) return;
      const problem = validateUploadFile({ mimeType: result.file.mimeType, size: result.size });
      setFileError(problem);
      setPicked(problem ? null : result);
    } catch (err) {
      setFileError(err instanceof MediaPermissionError ? err.message : 'Could not open the file picker.');
    }
  };

  const submit = async () => {
    if (!picked || !request) return;
    setSubmitting(true);
    try {
      await uploadLabResult(getToken, patientId, request.requisitionId, picked.file, notes.trim() || undefined);
      setSubmitted(true);
      void pullDocumentChanges(patientId, getToken).catch((err) =>
        console.warn('[UploadLabResult] Refresh after upload failed:', err),
      );
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const fallback = err instanceof ApiError ? err.firstMessage : 'Could not upload the file. Please try again.';
      dialog.alert('Upload failed', uploadFailureMessage(status, fallback));
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <Screen width="form">
        <Skeleton height={160} />
      </Screen>
    );
  }

  if (!request) {
    return (
      <Screen width="form">
        <EmptyState title="Lab request not found" message="It may have been removed. Pull down on the inbox to refresh." />
      </Screen>
    );
  }

  if (submitted) {
    const pending = verificationBadge('unverified');
    return (
      <Screen width="form" contentContainerStyle={{ gap: spacing.md }}>
        <Card style={{ gap: spacing.sm }}>
          <Badge label={pending.label} tone={pending.tone} icon={pending.icon} />
          <ThemedText variant="h3">Result uploaded</ThemedText>
          <ThemedText variant="body" color="textSecondary">
            Your file was sent to the ordering doctor for review. It shows as pending until they verify it.
          </ThemedText>
        </Card>
        <Button label="Done" fullWidth onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen width="form" contentContainerStyle={{ gap: spacing.md }}>
      <Card style={{ gap: spacing.sm }}>
        <ThemedText variant="h3">{request.title}</ThemedText>
        <ThemedText variant="body" color="textSecondary">
          Got your result from a lab outside ClinicEZ? Upload it here and your ordering doctor will review it.
        </ThemedText>
        <ThemedText variant="small" color="textMuted">{UPLOAD_LIMITS_HINT}</ThemedText>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        {picked ? (
          <PickedFileRow picked={picked} disabled={submitting} onRemove={() => setPicked(null)} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Button label="Choose a file" icon="file" variant="outline" fullWidth onPress={() => choose(pickDocumentFile)} />
            <Button label="Choose a photo" icon="image" variant="outline" fullWidth onPress={() => choose(pickPhotoFile)} />
          </View>
        )}
        {fileError ? (
          <ThemedText variant="small" color="emergency">
            {fileError}
          </ThemedText>
        ) : null}
        <Input
          label="Notes for your doctor (optional)"
          value={notes}
          onChangeText={setNotes}
          maxLength={MAX_NOTES_LENGTH}
          multiline
          editable={!submitting}
          containerStyle={{ marginBottom: 0 }}
        />
      </Card>

      <Button
        label="Upload result"
        icon="upload"
        fullWidth
        loading={submitting}
        disabled={!picked}
        onPress={submit}
      />
    </Screen>
  );
}
