import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Field from '@ui/Field';
import Banner from '@ui/Banner';
import { billingService } from '@services/billingService';
import type { Shift } from '../../types/billing';
import { formatMoney, parseAmountOrZero } from '../../utils/money';

export default function ShiftScreen() {
  const [shift, setShift] = useState<Shift | null>(null);
  const [closed, setClosed] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [current, err] = await billingService.currentShift();
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    setShift(current);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async () => {
    const float = parseAmountOrZero(openingFloat);
    if (float === null) {
      setError('Enter the opening cash float, for example 1000.00.');
      return;
    }
    setBusy(true);
    setError(null);
    const [opened, err] = await billingService.openShift(float);
    setBusy(false);
    if (err || !opened) {
      setError(err?.message ?? 'The shift could not be opened.');
      return;
    }
    setClosed(null);
    setOpeningFloat('');
    setShift(opened);
  };

  const close = async () => {
    if (!shift) return;
    const counted = parseAmountOrZero(countedCash);
    if (counted === null) {
      setError('Enter the cash counted in the drawer.');
      return;
    }
    setBusy(true);
    setError(null);
    const [result, err] = await billingService.closeShift(shift.id, counted, notes.trim() || null);
    setBusy(false);
    if (err || !result) {
      setError(err?.message ?? 'The shift could not be closed.');
      return;
    }
    setClosed(result);
    setShift(null);
    setCountedCash('');
    setNotes('');
  };

  const money = (amount: number) => formatMoney(amount);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Banner message={error} />
      {loading ? <ActivityIndicator color="#059669" /> : null}

      {closed ? (
        <View style={styles.card}>
          <ThemedText style={styles.title}>Shift closed</ThemedText>
          <Line label="Expected cash" value={money(closed.expectedCash)} />
          <Line label="Counted cash" value={money(closed.countedCash ?? 0)} />
          <Line label="Variance" value={money(closed.variance ?? 0)} emphasis={(closed.variance ?? 0) !== 0} />
        </View>
      ) : null}

      {shift ? (
        <>
          <View style={styles.card}>
            <ThemedText style={styles.title}>Open shift</ThemedText>
            <ThemedText style={styles.meta}>Opened {new Date(shift.openedAtUtc).toLocaleString()}</ThemedText>
            <Line label="Opening float" value={money(shift.openingFloat)} />
            <Line label="Cash collected" value={money(shift.cashCollected)} />
            <Line label="Cash refunded" value={money(shift.cashRefunded)} />
            <Line label="Card / e-wallet collected" value={money(shift.nonCashCollected)} />
            <Line label="Insurer settlements (not in drawer)" value={money(shift.externalSettled)} />
            <Line label="Expected cash in drawer" value={money(shift.expectedCash)} emphasis />
          </View>
          <View style={styles.card}>
            <ThemedText style={styles.title}>Close shift</ThemedText>
            <Field label="Cash counted" value={countedCash} onChangeText={setCountedCash} editable={!busy} keyboardType="decimal-pad" />
            <Field label="Notes (optional)" value={notes} onChangeText={setNotes} editable={!busy} autoCapitalize="sentences" />
            <Button title="Close shift" variant="danger" onPress={close} busy={busy} />
          </View>
        </>
      ) : !loading ? (
        <View style={styles.card}>
          <ThemedText style={styles.title}>Open a shift</ThemedText>
          <ThemedText style={styles.meta}>Cash payments need an open shift at your counter.</ThemedText>
          <Field label="Opening cash float" value={openingFloat} onChangeText={setOpeningFloat} editable={!busy} keyboardType="decimal-pad" />
          <Button title="Open shift" onPress={open} busy={busy} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function Line({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText style={emphasis ? styles.bold : styles.text}>{label}</ThemedText>
      <ThemedText style={emphasis ? styles.bold : styles.text}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' },
  card: { gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  meta: { fontSize: 13, color: '#475569' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  text: { fontSize: 14, color: '#334155' },
  bold: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
});
