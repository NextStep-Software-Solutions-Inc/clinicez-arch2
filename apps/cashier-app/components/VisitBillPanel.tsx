import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import StatusChip from '@ui/StatusChip';
import Button from '@ui/Button';
import Banner from '@ui/Banner';
import { billingService } from '@services/billingService';
import type { Payment, Receipt, VisitBill } from '../types/billing';
import { facilityLabel, invoiceChip } from '../utils/presentation';
import { formatMoney } from '../utils/money';
import { PERMISSIONS } from '../constants/permissions';
import { useAuth } from './AuthGate';
import DiscountForm from './DiscountForm';
import PaymentForm from './PaymentForm';
import ReceiptView from './ReceiptView';

interface VisitBillPanelProps {
  anchorInvoiceId: string;
  onClose: () => void;
}

/** ONE bill for the visit, with the lines of every facility that billed it, plus discount, payment and receipt. */
export default function VisitBillPanel({ anchorInvoiceId, onClose }: VisitBillPanelProps) {
  const { can } = useAuth();
  const [bill, setBill] = useState<VisitBill | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [result, err] = await billingService.getVisitBill(anchorInvoiceId);
    setLoading(false);
    if (err || !result) {
      setError(err?.message ?? 'The bill could not be loaded.');
      return;
    }
    setError(null);
    setBill(result);
  }, [anchorInvoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePaid = async (payment: Payment) => {
    const [result, err] = await billingService.getReceipt(payment.receiptId);
    if (err || !result) {
      setError(`Payment recorded (receipt ${payment.receiptNumber}), but the receipt could not be loaded: ${err?.message ?? 'unknown error'}`);
      await load();
      return;
    }
    setReceipt(result);
    await load();
  };

  if (receipt) {
    return <ReceiptView receipt={receipt} onDone={() => setReceipt(null)} />;
  }

  if (!bill) {
    return (
      <View style={styles.stack}>
        <Banner message={error} />
        {loading ? <ActivityIndicator color="#059669" /> : null}
        <Button title="Back" variant="secondary" onPress={onClose} />
      </View>
    );
  }

  const money = (amount: number) => formatMoney(amount, bill.currency);
  const canDiscount = can(PERMISSIONS.discountsApply) && bill.paid === 0 && bill.balance > 0;
  const canPay = can(PERMISSIONS.paymentsTake) && bill.balance > 0;

  return (
    <View style={styles.stack}>
      <Banner message={error} />
      <View style={styles.header}>
        <View style={styles.flex}>
          <ThemedText style={styles.patient}>{bill.patientName}</ThemedText>
          <ThemedText style={styles.meta}>
            {bill.visitKey ? `Visit ${bill.visitKey}` : 'No visit key'}
            {bill.branchId ? ` · Branch ${bill.branchId}` : ''}
          </ThemedText>
        </View>
        <Button title="Back" variant="secondary" onPress={onClose} />
      </View>

      {bill.invoices.map((invoice) => (
        <View key={invoice.id} style={styles.card}>
          <View style={styles.row}>
            <ThemedText style={styles.cardTitle}>
              {facilityLabel(invoice.facilityType)} · {invoice.invoiceNumber}
            </ThemedText>
            <StatusChip {...invoiceChip(invoice.status)} />
          </View>
          {invoice.lines.map((line) => (
            <View key={line.lineNo} style={styles.row}>
              <ThemedText style={styles.lineText}>
                {line.quantity} × {line.description}
              </ThemedText>
              <ThemedText style={styles.lineText}>{money(line.lineTotal)}</ThemedText>
            </View>
          ))}
          {invoice.discounts.map((discount) => (
            <View key={discount.id} style={styles.row}>
              <ThemedText style={styles.discountText}>
                {discount.kind} discount{discount.approvedByName ? ` (approved by ${discount.approvedByName})` : ''}
              </ThemedText>
              <ThemedText style={styles.discountText}>−{money(discount.amount)}</ThemedText>
            </View>
          ))}
          <View style={styles.row}>
            <ThemedText style={styles.bold}>Invoice balance</ThemedText>
            <ThemedText style={styles.bold}>{money(invoice.balance)}</ThemedText>
          </View>
        </View>
      ))}

      <View style={styles.totals}>
        <View style={styles.row}>
          <ThemedText style={styles.lineText}>Subtotal</ThemedText>
          <ThemedText style={styles.lineText}>{money(bill.subtotal)}</ThemedText>
        </View>
        {bill.discountTotal > 0 ? (
          <View style={styles.row}>
            <ThemedText style={styles.discountText}>Discounts</ThemedText>
            <ThemedText style={styles.discountText}>−{money(bill.discountTotal)}</ThemedText>
          </View>
        ) : null}
        <View style={styles.row}>
          <ThemedText style={styles.lineText}>Paid</ThemedText>
          <ThemedText style={styles.lineText}>{money(bill.paid)}</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.grand}>Balance due</ThemedText>
          <ThemedText style={styles.grand}>{money(bill.balance)}</ThemedText>
        </View>
      </View>

      {canDiscount ? <DiscountForm bill={bill} onApplied={setBill} /> : null}
      {canPay ? <PaymentForm key={`${bill.anchorInvoiceId}:${bill.balance}`} bill={bill} onPaid={handlePaid} /> : null}
      {bill.balance === 0 ? <StatusChip label="Settled" tone="success" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  patient: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  meta: { fontSize: 13, color: '#475569' },
  card: { gap: 6, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  lineText: { fontSize: 13, color: '#334155' },
  discountText: { fontSize: 13, color: '#B45309' },
  bold: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  totals: { gap: 4, backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  grand: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
});
