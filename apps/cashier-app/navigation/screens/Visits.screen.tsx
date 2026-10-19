import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Field from '@ui/Field';
import Banner from '@ui/Banner';
import { billingService } from '@services/billingService';
import type { VisitBillSummary } from '../../types/billing';
import { facilityLabel } from '../../utils/presentation';
import { formatMoney } from '../../utils/money';
import VisitBillPanel from '../../components/VisitBillPanel';

export default function VisitsScreen() {
  const [search, setSearch] = useState('');
  const [visitKey, setVisitKey] = useState('');
  const [results, setResults] = useState<VisitBillSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    setBusy(true);
    setError(null);
    const [items, err] = await billingService.searchVisits({ search, visitKey });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setResults(items ?? []);
  };

  const close = () => {
    setSelected(null);
    void runSearch();
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {selected ? (
        <VisitBillPanel anchorInvoiceId={selected} onClose={close} />
      ) : (
        <View style={styles.stack}>
          <View style={styles.card}>
            <Field label="Patient name" value={search} onChangeText={setSearch} editable={!busy} autoCapitalize="words" onSubmitEditing={runSearch} />
            <Field label="Visit key" value={visitKey} onChangeText={setVisitKey} editable={!busy} onSubmitEditing={runSearch} />
            <Button title="Find bills" onPress={runSearch} busy={busy} />
          </View>
          <Banner message={error} />
          {results && results.length === 0 ? <ThemedText style={styles.empty}>No open bills match.</ThemedText> : null}
          {results?.map((bill) => (
            <Pressable
              key={bill.anchorInvoiceId}
              accessibilityRole="button"
              style={styles.card}
              onPress={() => setSelected(bill.anchorInvoiceId)}
            >
              <View style={styles.row}>
                <ThemedText style={styles.patient}>{bill.patientName}</ThemedText>
                <ThemedText style={styles.balance}>{formatMoney(bill.balance, bill.currency)}</ThemedText>
              </View>
              <ThemedText style={styles.meta}>
                {bill.visitKey ? `Visit ${bill.visitKey} · ` : ''}
                {bill.invoiceCount} invoice(s): {bill.facilityTypes.map(facilityLabel).join(', ')}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' },
  stack: { gap: 12 },
  card: { gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  patient: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  balance: { fontSize: 16, fontWeight: '800', color: '#047857' },
  meta: { fontSize: 13, color: '#475569' },
  empty: { fontSize: 14, color: '#64748B', textAlign: 'center', padding: 16 },
});
