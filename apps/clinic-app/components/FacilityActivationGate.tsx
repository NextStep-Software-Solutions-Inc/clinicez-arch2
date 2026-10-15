import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { theme } from '@constants/theme';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Input from '@ui/Input';
import Badge, { BadgeVariant } from '@ui/Badge';
import Icon from '@ui/Icon';
import Modal from '@ui/Modal';
import { clinicService, FacilityLicenseStatus } from '../services/clinicService';
import { getOfflineGraceHours, getServiceSubdomain, getSetting, isWorkspaceRequired } from '../services/runtimeConfig';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';
import {
  resolveTenantContext,
  setActiveTenantContext,
  setActiveClinicId,
  clearActiveTenantContext,
  isValidTenantSlug,
  getStoredTenantSlug,
  parseServiceHost,
  buildServiceHostRegex,
} from '@shared/safe';

/** Builds `<protocol>//<host>[:port]` keeping the current scheme and port (web only). */
const buildHostUrl = (host: string): string => {
  const { protocol, port } = window.location;
  return `${protocol}//${host}${port ? `:${port}` : ''}`;
};

const LICENSE_CACHE_KEY = 'clinicez.license.cache';

interface CachedLicense {
  license: FacilityLicenseStatus;
  cachedAt: number;
}

/** Remembers the last verified Active license so a device that is offline can keep working within the grace window. */
function cacheLicense(license: FacilityLicenseStatus, tenant?: string | null) {
  if (license.status !== 'Active') return;
  const entry: CachedLicense = { license, cachedAt: Date.now() };
  const key = tenant ? `${LICENSE_CACHE_KEY}_${tenant.toLowerCase()}` : LICENSE_CACHE_KEY;
  setDeviceItem(key, JSON.stringify(entry));
}

function readCachedLicense(tenant?: string | null): FacilityLicenseStatus | null {
  try {
    const key = tenant ? `${LICENSE_CACHE_KEY}_${tenant.toLowerCase()}` : LICENSE_CACHE_KEY;
    const raw = getDeviceItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedLicense;
    const graceMs = getOfflineGraceHours() * 60 * 60 * 1000;
    if (!entry?.license || entry.license.status !== 'Active' || Date.now() - entry.cachedAt > graceMs) return null;
    return entry.license;
  } catch {
    return null;
  }
}

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

export const useFacilityLicense = (): LicenseContextValue => {
  const globalMock = (globalThis as any).__mockFacilityLicense;
  if (globalMock) return globalMock;
  return useContext(FacilityLicenseContext);
};

interface FacilityActivationGateProps {
  children: ReactNode;
}

export function FacilityActivationGate({ children }: FacilityActivationGateProps) {
  const workspaceRequired = isWorkspaceRequired();
  const initialContext = resolveTenantContext();
  const initialWorkspace = initialContext.facilitySlug || initialContext.tenantSlug;
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(() => initialWorkspace);
  const [workspaceInput, setWorkspaceInput] = useState(() => getStoredTenantSlug() || '');
  const [license, setLicense] = useState<FacilityLicenseStatus | null>(null);
  const [isLoading, setIsLoading] = useState(() => !workspaceRequired || !!initialWorkspace);
  const [isNotFound, setIsNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchStatus = useCallback(async () => {
    const currentCtx = resolveTenantContext();
    const currentWorkspace = activeWorkspace || currentCtx.facilitySlug || currentCtx.tenantSlug;
    // Cloud hosts need a workspace; an on-prem server or a native device pointed at a clinic server does not.
    if (workspaceRequired && (!currentWorkspace || !isValidTenantSlug(currentWorkspace))) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsNotFound(false);
    try {
      const [res, err] = await clinicService.getLicenseStatus();
      if (err) {
        if (err.status === 404) {
          setIsNotFound(true);
          setError(`Workspace "${currentWorkspace}" was not found or has no active facilities registered.`);
        } else if (err.status === 0 && readCachedLicense(currentWorkspace)) {
          // Server unreachable: continue on the last verified license until the offline grace window ends.
          setLicense(readCachedLicense(currentWorkspace));
        } else {
          setError(err.message || 'Unable to communicate with clinic service.');
        }
      } else if (res) {
        if (res.clinicId) {
          setActiveClinicId(String(res.clinicId), currentWorkspace ?? undefined);
        }
        cacheLicense(res, currentWorkspace);
        setLicense(res);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to check facility license status.');
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspace, workspaceRequired]);

  useEffect(() => {
    if (activeWorkspace || !workspaceRequired) {
      fetchStatus();
    }
  }, [activeWorkspace, workspaceRequired, fetchStatus]);

  const handleSelectWorkspace = () => {
    const trimmed = workspaceInput.trim().toLowerCase();
    if (!trimmed || !isValidTenantSlug(trimmed)) {
      setError('Please enter a valid workspace slug (e.g. metro-health).');
      return;
    }
    setActiveTenantContext(trimmed);
    setActiveWorkspace(trimmed);
    setError(null);
    setSubmitError(null);
    setLicense(null);
    setIsNotFound(false);

    // If on web and on wildcard root domain, navigate to dedicated tenant subdomain
    if (typeof window !== 'undefined' && window.location) {
      const host = window.location.hostname.toLowerCase();
      const rootParts = parseServiceHost(host, getServiceSubdomain());
      if (rootParts && !rootParts.facility) {
        window.location.href = buildHostUrl(`${trimmed}.${getServiceSubdomain()}.${rootParts.baseDomain}`);
        return;
      }
    }
  };

  const handleSwitchWorkspace = () => {
    clearActiveTenantContext();
    setActiveWorkspace(null);
    setLicense(null);
    setError(null);
    setSubmitError(null);
    setIsNotFound(false);
    setWorkspaceInput('');

    // If on a tenant subdomain on web, return to root domain
    if (typeof window !== 'undefined' && window.location) {
      const host = window.location.hostname.toLowerCase();
      const tenantParts = parseServiceHost(host, getServiceSubdomain());
      if (tenantParts && tenantParts.facility) {
        window.location.href = buildHostUrl(`${getServiceSubdomain()}.${tenantParts.baseDomain}`);
        return;
      }
    }
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
          setActiveClinicId(String(res.clinicId), activeWorkspace || undefined);
        }
        cacheLicense(res, activeWorkspace);
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
    activeTenant: activeWorkspace,
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
        <View style={[styles.card, styles.loadingCard]}>
          <BrandMark />
          <ThemedText variant="h2" style={styles.centerText}>
            Clinic EZ
          </ThemedText>
          <ThemedText variant="body" color={theme.colors.textSecondary} style={styles.centerText}>
            {activeWorkspace
              ? `Checking the license for workspace "${activeWorkspace}"...`
              : 'Loading your workspace...'}
          </ThemedText>
          <ActivityIndicator size="large" color={theme.colors.primary} style={styles.spinner} />
        </View>
      </View>
    );
  }

  // 2. Prompt for Workspace Slug if none could be resolved (bare root access)
  if (workspaceRequired && !activeWorkspace) {
    return (
      <FacilityLicenseContext.Provider value={contextValue}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.centerContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <BrandMark />

            <View style={styles.headerGroup}>
              <ThemedText variant="h1">Choose your workspace</ThemedText>
              <ThemedText variant="body" color={theme.colors.textSecondary}>
                Enter your workspace name to sign in, or open Clinic EZ from the Portal.
              </ThemedText>
            </View>

            {error && <ErrorNotice message={error} />}

            <Input
              label="Workspace name"
              value={workspaceInput}
              onChangeText={setWorkspaceInput}
              placeholder="e.g. metro-health"
              autoCapitalize="none"
              autoCorrect={false}
              helperText="You can find this in your Portal address, for example metro-health or your clinic slug (e.g. clinic-b)."
            />

            <Button title="Continue" size="lg" onPress={handleSelectWorkspace} />
          </View>
        </ScrollView>
      </FacilityLicenseContext.Provider>
    );
  }

  // 3. Workspace Not Found (404) Screen
  if (isNotFound) {
    const resolvePortalUrl = () => {
      const portalUrl = getSetting('EXPO_PUBLIC_PORTAL_URL');
      if (portalUrl) {
        return portalUrl;
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
        const host = window.location.hostname;
        const match = host.toLowerCase().match(buildServiceHostRegex());
        if (match) {
          // Navigate to the root base domain (the part after the service subdomain) without any hardcoded prefix
          return buildHostUrl(match[3]);
        }
        return window.location.origin;
      }
      return '/';
    };
    const portalUrl = resolvePortalUrl();

    return (
      <FacilityLicenseContext.Provider value={contextValue}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.centerContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <BrandMark />
            <Badge label="Workspace not found" variant="emergency" icon="alertCircle" />

            <View style={styles.headerGroup}>
              <ThemedText variant="h1">Workspace not found</ThemedText>
              <ThemedText variant="body" color={theme.colors.textSecondary}>
                We couldn't find a workspace named{' '}
                <ThemedText variant="bodyBold">"{activeWorkspace}"</ThemedText>. Check the name and try
                again, or ask your administrator to confirm it is registered in Clinic EZ.
              </ThemedText>
            </View>

            <View style={styles.actions}>
              <Button title="Choose another workspace" size="lg" onPress={handleSwitchWorkspace} />

              {Platform.OS === 'web' && typeof window !== 'undefined' && (
                <Button
                  title="Open Clinic EZ Portal"
                  variant="secondary"
                  size="lg"
                  onPress={() => {
                    window.location.href = portalUrl;
                  }}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </FacilityLicenseContext.Provider>
    );
  }

  // 4. Unactivated / Expired / Tampered State -> Show Mandatory Activation Gate
  const isGateBlocked =
    !license ||
    license.status === 'ActivationRequired' ||
    license.status === 'Tampered' ||
    license.status === 'Expired';

  if (isGateBlocked) {
    const isTampered = license?.status === 'Tampered' || license?.isTampered;
    const isExpired = license?.status === 'Expired';

    let bannerTitle = 'Activate this facility';
    let bannerSubtitle =
      'This facility needs a license key before it can be used. Copy the key from your workspace in the Clinic EZ Portal and paste it below.';
    let badgeLabel = 'Activation required';
    let badgeVariant: BadgeVariant = 'primary';

    if (isTampered) {
      bannerTitle = 'License could not be verified';
      bannerSubtitle =
        "This facility's license failed its security check, which means its records may have been changed without permission. Apply a new license key from the Portal or contact support.";
      badgeLabel = 'License tampered';
      badgeVariant = 'emergency';
    } else if (isExpired) {
      bannerTitle = 'Facility license expired';
      bannerSubtitle =
        'This facility\'s license has passed its expiry date. Paste a renewed license key from your Portal workspace to keep using Clinic EZ.';
      badgeLabel = 'License expired';
      badgeVariant = 'warning';
    }

    return (
      <FacilityLicenseContext.Provider value={contextValue}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.centerContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.topRow}>
              <BrandMark />
              {workspaceRequired ? (
                <Button
                  title="Change workspace"
                  variant="ghost"
                  size="sm"
                  icon="arrowLeft"
                  onPress={handleSwitchWorkspace}
                />
              ) : null}
            </View>

            <View style={styles.headerGroup}>
              <View style={styles.badgeRow}>
                <Badge label={badgeLabel} variant={badgeVariant} />
                {activeWorkspace ? (
                  <View style={styles.workspaceChip}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Workspace
                    </ThemedText>
                    <ThemedText variant="code">{activeWorkspace}</ThemedText>
                  </View>
                ) : null}
              </View>
              <ThemedText variant="h1">{bannerTitle}</ThemedText>
              <ThemedText variant="body" color={theme.colors.textSecondary}>
                {bannerSubtitle}
              </ThemedText>
            </View>

            {license?.errorMessage && <ErrorNotice message={license.errorMessage} />}
            {error && <ErrorNotice message={error} />}
            {submitError && <ErrorNotice message={submitError} />}

            <Input
              label="License key"
              multiline
              numberOfLines={4}
              value={tokenInput}
              onChangeText={setTokenInput}
              placeholder="Paste the license key copied from the Portal here..."
              autoCapitalize="none"
              autoCorrect={false}
              inputStyle={styles.tokenInput}
              helperText="The key is signed for your facility and sets your plan and staff limit."
            />

            <View style={styles.actions}>
              <Button
                title="Activate facility"
                size="lg"
                loading={submitting}
                onPress={handleApplyLicense}
              />
              <Button
                title="Check again"
                variant="ghost"
                size="lg"
                onPress={fetchStatus}
                disabled={submitting}
              />
            </View>
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
        raw
        visible={modalVisible}
        transparent
        animationType="fade"
        onClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.card, styles.modalCard]}>
            <View style={styles.headerGroup}>
              <ThemedText variant="h2">Update facility license</ThemedText>
              <View style={styles.summaryRow}>
                {activeWorkspace ? (
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    Workspace: <ThemedText variant="smallBold">{activeWorkspace}</ThemedText>
                  </ThemedText>
                ) : null}
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  Current plan: <ThemedText variant="smallBold">{license.planTier}</ThemedText>
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  Max staff: <ThemedText variant="smallBold">{license.limits?.maxStaff ?? 5}</ThemedText>
                </ThemedText>
              </View>
            </View>

            {submitError && <ErrorNotice message={submitError} />}

            <Input
              multiline
              numberOfLines={4}
              value={tokenInput}
              onChangeText={setTokenInput}
              placeholder="Paste the updated license key from the Portal..."
              autoCapitalize="none"
              autoCorrect={false}
              inputStyle={styles.tokenInput}
            />

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setModalVisible(false)}
                disabled={submitting}
              />
              <Button title="Apply license" loading={submitting} onPress={handleApplyLicense} />
            </View>
          </View>
        </View>
      </Modal>
    </FacilityLicenseContext.Provider>
  );
}

/** Small brand mark: clinic icon in a primary-colored rounded tile. */
function BrandMark() {
  return (
    <View style={styles.brandTile}>
      <Icon name="clinic" size={theme.sizes.iconLg} color={theme.colors.onPrimary} />
    </View>
  );
}

/** Inline error message in the shared emergency colors. */
function ErrorNotice({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
      <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.errorText}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centerContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing['2xl'],
    backgroundColor: theme.colors.background,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing['3xl'],
    maxWidth: 480,
    width: '100%',
    gap: theme.spacing.xl,
    ...theme.shadows.lg,
  },
  loadingCard: {
    alignItems: 'center',
    gap: theme.spacing.md,
    maxWidth: 400,
  },
  modalCard: {
    maxWidth: 520,
    maxHeight: '95%',
    overflow: 'hidden',
    padding: theme.spacing['2xl'],
    gap: theme.spacing.lg,
  },
  centerText: {
    textAlign: 'center',
  },
  spinner: {
    marginTop: theme.spacing.sm,
  },
  brandTile: {
    width: theme.sizes.controlLg,
    height: theme.sizes.controlLg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerGroup: {
    gap: theme.spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  workspaceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs / 2,
  },
  actions: {
    gap: theme.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.spacing.lg,
    rowGap: theme.spacing.xs,
  },
  tokenInput: {
    ...theme.typography.code,
    minHeight: theme.sizes.controlLg * 2,
    textAlignVertical: 'top',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  errorText: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
  },
});
