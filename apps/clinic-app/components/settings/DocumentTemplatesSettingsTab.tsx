import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
} from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Card, CardHeader } from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { Skeleton, SkeletonList } from '../ui/Skeleton';
import SegmentedControl, { SegmentedOption } from '../ui/SegmentedControl';
import { theme } from '../../constants/theme';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { clinicService, type ClinicSettingsRecord } from '../../services/clinicService';
import {
  BRAND_COLOR_PRESETS,
  DEFAULT_CLINIC_BRAND_COLOR,
  HEX_COLOR,
  isUsableAccent,
} from '../../constants/color';
import { pickClinicLogo } from '../../utils/logoUploader';
import { openPrintableUrl } from '../../utils/printHelper';
import { Alert, notify } from '../../utils/feedback';

export type StudioCategory = 'Clinical' | 'Placard' | 'Reports';

export type StudioDocumentType =
  | 'Medical Certificate'
  | 'Electronic Prescription'
  | 'Lab Requisition Slip'
  | 'Clinical Referral Letter'
  | 'Reception QR Placard'
  | 'Daily End-of-Day Report'
  | 'DOH Outpatient Morbidity Report'
  | 'BIR Tax & Discount Audit Report'
  | 'Doctor Shares Settlement'
  | 'Executive Analytics Summary';

export type StudioSignatureMode = 'ESignatureSpecimen' | 'DigitalSealOnly' | 'WetSignature';

export type PaperSize = 'Letter' | 'A4' | 'A5';

export interface DocumentTemplatesSettingsTabProps {
  settings?: ClinicSettingsRecord | null;
  showSkeletons?: boolean;
  settingsLoadError?: string | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  onRefreshSettings?: () => Promise<void>;
}

const CATEGORY_OPTIONS: SegmentedOption<StudioCategory>[] = [
  { value: 'Clinical', label: 'Clinical (4)' },
  { value: 'Placard', label: 'Placard (1)' },
  { value: 'Reports', label: 'Reports (5)' },
];

const CLINICAL_DOC_OPTIONS: SegmentedOption<StudioDocumentType>[] = [
  { value: 'Medical Certificate', label: 'Medical Certificate' },
  { value: 'Electronic Prescription', label: 'Electronic Prescription' },
  { value: 'Lab Requisition Slip', label: 'Lab Requisition Slip' },
  { value: 'Clinical Referral Letter', label: 'Clinical Referral Letter' },
];

const PLACARD_DOC_OPTIONS: SegmentedOption<StudioDocumentType>[] = [
  { value: 'Reception QR Placard', label: 'Reception QR Placard' },
];

const REPORTS_DOC_OPTIONS: SegmentedOption<StudioDocumentType>[] = [
  { value: 'Daily End-of-Day Report', label: 'Daily EOD' },
  { value: 'DOH Outpatient Morbidity Report', label: 'DOH Morbidity' },
  { value: 'BIR Tax & Discount Audit Report', label: 'BIR Tax Audit' },
  { value: 'Doctor Shares Settlement', label: 'Doctor Shares' },
  { value: 'Executive Analytics Summary', label: 'Analytics' },
];

// Preserved for backwards compatibility
export const DOC_TYPE_OPTIONS: SegmentedOption<StudioDocumentType>[] = CLINICAL_DOC_OPTIONS;

export const ALL_DOC_TYPE_OPTIONS: SegmentedOption<StudioDocumentType>[] = [
  ...CLINICAL_DOC_OPTIONS,
  ...PLACARD_DOC_OPTIONS,
  ...REPORTS_DOC_OPTIONS,
];

const SIGNATURE_MODE_OPTIONS: SegmentedOption<StudioSignatureMode>[] = [
  { value: 'ESignatureSpecimen', label: 'E-Signature Specimen' },
  { value: 'DigitalSealOnly', label: 'Digital Seal' },
  { value: 'WetSignature', label: 'Wet Signature' },
];

const PAPER_SIZE_OPTIONS: SegmentedOption<PaperSize>[] = [
  { value: 'Letter', label: 'Letter' },
  { value: 'A4', label: 'A4' },
  { value: 'A5', label: 'A5' },
];

export default function DocumentTemplatesSettingsTab({
  settings: initialSettings,
  showSkeletons = false,
  settingsLoadError = null,
  onSettingsUpdated,
  onRefreshSettings,
}: DocumentTemplatesSettingsTabProps) {
  const { isDesktop } = useBreakpoint();

  // Internal state for self-loading if props are omitted (e.g. standalone rendering in tests)
  const [internalSettings, setInternalSettings] = useState<ClinicSettingsRecord | null>(initialSettings ?? null);
  const [loading, setLoading] = useState<boolean>(!initialSettings && showSkeletons);
  const [loadError, setLoadError] = useState<string | null>(settingsLoadError);

  // Form Fields
  const [letterheadHeader, setLetterheadHeader] = useState('');
  const [letterheadSubHeader, setLetterheadSubHeader] = useState('');
  const [letterheadAddress, setLetterheadAddress] = useState('');
  const [letterheadContact, setLetterheadContact] = useState('');
  const [dohLicenseToOperate, setDohLicenseToOperate] = useState('');
  const [accreditationNumber, setAccreditationNumber] = useState('');
  const [primaryLogoUrl, setPrimaryLogoUrl] = useState<string | null>(null);
  const [primaryColorHex, setPrimaryColorHex] = useState<string>(DEFAULT_CLINIC_BRAND_COLOR);
  const [customHexInput, setCustomHexInput] = useState<string>(DEFAULT_CLINIC_BRAND_COLOR);
  const [paperSize, setPaperSize] = useState<PaperSize>('Letter');
  const [letterheadFooter, setLetterheadFooter] = useState('');

  // Right column live studio state
  const [docCategory, setDocCategory] = useState<StudioCategory>('Clinical');
  const [selectedDocType, setSelectedDocType] = useState<StudioDocumentType>('Medical Certificate');
  const [signatureMode, setSignatureMode] = useState<StudioSignatureMode>('ESignatureSpecimen');
  const [saving, setSaving] = useState(false);
  const [printingSample, setPrintingSample] = useState(false);
  const [accentColorError, setAccentColorError] = useState<string | null>(null);

  const getPaperDimensionStyle = (size: PaperSize) => {
    switch (size) {
      case 'A5':
        return {
          maxWidth: 480,
          minHeight: 620,
        };
      case 'A4':
        return {
          maxWidth: 620,
          minHeight: 840,
        };
      case 'Letter':
      default:
        return {
          maxWidth: 640,
          minHeight: 780,
        };
    }
  };

  const getPaperSizeLabel = (size: PaperSize) => {
    switch (size) {
      case 'Letter':
        return 'Letter (8.5 × 11 in)';
      case 'A4':
        return 'A4 (210 × 297 mm)';
      case 'A5':
        return 'A5 (148 × 210 mm • Notepad)';
    }
  };

  const populateForm = useCallback((record: ClinicSettingsRecord) => {
    setLetterheadHeader(record.letterheadHeader || record.clinicName || '');
    setLetterheadSubHeader(record.letterheadSubHeader || '');
    setLetterheadAddress(record.letterheadAddress || '');
    setLetterheadContact(record.letterheadContact || '');
    setDohLicenseToOperate(record.dohLicenseToOperate || record.letterheadDohLto || '');
    setAccreditationNumber(record.accreditationNumber || '');
    setPrimaryLogoUrl(record.primaryLogoUrl ?? null);
    const brandColor = record.primaryColorHex || DEFAULT_CLINIC_BRAND_COLOR;
    setPrimaryColorHex(brandColor);
    setCustomHexInput(brandColor);
    setPaperSize((record.paperSize as PaperSize) || 'Letter');
    setLetterheadFooter(
      record.letterheadFooter ||
        'Valid Philippine Clinical Document. Digitally certified via Clinic EZ in compliance with RA 8792 & RA 10173.'
    );
  }, []);

  // Sync when initialSettings or settingsLoadError changes
  useEffect(() => {
    if (initialSettings) {
      setInternalSettings(initialSettings);
      populateForm(initialSettings);
      setLoading(false);
      setLoadError(null);
    }
  }, [initialSettings, populateForm]);

  useEffect(() => {
    if (settingsLoadError) {
      setLoadError(settingsLoadError);
    }
  }, [settingsLoadError]);

  // Self fetch if rendered without pre-fetched settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [res, err] = await clinicService.getSettings();
      if (err) {
        setLoadError(err.message || 'Unable to load clinic stationery settings.');
      } else if (res) {
        setInternalSettings(res);
        populateForm(res);
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Network error fetching stationery settings.');
    } finally {
      setLoading(false);
    }
  }, [populateForm]);

  useEffect(() => {
    if (initialSettings === undefined && !settingsLoadError) {
      fetchSettings();
    }
  }, [initialSettings, settingsLoadError, fetchSettings]);

  // Color picker handlers
  const handleSelectPreset = (color: string) => {
    setPrimaryColorHex(color);
    setCustomHexInput(color);
    setAccentColorError(null);
  };

  const handleCustomHexChange = (text: string) => {
    let clean = text.trim();
    if (!clean.startsWith('#') && clean.length > 0) {
      clean = '#' + clean;
    }
    clean = clean.toUpperCase();
    setCustomHexInput(clean);

    if (clean.length === 7) {
      if (!HEX_COLOR.test(clean)) {
        setAccentColorError('Invalid hex color. Use #RRGGBB.');
      } else if (!isUsableAccent(clean)) {
        setAccentColorError('Insufficient contrast. Please choose a darker or more vibrant shade.');
      } else {
        setAccentColorError(null);
        setPrimaryColorHex(clean);
      }
    } else if (clean.length > 7) {
      setAccentColorError('Hex color must be exactly 7 characters including #.');
    } else {
      setAccentColorError(null);
    }
  };

  // Logo upload and remove
  const handlePickLogo = async () => {
    const result = await pickClinicLogo();
    if (!result) return;
    if (result.error) {
      Alert.alert('Logo Selection Notice', result.error);
      return;
    }
    if (result.dataUri) {
      setPrimaryLogoUrl(result.dataUri);
      notify.success('Clinic emblem / logo updated.');
    }
  };

  const handleRemoveLogo = () => {
    setPrimaryLogoUrl(null);
    notify.info('Clinic logo removed from stationery.');
  };

  // Save Settings
  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const payload: Partial<ClinicSettingsRecord> = {
        letterheadHeader: letterheadHeader.trim(),
        letterheadSubHeader: letterheadSubHeader.trim(),
        letterheadAddress: letterheadAddress.trim(),
        letterheadContact: letterheadContact.trim(),
        dohLicenseToOperate: dohLicenseToOperate.trim(),
        letterheadDohLto: dohLicenseToOperate.trim(),
        accreditationNumber: accreditationNumber.trim(),
        primaryLogoUrl,
        primaryColorHex,
        paperSize,
        letterheadFooter: letterheadFooter.trim(),
      };

      const [updated, err] = await clinicService.updateSettings(payload);
      if (err) {
        Alert.alert('Save Failed', err.message || 'Unable to update stationery settings.');
      } else if (updated) {
        setInternalSettings(updated);
        populateForm(updated);
        onSettingsUpdated?.(updated);
        notify.success('Stationery and document settings successfully saved.');
      }
    } catch (e: any) {
      Alert.alert('Save Error', e?.message || 'An unexpected error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  // Print Sample Test PDF
  const handlePrintSamplePdf = async () => {
    setPrintingSample(true);
    try {
      const isWet = signatureMode === 'WetSignature';
      const samplePdfUrl = clinicService.getSampleDocumentPdfUrl(selectedDocType, {
        wet: isWet,
        paperSize,
      });

      const opened = await openPrintableUrl(samplePdfUrl);
      if (!opened) {
        Alert.alert(
          'Notice',
          'Unable to automatically open the sample PDF. Please check your browser popup blocker.'
        );
      }
    } catch {
      Alert.alert(
        'Print Error',
        'Could not generate sample document PDF. Please check connection and try again.'
      );
    } finally {
      setPrintingSample(false);
    }
  };

  // State 1: Skeleton
  if (loading || (showSkeletons && !internalSettings)) {
    return (
      <View testID="document-studio-skeleton" style={styles.stateWrapper}>
        <Card variant="outlined" style={styles.stateCard}>
          <Skeleton width="45%" height={theme.fontSizes.xl} />
          <Skeleton width="70%" height={theme.fontSizes.sm} />
          <SkeletonList rows={7} rowHeight={theme.sizes.controlMd} />
        </Card>
      </View>
    );
  }

  // State 2: Error
  if (loadError && !internalSettings) {
    return (
      <View testID="document-studio-error" style={styles.stateWrapper}>
        <ErrorState
          title="Unable to load Document Studio"
          message={loadError}
          onRetry={onRefreshSettings || fetchSettings}
          retryLabel="Retry Loading Settings"
        />
      </View>
    );
  }

  // State 3: Empty
  if (!internalSettings) {
    return (
      <View testID="document-studio-empty" style={styles.stateWrapper}>
        <EmptyState
          icon="file"
          title="No Document Settings Configured"
          description="Facility letterhead and stationery settings have not been established for this clinic."
          actionTitle="Initialize Default Stationery"
          onAction={() => {
            const defaults: ClinicSettingsRecord = {
              id: 'new',
              tenantId: 'default',
              clinicId: 'default',
              clinicName: 'Primary Care Clinic',
              operatingHours: 'Mon-Fri 8:00 AM - 5:00 PM',
              defaultSlotDurationMinutes: 30,
              queuePrefix: 'Q',
              invoicePrefix: 'INV',
              defaultConsultationFee: 400,
              vatRate: 0.12,
              letterheadHeader: 'PRIMARY CARE MEDICAL CLINIC',
              letterheadSubHeader: 'Ambulatory Outpatient Services',
              letterheadAddress: 'Medical Arts Building, Manila',
              letterheadContact: 'Tel: (02) 8000-0000',
              paperSize: 'Letter',
              letterheadFooter:
                'Valid Philippine Clinical Document. Digitally certified via Clinic EZ in compliance with RA 8792 & RA 10173.',
            };
            setInternalSettings(defaults);
            populateForm(defaults);
          }}
        />
      </View>
    );
  }

  // State 4: Active Full Workstation Studio
  return (
    <View testID="document-studio-active" style={styles.container}>
      <View style={[styles.workstationLayout, isDesktop ? styles.rowLayout : styles.columnLayout]}>
        {/* Left Column: Form Controls */}
        <View style={[styles.leftColumn, isDesktop && styles.desktopColumn]}>
          <Card variant="outlined" style={styles.sectionCard}>
            <CardHeader
              icon="file"
              title="Facility Letterhead & Identity"
              subtitle="Configure your institutional header, addresses, and regulatory identifiers"
            />
            <View style={styles.formFields}>
              <Input
                label="Facility Header"
                value={letterheadHeader}
                onChangeText={setLetterheadHeader}
                placeholder="e.g. ST. JUDE FAMILY MEDICAL CLINIC"
                testID="input-facility-header"
              />
              <Input
                label="Sub-Header / Tagline"
                value={letterheadSubHeader}
                onChangeText={setLetterheadSubHeader}
                placeholder="e.g. Accredited Ambulatory Healthcare Facility"
                testID="input-facility-subheader"
              />
              <Input
                label="Physical Address"
                value={letterheadAddress}
                onChangeText={setLetterheadAddress}
                placeholder="e.g. 124 Rizal Avenue, San Pedro, Laguna"
                testID="input-facility-address"
              />
              <Input
                label="Multi-channel Contact"
                value={letterheadContact}
                onChangeText={setLetterheadContact}
                placeholder="e.g. Tel: (02) 8876-5432 • Mobile: +63 917 123 4567"
                testID="input-facility-contact"
              />
              <Input
                label="DOH LTO Number"
                value={dohLicenseToOperate}
                onChangeText={setDohLicenseToOperate}
                placeholder="e.g. DOH-LTO-04A-2026-0089"
                helperText="Department of Health regulatory registration code printed on all clinical issuances."
                testID="input-doh-lto"
              />
              <Input
                label="PhilHealth Accreditation"
                value={accreditationNumber}
                onChangeText={setAccreditationNumber}
                placeholder="e.g. PHIC-ACC-2026-9912"
                helperText="PhilHealth accreditation number for Konsulta / Yakap compliance."
                testID="input-phic-acc"
              />
            </View>
          </Card>

          {/* Logo Card */}
          <Card variant="outlined" style={styles.sectionCard}>
            <CardHeader
              icon="upload"
              title="Clinic Visual Emblem / Logo"
              subtitle="Official institutional crest displayed on letterhead header"
            />
            <View style={styles.logoSection}>
              {primaryLogoUrl ? (
                <View style={styles.logoPreviewContainer}>
                  <Image source={{ uri: primaryLogoUrl }} style={styles.logoThumbnail} resizeMode="contain" />
                  <Button
                    title="Remove Logo"
                    icon="trash"
                    variant="outline"
                    size="sm"
                    onPress={handleRemoveLogo}
                    testID="btn-remove-logo"
                  />
                </View>
              ) : (
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.logoEmptyNotice}>
                  No custom clinic logo uploaded. Standard institutional icon is used.
                </ThemedText>
              )}
              <Button
                title={primaryLogoUrl ? 'Replace Logo' : 'Upload Clinic Logo'}
                icon="upload"
                variant="secondary"
                size="sm"
                onPress={handlePickLogo}
                testID="btn-upload-logo"
              />
            </View>
          </Card>

          {/* Document Accent Color Card */}
          <Card variant="outlined" style={styles.sectionCard}>
            <CardHeader
              icon="palette"
              title="Document Accent Color"
              subtitle="Visual brand tone applied to header divider bar, highlights, and borders"
            />
            <View style={styles.colorPaletteWrapper}>
              <View style={styles.presetsRow}>
                {BRAND_COLOR_PRESETS.map((preset) => {
                  const isSelected = primaryColorHex.toUpperCase() === preset.color.toUpperCase();
                  return (
                    <Pressable
                      key={preset.color}
                      onPress={() => handleSelectPreset(preset.color)}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: preset.color },
                        isSelected && styles.colorSwatchActive,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={preset.label}
                    >
                      {isSelected ? (
                        <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.textInverted} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              <Input
                label="Custom Hex Override"
                value={customHexInput}
                onChangeText={handleCustomHexChange}
                placeholder="0D6963"
                leftIcon="palette"
                error={accentColorError || undefined}
                helperText="Must be a valid 7-character #RRGGBB code with accessible contrast ratio."
                testID="input-accent-hex"
              />
            </View>
          </Card>

          {/* Paper Size Card */}
          <Card variant="outlined" style={styles.sectionCard}>
            <CardHeader
              icon="clipboard"
              title="Stationery Paper Dimensions"
              subtitle="Default page size for clinical printouts and QuestPDF generation"
            />
            <View style={styles.paperSizeWrapper}>
              <SegmentedControl options={PAPER_SIZE_OPTIONS} value={paperSize} onChange={setPaperSize} />
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Standard Philippine ambulatory clinics typically print on Letter (8.5 × 11 in) or ISO A4 paper.
              </ThemedText>
            </View>
          </Card>

          {/* Statutory Legal Disclaimer Card */}
          <Card variant="outlined" style={styles.sectionCard}>
            <CardHeader
              icon="shield"
              title="Statutory Legal Disclaimer"
              subtitle="Regulatory legal notice printed in the document footer"
            />
            <View style={styles.formFields}>
              <Input
                label="Statutory Footer Text"
                value={letterheadFooter}
                onChangeText={setLetterheadFooter}
                multiline
                numberOfLines={3}
                placeholder="Valid Philippine Clinical Document. Digitally certified via Clinic EZ..."
                helperText="Enforces Philippine RA 8792 (E-Commerce Act) and RA 10173 (Data Privacy Act) compliance."
                testID="input-statutory-footer"
              />
            </View>
          </Card>

          {/* Save Action Bar */}
          <View style={styles.saveActionBar}>
            <Button
              title={saving ? 'Saving Changes...' : 'Save Changes'}
              icon="save"
              variant="primary"
              loading={saving}
              onPress={handleSaveSettings}
              testID="btn-save-settings"
            />
          </View>
        </View>

        {/* Right Column: Interactive Live Canvas Previewer */}
        <View style={[styles.rightColumn, isDesktop && styles.desktopColumn]}>
          <Card variant="elevated" style={styles.canvasContainerCard}>
            {/* Control Bar */}
            <View style={styles.canvasControlBar}>
              <View style={styles.controlBarRow}>
                <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                  Document Category:
                </ThemedText>
                <SegmentedControl
                  options={CATEGORY_OPTIONS}
                  value={docCategory}
                  onChange={cat => {
                    const nextCat = cat as StudioCategory;
                    setDocCategory(nextCat);
                    if (nextCat === 'Clinical') setSelectedDocType('Medical Certificate');
                    else if (nextCat === 'Placard') setSelectedDocType('Reception QR Placard');
                    else setSelectedDocType('Daily End-of-Day Report');
                  }}
                />
              </View>

              <View style={styles.controlBarRow}>
                <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                  Document Type:
                </ThemedText>
                <SegmentedControl
                  options={
                    docCategory === 'Clinical'
                      ? CLINICAL_DOC_OPTIONS
                      : docCategory === 'Placard'
                      ? PLACARD_DOC_OPTIONS
                      : REPORTS_DOC_OPTIONS
                  }
                  value={selectedDocType}
                  onChange={setSelectedDocType}
                />
              </View>

              {docCategory === 'Clinical' && (
                <View style={styles.controlBarRow}>
                  <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                    Signature Mode:
                  </ThemedText>
                  <SegmentedControl
                    options={SIGNATURE_MODE_OPTIONS}
                    value={signatureMode}
                    onChange={setSignatureMode}
                  />
                </View>
              )}

              <View style={styles.controlBarActions}>
                <View style={styles.badgeRow}>
                  <Badge label={getPaperSizeLabel(paperSize)} variant="routine" />
                  {docCategory === 'Clinical' ? (
                    <Badge
                      label={signatureMode === 'WetSignature' ? 'Wet Signature' : 'Digitally Certified'}
                      variant={signatureMode === 'WetSignature' ? 'warning' : 'routine'}
                    />
                  ) : (
                    <Badge label="Administrative Statutory" variant="routine" />
                  )}
                </View>
                <Button
                  title="Print Sample Test PDF"
                  icon="print"
                  variant="outline"
                  size="sm"
                  loading={printingSample}
                  onPress={handlePrintSamplePdf}
                  testID="btn-print-sample-pdf"
                />
              </View>
            </View>

            {/* Document Canvas */}
            <ScrollView
              style={styles.canvasScroll}
              contentContainerStyle={[styles.canvasPaper, getPaperDimensionStyle(paperSize)]}
            >
              {/* Canvas Header */}
              <View style={styles.canvasHeader}>
                <View style={styles.canvasHeaderTop}>
                  {primaryLogoUrl ? (
                    <Image source={{ uri: primaryLogoUrl }} style={styles.canvasLogo} resizeMode="contain" />
                  ) : (
                    <View style={[styles.canvasLogoPlaceholder, { borderColor: primaryColorHex }]}>
                      <Icon name="clinic" size={theme.sizes.iconLg} color={primaryColorHex} />
                    </View>
                  )}
                  <View style={styles.canvasHeaderTitleBlock}>
                    <ThemedText variant="h2" style={[styles.canvasFacilityTitle, { color: primaryColorHex }]}>
                      {letterheadHeader.trim() || 'ST. JUDE FAMILY MEDICAL CLINIC'}
                    </ThemedText>
                    {letterheadSubHeader.trim() ? (
                      <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                        {letterheadSubHeader.trim()}
                      </ThemedText>
                    ) : null}
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {letterheadAddress.trim() || '124 Rizal Avenue, San Pedro, Laguna'}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {letterheadContact.trim() || 'Tel: (02) 8876-5432 • Mobile: +63 917 123 4567'}
                    </ThemedText>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      {`DOH LTO: ${dohLicenseToOperate.trim() || 'DOH-LTO-04A-2026-0089'} • PhilHealth: ${accreditationNumber.trim() || 'PHIC-ACC-2026-9912'}`}
                    </ThemedText>
                  </View>
                </View>
                <View style={[styles.canvasDividerBar, { backgroundColor: primaryColorHex }]} />
              </View>

              {/* Canvas Body by Document Type */}
              <View style={styles.canvasBody}>
                {selectedDocType === 'Medical Certificate' && (
                  <View style={styles.docTypeContent}>
                    <ThemedText variant="h3" style={styles.docTypeTitle}>
                      MEDICAL CERTIFICATE
                    </ThemedText>
                    <View style={styles.docMetadataRow}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Date: October 20, 2026
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Doc No: MC-2026-0042
                      </ThemedText>
                    </View>
                    <ThemedText variant="bodyBold" style={styles.docSalutation}>
                      TO WHOM IT MAY CONCERN:
                    </ThemedText>
                    <ThemedText variant="body" style={styles.docParagraph}>
                      This is to certify that <ThemedText variant="bodyBold">Juan Dela Cruz</ThemedText>, 34 yrs, 5 mos, 2 wks, 3 days of
                      age, Male, Filipino, residing at City of San Pedro, Laguna, was examined and treated at this
                      facility on October 20, 2026.
                    </ThemedText>
                    <View style={styles.calloutBox}>
                      <ThemedText variant="smallBold" color={theme.colors.text}>
                        Clinical Diagnosis:
                      </ThemedText>
                      <ThemedText variant="body" color={theme.colors.textSecondary}>
                        Acute Upper Respiratory Tract Infection (ICD-10 J06.9)
                      </ThemedText>
                    </View>
                    <ThemedText variant="body" style={styles.docParagraph}>
                      Remarks / Recommendation: Patient was advised home rest and conservative management for three
                      (3) consecutive days from October 20 to October 22, 2026. Fit to resume employment activities
                      thereafter.
                    </ThemedText>
                  </View>
                )}

                {selectedDocType === 'Electronic Prescription' && (
                  <View style={styles.docTypeContent}>
                    <ThemedText variant="h3" style={styles.docTypeTitle}>
                      ELECTRONIC PRESCRIPTION (e-Rx)
                    </ThemedText>
                    <View style={styles.docMetadataRow}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Patient: Maria Santos (28 yrs, 6 mos, 1 wk, 2 days • Female)
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Rx No: RX-2026-00891
                      </ThemedText>
                    </View>
                    <View style={styles.rxSymbolBox}>
                      <ThemedText variant="display" color={primaryColorHex}>
                        Rx
                      </ThemedText>
                    </View>
                    <View style={styles.rxItemsList}>
                      <View style={styles.rxItemRow}>
                        <ThemedText variant="bodyBold">1. Amoxicillin + Clavulanic Acid 625mg tablet</ThemedText>
                        <ThemedText variant="small" color={theme.colors.textSecondary}>
                          Sig: Take 1 tablet twice daily with meals for 7 days.
                        </ThemedText>
                        <ThemedText variant="captionBold" color={theme.colors.textMuted}>
                          Quantity: #14 (Fourteen tablets)
                        </ThemedText>
                      </View>
                      <View style={styles.rxItemRow}>
                        <ThemedText variant="bodyBold">2. Paracetamol 500mg tablet</ThemedText>
                        <ThemedText variant="small" color={theme.colors.textSecondary}>
                          Sig: Take 1 tablet every 4 hours PRN for fever &gt;= 38.0°C or severe pain.
                        </ThemedText>
                        <ThemedText variant="captionBold" color={theme.colors.textMuted}>
                          Quantity: #20 (Twenty tablets)
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.refillsText}>
                      Refills Authorized: 0 (Zero) • Non-transferable prescription
                    </ThemedText>
                  </View>
                )}

                {selectedDocType === 'Lab Requisition Slip' && (
                  <View style={styles.docTypeContent}>
                    <ThemedText variant="h3" style={styles.docTypeTitle}>
                      DIAGNOSTIC &amp; LABORATORY REQUISITION SLIP
                    </ThemedText>
                    <View style={styles.docMetadataRow}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Patient: Pedro Penduko (45 yrs, 2 mos, 3 days • Male)
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Req No: LAB-2026-00318
                      </ThemedText>
                    </View>
                    <ThemedText variant="body" style={styles.docParagraph}>
                      Clinical Indication: Annual Executive Health Wellness &amp; Primary Hypertension Evaluation.
                    </ThemedText>
                    <View style={styles.labChecklist}>
                      <View style={styles.checkItem}>
                        <Icon name="checkCircle" size={theme.sizes.iconSm} color={primaryColorHex} />
                        <ThemedText variant="body">Complete Blood Count (CBC) with Platelet Count</ThemedText>
                      </View>
                      <View style={styles.checkItem}>
                        <Icon name="checkCircle" size={theme.sizes.iconSm} color={primaryColorHex} />
                        <ThemedText variant="body">Fasting Blood Sugar (FBS) - 10 to 12 hours fast</ThemedText>
                      </View>
                      <View style={styles.checkItem}>
                        <Icon name="checkCircle" size={theme.sizes.iconSm} color={primaryColorHex} />
                        <ThemedText variant="body">Lipid Profile (Total Cholesterol, HDL, LDL, Triglycerides)</ThemedText>
                      </View>
                      <View style={styles.checkItem}>
                        <Icon name="checkCircle" size={theme.sizes.iconSm} color={primaryColorHex} />
                        <ThemedText variant="body">12-Lead Electrocardiogram (ECG)</ThemedText>
                      </View>
                    </View>
                  </View>
                )}

                {selectedDocType === 'Clinical Referral Letter' && (
                  <View style={styles.docTypeContent}>
                    <ThemedText variant="h3" style={styles.docTypeTitle}>
                      CLINICAL REFERRAL LETTER
                    </ThemedText>
                    <View style={styles.docMetadataRow}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Date: October 20, 2026
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Ref No: REF-2026-00105
                      </ThemedText>
                    </View>
                    <View style={styles.referralRecipientBox}>
                      <ThemedText variant="smallBold">To: Attending Cardiologist / Specialist</ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        Philippine Heart Center, East Avenue, Diliman, Quezon City
                      </ThemedText>
                    </View>
                    <ThemedText variant="body" style={styles.docParagraph}>
                      Dear Colleague,
                    </ThemedText>
                    <ThemedText variant="body" style={styles.docParagraph}>
                      Respectfully referring Juan Dela Cruz, 58 yrs, 8 mos, 2 wks, 1 day of age, Male, with persistent
                      Grade 2 Essential Hypertension and exertional dyspnea, for 2D-Echocardiogram and comprehensive
                      cardiac risk stratification.
                    </ThemedText>
                  </View>
                )}

                {selectedDocType === 'Reception QR Placard' && (
                  <View style={styles.docTypeContent}>
                    <ThemedText variant="h2" style={[styles.docTypeTitle, { color: primaryColorHex }]}>
                      CLINIC RECEPTION &amp; PATIENT CHECK-IN
                    </ThemedText>
                    <ThemedText variant="body" color={theme.colors.textSecondary} style={{ textAlign: 'center' }}>
                      Scan this QR code with your smartphone camera to check-in or join the waiting queue
                    </ThemedText>
                    <View style={styles.placardQrBox}>
                      <View style={[styles.placardQrPlaceholder, { borderColor: primaryColorHex }]}>
                        <Icon name="scan" size={theme.sizes.iconLg} color={primaryColorHex} />
                        <ThemedText variant="captionBold" color={primaryColorHex}>
                          SCAN TO QUEUE
                        </ThemedText>
                      </View>
                      <View style={styles.placardCodeBadge}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          Or enter manual clinic join code:
                        </ThemedText>
                        <ThemedText variant="h2" color={theme.colors.primary}>
                          CEZ-2026
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.placardInstructions}>
                      <ThemedText variant="smallBold" color={theme.colors.text}>
                        Patient Mobile Instructions:
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        1. Point your mobile device camera at the QR code above.
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        2. Tap the link to open the ClinicEZ Patient Portal.
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        3. Review triage queue position and receive instant SMS/vibration alerts when called.
                      </ThemedText>
                    </View>
                  </View>
                )}

                {selectedDocType === 'Daily End-of-Day Report' && (
                  <View style={styles.docTypeContent}>
                    <ThemedText variant="h3" style={styles.docTypeTitle}>
                      DAILY END-OF-DAY RECONCILIATION SUMMARY
                    </ThemedText>
                    <View style={styles.docMetadataRow}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Report Date: October 20, 2026
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Audit Status: Reconciled &amp; Balanced
                      </ThemedText>
                    </View>
                    <View style={styles.reportSummaryGrid}>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>TOTAL CHECKED IN</ThemedText>
                        <ThemedText variant="bodyBold">28 Patients</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>GROSS REVENUE</ThemedText>
                        <ThemedText variant="bodyBold">₱24,500.00</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>DISCOUNTS GIVEN</ThemedText>
                        <ThemedText variant="bodyBold">₱2,940.00</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>NET COLLECTIONS</ThemedText>
                        <ThemedText variant="bodyBold" color={theme.colors.primary}>₱21,560.00</ThemedText>
                      </View>
                    </View>
                    <View style={styles.tableBlock}>
                      <ThemedText variant="smallBold">Collections by Payment Tender</ThemedText>
                      <View style={styles.tableRow}><ThemedText variant="body">Cash in Drawer</ThemedText><ThemedText variant="bodyBold">₱14,200.00 (18 trans)</ThemedText></View>
                      <View style={styles.tableRow}><ThemedText variant="body">GCash / QRPh</ThemedText><ThemedText variant="bodyBold">₱5,360.00 (7 trans)</ThemedText></View>
                      <View style={styles.tableRow}><ThemedText variant="body">Credit / Debit Card</ThemedText><ThemedText variant="bodyBold">₱2,000.00 (1 trans)</ThemedText></View>
                    </View>
                  </View>
                )}

                {selectedDocType === 'DOH Outpatient Morbidity Report' && (
                  <View style={styles.docTypeContent}>
                    <ThemedText variant="h3" style={styles.docTypeTitle}>
                      DOH OUTPATIENT MORBIDITY REPORT (FHSIS)
                    </ThemedText>
                    <View style={styles.docMetadataRow}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Period: September 20 – October 20, 2026
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Encounters Audited: 184
                      </ThemedText>
                    </View>
                    <View style={styles.tableBlock}>
                      <ThemedText variant="smallBold">Leading Causes of Morbidity (ICD-10)</ThemedText>
                      <View style={styles.tableRow}><ThemedText variant="bodyBold">1. J06.9 Acute Upper Respiratory Infection</ThemedText><ThemedText variant="body">64 cases (33.3%)</ThemedText></View>
                      <View style={styles.tableRow}><ThemedText variant="bodyBold">2. I10 Essential (Primary) Hypertension</ThemedText><ThemedText variant="body">48 cases (25.0%)</ThemedText></View>
                      <View style={styles.tableRow}><ThemedText variant="bodyBold">3. E11.9 Type 2 Diabetes Mellitus</ThemedText><ThemedText variant="body">32 cases (16.7%)</ThemedText></View>
                      <View style={styles.tableRow}><ThemedText variant="bodyBold">4. K21.9 Gastro-Esophageal Reflux Disease</ThemedText><ThemedText variant="body">24 cases (12.5%)</ThemedText></View>
                      <View style={styles.tableRow}><ThemedText variant="bodyBold">5. M54.5 Low Back Pain</ThemedText><ThemedText variant="body">16 cases (8.3%)</ThemedText></View>
                    </View>
                  </View>
                )}

                {selectedDocType === 'BIR Tax & Discount Audit Report' && (
                  <View style={styles.docTypeContent}>
                    <ThemedText variant="h3" style={styles.docTypeTitle}>
                      BIR STATUTORY TAX &amp; DISCOUNT AUDIT REPORT
                    </ThemedText>
                    <View style={styles.docMetadataRow}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Compliance: RA 9994 (Senior) &amp; RA 10754 (PWD)
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Invoices Audited: 45
                      </ThemedText>
                    </View>
                    <View style={styles.reportSummaryGrid}>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>GROSS SALES</ThemedText>
                        <ThemedText variant="bodyBold">₱54,000.00</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>SENIOR DISCOUNTS</ThemedText>
                        <ThemedText variant="bodyBold">₱6,800.00</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>PWD DISCOUNTS</ThemedText>
                        <ThemedText variant="bodyBold">₱4,000.00</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>VAT EXEMPT BASE</ThemedText>
                        <ThemedText variant="bodyBold" color={theme.colors.primary}>₱6,480.00</ThemedText>
                      </View>
                    </View>
                  </View>
                )}

                {selectedDocType === 'Doctor Shares Settlement' && (
                  <View style={styles.docTypeContent}>
                    <ThemedText variant="h3" style={styles.docTypeTitle}>
                      PHYSICIAN SHARE &amp; COMMISSION SETTLEMENT
                    </ThemedText>
                    <View style={styles.docMetadataRow}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Physician: Dr. Roberto V. Santos, MD (PRC 0098451)
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Default Retention: 30% Clinic / 70% Doctor
                      </ThemedText>
                    </View>
                    <View style={styles.reportSummaryGrid}>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>CONSULTATIONS GROSS</ThemedText>
                        <ThemedText variant="bodyBold">₱84,000.00</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>PROCEDURES GROSS</ThemedText>
                        <ThemedText variant="bodyBold">₱14,000.00</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>CLINIC SHARE (30%)</ThemedText>
                        <ThemedText variant="bodyBold">₱29,400.00</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>NET PAYABLE (70%)</ThemedText>
                        <ThemedText variant="bodyBold" color={theme.colors.primary}>₱68,600.00</ThemedText>
                      </View>
                    </View>
                  </View>
                )}

                {selectedDocType === 'Executive Analytics Summary' && (
                  <View style={styles.docTypeContent}>
                    <ThemedText variant="h3" style={styles.docTypeTitle}>
                      EXECUTIVE CLINICAL &amp; OPERATIONAL ANALYTICS
                    </ThemedText>
                    <View style={styles.docMetadataRow}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Executive Period: Last 30 Days
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Collection Efficiency: 96.3%
                      </ThemedText>
                    </View>
                    <View style={styles.reportSummaryGrid}>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>TOTAL ENCOUNTERS</ThemedText>
                        <ThemedText variant="bodyBold">184 Visits</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>AVERAGE WAIT</ThemedText>
                        <ThemedText variant="bodyBold">12.5 min</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>GROSS REVENUE</ThemedText>
                        <ThemedText variant="bodyBold">₱185,000.00</ThemedText>
                      </View>
                      <View style={styles.reportMetricCell}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>COLLECTIONS</ThemedText>
                        <ThemedText variant="bodyBold" color={theme.colors.primary}>₱158,000.00</ThemedText>
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* Signature Block (Suppressed on Placards, tailored for Reports vs Clinical) */}
              {selectedDocType !== 'Reception QR Placard' && (
                <View style={styles.signatureBlock}>
                  {docCategory === 'Reports' ? (
                    <View style={styles.eSignatureWrapper}>
                      <View style={styles.signatureRule} />
                      <ThemedText variant="bodyBold">CLINIC ADMINISTRATION &amp; AUDIT</ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        Official Statutory Report • Generated via ClinicEZ
                      </ThemedText>
                      <View style={styles.digitalSealBadge}>
                        <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.routine} />
                        <ThemedText variant="captionBold" color={theme.colors.routine}>
                          Audit Verified &amp; Cryptographically Sealed
                        </ThemedText>
                      </View>
                    </View>
                  ) : signatureMode === 'ESignatureSpecimen' ? (
                    <View style={styles.eSignatureWrapper}>
                      <View style={styles.signatureSpecimenBox}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          [Clinician E-Signature Specimen Applied]
                        </ThemedText>
                      </View>
                      <View style={styles.signatureRule} />
                      <ThemedText variant="bodyBold">DR. ROBERTO V. SANTOS, MD, FPCP</ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        PRC Lic. No. 0098451 • PTR No. 8472910 • S2 No. S2-2026-9912
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        PhilHealth Accredited Physician No. PAN-04-192837
                      </ThemedText>
                      <View style={styles.digitalSealBadge}>
                        <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.routine} />
                        <ThemedText variant="captionBold" color={theme.colors.routine}>
                          Digitally Certified &amp; Locked
                        </ThemedText>
                      </View>
                    </View>
                  ) : signatureMode === 'DigitalSealOnly' ? (
                    <View style={styles.eSignatureWrapper}>
                      <View style={styles.signatureRule} />
                      <ThemedText variant="bodyBold">DR. ROBERTO V. SANTOS, MD, FPCP</ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        PRC Lic. No. 0098451 • PTR No. 8472910 • S2 No. S2-2026-9912
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        PhilHealth Accredited Physician No. PAN-04-192837
                      </ThemedText>
                      <View style={styles.digitalSealBadge}>
                        <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.routine} />
                        <ThemedText variant="captionBold" color={theme.colors.routine}>
                          Digitally Certified &amp; Locked
                        </ThemedText>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.wetSignatureWrapper}>
                      <View style={styles.wetSignatureBlankLine} />
                      <ThemedText variant="bodyBold">DR. ROBERTO V. SANTOS, MD, FPCP</ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        PRC Lic. No. 0098451 • PTR No. 8472910 • S2 No. S2-2026-9912
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        (Affix physical pen signature above line)
                      </ThemedText>
                    </View>
                  )}

                  <View style={styles.securityDigestRow}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Digest: HMAC-SHA256:7f3a9e...2026 • Scan QR code to verify validity
                    </ThemedText>
                  </View>
                </View>
              )}

              {/* Canvas Footer */}
              <View style={styles.canvasFooter}>
                <View style={styles.canvasFooterDivider} />
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.footerDisclaimerText}>
                  {letterheadFooter.trim() ||
                    'Valid Philippine Clinical Document. Digitally certified via Clinic EZ in compliance with RA 8792 & RA 10173.'}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textLight}>
                  Verify online: portal.clinicez.ph/verify/DOC-SEC-2026
                </ThemedText>
              </View>
            </ScrollView>
          </Card>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stateWrapper: {
    padding: theme.spacing.xl,
  },
  stateCard: {
    padding: theme.spacing['2xl'],
    gap: theme.spacing.lg,
  },
  workstationLayout: {
    width: '100%',
  },
  rowLayout: {
    flexDirection: 'row',
    gap: theme.spacing.xl,
    alignItems: 'flex-start',
  },
  columnLayout: {
    flexDirection: 'column',
    gap: theme.spacing.lg,
  },
  leftColumn: {
    gap: theme.spacing.lg,
  },
  rightColumn: {
    gap: theme.spacing.lg,
  },
  desktopColumn: {
    flex: 1,
  },
  sectionCard: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  formFields: {
    gap: theme.spacing.sm,
  },
  logoSection: {
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  logoPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    width: '100%',
  },
  logoThumbnail: {
    width: 60,
    height: 60,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
  },
  logoEmptyNotice: {
    marginBottom: theme.spacing.xs,
  },
  colorPaletteWrapper: {
    gap: theme.spacing.md,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  colorSwatch: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  colorSwatchActive: {
    borderColor: theme.colors.text,
    borderWidth: 2,
    ...theme.shadows.sm,
  },
  paperSizeWrapper: {
    gap: theme.spacing.sm,
  },
  saveActionBar: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  canvasContainerCard: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  canvasControlBar: {
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  controlBarRow: {
    gap: theme.spacing.xs,
  },
  controlBarActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  canvasScroll: {
    maxHeight: 700,
  },
  canvasPaper: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing['2xl'],
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    minHeight: 720,
    justifyContent: 'space-between',
    gap: theme.spacing.lg,
    ...theme.shadows.md,
  },
  canvasHeader: {
    gap: theme.spacing.sm,
  },
  canvasHeaderTop: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  canvasLogo: {
    width: 64,
    height: 64,
  },
  canvasLogoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
  },
  canvasHeaderTitleBlock: {
    flex: 1,
    gap: 2,
  },
  canvasFacilityTitle: {
    letterSpacing: 0.5,
  },
  canvasDividerBar: {
    height: 3,
    width: '100%',
    borderRadius: theme.radii.full,
    marginTop: theme.spacing.xs,
  },
  canvasBody: {
    gap: theme.spacing.md,
    minHeight: 180,
  },
  docTypeContent: {
    gap: theme.spacing.sm,
  },
  docTypeTitle: {
    textAlign: 'center',
    letterSpacing: 1,
    color: theme.colors.text,
  },
  docMetadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: theme.spacing.xs,
  },
  docSalutation: {
    marginTop: theme.spacing.xs,
  },
  docParagraph: {
    lineHeight: 22,
  },
  calloutBox: {
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.md,
    borderRadius: theme.radii.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
    gap: 4,
  },
  rxSymbolBox: {
    marginVertical: theme.spacing.xs,
  },
  rxItemsList: {
    gap: theme.spacing.md,
  },
  rxItemRow: {
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: 2,
  },
  refillsText: {
    marginTop: theme.spacing.xs,
  },
  labChecklist: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  referralRecipientBox: {
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.md,
    borderRadius: theme.radii.sm,
    gap: 2,
  },
  signatureBlock: {
    marginTop: 'auto',
    paddingTop: theme.spacing.lg,
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  eSignatureWrapper: {
    alignItems: 'flex-end',
    gap: 2,
  },
  signatureSpecimenBox: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    marginBottom: 4,
  },
  signatureRule: {
    width: 220,
    height: 1,
    backgroundColor: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  digitalSealBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.routineBg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radii.full,
    marginTop: 4,
  },
  wetSignatureWrapper: {
    alignItems: 'flex-end',
    gap: 2,
  },
  wetSignatureBlankLine: {
    width: 220,
    height: 1,
    backgroundColor: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  securityDigestRow: {
    marginTop: theme.spacing.sm,
    alignItems: 'flex-end',
  },
  canvasFooter: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs,
    alignItems: 'center',
  },
  canvasFooterDivider: {
    height: 1,
    width: '100%',
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.xs,
  },
  footerDisclaimerText: {
    textAlign: 'center',
    maxWidth: 520,
  },
  placardQrBox: {
    alignItems: 'center',
    marginVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  placardQrPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  placardCodeBadge: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  placardInstructions: {
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.md,
    borderRadius: theme.radii.sm,
    gap: 4,
  },
  reportSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.xs,
  },
  reportMetricCell: {
    flex: 1,
    minWidth: 120,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    gap: 2,
  },
  tableBlock: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
});
