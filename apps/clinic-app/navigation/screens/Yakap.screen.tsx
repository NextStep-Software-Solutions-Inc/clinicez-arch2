import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Alert, notify } from '@utils/feedback';
import {
  ThemedText,
  Badge,
  Button,
  Input,
  Card,
  CardHeader,
  StatCard,
  ProgressBar,
  EmptyState,
  ErrorState,
  SkeletonList,
} from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { useClinic } from '../../context/ClinicContext';
import {
  clinicService,
  GamotBeneficiaryLedger,
  GamotFormularyItem,
  UpscVerifyResult,
  YakapMasterlistAssignment,
} from '../../services/clinicService';

type YakapTab = 'pin-checker' | 'gamot' | 'masterlist';

const TABS: Array<{ key: YakapTab; label: string }> = [
  { key: 'pin-checker', label: 'PIN check' },
  { key: 'gamot', label: 'GAMOT and UPSC' },
  { key: 'masterlist', label: 'Masterlist' },
];

/** Share of the annual allocation below which the remaining balance is flagged. */
const LOW_BALANCE_RATIO = 0.25;

function formatPeso(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function YakapScreen() {
  const { accreditationNumber } = useClinic();

  // Active point-of-care tab
  const [activeTab, setActiveTab] = useState<YakapTab>('pin-checker');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // GAMOT Ledger Tab State
  const [searchPin, setSearchPin] = useState('');
  const [ledger, setLedger] = useState<GamotBeneficiaryLedger | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [isSearchingLedger, setIsSearchingLedger] = useState(false);
  const [formulary, setFormulary] = useState<GamotFormularyItem[]>([]);
  const [formularyLoading, setFormularyLoading] = useState(true);
  const [formularyError, setFormularyError] = useState<string | null>(null);
  const [formularySearch, setFormularySearch] = useState('');
  const [formularyCategory, setFormularyCategory] = useState('all');

  // UPSC Verification State
  const [verifyUpscCode, setVerifyUpscCode] = useState('');
  const [verifyResult, setVerifyResult] = useState<UpscVerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifyingUpsc, setIsVerifyingUpsc] = useState(false);

  // Masterlist Sync Tab State (accreditation number defaults to the clinic's own)
  const [hciOverride, setHciOverride] = useState<string | null>(null);
  const hciNumber = hciOverride ?? accreditationNumber;
  const [cipherKey, setCipherKey] = useState('');
  const [masterlistItems, setMasterlistItems] = useState<YakapMasterlistAssignment[]>([]);
  const [masterlistSynced, setMasterlistSynced] = useState(false);
  const [masterlistError, setMasterlistError] = useState<string | null>(null);
  const [isSyncingMasterlist, setIsSyncingMasterlist] = useState(false);

  // Real-time PIN Checker State
  const [pinToCheck, setPinToCheck] = useState('');
  const [pinValidationResult, setPinValidationResult] = useState<{ isValid?: boolean; formatted?: string; error?: string } | null>(null);

  const loadFormulary = useCallback(async () => {
    setFormularyLoading(true);
    const [data, err] = await clinicService.getGamotFormulary();
    if (err) {
      setFormularyError(err.message || 'Unable to load the GAMOT formulary.');
    } else {
      setFormulary(data ?? []);
      setFormularyError(null);
    }
    setFormularyLoading(false);
  }, []);

  useEffect(() => {
    loadFormulary();
  }, [loadFormulary]);

  // Search GAMOT Ledger
  const handleSearchLedger = useCallback(async () => {
    const pin = searchPin.trim();
    if (!pin) return;
    setIsSearchingLedger(true);
    const [res, err] = await clinicService.getGamotLedger(pin);
    if (err || !res) {
      setLedger(null);
      setLedgerError(err?.message || 'No GAMOT ledger was found for this PIN.');
    } else {
      setLedger(res);
      setLedgerError(null);
    }
    setIsSearchingLedger(false);
  }, [searchPin]);

  // Verify UPSC Code
  const handleVerifyUpsc = async () => {
    if (!verifyUpscCode.trim()) {
      Alert.alert('Required', 'Please enter a valid UPSC authorization code.');
      return;
    }
    setIsVerifyingUpsc(true);
    const [res, err] = await clinicService.validateUpsc({
      uniquePrescriptionSecurityCode: verifyUpscCode.trim(),
    });
    if (err || !res) {
      setVerifyResult(null);
      setVerifyError(err?.message || 'The code could not be verified. Please try again.');
    } else {
      setVerifyResult(res);
      setVerifyError(null);
    }
    setIsVerifyingUpsc(false);
  };

  // Real-time PIN Mod-11 validation
  const handleValidatePin = useCallback(async () => {
    if (!pinToCheck.trim()) {
      setPinValidationResult(null);
      return;
    }
    const [res] = await clinicService.validatePhilHealthPin(pinToCheck.trim());
    if (res) {
      setPinValidationResult({
        isValid: res.isValid,
        formatted: res.formattedPin,
        error: res.failureReason,
      });
    } else {
      // Client-side Mod-11 fallback check
      const digits = pinToCheck.replace(/\D/g, '');
      if (digits.length !== 12) {
        setPinValidationResult({ isValid: false, error: 'PhilHealth PIN must be exactly 12 digits.' });
        return;
      }
      const weights = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < 11; i++) {
        sum += parseInt(digits[i], 10) * weights[i];
      }
      const rem = sum % 11;
      const expectedCheck = rem === 0 ? 0 : 11 - rem;
      const checkDigit = expectedCheck === 10 ? 0 : expectedCheck;
      const actualCheck = parseInt(digits[11], 10);
      const isValid = checkDigit === actualCheck;

      const formatted = `${digits.substring(0, 2)}-${digits.substring(2, 11)}-${digits.substring(11)}`;
      setPinValidationResult({
        isValid,
        formatted,
        error: isValid ? undefined : `Invalid check digit. Expected ${checkDigit}, got ${actualCheck}.`,
      });
    }
  }, [pinToCheck]);

  // Sync Masterlist
  const handleSyncMasterlist = async () => {
    if (!hciNumber.trim() || !cipherKey.trim()) {
      Alert.alert('Required', 'Enter the HCI accreditation number and cipher key to sync the masterlist.');
      return;
    }
    setIsSyncingMasterlist(true);
    const [res, err] = await clinicService.extractYakapMasterlist({
      hciAccreditationNumber: hciNumber.trim(),
      cipherKey,
    });
    if (err || !res || !Array.isArray(res)) {
      setMasterlistError(err?.message || 'The masterlist could not be synced. Please try again.');
    } else {
      setMasterlistItems(res);
      setMasterlistSynced(true);
      setMasterlistError(null);
      notify.success('Masterlist synced.');
    }
    setIsSyncingMasterlist(false);
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    if (activeTab === 'gamot') {
      await Promise.all([loadFormulary(), handleSearchLedger()]);
    } else if (activeTab === 'pin-checker') {
      await handleValidatePin();
    }
    setIsRefreshing(false);
  }, [activeTab, loadFormulary, handleSearchLedger, handleValidatePin]);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(formulary.map((item) => item.therapeuticCategory))).sort()],
    [formulary],
  );

  // Filter formulary items
  const filteredFormulary = formulary.filter((item) => {
    const matchesSearch =
      item.genericName.toLowerCase().includes(formularySearch.toLowerCase()) ||
      item.drugCode.toLowerCase().includes(formularySearch.toLowerCase()) ||
      item.therapeuticCategory.toLowerCase().includes(formularySearch.toLowerCase());
    const matchesCat = formularyCategory === 'all' || item.therapeuticCategory.toLowerCase() === formularyCategory.toLowerCase();
    return matchesSearch && matchesCat;
  });

  const showStats = ledger !== null || formulary.length > 0;

  const renderPinChecker = () => (
    <Card>
      <CardHeader title="PIN check" subtitle="Verify a PhilHealth Identification Number (PIN)." icon="yakap" />

      <View style={styles.inputRow}>
        <View style={styles.flexFill}>
          <Input
            label="PhilHealth PIN"
            placeholder="XX-XXXXXXXXX-X"
            value={pinToCheck}
            onChangeText={(val) => {
              setPinToCheck(val);
              setPinValidationResult(null);
            }}
            autoCapitalize="none"
          />
        </View>
        <Button title="Verify PIN" variant="primary" onPress={handleValidatePin} />
      </View>

      {pinValidationResult && (
        <View style={[styles.resultBox, pinValidationResult.isValid ? styles.resultBoxValid : styles.resultBoxInvalid]}>
          <View style={styles.resultHeader}>
            <Badge
              variant={pinValidationResult.isValid ? 'success' : 'emergency'}
              icon={pinValidationResult.isValid ? 'checkCircle' : 'alertCircle'}
              label={pinValidationResult.isValid ? 'Valid PIN' : 'Invalid PIN'}
            />
            {pinValidationResult.formatted ? (
              <ThemedText variant="bodyBold">{pinValidationResult.formatted}</ThemedText>
            ) : null}
          </View>
          {pinValidationResult.error ? (
            <ThemedText variant="small" color={theme.colors.emergencyText}>
              {pinValidationResult.error}
            </ThemedText>
          ) : (
            <ThemedText variant="small" color={theme.colors.successText}>
              The PIN's check digit is valid.
            </ThemedText>
          )}
        </View>
      )}
    </Card>
  );

  const renderLedgerCard = () => {
    const allocation = ledger?.annualAllocation ?? 0;
    const utilizedShare = ledger && allocation > 0 ? ledger.totalAmountUtilized / allocation : 0;
    const isLow = ledger ? ledger.remainingBalance < allocation * LOW_BALANCE_RATIO : false;

    return (
      <Card>
        <CardHeader
          title="GAMOT benefit balance"
          subtitle="Look up a member's annual outpatient medicine allocation."
          icon="pill"
        />
        <View style={styles.inputRow}>
          <View style={styles.flexFill}>
            <Input
              placeholder="Enter 12-digit PhilHealth PIN"
              value={searchPin}
              onChangeText={setSearchPin}
              onSubmitEditing={handleSearchLedger}
            />
          </View>
          <Button
            title="Check balance"
            variant="primary"
            loading={isSearchingLedger}
            disabled={!searchPin.trim()}
            onPress={handleSearchLedger}
          />
        </View>

        {isSearchingLedger ? (
          <SkeletonList rows={3} rowHeight={theme.sizes.controlMd} />
        ) : ledgerError ? (
          <ErrorState
            compact
            title="Unable to load ledger"
            message={ledgerError}
            onRetry={handleSearchLedger}
          />
        ) : ledger ? (
          <View style={styles.ledgerBox}>
            <View style={styles.ledgerHeaderRow}>
              <View style={styles.flexFill}>
                <ThemedText variant="h3">{ledger.patientName}</ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  PIN {ledger.philHealthIdentificationNumber} · Benefit year {ledger.benefitYear}
                </ThemedText>
              </View>
              <Badge
                variant={isLow ? 'warning' : 'success'}
                label={`${formatPeso(ledger.remainingBalance)} remaining`}
              />
            </View>

            <View style={styles.ledgerProgress}>
              <View style={styles.spreadRow}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Used {formatPeso(ledger.totalAmountUtilized)}
                  {allocation > 0 ? ` (${(utilizedShare * 100).toFixed(1)}%)` : ''}
                </ThemedText>
                <ThemedText variant="captionBold">Limit {formatPeso(allocation)}</ThemedText>
              </View>
              <ProgressBar
                progress={utilizedShare * 100}
                color={isLow ? theme.colors.warning : theme.colors.primary}
              />
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText variant="bodyBold">Recent dispenses ({ledger.transactions.length})</ThemedText>
              {ledger.transactions.length === 0 ? (
                <EmptyState
                  icon="pill"
                  title="No dispenses recorded"
                  description="Nothing has been dispensed against this benefit year yet."
                />
              ) : (
                ledger.transactions.map((d) => (
                  <View key={d.id} style={styles.listRow}>
                    <View style={styles.flexFill}>
                      <ThemedText variant="bodyBold">{d.genericName}</ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {d.notes || d.dispensingPharmacistName} · Ref {d.uniquePrescriptionSecurityCode}
                      </ThemedText>
                    </View>
                    <View style={styles.rowEnd}>
                      <ThemedText variant="bodyBold">{formatPeso(d.totalGamotAmount)}</ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Qty {d.quantityDispensed}
                      </ThemedText>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        ) : null}
      </Card>
    );
  };

  const renderUpscCard = () => (
    <Card>
      <CardHeader
        title="UPSC verifier"
        subtitle="Check a Unique Prescription Security Code before dispensing."
        icon="key"
      />
      <View style={styles.inputRow}>
        <View style={styles.flexFill}>
          <Input
            placeholder="Enter UPSC code"
            value={verifyUpscCode}
            onChangeText={(val) => {
              setVerifyUpscCode(val);
              setVerifyResult(null);
              setVerifyError(null);
            }}
            autoCapitalize="characters"
          />
        </View>
        <Button
          title="Verify code"
          variant="outline"
          loading={isVerifyingUpsc}
          onPress={handleVerifyUpsc}
        />
      </View>

      {verifyError ? (
        <ErrorState compact title="Unable to verify code" message={verifyError} onRetry={handleVerifyUpsc} />
      ) : verifyResult ? (
        <View style={[styles.resultBox, verifyResult.isValid ? styles.resultBoxValid : styles.resultBoxInvalid]}>
          <View style={styles.spreadRow}>
            <ThemedText variant="bodyBold">{verifyResult.uniquePrescriptionSecurityCode}</ThemedText>
            <Badge
              variant={verifyResult.isValid ? 'success' : 'emergency'}
              icon={verifyResult.isValid ? 'checkCircle' : 'alertCircle'}
              label={verifyResult.isValid ? 'Valid code' : 'Invalid or expired'}
            />
          </View>
          {verifyResult.failureReason ? (
            <ThemedText variant="small" color={theme.colors.emergencyText}>
              {verifyResult.failureReason}
            </ThemedText>
          ) : verifyResult.isValid ? (
            <ThemedText variant="small" color={theme.colors.successText}>
              This code can be used to dispense.
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </Card>
  );

  const renderFormularyCard = () => (
    <Card>
      <CardHeader
        title="Approved formulary"
        icon="clipboard"
        rightAction={formularyLoading || formularyError ? undefined : <Badge variant="neutral" label={`${filteredFormulary.length} items`} />}
      />
      {formularyLoading ? (
        <SkeletonList rows={4} rowHeight={theme.sizes.controlLg} />
      ) : formularyError ? (
        <ErrorState compact title="Unable to load formulary" message={formularyError} onRetry={loadFormulary} />
      ) : formulary.length === 0 ? (
        <EmptyState icon="pill" title="No formulary items" description="The GAMOT formulary has not been published for this facility." />
      ) : (
        <>
          <Input
            leftIcon="search"
            placeholder="Search generic name, drug code, or category"
            value={formularySearch}
            onChangeText={setFormularySearch}
          />

          <View style={styles.chipRow}>
            {categories.map((cat) => (
              <Button
                key={cat}
                size="sm"
                variant={formularyCategory === cat ? 'primary' : 'secondary'}
                title={cat === 'all' ? 'All' : cat}
                onPress={() => setFormularyCategory(cat)}
              />
            ))}
          </View>

          {filteredFormulary.length === 0 ? (
            <EmptyState icon="search" title="No matching drugs" description="Try a different search or category." />
          ) : (
            <View>
              {filteredFormulary.map((med) => (
                <View key={med.drugCode} style={styles.listRow}>
                  <View style={styles.flexFill}>
                    <ThemedText variant="bodyBold">
                      {med.genericName} {med.dosage}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {med.form} · {med.therapeuticCategory}
                    </ThemedText>
                  </View>
                  <View style={styles.rowEnd}>
                    <ThemedText variant="bodyBold" color={theme.colors.primary}>
                      {formatPeso(med.referenceUnitPrice)} / unit
                    </ThemedText>
                    {med.requiresSpecialistRecommendation && (
                      <Badge variant="warning" label="Specialist required" />
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </Card>
  );

  const renderMasterlist = () => (
    <Card>
      <CardHeader
        title="Catchment masterlist"
        subtitle="Beneficiaries assigned to this clinic under PhilHealth Yakap."
        icon="patients"
      />

      <View style={styles.inputRow}>
        <View style={styles.flexFill}>
          <Input label="HCI accreditation number" value={hciNumber} onChangeText={setHciOverride} />
        </View>
        <View style={styles.flexFill}>
          <Input label="Cipher key" value={cipherKey} onChangeText={setCipherKey} secureTextEntry />
        </View>
      </View>

      <Button
        title="Sync masterlist"
        icon="refresh"
        variant="primary"
        loading={isSyncingMasterlist}
        onPress={handleSyncMasterlist}
      />

      {masterlistError ? (
        <ErrorState compact title="Unable to sync masterlist" message={masterlistError} onRetry={handleSyncMasterlist} />
      ) : masterlistSynced && masterlistItems.length === 0 ? (
        <EmptyState icon="patients" title="No assigned patients" description="The registry returned no beneficiaries for this accreditation number." />
      ) : masterlistItems.length > 0 ? (
        <View>
          <ThemedText variant="bodyBold">Assigned patients ({masterlistItems.length})</ThemedText>
          {masterlistItems.map((item) => (
            <View key={item.philHealthIdentificationNumber} style={styles.listRow}>
              <View style={styles.flexFill}>
                <ThemedText variant="bodyBold">
                  {item.firstName} {item.lastName}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  PIN {item.philHealthIdentificationNumber} · DOB {item.birthDate} ({item.gender})
                </ThemedText>
              </View>
              <View style={styles.rowEnd}>
                <Badge variant="success" label={item.packageType} />
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Registered {item.registrationDate}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );

  return (
    <ResponsiveLayout headerTitle="PhilHealth Yakap">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* Summary figures: only shown when they come from real data */}
        {showStats && (
          <View style={styles.statsRow}>
            {formulary.length > 0 && (
              <StatCard
                label="Approved formulary"
                value={formulary.length}
                subtext="Drugs"
                icon="clipboard"
                style={styles.statCard}
              />
            )}
            {ledger && (
              <StatCard
                label="Annual GAMOT allocation"
                value={formatPeso(ledger.annualAllocation)}
                subtext={`Benefit year ${ledger.benefitYear}`}
                icon="pill"
                style={styles.statCard}
              />
            )}
            {ledger && (
              <StatCard
                label="Remaining balance"
                value={formatPeso(ledger.remainingBalance)}
                subtext={ledger.patientName}
                icon="cash"
                style={styles.statCard}
              />
            )}
          </View>
        )}

        {/* Tab Navigation */}
        <View style={styles.tabNavContainer}>
          {TABS.map(({ key, label }) => {
            const isActive = activeTab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setActiveTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
              >
                <ThemedText
                  variant={isActive ? 'bodyBold' : 'body'}
                  color={isActive ? theme.colors.primary : theme.colors.textMuted}
                >
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {activeTab === 'pin-checker' && renderPinChecker()}

        {activeTab === 'gamot' && (
          <View style={styles.tabBody}>
            {renderLedgerCard()}
            {renderUpscCard()}
            {renderFormularyCard()}
          </View>
        )}

        {activeTab === 'masterlist' && renderMasterlist()}
      </ScrollView>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing['4xl'],
    gap: theme.spacing.lg,
  },
  flexFill: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    minWidth: theme.sizes.sidebarWidth,
  },
  tabNavContainer: {
    flexDirection: 'row',
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  tabButton: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: theme.spacing.xs / 2,
    borderBottomColor: theme.colors.transparent,
  },
  tabButtonActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabBody: {
    gap: theme.spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-end',
  },
  spreadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  resultBox: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
  },
  resultBoxValid: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  resultBoxInvalid: {
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  ledgerBox: {
    gap: theme.spacing.lg,
  },
  ledgerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  ledgerProgress: {
    gap: theme.spacing.xs,
  },
  fieldGroup: {
    gap: theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  rowEnd: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
});
