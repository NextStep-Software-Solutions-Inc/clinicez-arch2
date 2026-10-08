import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Modal,
  Platform,
} from 'react-native';
import { laboratoryService, LabLicenseStatus } from '../services/laboratoryService';

interface LicenseContextValue {
  license: LabLicenseStatus | null;
  isLoading: boolean;
  error: string | null;
  refreshLicense: () => Promise<void>;
  openActivationModal: () => void;
  closeActivationModal: () => void;
}

const FacilityLicenseContext = createContext<LicenseContextValue>({
  license: null,
  isLoading: false,
  error: null,
  refreshLicense: async () => {},
  openActivationModal: () => {},
  closeActivationModal: () => {},
});

export const useFacilityLicense = () => useContext(FacilityLicenseContext);

interface FacilityActivationGateProps {
  children: ReactNode;
}

export function FacilityActivationGate({ children }: FacilityActivationGateProps) {
  const [license, setLicense] = useState<LabLicenseStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [res, err] = await laboratoryService.getLicenseStatus();
      if (err) {
        setError(err.message || 'Unable to communicate with local laboratory service.');
      } else if (res) {
        setLicense(res);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to check laboratory facility license status.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleApplyLicense = async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setSubmitError('Please enter or paste a laboratory license token.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const [res, err] = await laboratoryService.applyLicense(trimmed);
      if (err) {
        setSubmitError(err.message || 'License verification failed.');
      } else if (res) {
        setLicense(res);
        setTokenInput('');
        setModalVisible(false);
      }
    } catch (e: any) {
      setSubmitError(e?.message || 'Error occurred while applying license.');
    } finally {
      setSubmitting(false);
    }
  };

  const contextValue: LicenseContextValue = {
    license,
    isLoading,
    error,
    refreshLicense: fetchStatus,
    openActivationModal: () => {
      setSubmitError(null);
      setModalVisible(true);
    },
    closeActivationModal: () => setModalVisible(false),
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.splashCard}>
          <Text style={styles.splashIcon}>🔬</Text>
          <Text style={styles.splashTitle}>LIS Laboratory Edge</Text>
          <Text style={styles.splashSubtitle}>Verifying cryptographic facility license & integrity...</Text>
          <ActivityIndicator size="large" color="#0D9488" style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  const isGateBlocked =
    !license ||
    license.status === 'ActivationRequired' ||
    license.status === 'Tampered' ||
    license.status === 'Expired';

  if (isGateBlocked) {
    const isTampered = license?.status === 'Tampered' || license?.isTampered;
    const isExpired = license?.status === 'Expired';

    let bannerTitle = 'Laboratory Activation Required';
    let bannerSubtitle =
      'This clinical diagnostic laboratory instance requires an authentic, cryptographically signed license key generated from the Clinic EZ Portal to operate on-premise.';
    let badgeColor = '#0D9488';
    let badgeBg = '#CCFBF1';

    if (isTampered) {
      bannerTitle = 'Security Violation: Tampered License';
      bannerSubtitle =
        'Cryptographic ECDSA signature verification failed. Local database records or signed limits have been altered without authorization.';
      badgeColor = '#DC2626';
      badgeBg = '#FEE2E2';
    } else if (isExpired) {
      bannerTitle = 'Laboratory License Expired';
      bannerSubtitle =
        'Your diagnostic facility license has passed its expiration date. Please apply a renewed license key to continue.';
      badgeColor = '#D97706';
      badgeBg = '#FEF3C7';
    }

    return (
      <FacilityLicenseContext.Provider value={contextValue}>
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.centerContainer}>
          <View style={styles.activationCard}>
            <View style={[styles.badgePill, { backgroundColor: badgeBg }]}>
              <Text style={[styles.badgeText, { color: badgeColor }]}>
                {license?.status ?? 'Activation Required'}
              </Text>
            </View>

            <Text style={styles.cardHeaderTitle}>{bannerTitle}</Text>
            <Text style={styles.cardHeaderDesc}>{bannerSubtitle}</Text>

            {license?.errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{license.errorMessage}</Text>
              </View>
            )}

            {submitError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{submitError}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Cryptographic License Token</Text>
              <TextInput
                style={styles.tokenInput}
                multiline
                numberOfLines={4}
                value={tokenInput}
                onChangeText={setTokenInput}
                placeholder="Paste the [payload].[signature] token copied from the Portal here..."
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.inputHint}>
                Tokens are cryptographically signed with ECDSA P-256 and bind your Laboratory ID, Tier, and Staff Quota.
              </Text>
            </View>

            <Pressable
              style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
              onPress={handleApplyLicense}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify & Activate Laboratory</Text>
              )}
            </Pressable>

            <Pressable style={styles.secondaryBtn} onPress={fetchStatus} disabled={submitting}>
              <Text style={styles.secondaryBtnText}>↻ Re-check Status</Text>
            </Pressable>
          </View>
        </ScrollView>
      </FacilityLicenseContext.Provider>
    );
  }

  return (
    <FacilityLicenseContext.Provider value={contextValue}>
      {children}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Laboratory License</Text>
            <Text style={styles.modalSubtitle}>
              Current Plan: <Text style={{ fontWeight: '700' }}>{license.planTier}</Text> • Max Staff:{' '}
              <Text style={{ fontWeight: '700' }}>{license.limits?.maxStaff ?? 5}</Text>
            </Text>

            {submitError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{submitError}</Text>
              </View>
            )}

            <TextInput
              style={styles.modalTokenInput}
              multiline
              numberOfLines={4}
              value={tokenInput}
              onChangeText={setTokenInput}
              placeholder="Paste updated license token from Portal..."
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={submitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalApplyBtn, submitting && { opacity: 0.6 }]}
                onPress={handleApplyLicense}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Verify & Apply</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </FacilityLicenseContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centerContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F3F4F6',
  },
  splashCard: {
    backgroundColor: '#FFFFFF',
    padding: 36,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    maxWidth: 400,
    width: '100%',
  },
  splashIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  splashTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  splashSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
  },
  activationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    maxWidth: 520,
    width: '100%',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 20,
    gap: 16,
  },
  badgePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardHeaderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardHeaderDesc: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 21,
  },
  formGroup: {
    gap: 8,
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
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
    minHeight: 110,
    textAlignVertical: 'top',
  },
  inputHint: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  primaryBtn: {
    backgroundColor: '#0D9488',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#0D9488',
    fontWeight: '600',
    fontSize: 14,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  errorBannerText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    maxWidth: 500,
    width: '100%',
    gap: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#475569',
  },
  modalTokenInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14,
  },
  modalApplyBtn: {
    backgroundColor: '#0D9488',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
});
