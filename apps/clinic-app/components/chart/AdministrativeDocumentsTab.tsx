import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, EmptyState, Button } from '../ui';
import { useClinic } from '../../context/ClinicContext';
import {
  clinicService,
  formatClinicDate,
  type ClinicPatient,
  type MedicalCertificateRecord,
  type ReferralLetterRecord,
} from '../../services/clinicService';
import { openDocument } from '../../services/documentOpener';
import { notify } from '../../utils/feedback';
import IssueMedicalCertificateModal from '../patient/IssueMedicalCertificateModal';

export interface AdministrativeDocumentsTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
  queueItemId?: string | null;
  medicalCertificates?: MedicalCertificateRecord[];
  referralLetters?: ReferralLetterRecord[];
  isLoading?: boolean;
  onRefreshChart?: () => void;
}

export type DocumentFilterType = 'ALL' | 'CERTIFICATES' | 'REFERRALS';

const FITNESS_STATUS_LABELS: Record<string, string> = {
  FitToWork: 'Fit to work',
  UnfitToWork: 'Unfit to work',
  FitToSchool: 'Fit to school',
  UnfitToSchool: 'Unfit to school',
  LightDuty: 'Light duty',
};

export function formatFitnessStatus(status?: string): string {
  if (!status) return 'Fit to work';
  if (FITNESS_STATUS_LABELS[status]) return FITNESS_STATUS_LABELS[status];
  return status
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function formatDoctorName(name?: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

export default function AdministrativeDocumentsTab({
  patient,
  patientId: _patientId,
  queueItemId,
  medicalCertificates = [],
  referralLetters = [],
  isLoading = false,
  onRefreshChart,
}: AdministrativeDocumentsTabProps) {
  const { dateFormat, timeZoneId } = useClinic();
  const [filterType, setFilterType] = useState<DocumentFilterType>('ALL');
  const [actioningDocId, setActioningDocId] = useState<string | null>(null);
  const [issueModalVisible, setIssueModalVisible] = useState(false);

  const totalCerts = medicalCertificates.length;
  const totalReferrals = referralLetters.length;
  const totalDocuments = totalCerts + totalReferrals;

  const filteredCerts = useMemo(() => {
    if (filterType === 'REFERRALS') return [];
    return medicalCertificates;
  }, [filterType, medicalCertificates]);

  const filteredReferrals = useMemo(() => {
    if (filterType === 'CERTIFICATES') return [];
    return referralLetters;
  }, [filterType, referralLetters]);

  const handleOpenPdf = async (url: string, docId: string) => {
    try {
      setActioningDocId(docId);
      const opened = await openDocument(url);
      if (!opened) {
        notify.error('Could not open document PDF. Please check connection or popup blocker.');
      }
    } catch (err: any) {
      notify.error(err?.message || 'Could not open document PDF. Please check connection and try again.');
    } finally {
      setActioningDocId(null);
    }
  };

  const handleReprintMedCert = (cert: MedicalCertificateRecord) => {
    const url = clinicService.getMedicalCertificatePdfUrl(cert.id);
    handleOpenPdf(url, cert.id);
  };

  const handleReprintReferral = (letter: ReferralLetterRecord) => {
    const url = clinicService.getReferralLetterPdfUrl(letter.id);
    handleOpenPdf(url, letter.id);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Icon name="refresh" size={24} color={theme.colors.primary} />
        <ThemedText variant="body" color={theme.colors.textSecondary} style={styles.loadingText}>
          Loading issued clinical documents...
        </ThemedText>
      </View>
    );
  }

  const renderFilterChips = () => (
    <View style={styles.filterScrollWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterGroup}
      >
        <Pressable
          style={[styles.filterPill, filterType === 'ALL' && styles.filterPillActive]}
          onPress={() => setFilterType('ALL')}
        >
          <ThemedText
            variant="captionBold"
            numberOfLines={1}
            color={filterType === 'ALL' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            All ({totalDocuments})
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.filterPill, filterType === 'CERTIFICATES' && styles.filterPillActive]}
          onPress={() => setFilterType('CERTIFICATES')}
        >
          <ThemedText
            variant="captionBold"
            numberOfLines={1}
            color={filterType === 'CERTIFICATES' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Certificates ({totalCerts})
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.filterPill, filterType === 'REFERRALS' && styles.filterPillActive]}
          onPress={() => setFilterType('REFERRALS')}
        >
          <ThemedText
            variant="captionBold"
            numberOfLines={1}
            color={filterType === 'REFERRALS' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Referrals ({totalReferrals})
          </ThemedText>
        </Pressable>
      </ScrollView>
    </View>
  );

  const renderSections = () => (
    <>
      {/* MEDICAL CERTIFICATES SECTION */}
      {filteredCerts.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="file" size={theme.sizes.iconSm} color={theme.colors.primary} />
            <ThemedText variant="small" color={theme.colors.primaryDark} style={styles.sectionTitle}>
              Medical Certificates ({filteredCerts.length})
            </ThemedText>
          </View>

          {filteredCerts.map((cert) => {
            const isActioning = actioningDocId === cert.id;

            return (
              <View key={cert.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleCol}>
                    <View style={styles.titleWithBadge}>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        {cert.certificateNumber}
                      </ThemedText>
                      {cert.isSigned === false ? (
                        <>
                          <Badge label="Draft" variant="warning" size="sm" icon="clock" />
                          <Badge label="Pending encounter sign-off" variant="neutral" size="sm" />
                        </>
                      ) : null}
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      {cert.isSigned === false ? 'Drafted on ' : 'Issued on '}
                      {formatClinicDate(cert.issueDate, { dateFormat, timeZoneId, fallback: cert.issueDate })} • Attending: {formatDoctorName(cert.doctorName)}
                      {cert.prcLicenseNumber ? ` (PRC #${cert.prcLicenseNumber})` : ''}
                    </ThemedText>
                  </View>

                  <Button
                    title={cert.isSigned === false ? 'Sign encounter to print' : 'Reprint / View PDF'}
                    variant={cert.isSigned === false ? 'outline' : 'primary'}
                    size="sm"
                    icon={cert.isSigned === false ? 'clock' : 'print'}
                    testID="reprint-med-cert-btn"
                    loading={isActioning}
                    disabled={isActioning || cert.isSigned === false}
                    onPress={() => handleReprintMedCert(cert)}
                  />
                </View>

                {/* Details Grid */}
                <View style={styles.detailsBox}>
                  <View style={styles.detailRow}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailLabel}>
                      Fitness Status:
                    </ThemedText>
                    <Badge label={formatFitnessStatus(cert.fitnessStatus)} variant="info" size="sm" />
                    {cert.recommendedRestDays ? (
                      <ThemedText variant="caption" color={theme.colors.text} style={styles.detailValue}>
                        • {cert.recommendedRestDays} rest day(s) recommended
                      </ThemedText>
                    ) : null}
                  </View>

                  <View style={styles.detailRow}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailLabel}>
                      Diagnosis:
                    </ThemedText>
                    <ThemedText variant="body" color={theme.colors.text} style={styles.detailValue}>
                      {cert.diagnosis}
                    </ThemedText>
                  </View>

                  {cert.clinicalFindings ? (
                    <View style={styles.detailRow}>
                      <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailLabel}>
                        Findings:
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailValue}>
                        {cert.clinicalFindings}
                      </ThemedText>
                    </View>
                  ) : null}

                  {cert.remarks ? (
                    <View style={styles.detailRow}>
                      <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailLabel}>
                        Remarks:
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailValue}>
                        {cert.remarks}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* REFERRAL LETTERS SECTION */}
      {filteredReferrals.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="file" size={theme.sizes.iconSm} color={theme.colors.primary} />
            <ThemedText variant="small" color={theme.colors.primaryDark} style={styles.sectionTitle}>
              Referral Letters ({filteredReferrals.length})
            </ThemedText>
          </View>

          {filteredReferrals.map((letter) => {
            const isActioning = actioningDocId === letter.id;

            return (
              <View key={letter.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleCol}>
                    <View style={styles.titleWithBadge}>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        {letter.referralNumber}
                      </ThemedText>
                      {letter.isSigned === false ? (
                        <>
                          <Badge label="Draft" variant="warning" size="sm" icon="clock" />
                          <Badge label="Pending encounter sign-off" variant="neutral" size="sm" />
                        </>
                      ) : null}
                      <Badge
                        label={letter.urgency || 'Routine'}
                        variant={letter.urgency === 'Emergency' ? 'emergency' : letter.urgency === 'Urgent' ? 'warning' : 'neutral'}
                        size="sm"
                      />
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      {letter.isSigned === false ? 'Drafted on ' : 'Referred on '}
                      {formatClinicDate(letter.referralDate, { dateFormat, timeZoneId, fallback: letter.referralDate })} • Referring: {formatDoctorName(letter.referringDoctorName)}
                    </ThemedText>
                  </View>

                  <Button
                    title={letter.isSigned === false ? 'Sign encounter to print' : 'Reprint / View PDF'}
                    variant={letter.isSigned === false ? 'outline' : 'primary'}
                    size="sm"
                    icon={letter.isSigned === false ? 'clock' : 'print'}
                    testID="reprint-referral-btn"
                    loading={isActioning}
                    disabled={isActioning || letter.isSigned === false}
                    onPress={() => handleReprintReferral(letter)}
                  />
                </View>

                {/* Details Grid */}
                <View style={styles.detailsBox}>
                  <View style={styles.detailRow}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailLabel}>
                      Destination:
                    </ThemedText>
                    <ThemedText variant="body" color={theme.colors.text} style={styles.detailValue}>
                      {letter.referredToFacility} ({letter.referredDepartment})
                      {letter.referredToDoctor ? ` • Attn: ${formatDoctorName(letter.referredToDoctor)}` : ''}
                    </ThemedText>
                  </View>

                  <View style={styles.detailRow}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailLabel}>
                      Provisional Dx:
                    </ThemedText>
                    <ThemedText variant="body" color={theme.colors.text} style={styles.detailValue}>
                      {letter.provisionalDiagnosis}
                    </ThemedText>
                  </View>

                  <View style={styles.detailRow}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailLabel}>
                      Reason:
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailValue}>
                      {letter.reasonForReferral}
                    </ThemedText>
                  </View>

                  {letter.clinicalSummary ? (
                    <View style={styles.detailRow}>
                      <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailLabel}>
                        Summary:
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailValue}>
                        {letter.clinicalSummary}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </>
  );

  if (totalDocuments === 0) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState
          icon="file"
          title="No Issued Administrative Documents"
          description="Medical certificates and referral letters issued to this patient will appear here for viewing or reprinting."
          actionTitle="Issue Medical Certificate"
          onAction={() => setIssueModalVisible(true)}
        />
        <IssueMedicalCertificateModal
          visible={issueModalVisible}
          onClose={() => setIssueModalVisible(false)}
          patient={patient ?? null}
          queueItemId={queueItemId}
          onSuccess={() => onRefreshChart?.()}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* HEADER SUMMARY STRIP */}
      <View style={styles.headerStrip}>
        <View style={styles.headerInfo}>
          <ThemedText variant="title" color={theme.colors.text}>
            Administrative Certificate Vault
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Issued medical certificates and referral letters available to view or reprint
          </ThemedText>
        </View>

        <Button
          title="Issue Certificate"
          variant="primary"
          size="sm"
          icon="plus"
          onPress={() => setIssueModalVisible(true)}
          testID="open-issue-med-cert-btn"
        />

        {/* Filter Pills */}
        {renderFilterChips()}
      </View>

      {renderSections()}

      <IssueMedicalCertificateModal
        visible={issueModalVisible}
        onClose={() => setIssueModalVisible(false)}
        patient={patient ?? null}
        queueItemId={queueItemId}
        onSuccess={() => onRefreshChart?.()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  loadingContainer: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.sm,
  },
  emptyContainer: {
    paddingVertical: theme.spacing.md,
  },
  headerStrip: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  headerInfo: {
    flex: 1,
    minWidth: 200,
  },
  filterScrollWrap: {
    flexDirection: 'row',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  filterGroup: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: theme.spacing.xs,
    alignItems: 'center',
  },
  filterPill: {
    flexShrink: 0,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  filterPillActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  section: {
    gap: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
  },
  sectionTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  cardTitleCol: {
    flex: 1,
    minWidth: 240,
    gap: theme.spacing.xs,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  detailsBox: {
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  detailLabel: {
    fontWeight: '600',
    minWidth: 90,
  },
  detailValue: {
    flex: 1,
  },
});
