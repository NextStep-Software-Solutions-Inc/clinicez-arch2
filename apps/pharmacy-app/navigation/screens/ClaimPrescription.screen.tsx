import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { useNavigation } from '@react-navigation/native';
import { pharmacyService } from '../../services/pharmacyService';
import { claimErrorMessage } from '../../utils/prescriptionPresentation';
import { pollForOrder } from '../../utils/claimFlow';

type ClaimPhase = 'idle' | 'claiming' | 'waiting';

const STILL_ARRIVING_MESSAGE =
  'The prescription was claimed but is still arriving. Check the queue again shortly.';

export default function ClaimPrescriptionScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const [token, setToken] = useState('');
  const [phase, setPhase] = useState<ClaimPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const busy = phase !== 'idle';

  const handleClaim = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setErrorMessage('Scan or paste the prescription code first.');
      return;
    }

    setErrorMessage(null);
    setNoticeMessage(null);
    setPhase('claiming');

    const [claim, claimError] = await pharmacyService.claimPrescription(trimmed);
    if (claimError || !claim) {
      setPhase('idle');
      setErrorMessage(claimError ? claimErrorMessage(claimError) : 'The prescription could not be claimed. Please try again.');
      return;
    }

    setPhase('waiting');
    const result = await pollForOrder(() => pharmacyService.getPrescriptionByPrescriptionId(claim.prescriptionId), {
      isCancelled: () => cancelled.current,
    });
    if (result.status === 'cancelled') return;

    setPhase('idle');
    if (result.status === 'found') {
      setToken('');
      navigation.navigate('Dispense', { orderId: result.value.id });
      return;
    }
    if (result.status === 'timeout') {
      setToken('');
      setNoticeMessage(STILL_ARRIVING_MESSAGE);
      return;
    }
    setErrorMessage(result.error.message || 'Could not load the claimed prescription.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Pharmacy Suite &amp; Interoperability</ThemedText>
        <ThemedText style={styles.title}>Scan Prescription to Claim</ThemedText>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>Prescription code</ThemedText>
        <ThemedText style={styles.hint}>
          Enter or paste the code from the patient&apos;s prescription QR. The prescription is delivered to this
          pharmacy&apos;s queue after it is claimed.
        </ThemedText>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
          </View>
        ) : null}

        {noticeMessage ? (
          <View style={styles.noticeBox}>
            <ThemedText style={styles.noticeText}>{noticeMessage}</ThemedText>
            <Pressable style={styles.secondaryBtn} onPress={() => navigation.navigate('Prescriptions')}>
              <ThemedText style={styles.secondaryBtnText}>Open queue</ThemedText>
            </Pressable>
          </View>
        ) : null}

        <TextInput
          style={styles.tokenInput}
          multiline
          numberOfLines={3}
          value={token}
          onChangeText={setToken}
          placeholder="Paste or type the prescription code..."
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />

        <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={handleClaim} disabled={busy}>
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color="#FFFFFF" />
              <ThemedText style={styles.primaryBtnText}>
                {phase === 'claiming' ? 'Claiming...' : 'Waiting for the prescription to arrive...'}
              </ThemedText>
            </View>
          ) : (
            <ThemedText style={styles.primaryBtnText}>Claim prescription</ThemedText>
          )}
        </Pressable>
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
    color: '#0D9488',
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  hint: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
  },
  noticeBox: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  noticeText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
  },
  tokenInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 14,
    fontSize: 13,
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    minHeight: 90,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    backgroundColor: '#0D9488',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#B45309',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  secondaryBtnText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
  },
});
