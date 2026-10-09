import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '@constants/theme';
import { Modal, Button, Badge, Icon, ThemedText } from '@ui';
import { Alert } from '@utils/feedback';
import { useClinic } from '../context/ClinicContext';
import { useStaff } from '../context/StaffContext';
import { PrescriptionSlipData, clinicService } from '../services/clinicService';
import { openPrintableUrl } from '../utils/printHelper';
import { RxStageChip } from './interop/InteropBadges';

interface PrescriptionSlipModalProps {
  visible: boolean;
  onClose: () => void;
  slip: PrescriptionSlipData | null;
  onOpenExternalDispense?: () => void;
}

export default function PrescriptionSlipModal({
  visible,
  onClose,
  slip,
  onOpenExternalDispense,
}: PrescriptionSlipModalProps) {
  const { letterhead, facilityName, accreditationNumber } = useClinic();
  const { currentName } = useStaff();

  if (!slip) return null;

  const isDispensed = slip.dispenseStatus === 'Dispensed';
  const isDispensedExternally = slip.dispenseStatus === 'DispensedExternally';
  const isPending = !isDispensed && !isDispensedExternally;

  // The slip carries the facility and prescriber it was issued under; the clinic
  // settings and the "Working as" staff member only fill in what the slip left blank.
  const clinicName = slip.clinicName || letterhead.header || facilityName;
  const clinicAddress = slip.clinicAddress || letterhead.address;
  const clinicContact = slip.clinicContact || letterhead.contact;
  const prescriberName = slip.doctorName || currentName;

  const handlePrint = async () => {
    try {
      const url = slip.consultationId
        ? clinicService.getPrescriptionSlipPdfUrl(slip.consultationId)
        : clinicService.getPrescriptionSlipPdfByNumberUrl(slip.prescriptionNumber);
      const opened = await openPrintableUrl(url);
      if (!opened) {
        Alert.alert('Notice', 'Unable to automatically open the PDF. Please check your browser popup blocker.');
      }
    } catch {
      Alert.alert('Download Error', 'Could not open official prescription PDF. Please check connection and try again.');
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Prescription slip"
      maxWidth={640}
      maxHeight="92%"
      footer={
        <View style={styles.footerBar}>
          <Button title="Download / print PDF" icon="print" variant="outline" onPress={handlePrint} />
          <Button title="Close" onPress={onClose} />
        </View>
      }
    >
      {/* Clinic Letterhead */}
      <View style={styles.letterhead}>
        <ThemedText variant="display" color={theme.colors.primary}>
          ℞
        </ThemedText>
        {clinicName ? (
          <ThemedText variant="title" style={styles.centered}>
            {clinicName}
          </ThemedText>
        ) : null}
        {letterhead.subHeader ? (
          <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.centered}>
            {letterhead.subHeader}
          </ThemedText>
        ) : null}
        {clinicAddress ? (
          <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.centered}>
            {clinicAddress}
          </ThemedText>
        ) : null}
        {clinicContact ? (
          <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.centered}>
            {clinicContact}
          </ThemedText>
        ) : null}
        {accreditationNumber ? (
          <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.centered}>
            Accreditation No. {accreditationNumber}
          </ThemedText>
        ) : null}
        <View style={styles.metaRow}>
          <ThemedText variant="small" color={theme.colors.textSecondary}>
            Rx No.{' '}
            <ThemedText variant="smallBold" color={theme.colors.primary}>
              {slip.prescriptionNumber}
            </ThemedText>
          </ThemedText>
          <ThemedText variant="smallBold" color={theme.colors.textMuted}>
            Date: {new Date(slip.issuedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
          </ThemedText>
        </View>
      </View>

      {/* Prescribing Doctor Information */}
      <View style={styles.sectionBox}>
        <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
          Attending physician
        </ThemedText>
        {prescriberName ? (
          <ThemedText variant="bodyBold">{prescriberName}</ThemedText>
        ) : (
          <ThemedText variant="small" color={theme.colors.textMuted}>
            No prescriber recorded. Choose who you are working as in the sidebar before issuing slips.
          </ThemedText>
        )}
        {slip.doctorSpecialization ? (
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            {slip.doctorSpecialization}
          </ThemedText>
        ) : null}
        <View style={styles.credentialsRow}>
          {slip.doctorPrcLicense ? <Badge label={`PRC: ${slip.doctorPrcLicense}`} variant="primary" /> : null}
          {slip.doctorPtr ? <Badge label={`PTR: ${slip.doctorPtr}`} variant="primary" /> : null}
          {slip.doctorS2License ? <Badge label={`PDEA S2: ${slip.doctorS2License}`} variant="emergency" /> : null}
        </View>
      </View>

      {/* Patient Demographics */}
      <View style={styles.sectionBox}>
        <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
          Patient information
        </ThemedText>
        <View style={styles.patientGrid}>
          <View style={styles.patientCol}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Name
            </ThemedText>
            <ThemedText variant="bodyBold">{slip.patientName}</ThemedText>
          </View>
          <View style={styles.patientCol}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Age / sex
            </ThemedText>
            <ThemedText variant="small">
              {slip.patientAge} yrs · {slip.patientGender}
            </ThemedText>
          </View>
          <View style={styles.patientCol}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              PhilHealth PIN
            </ThemedText>
            <ThemedText variant="small">{slip.philHealthNumber || 'N/A'}</ThemedText>
          </View>
        </View>

        {slip.clinicalDiagnosis ? (
          <View style={styles.diagnosisRow}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Clinical diagnosis:
            </ThemedText>
            <ThemedText variant="smallBold" color={theme.colors.primaryDark}>
              {slip.clinicalDiagnosis}
            </ThemedText>
          </View>
        ) : null}

        {slip.patientAllergies ? (
          <View style={styles.allergyBox}>
            <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
            <ThemedText variant="captionBold" color={theme.colors.emergencyText} style={styles.flex}>
              Allergies: {slip.patientAllergies}
            </ThemedText>
          </View>
        ) : null}

        {slip.philHealthNumber && slip.isPhilHealthGamot ? (
          <View style={styles.gamotBox}>
            <ThemedText variant="captionBold" color={theme.colors.successText}>
              PhilHealth Yakap and GAMOT benefit
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.successText}>
              Beneficiary PIN: {slip.philHealthNumber}
              {slip.gamotCoverageAmount != null
                ? ` · Covered GAMOT allocation: ₱${slip.gamotCoverageAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                : ''}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Prescribed Medications (Generics Act RA 6675 Compliant) */}
      <View style={styles.sectionBox}>
        <View style={styles.sectionHeaderRow}>
          <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
            Medications prescribed
          </ThemedText>
          <Badge label="Generics Act (RA 6675)" variant="success" />
        </View>

        {slip.items && slip.items.length > 0 ? (
          slip.items.map((item, idx) => (
            <View key={item.itemId || idx} style={styles.rxItemCard}>
              <View style={styles.rxItemHeader}>
                <View style={styles.flex}>
                  <ThemedText variant="bodyBold">{item.genericName}</ThemedText>
                  {item.brandName ? (
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      ({item.brandName})
                    </ThemedText>
                  ) : null}
                </View>
                <Badge label={`Qty: ${item.quantity}`} variant="neutral" />
              </View>

              <ThemedText variant="small" color={theme.colors.textSecondary}>
                {item.dosage} · {item.form}
              </ThemedText>

              <View style={styles.sigBox}>
                <ThemedText variant="captionBold" color={theme.colors.textMuted}>
                  Directions (Sig)
                </ThemedText>
                <ThemedText variant="smallBold">{item.sig}</ThemedText>
              </View>

              <View style={styles.rxFooterRow}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Refills allowed: {item.refills}
                  {item.durationDays ? ` · Duration: ${item.durationDays} days` : ''}
                </ThemedText>
                {item.isDangerousDrug ? <Badge label="Dangerous drug (PDEA)" variant="emergency" /> : null}
              </View>

              {item.remarks ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Note: {item.remarks}
                </ThemedText>
              ) : null}

              {item.uniquePrescriptionSecurityCode ? (
                <View style={styles.upscBox}>
                  <ThemedText variant="captionBold" color={theme.colors.infoText}>
                    PhilHealth GAMOT security code (UPSC)
                  </ThemedText>
                  <ThemedText variant="code" color={theme.colors.infoText}>
                    {item.uniquePrescriptionSecurityCode}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          ))
        ) : (
          <ThemedText variant="small" color={theme.colors.textMuted}>
            No medications entered for this prescription.
          </ThemedText>
        )}
      </View>

      {/* Dispense and verification */}
      <View style={[styles.sectionBox, styles.interopSection]}>
        <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
          Dispensing and verification
        </ThemedText>

        <RxStageChip status={slip.pharmacyStatus} />

        {isDispensed && (
          <View style={styles.dispensedBanner}>
            <ThemedText variant="bodyBold" color={theme.colors.successText}>
              Dispensed by partner pharmacy
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Dispensed by {slip.dispensedPharmacyName || 'a partner pharmacy'} on{' '}
              {slip.dispensedAt ? new Date(slip.dispensedAt).toLocaleString() : 'N/A'}.
            </ThemedText>
            {slip.dispensedReceiptNumber ? (
              <ThemedText variant="captionBold" color={theme.colors.successText}>
                OR #: {slip.dispensedReceiptNumber}
              </ThemedText>
            ) : null}
          </View>
        )}

        {isDispensedExternally && (
          <View style={[styles.dispensedBanner, styles.externalDispensedBanner]}>
            <ThemedText variant="bodyBold" color={theme.colors.warningText}>
              Dispensed by an external pharmacy
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Purchased at {slip.dispensedPharmacyName || 'N/A'} · OR #{slip.dispensedReceiptNumber || 'N/A'}
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Pharmacist: {slip.dispensedPharmacistName || 'Not recorded'} (PRC: {slip.dispensedPharmacistPrc || 'N/A'})
            </ThemedText>
            {slip.dispensedAt ? (
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Date: {new Date(slip.dispensedAt).toLocaleDateString()}
              </ThemedText>
            ) : null}
            {slip.dispenseNotes ? (
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Notes: {slip.dispenseNotes}
              </ThemedText>
            ) : null}
          </View>
        )}

        {isPending && (
          <View style={styles.pathStack}>
            {/* Path A */}
            <View style={styles.pathCard}>
              <ThemedText variant="smallBold" color={theme.colors.primary}>
                Option A: Clinic EZ partner pharmacy
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                The electronic order is sent to the Clinic EZ partner pharmacy automatically, which can fill it from its own
                stock.
              </ThemedText>
            </View>

            {/* Path B */}
            <View style={styles.pathCard}>
              <ThemedText variant="smallBold" color={theme.colors.primary}>
                Option B: External pharmacy
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Present this slip to any accredited drugstore. The pharmacist can scan the QR code to verify it on the public
                portal.
              </ThemedText>

              {/* QR Code Payload Box */}
              <View style={styles.qrPayloadContainer}>
                <View style={styles.qrBox}>
                  <Icon name="scan" size={theme.sizes.iconLg} color={theme.colors.textInverted} />
                  <ThemedText variant="caption" color={theme.colors.textInverted} style={styles.centered}>
                    QR code
                  </ThemedText>
                </View>
                <View style={styles.flex}>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Encrypted payload
                  </ThemedText>
                  <ThemedText variant="code" color={theme.colors.text}>
                    {slip.qrPayload}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.portalLabel}>
                    Verification portal
                  </ThemedText>
                  <ThemedText variant="captionBold" color={theme.colors.primary}>
                    {slip.publicVerificationUrl}
                  </ThemedText>
                </View>
              </View>
            </View>

            {onOpenExternalDispense && (
              <Button title="Log external dispense" icon="receipt" onPress={onOpenExternalDispense} />
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    textAlign: 'center',
  },
  footerBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  letterhead: {
    alignItems: 'center',
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: theme.spacing.md,
  },
  sectionBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  credentialsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  patientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
  },
  patientCol: {
    minWidth: 120,
    gap: 2,
  },
  diagnosisRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    alignItems: 'center',
  },
  allergyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
  },
  gamotBox: {
    backgroundColor: theme.colors.successBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rxItemCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  rxItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  sigBox: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  rxFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  upscBox: {
    backgroundColor: theme.colors.infoBg,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.infoBorder,
  },
  interopSection: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  dispensedBanner: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  externalDispensedBanner: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  pathStack: {
    gap: theme.spacing.md,
  },
  pathCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  qrPayloadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  qrBox: {
    width: 72,
    height: 72,
    backgroundColor: theme.colors.surfaceInverse,
    borderRadius: theme.radii.sm,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xs,
    gap: 2,
  },
  portalLabel: {
    marginTop: theme.spacing.xs,
  },
});
