import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '@constants/theme';
import { Modal, Input, Button, ThemedText } from '@ui';
import { Alert } from '@utils/feedback';
import { clinicService, PrescriptionSlipData, RecordExternalDispensePayload } from '../services/clinicService';

interface RecordExternalDispenseModalProps {
  visible: boolean;
  onClose: () => void;
  consultationId: string;
  prescriptionNumber?: string;
  onSuccess: (updatedSlip: PrescriptionSlipData) => void;
}

export default function RecordExternalDispenseModal({
  visible,
  onClose,
  consultationId,
  prescriptionNumber,
  onSuccess,
}: RecordExternalDispenseModalProps) {
  const [pharmacyName, setPharmacyName] = useState('');
  // Drugstores this clinic has already used (learned from its own records; there is no built-in list).
  const [recentPharmacies, setRecentPharmacies] = useState<string[]>([]);
  const [branchLocation, setBranchLocation] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [pharmacistName, setPharmacistName] = useState('');
  const [pharmacistPrc, setPharmacistPrc] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedPharmacy = pharmacyName;

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    clinicService.getRecentExternalPharmacies().then(([names]) => {
      if (!cancelled) setRecentPharmacies(names ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

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

  const renderChip = (label: string, value: string, text: string = label) => {
    const isSelected = pharmacyName === value;
    return (
      <Pressable
        key={value}
        style={[styles.chip, isSelected && styles.chipActive]}
        onPress={() => setPharmacyName(value)}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
      >
        <ThemedText variant="captionBold" color={isSelected ? theme.colors.onPrimary : theme.colors.textSecondary}>
          {text}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Log external dispense"
      subtitle={`Record a medication purchase from an outside drugstore${prescriptionNumber ? ` (${prescriptionNumber})` : ''}`}
      maxWidth={560}
      maxHeight="90%"
      footer={
        <View style={styles.footer}>
          <Button title="Cancel" variant="ghost" onPress={onClose} disabled={submitting} />
          <Button title="Confirm external dispense" onPress={handleSubmit} loading={submitting} disabled={submitting} />
        </View>
      }
    >
      <View style={styles.fieldGroup}>
        <Input
          label="Drugstore"
          required
          placeholder="Name of the drugstore that dispensed the medicine"
          value={pharmacyName}
          onChangeText={setPharmacyName}
        />
        {recentPharmacies.length > 0 ? (
          <View style={styles.chipRow}>{recentPharmacies.map((p) => renderChip(p, p))}</View>
        ) : null}      </View>

      <Input
        label="Branch location"
        placeholder="e.g. Ayala Center Cebu branch"
        value={branchLocation}
        onChangeText={setBranchLocation}
      />

      <Input
        label="Official receipt (OR) number"
        required
        placeholder="e.g. OR-2026-081923"
        value={receiptNumber}
        onChangeText={setReceiptNumber}
        helperText="Required for BIR and PhilHealth Konsulta audit compliance."
      />

      <View style={styles.twoColRow}>
        <Input
          containerStyle={styles.col}
          label="Dispensing pharmacist"
          placeholder="Name and title"
          value={pharmacistName}
          onChangeText={setPharmacistName}
        />
        <Input
          containerStyle={styles.col}
          label="Pharmacist PRC license no."
          placeholder="PRC license number"
          value={pharmacistPrc}
          onChangeText={setPharmacistPrc}
        />
      </View>

      <Input
        label="Dispense notes"
        multiline
        numberOfLines={3}
        placeholder="e.g. Which items were bought, or which were out of stock."
        value={notes}
        onChangeText={setNotes}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  fieldGroup: {
    gap: theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderDark,
    borderWidth: theme.sizes.borderWidth,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.full,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  col: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
