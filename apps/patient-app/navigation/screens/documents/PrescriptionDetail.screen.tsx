import { Linking, View } from 'react-native';
import { useNavigation, type StaticScreenProps } from '@react-navigation/native';
import { eq } from 'drizzle-orm';
import { format } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import Button from '@ui/Button';
import EmptyState from '@ui/EmptyState';
import { Skeleton } from '@ui/Skeleton';
import { ListRow } from '@ui/Primitives';
import { db } from '@db/index';
import { inboxPrescriptions, type InboxPrescription } from '@db/schema/inboxPrescriptions';
import Screen from 'components/layout/Screen';
import QrCodeView from 'components/sharing/QrCodeView';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useAppTheme } from 'contexts/ThemeContext';
import { usePatientId } from 'hooks/usePatientId';
import { useDocumentsPull, useLocalQuery } from 'hooks/useDocuments';
import { parsePrescriptionItems } from 'services/sync/documentMappers';
import {
  canDispenseElsewhere,
  formatAmount,
  prescriptionStageChip,
  showPrescriptionClaimQr,
} from 'services/documents/presentation';
import type { PrescriptionItemDto } from 'services/api/documentsApi';

type Props = StaticScreenProps<{ id: string }>;

const DATE_FORMAT = 'MMM d, yyyy h:mm a';

function itemSubtitle(item: PrescriptionItemDto): string {
  const parts = [`${item.dosage} ${item.form}`.trim(), item.sig];
  const duration = item.durationDays ? `${item.durationDays} days` : null;
  return [...parts, `Qty ${item.quantity}`, duration, item.remarks].filter(Boolean).join(' · ');
}

export default function PrescriptionDetailScreen({ route }: Props) {
  const { id } = route.params;
  const patientId = usePatientId();
  const navigation = useNavigation();
  const { spacing } = useAppTheme();
  const { refreshing, refresh } = useDocumentsPull();

  const { data: prescription, loaded } = useLocalQuery<InboxPrescription | null>(
    async () => {
      const [row] = await db.select().from(inboxPrescriptions).where(eq(inboxPrescriptions.id, id)).limit(1);
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

  if (!prescription) {
    return (
      <Screen width="form">
        <EmptyState title="Prescription not found" message="It may have been removed. Pull down on the inbox to refresh." />
      </Screen>
    );
  }

  const stage = prescriptionStageChip(prescription.stage);
  const items = parsePrescriptionItems(prescription.itemsJson);
  const amount = formatAmount(prescription.quotedAmount, null);
  const pharmacy = prescription.externalPharmacyName ?? prescription.pharmacyName;
  const { verificationUrl } = prescription;

  return (
    <Screen
      width="form"
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      contentContainerStyle={{ gap: spacing.md }}
    >
      <Card style={{ gap: spacing.sm }}>
        <ThemedText variant="h2">{`Prescription ${prescription.prescriptionNumber}`}</ThemedText>
        <ThemedText variant="small" color="textMuted">
          {prescription.prescriberName} · Issued {format(prescription.issuedAt, DATE_FORMAT)}
        </ThemedText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          <Badge label={stage.label} tone={stage.tone} icon={stage.icon} />
        </View>
      </Card>

      <Card>
        <ProfileSectionHeader title="Medicines" />
        {items.length === 0 ? (
          <ThemedText variant="small" color="textMuted">No medicines listed.</ThemedText>
        ) : (
          items.map((item, index) => (
            <ListRow
              key={`${item.genericName}-${index}`}
              title={item.brandName ? `${item.genericName} (${item.brandName})` : item.genericName}
              subtitle={itemSubtitle(item)}
              icon="pill"
              divider={index < items.length - 1}
            />
          ))
        )}
      </Card>

      <Card>
        <ProfileSectionHeader title="Details" />
        <ProfileReadOnlyField label="Facility" value={prescription.orderingFacilityName} />
        <ProfileReadOnlyField label="Prescriber PRC licence" value={prescription.prescriberPrcLicense} />
        <ProfileReadOnlyField label="Diagnosis" value={prescription.diagnosis} />
        <ProfileReadOnlyField label="Instructions" value={prescription.instructions} />
        <ProfileReadOnlyField label="Pharmacy" value={pharmacy} />
        <ProfileReadOnlyField label="Quoted amount" value={amount} />
        <ProfileReadOnlyField label="Receipt number" value={prescription.receiptNumber} />
        <ProfileReadOnlyField
          label="Dispensed"
          value={prescription.dispensedAt ? format(prescription.dispensedAt, DATE_FORMAT) : null}
        />
      </Card>

      {showPrescriptionClaimQr(prescription.stage, prescription.claimToken) && prescription.claimToken ? (
        <Card style={{ gap: spacing.sm }}>
          <ProfileSectionHeader
            title="Show this at the pharmacy"
            description="The pharmacy scans this code to claim your prescription."
          />
          <QrCodeView value={prescription.claimToken} accessibilityLabel="Prescription claim QR code" />
        </Card>
      ) : null}

      {verificationUrl ? (
        <Card style={{ gap: spacing.sm }}>
          <ProfileSectionHeader
            title="Verification"
            description="Anyone can use this link to confirm the prescription is genuine."
          />
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

      {canDispenseElsewhere(prescription.stage) ? (
        <Button
          label="Dispensed elsewhere"
          icon="pill"
          variant="outline"
          fullWidth
          onPress={() =>
            navigation.navigate('Main', { screen: 'ExternalDispenseScreen', params: { id: prescription.id } })
          }
        />
      ) : null}
    </Screen>
  );
}
