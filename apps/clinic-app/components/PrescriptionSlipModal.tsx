import React from 'react';
import { View, StyleSheet, ScrollView, Modal, Pressable, Alert } from 'react-native';
import ThemedText from './ui/ThemedText';
import { PrescriptionSlipData, clinicService } from '../services/clinicService';
import { openPrintableUrl } from '../utils/printHelper';

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
  if (!slip) return null;

  const isDispensed = slip.dispenseStatus === 'Dispensed';
  const isDispensedExternally = slip.dispenseStatus === 'DispensedExternally';
  const isPending = !isDispensed && !isDispensedExternally;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header Bar */}
          <View style={styles.topBar}>
            <ThemedText style={styles.topBarTitle}>Philippine Electronic Prescription Slip</ThemedText>
            <Pressable onPress={onClose} style={styles.closeIconBtn}>
              <ThemedText style={styles.closeIconText}>✕</ThemedText>
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {/* Clinic Letterhead */}
            <View style={styles.letterhead}>
              <ThemedText style={styles.rxSymbol}>℞</ThemedText>
              <ThemedText style={styles.clinicName}>{slip.clinicName}</ThemedText>
              <ThemedText style={styles.clinicDetails}>{slip.clinicAddress}</ThemedText>
              <ThemedText style={styles.clinicDetails}>{slip.clinicContact}</ThemedText>
              <View style={styles.divider} />
              <View style={styles.prescriptionMetaRow}>
                <ThemedText style={styles.prescriptionNumberText}>
                  Rx No: <ThemedText style={{ fontWeight: '800', color: '#0284C7' }}>{slip.prescriptionNumber}</ThemedText>
                </ThemedText>
                <ThemedText style={styles.issuedDateText}>
                  Date: {new Date(slip.issuedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                </ThemedText>
              </View>
            </View>

            {/* Prescribing Doctor Information */}
            <View style={styles.sectionBox}>
              <ThemedText style={styles.sectionHeading}>Attending Physician</ThemedText>
              <ThemedText style={styles.doctorName}>{slip.doctorName}</ThemedText>
              <ThemedText style={styles.doctorSpecialty}>{slip.doctorSpecialization || 'General Outpatient Medicine'}</ThemedText>
              <View style={styles.doctorCredentialsRow}>
                <ThemedText style={styles.credentialBadge}>PRC: {slip.doctorPrcLicense}</ThemedText>
                {slip.doctorPtr && <ThemedText style={styles.credentialBadge}>PTR: {slip.doctorPtr}</ThemedText>}
                {slip.doctorS2License && (
                  <ThemedText style={[styles.credentialBadge, styles.pdeaBadge]}>
                    PDEA S2: {slip.doctorS2License}
                  </ThemedText>
                )}
              </View>
            </View>

            {/* Patient Demographics */}
            <View style={styles.sectionBox}>
              <ThemedText style={styles.sectionHeading}>Patient Information</ThemedText>
              <View style={styles.patientGrid}>
                <View style={styles.patientCol}>
                  <ThemedText style={styles.metaLabel}>Name</ThemedText>
                  <ThemedText style={styles.metaValueBold}>{slip.patientName}</ThemedText>
                </View>
                <View style={styles.patientCol}>
                  <ThemedText style={styles.metaLabel}>Age / Sex</ThemedText>
                  <ThemedText style={styles.metaValue}>{slip.patientAge} yrs • {slip.patientGender}</ThemedText>
                </View>
                <View style={styles.patientCol}>
                  <ThemedText style={styles.metaLabel}>PhilHealth PIN</ThemedText>
                  <ThemedText style={styles.metaValue}>{slip.philHealthNumber || 'N/A'}</ThemedText>
                </View>
              </View>

              {slip.clinicalDiagnosis && (
                <View style={styles.diagnosisRow}>
                  <ThemedText style={styles.metaLabel}>Clinical Diagnosis:</ThemedText>
                  <ThemedText style={styles.diagnosisValue}>{slip.clinicalDiagnosis}</ThemedText>
                </View>
              )}

              {slip.patientAllergies && (
                <View style={styles.allergyWarningBox}>
                  <ThemedText style={styles.allergyWarningText}>⚠️ ALLERGIES: {slip.patientAllergies}</ThemedText>
                </View>
              )}

              {slip.philHealthNumber && (
                <View style={styles.gamotBannerBox}>
                  <ThemedText style={styles.gamotBannerTitle}>🛡️ PHILHEALTH YAKAP & GAMOT BENEFIT</ThemedText>
                  <ThemedText style={styles.gamotBannerSub}>
                    Beneficiary PIN: {slip.philHealthNumber} • Covered under annual ₱20,000.00 GAMOT allocation (PhilHealth Outpatient Drug Benefit).
                  </ThemedText>
                </View>
              )}
            </View>

            {/* Prescribed Medications (Generics Act RA 6675 Compliant) */}
            <View style={styles.sectionBox}>
              <View style={styles.sectionHeaderRow}>
                <ThemedText style={styles.sectionHeading}>Medications Prescribed</ThemedText>
                <ThemedText style={styles.genericsActBadge}>RA 6675 Generics Act Compliant</ThemedText>
              </View>

              {slip.items && slip.items.length > 0 ? (
                slip.items.map((item, idx) => (
                  <View key={item.itemId || idx} style={styles.rxItemCard}>
                    <View style={styles.rxItemHeader}>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.genericNameText}>{item.genericName}</ThemedText>
                        {item.brandName && (
                          <ThemedText style={styles.brandNameText}>({item.brandName})</ThemedText>
                        )}
                      </View>
                      <ThemedText style={styles.quantityBadge}>Qty: {item.quantity}</ThemedText>
                    </View>

                    <ThemedText style={styles.dosageFormText}>
                      {item.dosage} • {item.form}
                    </ThemedText>

                    <View style={styles.sigBox}>
                      <ThemedText style={styles.sigLabel}>Sig / Directions:</ThemedText>
                      <ThemedText style={styles.sigText}>{item.sig}</ThemedText>
                    </View>

                    <View style={styles.rxFooterRow}>
                      <ThemedText style={styles.refillsText}>
                        Refills allowed: {item.refills}
                        {item.durationDays ? ` • Duration: ${item.durationDays} days` : ''}
                      </ThemedText>
                      {item.isDangerousDrug && (
                        <ThemedText style={styles.dangerousDrugTag}>⚠️ Dangerous Drug (PDEA)</ThemedText>
                      )}
                    </View>

                    {item.remarks && (
                      <ThemedText style={styles.rxRemarksText}>Note: {item.remarks}</ThemedText>
                    )}

                    {item.uniquePrescriptionSecurityCode && (
                      <View style={styles.upscItemBox}>
                        <ThemedText style={styles.upscLabel}>🛡️ PhilHealth GAMOT Security Code (UPSC):</ThemedText>
                        <ThemedText style={styles.upscValue}>{item.uniquePrescriptionSecurityCode}</ThemedText>
                      </View>
                    )}
                  </View>
                ))
              ) : (
                <ThemedText style={{ color: '#6B7280', fontSize: 13, fontStyle: 'italic' }}>
                  No medications entered for this prescription.
                </ThemedText>
              )}
            </View>

            {/* Dual-Path Dispense & Verification Section */}
            <View style={[styles.sectionBox, styles.interopSection]}>
              <ThemedText style={styles.sectionHeading}>Dual-Path Dispense & Verification</ThemedText>

              {/* Status Header */}
              {isDispensed && (
                <View style={styles.dispensedBanner}>
                  <ThemedText style={styles.dispensedBannerTitle}>✓ DISPENSED BY PARTNER PHARMACY</ThemedText>
                  <ThemedText style={styles.dispensedBannerSub}>
                    Dispensed by {slip.dispensedPharmacyName || 'ClinicEz Partner Pharmacy'} on{' '}
                    {slip.dispensedAt ? new Date(slip.dispensedAt).toLocaleString() : 'N/A'}.
                  </ThemedText>
                  {slip.dispensedReceiptNumber && (
                    <ThemedText style={styles.receiptTag}>OR #: {slip.dispensedReceiptNumber}</ThemedText>
                  )}
                </View>
              )}

              {isDispensedExternally && (
                <View style={[styles.dispensedBanner, styles.externalDispensedBanner]}>
                  <ThemedText style={styles.externalBannerTitle}>✓ DISPENSED EXTERNALLY (PATH B)</ThemedText>
                  <ThemedText style={styles.dispensedBannerSub}>
                    Purchased at {slip.dispensedPharmacyName} • OR #{slip.dispensedReceiptNumber || 'N/A'}
                  </ThemedText>
                  <ThemedText style={styles.dispensedBannerSub}>
                    Pharmacist: {slip.dispensedPharmacistName || 'Licensed Pharmacist'} (PRC: {slip.dispensedPharmacistPrc || 'N/A'})
                  </ThemedText>
                  {slip.dispensedAt && (
                    <ThemedText style={styles.dispensedBannerSub}>
                      Date: {new Date(slip.dispensedAt).toLocaleDateString()}
                    </ThemedText>
                  )}
                  {slip.dispenseNotes && (
                    <ThemedText style={styles.dispensedNotes}>Notes: {slip.dispenseNotes}</ThemedText>
                  )}
                </View>
              )}

              {isPending && (
                <View style={{ gap: 10 }}>
                  {/* Path A */}
                  <View style={styles.pathCard}>
                    <View style={styles.pathHeader}>
                      <ThemedText style={styles.pathTagA}>PATH A: CLINICEZ PARTNER PHARMACY</ThemedText>
                      <ThemedText style={styles.liveIndicator}>● AMQPS PORT 5671</ThemedText>
                    </View>
                    <ThemedText style={styles.pathDescription}>
                      Electronic order automatically broadcasted to ClinicEz partner pharmacy via RabbitMQ message queue. Pharmacist FEFO batch allocation enabled.
                    </ThemedText>
                  </View>

                  {/* Path B */}
                  <View style={styles.pathCard}>
                    <View style={styles.pathHeader}>
                      <ThemedText style={styles.pathTagB}>PATH B: EXTERNAL PHARMACY (MERCURY / WATSONS / ROSE)</ThemedText>
                    </View>
                    <ThemedText style={styles.pathDescription}>
                      Present this slip to any accredited external drugstore. Pharmacists can scan the QR code to verify validity on the public portal.
                    </ThemedText>

                    {/* QR Code Payload Box */}
                    <View style={styles.qrPayloadContainer}>
                      <View style={styles.qrBox}>
                        <ThemedText style={styles.qrIcon}>📱</ThemedText>
                        <ThemedText style={styles.qrPlaceholderText}>QR VERIFICATION CODE</ThemedText>
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.qrPayloadLabel}>Encrypted Payload:</ThemedText>
                        <ThemedText style={styles.qrPayloadValue}>{slip.qrPayload}</ThemedText>
                        <ThemedText style={styles.portalUrlLabel}>Verification Portal:</ThemedText>
                        <ThemedText style={styles.portalUrlValue}>{slip.publicVerificationUrl}</ThemedText>
                      </View>
                    </View>
                  </View>

                  {/* External Dispense Action Button */}
                  {onOpenExternalDispense && (
                    <Pressable
                      style={styles.logExternalBtn}
                      onPress={onOpenExternalDispense}
                    >
                      <ThemedText style={styles.logExternalBtnText}>
                        🏥 Log External Dispense (Mercury Drug / Watsons / Rose Pharmacy)
                      </ThemedText>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Modal Footer */}
          <View style={styles.footerBar}>
            <Pressable
              style={styles.printBtn}
              onPress={async () => {
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
              }}
            >
              <ThemedText style={styles.printBtnText}>🖨️ Download / Print Official PDF</ThemedText>
            </Pressable>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <ThemedText style={styles.closeBtnText}>Close</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 620,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  topBarTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeIconBtn: {
    padding: 6,
  },
  closeIconText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  letterhead: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 14,
  },
  rxSymbol: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0284C7',
    marginBottom: 4,
  },
  clinicName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  clinicDetails: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    width: '100%',
    marginVertical: 10,
  },
  prescriptionMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
  },
  prescriptionNumberText: {
    fontSize: 13,
    color: '#334155',
  },
  issuedDateText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  sectionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 8,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  doctorName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  doctorSpecialty: {
    fontSize: 12,
    color: '#64748B',
  },
  doctorCredentialsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  credentialBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0369A1',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  pdeaBadge: {
    color: '#991B1B',
    backgroundColor: '#FEE2E2',
    fontWeight: '700',
  },
  patientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  patientCol: {
    minWidth: 120,
  },
  metaLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 13,
    color: '#1E293B',
  },
  metaValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  diagnosisRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  diagnosisValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0369A1',
  },
  allergyWarningBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
  },
  allergyWarningText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  genericsActBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rxItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    gap: 6,
  },
  rxItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  genericNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  brandNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    fontStyle: 'italic',
  },
  quantityBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  dosageFormText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  sigBox: {
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#0284C7',
  },
  sigLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sigText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 2,
  },
  rxFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  refillsText: {
    fontSize: 11,
    color: '#64748B',
  },
  dangerousDrugTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#991B1B',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rxRemarksText: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  interopSection: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  dispensedBanner: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  externalDispensedBanner: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  dispensedBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  externalBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  dispensedBannerSub: {
    fontSize: 12,
    color: '#374151',
  },
  receiptTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
    marginTop: 2,
  },
  dispensedNotes: {
    fontSize: 11,
    color: '#4B5563',
    fontStyle: 'italic',
    marginTop: 2,
  },
  pathCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 6,
  },
  pathHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pathTagA: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284C7',
  },
  pathTagB: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0D9488',
  },
  liveIndicator: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16A34A',
  },
  pathDescription: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  qrPayloadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 10,
    gap: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrBox: {
    width: 68,
    height: 68,
    backgroundColor: '#0F172A',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  qrIcon: {
    fontSize: 22,
  },
  qrPlaceholderText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 2,
  },
  qrPayloadLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  qrPayloadValue: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: 'monospace',
  },
  portalUrlLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
  },
  portalUrlValue: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0284C7',
  },
  logExternalBtn: {
    backgroundColor: '#0D9488',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  logExternalBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  footerBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    gap: 10,
  },
  printBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  printBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  closeBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 6,
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gamotBannerBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    gap: 2,
  },
  gamotBannerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  gamotBannerSub: {
    fontSize: 11,
    color: '#166534',
  },
  upscItemBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    padding: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  upscLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1E40AF',
    textTransform: 'uppercase',
  },
  upscValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    fontFamily: 'monospace',
    marginTop: 2,
  },
});
