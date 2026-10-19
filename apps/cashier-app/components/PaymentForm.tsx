import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Field from '@ui/Field';
import Banner from '@ui/Banner';
import OptionRow from '@ui/OptionRow';
import { billingService } from '@services/billingService';
import type { InsurerKind, Payment, PaymentMethod, VisitBill } from '../types/billing';
import { PAYMENT_METHODS } from '../utils/presentation';
import { attemptFor, isIndeterminate, paymentSignature, type PaymentAttempt } from '../utils/idempotency';
import { changeDue, formatMoney, parseAmount, toCents } from '../utils/money';

interface PaymentFormProps {
  bill: VisitBill;
  onPaid: (payment: Payment) => void;
}

const INSURERS: ReadonlyArray<{ value: InsurerKind; label: string }> = [
  { value: 'PhilHealth', label: 'PhilHealth' },
  { value: 'Hmo', label: 'HMO' },
  { value: 'Other', label: 'Other' },
];

/**
 * Takes one payment against the whole visit bill (applied oldest invoice first). Every attempt carries an idempotency key;
 * when the answer is lost (no connection, timeout, server error) the same key is reused, so pressing Pay again can never
 * charge the patient twice.
 */
export default function PaymentForm({ bill, onPaid }: PaymentFormProps) {
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [amount, setAmount] = useState(bill.balance.toFixed(2));
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [insurer, setInsurer] = useState<InsurerKind>('PhilHealth');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<PaymentAttempt | null>(null);

  const parsedAmount = parseAmount(amount);
  const parsedTendered = tendered.trim() ? parseAmount(tendered) : null;
  const change = method === 'Cash' && parsedAmount !== null && parsedTendered !== null ? changeDue(parsedAmount, parsedTendered) : null;

  const submit = async () => {
    setError(null);
    if (parsedAmount === null) {
      setError('Enter an amount above zero with at most two decimals.');
      return;
    }
    if (toCents(parsedAmount) > toCents(bill.balance)) {
      setError(`The amount is more than the balance of ${formatMoney(bill.balance, bill.currency)}.`);
      return;
    }
    if (tendered.trim() && (parsedTendered === null || toCents(parsedTendered) < toCents(parsedAmount))) {
      setError('The cash tendered must be at least the amount.');
      return;
    }

    const insurerKind = method === 'Insurance' ? insurer : null;
    const tenderedAmount = method === 'Cash' ? parsedTendered : null;
    const signature = paymentSignature([bill.anchorInvoiceId, method, parsedAmount, reference.trim(), tenderedAmount, insurerKind]);
    const current = attemptFor(attempt.current, signature);
    attempt.current = current;

    setBusy(true);
    const [payment, err] = await billingService.takePayment(
      {
        method,
        amount: parsedAmount,
        reference: reference.trim() || null,
        tendered: tenderedAmount,
        insurerKind,
        anchorInvoiceId: bill.anchorInvoiceId,
        allocations: null,
      },
      current.key,
    );
    setBusy(false);

    if (err || !payment) {
      if (err && isIndeterminate(err.status)) {
        setError('No confirmation was received. Press Pay again to retry safely: the patient will not be charged twice.');
      } else {
        attempt.current = null;
        setError(err?.message ?? 'The payment could not be recorded.');
      }
      return;
    }

    attempt.current = null;
    onPaid(payment);
  };

  return (
    <View style={styles.box}>
      <ThemedText style={styles.title}>Take payment</ThemedText>
      <ThemedText style={styles.meta}>Balance due {formatMoney(bill.balance, bill.currency)}</ThemedText>
      <Banner message={error} />
      <OptionRow label="Method" options={PAYMENT_METHODS} value={method} onChange={setMethod} />
      {method === 'Insurance' ? <OptionRow label="Insurer" options={INSURERS} value={insurer} onChange={setInsurer} /> : null}
      <Field label="Amount" value={amount} onChangeText={setAmount} editable={!busy} keyboardType="decimal-pad" />
      {method === 'Cash' ? (
        <Field
          label="Cash tendered (optional)"
          value={tendered}
          onChangeText={setTendered}
          editable={!busy}
          keyboardType="decimal-pad"
          hint={change !== null ? `Change due ${formatMoney(change, bill.currency)}` : undefined}
        />
      ) : (
        <Field
          label={method === 'Insurance' ? 'Claim / LOA reference' : 'Reference'}
          value={reference}
          onChangeText={setReference}
          editable={!busy}
        />
      )}
      <Button title="Pay" onPress={submit} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  meta: { fontSize: 13, color: '#475569' },
});
