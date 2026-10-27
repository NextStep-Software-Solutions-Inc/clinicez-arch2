import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, EmptyState, Button } from '../ui';
import {
  clinicService,
  type ClinicPatient,
  type MedicalCertificateRecord,
  type ReferralLetterRecord,
} from '../../services/clinicService';
import { openDocument } from '../../services/documentOpener';
import { notify } from '../../utils/feedback';

export interface AdministrativeDocumentsTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
  medicalCertificates?: MedicalCertificateRecord[];
  referralLetters?: ReferralLetterRecord[];
  isLoading?: boolean;
  onRefreshChart?: () => void;
}

export type DocumentFilterType = 'ALL' | 'CERTIFICATES' | 'REFERRALS';

export default function AdministrativeDocumentsTab({
  patient,
  patientId,
  medicalCertificates = [],
  referralLetters = [],
  isLoading = false,
  onRefreshChart,
}: AdministrativeDocumentsTabProps) {
  const [filterType, setFilterType] = useState<DocumentFilterType>('ALL');
  const [actioningDocId, setActioningDocId] = useState<string | null>(null);

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

  if (totalDocuments === 0) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState
          icon="file"
          title="No Issued Administrative Documents"
          description="Official signed medical certificates and formal hospital referral letters issued to this patient will appear here for 1-click reprinting."
          actionTitle={onRefreshChart ? 'Refresh Chart' : undefined}
          onAction={onRefreshChart}
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
            Secure cryptographic registry of issued medical certificates and referral letters
          </ThemedText>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterGroup}>
          <Pressable
            style={[styles.filterPill, filterType === 'ALL' && styles.filterPillActive]}
            onPress={() => setFilterType('ALL')}
          >
            <ThemedText
              variant="caption"
              color={filterType === 'ALL' ? theme.colors.primaryDark : theme.colors.textSecondary}
              style={filterType === 'ALL' ? styles.filterPillTextActive : undefined}
            >
              All ({totalDocuments})
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.filterPill, filterType === 'CERTIFICATES' && styles.filterPillActive]}
            onPress={() => setFilterType('CERTIFICATES')}
          >
            <ThemedText
              variant="caption"
              color={filterType === 'CERTIFICATES' ? theme.colors.primaryDark : theme.colors.textSecondary}
              style={filterType === 'CERTIFICATES' ? styles.filterPillTextActive : undefined}
            >
              Certificates ({totalCerts})
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.filterPill, filterType === 'REFERRALS' && styles.filterPillActive]}
            onPress={() => setFilterType('REFERRALS')}
          >
            <ThemedText
              variant="caption"
              color={filterType === 'REFERRALS' ? theme.colors.primaryDark : theme.colors.textSecondary}
              style={filterType === 'REFERRALS' ? styles.filterPillTextActive : undefined}
            >
              Referrals ({totalReferrals})
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* MEDICAL CERTIFICATES SECTION */}
      {filteredCerts.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="file" size={16} color={theme.colors.primary} />
            <ThemedText variant="small" color={theme.colors.primaryDark} style={styles.sectionTitle}>
              Medical Certificates ({filteredCerts.length})
            </ThemedText>
          </View>

          {filteredCerts.map((cert) => {
            const hasDigest = Boolean(cert.securityDigest);
            const isActioning = actioningDocId === cert.id;

            return (
              <View key={cert.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleCol}>
                    <View style={styles.titleWithBadge}>
                      <ThemedText variant="title" color={theme.colors.text}>
                        {cert.certificateNumber}
                      </ThemedText>
                      {cert.isSigned ? (
                        <Badge label="Physician Signed" variant="success" size="sm" icon="check" />
                      ) : (
                        <Badge label="Draft / Unsigned" variant="warning" size="sm" icon="clock" />
                      )}
                      {hasDigest ? (
                        <Badge
                          label="SHA-256 Sealed"
                          variant="outline"
                          size="sm"
                          icon="shield"
                        />
                      ) : null}
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      Issued on {cert.issueDate} • Attending: Dr. {cert.doctorName} (PRC #{cert.prcLicenseNumber})
                    </ThemedText>
                  </View>

                  <Button
                    title="Reprint / View PDF"
                    variant="primary"
                    size="sm"
                    icon="print"
                    testID="reprint-med-cert-btn"
                    loading={isActioning}
                    disabled={isActioning}
                    onPress={() => handleReprintMedCert(cert)}
                  />
                </View>

                {/* Details Grid */}
                <View style={styles.detailsBox}>
                  <View style={styles.detailRow}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.detailLabel}>
                      Fitness Status:
                    </ThemedText>
                    <Badge label={cert.fitnessStatus || 'FitToWork'} variant="info" size="sm" />
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

                  {hasDigest ? (
                    <View style={styles.digestRow}>
                      <Icon name="shield" size={12} color={theme.colors.successText} />
                      <ThemedText variant="code" color={theme.colors.textMuted} style={styles.digestText}>
                        Seal Digest: {cert.securityDigest}
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
            <Icon name="file" size={16} color={theme.colors.primary} />
            <ThemedText variant="small" color={theme.colors.primaryDark} style={styles.sectionTitle}>
              Referral Letters ({filteredReferrals.length})
            </ThemedText>
          </View>

          {filteredReferrals.map((letter) => {
            const hasDigest = Boolean(letter.securityDigest);
            const isActioning = actioningDocId === letter.id;

            return (
              <View key={letter.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleCol}>
                    <View style={styles.titleWithBadge}>
                      <ThemedText variant="title" color={theme.colors.text}>
                        {letter.referralNumber}
                      </ThemedText>
                      {letter.isSigned ? (
                        <Badge label="Physician Signed" variant="success" size="sm" icon="check" />
                      ) : (
                        <Badge label="Draft / Unsigned" variant="warning" size="sm" icon="clock" />
                      )}
                      <Badge
                        label={letter.urgency || 'Routine'}
                        variant={letter.urgency === 'Emergency' ? 'emergency' : letter.urgency === 'Urgent' ? 'warning' : 'neutral'}
                        size="sm"
                      />
                      {hasDigest ? (
                        <Badge
                          label="SHA-256 Sealed"
                          variant="outline"
                          size="sm"
                          icon="shield"
                        />
                      ) : null}
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      Referred on {letter.referralDate} • Referring: Dr. {letter.referringDoctorName}
                    </ThemedText>
                  </View>

                  <Button
                    title="Reprint / View PDF"
                    variant="primary"
                    size="sm"
                    icon="print"
                    testID="reprint-referral-btn"
                    loading={isActioning}
                    disabled={isActioning}
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
                      {letter.referredToDoctor ? ` • Attn: Dr. ${letter.referredToDoctor}` : ''}
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

                  {hasDigest ? (
                    <View style={styles.digestRow}>
                      <Icon name="shield" size={12} color={theme.colors.successText} />
                      <ThemedText variant="code" color={theme.colors.textMuted} style={styles.digestText}>
                        Seal Digest: {letter.securityDigest}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.md,
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
    padding: theme.spacing.lg,
  },
  headerStrip: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
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
  filterGroup: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterPillActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  filterPillTextActive: {
    fontWeight: '700',
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
  digestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  digestText: {
    letterSpacing: 0.2,
  },
});
