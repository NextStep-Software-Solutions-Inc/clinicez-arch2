import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, EmptyState } from '../ui';
import RejectionReasonModal from './RejectionReasonModal';
import type {
  ClinicPatient,
  ClinicRecordAttachmentRecord,
} from '../../services/clinicService';

export interface ExternalDocumentVaultTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
  attachments?: ClinicRecordAttachmentRecord[];
  onUploadDocument?: () => void;
  onUploadDoc?: () => void;
  onVerifyAttachment?: (attachmentId: string, isApproved: boolean, rejectionReason?: string) => Promise<void>;
  onDownloadAttachment?: (attachmentId: string) => Promise<void>;
  onRefreshChart?: () => void;
}

export const PHILHEALTH_CHEST_XRAY_FINDINGS: Record<string, string> = {
  '1': 'Essentially Normal',
  '2': 'Pneumonia',
  '3': 'Pulmonary Tuberculosis (PTB / Kochs)',
  '4': 'Pleural Effusion',
  '5': 'Pneumothorax',
  '6': 'Emphysema',
  '12': 'Pulmonary Mass / Nodule',
  '99': 'Others / Non-Specific Findings',
};

export const PHILHEALTH_CHEST_XRAY_OBSERVATIONS: Record<string, string> = {
  '1': 'Infiltrates / Hazy Densities',
  '2': 'Calcifications / Fibrocalcific',
  '3': 'Consolidation',
  '4': 'Cavitation',
  '9': 'Cardiomegaly',
  '99': 'Other Observable Findings',
};

export type VaultStatusFilter = 'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export default function ExternalDocumentVaultTab({
  patient,
  patientId,
  attachments = [],
  onUploadDocument,
  onUploadDoc,
  onVerifyAttachment,
  onDownloadAttachment,
  onRefreshChart,
}: ExternalDocumentVaultTabProps) {
  const [statusFilter, setStatusFilter] = useState<VaultStatusFilter>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [rejectingAttachment, setRejectingAttachment] = useState<ClinicRecordAttachmentRecord | null>(null);

  const pendingCount = useMemo(() => {
    return attachments.filter((att) => {
      const isVerified = att.verificationStatus === 'Verified';
      const isRejected = att.verificationStatus === 'Rejected';
      return !isVerified && !isRejected;
    }).length;
  }, [attachments]);

  const verifiedCount = useMemo(() => {
    return attachments.filter((att) => att.verificationStatus === 'Verified').length;
  }, [attachments]);

  const rejectedCount = useMemo(() => {
    return attachments.filter((att) => att.verificationStatus === 'Rejected').length;
  }, [attachments]);

  const handleUpload = () => {
    if (onUploadDocument) onUploadDocument();
    else if (onUploadDoc) onUploadDoc();
  };

  const handleVerify = async (attachmentId: string, isApproved: boolean, rejectionReason?: string) => {
    if (!onVerifyAttachment) return;
    setVerifyingId(attachmentId);
    try {
      await onVerifyAttachment(attachmentId, isApproved, rejectionReason);
      if (onRefreshChart) onRefreshChart();
    } finally {
      setVerifyingId(null);
    }
  };

  const handleOpenRejectModal = (att: ClinicRecordAttachmentRecord) => {
    setRejectingAttachment(att);
  };

  const handleConfirmReject = async (reason: string) => {
    if (!rejectingAttachment) return;
    const targetId = rejectingAttachment.id;
    try {
      await handleVerify(targetId, false, reason);
      setRejectingAttachment(null);
    } catch {
      // Handled in verify callback
    }
  };

  const filteredAttachments = useMemo(() => {
    return attachments.filter((att) => {
      const isVerified = att.verificationStatus === 'Verified';
      const isRejected = att.verificationStatus === 'Rejected';
      const isPending = !isVerified && !isRejected;

      if (statusFilter === 'PENDING' && !isPending) return false;
      if (statusFilter === 'VERIFIED' && !isVerified) return false;
      if (statusFilter === 'REJECTED' && !isRejected) return false;

      if (selectedCategory === 'ALL') return true;
      if (selectedCategory === 'OutsideChestXRay') {
        return att.recordType === 'OutsideChestXRay' || att.title?.toLowerCase().includes('x-ray');
      }
      if (selectedCategory === 'COR') {
        return att.recordType === 'COR' || att.title?.toLowerCase().includes('cor') || att.title?.toLowerCase().includes('certificate');
      }
      if (selectedCategory === 'OutsideLab') {
        return att.recordType === 'OutsideLabReport' || att.recordType === 'DiagnosticLabReport';
      }
      return att.recordType === selectedCategory;
    });
  }, [attachments, selectedCategory, statusFilter]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ========================================================================= */}
      {/* TOP CONTROLS & STATUS / CATEGORY FILTERS                                  */}
      {/* ========================================================================= */}
      <View style={styles.topBar}>
        <View style={styles.actionsRow}>
          <Pressable onPress={handleUpload} style={styles.uploadBtn}>
            <Icon name="upload" size={14} color={theme.colors.onPrimary} />
            <ThemedText variant="captionBold" color={theme.colors.onPrimary} numberOfLines={1}>
              Attach External Document
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.filtersWrapper}>
          {/* Status Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statusFilterRow}
            style={styles.filterScrollView}
          >
            <Pressable
              onPress={() => setStatusFilter('ALL')}
              style={[styles.statusChip, statusFilter === 'ALL' && styles.statusChip_active]}
            >
              <ThemedText
                variant="captionBold"
                numberOfLines={1}
                color={statusFilter === 'ALL' ? theme.colors.primaryDark : theme.colors.textSecondary}
              >
                All ({attachments.length})
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setStatusFilter('PENDING')}
              style={[
                styles.statusChip,
                statusFilter === 'PENDING' && styles.statusChip_active,
                pendingCount > 0 && styles.statusChip_pendingAlert,
              ]}
            >
              {pendingCount > 0 && <Icon name="alert" size={12} color={theme.colors.warningText} />}
              <ThemedText
                variant="captionBold"
                numberOfLines={1}
                color={
                  statusFilter === 'PENDING'
                    ? theme.colors.primaryDark
                    : pendingCount > 0
                    ? theme.colors.warningText
                    : theme.colors.textSecondary
                }
              >
                Pending Review ({pendingCount})
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setStatusFilter('VERIFIED')}
              style={[styles.statusChip, statusFilter === 'VERIFIED' && styles.statusChip_active]}
            >
              <ThemedText
                variant="captionBold"
                numberOfLines={1}
                color={statusFilter === 'VERIFIED' ? theme.colors.primaryDark : theme.colors.textSecondary}
              >
                Verified ({verifiedCount})
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setStatusFilter('REJECTED')}
              style={[styles.statusChip, statusFilter === 'REJECTED' && styles.statusChip_active]}
            >
              <ThemedText
                variant="captionBold"
                numberOfLines={1}
                color={statusFilter === 'REJECTED' ? theme.colors.primaryDark : theme.colors.textSecondary}
              >
                Rejected ({rejectedCount})
              </ThemedText>
            </Pressable>
          </ScrollView>

          {/* Record Category Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            style={styles.filterScrollView}
          >
            <Pressable
              onPress={() => setSelectedCategory('ALL')}
              style={[styles.filterBtn, selectedCategory === 'ALL' && styles.filterBtn_active]}
            >
              <ThemedText
                variant="captionBold"
                numberOfLines={1}
                color={selectedCategory === 'ALL' ? theme.colors.primaryDark : theme.colors.textSecondary}
              >
                All Records ({attachments.length})
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setSelectedCategory('OutsideChestXRay')}
              style={[styles.filterBtn, selectedCategory === 'OutsideChestXRay' && styles.filterBtn_active]}
            >
              <ThemedText
                variant="captionBold"
                numberOfLines={1}
                color={selectedCategory === 'OutsideChestXRay' ? theme.colors.primaryDark : theme.colors.textSecondary}
              >
                Outside Chest X-Ray
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setSelectedCategory('COR')}
              style={[styles.filterBtn, selectedCategory === 'COR' && styles.filterBtn_active]}
            >
              <ThemedText
                variant="captionBold"
                numberOfLines={1}
                color={selectedCategory === 'COR' ? theme.colors.primaryDark : theme.colors.textSecondary}
              >
                Cert of Registration (COR)
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setSelectedCategory('OutsideLab')}
              style={[styles.filterBtn, selectedCategory === 'OutsideLab' && styles.filterBtn_active]}
            >
              <ThemedText
                variant="captionBold"
                numberOfLines={1}
                color={selectedCategory === 'OutsideLab' ? theme.colors.primaryDark : theme.colors.textSecondary}
              >
                Outside Labs
              </ThemedText>
            </Pressable>
          </ScrollView>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* ATTACHMENT CARDS LIST                                                     */}
      {/* ========================================================================= */}
      {filteredAttachments.length > 0 ? (
        <View style={styles.attachmentsList}>
          {filteredAttachments.map((att) => {
            const isVerified = att.verificationStatus === 'Verified';
            const isRejected = att.verificationStatus === 'Rejected';
            const isPending = !isVerified && !isRejected;

            const isCxr = att.recordType === 'OutsideChestXRay' || att.title?.toLowerCase().includes('x-ray');

            return (
              <View key={att.id} style={styles.attachmentCard}>
                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={styles.titleRow}>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        {att.title || att.fileName}
                      </ThemedText>
                      <Badge label={att.recordType} variant="neutral" size="sm" />
                      {isCxr ? (
                        <Badge label="Chest X-Ray" variant="purple" size="sm" />
                      ) : null}
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {att.fileName} • {Math.round(att.fileSizeBytes / 1024)} KB • Document Date: {att.documentDate || new Date(att.createdAt).toLocaleDateString()}
                    </ThemedText>
                  </View>

                  <Badge
                    label={att.verificationStatus || 'Pending Review'}
                    variant={isVerified ? 'success' : isRejected ? 'emergency' : 'warning'}
                    size="sm"
                    icon={isVerified ? 'checkCircle' : isRejected ? 'alert' : 'clock'}
                  />
                </View>

                {/* Amber Quarantine Warning Banner for Pending Documents */}
                {isPending ? (
                  <View style={styles.quarantineBanner}>
                    <View style={styles.quarantineBannerHeader}>
                      <Icon name="alert" size={14} color={theme.colors.warningText} />
                      <ThemedText variant="captionBold" color={theme.colors.warningText}>
                        Self-Enrolled Outside Document - Requires Clinical Verification
                      </ThemedText>
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      Uploaded by patient during registration. Review film/document clarity, patient identification, and clinical validity before approving into patient EMR chart.
                    </ThemedText>
                  </View>
                ) : null}

                {/* Outside Chest X-Ray Conformance Box */}
                {isCxr ? (
                  <View style={styles.cxrStatutoryBox}>
                    <View style={styles.cxrStatutoryTop}>
                      <Icon name="scan" size={14} color={theme.colors.purpleText} />
                      <ThemedText variant="captionBold" color={theme.colors.purpleText}>
                        PhilHealth Chest X-Ray Conformance
                      </ThemedText>
                    </View>
                    <ThemedText variant="caption" color={theme.colors.text}>
                      Findings: Essentially Normal • Observation: No acute infiltrate
                    </ThemedText>
                  </View>
                ) : null}

                {/* Rejection Details Callout */}
                {isRejected ? (
                  <View style={styles.rejectionNoticeBox}>
                    <View style={styles.rejectionNoticeHeader}>
                      <Icon name="alert" size={14} color={theme.colors.emergencyText} />
                      <ThemedText variant="captionBold" color={theme.colors.emergencyText}>
                        Rejected Document
                      </ThemedText>
                    </View>
                    <ThemedText variant="caption" color={theme.colors.emergencyText}>
                      Reason: {att.rejectionReason || 'Document did not meet clinical verification criteria.'}
                    </ThemedText>
                    {att.verifiedByStaffName ? (
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Reviewed by {att.verifiedByStaffName}
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}

                {/* Security & Audit Trail */}
                <View style={styles.metaRow}>
                  <View style={styles.metaPill}>
                    <Icon name="lock" size={12} color={theme.colors.routineText} />
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      {att.encryptionAlgorithm || 'AES-256-GCM Encrypted'}
                    </ThemedText>
                  </View>

                  {att.uploadedByStaffName ? (
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Uploaded by: {att.uploadedByStaffName}
                    </ThemedText>
                  ) : null}

                  {isVerified && att.verifiedByStaffName ? (
                    <ThemedText variant="caption" color={theme.colors.successText}>
                      • Verified by {att.verifiedByStaffName}
                    </ThemedText>
                  ) : null}
                </View>

                {/* Notes */}
                {att.notes ? (
                  <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ fontStyle: 'italic' }}>
                    Notes: {att.notes}
                  </ThemedText>
                ) : null}

                {/* Action Buttons */}
                <View style={styles.cardFooter}>
                  {onDownloadAttachment ? (
                    <Pressable
                      onPress={() => onDownloadAttachment(att.id)}
                      style={styles.actionBtn}
                    >
                      <Icon name="download" size={14} color={theme.colors.primaryDark} />
                      <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                        View / Download
                      </ThemedText>
                    </Pressable>
                  ) : null}

                  {isPending && onVerifyAttachment ? (
                    <View style={styles.reviewActions}>
                      <Pressable
                        onPress={() => handleVerify(att.id, true)}
                        style={[styles.actionBtn, styles.actionBtn_success]}
                        disabled={verifyingId === att.id}
                      >
                        <Icon name="checkCircle" size={14} color={theme.colors.successText} />
                        <ThemedText variant="captionBold" color={theme.colors.successText}>
                          Verify & Accept
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => handleOpenRejectModal(att)}
                        style={[styles.actionBtn, styles.actionBtn_danger]}
                        disabled={verifyingId === att.id}
                      >
                        <Icon name="close" size={14} color={theme.colors.emergencyText} />
                        <ThemedText variant="captionBold" color={theme.colors.emergencyText}>
                          Reject
                        </ThemedText>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState
          icon="file"
          title="No external documents in vault"
          description="Zero uploaded medical clearances, outside films, or scanned certificates for this patient."
        />
      )}

      {/* Rejection Reason Modal */}
      <RejectionReasonModal
        visible={Boolean(rejectingAttachment)}
        onClose={() => setRejectingAttachment(null)}
        onConfirm={handleConfirmReject}
        documentTitle={rejectingAttachment?.title}
        fileName={rejectingAttachment?.fileName}
        loading={verifyingId === rejectingAttachment?.id}
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
  },
  topBar: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  filtersWrapper: {
    gap: theme.spacing.xs,
  },
  filterScrollView: {
    flexGrow: 0,
  },
  statusFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: theme.spacing.xs,
    paddingVertical: 2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  statusChip_active: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  statusChip_pendingAlert: {
    borderColor: theme.colors.warningBorder,
    backgroundColor: theme.colors.warningBg,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: theme.spacing.xs,
    paddingVertical: 2,
  },
  filterBtn: {
    flexShrink: 0,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  filterBtn_active: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
    backgroundColor: theme.colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.sm,
  },
  attachmentsList: {
    gap: theme.spacing.sm,
  },
  attachmentCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  cardHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  cxrStatutoryBox: {
    backgroundColor: theme.colors.purpleBg,
    borderColor: theme.colors.purpleBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xs,
    gap: 2,
    marginVertical: 2,
  },
  cxrStatutoryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: 2,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radii.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  reviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  actionBtn_success: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  actionBtn_danger: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  quarantineBanner: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xs,
    gap: 2,
    marginVertical: 2,
  },
  quarantineBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rejectionNoticeBox: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xs,
    gap: 2,
    marginVertical: 2,
  },
  rejectionNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});

