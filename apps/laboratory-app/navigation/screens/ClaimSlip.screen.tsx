import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { laboratoryService } from '../../services/laboratoryService';
import { describeClaimError } from '../../utils/requisitionPresentation';

type ClaimOutcome = { kind: 'success'; message: string } | { kind: 'error'; message: string };

export default function ClaimSlipScreen() {
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<ClaimOutcome | null>(null);

  const handleClaim = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setOutcome({ kind: 'error', message: 'Scan the slip QR code or paste its claim code first.' });
      return;
    }

    setSubmitting(true);
    setOutcome(null);
    const [, err] = await laboratoryService.claimRequisition(trimmed);
    setSubmitting(false);

    if (err) {
      setOutcome({ kind: 'error', message: describeClaimError(err) });
      return;
    }

    setToken('');
    setOutcome({
      kind: 'success',
      message: 'Slip claimed. The order is being delivered and will appear in the Worklist tab in a moment.',
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Walk-in patients</ThemedText>
        <ThemedText style={styles.title}>Scan slip to claim</ThemedText>
        <ThemedText style={styles.help}>
          Scan the QR code on the patient's paper order slip with a handheld scanner, or paste the claim code, to receive the order at this laboratory.
        </ThemedText>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.label}>Claim code</ThemedText>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          placeholder="Scan or paste the slip code"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          onSubmitEditing={handleClaim}
          returnKeyType="done"
        />

        <Pressable style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]} onPress={handleClaim} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.primaryButtonText}>Claim order</ThemedText>}
        </Pressable>

        {outcome ? (
          <View style={[styles.notice, outcome.kind === 'success' ? styles.noticeSuccess : styles.noticeError]}>
            <ThemedText style={[styles.noticeText, outcome.kind === 'success' ? styles.noticeTextSuccess : styles.noticeTextError]}>
              {outcome.message}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  subtitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#4B5563',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  help: {
    fontSize: 13,
    color: '#6B7280',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  notice: {
    borderRadius: 10,
    padding: 12,
  },
  noticeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  noticeError: {
    backgroundColor: '#FEE2E2',
  },
  noticeText: {
    fontSize: 13,
  },
  noticeTextSuccess: {
    color: '#166534',
  },
  noticeTextError: {
    color: '#B91C1C',
  },
});
