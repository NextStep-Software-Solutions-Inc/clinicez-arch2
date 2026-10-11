import { Linking, View } from 'react-native';
import type { StaticScreenProps } from '@react-navigation/native';
import { eq } from 'drizzle-orm';
import { format } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import Button from '@ui/Button';
import EmptyState from '@ui/EmptyState';
import { Skeleton } from '@ui/Skeleton';
import { db } from '@db/index';
import { inboxMedicalCertificates, type InboxMedicalCertificate } from '@db/schema/inboxMedicalCertificates';
import Screen from 'components/layout/Screen';
import QrCodeView from 'components/sharing/QrCodeView';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useAppTheme } from 'contexts/ThemeContext';
import { usePatientId } from 'hooks/usePatientId';
import { useDocumentsPull, useLocalQuery } from 'hooks/useDocuments';

type Props = StaticScreenProps<{ id: string }>;

const DATE_FORMAT = 'MMM d, yyyy';

function validity(from: Date | null, to: Date | null): string | null {
  if (from && to) return `${format(from, DATE_FORMAT)} to ${format(to, DATE_FORMAT)}`;
  if (from) return `From ${format(from, DATE_FORMAT)}`;
  if (to) return `Until ${format(to, DATE_FORMAT)}`;
  return null;
}

export default function MedicalCertificateDetailScreen({ route }: Props) {
  const { id } = route.params;
  const patientId = usePatientId();
  const { spacing } = useAppTheme();
  const { refreshing, refresh } = useDocumentsPull();

  const { data: certificate, loaded } = useLocalQuery<InboxMedicalCertificate | null>(
    async () => {
      const [row] = await db
        .select()
        .from(inboxMedicalCertificates)
        .where(eq(inboxMedicalCertificates.id, id))
        .limit(1);
      return row && row.patientId === patientId ? row : null;
    },
    null,
    [id, patientId],
  );

  if (!loaded) {
    return (
      <Screen width="form">
        <Skeleton height={200} />
      </Screen>
    );
  }

  if (!certificate) {
    return (
      <Screen width="form">
        <EmptyState title="Certificate not found" message="It may have been removed. Pull down on the inbox to refresh." />
      </Screen>
    );
  }

  const { verificationUrl } = certificate;

  return (
    <Screen
      width="form"
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      contentContainerStyle={{ gap: spacing.md }}
    >
      <Card style={{ gap: spacing.sm }}>
        <ThemedText variant="h2">{certificate.purpose}</ThemedText>
        <ThemedText variant="small" color="textMuted">
          {`Certificate ${certificate.certificateNumber} · Issued ${format(certificate.issuedAt, DATE_FORMAT)}`}
        </ThemedText>
        {certificate.restDays ? (
          <View style={{ flexDirection: 'row' }}>
            <Badge
              label={`${certificate.restDays} rest ${certificate.restDays === 1 ? 'day' : 'days'}`}
              tone="info"
              icon="calendar"
            />
          </View>
        ) : null}
      </Card>

      <Card>
        <ProfileSectionHeader title="Details" />
        <ProfileReadOnlyField label="Issued by" value={certificate.issuerName} />
        <ProfileReadOnlyField label="Doctor" value={certificate.doctorName} />
        <ProfileReadOnlyField label="Doctor PRC licence" value={certificate.doctorPrcLicense} />
        <ProfileReadOnlyField label="Valid" value={validity(certificate.validFrom, certificate.validTo)} />
        <ProfileReadOnlyField label="Diagnosis" value={certificate.diagnosis} />
        <ProfileReadOnlyField label="Remarks" value={certificate.remarks} />
      </Card>

      {verificationUrl ? (
        <Card style={{ gap: spacing.sm }}>
          <ProfileSectionHeader
            title="Verification"
            description="Employers and schools can scan this code or open the link to confirm the certificate is genuine."
          />
          <QrCodeView value={verificationUrl} accessibilityLabel="Certificate verification QR code" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Button
              label="Open"
              icon="externalLink"
              variant="outline"
              size="sm"
              onPress={() => void Linking.openURL(verificationUrl)}
            />
            <Button
              label="Copy link"
              icon="copy"
              variant="ghost"
              size="sm"
              onPress={() => void Clipboard.setStringAsync(verificationUrl)}
            />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
