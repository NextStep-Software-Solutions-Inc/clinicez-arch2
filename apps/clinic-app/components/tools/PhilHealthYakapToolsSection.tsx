import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
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
  SegmentedControl,
  formatPhilHealthPin,
} from '@ui';
import { theme } from '@constants/theme';
import { useBreakpoint } from '@utils/useBreakpoint';
import { useClinic } from '../../context/ClinicContext';
import {
  clinicService,
  GamotBeneficiaryLedger,
  GamotFormularyItem,
  UpscVerifyResult,
  type PortalYakapBranchSummaryDto,
  type PortalYakapMasterlistSyncResultDto,
  type PortalYakapSubmissionDto,
  type YakapSandboxStatus,
} from '../../services/clinicService';
import type { YakapSubTool } from './toolsCatalog';
import { FilterChip } from './ToolsUiHelpers';

export interface PhilHealthYakapToolsSectionProps {
  activeTool: YakapSubTool;
  onSelectTool: (tool: YakapSubTool) => void;
  canAccess: boolean;
  refreshSignal?: number;
}

const SUB_TOOL_OPTIONS: Array<{ value: YakapSubTool; label: string; icon: 'yakap' | 'pill' | 'patients' }> = [
  { value: 'pin-checker', label: 'PIN Check', icon: 'yakap' },
  { value: 'gamot', label: 'GAMOT & UPSC', icon: 'pill' },
  { value: 'masterlist', label: 'Patient List', icon: 'patients' },
];

/** Share of the annual allocation below which the remaining balance is flagged. */
const LOW_BALANCE_RATIO = 0.25;

function formatPeso(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PhilHealthYakapToolsSection({
  activeTool,
  onSelectTool,
  canAccess,
  refreshSignal = 0,
}: PhilHealthYakapToolsSectionProps) {
  const { isCompact } = useBreakpoint();
  const { accreditationNumber } = useClinic();

  // GAMOT Ledger State
  const [searchPin, setSearchPin] = useState('');
  const [ledger, setLedger] = useState<GamotBeneficiaryLedger | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [isSearchingLedger, setIsSearchingLedger] = useState(false);
  const [formulary, setFormulary] = useState<GamotFormularyItem[]>([]);
  const [formularyLoading, setFormularyLoading] = useState(false);
  const [formularyLoadedOnce, setFormularyLoadedOnce] = useState(false);
  const [formularyError, setFormularyError] = useState<string | null>(null);
  const [formularySearch, setFormularySearch] = useState('');
  const [formularyCategory, setFormularyCategory] = useState('all');

  // UPSC Verification State
  const [verifyUpscCode, setVerifyUpscCode] = useState('');
  const [verifyResult, setVerifyResult] = useState<UpscVerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifyingUpsc, setIsVerifyingUpsc] = useState(false);

  // Masterlist Sync & YAKAP 2.0 Submissions State
  const [masterlistPin, setMasterlistPin] = useState('');
  const [masterlistStartDate, setMasterlistStartDate] = useState('');
  const [masterlistEndDate, setMasterlistEndDate] = useState('');
  const [masterlistResult, setMasterlistResult] = useState<PortalYakapMasterlistSyncResultDto | null>(null);
  const [masterlistError, setMasterlistError] = useState<string | null>(null);
  const [isSyncingMasterlist, setIsSyncingMasterlist] = useState(false);

  const [submissionSummary, setSubmissionSummary] = useState<PortalYakapBranchSummaryDto | null>(null);
  const [submissions, setSubmissions] = useState<PortalYakapSubmissionDto[]>([]);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [activeSubmissionActionId, setActiveSubmissionActionId] = useState<string | null>(null);

  // Demo testing mode (visible when enabled on local/demo environments)
  const [sandboxStatus, setSandboxStatus] = useState<YakapSandboxStatus | null>(null);
  const [updatingSandbox, setUpdatingSandbox] = useState(false);

  // Real-time PIN Checker State
  const [pinToCheck, setPinToCheck] = useState('');
  const [isValidatingPin, setIsValidatingPin] = useState(false);
  const [pinValidationResult, setPinValidationResult] = useState<{
    isValid?: boolean;
    formatted?: string;
    error?: string;
  } | null>(null);

  const loadFormulary = useCallback(async () => {
    if (!canAccess) return;
    setFormularyLoading(true);
    const [data, err] = await clinicService.getGamotFormulary();
    if (err) {
      setFormularyError(err.message || 'Unable to load the GAMOT formulary.');
    } else {
      setFormulary(data ?? []);
      setFormularyError(null);
    }
    setFormularyLoadedOnce(true);
    setFormularyLoading(false);
  }, [canAccess]);

  useEffect(() => {
    if (canAccess && !formularyLoadedOnce) {
      void loadFormulary();
    }
  }, [canAccess, formularyLoadedOnce, loadFormulary]);

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
    setIsValidatingPin(true);
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
        setPinValidationResult({
          isValid: false,
          error: 'PhilHealth PIN must be exactly 12 digits.',
        });
        setIsValidatingPin(false);
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
        error: isValid
          ? undefined
          : 'This 12-digit PhilHealth number failed validation. Please double-check the digits for typos.',
      });
    }
    setIsValidatingPin(false);
  }, [pinToCheck]);

  const loadSubmissionsAndSandbox = useCallback(async () => {
    if (!canAccess) return;
    setLoadingSubmissions(true);
    try {
      const [[sumRes, sumErr], [listRes, listErr], [sbRes]] = await Promise.all([
        clinicService.getYakapSubmissionsSummary(),
        clinicService.getYakapSubmissions({ page: 1, pageSize: 25 }),
        clinicService.getYakapSandboxStatus(),
      ]);
      if (sumRes && !sumErr) setSubmissionSummary(sumRes);
      if (listErr) {
        setSubmissionsError(listErr.message || 'Unable to load PhilHealth submission records.');
      } else {
        setSubmissions(listRes ?? []);
        setSubmissionsError(null);
      }
      if (sbRes) setSandboxStatus(sbRes);
    } finally {
      setLoadingSubmissions(false);
    }
  }, [canAccess]);

  useEffect(() => {
    if (canAccess && activeTool === 'masterlist') {
      void loadSubmissionsAndSandbox();
    }
  }, [canAccess, activeTool, loadSubmissionsAndSandbox]);

  // Sync Masterlist
  const handleSyncMasterlist = async () => {
    setIsSyncingMasterlist(true);
    try {
      const [res, err] = await clinicService.syncYakapMasterlist({
        patientPin: masterlistPin.trim() || undefined,
        effectiveYear: new Date().getFullYear(),
        startDate: masterlistStartDate.trim() || undefined,
        endDate: masterlistEndDate.trim() || undefined,
      });
      if (err || !res) {
        setMasterlistError(err?.message || 'Could not sync patient list right now. Please try again.');
        return;
      }
      setMasterlistResult(res);
      setMasterlistError(null);
      notify.success(res.message || 'Patient list synced.');
      await loadSubmissionsAndSandbox();
    } finally {
      setIsSyncingMasterlist(false);
    }
  };

  const handlePollSubmission = async (id: string) => {
    setActiveSubmissionActionId(id);
    try {
      const [res, err] = await clinicService.pollYakapSubmissionStatus(id);
      if (err || !res) {
        notify.error(err?.message || 'Could not check status.');
        return;
      }
      notify.info(`Status updated: ${res.processingStatus}`);
      await loadSubmissionsAndSandbox();
    } finally {
      setActiveSubmissionActionId(null);
    }
  };

  const handleRetrySubmission = async (id: string) => {
    setActiveSubmissionActionId(id);
    try {
      const [res, err] = await clinicService.retryYakapSubmission(id);
      if (err || !res) {
        notify.error(err?.message || 'Could not retry submission.');
        return;
      }
      notify.success(`Resubmitted (${res.processingStatus}).`);
      await loadSubmissionsAndSandbox();
    } finally {
      setActiveSubmissionActionId(null);
    }
  };

  const handleSelectSandboxScenario = async (scenario: string) => {
    setUpdatingSandbox(true);
    try {
      const [res, err] = await clinicService.setYakapSandboxScenario(scenario);
      if (err || !res) {
        notify.error(err?.message || 'Could not switch demo testing mode.');
        return;
      }
      setSandboxStatus(res);
      notify.success(`Demo testing mode set to ${res.currentScenario}.`);
    } finally {
      setUpdatingSandbox(false);
    }
  };

  const handleResetSandbox = async () => {
    setUpdatingSandbox(true);
    try {
      const [res, err] = await clinicService.resetYakapSandbox();
      if (err || !res) {
        notify.error(err?.message || 'Could not reset demo data.');
        return;
      }
      setSandboxStatus(res);
      notify.success('Demo testing state reset.');
    } finally {
      setUpdatingSandbox(false);
    }
  };

  useEffect(() => {
    if (!refreshSignal || !canAccess) return;
    if (activeTool === 'gamot') {
      void loadFormulary();
      if (searchPin.trim()) {
        void handleSearchLedger();
      }
    } else if (activeTool === 'pin-checker' && pinToCheck.trim()) {
      void handleValidatePin();
    } else if (activeTool === 'masterlist') {
      void loadSubmissionsAndSandbox();
    }
  }, [
    refreshSignal,
    canAccess,
    activeTool,
    loadFormulary,
    handleSearchLedger,
    handleValidatePin,
    loadSubmissionsAndSandbox,
    searchPin,
    pinToCheck,
  ]);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(formulary.map((item) => item.therapeuticCategory))).sort()],
    [formulary],
  );

  const filteredFormulary = useMemo(
    () =>
      formulary.filter((item) => {
        const q = formularySearch.toLowerCase();
        const matchesSearch =
          item.genericName.toLowerCase().includes(q) ||
          item.drugCode.toLowerCase().includes(q) ||
          item.therapeuticCategory.toLowerCase().includes(q);
        const matchesCat =
          formularyCategory === 'all' ||
          item.therapeuticCategory.toLowerCase() === formularyCategory.toLowerCase();
        return matchesSearch && matchesCat;
      }),
    [formulary, formularySearch, formularyCategory],
  );

  if (!canAccess) {
    return (
      <Card>
        <EmptyState
          icon="lock"
          title="PhilHealth Yakap access restricted"
          description="Ask a clinic administrator to enable PhilHealth Yakap access for your account."
        />
      </Card>
    );
  }

  const showStats = ledger !== null || formulary.length > 0;
  const rowStyle = isCompact ? styles.inputCol : styles.inputRow;

  const renderPinChecker = () => (
    <Card>
      <CardHeader
        title="PhilHealth PIN Check"
        subtitle="Check if a 12-digit PhilHealth number (PIN) is valid."
        icon="yakap"
      />

      <View style={rowStyle}>
        <View style={styles.flexFill}>
          <Input
            label="PhilHealth PIN"
            placeholder="XX-XXXXXXXXX-X"
            value={pinToCheck}
            onChangeText={(val) => {
              setPinToCheck(formatPhilHealthPin(val));
              setPinValidationResult(null);
            }}
            keyboardType="numeric"
            maxLength={14}
            autoCapitalize="none"
            onSubmitEditing={handleValidatePin}
          />
        </View>
        <Button
          title="Verify PIN"
          variant="primary"
          loading={isValidatingPin}
          onPress={handleValidatePin}
        />
      </View>

      {pinValidationResult ? (
        <View
          style={[
            styles.resultBox,
            pinValidationResult.isValid ? styles.resultBoxValid : styles.resultBoxInvalid,
          ]}
        >
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
              Valid 12-digit PhilHealth number.
            </ThemedText>
          )}
        </View>
      ) : null}
    </Card>
  );

  const renderLedgerCard = () => {
    const allocation = ledger?.annualAllocation ?? 0;
    const utilizedShare = ledger && allocation > 0 ? ledger.totalAmountUtilized / allocation : 0;
    const isLow = ledger ? ledger.remainingBalance < allocation * LOW_BALANCE_RATIO : false;

    return (
      <Card>
        <CardHeader
          title="GAMOT Medicine Benefits"
          subtitle="Look up a member’s yearly outpatient medicine balance."
          icon="pill"
        />
        <View style={rowStyle}>
          <View style={styles.flexFill}>
            <Input
              placeholder="XX-XXXXXXXXX-X"
              value={searchPin}
              onChangeText={(val) => setSearchPin(formatPhilHealthPin(val))}
              keyboardType="numeric"
              maxLength={14}
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
        title="Prescription Security Code (UPSC) Check"
        subtitle="Verify a patient’s prescription security code before dispensing."
        icon="key"
      />
      <View style={rowStyle}>
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
        <ErrorState
          compact
          title="Unable to verify code"
          message={verifyError}
          onRetry={handleVerifyUpsc}
        />
      ) : verifyResult ? (
        <View
          style={[
            styles.resultBox,
            verifyResult.isValid ? styles.resultBoxValid : styles.resultBoxInvalid,
          ]}
        >
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
        rightAction={
          formularyLoading || formularyError ? undefined : (
            <Badge variant="neutral" label={`${filteredFormulary.length} items`} />
          )
        }
      />
      {formularyLoading ? (
        <SkeletonList rows={4} rowHeight={theme.sizes.controlLg} />
      ) : formularyError ? (
        <ErrorState
          compact
          title="Unable to load formulary"
          message={formularyError}
          onRetry={loadFormulary}
        />
      ) : formulary.length === 0 ? (
        <EmptyState
          icon="pill"
          title="No formulary items"
          description="The GAMOT formulary has not been published for this facility."
        />
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
              <FilterChip
                key={cat}
                label={cat === 'all' ? 'All' : cat}
                active={formularyCategory === cat}
                onPress={() => setFormularyCategory(cat)}
              />
            ))}
          </View>

          {filteredFormulary.length === 0 ? (
            <EmptyState
              icon="search"
              title="No matching drugs"
              description="Try a different search or category."
            />
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
                    {med.requiresSpecialistRecommendation ? (
                      <Badge variant="warning" label="Specialist required" />
                    ) : null}
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
    <View style={styles.tabBody}>
      <Card>
        <CardHeader
          title="Assigned Patient List"
          subtitle={`Download and refresh patients assigned to ${accreditationNumber || 'this clinic'} under PhilHealth YAKAP.`}
          icon="patients"
        />

        <View style={rowStyle}>
          <View style={styles.flexFill}>
            <Input
              label="Patient PhilHealth PIN (Optional)"
              value={masterlistPin}
              onChangeText={setMasterlistPin}
              placeholder="XX-XXXXXXXXX-X"
            />
          </View>
          <View style={styles.flexFill}>
            <Input
              label="Start Date (Optional)"
              value={masterlistStartDate}
              onChangeText={setMasterlistStartDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={styles.flexFill}>
            <Input
              label="End Date (Optional)"
              value={masterlistEndDate}
              onChangeText={setMasterlistEndDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>

        <Button
          title={isSyncingMasterlist ? 'Syncing...' : 'Sync Patient List'}
          icon="refresh"
          variant="primary"
          loading={isSyncingMasterlist}
          onPress={handleSyncMasterlist}
          testID="yakap-sync-masterlist-btn"
        />

        {masterlistError ? (
          <ErrorState
            compact
            title="Unable to sync patient list"
            message={masterlistError}
            onRetry={handleSyncMasterlist}
          />
        ) : masterlistResult ? (
          <View style={[styles.resultBox, styles.resultBoxValid]} testID="yakap-masterlist-sync-result">
            <View style={styles.resultHeader}>
              <Badge variant="success" label="Synced" />
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                {masterlistResult.totalActiveCount} Active Assigned Patients
              </ThemedText>
            </View>
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              {masterlistResult.recordsAdded} added · {masterlistResult.recordsUpdated} updated
              {masterlistResult.message ? ` · ${masterlistResult.message}` : ''}
            </ThemedText>
          </View>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Checkup Records & Clinic Submissions"
          subtitle="Track PhilHealth checkup and clinic assignment status without leaving the app."
          icon="clipboard"
          rightAction={
            <Button
              title="Refresh"
              variant="outline"
              size="xs"
              icon="refresh"
              onPress={() => void loadSubmissionsAndSandbox()}
              disabled={loadingSubmissions}
            />
          }
        />

        {submissionSummary ? (
          <View style={styles.statsRow}>
            <StatCard label="Assigned Patients" value={submissionSummary.empaneledCount} icon="patients" style={styles.statCard} />
            <StatCard label="Pending Confirmation" value={submissionSummary.pendingPollingCount} icon="clock" style={styles.statCard} />
            <StatCard label="Needs Attention" value={submissionSummary.rejectedOrFailedCount} icon="alert" style={styles.statCard} />
          </View>
        ) : null}

        {loadingSubmissions && submissions.length === 0 ? (
          <SkeletonList rows={3} />
        ) : submissionsError ? (
          <ErrorState
            compact
            title="Unable to load submissions"
            message={submissionsError}
            onRetry={() => void loadSubmissionsAndSandbox()}
          />
        ) : submissions.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title="No checkup submissions yet"
            description="Completed PhilHealth annual checkups and walk-in clinic assignments appear here."
          />
        ) : (
          <View>
            {submissions.map((sub) => {
              const busy = activeSubmissionActionId === sub.id;
              const isBad = sub.processingStatus === 'Rejected' || sub.processingStatus === 'Failed';
              const isDone = sub.processingStatus === 'Accepted' || sub.processingStatus === 'Completed';
              return (
                <View key={sub.id} style={styles.listRow}>
                  <View style={styles.flexFill}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      {sub.patientCode} · {sub.submissionType}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Ref: {sub.uploadTransactionNo || sub.localTransactionNo}
                      {sub.yesReferenceNo ? ` · Assignment No: ${sub.yesReferenceNo}` : ''}
                    </ThemedText>
                    {sub.lastErrorMessage ? (
                      <ThemedText variant="caption" color={theme.colors.emergencyText}>
                        {sub.lastErrorMessage}
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={styles.rowEnd}>
                    <Badge
                      variant={isDone ? 'success' : isBad ? 'emergency' : 'warning'}
                      label={sub.processingStatus}
                    />
                    <View style={styles.chipRow}>
                      <Button
                        title="Check Status"
                        variant="outline"
                        size="xs"
                        disabled={busy}
                        onPress={() => void handlePollSubmission(sub.id)}
                      />
                      {(isBad || sub.processingStatus === 'Queued') && (
                        <Button
                          title="Retry"
                          variant="outline"
                          size="xs"
                          disabled={busy}
                          onPress={() => void handleRetrySubmission(sub.id)}
                        />
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {sandboxStatus ? (
        <Card>
          <CardHeader
            title="PhilHealth Demo Testing Mode"
            subtitle={`Current mode: ${sandboxStatus.currentScenario}`}
            icon="settings"
            rightAction={
              <Button
                title="Reset Demo Data"
                variant="outline"
                size="xs"
                disabled={updatingSandbox}
                onPress={() => void handleResetSandbox()}
              />
            }
          />
          <View style={styles.chipRow}>
            {(
              [
                { value: 'HappyPath', label: 'Normal (Success)' },
                { value: 'ServerError', label: 'Offline Outage' },
                { value: 'UploadRejected', label: 'Checkup Rejected' },
                { value: 'ValidationError', label: 'Validation Error' },
                { value: 'BeneficiaryNotFound', label: 'Member Not Found' },
              ] as const
            ).map((sc) => (
              <FilterChip
                key={sc.value}
                label={sc.label}
                active={sandboxStatus.currentScenario === sc.value}
                onPress={() => void handleSelectSandboxScenario(sc.value)}
              />
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );

  return (
    <View style={styles.sectionContainer}>
      {showStats ? (
        <View style={styles.statsRow}>
          {formulary.length > 0 ? (
            <StatCard
              label="Approved formulary"
              value={formulary.length}
              subtext="Drugs"
              icon="clipboard"
              style={styles.statCard}
            />
          ) : null}
          {ledger ? (
            <StatCard
              label="Annual GAMOT allocation"
              value={formatPeso(ledger.annualAllocation)}
              subtext={`Benefit year ${ledger.benefitYear}`}
              icon="pill"
              style={styles.statCard}
            />
          ) : null}
          {ledger ? (
            <StatCard
              label="Remaining balance"
              value={formatPeso(ledger.remainingBalance)}
              subtext={ledger.patientName}
              icon="cash"
              style={styles.statCard}
            />
          ) : null}
        </View>
      ) : null}

      <SegmentedControl
        options={SUB_TOOL_OPTIONS}
        value={activeTool}
        onChange={onSelectTool}
      />

      {activeTool === 'pin-checker' ? renderPinChecker() : null}

      {activeTool === 'gamot' ? (
        <View style={styles.tabBody}>
          {renderLedgerCard()}
          {renderUpscCard()}
          {renderFormularyCard()}
        </View>
      ) : null}

      {activeTool === 'masterlist' ? renderMasterlist() : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
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
  tabBody: {
    gap: theme.spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-end',
  },
  inputCol: {
    flexDirection: 'column',
    gap: theme.spacing.sm,
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
