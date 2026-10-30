import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { desc, eq } from 'drizzle-orm';
import { format, parseISO } from 'date-fns';
import ThemedText from '../../../components/ui/ThemedText';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import EmptyState from '../../../components/ui/EmptyState';
import { AppIcon, type IconName } from '../../../components/ui/Icon';
import FilterChipBar, { type FilterChipItem } from '../../../components/ui/FilterChipBar';
import SegmentedControl from '../../../components/appointments/SegmentedControl';
import AfterVisitSummaryCard from '../../../components/records/AfterVisitSummaryCard';
import { CategoryPillBar } from '../../../components/records/CategoryPillBar';
import { RecordSkeletonList } from '../../../components/records/RecordSkeletonList';
import { FileRow } from '../../../components/files/FileRow';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useContentInsets } from '../../../hooks/useContentInsets';
import { usePatientId } from '../../../hooks/usePatientId';
import { useFilesBrowser } from '../../../hooks/useFilesBrowser';
import { db } from '../../../db/index';
import { consultations, type Consultation } from '../../../db/schema/consultations';
import { vitalSigns, type VitalSign } from '../../../db/schema/vitalSigns';
import { inboxPrescriptions, type InboxPrescription } from '../../../db/schema/inboxPrescriptions';
import { inboxLabResults, type InboxLabResult } from '../../../db/schema/inboxLabResults';
import { inboxLabRequests, type InboxLabRequest } from '../../../db/schema/inboxLabRequests';
import { inboxMedicalCertificates, type InboxMedicalCertificate } from '../../../db/schema/inboxMedicalCertificates';
import { parseLabRequestItems, parsePrescriptionItems } from '../../../services/sync/documentMappers';
import {
  labStageChip,
  prescriptionStageChip,
  provenanceBadge,
  verificationBadge,
  type Chip,
} from '../../../services/documents/presentation';
import {
  matchesCategoryFilter,
  type CategoryFilterId,
} from '../../../services/records/categories';
import { deleteItem, preparePreviewFile, renameFile, listFolderContents } from '../../../services/files';
import RenameModal from '../../../components/ui/RenameModal';
import { dialog } from '../../../utils/dialog';

type ClinicFilterId = 'all' | 'visits' | 'prescriptions' | 'results' | 'labRequests' | 'certificates';

const CLINIC_FILTERS: ReadonlyArray<FilterChipItem<ClinicFilterId>> = [
  { key: 'all', label: 'All Documents' },
  { key: 'visits', label: 'Visits & Care Summaries' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'results', label: 'Lab & Imaging' },
  { key: 'labRequests', label: 'Lab Requests' },
  { key: 'certificates', label: 'Certificates & Referrals' },
];

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
      <Card padding="md" style={{ gap: spacing.sm, borderWidth: 1, borderColor: colors.border }}>
        <View style={[styles.rowTop, { gap: spacing.sm }]}>
          <View
            style={[styles.iconBox, { backgroundColor: colors.primaryLight, borderRadius: radii.md }]}
          >
            <AppIcon name={icon} size={20} color="primary" />
          </View>
          <View style={styles.flex}>
            <ThemedText variant="bodyBold" numberOfLines={2} style={{ color: colors.text }}>
              {title}
            </ThemedText>
            <ThemedText variant="small" color="textSecondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          </View>
          <AppIcon name="chevronRight" size={18} color="textSecondary" />
        </View>
        {chips.length > 0 && (
          <View style={[styles.chips, { gap: spacing.xs }]}>
            {chips.map((chip) => (
              <Badge key={chip.label} label={chip.label} tone={chip.tone} icon={chip.icon} size="sm" />
            ))}
          </View>
        )}
        <ThemedText variant="caption" color="textMuted">
          {caption}
        </ThemedText>
      </Card>
    </Pressable>
  );
}

export default function RecordsScreen() {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const contentInsets = useContentInsets();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();

  // Top-level segment: 0 = Clinic Documents, 1 = My Uploads
  const [segmentIndex, setSegmentIndex] = useState<0 | 1>(0);

  // Clinic Documents state
  const [clinicFilter, setClinicFilter] = useState<ClinicFilterId>('all');
  const [consultationList, setConsultationList] = useState<Consultation[]>([]);
  const [latestVitals, setLatestVitals] = useState<VitalSign | null>(null);
  const [prescriptionList, setPrescriptionList] = useState<InboxPrescription[]>([]);
  const [labResultList, setLabResultList] = useState<InboxLabResult[]>([]);
  const [labRequestList, setLabRequestList] = useState<InboxLabRequest[]>([]);
  const [certificateList, setCertificateList] = useState<InboxMedicalCertificate[]>([]);
  const [isLoadingClinic, setIsLoadingClinic] = useState(true);
  const [isRefreshingClinic, setIsRefreshingClinic] = useState(false);

  // My Uploads state
  const [activeUploadCategory, setActiveUploadCategory] = useState<CategoryFilterId>('all');
  const [renameTarget, setRenameTarget] = useState<{ id: string; initialName: string } | null>(null);
  const { contents, isLoading: isLoadingUploads, isRefreshing: isRefreshingUploads, refresh: refreshUploads, mutate } =
    useFilesBrowser(patientId, null, '');

  const loadClinicDocuments = useCallback(async () => {
    if (!patientId) return;
    try {
      const [consults, vitalsRows, rxs, labs, requests, certs] = await Promise.all([
        db
          .select()
          .from(consultations)
          .where(eq(consultations.patientId, patientId))
          .orderBy(desc(consultations.visitDate)),
        db
          .select()
          .from(vitalSigns)
          .where(eq(vitalSigns.patientId, patientId))
          .orderBy(desc(vitalSigns.measuredAt))
          .limit(1),
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
          .from(inboxLabRequests)
          .where(eq(inboxLabRequests.patientId, patientId))
          .orderBy(desc(inboxLabRequests.issuedAt)),
        db
          .select()
          .from(inboxMedicalCertificates)
          .where(eq(inboxMedicalCertificates.patientId, patientId))
          .orderBy(desc(inboxMedicalCertificates.issuedAt)),
      ]);

      setConsultationList(consults);
      setLatestVitals(vitalsRows[0] ?? null);
      setPrescriptionList(rxs);
      setLabResultList(labs);
      setLabRequestList(requests);
      setCertificateList(certs);
    } catch (e) {
      console.error('Failed to load clinic documents:', e);
    }
  }, [patientId]);

  useEffect(() => {
    let mounted = true;
    setIsLoadingClinic(true);
    loadClinicDocuments().finally(() => {
      if (mounted) setIsLoadingClinic(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadClinicDocuments]);

  const onRefreshClinic = async () => {
    setIsRefreshingClinic(true);
    await loadClinicDocuments();
    setIsRefreshingClinic(false);
  };

  const handleRenameSave = async (newName: string) => {
    if (!renameTarget) return;
    try {
      await renameFile(patientId, renameTarget.id, newName);
      setRenameTarget(null);
      const newContents = await listFolderContents(patientId, null, '', getToken);
      await mutate(newContents, { revalidate: false });
    } catch (e) {
      dialog.alert('Error', e instanceof Error ? e.message : 'Unable to rename item.');
    }
  };

  // Uploaded files filtered by category
  const filteredUploads = useMemo(() => {
    const files = contents?.files ?? [];
    return files.filter((f) => matchesCategoryFilter(f, activeUploadCategory));
  }, [contents?.files, activeUploadCategory]);

  const categoryCounts = useMemo(() => {
    const allFiles = contents?.files ?? [];
    const counts: Partial<Record<CategoryFilterId, number>> = { all: allFiles.length };
    for (const file of allFiles) {
      if (matchesCategoryFilter(file, 'lab_results')) counts.lab_results = (counts.lab_results ?? 0) + 1;
      if (matchesCategoryFilter(file, 'prescriptions')) counts.prescriptions = (counts.prescriptions ?? 0) + 1;
      if (matchesCategoryFilter(file, 'lab_requests')) counts.lab_requests = (counts.lab_requests ?? 0) + 1;
      if (matchesCategoryFilter(file, 'certificates')) counts.certificates = (counts.certificates ?? 0) + 1;
      if (matchesCategoryFilter(file, 'outside_uploads')) counts.outside_uploads = (counts.outside_uploads ?? 0) + 1;
    }
    return counts;
  }, [contents?.files]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Top Segmented Control Switch: Clinic Documents vs My Uploads */}
      <View style={[styles.segmentContainer, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
        <SegmentedControl
          options={['Clinic Documents', 'My Uploads']}
          selectedIndex={segmentIndex}
          onChange={(idx) => setSegmentIndex(idx)}
        />
      </View>

      {segmentIndex === 0 ? (
        // ─── SEGMENT 0: CLINIC DOCUMENTS (Provider Issued) ─────────────────
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, paddingBottom: contentInsets.bottom + 80 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshingClinic}
              onRefresh={onRefreshClinic}
              tintColor={colors.primary}
            />
          }
        >
          {/* Filter Chips Bar */}
          <FilterChipBar<ClinicFilterId>
            items={CLINIC_FILTERS}
            selectedKey={clinicFilter}
            onSelect={setClinicFilter}
          />

          {isLoadingClinic ? (
            <RecordSkeletonList />
          ) : (
            <View style={{ gap: spacing.md }}>
              {/* After-Visit Summaries / Consultations */}
              {(clinicFilter === 'all' || clinicFilter === 'visits') &&
                consultationList.map((consult) => (
                  <AfterVisitSummaryCard
                    key={consult.id}
                    consultation={consult}
                    vitals={latestVitals}
                    onBookFollowUp={() => navigation.navigate('Main', { screen: 'BookingDraftScreen' })}
                    onMessageClinic={() => navigation.navigate('MainBottomTabs', { screen: 'MessagesScreen' })}
                  />
                ))}

              {/* Prescriptions */}
              {(clinicFilter === 'all' || clinicFilter === 'prescriptions') &&
                prescriptionList.map((rx) => (
                  <DocumentRow
                    key={rx.id}
                    icon="pill"
                    title={`Prescription ${rx.prescriptionNumber}`}
                    subtitle={summarise(
                      parsePrescriptionItems(rx.itemsJson).map((item) => item.genericName),
                      'No medicines listed'
                    )}
                    caption={`${rx.prescriberName} · ${format(rx.issuedAt, 'MMM d, yyyy')}`}
                    chips={[prescriptionStageChip(rx.stage)]}
                    onPress={() =>
                      navigation.navigate('Main', {
                        screen: 'PrescriptionDetailScreen',
                        params: { id: rx.id },
                      })
                    }
                  />
                ))}

              {/* Lab Results */}
              {(clinicFilter === 'all' || clinicFilter === 'results') &&
                labResultList.map((result) => (
                  <DocumentRow
                    key={result.id}
                    icon="lab"
                    title={result.title}
                    subtitle={result.laboratoryName || 'Diagnostic Laboratory'}
                    caption={format(result.resultedAt, 'MMM d, yyyy')}
                    chips={[provenanceBadge(result.source), verificationBadge(result.verification, result.remarks)]}
                    onPress={() =>
                      navigation.navigate('Main', {
                        screen: 'LabResultDetailScreen',
                        params: { id: result.id },
                      })
                    }
                  />
                ))}

              {/* Lab Requests */}
              {(clinicFilter === 'all' || clinicFilter === 'labRequests') &&
                labRequestList.map((request) => (
                  <DocumentRow
                    key={request.id}
                    icon="lab"
                    title={request.title}
                    subtitle={summarise(
                      parseLabRequestItems(request.itemsJson).map((item) => item.name),
                      'No tests listed'
                    )}
                    caption={`${request.orderingFacilityName ?? 'Accredited Facility'} · ${format(
                      request.issuedAt,
                      'MMM d, yyyy'
                    )}`}
                    chips={[labStageChip(request.stage)]}
                    onPress={() =>
                      navigation.navigate('Main', {
                        screen: 'LabRequestDetailScreen',
                        params: { id: request.id },
                      })
                    }
                  />
                ))}

              {/* Medical Certificates */}
              {(clinicFilter === 'all' || clinicFilter === 'certificates') &&
                certificateList.map((cert) => (
                  <DocumentRow
                    key={cert.id}
                    icon="document"
                    title={cert.purpose}
                    subtitle={`Certificate ${cert.certificateNumber}`}
                    caption={`${cert.doctorName} · ${format(cert.issuedAt, 'MMM d, yyyy')}`}
                    chips={
                      cert.restDays
                        ? [{ label: `${cert.restDays} rest ${cert.restDays === 1 ? 'day' : 'days'}`, tone: 'info' }]
                        : []
                    }
                    onPress={() =>
                      navigation.navigate('Main', {
                        screen: 'MedicalCertificateDetailScreen',
                        params: { id: cert.id },
                      })
                    }
                  />
                ))}

              {/* Empty state if no clinic documents exist in this filter */}
              {consultationList.length === 0 &&
                prescriptionList.length === 0 &&
                labResultList.length === 0 &&
                labRequestList.length === 0 &&
                certificateList.length === 0 && (
                  <EmptyState
                    icon="document"
                    title="No Clinic Documents"
                    message="Official documents issued by your healthcare provider (prescriptions, lab requests, lab results, and after-visit summaries) will appear here once synced."
                  />
                )}
            </View>
          )}
        </ScrollView>
      ) : (
        // ─── SEGMENT 1: MY UPLOADS (Patient Uploaded Outside Files) ────────
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, paddingBottom: contentInsets.bottom + 80 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshingUploads}
              onRefresh={refreshUploads}
              tintColor={colors.primary}
            />
          }
        >
          {/* Category Filter Pills */}
          <CategoryPillBar
            selectedCategory={activeUploadCategory}
            onSelectCategory={setActiveUploadCategory}
            counts={categoryCounts}
          />

          {isLoadingUploads ? (
            <RecordSkeletonList />
          ) : filteredUploads.length === 0 ? (
            <EmptyState
              icon="upload"
              title="No Uploaded Records"
              message="Upload your lab results, prescriptions, vaccination cards, or government IDs to keep your personal records handy."
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {filteredUploads.map((file) => (
                <FileRow
                  key={file.id}
                  item={file}
                  onPress={() =>
                    navigation.navigate('FileViewerScreen', {
                      fileId: file.id,
                      fileName: file.name,
                      mimeType: file.mimeType,
                    })
                  }
                  onRename={() => setRenameTarget({ id: file.id, initialName: file.name })}
                  onShare={() => navigation.navigate('Main', { screen: 'ShareRecordsScreen' })}
                  onDelete={async () => {
                    const confirmed = await dialog.confirm({
                      title: 'Delete Record',
                      message: `Are you sure you want to delete ${file.name}?`,
                      confirmLabel: 'Delete',
                      destructive: true,
                    });
                    if (confirmed) {
                      await deleteItem(patientId, file.id);
                      refreshUploads();
                    }
                  }}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Floating Action Button (FAB) */}
      <Pressable
        onPress={() => {
          if (segmentIndex !== 1) setSegmentIndex(1);
          navigation.navigate('FilesUploadScreen');
        }}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: colors.primary,
            borderRadius: radii.full,
            bottom: contentInsets.bottom + spacing.lg,
            right: spacing.xl,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            opacity: pressed ? 0.88 : 1,
          },
          shadows.md,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Upload medical file or document"
      >
        <AppIcon name="plus" size={sizes.iconMd} color="onPrimary" />
        <ThemedText variant="bodyBold" color="onPrimary">
          Upload
        </ThemedText>
      </Pressable>

      {/* Rename Modal */}
      {renameTarget && (
        <RenameModal
          visible={Boolean(renameTarget)}
          initialName={renameTarget.initialName}
          onClose={() => setRenameTarget(null)}
          onSave={handleRenameSave}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  segmentContainer: {
    width: '100%',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
