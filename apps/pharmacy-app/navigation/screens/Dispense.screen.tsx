import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { useRoute, useNavigation } from '@react-navigation/native';
import { pharmacyService, PrescriptionOrderDto } from '../../services/pharmacyService';

export default function DispenseScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const routeParams = route.params as { orderId?: string } | undefined;
  const [orderId, setOrderId] = useState<string | null>(routeParams?.orderId ?? null);
  const [order, setOrder] = useState<PrescriptionOrderDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [dispensing, setDispensing] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pharmacist signature inputs
  const [pharmacistName, setPharmacistName] = useState('Karen Reyes, RPh');
  const [pharmacistPrc, setPharmacistPrc] = useState('PRC-0089123');
  const [receiptNumber, setReceiptNumber] = useState('OR-2026-0412');
  const [dispenseNotes, setDispenseNotes] = useState('Patient advised on taking medication after breakfast');

  // Load prescription order details
  const loadOrder = useCallback(async (id: string) => {
    setLoading(true);
    setErrorMessage(null);
    const [data, err] = await pharmacyService.getPrescriptionDetails(id);
    setLoading(false);
    if (err) {
      setErrorMessage(err.message || 'Failed to load prescription details.');
      return;
    }
    if (data) {
      setOrder(data);
    }
  }, []);

  // When screen loads or route params change
  useEffect(() => {
    const currentId = routeParams?.orderId ?? orderId;
    if (currentId) {
      setOrderId(currentId);
      loadOrder(currentId);
    } else {
      // Pick first pending prescription from queue if none specified
      (async () => {
        const [queue] = await pharmacyService.getPrescriptions('Pending');
        if (queue && queue.length > 0) {
          setOrderId(queue[0].id);
          loadOrder(queue[0].id);
        }
      })();
    }
  }, [routeParams?.orderId, loadOrder, orderId]);

  const handleDispense = async () => {
    if (!order) return;

    if (!pharmacistName.trim() || !pharmacistPrc.trim()) {
      Alert.alert('Validation Error', 'Pharmacist Name and PRC License Number are required.');
      return;
    }

    setDispensing(true);
    setErrorMessage(null);
    setSuccessBanner(null);

    const [result, err] = await pharmacyService.dispensePrescription(order.id, {
      pharmacistName: pharmacistName.trim(),
      pharmacistPrcLicense: pharmacistPrc.trim(),
      receiptNumber: receiptNumber.trim() || undefined,
      notes: dispenseNotes.trim() || undefined,
    });

    setDispensing(false);

    if (err) {
      setErrorMessage(err.message || 'Dispensing failed. Please verify stock availability.');
      return;
    }

    if (result) {
      setOrder(result);
      setSuccessBanner(`✓ Dispense verified! Stock deducted via FEFO and broadcast to Clinic EMR.`);
    }
  };

  if (loading && !order) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#0D9488" />
        <ThemedText style={{ marginTop: 12, color: '#6B7280' }}>Loading prescription details...</ThemedText>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Verification & FEFO Fulfillment</ThemedText>
        <ThemedText style={styles.title}>Dispense Order</ThemedText>
      </View>

      {successBanner && (
        <View style={styles.successBox}>
          <ThemedText style={styles.successText}>{successBanner}</ThemedText>
        </View>
      )}

      {errorMessage && (
        <View style={styles.errorBox}>
          <ThemedText style={styles.errorText}>⚠️ {errorMessage}</ThemedText>
        </View>
      )}

      {order ? (
        <>
          {/* Patient Demographic & Clinical Alert Banner */}
          <View style={styles.patientBanner}>
            <View style={styles.rowBetween}>
              <ThemedText style={styles.patientName}>
                {order.patientName} ({order.patientAge}y/{order.patientGender})
              </ThemedText>
              <ThemedText style={styles.rxNumberBadge}>{order.prescriptionNumber}</ThemedText>
            </View>

            <ThemedText style={styles.patientMeta}>
              Allergies: {order.patientAllergies || 'No Known Drug Allergies (NKDA)'}
            </ThemedText>

            {order.clinicalDiagnosis ? (
              <ThemedText style={styles.patientMeta}>Diagnosis: {order.clinicalDiagnosis}</ThemedText>
            ) : null}

            <View style={styles.doctorMetaRow}>
              <ThemedText style={styles.doctorMetaText}>
                Prescribed by: {order.orderingDoctorName} (PRC: {order.doctorPrcLicense || 'N/A'})
              </ThemedText>
              {order.doctorS2License ? (
                <ThemedText style={styles.s2Badge}>S2: {order.doctorS2License}</ThemedText>
              ) : null}
            </View>
          </View>

          {/* Prescribed Items & FEFO Batch Allocation */}
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <ThemedText style={styles.sectionTitle}>Prescribed Items to Dispense</ThemedText>
              <ThemedText style={styles.totalBadge}>Total: ₱{order.totalAmount.toFixed(2)}</ThemedText>
            </View>

            {order.items.map((item, idx) => {
              const allocatedBatch = item.allocatedBatchNumber ||
                (item.availableBatches.length > 0
                  ? item.availableBatches.map(b => `${b.batchNumber} (Exp: ${new Date(b.expiryDate).toLocaleDateString()})`).join(', ')
                  : 'Auto-allocate via FEFO');

              return (
                <View key={item.id || idx} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.medName}>
                        {item.genericName} {item.brandName ? `(${item.brandName})` : ''}
                      </ThemedText>
                      <ThemedText style={styles.dosage}>{item.dosage} {item.form}</ThemedText>
                    </View>
                    <ThemedText style={styles.qtyBadge}>Qty: {item.quantityPrescribed}</ThemedText>
                  </View>

                  <ThemedText style={styles.sig}>Sig: {item.sig}</ThemedText>

                  {/* FEFO Batch Deduction Recommendation */}
                  <View style={styles.fefoBox}>
                    <ThemedText style={styles.fefoHeading}>FEFO Recommended Allocation:</ThemedText>
                    <ThemedText style={styles.fefoDetail}>{allocatedBatch}</ThemedText>
                    <View style={styles.priceRow}>
                      <ThemedText style={styles.unitPriceText}>Unit: ₱{item.unitPrice.toFixed(2)}</ThemedText>
                      <ThemedText style={styles.subtotalText}>Subtotal: ₱{item.subtotal.toFixed(2)}</ThemedText>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Pharmacist Dispensing Signature Section */}
          {order.status !== 'Dispensed' ? (
            <View style={styles.verificationSection}>
              <ThemedText style={styles.sectionTitle}>Pharmacist Sign-off & Receipt</ThemedText>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Dispensing Pharmacist Name *</ThemedText>
                <TextInput
                  style={styles.input}
                  value={pharmacistName}
                  onChangeText={setPharmacistName}
                  placeholder="e.g. Karen Reyes, RPh"
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Pharmacist PRC License No. *</ThemedText>
                <TextInput
                  style={styles.input}
                  value={pharmacistPrc}
                  onChangeText={setPharmacistPrc}
                  placeholder="e.g. PRC-0089123"
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Official Receipt (OR) Number</ThemedText>
                <TextInput
                  style={styles.input}
                  value={receiptNumber}
                  onChangeText={setReceiptNumber}
                  placeholder="e.g. OR-2026-9912"
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Patient Counseling & Dispense Notes</ThemedText>
                <TextInput
                  style={styles.input}
                  value={dispenseNotes}
                  onChangeText={setDispenseNotes}
                  placeholder="Instructions given to patient..."
                />
              </View>

              <Pressable
                style={[styles.dispenseButton, dispensing && styles.buttonDisabled]}
                onPress={handleDispense}
                disabled={dispensing}
              >
                {dispensing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.dispenseButtonText}>
                    Verify & Deduct FEFO Inventory (₱{order.totalAmount.toFixed(2)})
                  </ThemedText>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.alreadyDispensedBox}>
              <ThemedText style={styles.alreadyDispensedTitle}>✓ Order Fully Dispensed</ThemedText>
              <ThemedText style={styles.alreadyDispensedText}>
                Dispensed by {order.dispensingPharmacistName} (PRC: {order.dispensingPharmacistPrc})
              </ThemedText>
              {order.dispensedAt && (
                <ThemedText style={styles.alreadyDispensedText}>
                  Timestamp: {new Date(order.dispensedAt).toLocaleString()}
                </ThemedText>
              )}
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptyCard}>
          <ThemedText style={styles.emptyText}>
            No prescription order selected. Return to the Prescriptions Queue to pick an order.
          </ThemedText>
          <Pressable
            style={styles.viewQueueBtn}
            onPress={() => navigation.navigate('Prescriptions')}
          >
            <ThemedText style={styles.viewQueueText}>Back to Queue</ThemedText>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  subtitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#0D9488',
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  successBox: {
    backgroundColor: '#D1FAE5',
    borderColor: '#34D399',
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
  },
  successText: {
    color: '#065F46',
    fontWeight: '700',
    fontSize: 13,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
  },
  errorText: {
    color: '#991B1B',
    fontWeight: '700',
    fontSize: 13,
  },
  patientBanner: {
    backgroundColor: '#F0FDFA',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#99F6E4',
    gap: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  patientName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#134E4A',
  },
  rxNumberBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F766E',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontFamily: 'monospace',
  },
  patientMeta: {
    fontSize: 12,
    color: '#0D9488',
    fontWeight: '600',
  },
  doctorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#CCFBF1',
    paddingTop: 6,
  },
  doctorMetaText: {
    fontSize: 12,
    color: '#4B5563',
    flex: 1,
  },
  s2Badge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  totalBadge: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0D9488',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 8,
  },
  medName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  dosage: {
    fontSize: 13,
    color: '#4B5563',
  },
  qtyBadge: {
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: '#CCFBF1',
    color: '#0F766E',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sig: {
    fontSize: 13,
    color: '#1F2937',
    fontStyle: 'italic',
  },
  fefoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
    marginTop: 4,
  },
  fefoHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fefoDetail: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 4,
  },
  unitPriceText: {
    fontSize: 11,
    color: '#64748B',
  },
  subtotalText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  verificationSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 12,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  dispenseButton: {
    backgroundColor: '#0D9488',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  dispenseButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  alreadyDispensedBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  alreadyDispensedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#065F46',
  },
  alreadyDispensedText: {
    fontSize: 12,
    color: '#047857',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  viewQueueBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  viewQueueText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
