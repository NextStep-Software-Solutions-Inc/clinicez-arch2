import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { desc, eq } from 'drizzle-orm';
import { format } from 'date-fns';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import EmptyState from '@ui/EmptyState';
import { Skeleton } from '@ui/Skeleton';
import { AppIcon } from '@ui/Icon';
import { db } from '@db/index';
import { inboxLabRequests, type InboxLabRequest } from '@db/schema/inboxLabRequests';
import { inboxLabResults, type InboxLabResult } from '@db/schema/inboxLabResults';
import { inboxMedicalCertificates, type InboxMedicalCertificate } from '@db/schema/inboxMedicalCertificates';
import { inboxPrescriptions, type InboxPrescription } from '@db/schema/inboxPrescriptions';
import Screen from 'components/layout/Screen';
import { useAppTheme } from 'contexts/ThemeContext';
import { usePatientId } from 'hooks/usePatientId';
import { useDocumentsPull, useLocalQuery } from 'hooks/useDocuments';
import { parseLabRequestItems, parsePrescriptionItems } from 'services/sync/documentMappers';
import {
  labStageChip,
  prescriptionStageChip,
  provenanceBadge,
  verificationBadge,
  type Chip,
} from 'services/documents/presentation';
import type { IconName } from 'components/ui/iconNames';

type DocumentTab = 'labRequests' | 'prescriptions' | 'results' | 'certificates';

interface Inbox {
  labRequests: InboxLabRequest[];
  prescriptions: InboxPrescription[];
  results: InboxLabResult[];
  certificates: InboxMedicalCertificate[];
}

type DocumentDetailScreen =
  | 'LabRequestDetailScreen'
  | 'PrescriptionDetailScreen'
  | 'LabResultDetailScreen'
  | 'MedicalCertificateDetailScreen';

const EMPTY_INBOX: Inbox = { labRequests: [], prescriptions: [], results: [], certificates: [] };

const TABS: { key: DocumentTab; label: string; icon: IconName; emptyTitle: string; emptyMessage: string }[] = [
  {
    key: 'labRequests',
    label: 'Lab requests',
    icon: 'lab',
    emptyTitle: 'No lab requests',
    emptyMessage: 'Lab requests your doctors issue appear here once they sync.',
  },
  {
    key: 'prescriptions',
    label: 'Prescriptions',
    icon: 'pill',
    emptyTitle: 'No prescriptions',
    emptyMessage: 'Prescriptions your doctors issue appear here once they sync.',
  },
  {
    key: 'results',
    label: 'Results',
    icon: 'clipboard',
    emptyTitle: 'No results yet',
    emptyMessage: 'Lab results from Clinic EZ labs, external labs, and your uploads appear here.',
  },
  {
    key: 'certificates',
    label: 'Certificates',
    icon: 'document',
    emptyTitle: 'No certificates',
    emptyMessage: 'Medical certificates your doctors issue appear here once they sync.',
  },
];

const DATE_FORMAT = 'MMM d, yyyy';

function useInbox(patientId: string) {
  return useLocalQuery<Inbox>(
    async () => {
      const [labRequests, prescriptions, results, certificates] = await Promise.all([
        db
          .select()
          .from(inboxLabRequests)
          .where(eq(inboxLabRequests.patientId, patientId))
          .orderBy(desc(inboxLabRequests.issuedAt)),
        db
          .select()
          .from(inboxPrescriptions)
          .where(eq(inboxPrescriptions.patientId, patientId))
          .orderBy(desc(inboxPrescriptions.issuedAt)),
        db
          .select()
          .from(inboxLabResults)
          .where(eq(inboxLabResults.patientId, patientId))
          .orderBy(desc(inboxLabResults.resultedAt)),
        db
          .select()
          .from(inboxMedicalCertificates)
          .where(eq(inboxMedicalCertificates.patientId, patientId))
          .orderBy(desc(inboxMedicalCertificates.issuedAt)),
      ]);
      return { labRequests, prescriptions, results, certificates };
    },
    EMPTY_INBOX,
    [patientId],
  );
}

function summarise(names: string[], emptyLabel: string): string {
  if (names.length === 0) return emptyLabel;
  const [first, ...rest] = names;
  return rest.length > 0 ? `${first} +${rest.length} more` : first;
}

interface DocumentRowProps {
  icon: IconName;
  title: string;
  subtitle: string;
  caption: string;
  chips: Chip[];
  onPress: () => void;
}

function DocumentRow({ icon, title, subtitle, caption, chips, onPress }: DocumentRowProps) {
  const { colors, spacing, radii } = useAppTheme();

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
      <Card padding="sm" style={{ gap: spacing.sm }}>
        <View style={[styles.rowTop, { gap: spacing.sm }]}>
          <View
            style={[styles.iconBox, { backgroundColor: colors.primaryLight, borderRadius: radii.md }]}
          >
            <AppIcon name={icon} size={20} color="primaryText" />
          </View>
          <View style={styles.flex}>
            <ThemedText variant="bodyBold" numberOfLines={2}>
              {title}
            </ThemedText>
            <ThemedText variant="small" color="textMuted" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          </View>
          <AppIcon name="forward" size={18} color="textMuted" />
        </View>
        <View style={[styles.chips, { gap: spacing.xs }]}>
          {chips.map((chip) => (
            <Badge key={chip.label} label={chip.label} tone={chip.tone} icon={chip.icon} size="sm" />
          ))}
        </View>
        <ThemedText variant="caption" color="textMuted">
          {caption}
        </ThemedText>
      </Card>
    </Pressable>
  );
}

export default function DocumentsScreen() {
  const patientId = usePatientId();
  const navigation = useNavigation();
  const { colors, spacing, radii } = useAppTheme();
  const { data: inbox, loaded } = useInbox(patientId);
  const { refreshing, refresh } = useDocumentsPull();
  const [tab, setTab] = useState<DocumentTab>('labRequests');

  const counts: Record<DocumentTab, number> = {
    labRequests: inbox.labRequests.length,
    prescriptions: inbox.prescriptions.length,
    results: inbox.results.length,
    certificates: inbox.certificates.length,
  };
  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];

  const open = (screen: DocumentDetailScreen, id: string) =>
    navigation.navigate('Main', { screen, params: { id } });

  const rows = (() => {
    switch (tab) {
      case 'labRequests':
        return inbox.labRequests.map((request) => (
          <DocumentRow
            key={request.id}
            icon="lab"
            title={request.title}
            subtitle={summarise(
              parseLabRequestItems(request.itemsJson).map((item) => item.name),
              'No tests listed',
            )}
            caption={`${request.orderingFacilityName ?? 'Unknown facility'} · ${format(request.issuedAt, DATE_FORMAT)}`}
            chips={[labStageChip(request.stage)]}
            onPress={() => open('LabRequestDetailScreen', request.id)}
          />
        ));
      case 'prescriptions':
        return inbox.prescriptions.map((prescription) => (
          <DocumentRow
            key={prescription.id}
            icon="pill"
            title={`Prescription ${prescription.prescriptionNumber}`}
            subtitle={summarise(
              parsePrescriptionItems(prescription.itemsJson).map((item) => item.genericName),
              'No medicines listed',
            )}
            caption={`${prescription.prescriberName} · ${format(prescription.issuedAt, DATE_FORMAT)}`}
            chips={[prescriptionStageChip(prescription.stage)]}
            onPress={() => open('PrescriptionDetailScreen', prescription.id)}
          />
        ));
      case 'results':
        return inbox.results.map((result) => (
          <DocumentRow
            key={result.id}
            icon="clipboard"
            title={result.title}
            subtitle={result.laboratoryName}
            caption={format(result.resultedAt, DATE_FORMAT)}
            chips={[provenanceBadge(result.source), verificationBadge(result.verification, result.remarks)]}
            onPress={() => open('LabResultDetailScreen', result.id)}
          />
        ));
      case 'certificates':
        return inbox.certificates.map((certificate) => (
          <DocumentRow
            key={certificate.id}
            icon="document"
            title={certificate.purpose}
            subtitle={`Certificate ${certificate.certificateNumber}`}
            caption={`${certificate.doctorName} · ${format(certificate.issuedAt, DATE_FORMAT)}`}
            chips={
              certificate.restDays
                ? [{ label: `${certificate.restDays} rest ${certificate.restDays === 1 ? 'day' : 'days'}`, tone: 'info' }]
                : []
            }
            onPress={() => open('MedicalCertificateDetailScreen', certificate.id)}
          />
        ));
    }
  })();

  return (
    <Screen
      width="form"
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      contentContainerStyle={{ gap: spacing.md }}
    >
      <View style={[styles.tabs, { gap: spacing.sm }]} accessibilityRole="tablist">
        {TABS.map((item) => {
          const selected = item.key === tab;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setTab(item.key)}
              style={[
                styles.tab,
                {
                  borderRadius: radii.full,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  backgroundColor: selected ? colors.primary : colors.surfaceSubtle,
                },
              ]}
            >
              <ThemedText
                variant="smallBold"
                style={{ color: selected ? colors.onPrimary : colors.textSecondary }}
              >
                {`${item.label} (${counts[item.key]})`}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {!loaded ? (
        <Skeleton height={120} />
      ) : counts[tab] === 0 ? (
        <EmptyState title={activeTab.emptyTitle} message={activeTab.emptyMessage} />
      ) : (
        rows
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap' },
  tab: { alignItems: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
