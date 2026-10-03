import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Modal, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import ThemedText from './ui/ThemedText';
import { clinicService, PrescriptionSlipData, RecordExternalDispensePayload } from '../services/clinicService';

interface RecordExternalDispenseModalProps {
  visible: boolean;
  onClose: () => void;
  consultationId: string;
  prescriptionNumber?: string;
  onSuccess: (updatedSlip: PrescriptionSlipData) => void;
}

const COMMON_PHARMACIES = [
  'Mercury Drug',
  'Watsons',
  'Rose Pharmacy',
  'Southstar Drug',
  'The Generics Pharmacy (TGP)',
  'Generika Drugstore',
];

export default function RecordExternalDispenseModal({
  visible,
  onClose,
  consultationId,
  prescriptionNumber,
  onSuccess,
}: RecordExternalDispenseModalProps) {
  const [pharmacyName, setPharmacyName] = useState('Mercury Drug');
  const [customPharmacy, setCustomPharmacy] = useState('');
  const [branchLocation, setBranchLocation] = useState('Main Branch');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [pharmacistName, setPharmacistName] = useState('');
  const [pharmacistPrc, setPharmacistPrc] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedPharmacy = pharmacyName === 'Other' ? customPharmacy : pharmacyName;

  const handleSubmit = async () => {
    if (!selectedPharmacy.trim()) {
      Alert.alert('Required Field', 'Please provide or select a pharmacy name.');
      return;
    }
    if (!receiptNumber.trim()) {
      Alert.alert('Required Field', 'Official Receipt (OR) Number is required for external dispense audit.');
      return;
    }

    setSubmitting(true);
    const payload: RecordExternalDispensePayload = {
      externalPharmacyName: selectedPharmacy.trim(),
      externalBranchLocation: branchLocation.trim() || undefined,
      officialReceiptNumber: receiptNumber.trim(),
      pharmacistName: pharmacistName.trim() || undefined,
      pharmacistPrcLicense: pharmacistPrc.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    const [updatedSlip, err] = await clinicService.recordExternalDispense(consultationId, payload);
    setSubmitting(false);

    if (err) {
      Alert.alert('Error', err.message || 'Failed to record external dispense.');
      return;
    }

    if (updatedSlip) {
      Alert.alert(
        'Dispense Recorded',
        `External dispensing by ${selectedPharmacy} (OR #${receiptNumber}) has been recorded in the patient chart.`
      );
      onSuccess(updatedSlip);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <ThemedText style={styles.title}>Log External Dispense (Path B)</ThemedText>
              <ThemedText style={styles.subtitle}>
                Record medication purchase from external drugstore {prescriptionNumber ? `(${prescriptionNumber})` : ''}
              </ThemedText>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <ThemedText style={styles.closeBtnText}>✕</ThemedText>
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Pharmacy Selection */}
            <View style={styles.fieldGroup}>
              <ThemedText style={styles.fieldLabel}>Drugstore Chain *</ThemedText>
              <View style={styles.chipRow}>
                {COMMON_PHARMACIES.map((p) => {
                  const isSelected = pharmacyName === p;
                  return (
                    <Pressable
                      key={p}
                      style={[styles.pharmacyChip, isSelected && styles.pharmacyChipActive]}
                      onPress={() => setPharmacyName(p)}
                    >
                      <ThemedText style={[styles.pharmacyChipText, isSelected && styles.pharmacyChipTextActive]}>
                        {p}
                      </ThemedText>
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[styles.pharmacyChip, pharmacyName === 'Other' && styles.pharmacyChipActive]}
                  onPress={() => setPharmacyName('Other')}
                >
                  <ThemedText style={[styles.pharmacyChipText, pharmacyName === 'Other' && styles.pharmacyChipTextActive]}>
                    Other Drugstore
                  </ThemedText>
                </Pressable>
              </View>

              {pharmacyName === 'Other' && (
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter Pharmacy Name (e.g. Local Community Drugstore)"
                  placeholderTextColor="#94A3B8"
                  value={customPharmacy}
                  onChangeText={setCustomPharmacy}
                />
              )}
            </View>

            {/* Branch Location */}
            <View style={styles.fieldGroup}>
              <ThemedText style={styles.fieldLabel}>Branch Location</ThemedText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Ayala Center Cebu Branch, Makati Ave Branch"
                placeholderTextColor="#94A3B8"
                value={branchLocation}
                onChangeText={setBranchLocation}
              />
            </View>

            {/* Official Receipt (OR) Number */}
            <View style={styles.fieldGroup}>
              <ThemedText style={styles.fieldLabel}>Official Receipt (OR) Number *</ThemedText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. OR-2026-081923"
                placeholderTextColor="#94A3B8"
                value={receiptNumber}
                onChangeText={setReceiptNumber}
              />
              <ThemedText style={styles.helperText}>
                Required for BIR and PhilHealth Konsulta audit compliance.
              </ThemedText>
            </View>

            {/* Pharmacist Details */}
            <View style={styles.twoColRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <ThemedText style={styles.fieldLabel}>Dispensing Pharmacist</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Karen Reyes, RPh"
                  placeholderTextColor="#94A3B8"
                  value={pharmacistName}
                  onChangeText={setPharmacistName}
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <ThemedText style={styles.fieldLabel}>Pharmacist PRC License #</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. PRC-0089123"
                  placeholderTextColor="#94A3B8"
                  value={pharmacistPrc}
                  onChangeText={setPharmacistPrc}
                />
              </View>
            </View>

            {/* Dispense Notes */}
            <View style={styles.fieldGroup}>
              <ThemedText style={styles.fieldLabel}>Dispense Notes & Instructions</ThemedText>
              <TextInput
                style={[styles.textInput, styles.multilineInput]}
                multiline
                numberOfLines={3}
                placeholder="e.g. Patient bought 30 tabs Amlodipine; Metformin out of stock at this branch."
                placeholderTextColor="#94A3B8"
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
              <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <ThemedText style={styles.submitBtnText}>Confirm External Dispense</ThemedText>
              )}
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
    maxWidth: 540,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#64748B',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
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
  textInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  multilineInput: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  cancelBtnText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#0D9488',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 6,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
