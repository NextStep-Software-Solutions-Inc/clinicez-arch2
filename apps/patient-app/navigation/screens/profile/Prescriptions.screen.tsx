import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, StyleSheet, View, Pressable, Modal, ScrollView, TextInput, Image, Platform } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Badge from '@ui/Badge';
import { AppIcon } from '@ui/Icon';
import Screen from 'components/layout/Screen';
import { useAppTheme } from 'contexts/ThemeContext';
import { useBreakpoint } from 'hooks/useBreakpoint';
import { db } from '@db/index';
import { prescriptions } from '@db/schema/prescriptions';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useClinicNameMap } from 'hooks/useClinicNameMap';
import { usePatientId } from 'hooks/usePatientId';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { dialog } from '@utils/dialog';
import { useProfileSync } from 'hooks/useProfileSync';
import EmptyState from '@ui/EmptyState';
import { RecordSkeletonList } from 'components/records/RecordSkeletonList';
import QrCodeView from 'components/sharing/QrCodeView';
import { publicRoutes } from '@shared/safe';
import { useEhrOptions } from 'hooks/useEhrOptions';

interface ExternalReceiptData {
  pharmacyName: string;
  branchLocation: string;
  receiptNumber: string;
  photoUri: string | null;
  attachedAt: string;
}

export default function PrescriptionsScreen() {
  const { selectOptions: drugstoreOptions } = useEhrOptions('common_drugstore');
  const commonDrugstores = React.useMemo(() => drugstoreOptions.map((o) => o.label), [drugstoreOptions]);
  const patientId = usePatientId();
  const { getClinicName } = useClinicNameMap();
  const { colors, radii, spacing } = useAppTheme();
  const { isDesktop } = useBreakpoint();

  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRx, setSelectedRx] = useState<any | null>(null);
  const [slipModalVisible, setSlipModalVisible] = useState(false);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);

  // External receipt attachment state
  const [attachedReceipts, setAttachedReceipts] = useState<Record<string, ExternalReceiptData>>({});
  const [selectedPharmacy, setSelectedPharmacy] = useState('Mercury Drug');
  const [customPharmacy, setCustomPharmacy] = useState('');
  const [branchLocation, setBranchLocation] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptPhotoUri, setReceiptPhotoUri] = useState<string | null>(null);

  const totalGamotClaimed = records
    .filter((r) => r.isPhilHealthGamot)
    .reduce((sum, r) => sum + (r.gamotCoverageAmount ?? 0), 0);

  const load = useCallback(() => {
    setIsLoading(true);
    db.select()
      .from(prescriptions)
      .where(eq(prescriptions.patientId, patientId))
      .orderBy(desc(prescriptions.startDate))
      .then((data) => {
        setRecords(data ?? []);
      })
      .catch(console.error)
      .finally(() => {
        setIsLoading(false);
      });
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  useProfileSync(load);

  const copyUpscToken = async (token: string) => {
    await Clipboard.setStringAsync(token);
    dialog.alert('UPSC Copied', `Unique Prescription Security Code "${token}" copied to clipboard.`);
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
      dialog.alert('Permission Denied', 'Camera roll permissions are needed to attach pharmacy receipts.');
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
      dialog.alert('Permission Denied', 'Camera permission is required to photograph your pharmacy receipt.');
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
      dialog.alert('Required Field', 'Please enter the Official Receipt (OR) Number from your purchase.');
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
    dialog.alert(
      'Receipt Attached',
      `Official receipt from ${finalPharmacy} (OR #${receiptNumber.trim()}) attached to your digital health record.`
    );
  };

  const copyVerificationLink = async (token: string) => {
    const portalUrl = (process.env.EXPO_PUBLIC_PORTAL_URL ?? '').replace(/\/+$/, '');
    if (!portalUrl) {
      dialog.alert('Link Unavailable', 'The public verification portal is not configured for this app.');
      return;
    }
    const url = publicRoutes.verifyRx(token, { baseUrl: portalUrl });
    await Clipboard.setStringAsync(url);
    dialog.alert('Link Copied', 'Public pharmacy verification link copied to clipboard.');
  };

  return (
    <Screen width="content" scroll={false} padded={false}>
      {isLoading ? (
        <RecordSkeletonList count={3} />
      ) : (
        <FlatList
          key={isDesktop ? 'grid-2' : 'list-1'}
          numColumns={isDesktop ? 2 : 1}
          data={records}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.content,
            { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.md },
          ]}
          columnWrapperStyle={isDesktop ? { gap: spacing.md } : undefined}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              {/* PhilHealth GAMOT ₱20,000 Allocation Card */}
              <View
                style={[
                  styles.gamotHeaderCard,
                  {
                    backgroundColor: colors.successBg,
                    borderColor: colors.successBorder,
                    borderRadius: radii.xl,
                    padding: spacing.md,
                    gap: spacing.md,
                  },
                ]}
              >
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <AppIcon name="shield" color={colors.successText} size={22} />
                    <View>
                      <ThemedText variant="title" style={{ color: colors.successText, fontWeight: '700' }}>
                        PhilHealth GAMOT Benefit
                      </ThemedText>
                      <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
                        Outpatient Drug Package (Circular 2026-0012)
                      </ThemedText>
                    </View>
                  </View>
                  <Badge tone="success" label="₱20,000.00 / yr" size="sm" />
                </View>

                <View
                  style={[
                    styles.gamotStatsRow,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderRadius: radii.md,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.sm,
                    },
                  ]}
                >
                  <View style={styles.gamotStatItem}>
                    <ThemedText variant="caption" style={{ color: colors.textMuted, letterSpacing: 0.5, fontWeight: '700' }}>
                      ANNUAL CEILING
                    </ThemedText>
                    <ThemedText variant="bodyBold" style={{ color: colors.text }}>
                      ₱20,000.00
                    </ThemedText>
                  </View>
                  <View style={[styles.gamotStatDivider, { backgroundColor: colors.borderLight }]} />
                  <View style={styles.gamotStatItem}>
                    <ThemedText variant="caption" style={{ color: colors.textMuted, letterSpacing: 0.5, fontWeight: '700' }}>
                      CLAIMED
                    </ThemedText>
                    <ThemedText variant="bodyBold" style={{ color: colors.primary }}>
                      ₱{totalGamotClaimed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </ThemedText>
                  </View>
                  <View style={[styles.gamotStatDivider, { backgroundColor: colors.borderLight }]} />
                  <View style={styles.gamotStatItem}>
                    <ThemedText variant="caption" style={{ color: colors.textMuted, letterSpacing: 0.5, fontWeight: '700' }}>
                      AVAILABLE
                    </ThemedText>
                    <ThemedText variant="bodyBold" style={{ color: colors.successText }}>
                      ₱{Math.max(0, 20000 - totalGamotClaimed).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </ThemedText>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.headerBanner,
                  {
                    backgroundColor: colors.primaryLight,
                    borderColor: colors.primaryBorder,
                    borderRadius: radii.lg,
                    padding: spacing.md,
                    gap: spacing.xs,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <AppIcon name="pill" color={colors.primary} size={20} />
                  <ThemedText variant="title" style={{ color: colors.primaryText, fontWeight: '700' }}>
                    Dual-Path Electronic Prescriptions
                  </ThemedText>
                </View>
                <ThemedText variant="caption" style={{ color: colors.textSecondary, lineHeight: 18 }}>
                  Your official Philippine e-Prescriptions (RA 6675 compliant). Pick up at Clinic EZ partner pharmacies (Path A) or present the digital QR slip at Mercury Drug, Watsons, or Rose Pharmacy (Path B).
                </ThemedText>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="pill"
              title="No Prescriptions"
              message="No active or past electronic prescriptions found for this profile."
            />
          }
        renderItem={({ item }) => {
          const receipt = attachedReceipts[item.id];
          const isDispensed = item.dispenseStatus === 'Dispensed';
          const isExternallyDispensed = !!receipt;

          const statusTone = isDispensed ? 'success' : isExternallyDispensed ? 'warning' : 'info';
          const statusIcon = isDispensed ? 'check' : isExternallyDispensed ? 'check' : 'clock';
          const statusLabel = isDispensed
            ? 'Dispensed (Partner)'
            : isExternallyDispensed
            ? `Dispensed (${receipt.pharmacyName})`
            : 'In Partner Queue';

          return (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                  gap: spacing.sm,
                  flex: 1,
                },
              ]}
            >
              {/* Header with Title & Status Badge */}
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText variant="title" style={{ color: colors.text, fontWeight: '700' }}>
                    {item.drugName ?? 'Prescription'}
                  </ThemedText>
                  {item.genericName && (
                    <ThemedText variant="caption" style={{ color: colors.primary, fontWeight: '500' }}>
                      Generic: {item.genericName}
                    </ThemedText>
                  )}
                </View>

                {/* Status Badge */}
                <Badge tone={statusTone} label={statusLabel} icon={statusIcon} size="sm" />
              </View>

              {item.isPhilHealthGamot && (
                <View
                  style={[
                    styles.gamotPillBadge,
                    {
                      backgroundColor: colors.successBg,
                      borderColor: colors.successBorder,
                      borderRadius: radii.md,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: spacing.xs,
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <AppIcon name="shield" size={14} color={colors.successText} />
                    <ThemedText variant="caption" style={{ color: colors.successText, fontWeight: '700' }}>
                      PhilHealth GAMOT ({item.gamotCoverageAmount != null ? `₱${item.gamotCoverageAmount.toFixed(2)} Covered` : 'Benefit Covered'})
                    </ThemedText>
                  </View>
                  {item.philHealthDrugCode && (
                    <ThemedText variant="caption" style={{ color: colors.primary, fontWeight: '500' }}>
                      Code: {item.philHealthDrugCode}
                    </ThemedText>
                  )}
                </View>
              )}

              {/* Prescription Details */}
              <View style={{ gap: spacing.xs }}>
                <ProfileReadOnlyField label="Dosage & Form" value={`${item.dosage ?? ''} ${item.dosageForm ?? ''}`.trim() || null} />
                <ProfileReadOnlyField label="Directions (Sig)" value={item.frequency} />
                <ProfileReadOnlyField label="Duration" value={item.duration} />
                <ProfileReadOnlyField label="Indication" value={item.indication} />
                <ProfileReadOnlyField
                  label="Prescribing Physician"
                  value={item.prescribingPhysician ?? 'Attending Physician'}
                />
                <ProfileReadOnlyField
                  label="Clinic Source"
                  value={getClinicName(item.clinicId) ?? item.clinicName ?? 'Accredited Healthcare Facility'}
                />
                <ProfileReadOnlyField
                  label="Refills Remaining"
                  value={item.refillsAllowed !== null && item.refillsAllowed !== undefined ? String(item.refillsAllowed) : '0'}
                />
                <ProfileReadOnlyField label="Special Instructions" value={item.specialInstructions} />
              </View>

              {/* Receipt Attachment Banner if attached */}
              {receipt && (
                <View
                  style={[
                    styles.receiptAttachedBox,
                    {
                      backgroundColor: colors.warningBg,
                      borderColor: colors.warningBorder,
                      borderRadius: radii.md,
                      padding: spacing.sm,
                      gap: 2,
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <AppIcon name="document" size={16} color={colors.warningText} />
                    <ThemedText variant="caption" style={{ color: colors.warningText, fontWeight: '700' }}>
                      External Pharmacy Receipt Attached
                    </ThemedText>
                  </View>
                  <ThemedText variant="caption" style={{ color: colors.warningText, opacity: 0.9 }}>
                    Purchased at {receipt.pharmacyName} ({receipt.branchLocation}) • OR #{receipt.receiptNumber}
                  </ThemedText>
                </View>
              )}

              {/* Action Buttons */}
              <View style={[styles.actionsRow, { borderTopColor: colors.borderLight, paddingTop: spacing.sm }]}>
                <Pressable
                  style={[
                    styles.viewSlipBtn,
                    {
                      backgroundColor: colors.primary,
                      borderRadius: radii.md,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.md,
                      gap: spacing.xs,
                    },
                  ]}
                  onPress={() => handleOpenSlip(item)}
                >
                  <AppIcon name="qrCode" color={colors.onPrimary} size={16} />
                  <ThemedText variant="caption" style={{ color: colors.onPrimary, fontWeight: '700' }}>
                    View Digital Rx Slip (QR)
                  </ThemedText>
                </Pressable>

                {!isDispensed && (
                  <Pressable
                    style={[
                      styles.attachReceiptBtn,
                      {
                        backgroundColor: colors.surfaceSubtle,
                        borderColor: colors.border,
                        borderWidth: 1,
                        borderRadius: radii.md,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.md,
                        gap: spacing.xs,
                      },
                    ]}
                    onPress={() => handleOpenReceiptModal(item)}
                  >
                    <AppIcon name={receipt ? 'edit' : 'hospital'} color={colors.text} size={16} />
                    <ThemedText variant="caption" style={{ color: colors.text, fontWeight: '700' }}>
                      {receipt ? 'Edit Receipt' : 'Attach Pharmacy Receipt'}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />
      )}

      {/* View Digital E-Prescription Slip Modal */}
      <Modal visible={slipModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay, padding: spacing.md }]}>
          <View
            style={[
              styles.modalContainer,
              {
                backgroundColor: colors.card,
                borderRadius: radii.xl,
              },
            ]}
          >
            <View
              style={[
                styles.modalTopBar,
                {
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  backgroundColor: colors.surfaceSubtle,
                  borderBottomColor: colors.borderLight,
                },
              ]}
            >
              <ThemedText variant="title" style={{ color: colors.text, fontWeight: '700' }}>
                Philippine Electronic Prescription
              </ThemedText>
              <Pressable onPress={() => setSlipModalVisible(false)} hitSlop={8} style={styles.closeModalBtn}>
                <AppIcon name="close" color={colors.textSecondary} size={20} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={[
                styles.slipScrollContent,
                { padding: spacing.lg, gap: spacing.md },
              ]}
            >
              {/* Rx Header */}
              <View style={[styles.slipHeader, { borderBottomColor: colors.borderLight, paddingBottom: spacing.sm }]}>
                <ThemedText variant="display" style={{ color: colors.primary, fontWeight: '800' }}>
                  Rx
                </ThemedText>
                <ThemedText variant="title" style={{ color: colors.text, textAlign: 'center', fontWeight: '700' }}>
                  {selectedRx?.clinicName || getClinicName(selectedRx?.clinicId) || 'Accredited Medical Facility'}
                </ThemedText>
                {selectedRx?.clinicAddress ? (
                  <ThemedText variant="caption" style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 2 }}>
                    {selectedRx.clinicAddress}
                  </ThemedText>
                ) : null}
                <View style={[styles.divider, { backgroundColor: colors.borderLight, marginVertical: spacing.sm }]} />
                <View style={styles.rxNumberRow}>
                  <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
                    Rx No:{' '}
                    <ThemedText variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                      {selectedRx?.prescriptionNumber || 'Pending'}
                    </ThemedText>
                  </ThemedText>
                  <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '500' }}>
                    Date: {selectedRx?.startDate || '—'}
                  </ThemedText>
                </View>
              </View>

              {/* Physician Info */}
              <View
                style={[
                  styles.slipBox,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderLight,
                    borderRadius: radii.md,
                    padding: spacing.md,
                    gap: spacing.xs,
                  },
                ]}
              >
                <ThemedText variant="caption" style={{ color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>
                  Prescribing Physician
                </ThemedText>
                <ThemedText variant="title" style={{ color: colors.text, fontWeight: '700' }}>
                  {selectedRx?.prescribingPhysician || 'Attending Physician'}
                </ThemedText>
                <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
                  {selectedRx?.physicianSpecialty || 'Licensed Medical Practitioner'}
                </ThemedText>
              </View>

              {/* Medication Section (RA 6675 Compliant) */}
              <View
                style={[
                  styles.slipBox,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderLight,
                    borderRadius: radii.md,
                    padding: spacing.md,
                    gap: spacing.xs,
                  },
                ]}
              >
                <View style={styles.rowBetween}>
                  <ThemedText variant="caption" style={{ color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>
                    Prescribed Drug (RA 6675)
                  </ThemedText>
                  <Badge tone="success" label="Generics Act Compliant" size="sm" />
                </View>
                <ThemedText variant="title" style={{ color: colors.text, marginTop: 2, fontWeight: '700' }}>
                  {selectedRx?.genericName || selectedRx?.drugName}
                </ThemedText>
                {selectedRx?.genericName && (
                  <ThemedText variant="caption" style={{ color: colors.textSecondary, fontStyle: 'italic', fontWeight: '500' }}>
                    ({selectedRx.drugName})
                  </ThemedText>
                )}
                <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '500' }}>
                  {selectedRx?.dosage} • {selectedRx?.dosageForm}
                </ThemedText>
                <View
                  style={[
                    styles.sigContainer,
                    {
                      backgroundColor: colors.card,
                      borderRadius: radii.sm,
                      borderLeftColor: colors.primary,
                      padding: spacing.sm,
                      marginTop: spacing.xs,
                    },
                  ]}
                >
                  <ThemedText variant="caption" style={{ color: colors.textMuted, fontWeight: '700' }}>
                    Sig / Directions:
                  </ThemedText>
                  <ThemedText variant="bodyBold" style={{ color: colors.text, marginTop: 2 }}>
                    {selectedRx?.frequency}
                  </ThemedText>
                </View>
                <ThemedText variant="caption" style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                  Duration: {selectedRx?.duration} • Refills: {selectedRx?.refillsAllowed ?? 0}
                </ThemedText>
                {selectedRx?.specialInstructions && (
                  <ThemedText variant="caption" style={{ color: colors.textSecondary, fontStyle: 'italic' }}>
                    Note: {selectedRx.specialInstructions}
                  </ThemedText>
                )}
              </View>

              {/* PhilHealth GAMOT Benefit Box */}
              {selectedRx?.isPhilHealthGamot && (
                <View
                  style={[
                    styles.slipBox,
                    {
                      backgroundColor: colors.successBg,
                      borderColor: colors.successBorder,
                      borderRadius: radii.md,
                      padding: spacing.md,
                      gap: spacing.sm,
                    },
                  ]}
                >
                  <View style={styles.rowBetween}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <AppIcon name="shield" size={18} color={colors.successText} />
                      <ThemedText variant="title" style={{ color: colors.successText, fontWeight: '700' }}>
                        PhilHealth GAMOT Benefit
                      </ThemedText>
                    </View>
                    <Badge tone="success" label="₱20,000.00 / yr" size="sm" />
                  </View>
                  <ThemedText variant="caption" style={{ color: colors.successText, opacity: 0.9 }}>
                    Outpatient drug benefit covered under PhilHealth Circular 2026-0012. Verified with Modulus-11 UPSC token.
                  </ThemedText>

                  <View style={styles.rowBetween}>
                    <ThemedText variant="caption" style={{ color: colors.successText, fontWeight: '700' }}>
                      PhilHealth Drug Code:
                    </ThemedText>
                    <ThemedText variant="caption" style={{ color: colors.text, fontWeight: '700' }}>
                      {selectedRx.philHealthDrugCode || '—'}
                    </ThemedText>
                  </View>

                  <View style={styles.rowBetween}>
                    <ThemedText variant="caption" style={{ color: colors.successText, fontWeight: '700' }}>
                      Covered Amount:
                    </ThemedText>
                    <ThemedText variant="caption" style={{ color: colors.successText, fontWeight: '700' }}>
                      {selectedRx.gamotCoverageAmount != null ? `₱${selectedRx.gamotCoverageAmount.toFixed(2)}` : 'Benefit Covered'}
                    </ThemedText>
                  </View>

                  <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
                    <ThemedText variant="caption" style={{ color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>
                      Unique Prescription Security Code (UPSC):
                    </ThemedText>
                    <View
                      style={[
                        styles.upscCodeBox,
                        {
                          backgroundColor: colors.surfaceSubtle,
                          borderColor: colors.borderLight,
                          borderRadius: radii.md,
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm,
                        },
                      ]}
                    >
                      <ThemedText
                        variant="caption"
                        style={{
                          color: colors.primary,
                          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                          letterSpacing: 0.5,
                          fontWeight: '700',
                        }}
                      >
                        {selectedRx.uniquePrescriptionSecurityCode || selectedRx.id}
                      </ThemedText>
                      <Pressable
                        style={[
                          styles.copyUpscBtn,
                          {
                            backgroundColor: colors.primary,
                            borderRadius: radii.sm,
                            paddingHorizontal: spacing.sm,
                            paddingVertical: spacing.xs,
                          },
                        ]}
                        onPress={() =>
                          copyUpscToken(selectedRx.uniquePrescriptionSecurityCode || selectedRx.id)
                        }
                      >
                        <AppIcon name="copy" color={colors.onPrimary} size={14} />
                        <ThemedText variant="caption" style={{ color: colors.onPrimary, fontWeight: '700' }}>
                          Copy
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>

                  {/* Scannable UPSC QR Code Payload */}
                  <View
                    style={[
                      styles.qrCodeCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        borderRadius: radii.md,
                        padding: spacing.md,
                        gap: spacing.sm,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <QrCodeView
                      value={`PHILHEALTH:YAKAP:UPSC:${selectedRx.uniquePrescriptionSecurityCode || selectedRx.id}`}
                      size={140}
                      accessibilityLabel="PhilHealth UPSC QR code"
                    />
                    <View style={{ width: '100%', gap: 2, alignItems: 'center' }}>
                      <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                        PhilHealth UPSC QR Payload:
                      </ThemedText>
                      <ThemedText variant="caption" style={{ color: colors.text, fontFamily: 'monospace', textAlign: 'center' }}>
                        PHILHEALTH:YAKAP:UPSC:{selectedRx.uniquePrescriptionSecurityCode || selectedRx.id}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              )}

              {/* Dual-Path Interoperability QR Code Section */}
              <View
                style={[
                  styles.slipBox,
                  {
                    backgroundColor: colors.primaryLight,
                    borderColor: colors.primaryBorder,
                    borderRadius: radii.md,
                    padding: spacing.md,
                    gap: spacing.xs,
                  },
                ]}
              >
                <ThemedText variant="title" style={{ color: colors.primaryText, fontWeight: '700' }}>
                  Path B: External Pharmacy Verification
                </ThemedText>
                <ThemedText variant="caption" style={{ color: colors.textSecondary, lineHeight: 16 }}>
                  Present this QR code or link to external drugstores (Mercury Drug, Watsons, Rose Pharmacy). The pharmacist can verify authenticity on the Clinic EZ public portal.
                </ThemedText>

                {/* QR Code Graphic Card */}
                <View
                  style={[
                    styles.qrCodeCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      borderRadius: radii.md,
                      padding: spacing.md,
                      gap: spacing.sm,
                      marginTop: spacing.xs,
                      alignItems: 'center',
                    },
                  ]}
                >
                  <QrCodeView
                    value={`CLINICEZ:RX:${selectedRx?.prescriptionNumber || selectedRx?.id || ''}:${selectedRx?.verificationToken || ''}`}
                    size={140}
                    accessibilityLabel="External pharmacy verification QR code"
                  />
                  <View style={{ width: '100%', gap: 4 }}>
                    <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                      Encrypted QR Payload:
                    </ThemedText>
                    <ThemedText variant="caption" style={{ color: colors.text, fontFamily: 'monospace' }}>
                      CLINICEZ:RX:{selectedRx?.prescriptionNumber || selectedRx?.id || '—'}:{selectedRx?.verificationToken || '—'}
                    </ThemedText>
                    <Pressable
                      style={[
                        styles.copyLinkBtn,
                        {
                          backgroundColor: colors.surfaceSubtle,
                          borderColor: colors.border,
                          borderWidth: 1,
                          borderRadius: radii.sm,
                          paddingVertical: spacing.xs,
                          paddingHorizontal: spacing.sm,
                          gap: 4,
                        },
                      ]}
                      onPress={() => copyVerificationLink(selectedRx?.verificationToken || '')}
                    >
                      <AppIcon name="copy" color={colors.primary} size={14} />
                      <ThemedText variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                        Copy Verification Web Link
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View
              style={[
                styles.modalFooter,
                {
                  padding: spacing.md,
                  backgroundColor: colors.surfaceSubtle,
                  borderTopColor: colors.borderLight,
                },
              ]}
            >
              <Pressable
                style={[
                  styles.closeFullBtn,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: radii.md,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.lg,
                  },
                ]}
                onPress={() => setSlipModalVisible(false)}
              >
                <ThemedText variant="caption" style={{ color: colors.onPrimary, fontWeight: '700' }}>
                  Close Slip
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Attach Pharmacy Receipt Modal */}
      <Modal visible={receiptModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay, padding: spacing.md }]}>
          <View
            style={[
              styles.modalContainer,
              {
                backgroundColor: colors.card,
                borderRadius: radii.xl,
              },
            ]}
          >
            <View
              style={[
                styles.modalTopBar,
                {
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  backgroundColor: colors.surfaceSubtle,
                  borderBottomColor: colors.borderLight,
                },
              ]}
            >
              <ThemedText variant="title" style={{ color: colors.text, fontWeight: '700' }}>
                Attach External Pharmacy Receipt
              </ThemedText>
              <Pressable onPress={() => setReceiptModalVisible(false)} hitSlop={8} style={styles.closeModalBtn}>
                <AppIcon name="close" color={colors.textSecondary} size={20} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={[
                styles.slipScrollContent,
                { padding: spacing.lg, gap: spacing.md },
              ]}
            >
              <ThemedText variant="caption" style={{ color: colors.textSecondary, lineHeight: 18 }}>
                Bought your prescription at Mercury Drug, Watsons, or another external drugstore? Record the Official Receipt (OR) details and photograph your receipt to update your doctor’s EMR chart.
              </ThemedText>

              {/* Drugstore Chain */}
              <View style={{ gap: spacing.xs }}>
                <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                  Pharmacy Chain *
                </ThemedText>
                <View style={styles.chipRow}>
                  {commonDrugstores.map((pharmacy) => {
                    const isSelected = selectedPharmacy === pharmacy;
                    return (
                      <Pressable
                        key={pharmacy}
                        style={[
                          styles.pharmacyChip,
                          {
                            backgroundColor: isSelected ? colors.primary : colors.surfaceSubtle,
                            borderColor: isSelected ? colors.primary : colors.border,
                            borderRadius: radii.md,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                          },
                        ]}
                        onPress={() => setSelectedPharmacy(pharmacy)}
                      >
                        <ThemedText
                          variant="caption"
                          style={{
                            color: isSelected ? colors.onPrimary : colors.text,
                            fontWeight: isSelected ? '700' : '500',
                          }}
                        >
                          {pharmacy}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                {selectedPharmacy === 'Other' && (
                  <TextInput
                    style={[
                      styles.inputField,
                      {
                        borderColor: colors.border,
                        borderRadius: radii.md,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        backgroundColor: colors.card,
                        color: colors.text,
                        marginTop: spacing.xs,
                      },
                    ]}
                    placeholder="Enter Drugstore Name"
                    placeholderTextColor={colors.textLight}
                    value={customPharmacy}
                    onChangeText={setCustomPharmacy}
                  />
                )}
              </View>

              {/* Branch */}
              <View style={{ gap: spacing.xs }}>
                <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                  Branch Location
                </ThemedText>
                <TextInput
                  style={[
                    styles.inputField,
                    {
                      borderColor: colors.border,
                      borderRadius: radii.md,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      backgroundColor: colors.card,
                      color: colors.text,
                    },
                  ]}
                  placeholder="e.g. Ayala Center Cebu, Makati Ave Branch"
                  placeholderTextColor={colors.textLight}
                  value={branchLocation}
                  onChangeText={setBranchLocation}
                />
              </View>

              {/* Official Receipt (OR) Number */}
              <View style={{ gap: spacing.xs }}>
                <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                  Official Receipt (OR) Number *
                </ThemedText>
                <TextInput
                  style={[
                    styles.inputField,
                    {
                      borderColor: colors.border,
                      borderRadius: radii.md,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      backgroundColor: colors.card,
                      color: colors.text,
                    },
                  ]}
                  placeholder="e.g. OR-2026-981240"
                  placeholderTextColor={colors.textLight}
                  value={receiptNumber}
                  onChangeText={setReceiptNumber}
                />
              </View>

              {/* Photo Upload */}
              <View style={{ gap: spacing.xs }}>
                <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                  Receipt Photo / Image
                </ThemedText>
                <View style={styles.photoActionsRow}>
                  <Pressable
                    style={[
                      styles.photoActionBtn,
                      {
                        backgroundColor: colors.surfaceSubtle,
                        borderColor: colors.border,
                        borderRadius: radii.md,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.md,
                        gap: spacing.xs,
                      },
                    ]}
                    onPress={handleTakePhoto}
                  >
                    <AppIcon name="camera" color={colors.text} size={16} />
                    <ThemedText variant="caption" style={{ color: colors.text, fontWeight: '700' }}>
                      Take Photo
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.photoActionBtn,
                      {
                        backgroundColor: colors.surfaceSubtle,
                        borderColor: colors.border,
                        borderRadius: radii.md,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.md,
                        gap: spacing.xs,
                      },
                    ]}
                    onPress={handlePickPhoto}
                  >
                    <AppIcon name="image" color={colors.text} size={16} />
                    <ThemedText variant="caption" style={{ color: colors.text, fontWeight: '700' }}>
                      Choose Gallery
                    </ThemedText>
                  </Pressable>
                </View>

                {receiptPhotoUri && (
                  <View style={[styles.receiptPreviewContainer, { gap: spacing.xs, marginTop: spacing.sm }]}>
                    <Image
                      source={{ uri: receiptPhotoUri }}
                      style={[styles.receiptPreviewImage, { borderRadius: radii.md, borderColor: colors.border }]}
                    />
                    <View style={styles.receiptPreviewLabelRow}>
                      <AppIcon name="check" size={14} color={colors.successText} />
                      <ThemedText variant="caption" style={{ color: colors.successText, marginLeft: 4, fontWeight: '700' }}>
                        Receipt photo ready
                      </ThemedText>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>

            <View
              style={[
                styles.modalFooter,
                {
                  padding: spacing.md,
                  backgroundColor: colors.surfaceSubtle,
                  borderTopColor: colors.borderLight,
                  gap: spacing.sm,
                },
              ]}
            >
              <Pressable
                style={[
                  styles.cancelActionBtn,
                  {
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                  },
                ]}
                onPress={() => setReceiptModalVisible(false)}
              >
                <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.saveActionBtn,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: radii.md,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.lg,
                  },
                ]}
                onPress={handleSaveReceipt}
              >
                <ThemedText variant="caption" style={{ color: colors.onPrimary, fontWeight: '700' }}>
                  Attach to Health Record
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {},
  headerBanner: {
    borderWidth: 1,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  receiptAttachedBox: {
    borderWidth: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  viewSlipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minWidth: 140,
  },
  attachReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minWidth: 140,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '95%',
    overflow: 'hidden',
  },
  modalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  closeModalBtn: {
    padding: 4,
  },
  slipScrollContent: {},
  slipHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  rxNumberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  slipBox: {
    borderWidth: 1,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sigContainer: {
    borderLeftWidth: 3,
  },
  qrCodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  qrGraphic: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  modalFooter: {
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeFullBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pharmacyChip: {
    borderWidth: 1,
  },
  inputField: {
    borderWidth: 1,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  photoActionBtn: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  receiptPreviewContainer: {
    alignItems: 'center',
  },
  receiptPreviewImage: {
    width: 120,
    height: 160,
    borderWidth: 1,
  },
  receiptPreviewLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelActionBtn: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveActionBtn: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  gamotHeaderCard: {
    borderWidth: 1.5,
  },
  gamotStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gamotStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  gamotStatDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
  },
  gamotPillBadge: {
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  upscCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  copyUpscBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
