import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import type { Receipt } from '../types/billing';
import { facilityLabel } from '../utils/presentation';
import { formatMoney } from '../utils/money';

interface ReceiptViewProps {
  receipt: Receipt;
  onDone: () => void;
}

const canPrint = Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.print === 'function';

/** The official receipt for one payment: every invoice it paid, per facility, with the balance still owing. */
export default function ReceiptView({ receipt, onDone }: ReceiptViewProps) {
  const money = (amount: number) => formatMoney(amount, receipt.currency);

  return (
    <View style={styles.sheet}>
      <ThemedText style={styles.title}>Official Receipt {receipt.number}</ThemedText>
      <ThemedText style={styles.meta}>
        {new Date(receipt.issuedAtUtc).toLocaleString()} · Counter {receipt.counterFacilityId} · Cashier {receipt.cashierName}
      </ThemedText>
      <ThemedText style={styles.meta}>Patient: {receipt.patientName}</ThemedText>

      {receipt.invoices.map((invoice) => (
        <View key={invoice.invoiceId} style={styles.invoice}>
          <ThemedText style={styles.invoiceTitle}>
            {facilityLabel(invoice.facilityType)} · {invoice.invoiceNumber}
          </ThemedText>
          {invoice.lines.map((line) => (
            <View key={line.lineNo} style={styles.row}>
              <ThemedText style={styles.lineText}>
                {line.quantity} × {line.description}
              </ThemedText>
              <ThemedText style={styles.lineText}>{money(line.lineTotal)}</ThemedText>
            </View>
          ))}
          {invoice.discountTotal > 0 ? (
            <View style={styles.row}>
              <ThemedText style={styles.lineText}>Discount</ThemedText>
              <ThemedText style={styles.lineText}>−{money(invoice.discountTotal)}</ThemedText>
            </View>
          ) : null}
          <View style={styles.row}>
            <ThemedText style={styles.bold}>Paid now</ThemedText>
            <ThemedText style={styles.bold}>{money(invoice.appliedByThisPayment)}</ThemedText>
          </View>
        </View>
      ))}

      <View style={styles.totals}>
        <View style={styles.row}>
          <ThemedText style={styles.bold}>
            Received ({receipt.method}
            {receipt.isExternal ? ', settled by insurer' : ''})
          </ThemedText>
          <ThemedText style={styles.bold}>{money(receipt.amount)}</ThemedText>
        </View>
        {receipt.tendered !== null ? (
          <View style={styles.row}>
            <ThemedText style={styles.lineText}>Tendered / change</ThemedText>
            <ThemedText style={styles.lineText}>
              {money(receipt.tendered)} / {money(receipt.change)}
            </ThemedText>
          </View>
        ) : null}
        {receipt.reference ? <ThemedText style={styles.meta}>Reference: {receipt.reference}</ThemedText> : null}
        <View style={styles.row}>
          <ThemedText style={styles.bold}>Balance remaining</ThemedText>
          <ThemedText style={styles.bold}>{money(receipt.balanceRemaining)}</ThemedText>
        </View>
      </View>

      <View style={styles.actions}>
        {canPrint ? <Button title="Print receipt" variant="secondary" onPress={() => window.print()} /> : null}
        <Button title="Done" onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, gap: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  title: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  meta: { fontSize: 13, color: '#475569' },
  invoice: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  invoiceTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineText: { fontSize: 13, color: '#334155' },
  bold: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  totals: { gap: 4, paddingTop: 8, borderTopWidth: 2, borderTopColor: '#0F172A' },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
});
