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
import { clinicService, FacilityLicenseStatus } from '../services/clinicService';
import {
  resolveTenantContext,
  setActiveTenantContext,
  setActiveClinicId,
  clearActiveTenantContext,
} from '@shared/safe';

interface LicenseContextValue {
  license: FacilityLicenseStatus | null;
  isLoading: boolean;
  error: string | null;
  activeTenant: string | null;
  refreshLicense: () => Promise<void>;
  openActivationModal: () => void;
  closeActivationModal: () => void;
  switchWorkspace: () => void;
}

const FacilityLicenseContext = createContext<LicenseContextValue>({
  license: null,
  isLoading: false,
  error: null,
  activeTenant: null,
  refreshLicense: async () => {},
  openActivationModal: () => {},
  closeActivationModal: () => {},
  switchWorkspace: () => {},
});

export const useFacilityLicense = () => useContext(FacilityLicenseContext);

interface FacilityActivationGateProps {
  children: ReactNode;
}

export function FacilityActivationGate({ children }: FacilityActivationGateProps) {
  const [activeTenant, setActiveTenant] = useState<string | null>(() => resolveTenantContext().tenantSlug);
  const [workspaceInput, setWorkspaceInput] = useState('');
  const [license, setLicense] = useState<FacilityLicenseStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchStatus = useCallback(async () => {
    const currentTenant = resolveTenantContext().tenantSlug;
    if (!currentTenant) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [res, err] = await clinicService.getLicenseStatus();
      if (err) {
        if (err.status === 404) {
          setError(`Workspace "${currentTenant}" was not found or has no active facilities registered.`);
        } else {
          setError(err.message || 'Unable to communicate with clinic service.');
        }
      } else if (res) {
        if (res.clinicId) {
          setActiveClinicId(String(res.clinicId), currentTenant);
        }
        setLicense(res);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to check facility license status.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTenant) {
      fetchStatus();
    }
  }, [activeTenant, fetchStatus]);

  const handleSelectWorkspace = () => {
    const trimmed = workspaceInput.trim().toLowerCase();
    if (!trimmed) {
      setError('Please enter a valid workspace slug.');
      return;
    }
    setActiveTenantContext(trimmed);
    setActiveTenant(trimmed);
    setError(null);
    setSubmitError(null);
    setLicense(null);
  };

  const handleSwitchWorkspace = () => {
    clearActiveTenantContext();
    setActiveTenant(null);
    setLicense(null);
    setError(null);
    setSubmitError(null);
    setWorkspaceInput('');
  };

  const handleApplyLicense = async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setSubmitError('Please enter or paste a facility license token.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const [res, err] = await clinicService.applyLicense(trimmed);
      if (err) {
        setSubmitError(err.message || 'License verification failed.');
      } else if (res) {
        if (res.clinicId) {
          setActiveClinicId(String(res.clinicId), activeTenant || undefined);
        }
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
    activeTenant,
    refreshLicense: fetchStatus,
    openActivationModal: () => {
      setSubmitError(null);
      setModalVisible(true);
    },
    closeActivationModal: () => setModalVisible(false),
    switchWorkspace: handleSwitchWorkspace,
  };

  // 1. Initial Loading Screen
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.splashCard}>
          <Text style={styles.splashIcon}>🏥</Text>
          <Text style={styles.splashTitle}>ClinicEz Console</Text>
          <Text style={styles.splashSubtitle}>
            {activeTenant
              ? `Verifying license & integrity for workspace "${activeTenant}"...`
              : 'Loading clinic workspace...'}
          </Text>
          <ActivityIndicator size="large" color="#0284C7" style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  // 2. Prompt for Workspace Slug if none could be resolved (bare root access)
  if (!activeTenant) {
    return (
      <FacilityLicenseContext.Provider value={contextValue}>
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.centerContainer}>
          <View style={styles.activationCard}>
            <View style={[styles.badgePill, { backgroundColor: '#E0F2FE' }]}>
              <Text style={[styles.badgeText, { color: '#0284C7' }]}>Multi-Tenant Console</Text>
            </View>

            <Text style={styles.cardHeaderTitle}>Select Clinic Workspace</Text>
            <Text style={styles.cardHeaderDesc}>
              Enter your clinic workspace slug to load your facility, or launch directly from the ClinicEz Portal.
            </Text>

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Workspace Slug</Text>
              <TextInput
                style={styles.singleLineInput}
                value={workspaceInput}
                onChangeText={setWorkspaceInput}
                placeholder="e.g. metro-health, st-jude"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.inputHint}>
                The identifier from your portal URL or subdomain (e.g. dev.clinicez.net/[slug]/dashboard).
              </Text>
            </View>

            <Pressable style={styles.primaryBtn} onPress={handleSelectWorkspace}>
              <Text style={styles.primaryBtnText}>Continue to Facility →</Text>
            </Pressable>
          </View>
        </ScrollView>
      </FacilityLicenseContext.Provider>
    );
  }

  // 3. Unactivated / Expired / Tampered State -> Show Mandatory Activation Gate
  const isGateBlocked =
    !license ||
    license.status === 'ActivationRequired' ||
    license.status === 'Tampered' ||
    license.status === 'Expired';

  if (isGateBlocked) {
    const isTampered = license?.status === 'Tampered' || license?.isTampered;
    const isExpired = license?.status === 'Expired';

    let bannerTitle = 'Facility Activation Required';
    let bannerSubtitle =
      'This clinic facility instance requires an authentic, cryptographically signed license key generated from the ClinicEz Portal.';
    let badgeColor = '#0284C7';
    let badgeBg = '#E0F2FE';

    if (isTampered) {
      bannerTitle = 'Security Violation: Tampered License';
      bannerSubtitle =
        'Cryptographic ECDSA signature verification failed. Local database records or signed limits have been altered without authorization.';
      badgeColor = '#DC2626';
      badgeBg = '#FEE2E2';
    } else if (isExpired) {
      bannerTitle = 'Facility License Expired';
      bannerSubtitle =
        'Your facility operating license has passed its expiration date. Please apply a renewed license key from your Portal workspace.';
      badgeColor = '#D97706';
      badgeBg = '#FEF3C7';
    }

    return (
      <FacilityLicenseContext.Provider value={contextValue}>
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.centerContainer}>
          <View style={styles.activationCard}>
            {/* Top Workspace Indicator Pill */}
            <View style={styles.workspaceRow}>
              <View style={[styles.badgePill, { backgroundColor: badgeBg }]}>
                <Text style={[styles.badgeText, { color: badgeColor }]}>
                  {license?.status ?? 'Activation Required'}
                </Text>
              </View>
              <Pressable onPress={handleSwitchWorkspace} style={styles.switchWorkspaceBtn}>
                <Text style={styles.switchWorkspaceBtnText}>Change Workspace</Text>
              </Pressable>
            </View>

            <View style={styles.workspaceNotice}>
              <Text style={styles.workspaceNoticeLabel}>Workspace: </Text>
              <Text style={styles.workspaceNoticeSlug}>{activeTenant}</Text>
            </View>

            <Text style={styles.cardHeaderTitle}>{bannerTitle}</Text>
            <Text style={styles.cardHeaderDesc}>{bannerSubtitle}</Text>

            {license?.errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{license.errorMessage}</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
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
                Tokens are cryptographically signed with ECDSA P-256 and bind your Facility ID, Tier, and Staff Quota.
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
                <Text style={styles.primaryBtnText}>Verify & Activate Facility</Text>
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

  // 4. Normal Active App with optional update modal
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
            <Text style={styles.modalTitle}>Update Facility License</Text>
            <Text style={styles.modalSubtitle}>
              Workspace: <Text style={{ fontWeight: '700' }}>{activeTenant}</Text> • Current Plan:{' '}
              <Text style={{ fontWeight: '700' }}>{license.planTier}</Text> • Max Staff:{' '}
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
  workspaceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchWorkspaceBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  switchWorkspaceBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284C7',
  },
  workspaceNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  workspaceNoticeLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  workspaceNoticeSlug: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
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
  singleLineInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
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
    backgroundColor: '#0284C7',
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
    color: '#0284C7',
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
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
});
