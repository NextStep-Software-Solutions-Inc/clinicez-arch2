import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Field from '@ui/Field';
import Banner from '@ui/Banner';
import OptionRow from '@ui/OptionRow';
import { billingService } from '@services/billingService';
import type { ApplyDiscountRequest, DiscountKind, DiscountMode, VisitBill } from '../types/billing';
import { DISCOUNT_KINDS } from '../utils/presentation';
import { formatMoney } from '../utils/money';
import { PERMISSIONS } from '../constants/permissions';
import { useAuth } from './AuthGate';

interface DiscountFormProps {
  bill: VisitBill;
  onApplied: (bill: VisitBill) => void;
}

const MODES: ReadonlyArray<{ value: DiscountMode; label: string }> = [
  { value: 'Percentage', label: 'Percent' },
  { value: 'Fixed', label: 'Fixed amount' },
];

/** Applies a discount to the whole visit bill. Senior / PWD are a fixed 20% and need the ID number; promo needs a supervisor. */
export default function DiscountForm({ bill, onApplied }: DiscountFormProps) {
  const { can } = useAuth();
  const kinds = DISCOUNT_KINDS.filter((k) => k.statutory || can(PERMISSIONS.approvals));
  const [kind, setKind] = useState<DiscountKind>('Senior');
  const [mode, setMode] = useState<DiscountMode>('Percentage');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const statutory = DISCOUNT_KINDS.find((k) => k.value === kind)?.statutory ?? false;

  const submit = async () => {
    setError(null);
    setNotice(null);

    let request: ApplyDiscountRequest;
    if (statutory) {
      if (!idNumber.trim()) {
        setError('Enter the senior citizen / PWD ID number.');
        return;
      }
      request = { kind, mode: null, value: null, reason: kind === 'Senior' ? 'Senior citizen' : 'PWD', idNumber: idNumber.trim() };
    } else {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError('Enter a discount value above zero.');
        return;
      }
      if (!reason.trim()) {
        setError('A reason is required for this discount.');
        return;
      }
      request = { kind, mode, value: amount, reason: reason.trim(), idNumber: null };
    }

    setBusy(true);
    const [result, err] = await billingService.applyVisitDiscount(bill.anchorInvoiceId, request);
    setBusy(false);
    if (err || !result) {
      setError(err?.message ?? 'The discount could not be applied.');
      return;
    }

    setValue('');
    setReason('');
    setIdNumber('');
    if (result.skippedInvoiceIds.length > 0) {
      setNotice(`${result.skippedInvoiceIds.length} invoice(s) already had a payment or discount and were left unchanged.`);
    }
    onApplied(result.bill);
  };

  return (
    <View style={styles.box}>
      <ThemedText style={styles.title}>Discount</ThemedText>
      {bill.discountTotal > 0 ? (
        <ThemedText style={styles.meta}>Applied so far: {formatMoney(bill.discountTotal, bill.currency)}</ThemedText>
      ) : null}
      <Banner message={error} />
      <Banner message={notice} tone="success" />
      <OptionRow label="Type" options={kinds} value={kind} onChange={setKind} />
      {statutory ? (
        <Field label="ID number" value={idNumber} onChangeText={setIdNumber} editable={!busy} placeholder="Senior / PWD ID" />
      ) : (
        <>
          <OptionRow label="Mode" options={MODES} value={mode} onChange={setMode} />
          <Field
            label={mode === 'Percentage' ? 'Percent' : 'Amount'}
            value={value}
            onChangeText={setValue}
            editable={!busy}
            keyboardType="decimal-pad"
          />
          <Field label="Reason" value={reason} onChangeText={setReason} editable={!busy} autoCapitalize="sentences" />
        </>
      )}
      <Button title="Apply to visit bill" variant="secondary" onPress={submit} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  meta: { fontSize: 13, color: '#475569' },
});
