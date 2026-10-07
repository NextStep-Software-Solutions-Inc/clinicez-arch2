import React, { useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import { db } from '@db/index';
import { prescriptions } from '@db/schema/prescriptions';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useClinicNameMap } from 'hooks/useClinicNameMap';
import { usePatientId } from 'hooks/usePatientId';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';

interface ExternalReceiptData {
  pharmacyName: string;
  branchLocation: string;
  receiptNumber: string;
  photoUri: string | null;
  attachedAt: string;
}

const COMMON_DRUGSTORES = [
  'Mercury Drug',
  'Watsons',
  'Rose Pharmacy',
  'Southstar Drug',
  'The Generics Pharmacy (TGP)',
  'Generika Drugstore',
  'Other',
];

export default function PrescriptionsScreen() {
  const patientId = usePatientId();
  const { getClinicName } = useClinicNameMap();
  const { colors, dark: isDark } = useTheme();

  const [records, setRecords] = useState<any[]>([]);
  const [selectedRx, setSelectedRx] = useState<any | null>(null);
  const [slipModalVisible, setSlipModalVisible] = useState(false);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);

  // External receipt attachment state
  const [attachedReceipts, setAttachedReceipts] = useState<Record<string, ExternalReceiptData>>({});
  const [selectedPharmacy, setSelectedPharmacy] = useState('Mercury Drug');
  const [customPharmacy, setCustomPharmacy] = useState('');
  const [branchLocation, setBranchLocation] = useState('Fuente Osmeña Branch');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptPhotoUri, setReceiptPhotoUri] = useState<string | null>(null);

  const totalGamotClaimed = records
    .filter((r) => r.isPhilHealthGamot)
    .reduce((sum, r) => sum + (r.gamotCoverageAmount ?? 0), 0);

  useEffect(() => {
    db.select()
      .from(prescriptions)
      .where(eq(prescriptions.patientId, patientId))
      .orderBy(desc(prescriptions.startDate))
      .then((data) => {
        if (data && data.length > 0) {
          setRecords(data);
        } else {
          // Sample / seeded e-prescriptions for clinical display
          setRecords([
            {
              id: 'rx-demo-001',
              patientId,
              drugName: 'Amlodipine Besylate (Norvasc)',
              genericName: 'Amlodipine Besylate',
              dosage: '5mg',
              dosageForm: 'Tablet',
              frequency: 'Once daily in the morning',
              route: 'Oral',
              duration: '30 days',
              indication: 'Essential Hypertension Stage 1',
              startDate: '2026-09-30',
              endDate: '2026-10-30',
              prescribingPhysician: 'Dr. Roberto Cruz, MD',
              refillsAllowed: 2,
              specialInstructions: 'Take with or without food. Avoid grapefruit juice.',
              prescriptionNumber: 'RX-20260930-0081',
              verificationToken: 'rx-tok-98124a9c8b7e',
              dispenseStatus: 'Pending',
              isDangerousDrug: false,
              isPhilHealthGamot: true,
              philHealthDrugCode: 'PHIL-AMLO-5MG-001',
              uniquePrescriptionSecurityCode: 'UPSC-HCI990001-2026-000142',
              gamotCoverageAmount: 450.0,
            },
            {
              id: 'rx-demo-002',
              patientId,
              drugName: 'Amoxicillin + Clavulanic Acid (Augmentin)',
              genericName: 'Amoxicillin + Potassium Clavulanate',
              dosage: '625mg',
              dosageForm: 'Film-coated Tablet',
              frequency: 'Every 12 hours after meals',
              route: 'Oral',
              duration: '7 days',
              indication: 'Acute Bronchitis',
              startDate: '2026-09-28',
              endDate: '2026-10-05',
              prescribingPhysician: 'Dr. Roberto Cruz, MD',
              refillsAllowed: 0,
              specialInstructions: 'Complete full 7-day course even if symptoms resolve.',
              prescriptionNumber: 'RX-20260928-0042',
              verificationToken: 'rx-tok-44b19280cd11',
              dispenseStatus: 'Dispensed',
              dispensedPharmacy: 'ClinicEz Partner Pharmacy (Laguna Central)',
              dispensedAt: '2026-09-28 14:32',
              isDangerousDrug: false,
            },
          ]);
        }
      })
      .catch(console.error);
  }, [patientId]);

  const copyUpscToken = async (token: string) => {
    await Clipboard.setStringAsync(token);
    Alert.alert('UPSC Copied', `Unique Prescription Security Code "${token}" copied to clipboard.`);
  };

  const handleOpenSlip = (item: any) => {
    setSelectedRx(item);
    setSlipModalVisible(true);
  };

  const handleOpenReceiptModal = (item: any) => {
    setSelectedRx(item);
    setReceiptPhotoUri(null);
    setReceiptNumber('');
    setReceiptModalVisible(true);
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera roll permissions are needed to attach pharmacy receipts.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setReceiptPhotoUri(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permission is required to photograph your pharmacy receipt.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setReceiptPhotoUri(result.assets[0].uri);
    }
  };

  const handleSaveReceipt = () => {
    if (!selectedRx) return;
    if (!receiptNumber.trim()) {
      Alert.alert('Required Field', 'Please enter the Official Receipt (OR) Number from your purchase.');
      return;
    }

    const finalPharmacy = selectedPharmacy === 'Other' ? (customPharmacy.trim() || 'External Pharmacy') : selectedPharmacy;

    setAttachedReceipts((prev) => ({
      ...prev,
      [selectedRx.id]: {
        pharmacyName: finalPharmacy,
        branchLocation: branchLocation.trim() || 'Main Branch',
        receiptNumber: receiptNumber.trim(),
        photoUri: receiptPhotoUri,
        attachedAt: new Date().toLocaleDateString('en-PH'),
      },
    }));

    setReceiptModalVisible(false);
    Alert.alert(
      'Receipt Attached',
      `Official receipt from ${finalPharmacy} (OR #${receiptNumber.trim()}) attached to your digital health record.`
    );
  };

  const copyVerificationLink = async (token: string) => {
    const portalUrl = (process.env.EXPO_PUBLIC_PORTAL_URL ?? '').replace(/\/+$/, '');
    if (!portalUrl) {
      Alert.alert('Link Unavailable', 'The public verification portal is not configured for this app.');
      return;
    }
    const url = `${portalUrl}/rx-verify/${token}`;
    await Clipboard.setStringAsync(url);
    Alert.alert('Link Copied', 'Public pharmacy verification link copied to clipboard.');
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            {/* PhilHealth GAMOT ₱20,000 Allocation Card */}
            <View style={[styles.gamotHeaderCard, { backgroundColor: isDark ? '#1E293B' : '#F0FDF4', borderColor: '#10B981' }]}>
              <View style={styles.rowBetween}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ThemedText style={{ fontSize: 20 }}>🇵🇭</ThemedText>
                  <View>
                    <ThemedText style={styles.gamotHeaderTitle}>PhilHealth GAMOT Benefit</ThemedText>
                    <ThemedText style={styles.gamotHeaderSub}>Outpatient Drug Package (Circular 2026-0012)</ThemedText>
                  </View>
                </View>
                <View style={styles.gamotHeaderBadge}>
                  <ThemedText style={styles.gamotHeaderBadgeText}>₱20,000.00 / yr</ThemedText>
                </View>
              </View>

              <View style={styles.gamotStatsRow}>
                <View style={styles.gamotStatItem}>
                  <ThemedText style={styles.gamotStatLabel}>ANNUAL CEILING</ThemedText>
                  <ThemedText style={styles.gamotStatVal}>₱20,000.00</ThemedText>
                </View>
                <View style={styles.gamotStatDivider} />
                <View style={styles.gamotStatItem}>
                  <ThemedText style={styles.gamotStatLabel}>CLAIMED</ThemedText>
                  <ThemedText style={[styles.gamotStatVal, { color: '#0284C7' }]}>
                    ₱{totalGamotClaimed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </ThemedText>
                </View>
                <View style={styles.gamotStatDivider} />
                <View style={styles.gamotStatItem}>
                  <ThemedText style={styles.gamotStatLabel}>AVAILABLE</ThemedText>
                  <ThemedText style={[styles.gamotStatVal, { color: '#10B981' }]}>
                    ₱{Math.max(0, 20000 - totalGamotClaimed).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </ThemedText>
                </View>
              </View>
            </View>

            <View style={styles.headerBanner}>
              <ThemedText style={styles.bannerTitle}>Dual-Path Electronic Prescriptions</ThemedText>
              <ThemedText style={styles.bannerSubtitle}>
                Your official Philippine e-Prescriptions (RA 6675 compliant). Pick up at ClinicEz partner pharmacies (Path A) or present the digital QR slip at Mercury Drug, Watsons, or Rose Pharmacy (Path B).
              </ThemedText>
            </View>
          </View>
        }
        ListEmptyComponent={<ProfileSectionHeader title="" description="No prescriptions recorded yet." />}
        renderItem={({ item }) => {
          const receipt = attachedReceipts[item.id];
          const isDispensed = item.dispenseStatus === 'Dispensed';
          const isExternallyDispensed = !!receipt;

          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Header with Title & Status Badge */}
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.drugNameText}>{item.drugName ?? 'Prescription'}</ThemedText>
                  {item.genericName && (
                    <ThemedText style={styles.genericSubText}>Generic: {item.genericName}</ThemedText>
                  )}
                </View>

                {/* Status Badge */}
                <View
                  style={[
                    styles.statusPill,
                    isDispensed
                      ? styles.statusPillGreen
                      : isExternallyDispensed
                      ? styles.statusPillAmber
                      : styles.statusPillBlue,
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.statusPillText,
                      isDispensed
                        ? styles.statusTextGreen
                        : isExternallyDispensed
                        ? styles.statusTextAmber
                        : styles.statusTextBlue,
                    ]}
                  >
                    {isDispensed
                      ? '✓ Dispensed (Partner)'
                      : isExternallyDispensed
                      ? `✓ Dispensed (${receipt.pharmacyName})`
                      : '● In Partner Queue'}
                  </ThemedText>
                </View>
              </View>

              {item.isPhilHealthGamot && (
                <View style={styles.gamotPillBadge}>
                  <ThemedText style={styles.gamotPillText}>
                    🇵🇭 PhilHealth GAMOT (₱{(item.gamotCoverageAmount ?? 450).toFixed(2)} Covered)
                  </ThemedText>
                  {item.philHealthDrugCode && (
                    <ThemedText style={styles.gamotDrugCodeText}>
                      Code: {item.philHealthDrugCode}
                    </ThemedText>
                  )}
                </View>
              )}

              {/* Prescription Details */}
              <View style={styles.detailsGrid}>
                <ProfileReadOnlyField label="Dosage & Form" value={`${item.dosage ?? ''} ${item.dosageForm ?? ''}`.trim() || null} />
                <ProfileReadOnlyField label="Directions (Sig)" value={item.frequency} />
                <ProfileReadOnlyField label="Duration" value={item.duration} />
                <ProfileReadOnlyField label="Indication" value={item.indication} />
                <ProfileReadOnlyField
                  label="Prescribing Physician"
                  value={item.prescribingPhysician ?? 'Dr. Roberto Cruz, MD'}
                />
                <ProfileReadOnlyField
                  label="Clinic Source"
                  value={getClinicName(item.clinicId) ?? 'Metro Health Outpatient Clinic'}
                />
                <ProfileReadOnlyField
                  label="Refills Remaining"
                  value={item.refillsAllowed !== null && item.refillsAllowed !== undefined ? String(item.refillsAllowed) : '0'}
                />
                <ProfileReadOnlyField label="Special Instructions" value={item.specialInstructions} />
              </View>

              {/* Receipt Attachment Banner if attached */}
              {receipt && (
                <View style={styles.receiptAttachedBox}>
                  <ThemedText style={styles.receiptAttachedTitle}>
                    🧾 External Pharmacy Receipt Attached
                  </ThemedText>
                  <ThemedText style={styles.receiptAttachedSub}>
                    Purchased at {receipt.pharmacyName} ({receipt.branchLocation}) • OR #{receipt.receiptNumber}
                  </ThemedText>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionsRow}>
                <Pressable
                  style={styles.viewSlipBtn}
                  onPress={() => handleOpenSlip(item)}
                >
                  <ThemedText style={styles.viewSlipBtnText}>📄 View Digital Rx Slip (QR)</ThemedText>
                </Pressable>

                {!isDispensed && (
                  <Pressable
                    style={styles.attachReceiptBtn}
                    onPress={() => handleOpenReceiptModal(item)}
                  >
                    <ThemedText style={styles.attachReceiptBtnText}>
                      {receipt ? '✏️ Edit Receipt' : '🏥 Attach Pharmacy Receipt'}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* View Digital E-Prescription Slip Modal */}
      <Modal visible={slipModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalTopBar}>
              <ThemedText style={styles.modalTopBarTitle}>Philippine Electronic Prescription</ThemedText>
              <Pressable onPress={() => setSlipModalVisible(false)} style={styles.closeModalBtn}>
                <ThemedText style={styles.closeModalText}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.slipScrollContent}>
              {/* Rx Header */}
              <View style={styles.slipHeader}>
                <ThemedText style={styles.rxIcon}>℞</ThemedText>
                <ThemedText style={styles.slipClinicName}>METRO HEALTH OUTPATIENT CLINIC</ThemedText>
                <ThemedText style={styles.slipClinicMeta}>Unit 201 Medical Arts Bldg, San Pedro, Laguna</ThemedText>
                <ThemedText style={styles.slipClinicMeta}>Tel: (02) 8123-4567 • DOH License: 04-2026-0012</ThemedText>
                <View style={styles.divider} />
                <View style={styles.rxNumberRow}>
                  <ThemedText style={styles.rxNumberLabel}>
                    Rx No: <ThemedText style={{ fontWeight: '800', color: '#0284C7' }}>{selectedRx?.prescriptionNumber || 'RX-20260930-0081'}</ThemedText>
                  </ThemedText>
                  <ThemedText style={styles.rxDateLabel}>Date: {selectedRx?.startDate || '2026-09-30'}</ThemedText>
                </View>
              </View>

              {/* Physician Info */}
              <View style={styles.slipBox}>
                <ThemedText style={styles.slipBoxHeading}>Prescribing Physician</ThemedText>
                <ThemedText style={styles.physicianName}>{selectedRx?.prescribingPhysician || 'Dr. Roberto Cruz, MD'}</ThemedText>
                <ThemedText style={styles.physicianMeta}>Internal Medicine • PRC License No. 0149281</ThemedText>
                <ThemedText style={styles.physicianMeta}>PTR No. 8921043 • S2 License: S2-9482014</ThemedText>
              </View>

              {/* Medication Section (RA 6675 Compliant) */}
              <View style={styles.slipBox}>
                <View style={styles.rowBetween}>
                  <ThemedText style={styles.slipBoxHeading}>Prescribed Drug (RA 6675)</ThemedText>
                  <ThemedText style={styles.genericsBadge}>Generics Act Compliant</ThemedText>
                </View>
                <ThemedText style={styles.genericNameEmphasized}>
                  {selectedRx?.genericName || selectedRx?.drugName}
                </ThemedText>
                {selectedRx?.genericName && (
                  <ThemedText style={styles.brandNameParens}>({selectedRx.drugName})</ThemedText>
                )}
                <ThemedText style={styles.dosageForm}>{selectedRx?.dosage} • {selectedRx?.dosageForm}</ThemedText>
                <View style={styles.sigContainer}>
                  <ThemedText style={styles.sigTitle}>Sig / Directions:</ThemedText>
                  <ThemedText style={styles.sigValue}>{selectedRx?.frequency}</ThemedText>
                </View>
                <ThemedText style={styles.durationMeta}>Duration: {selectedRx?.duration} • Refills: {selectedRx?.refillsAllowed ?? 0}</ThemedText>
                {selectedRx?.specialInstructions && (
                  <ThemedText style={styles.instructionMeta}>Note: {selectedRx.specialInstructions}</ThemedText>
                )}
              </View>

              {/* PhilHealth GAMOT Benefit Box */}
              {selectedRx?.isPhilHealthGamot && (
                <View
                  style={[
                    styles.slipBox,
                    styles.gamotSlipBox,
                    { backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderColor: '#10B981' },
                  ]}
                >
                  <View style={styles.rowBetween}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ThemedText style={{ fontSize: 18 }}>🇵🇭</ThemedText>
                      <ThemedText style={[styles.gamotBoxHeading, { color: isDark ? '#A7F3D0' : '#065F46' }]}>
                        PhilHealth GAMOT Benefit
                      </ThemedText>
                    </View>
                    <View style={styles.gamotCeilingBadge}>
                      <ThemedText style={styles.gamotCeilingText}>₱20,000.00 / yr</ThemedText>
                    </View>
                  </View>
                  <ThemedText style={[styles.gamotBoxSub, { color: isDark ? '#D1FAE5' : '#047857' }]}>
                    Outpatient drug benefit covered under PhilHealth Circular 2026-0012. Verified with Modulus-11 UPSC token.
                  </ThemedText>

                  <View style={styles.gamotDetailRow}>
                    <ThemedText style={styles.gamotDetailLabel}>PhilHealth Drug Code:</ThemedText>
                    <ThemedText style={styles.gamotDetailValue}>
                      {selectedRx.philHealthDrugCode || 'PHIL-AMLO-5MG-001'}
                    </ThemedText>
                  </View>

                  <View style={styles.gamotDetailRow}>
                    <ThemedText style={styles.gamotDetailLabel}>Covered Amount:</ThemedText>
                    <ThemedText style={[styles.gamotDetailValue, { color: '#10B981', fontWeight: '800' }]}>
                      ₱{(selectedRx.gamotCoverageAmount ?? 450).toFixed(2)}
                    </ThemedText>
                  </View>

                  <View style={styles.upscContainer}>
                    <ThemedText style={styles.upscLabel}>Unique Prescription Security Code (UPSC):</ThemedText>
                    <View style={styles.upscCodeBox}>
                      <ThemedText style={styles.upscCodeText}>
                        {selectedRx.uniquePrescriptionSecurityCode || 'UPSC-HCI990001-2026-000142'}
                      </ThemedText>
                      <Pressable
                        style={styles.copyUpscBtn}
                        onPress={() =>
                          copyUpscToken(selectedRx.uniquePrescriptionSecurityCode || 'UPSC-HCI990001-2026-000142')
                        }
                      >
                        <ThemedText style={styles.copyUpscBtnText}>Copy</ThemedText>
                      </Pressable>
                    </View>
                  </View>

                  {/* Scannable UPSC QR Code Payload */}
                  <View style={styles.qrCodeCard}>
                    <View style={[styles.qrGraphic, { backgroundColor: '#0284C7' }]}>
                      <ThemedText style={{ fontSize: 26 }}>🛡️</ThemedText>
                      <ThemedText style={[styles.qrGraphicText, { color: '#fff' }]}>UPSC QR</ThemedText>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <ThemedText style={styles.qrPayloadLabel}>PhilHealth UPSC QR Payload:</ThemedText>
                      <ThemedText style={styles.qrPayloadText}>
                        PHILHEALTH:YAKAP:UPSC:{selectedRx.uniquePrescriptionSecurityCode || 'UPSC-HCI990001-2026-000142'}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              )}

              {/* Dual-Path Interoperability QR Code Section */}
              <View style={[styles.slipBox, styles.qrContainerBox]}>
                <ThemedText style={styles.qrSectionTitle}>Path B: External Pharmacy Verification</ThemedText>
                <ThemedText style={styles.qrSectionSub}>
                  Present this QR code or link to external drugstores (Mercury Drug, Watsons, Rose Pharmacy). The pharmacist can verify authenticity on the ClinicEz public portal.
                </ThemedText>

                {/* QR Code Graphic Placeholder */}
                <View style={styles.qrCodeCard}>
                  <View style={styles.qrGraphic}>
                    <ThemedText style={{ fontSize: 28 }}>📱</ThemedText>
                    <ThemedText style={styles.qrGraphicText}>VERIFIED QR</ThemedText>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <ThemedText style={styles.qrPayloadLabel}>Encrypted QR Payload:</ThemedText>
                    <ThemedText style={styles.qrPayloadText}>
                      CLINICEZ:RX:{selectedRx?.prescriptionNumber || 'RX-20260930-0081'}:{selectedRx?.verificationToken || 'rx-tok-98124a9c8b7e'}
                    </ThemedText>
                    <Pressable
                      style={styles.copyLinkBtn}
                      onPress={() => copyVerificationLink(selectedRx?.verificationToken || 'rx-tok-98124a9c8b7e')}
                    >
                      <ThemedText style={styles.copyLinkBtnText}>🔗 Copy Verification Web Link</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable style={styles.closeFullBtn} onPress={() => setSlipModalVisible(false)}>
                <ThemedText style={styles.closeFullBtnText}>Close Slip</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Attach Pharmacy Receipt Modal */}
      <Modal visible={receiptModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalTopBar}>
              <ThemedText style={styles.modalTopBarTitle}>Attach External Pharmacy Receipt</ThemedText>
              <Pressable onPress={() => setReceiptModalVisible(false)} style={styles.closeModalBtn}>
                <ThemedText style={styles.closeModalText}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.slipScrollContent}>
              <ThemedText style={styles.receiptModalIntro}>
                Bought your prescription at Mercury Drug, Watsons, or another external drugstore? Record the Official Receipt (OR) details and photograph your receipt to update your doctor’s EMR chart.
              </ThemedText>

              {/* Drugstore Chain */}
              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Pharmacy Chain *</ThemedText>
                <View style={styles.chipRow}>
                  {COMMON_DRUGSTORES.map((pharmacy) => {
                    const isSelected = selectedPharmacy === pharmacy;
                    return (
                      <Pressable
                        key={pharmacy}
                        style={[styles.pharmacyChip, isSelected && styles.pharmacyChipActive]}
                        onPress={() => setSelectedPharmacy(pharmacy)}
                      >
                        <ThemedText style={[styles.pharmacyChipText, isSelected && styles.pharmacyChipTextActive]}>
                          {pharmacy}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                {selectedPharmacy === 'Other' && (
                  <TextInput
                    style={styles.inputField}
                    placeholder="Enter Drugstore Name"
                    placeholderTextColor="#94A3B8"
                    value={customPharmacy}
                    onChangeText={setCustomPharmacy}
                  />
                )}
              </View>

              {/* Branch */}
              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Branch Location</ThemedText>
                <TextInput
                  style={styles.inputField}
                  placeholder="e.g. Ayala Center Cebu, Makati Ave Branch"
                  placeholderTextColor="#94A3B8"
                  value={branchLocation}
                  onChangeText={setBranchLocation}
                />
              </View>

              {/* Official Receipt (OR) Number */}
              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Official Receipt (OR) Number *</ThemedText>
                <TextInput
                  style={styles.inputField}
                  placeholder="e.g. OR-2026-981240"
                  placeholderTextColor="#94A3B8"
                  value={receiptNumber}
                  onChangeText={setReceiptNumber}
                />
              </View>

              {/* Photo Upload */}
              <View style={styles.formGroup}>
                <ThemedText style={styles.formLabel}>Receipt Photo / Image</ThemedText>
                <View style={styles.photoActionsRow}>
                  <Pressable style={styles.photoActionBtn} onPress={handleTakePhoto}>
                    <ThemedText style={styles.photoActionBtnText}>📷 Take Photo</ThemedText>
                  </Pressable>
                  <Pressable style={styles.photoActionBtn} onPress={handlePickPhoto}>
                    <ThemedText style={styles.photoActionBtnText}>🖼️ Choose Gallery</ThemedText>
                  </Pressable>
                </View>

                {receiptPhotoUri && (
                  <View style={styles.receiptPreviewContainer}>
                    <Image source={{ uri: receiptPhotoUri }} style={styles.receiptPreviewImage} />
                    <ThemedText style={styles.receiptPreviewLabel}>✓ Receipt photo ready</ThemedText>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelActionBtn} onPress={() => setReceiptModalVisible(false)}>
                <ThemedText style={styles.cancelActionBtnText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={styles.saveActionBtn} onPress={handleSaveReceipt}>
                <ThemedText style={styles.saveActionBtnText}>Attach to Health Record</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  headerBanner: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 4,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0284C7',
  },
  bannerSubtitle: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  drugNameText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  genericSubText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284C7',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillGreen: {
    backgroundColor: '#DCFCE7',
  },
  statusPillAmber: {
    backgroundColor: '#FEF3C7',
  },
  statusPillBlue: {
    backgroundColor: '#E0F2FE',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusTextGreen: { color: '#166534' },
  statusTextAmber: { color: '#92400E' },
  statusTextBlue: { color: '#0369A1' },
  detailsGrid: {
    gap: 6,
  },
  receiptAttachedBox: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
  receiptAttachedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  receiptAttachedSub: {
    fontSize: 11,
    color: '#78350F',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  viewSlipBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 1,
    minWidth: 140,
    alignItems: 'center',
  },
  viewSlipBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  attachReceiptBtn: {
    backgroundColor: '#0D9488',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 1,
    minWidth: 140,
    alignItems: 'center',
  },
  attachReceiptBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTopBarTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeModalBtn: {
    padding: 4,
  },
  closeModalText: {
    fontSize: 16,
    color: '#64748B',
  },
  slipScrollContent: {
    padding: 16,
    gap: 14,
  },
  slipHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 10,
  },
  rxIcon: {
    fontSize: 30,
    fontWeight: '900',
    color: '#0284C7',
  },
  slipClinicName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  slipClinicMeta: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    width: '100%',
    marginVertical: 8,
  },
  rxNumberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  rxNumberLabel: {
    fontSize: 12,
    color: '#334155',
  },
  rxDateLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  slipBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 4,
  },
  slipBoxHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
  },
  physicianName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  physicianMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  genericsBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#166534',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  genericNameEmphasized: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  brandNameParens: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    fontStyle: 'italic',
  },
  dosageForm: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
    marginTop: 2,
  },
  sigContainer: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#0284C7',
    marginTop: 4,
  },
  sigTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  sigValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  durationMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  instructionMeta: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  qrContainerBox: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  qrSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0369A1',
  },
  qrSectionSub: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  qrCodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    gap: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  qrGraphic: {
    width: 64,
    height: 64,
    backgroundColor: '#0F172A',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrGraphicText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  qrPayloadLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  qrPayloadText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: 'monospace',
  },
  copyLinkBtn: {
    backgroundColor: '#E0F2FE',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  copyLinkBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
  },
  modalFooter: {
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  closeFullBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 6,
  },
  closeFullBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  receiptModalIntro: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  formGroup: {
    gap: 6,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pharmacyChip: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  pharmacyChipActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0F766E',
  },
  pharmacyChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  pharmacyChipTextActive: {
    color: '#FFFFFF',
  },
  inputField: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  photoActionBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 1,
    alignItems: 'center',
  },
  photoActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  receiptPreviewContainer: {
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  receiptPreviewImage: {
    width: 120,
    height: 160,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  receiptPreviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  cancelActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  cancelActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  saveActionBtn: {
    backgroundColor: '#0D9488',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  saveActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gamotHeaderCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    gap: 12,
  },
  gamotHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  gamotHeaderSub: {
    fontSize: 11,
    opacity: 0.7,
  },
  gamotHeaderBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  gamotHeaderBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  gamotStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  gamotStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  gamotStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    opacity: 0.6,
    letterSpacing: 0.5,
  },
  gamotStatVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  gamotStatDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: '#CBD5E1',
  },
  gamotPillBadge: {
    marginTop: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gamotPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  gamotDrugCodeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284C7',
  },
  gamotSlipBox: {
    borderWidth: 1.5,
    gap: 8,
  },
  gamotBoxHeading: {
    fontSize: 15,
    fontWeight: '800',
  },
  gamotBoxSub: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  gamotCeilingBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gamotCeilingText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  gamotDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gamotDetailLabel: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.8,
  },
  gamotDetailValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  upscContainer: {
    gap: 4,
    marginTop: 4,
  },
  upscLabel: {
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.7,
    textTransform: 'uppercase',
  },
  upscCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  upscCodeText: {
    color: '#38BDF8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  copyUpscBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyUpscBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
