import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Platform,
} from 'react-native';
import {
  ThemedText,
  Badge,
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  Icon,
  SegmentedControl,
} from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useStaff, formatStaffName } from '../../context/StaffContext';
import { useClinic } from '../../context/ClinicContext';
import { useConnection } from '../../components/connection/ConnectionGate';
import { clinicService, SignatureMode, StaffMember } from '../../services/clinicService';
import SignatureSpecimenModal from '../../components/settings/SignatureSpecimenModal';
import { notify } from '@utils/feedback';
import { validatePasswordPolicy } from '../../services/passwordPolicy';
import { useTextScale, TEXT_SCALE_OPTIONS } from '../../context/TextScaleContext';
import { useUiDensity, UI_DENSITY_OPTIONS } from '../../context/UiDensityContext';
import {
  SoundTheme,
  UserAudioPreferences,
  SOUND_THEME_PRESETS,
  playAlertTone,
  validateAudioFile,
  setActiveAudioPreferences,
  getActiveAudioPreferences,
} from '../../utils/alertSounds';
import { ToggleSwitch } from '../../components/settings/AddEditFieldModal';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`;
  return letters.toUpperCase() || '?';
}

export default function ProfileScreen() {
  const { user, offline, logout, changePassword } = useAuth();
  const { current: staffCurrent, reload: reloadStaff } = useStaff();
  const { facilityName, planTier } = useClinic();
  const { serverLabel } = useConnection();
  const { density, setDensity } = useUiDensity();
  const { preset, scale, setPreset, stepDown, stepUp } = useTextScale();

  // Authoritative profile record fetched directly from GET /staff/me
  const [selfStaff, setSelfStaff] = useState<StaffMember | null>(null);
  const effectiveStaff = (selfStaff && selfStaff.id === user?.id ? selfStaff : null) ?? staffCurrent;

  const resolveDefaultNames = (s: StaffMember | null, u: typeof user) => {
    const parts = (u?.name || '').trim().split(/\s+/).filter(Boolean);
    const defaultLastName = parts.length > 1 ? parts[parts.length - 1] : '';
    const defaultFirstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '';
    return {
      firstName: s?.firstName || defaultFirstName,
      lastName: s?.lastName || defaultLastName,
    };
  };

  // Profile Form State (pre-populated from effectiveStaff to avoid empty flash)
  const [title, setTitle] = useState(() => effectiveStaff?.title || (user?.role === 'Doctor' ? 'Dr.' : ''));
  const [firstName, setFirstName] = useState(() => resolveDefaultNames(effectiveStaff, user).firstName);
  const [middleName, setMiddleName] = useState(() => effectiveStaff?.middleName || '');
  const [lastName, setLastName] = useState(() => resolveDefaultNames(effectiveStaff, user).lastName);
  const [phone, setPhone] = useState(() => effectiveStaff?.phoneNumber || '');
  const [specialty, setSpecialty] = useState(() => effectiveStaff?.specialty || '');
  const [prc, setPrc] = useState(() => effectiveStaff?.prcLicenseNumber || '');
  const [ptr, setPtr] = useState(() => effectiveStaff?.ptrNumber || '');
  const [s2, setS2] = useState(() => effectiveStaff?.s2LicenseNumber || '');
  const [pan, setPan] = useState(() => effectiveStaff?.philHealthPan || '');

  // Clinician E-Signature Specimen State
  const [signatureSpecimen, setSignatureSpecimen] = useState<string | null>(() => effectiveStaff?.signatureSpecimen || null);
  const [defaultSignatureMode, setDefaultSignatureMode] = useState<SignatureMode>(
    () => effectiveStaff?.defaultSignatureMode || 'ESignatureSpecimen',
  );
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  // Status & Feedback States
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Personal Alert Audio & Sound Preferences State
  const [soundTheme, setSoundTheme] = useState<SoundTheme>(() => {
    return getActiveAudioPreferences().soundTheme || 'gentleBell';
  });
  const [customAudioDataUri, setCustomAudioDataUri] = useState<string | null>(() => {
    return getActiveAudioPreferences().customAudioDataUri || null;
  });
  const [customAudioFileName, setCustomAudioFileName] = useState<string | null>(() => {
    return getActiveAudioPreferences().customAudioFileName || null;
  });
  const [isAlertMuted, setIsAlertMuted] = useState<boolean>(() => {
    return Boolean(getActiveAudioPreferences().isMuted);
  });
  const [personalChartLayout, setPersonalChartLayout] = useState<'default' | 'modal' | 'split' | 'drawer'>(() => {
    return (getActiveAudioPreferences().preferredChartLayout as any) || 'default';
  });
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Load authoritative staff record from GET /staff/me on mount / user switch
  const loadMyProfile = useCallback(async () => {
    if (!user?.id || offline) return;
    const [data] = await clinicService.getMyProfile();
    if (data && data.id === user.id) {
      setSelfStaff(data);
    }
  }, [user?.id, offline]);

  useEffect(() => {
    setSelfStaff((prev) => (prev && prev.id === user?.id ? prev : null));
    void loadMyProfile();
  }, [loadMyProfile, user?.id]);

  // Sync personal audio & workstation preferences from authoritative staff record
  useEffect(() => {
    if (effectiveStaff?.preferencesJson) {
      try {
        const prefs: UserAudioPreferences = JSON.parse(effectiveStaff.preferencesJson);
        if (prefs.soundTheme) setSoundTheme(prefs.soundTheme);
        if (prefs.customAudioDataUri) setCustomAudioDataUri(prefs.customAudioDataUri);
        if (prefs.customAudioFileName) setCustomAudioFileName(prefs.customAudioFileName);
        if (typeof prefs.isMuted === 'boolean') setIsAlertMuted(prefs.isMuted);
        if (prefs.preferredChartLayout) setPersonalChartLayout(prefs.preferredChartLayout);
        setActiveAudioPreferences(prefs);
      } catch {
        // Ignore JSON parse error
      }
    }
  }, [effectiveStaff?.preferencesJson]);

  // Sync form with authoritative staff record
  useEffect(() => {
    const s = effectiveStaff;
    const { firstName: nextFirst, lastName: nextLast } = resolveDefaultNames(s, user);

    setTitle(s?.title || (user?.role === 'Doctor' ? 'Dr.' : ''));
    setFirstName(nextFirst);
    setLastName(nextLast);
    setMiddleName(s?.middleName || '');
    setPhone(s?.phoneNumber || '');
    setSpecialty(s?.specialty || '');
    setPrc(s?.prcLicenseNumber || '');
    setPtr(s?.ptrNumber || '');
    setS2(s?.s2LicenseNumber || '');
    setPan(s?.philHealthPan || '');
    setSignatureSpecimen(s?.signatureSpecimen || null);
    setDefaultSignatureMode(s?.defaultSignatureMode || 'ESignatureSpecimen');
  }, [effectiveStaff, user]);

  if (!user) return null;

  const role = user.roleName || user.role;
  const isDoctor = user.role === 'Doctor' || effectiveStaff?.role === 'Doctor';
  const displayName = effectiveStaff ? formatStaffName(effectiveStaff) : user.name;
  const accountEmail = effectiveStaff?.email?.trim() || user.email?.trim() || '';

  const handleSelectCustomAudio = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      notify.info('Custom audio upload is supported on web workstations.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp3,.wav,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/ogg';
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;

      const check = validateAudioFile({
        name: file.name,
        size: file.size,
        type: file.type,
      });

      if (!check.valid) {
        setAudioUploadError(check.error || 'Invalid audio file.');
        notify.error(check.error || 'Invalid audio file.');
        return;
      }

      setAudioUploadError(null);
      const reader = new FileReader();
      reader.onload = () => {
        const base64Uri = reader.result as string;
        setCustomAudioDataUri(base64Uri);
        setCustomAudioFileName(file.name);
        setSoundTheme('custom');
        playAlertTone('custom', base64Uri);
        notify.success(`Loaded custom audio: ${file.name}`);
      };
      reader.onerror = () => {
        notify.error('Failed to read audio file.');
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleSavePersonalPreferences = async () => {
    setSavingPreferences(true);
    const preferencesPayload: UserAudioPreferences = {
      soundTheme,
      customAudioDataUri: soundTheme === 'custom' ? customAudioDataUri : null,
      customAudioFileName: soundTheme === 'custom' ? customAudioFileName : null,
      isMuted: isAlertMuted,
      preferredChartLayout: personalChartLayout !== 'default' ? personalChartLayout : undefined,
    };

    setActiveAudioPreferences(preferencesPayload);

    const [updated, err] = await clinicService.updateMyProfile({
      firstName: firstName.trim() || resolveDefaultNames(effectiveStaff, user).firstName,
      lastName: lastName.trim() || resolveDefaultNames(effectiveStaff, user).lastName,
      middleName: middleName.trim() || undefined,
      title: title.trim() || undefined,
      phoneNumber: phone.trim() || undefined,
      preferencesJson: JSON.stringify(preferencesPayload),
    });
    setSavingPreferences(false);

    if (err || !updated) {
      notify.error(err?.message || 'Could not sync preferences to server.');
      return;
    }

    setSelfStaff(updated);
    await reloadStaff();
    notify.success('Personal alert and workstation preferences saved successfully.');
  };

  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setProfileError('First and last name are required.');
      return;
    }

    if (isDoctor && !prc.trim()) {
      setProfileError('PRC License Number is mandatory for Doctors.');
      return;
    }

    setSavingProfile(true);
    setProfileError(null);

    const preferencesPayload: UserAudioPreferences = {
      soundTheme,
      customAudioDataUri: soundTheme === 'custom' ? customAudioDataUri : null,
      customAudioFileName: soundTheme === 'custom' ? customAudioFileName : null,
      isMuted: isAlertMuted,
      preferredChartLayout: personalChartLayout !== 'default' ? personalChartLayout : undefined,
    };
    setActiveAudioPreferences(preferencesPayload);

    const [updated, err] = await clinicService.updateMyProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      middleName: middleName.trim() || undefined,
      title: title.trim() || undefined,
      phoneNumber: phone.trim() || undefined,
      prcLicenseNumber: isDoctor ? prc.trim() : undefined,
      ptrNumber: isDoctor ? ptr.trim() || undefined : undefined,
      s2LicenseNumber: isDoctor ? s2.trim() || undefined : undefined,
      philHealthPan: isDoctor ? pan.trim() || undefined : undefined,
      specialty: specialty.trim() || undefined,
      signatureSpecimen: isDoctor ? signatureSpecimen : undefined,
      defaultSignatureMode: isDoctor ? defaultSignatureMode : undefined,
      preferencesJson: JSON.stringify(preferencesPayload),
    });

    setSavingProfile(false);

    if (err || !updated) {
      setProfileError(err?.message || 'Could not save profile.');
      return;
    }

    setSelfStaff(updated);
    await reloadStaff();
    notify.success('Profile and credentials updated successfully.');
  };

  const handleUpdatePassword = async () => {
    const problems = validatePasswordPolicy(newPassword);
    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (problems.length > 0) {
      setPasswordError(problems.join(' '));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }

    setSavingPassword(true);
    setPasswordError(null);

    const failure = await changePassword(currentPassword, newPassword);
    setSavingPassword(false);

    if (failure) {
      setPasswordError(failure);
      return;
    }

    notify.success('Workstation password changed successfully.');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <ResponsiveLayout
      headerTitle="My Profile & Credentials"
      headerSubtitle="Manage your contact details, clinical credentials, and workstation account"
    >
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        {/* Profile Hero / Header Banner */}
        <Card>
          <CardContent style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.avatarLarge}>
                <ThemedText variant="h2" color={theme.colors.onPrimary}>
                  {initialsOf(displayName)}
                </ThemedText>
              </View>

              <View style={styles.heroDetails}>
                <View style={styles.heroNameRow}>
                  <ThemedText variant="title">
                    {displayName}
                  </ThemedText>
                  <Badge
                    label={role}
                    variant={isDoctor ? 'primary' : 'purple'}
                    size="md"
                  />
                  {effectiveStaff?.roleName && effectiveStaff.roleName !== role ? (
                    <Badge
                      label={effectiveStaff.roleName}
                      variant="neutral"
                      size="sm"
                    />
                  ) : null}
                </View>

                <View style={styles.heroMetaRow}>
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    {facilityName || 'Clinic EZ Workstation'}
                    {planTier ? ` · ${planTier} Tier` : ''}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    ·
                  </ThemedText>
                  <View style={styles.statusRow}>
                    <Badge
                      label={offline ? 'Offline Workstation' : 'Live Connected'}
                      variant={offline ? 'warning' : 'success'}
                      size="sm"
                    />
                  </View>
                </View>

                {accountEmail ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Account: {accountEmail}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Form Error Banner */}
        {profileError ? (
          <View style={styles.errorBox}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
              {profileError}
            </ThemedText>
          </View>
        ) : null}

        {/* Section 1: Personal & Contact Information */}
        <Card>
          <CardHeader
            title="Personal & Contact Information"
            subtitle="Your basic staff directory and contact profile"
          />
          <CardContent style={styles.cardSection}>
            <View style={styles.formRow}>
              <Input
                containerStyle={styles.flexNarrow}
                label="Title"
                value={title}
                onChangeText={setTitle}
                placeholder="Dr. / RN / MD"
              />
              <Input
                containerStyle={styles.flexWide}
                label="First name *"
                required
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
              />
              <Input
                containerStyle={styles.flexWide}
                label="Middle name"
                value={middleName}
                onChangeText={setMiddleName}
                placeholder="Middle name"
              />
              <Input
                containerStyle={styles.flexWide}
                label="Last name *"
                required
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
              />
            </View>

            <View style={styles.formRow}>
              <Input
                containerStyle={styles.flexWide}
                label="Sign-in email address"
                value={accountEmail}
                editable={false}
                placeholder="doctor@clinic.com"
                helperText="Primary workstation account login identity (managed by administrator)."
              />
              <Input
                containerStyle={styles.flexWide}
                label="Contact phone number"
                value={phone}
                onChangeText={setPhone}
                placeholder="0917-123-4567"
                keyboardType="phone-pad"
              />
            </View>

            <Input
              label="Specialty or clinical designation"
              value={specialty}
              onChangeText={setSpecialty}
              placeholder={isDoctor ? 'e.g. Pediatrics, Internal Medicine, Cardiology' : 'e.g. Triage Nursing, Billing Officer'}
              helperText="Appears on consult summaries, patient receipts, and official clinical paperwork."
            />
          </CardContent>
        </Card>

        {/* Section 2: Clinical Credentials & Live Doctor Stamp Specimen */}
        <Card>
          <CardHeader
            title="Professional & Clinical Credentials"
            subtitle="Philippine regulatory credentials required for e-prescriptions, diagnostic orders, and PhilHealth claims"
          />
          <CardContent style={styles.cardSection}>
            <View style={styles.formRow}>
              <Input
                containerStyle={styles.flexWide}
                label={isDoctor ? 'PRC License Number *' : 'PRC / Professional License Number'}
                required={isDoctor}
                value={prc}
                onChangeText={setPrc}
                placeholder="e.g. 0108924"
                helperText={isDoctor ? 'Mandatory for doctors under the Philippine Medical Act of 1959.' : 'Optional for non-physicians.'}
              />
              <Input
                containerStyle={styles.flexWide}
                label="Professional Tax Receipt (PTR)"
                value={ptr}
                onChangeText={setPtr}
                placeholder="e.g. PTR No. 8941203 / Taguig City"
                helperText="Annual PTR number and issuing local government unit."
              />
            </View>

            <View style={styles.formRow}>
              <Input
                containerStyle={styles.flexWide}
                label="PhilHealth Accreditation Number (PAN)"
                value={pan}
                onChangeText={setPan}
                placeholder="e.g. 1200-9876543-2"
                helperText="Auto-prefilled on PhilHealth Konsulta / YAKAP consultations."
              />
              <Input
                containerStyle={styles.flexWide}
                label="PDEA S2 Dangerous Drug License Number"
                value={s2}
                onChangeText={setS2}
                placeholder="e.g. S2 No. 0918-99214-A1 (Optional)"
                helperText="Required by Philippine PDEA to prescribe yellow pad dangerous drugs."
              />
            </View>

            {/* Official Doctor Stamp & E-Signature Specimen Preview */}
            <View style={styles.stampCard}>
              <View style={styles.stampHeaderRow}>
                <View style={styles.stampTitleGroup}>
                  <ThemedText variant="smallBold" color={theme.colors.primary}>
                    Official Physician Stamp & E-Signature Specimen
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    This official stamp specimen is automatically rendered on printed prescriptions, lab referral slips, and clinical summaries.
                  </ThemedText>
                </View>
                {defaultSignatureMode === 'ESignatureSpecimen' ? (
                  <Badge label="Digitally Certified & Locked" variant="success" icon="check" />
                ) : defaultSignatureMode === 'DigitalSealOnly' ? (
                  <Badge label="Digital Verification Seal" variant="primary" icon="shield" />
                ) : (
                  <Badge label="Wet Signature (Pen Signing)" variant="neutral" />
                )}
              </View>

              <View style={styles.stampControlsRow}>
                <View style={styles.segmentedWrapper}>
                  <SegmentedControl<SignatureMode>
                    value={defaultSignatureMode}
                    onChange={(mode) => setDefaultSignatureMode(mode)}
                    options={[
                      { value: 'ESignatureSpecimen', label: 'E-Signature' },
                      { value: 'DigitalSealOnly', label: 'Digital Seal' },
                      { value: 'WetSignature', label: 'Wet Signature' },
                    ]}
                  />
                </View>
                <Button
                  title={signatureSpecimen ? 'Manage Signature' : 'Upload / Draw Signature'}
                  variant="outline"
                  size="sm"
                  icon="edit"
                  onPress={() => setSignatureModalVisible(true)}
                />
              </View>

              <View style={styles.stampBox}>
                {/* E-Signature Specimen Overlay */}
                {defaultSignatureMode === 'ESignatureSpecimen' ? (
                  signatureSpecimen ? (
                    <View style={styles.stampSignatureOverlay}>
                      <Image
                        source={{ uri: signatureSpecimen }}
                        style={styles.stampSignatureImage}
                        resizeMode="contain"
                      />
                    </View>
                  ) : (
                    <View style={styles.stampSignatureEmpty}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        [No E-Signature specimen configured — Click 'Upload / Draw Signature']
                      </ThemedText>
                    </View>
                  )
                ) : defaultSignatureMode === 'WetSignature' ? (
                  <View style={styles.stampWetSignatureBox}>
                    <View style={styles.stampWetLine} />
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Physician Wet Signature (Pen)
                    </ThemedText>
                  </View>
                ) : null}

                <ThemedText variant="bodyBold" color={theme.colors.primary} style={styles.stampName}>
                  {`${title ? `${title} ` : 'DR. '}${firstName || 'First'} ${lastName || 'Last'}`.toUpperCase()}
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  {specialty || 'General / Primary Care Medicine'}
                </ThemedText>
                <View style={styles.stampDivider} />
                <ThemedText variant="small" color={theme.colors.text}>
                  {prc ? `PRC License No. ${prc}` : 'PRC License No. [Required for Prescriptions]'}
                </ThemedText>
                {ptr ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {ptr}
                  </ThemedText>
                ) : null}
                {pan ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {`PhilHealth PAN: ${pan}`}
                  </ThemedText>
                ) : null}
                {s2 ? (
                  <ThemedText variant="captionBold" color={theme.colors.emergency}>
                    {s2}
                  </ThemedText>
                ) : null}
              </View>
            </View>

            <SignatureSpecimenModal
              visible={signatureModalVisible}
              onClose={() => setSignatureModalVisible(false)}
              initialSignature={signatureSpecimen}
              initialMode={defaultSignatureMode}
              doctorName={`${title ? `${title} ` : 'Dr. '}${firstName || 'First'} ${lastName || 'Last'}`}
              credentials={{
                specialty,
                prc,
                ptr,
                s2,
                pan,
              }}
              onSave={async (newSig, newMode) => {
                setSignatureSpecimen(newSig);
                setDefaultSignatureMode(newMode);
              }}
            />

            <View style={styles.saveActionsRow}>
              <Button
                title="Save Profile & Credentials"
                variant="primary"
                onPress={handleSaveProfile}
                loading={savingProfile}
                disabled={offline}
              />
            </View>
          </CardContent>
        </Card>

        {/* Section 3: Workstation Account Security */}
        <Card>
          <CardHeader
            title="Workstation Security"
            subtitle="Change your password and manage sign-in credentials"
          />
          <CardContent style={styles.cardSection}>
            {passwordError ? (
              <View style={styles.errorBox}>
                <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
                <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
                  {passwordError}
                </ThemedText>
              </View>
            ) : null}

            <View style={styles.formRow}>
              <Input
                containerStyle={styles.flexWide}
                label="Current password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Enter current password"
              />
              <Input
                containerStyle={styles.flexWide}
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Minimum 10 characters"
                helperText="Must have at least 10 characters with numbers and letters."
              />
              <Input
                containerStyle={styles.flexWide}
                label="Confirm new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="Re-type new password"
              />
            </View>

            <View style={styles.saveActionsRow}>
              <Button
                title="Update Password"
                variant="secondary"
                icon="key"
                onPress={handleUpdatePassword}
                loading={savingPassword}
                disabled={offline}
              />
            </View>
          </CardContent>
        </Card>

        {/* Section: Notification & Personal Alert Sounds */}
        <Card>
          <CardHeader
            title="Notification & Personal Alert Sounds"
            subtitle="Personalize your alert chimes and override clinic-wide notification sounds for your workstation"
          />
          <CardContent style={styles.cardSection}>
            {/* Master Sound Alert Toggle */}
            <View style={styles.audioToggleRow}>
              <View style={styles.audioToggleInfo}>
                <View style={styles.inlineHeader}>
                  <Icon
                    name={isAlertMuted ? 'volumeX' : 'volume2'}
                    size={20}
                    color={isAlertMuted ? theme.colors.emergency : theme.colors.primary}
                  />
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Mute All Alert Sounds
                  </ThemedText>
                  {isAlertMuted && (
                    <Badge label="Muted" variant="emergency" size="xs" />
                  )}
                </View>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Silence incoming triage announcements and direct chat sound alerts on this workstation.
                </ThemedText>
              </View>
              <ToggleSwitch
                value={isAlertMuted}
                onValueChange={(muted) => {
                  setIsAlertMuted(muted);
                  if (muted) {
                    notify.info('Sound alerts muted on this workstation.');
                  } else {
                    playAlertTone(soundTheme, customAudioDataUri);
                    notify.info('Sound alerts enabled.');
                  }
                }}
                accessibilityLabel="Mute All Alert Sounds"
              />
            </View>

            {/* Sound Preset Theme Selection */}
            <View style={styles.soundPresetsSection}>
              <View style={styles.sectionHeaderRow}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  ALERT CHIME PRESET
                </ThemedText>
                <Badge
                  label={
                    soundTheme === 'custom'
                      ? 'Custom Audio File'
                      : SOUND_THEME_PRESETS.find((p) => p.id === soundTheme)?.name || 'Gentle Bell'
                  }
                  variant="primary"
                  size="xs"
                />
              </View>

              <View style={styles.presetOptionsGrid}>
                {SOUND_THEME_PRESETS.map((presetItem) => {
                  const isSelected = soundTheme === presetItem.id;
                  const isPresetMuted = presetItem.id === 'silent';
                  const isCustomTheme = presetItem.id === 'custom';

                  return (
                    <Pressable
                      key={presetItem.id}
                      onPress={() => {
                        setSoundTheme(presetItem.id);
                        if (!isAlertMuted && !isPresetMuted) {
                          playAlertTone(presetItem.id, customAudioDataUri);
                        }
                      }}
                      style={[
                        styles.presetCard,
                        isSelected && styles.presetCardActive,
                        isAlertMuted && styles.presetCardMuted,
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={presetItem.name}
                    >
                      <View style={styles.presetHeader}>
                        <View style={styles.inlineHeader}>
                          <Icon
                            name={
                              isPresetMuted
                                ? 'volumeX'
                                : isCustomTheme
                                ? 'upload'
                                : isSelected
                                ? 'volume2'
                                : 'bell'
                            }
                            size={16}
                            color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                          />
                          <ThemedText
                            variant="bodyBold"
                            color={isSelected ? theme.colors.primary : theme.colors.text}
                          >
                            {presetItem.name}
                          </ThemedText>
                        </View>
                        {isSelected && (
                          <Badge label="Selected" variant="primary" size="xs" />
                        )}
                      </View>

                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        {presetItem.description}
                      </ThemedText>

                      {!isPresetMuted && (!isCustomTheme || customAudioDataUri) && (
                        <View style={styles.presetActionRow}>
                          <Button
                            title="Preview Tone"
                            variant="ghost"
                            size="sm"
                            icon="volume2"
                            onPress={() => {
                              playAlertTone(presetItem.id, customAudioDataUri);
                            }}
                          />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Custom Audio File Upload Card */}
            <View style={styles.customAudioSection}>
              <View style={styles.customAudioCard}>
                <View style={styles.customAudioHeader}>
                  <Icon name="upload" size={20} color={theme.colors.primary} />
                  <View style={styles.customAudioInfo}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Custom Audio Alert File
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      Strictly supports MP3, WAV, or OGG files up to 500 KB. Follows your account across devices.
                    </ThemedText>
                  </View>
                </View>

                {customAudioFileName ? (
                  <View style={styles.customAudioLoadedRow}>
                    <View style={styles.selectedFilePill}>
                      <Icon name="volume2" size={16} color={theme.colors.primary} />
                      <ThemedText variant="captionBold" color={theme.colors.text} numberOfLines={1}>
                        {customAudioFileName}
                      </ThemedText>
                      <Badge label="Saved to Profile" variant="success" size="xs" />
                    </View>
                    <View style={styles.customAudioButtons}>
                      <Button
                        title="Test Play"
                        variant="secondary"
                        size="sm"
                        icon="volume2"
                        onPress={() => {
                          if (customAudioDataUri) {
                            playAlertTone('custom', customAudioDataUri);
                          }
                        }}
                      />
                      <Button
                        title="Replace Audio"
                        variant="ghost"
                        size="sm"
                        icon="upload"
                        onPress={handleSelectCustomAudio}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.customAudioUploadRow}>
                    <Button
                      title="Upload Audio File (.mp3, .wav, .ogg)"
                      variant="secondary"
                      icon="upload"
                      onPress={handleSelectCustomAudio}
                    />
                  </View>
                )}

                {audioUploadError && (
                  <ThemedText variant="caption" color={theme.colors.emergency}>
                    {audioUploadError}
                  </ThemedText>
                )}
              </View>
            </View>

            {/* Patient Chart Personal Layout Mode Override */}
            <View style={styles.chartLayoutSection}>
              <View style={styles.sectionHeaderRow}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  PATIENT CHART WORKSTATION VIEW (OVERRIDE CLINIC DEFAULT)
                </ThemedText>
                <Badge
                  label={
                    personalChartLayout === 'default'
                      ? 'Clinic Default'
                      : personalChartLayout === 'split'
                      ? 'Split View'
                      : personalChartLayout === 'modal'
                      ? 'Modal'
                      : 'Side Drawer'
                  }
                  variant="neutral"
                  size="xs"
                />
              </View>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Choose how patient medical charts open during consultations on your workstation.
              </ThemedText>
              <View style={styles.presetOptionsGrid}>
                {[
                  {
                    id: 'default' as const,
                    name: 'Clinic Default',
                    desc: 'Follow the standard layout configured in Clinic Settings',
                    icon: 'clinic' as const,
                  },
                  {
                    id: 'split' as const,
                    name: 'Split Screen View',
                    desc: 'Persistent side-by-side split screen for wide monitors',
                    icon: 'layoutSplit' as const,
                  },
                  {
                    id: 'modal' as const,
                    name: 'Centered Modal',
                    desc: 'Classic centered dialog with backdrop blur',
                    icon: 'layoutModal' as const,
                  },
                  {
                    id: 'drawer' as const,
                    name: 'Right Slide Drawer',
                    desc: 'Sleek right drawer that slides in over the queue',
                    icon: 'layoutDrawer' as const,
                  },
                ].map((layoutOpt) => {
                  const isSelected = personalChartLayout === layoutOpt.id;
                  return (
                    <Pressable
                      key={layoutOpt.id}
                      onPress={() => setPersonalChartLayout(layoutOpt.id)}
                      style={[styles.presetCard, isSelected && styles.presetCardActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={layoutOpt.name}
                    >
                      <View style={styles.presetHeader}>
                        <View style={styles.inlineHeader}>
                          <Icon
                            name={layoutOpt.icon}
                            size={16}
                            color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                          />
                          <ThemedText
                            variant="bodyBold"
                            color={isSelected ? theme.colors.primary : theme.colors.text}
                          >
                            {layoutOpt.name}
                          </ThemedText>
                        </View>
                        {isSelected && (
                          <Badge label="Active" variant="primary" size="xs" />
                        )}
                      </View>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        {layoutOpt.desc}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Save Preferences Action Button */}
            <View style={styles.saveActionsRow}>
              <Button
                title="Save Personal Preferences"
                variant="primary"
                icon="check"
                onPress={handleSavePersonalPreferences}
                loading={savingPreferences}
                disabled={offline}
              />
            </View>
          </CardContent>
        </Card>

        {/* Section: Workstation Display & Ergonomics */}
        <Card>
          <CardHeader
            title="Workstation Display & Ergonomics"
            subtitle="Configure UI layout density (cards, buttons, sidebar) and text scaling for your device"
          />
          <CardContent style={styles.cardSection}>
            {/* Subsection 1: Layout Density */}
            <View style={styles.densitySection}>
              <View style={styles.sectionHeaderRow}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  WORKSTATION UI DENSITY (CARDS, BUTTONS & SIDEBAR)
                </ThemedText>
                <Badge
                  label={
                    density === 'ultraCompact'
                      ? 'Ultra Compact (70%)'
                      : density === 'compact'
                      ? 'Compact (85%)'
                      : 'Standard (100%)'
                  }
                  variant="primary"
                  size="xs"
                />
              </View>

              <View style={styles.presetOptionsGrid}>
                {UI_DENSITY_OPTIONS.map((opt) => {
                  const isSelected = density === opt.density;
                  return (
                    <Pressable
                      key={opt.density}
                      onPress={() => {
                        setDensity(opt.density);
                        notify.info(`Workstation layout density updated to ${opt.label}`);
                      }}
                      style={[styles.presetCard, isSelected && styles.presetCardActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={opt.label}
                    >
                      <View style={styles.presetHeader}>
                        <ThemedText
                          variant="bodyBold"
                          color={isSelected ? theme.colors.primary : theme.colors.text}
                        >
                          {opt.label}
                        </ThemedText>
                        {isSelected ? <Badge label="Active" variant="primary" size="xs" /> : null}
                      </View>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        {opt.description}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.densityDivider} />

            {/* Subsection 2: Text Size Scale */}
            <View style={styles.densitySection}>
              <View style={styles.sectionHeaderRow}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  WORKSTATION TEXT SIZE SCALING
                </ThemedText>
                <Badge label={`${Math.round(scale * 100)}% Font Scale`} variant="neutral" size="xs" />
              </View>

              {/* Fine adjustment stepper */}
              <View style={styles.stepperContainer}>
                <View style={styles.stepperInfo}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    FINE ADJUSTMENT (5% STEPS)
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Scale text from 60% (Ultra Compact) to 130% (Extra Large)
                  </ThemedText>
                </View>

                <View style={styles.stepperControls}>
                  <Button
                    title="-5%"
                    variant="outline"
                    size="sm"
                    icon="minus"
                    onPress={stepDown}
                    disabled={scale <= 0.601}
                  />
                  <View style={styles.stepperValueBadge}>
                    <ThemedText variant="bodyBold" color={theme.colors.primary}>
                      {Math.round(scale * 100)}%
                    </ThemedText>
                  </View>
                  <Button
                    title="+5%"
                    variant="outline"
                    size="sm"
                    icon="plus"
                    onPress={stepUp}
                    disabled={scale >= 1.299}
                  />
                  <Button
                    title="Reset (100%)"
                    variant="ghost"
                    size="sm"
                    onPress={() => setPreset('standard')}
                    disabled={scale === 1.0}
                  />
                </View>
              </View>

              <View style={styles.presetOptionsGrid}>
                {TEXT_SCALE_OPTIONS.map((opt) => {
                  const isSelected = preset === opt.preset;
                  return (
                    <Pressable
                      key={opt.preset}
                      onPress={() => {
                        setPreset(opt.preset);
                        notify.info(`Workstation text size updated to ${opt.label}`);
                      }}
                      style={[styles.presetCard, isSelected && styles.presetCardActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={opt.label}
                    >
                      <View style={styles.presetHeader}>
                        <ThemedText
                          variant="bodyBold"
                          color={isSelected ? theme.colors.primary : theme.colors.text}
                        >
                          {opt.label}
                        </ThemedText>
                        {isSelected ? <Badge label="Active" variant="primary" size="xs" /> : null}
                      </View>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        {opt.description}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Live Typography Preview */}
            <View style={styles.previewBox}>
              <View style={styles.previewHeaderRow}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  LIVE WORKSTATION PREVIEW (DENSITY & TEXT)
                </ThemedText>
                <View style={styles.stepperControls}>
                  <Badge
                    label={
                      density === 'ultraCompact'
                        ? '70% Density'
                        : density === 'compact'
                        ? '85% Density'
                        : '100% Density'
                    }
                    variant="primary"
                    size="xs"
                  />
                  <Badge label={`${Math.round(scale * 100)}% Font`} variant="neutral" size="xs" />
                </View>
              </View>

              <View style={styles.previewCard}>
                <View style={styles.previewTopRow}>
                  <Badge label="Q-001" variant="primary" size="sm" />
                  <ThemedText variant="bodyBold" numberOfLines={1}>
                    Bernardo, Carlo V.
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textMuted}>
                    · Dr. Wave Ambray
                  </ThemedText>
                </View>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  General consultation · Vitals: BP 120/80 mmHg · HR 72 bpm · Room 1
                </ThemedText>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Section 4: Workstation Session & System Info */}
        <Card>
          <CardHeader
            title="Workstation Session & Connectivity"
            subtitle="Active clinic node and sign-out controls"
          />
          <CardContent style={styles.cardSection}>
            <View style={styles.sessionGrid}>
              <View style={styles.sessionItem}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Connected Server Node
                </ThemedText>
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  {serverLabel || 'Local Clinic Server'}
                </ThemedText>
              </View>

              <View style={styles.sessionItem}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Workstation State
                </ThemedText>
                <Badge
                  label={offline ? 'Offline Mode' : 'Connected to Server'}
                  variant={offline ? 'warning' : 'success'}
                  size="sm"
                />
              </View>

              <View style={styles.sessionItem}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Facility Affiliation
                </ThemedText>
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  {facilityName || 'Clinic EZ'}
                </ThemedText>
              </View>
            </View>

            <View style={styles.signOutRow}>
              <Button
                title="Sign Out of Workstation"
                variant="danger"
                icon="logout"
                onPress={async () => {
                  await logout();
                }}
              />
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    padding: theme.spacing.xl,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    flexWrap: 'wrap',
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDetails: {
    flex: 1,
    minWidth: 240,
    gap: theme.spacing.xs,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardSection: {
    gap: theme.spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  flexNarrow: {
    flex: 1,
    minWidth: 120,
  },
  flexWide: {
    flex: 2,
    minWidth: 200,
  },
  flex1: {
    flex: 1,
  },
  stampCard: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  stampHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  stampTitleGroup: {
    gap: 2,
    flex: 1,
    minWidth: 200,
  },
  stampControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.xs,
  },
  segmentedWrapper: {
    flex: 1,
    minWidth: 260,
  },
  stampBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    gap: 4,
  },
  stampSignatureOverlay: {
    width: '100%',
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  stampSignatureImage: {
    width: 220,
    height: 54,
  },
  stampSignatureEmpty: {
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  stampWetSignatureBox: {
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  stampWetLine: {
    width: 200,
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.textMuted,
  },
  stampName: {
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  stampDivider: {
    width: '60%',
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
  },
  saveActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.sm,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.emergencySubtle,
    borderRadius: theme.radii.md,
  },
  sessionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  sessionItem: {
    flex: 1,
    minWidth: 160,
    gap: 4,
  },
  signOutRow: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  densitySection: {
    gap: theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  densityDivider: {
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.borderLight,
    marginVertical: theme.spacing.sm,
  },
  stepperContainer: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  stepperInfo: {
    gap: 2,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  stepperValueBadge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    minWidth: 64,
    alignItems: 'center',
  },
  presetOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  presetCard: {
    flex: 1,
    minWidth: 200,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  presetCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  presetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  previewBox: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  previewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  audioToggleRow: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  audioToggleInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  soundPresetsSection: {
    gap: theme.spacing.sm,
  },
  presetActionRow: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  presetCardMuted: {
    opacity: 0.65,
  },
  customAudioSection: {
    gap: theme.spacing.sm,
  },
  customAudioCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  customAudioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  customAudioInfo: {
    flex: 1,
    gap: 2,
  },
  customAudioLoadedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  selectedFilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    maxWidth: 320,
  },
  customAudioButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  customAudioUploadRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  chartLayoutSection: {
    gap: theme.spacing.sm,
  },
});
