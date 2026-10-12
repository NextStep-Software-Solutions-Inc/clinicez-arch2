import React, { useState } from 'react';
import { View, StyleSheet, Pressable, TextInput, ActivityIndicator, Modal } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { usePermission } from './AuthGate';
import { PERMISSIONS } from '../constants/permissions';
import { pharmacyService, PrescriptionOrderDto } from '../services/pharmacyService';
import { isReviewable } from '../utils/prescriptionPresentation';

type ReviewMode = 'accept' | 'partial' | 'reject';

interface PrescriptionReviewPanelProps {
  order: PrescriptionOrderDto;
  onReviewed: (updated: PrescriptionOrderDto) => void;
}

const DIALOG_TITLES: Record<ReviewMode, string> = {
  accept: 'Accept prescription',
  partial: 'Partially accept prescription',
  reject: 'Reject prescription',
};

export default function PrescriptionReviewPanel({ order, onReviewed }: PrescriptionReviewPanelProps) {
  const canReview = usePermission(PERMISSIONS.prescriptionsReview);
  const [mode, setMode] = useState<ReviewMode | null>(null);
  const [acceptedItemIds, setAcceptedItemIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canReview || !isReviewable(order)) return null;

  const openDialog = (next: ReviewMode) => {
    setMode(next);
    setAcceptedItemIds([]);
    setReason('');
    setError(null);
  };

  const closeDialog = () => {
    if (!submitting) setMode(null);
  };

  const toggleItem = (itemId: string) => {
    setAcceptedItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  };

  const validate = (): string | null => {
    if (mode === 'partial') {
      if (acceptedItemIds.length === 0) return 'Select at least one item to accept.';
      if (acceptedItemIds.length >= order.items.length) {
        return 'Select fewer items than the full prescription, or use Accept to accept everything.';
      }
    }
    if ((mode === 'partial' || mode === 'reject') && !reason.trim()) {
      return 'A reason is required.';
    }
    return null;
  };

  const submit = async () => {
    if (!mode) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    const [updated, err] =
      mode === 'accept'
        ? await pharmacyService.acceptPrescription(order.id)
        : mode === 'partial'
        ? await pharmacyService.partiallyAcceptPrescription(order.id, {
            acceptedItemIds,
            reason: reason.trim(),
          })
        : await pharmacyService.rejectPrescription(order.id, { reason: reason.trim() });

    setSubmitting(false);

    if (err || !updated) {
      setError(err?.message || 'The prescription could not be updated. Please try again.');
      return;
    }

    setMode(null);
    onReviewed(updated);
  };

  return (
    <View style={styles.panel}>
      <ThemedText style={styles.panelTitle}>Pharmacist Review</ThemedText>
      <ThemedText style={styles.panelHint}>
        Accept the prescription to receive a quote from current inventory prices, accept only some items, or reject it.
      </ThemedText>

      <View style={styles.actionsRow}>
        <Pressable style={[styles.actionBtn, styles.acceptBtn]} onPress={() => openDialog('accept')}>
          <ThemedText style={styles.actionBtnText}>Accept</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.partialBtn, order.items.length < 2 && styles.btnDisabled]}
          onPress={() => openDialog('partial')}
          disabled={order.items.length < 2}
        >
          <ThemedText style={styles.actionBtnText}>Partially accept</ThemedText>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.rejectBtn]} onPress={() => openDialog('reject')}>
          <ThemedText style={styles.actionBtnText}>Reject</ThemedText>
        </Pressable>
      </View>

      <Modal visible={mode !== null} transparent animationType="fade" onRequestClose={closeDialog}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            {mode ? <ThemedText style={styles.modalTitle}>{DIALOG_TITLES[mode]}</ThemedText> : null}
            <ThemedText style={styles.modalSub}>
              {order.prescriptionNumber} • {order.patientName}
            </ThemedText>

            {error ? (
              <View style={styles.modalErrorBanner}>
                <ThemedText style={styles.modalErrorText}>{error}</ThemedText>
              </View>
            ) : null}

            {mode === 'accept' ? (
              <ThemedText style={styles.modalBody}>
                Accept all {order.items.length} item(s)? A quote will be computed from inventory prices.
              </ThemedText>
            ) : null}

            {mode === 'partial' ? (
              <View style={styles.itemList}>
                <ThemedText style={styles.fieldLabel}>Items to accept</ThemedText>
                {order.items.map((item) => {
                  const selected = acceptedItemIds.includes(item.id);
                  return (
                    <Pressable key={item.id} style={styles.itemRow} onPress={() => toggleItem(item.id)} disabled={submitting}>
                      <View style={[styles.checkbox, selected && styles.checkboxActive]}>
                        {selected ? <ThemedText style={styles.checkboxMark}>✓</ThemedText> : null}
                      </View>
                      <ThemedText style={styles.itemLabel}>
                        {item.genericName} {item.dosage} (Qty: {item.quantityPrescribed})
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {mode === 'partial' || mode === 'reject' ? (
              <View>
                <ThemedText style={styles.fieldLabel}>Reason *</ThemedText>
                <TextInput
                  style={styles.reasonInput}
                  value={reason}
                  onChangeText={setReason}
                  placeholder={mode === 'reject' ? 'Why is this prescription being rejected?' : 'Why are some items not accepted?'}
                  placeholderTextColor="#9CA3AF"
                  multiline
                  editable={!submitting}
                />
              </View>
            ) : null}

            <View style={styles.modalActionsRow}>
              <Pressable style={styles.cancelBtn} onPress={closeDialog} disabled={submitting}>
                <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, mode === 'reject' && styles.rejectBtn, submitting && styles.btnDisabled]}
                onPress={submit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <ThemedText style={styles.confirmBtnText}>
                    {mode === 'reject' ? 'Reject' : mode === 'partial' ? 'Partially accept' : 'Accept'}
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 10,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  panelHint: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  acceptBtn: {
    backgroundColor: '#0D9488',
  },
  partialBtn: {
    backgroundColor: '#2563EB',
  },
  rejectBtn: {
    backgroundColor: '#DC2626',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    maxWidth: 500,
    width: '100%',
    maxHeight: '95%',
    overflow: 'hidden',
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
  },
  modalBody: {
    fontSize: 14,
    color: '#374151',
  },
  modalErrorBanner: {
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  modalErrorText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  itemList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemLabel: {
    flex: 1,
    fontSize: 13,
    color: '#1F2937',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    backgroundColor: '#0D9488',
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  reasonInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#111827',
    minHeight: 64,
    textAlignVertical: 'top',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: '#0D9488',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
