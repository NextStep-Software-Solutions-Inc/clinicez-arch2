import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Field from '@ui/Field';
import Banner from '@ui/Banner';
import { billingService } from '@services/billingService';
import type { CollectionBucket, DailyCollectionReport } from '../../types/billing';
import { deviceUtcOffsetMinutes, isDateString, localDateString } from '../../utils/presentation';
import { formatMoney } from '../../utils/money';

export default function ReportsScreen() {
  const today = localDateString(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<DailyCollectionReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!isDateString(from) || !isDateString(to)) {
      setError('Enter dates as YYYY-MM-DD.');
      return;
    }
    setBusy(true);
    setError(null);
    const [result, err] = await billingService.dailyCollection({ from, to, utcOffsetMinutes: deviceUtcOffsetMinutes() });
    setBusy(false);
    if (err || !result) {
      setError(err?.message ?? 'The report could not be loaded.');
      return;
    }
    setReport(result);
  };

  const money = (amount: number) => formatMoney(amount, report?.currency ?? 'PHP');

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Field label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} editable={!busy} />
        <Field label="To (YYYY-MM-DD)" value={to} onChangeText={setTo} editable={!busy} />
        <Button title="Show daily collection" onPress={run} busy={busy} />
      </View>
      <Banner message={error} />

      {report ? (
        <>
          <View style={styles.card}>
            <ThemedText style={styles.title}>
              {report.from} to {report.to}
            </ThemedText>
            <Line label={`Collected at the counter (${report.receiptCount} receipts)`} value={money(report.collected)} />
            <Line label="Settled by insurers" value={money(report.externalSettled)} />
            <Line label="Refunded" value={money(report.refunded)} />
            <Line label="Net collected" value={money(report.net)} emphasis />
          </View>

          <View style={styles.card}>
            <ThemedText style={styles.title}>By day</ThemedText>
            {report.days.map((day) => (
              <Line key={day.date} label={`${day.date} · ${day.count} receipts`} value={money(day.net)} />
            ))}
          </View>

          <Buckets title="By payment method" buckets={report.byMethod} money={money} />
          <Buckets title="By cashier" buckets={report.byCashier} money={money} />
          <Buckets title="By branch" buckets={report.byBranch} money={money} />
          <Buckets title="By facility" buckets={report.byFacility} money={money} />
        </>
      ) : null}
    </ScrollView>
  );
}

function Buckets({ title, buckets, money }: { title: string; buckets: CollectionBucket[]; money: (amount: number) => string }) {
  if (buckets.length === 0) return null;
  return (
    <View style={styles.card}>
      <ThemedText style={styles.title}>{title}</ThemedText>
      {buckets.map((bucket) => (
        <Line key={bucket.key} label={`${bucket.key} · ${bucket.count}`} value={money(bucket.net + bucket.externalAmount)} />
      ))}
    </View>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  text: { fontSize: 14, color: '#334155', flexShrink: 1 },
  bold: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
});
