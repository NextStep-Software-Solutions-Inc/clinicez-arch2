import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '@ui/ThemedText';
import type { LabRequisitionItem } from '../services/laboratoryService';
import { formatMoney, paymentChipFor } from '../utils/requisitionPresentation';

type PaymentOrder = Pick<
  LabRequisitionItem,
  'paymentPolicy' | 'paymentRequired' | 'paid' | 'stage' | 'quotedAmount' | 'currency' | 'receiptNumber' | 'paidAtUtc'
>;

interface PaymentSummaryProps {
  order: PaymentOrder;
  /** When provided, an unpaid prepaid order shows a "Refresh payment" action. */
  onRefresh?: () => void;
}

/** Payment-status chip, cashier-paid indicator and (for unpaid prepaid orders) a refresh action. */
export default function PaymentSummary({ order, onRefresh }: PaymentSummaryProps) {
  const chip = paymentChipFor(order);
  if (!chip) return null;

  const amount = formatMoney(order.quotedAmount, order.currency);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.chip, chip.tone === 'paid' && styles.chipPaid, chip.tone === 'blocked' && styles.chipBlocked]}>
          <ThemedText style={[styles.chipText, chip.tone === 'paid' && styles.chipTextPaid, chip.tone === 'blocked' && styles.chipTextBlocked]}>
            {chip.tone === 'paid' ? '✓ ' : ''}{chip.label}
          </ThemedText>
        </View>
        {amount ? <ThemedText style={styles.amount}>{amount}</ThemedText> : null}
      </View>

      {order.paid && order.receiptNumber ? (
        <ThemedText style={styles.receipt}>Cashier receipt {order.receiptNumber}</ThemedText>
      ) : null}

      {order.paymentRequired && onRefresh ? (
        <Pressable style={styles.refreshButton} onPress={onRefresh}>
          <ThemedText style={styles.refreshText}>Refresh payment</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  chipPaid: {
    backgroundColor: '#DCFCE7',
  },
  chipBlocked: {
    backgroundColor: '#FEE2E2',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  chipTextPaid: {
    color: '#166534',
  },
  chipTextBlocked: {
    color: '#B91C1C',
  },
  amount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  receipt: {
    fontSize: 12,
    color: '#166534',
  },
  refreshButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7C3AED',
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7C3AED',
  },
});
