import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
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
} from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useStaff, formatStaffName } from '../../context/StaffContext';
import { useClinic } from '../../context/ClinicContext';
import { useConnection } from '../../components/connection/ConnectionGate';
import { clinicService } from '../../services/clinicService';
import { notify } from '@utils/feedback';
import { validatePasswordPolicy } from '../../services/passwordPolicy';
import { useTextScale, TEXT_SCALE_OPTIONS } from '../../context/TextScaleContext';

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
  const { preset, scale, setPreset, stepDown, stepUp } = useTextScale();

  // Profile Form State
  const [title, setTitle] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [prc, setPrc] = useState('');
  const [ptr, setPtr] = useState('');
  const [s2, setS2] = useState('');
  const [pan, setPan] = useState('');

  // Status & Feedback States
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Sync form with current staff record
  useEffect(() => {
    const s = staffCurrent;
    const parts = (user?.name || '').trim().split(/\s+/).filter(Boolean);
    const defaultLastName = parts.length > 1 ? parts[parts.length - 1] : '';
    const defaultFirstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '';

    setTitle(s?.title || (user?.role === 'Doctor' ? 'Dr.' : ''));
    setFirstName(s?.firstName || defaultFirstName);
    setLastName(s?.lastName || defaultLastName);
    setMiddleName(s?.middleName || '');
    setPhone(s?.phoneNumber || '');
    setSpecialty(s?.specialty || '');
    setPrc(s?.prcLicenseNumber || '');
    setPtr(s?.ptrNumber || '');
    setS2(s?.s2LicenseNumber || '');
    setPan(s?.philHealthPan || '');
  }, [staffCurrent, user]);

  if (!user) return null;

  const role = user.roleName || user.role;
  const isDoctor = user.role === 'Doctor' || staffCurrent?.role === 'Doctor';
  const displayName = staffCurrent ? formatStaffName(staffCurrent) : user.name;

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
    });

    setSavingProfile(false);

    if (err || !updated) {
      setProfileError(err?.message || 'Could not save profile.');
      return;
    }

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
                  {staffCurrent?.roleName && staffCurrent.roleName !== role ? (
                    <Badge
                      label={staffCurrent.roleName}
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

                {staffCurrent?.email ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Account: {staffCurrent.email}
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
                value={staffCurrent?.email || ''}
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

            {/* Official Doctor Stamp Specimen Preview */}
            <View style={styles.stampCard}>
              <View style={styles.stampHeaderRow}>
                <ThemedText variant="smallBold" color={theme.colors.primary}>
                  Official Doctor Stamp Live Specimen
                </ThemedText>
                <Badge label="Live Document Preview" variant="primary" size="sm" />
              </View>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                This official stamp specimen is automatically rendered on printed prescriptions, lab referral slips, and clinical summaries.
              </ThemedText>

              <View style={styles.stampBox}>
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

        {/* Section: Workstation Display & Text Size */}
        <Card>
          <CardHeader
            title="Workstation Display & Text Size"
            subtitle="Adjust typography scale to fit your tablet or desktop screen comfortably (down to 60%)"
          />
          <CardContent style={styles.cardSection}>
            {/* Fine adjustment stepper */}
            <View style={styles.stepperContainer}>
              <View style={styles.stepperInfo}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  FINE ADJUSTMENT (5% STEPS)
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Scale from 60% (Ultra Compact) to 130% (Extra Large)
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
                    style={[
                      styles.presetCard,
                      isSelected && styles.presetCardActive,
                    ]}
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
                      {isSelected ? (
                        <Badge label="Active" variant="primary" size="xs" />
                      ) : null}
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      {opt.description}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            {/* Live Typography Preview */}
            <View style={styles.previewBox}>
              <View style={styles.previewHeaderRow}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  LIVE TYPOGRAPHY PREVIEW
                </ThemedText>
                <Badge label={`${Math.round(scale * 100)}% Scale`} variant="neutral" size="xs" />
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
});
