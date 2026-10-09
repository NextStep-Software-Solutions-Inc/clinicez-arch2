import React, { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { SkeletonList } from '../ui/Skeleton';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import { notify, Alert } from '../../utils/feedback';
import { clinicService, StaffMember, StaffRole, ResetStaffPasswordResult, ClinicRole } from '../../services/clinicService';
import { Chip, FieldGroup } from './common';

import {
  RoleOption,
  SYSTEM_ROLE_ORDER,
  inferStaffRole,
  FALLBACK_SYSTEM_ROLES,
} from '../../services/roleUtils';

interface StaffManagementTabProps {
  staff: StaffMember[];
  setStaff: React.Dispatch<React.SetStateAction<StaffMember[]>>;
  roles?: ClinicRole[];
  staffLoadError: string | null;
  showSkeletons: boolean;
  activeStaffCount: number;
  maxStaffSeats: number | null;
  onRefreshStaff: () => Promise<void>;
  showAddModal: boolean;
  setShowAddModal: (show: boolean) => void;
  onStaffAdded: () => Promise<void>;
}

export default function StaffManagementTab({
  staff,
  setStaff,
  roles = [],
  staffLoadError,
  showSkeletons,
  activeStaffCount,
  maxStaffSeats,
  onRefreshStaff,
  showAddModal,
  setShowAddModal,
  onStaffAdded,
}: StaffManagementTabProps) {
  // Derived role lists: System standard roles + Clinic custom roles defined by admin
  const rawSystemRoles = (roles || []).filter((r) => r.isSystem);
  const systemRoleOptions: RoleOption[] =
    rawSystemRoles.length > 0
      ? rawSystemRoles
          .map((r) => ({
            id: r.id,
            name: r.name,
            displayName: r.name,
            isSystem: true,
            staffRole: inferStaffRole(r),
            description: r.description,
          }))
          .sort((a, b) => SYSTEM_ROLE_ORDER.indexOf(a.staffRole) - SYSTEM_ROLE_ORDER.indexOf(b.staffRole))
      : FALLBACK_SYSTEM_ROLES;

  const customRoleOptions: RoleOption[] = (roles || [])
    .filter((r) => !r.isSystem)
    .map((r) => ({
      id: r.id,
      name: r.name,
      displayName: `${r.name} (Custom)`,
      isSystem: false,
      staffRole: inferStaffRole(r),
      description: r.description,
    }));

  const allRoleOptions = [...systemRoleOptions, ...customRoleOptions];

  // Add Staff Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [title, setTitle] = useState('');
  const [role, setRole] = useState<StaffRole>('Doctor');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [email, setEmail] = useState('');
  const [prc, setPrc] = useState('');
  const [ptr, setPtr] = useState('');
  const [s2, setS2] = useState('');
  const [stampModalStaff, setStampModalStaff] = useState<StaffMember | null>(null);
  const [specialty, setSpecialty] = useState('');
  const [provisionLogin, setProvisionLogin] = useState(true);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Success Credentials Modal State
  const [credentialsModal, setCredentialsModal] = useState<{
    visible: boolean;
    name: string;
    email: string;
    role: string;
    temporaryPassword: string;
  } | null>(null);

  // Password Reset Modal State
  const [resetModalStaff, setResetModalStaff] = useState<StaffMember | null>(null);
  const [customResetPassword, setCustomResetPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let res = 'Clinic#';
    for (let i = 0; i < 6; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  const selectedRoleOption =
    allRoleOptions.find((r) => r.id === selectedRoleId) ||
    systemRoleOptions[0] ||
    FALLBACK_SYSTEM_ROLES[0];

  const handleSelectRole = (r: RoleOption) => {
    setSelectedRoleId(r.id);
    setRole(r.staffRole);
    if (r.staffRole === 'Doctor') {
      if (!title || title === 'RN' || title === 'Ms.' || title === 'Mr.') setTitle('Dr.');
    } else if (r.staffRole === 'Nurse') {
      if (!title || title === 'Dr.') setTitle('RN');
    } else if (title === 'Dr.' || title === 'RN') {
      setTitle('');
    }
  };

  const handleOpenAddModal = () => {
    setFirstName('');
    setLastName('');
    setTitle('Dr.');
    const defaultDoctor =
      systemRoleOptions.find((r) => r.staffRole === 'Doctor') ||
      systemRoleOptions[0] ||
      FALLBACK_SYSTEM_ROLES[0];
    setSelectedRoleId(defaultDoctor.id);
    setRole(defaultDoctor.staffRole);
    setEmail('');
    setPrc('');
    setPtr('');
    setS2('');
    setSpecialty('');
    setProvisionLogin(true);
    setTemporaryPassword(generateRandomPassword());
    setAddError(null);
    setShowAddModal(true);
  };

  const handleCreateStaff = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setAddError('First and last name are required.');
      return;
    }

    if (role === 'Doctor' && !prc.trim()) {
      setAddError('PRC License Number is mandatory for Doctors.');
      return;
    }

    if (provisionLogin) {
      if (!email.trim()) {
        setAddError('A valid email address is required when provisioning login credentials.');
        return;
      }
      if (!temporaryPassword || temporaryPassword.length < 8) {
        setAddError('Temporary password must be at least 8 characters.');
        return;
      }
    }

    setAddingStaff(true);
    setAddError(null);

    const effectiveRoleId = selectedRoleId || selectedRoleOption.id;
    const clinicRoleId = effectiveRoleId.startsWith('sys-') ? undefined : effectiveRoleId;

    const [created, err] = await clinicService.createStaff({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      title: title.trim() || undefined,
      role,
      clinicRoleId: clinicRoleId || undefined,
      email: email.trim() || undefined,
      prcLicenseNumber: role === 'Doctor' ? prc.trim() : undefined,
      ptrNumber: role === 'Doctor' ? ptr.trim() || undefined : undefined,
      s2LicenseNumber: role === 'Doctor' ? s2.trim() || undefined : undefined,
      specialty: specialty.trim() || undefined,
      initialPassword: provisionLogin ? temporaryPassword : undefined,
      sendInviteEmail: false,
    });

    setAddingStaff(false);

    if (err || !created) {
      setAddError(err?.message || 'Failed to create staff member. Check facility seat limits.');
      return;
    }

    setStaff((prev) => [...prev, created]);
    setShowAddModal(false);
    await onStaffAdded();

    if (provisionLogin && temporaryPassword) {
      setCredentialsModal({
        visible: true,
        name: `${created.firstName} ${created.lastName}`.trim(),
        email: created.email || email.trim(),
        role: created.roleName || created.role,
        temporaryPassword,
      });
    } else {
      notify.success(`Staff member ${created.firstName} ${created.lastName} added.`);
    }
  };

  const handleResetPassword = async () => {
    if (!resetModalStaff) return;
    setResettingPassword(true);
    setResetError(null);

    const [result, err] = await clinicService.resetStaffPassword(
      resetModalStaff.id,
      customResetPassword.trim() || undefined
    );

    setResettingPassword(false);

    if (err || !result) {
      setResetError(err?.message || 'Could not reset staff password.');
      return;
    }

    const targetStaff = resetModalStaff;
    setResetModalStaff(null);
    setCustomResetPassword('');

    // Update local state
    setStaff((prev) =>
      prev.map((s) => (s.id === targetStaff.id ? { ...s, hasCredentials: true, mustChangePassword: true } : s))
    );

    // Show credentials modal with the generated temporary password
    setCredentialsModal({
      visible: true,
      name: result.staffName,
      email: result.email,
      role: targetStaff.roleName || targetStaff.role,
      temporaryPassword: result.temporaryPassword,
    });
  };

  const handleToggleActive = (staffMember: StaffMember) => {
    if (staffMember.isActive) {
      Alert.alert(
        'Deactivate Staff Member',
        `Are you sure you want to deactivate ${staffMember.firstName} ${staffMember.lastName}? They will no longer be able to log in or access the workstation.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Deactivate',
            style: 'destructive',
            onPress: async () => {
              const [_, err] = await clinicService.deactivateStaff(staffMember.id);
              if (err) {
                notify.error(err.message || 'Could not deactivate staff member.');
                return;
              }
              setStaff((prev) =>
                prev.map((s) => (s.id === staffMember.id ? { ...s, isActive: false } : s))
              );
              notify.success(`${staffMember.firstName} ${staffMember.lastName} deactivated.`);
            },
          },
        ]
      );
    } else {
      (async () => {
        const [result, err] = await clinicService.activateStaff(staffMember.id);
        if (err) {
          notify.error(err.message || 'Could not activate staff member.');
          return;
        }
        setStaff((prev) =>
          prev.map((s) => (s.id === staffMember.id ? { ...s, isActive: true } : s))
        );
        notify.success(`${staffMember.firstName} ${staffMember.lastName} reactivated.`);
      })();
    }
  };

  const copyToClipboard = async (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      notify.success('Login credentials copied to clipboard!');
    } else {
      notify.info('Select and copy the credentials from the screen.');
    }
  };

  return (
    <View style={styles.container}>
      <Card>
        <CardHeader
          title="Staff Directory & Roster"
          subtitle={
            maxStaffSeats != null
              ? `Operational seats: ${activeStaffCount} of ${maxStaffSeats} currently assigned`
              : `Active staff members: ${activeStaffCount}`
          }
          rightAction={
            <Button
              title="Add staff member"
              icon="plus"
              onPress={handleOpenAddModal}
              disabled={maxStaffSeats != null && activeStaffCount >= maxStaffSeats}
            />
          }
        />
        <CardContent>
          {showSkeletons ? (
            <SkeletonList rows={3} />
          ) : staffLoadError ? (
            <ErrorState compact title="Could not load staff roster" message={staffLoadError} onRetry={onRefreshStaff} />
          ) : staff.length === 0 ? (
            <EmptyState
              icon="staff"
              title="No staff members registered"
              description="Add doctors, nurses, receptionists and cashiers so they can log in to the workstation."
              actionTitle="Add first staff member"
              onAction={handleOpenAddModal}
            />
          ) : (
            <View style={styles.staffList}>
              {staff.map((s) => {
                const fullName = `${s.title ? `${s.title} ` : ''}${s.firstName} ${s.lastName}`.trim();

                return (
                  <View key={s.id} style={styles.staffItem}>
                    <View style={styles.staffIdentityCol}>
                      <View style={styles.staffNameRow}>
                        <ThemedText variant="bodyBold">{fullName}</ThemedText>
                        <Badge label={s.role} variant={s.role === 'Doctor' ? 'primary' : 'neutral'} size="sm" />
                        {s.roleName && s.roleName !== s.role ? (
                          <Badge label={s.roleName} variant="purple" size="sm" />
                        ) : null}
                        {!s.isActive ? (
                          <Badge label="Inactive" variant="emergency" size="sm" />
                        ) : s.hasCredentials ? (
                          s.mustChangePassword ? (
                            <Badge label="Password Reset Pending" variant="warning" size="sm" />
                          ) : (
                            <Badge label="Login Active" variant="success" size="sm" />
                          )
                        ) : (
                          <Badge label="No Login" variant="neutral" size="sm" />
                        )}
                      </View>

                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {[
                          s.roleName,
                          s.email ? s.email : 'No email',
                          s.prcLicenseNumber ? `PRC ${s.prcLicenseNumber}` : null,
                          s.ptrNumber ? `PTR ${s.ptrNumber}` : null,
                          s.s2LicenseNumber ? `S2 ${s.s2LicenseNumber}` : null,
                          s.specialty,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                    </View>

                    <View style={styles.staffActionsCol}>
                      {s.role === 'Doctor' ? (
                        <Button
                          title="View Stamp"
                          variant="outline"
                          size="sm"
                          onPress={() => setStampModalStaff(s)}
                        />
                      ) : null}
                      <Button
                        title="Reset Password"
                        icon="key"
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                          setResetModalStaff(s);
                          setCustomResetPassword(generateRandomPassword());
                          setResetError(null);
                        }}
                      />
                      <Button
                        title={s.isActive ? 'Deactivate' : 'Activate'}
                        variant="ghost"
                        size="sm"
                        onPress={() => handleToggleActive(s)}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </CardContent>
      </Card>

      {/* Add Staff Modal */}
      <Modal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add staff member"
        subtitle={
          maxStaffSeats != null ? `Seats in use: ${activeStaffCount} of ${maxStaffSeats}` : `Active staff: ${activeStaffCount}`
        }
        maxWidth={540}
        footer={
          <View style={styles.modalFooter}>
            <Button title="Cancel" variant="ghost" onPress={() => setShowAddModal(false)} disabled={addingStaff} />
            <Button title="Create & Provision" onPress={handleCreateStaff} loading={addingStaff} />
          </View>
        }
      >
        {addError ? (
          <View style={styles.errorBox}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
              {addError}
            </ThemedText>
          </View>
        ) : null}

        {/* Single unified Role Selection: System standard roles + Clinic custom roles */}
        <View style={styles.roleSelectionGroup}>
          <FieldGroup label="Staff Role *">
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Select the system standard role or a clinic custom role.
            </ThemedText>

            {/* System Standard Roles */}
            <View style={styles.roleSubgroup}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                System Standard Roles
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled
                contentContainerStyle={styles.chipScrollRow}
              >
                {systemRoleOptions.map((r) => (
                  <Chip
                    key={r.id}
                    label={r.displayName}
                    active={selectedRoleOption.id === r.id}
                    onPress={() => handleSelectRole(r)}
                  />
                ))}
              </ScrollView>
            </View>

            {/* Clinic Custom Roles */}
            {customRoleOptions.length > 0 ? (
              <View style={styles.roleSubgroup}>
                <View style={styles.customRoleHeader}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Clinic Custom Roles
                  </ThemedText>
                  <Badge label={`${customRoleOptions.length} Custom`} variant="purple" size="sm" />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  nestedScrollEnabled
                  contentContainerStyle={styles.chipScrollRow}
                >
                  {customRoleOptions.map((r) => (
                    <Chip
                      key={r.id}
                      label={r.displayName}
                      active={selectedRoleOption.id === r.id}
                      onPress={() => handleSelectRole(r)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Selected Role Description Banner */}
            {selectedRoleOption.description ? (
              <View style={styles.roleDescriptionBox}>
                <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.flex1}>
                  {selectedRoleOption.description}
                </ThemedText>
              </View>
            ) : null}

            {/* Clinical category override for custom roles only */}
            {!selectedRoleOption.isSystem ? (
              <View style={styles.customCategoryRow}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Clinical category:
                </ThemedText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  nestedScrollEnabled
                  contentContainerStyle={styles.categoryChips}
                >
                  {(['Doctor', 'Nurse', 'Receptionist', 'Cashier', 'Admin'] as const).map((cat) => (
                    <Pressable
                      key={cat}
                      onPress={() => {
                        setRole(cat);
                        if (cat === 'Doctor' && !title) setTitle('Dr.');
                        if (cat === 'Nurse' && (!title || title === 'Dr.')) setTitle('RN');
                      }}
                      style={[
                        styles.miniChip,
                        role === cat && styles.miniChipActive,
                      ]}
                    >
                      <ThemedText
                        variant="captionBold"
                        color={role === cat ? theme.colors.primary : theme.colors.textMuted}
                      >
                        {cat}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </FieldGroup>
        </View>

        <View style={styles.formRow}>
          <Input
            containerStyle={styles.flexNarrow}
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Dr. / RN / Ms."
          />
          <Input
            containerStyle={styles.flexWide}
            label="First name"
            required
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
          />
          <Input
            containerStyle={styles.flexWide}
            label="Last name"
            required
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
          />
        </View>

        {role === 'Doctor' ? (
          <>
            <Input
              label="PRC license number"
              required
              value={prc}
              onChangeText={setPrc}
              placeholder="e.g. 0108924 (Mandatory for doctors)"
            />
            <View style={styles.formRow}>
              <Input
                containerStyle={styles.flexWide}
                label="Professional Tax Receipt (PTR)"
                value={ptr}
                onChangeText={setPtr}
                placeholder="e.g. PTR No. 8941203 / Taguig City"
              />
              <Input
                containerStyle={styles.flexWide}
                label="PDEA S2 dangerous drug license"
                value={s2}
                onChangeText={setS2}
                placeholder="e.g. S2 No. 0918-99214-A1 (Optional)"
              />
            </View>

            {/* Official Doctor Stamp Live Specimen */}
            <View style={styles.stampPreviewCard}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Official Doctor Stamp Live Preview
              </ThemedText>
              <View style={styles.stampBox}>
                <ThemedText variant="smallBold" color={theme.colors.primary} style={styles.stampName}>
                  {`${title ? `${title} ` : 'DR. '}${firstName || 'First'} ${lastName || 'Last'}`.toUpperCase()}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  {specialty || 'General / Primary Care Medicine'}
                </ThemedText>
                <View style={styles.stampDivider} />
                <ThemedText variant="caption" color={theme.colors.text}>
                  {prc ? `PRC No. ${prc}` : 'PRC No. [Required for Prescriptions]'}
                </ThemedText>
                {ptr ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {ptr}
                  </ThemedText>
                ) : null}
                {s2 ? (
                  <ThemedText variant="captionBold" color={theme.colors.emergency}>
                    {s2}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          </>
        ) : null}

        <Input
          label="Specialty or clinical designation"
          value={specialty}
          onChangeText={setSpecialty}
          placeholder="e.g. Pediatrics, Triage Nursing, Billing Officer"
        />

        {/* Credentials provisioning section */}
        <View style={styles.credentialSection}>
          <View style={styles.credentialHeaderRow}>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              Workstation Login Account
            </ThemedText>
            <Pressable
              onPress={() => setProvisionLogin((p) => !p)}
              style={styles.toggleBtn}
            >
              <ThemedText variant="captionBold" color={theme.colors.primary}>
                {provisionLogin ? 'Disable Login' : 'Enable Login'}
              </ThemedText>
            </Pressable>
          </View>

          {provisionLogin ? (
            <>
              <Input
                label="Sign-in email address"
                required
                value={email}
                onChangeText={setEmail}
                placeholder="doctor@clinic.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={styles.passwordRow}>
                <Input
                  containerStyle={styles.flex1}
                  label="Temporary password"
                  required
                  value={temporaryPassword}
                  onChangeText={setTemporaryPassword}
                  placeholder="Temporary password"
                  autoCapitalize="none"
                  helperText="Employee will be prompted to change this password on first login."
                />
                <Button
                  title="Generate"
                  variant="outline"
                  size="sm"
                  onPress={() => setTemporaryPassword(generateRandomPassword())}
                  style={styles.generateBtn}
                />
              </View>
            </>
          ) : (
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              This staff member will exist on the roster but will not be able to log in to the workstation.
            </ThemedText>
          )}
        </View>
      </Modal>

      {/* Password Reset Modal */}
      {resetModalStaff ? (
        <Modal
          visible
          onClose={() => setResetModalStaff(null)}
          title="Reset staff password"
          subtitle={`Assign temporary password for ${resetModalStaff.firstName} ${resetModalStaff.lastName}`}
          maxWidth={460}
          footer={
            <View style={styles.modalFooter}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setResetModalStaff(null)}
                disabled={resettingPassword}
              />
              <Button
                title="Confirm Reset"
                onPress={handleResetPassword}
                loading={resettingPassword}
              />
            </View>
          }
        >
          {resetError ? (
            <View style={styles.errorBox}>
              <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
              <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
                {resetError}
              </ThemedText>
            </View>
          ) : null}

          <ThemedText variant="small" color={theme.colors.textSecondary}>
            Login Email: <ThemedText variant="smallBold">{resetModalStaff.email || 'None (email required)'}</ThemedText>
          </ThemedText>

          <View style={styles.passwordRow}>
            <Input
              containerStyle={styles.flex1}
              label="New temporary password"
              value={customResetPassword}
              onChangeText={setCustomResetPassword}
              autoCapitalize="none"
              helperText="Staff member must change password upon next login."
            />
            <Button
              title="Generate"
              variant="outline"
              size="sm"
              onPress={() => setCustomResetPassword(generateRandomPassword())}
              style={styles.generateBtn}
            />
          </View>
        </Modal>
      ) : null}

      {/* Newly Provisioned Credentials Modal */}
      {credentialsModal?.visible ? (
        <Modal
          visible
          onClose={() => setCredentialsModal(null)}
          title="Login Credentials Generated"
          subtitle="Share these initial credentials with the staff member."
          maxWidth={460}
          footer={
            <View style={styles.modalFooter}>
              <Button
                title="Done"
                variant="primary"
                onPress={() => setCredentialsModal(null)}
              />
            </View>
          }
        >
          <View style={styles.credSummaryCard}>
            <View style={styles.credRow}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>Staff Member</ThemedText>
              <ThemedText variant="bodyBold">{credentialsModal.name}</ThemedText>
            </View>
            <View style={styles.credRow}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>Role</ThemedText>
              <ThemedText variant="bodyBold">{credentialsModal.role}</ThemedText>
            </View>
            <View style={styles.credRow}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>Sign-in Email</ThemedText>
              <ThemedText variant="bodyBold">{credentialsModal.email}</ThemedText>
            </View>
            <View style={styles.credRow}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>Temporary Password</ThemedText>
              <ThemedText variant="title" color={theme.colors.primary}>{credentialsModal.temporaryPassword}</ThemedText>
            </View>
          </View>

          <Button
            title="Copy Login Credentials"
            icon="copy"
            variant="outline"
            onPress={() =>
              copyToClipboard(
                `Clinic EZ Login\nName: ${credentialsModal.name}\nEmail: ${credentialsModal.email}\nTemporary Password: ${credentialsModal.temporaryPassword}\n\nPlease change your password upon initial login.`
              )
            }
          />
        </Modal>
      ) : null}

      {/* Doctor Stamp Preview Modal */}
      {stampModalStaff ? (
        <Modal
          visible
          onClose={() => setStampModalStaff(null)}
          title="Physician Stamp & Credentials"
          subtitle={`Official Philippine medical stamp for ${stampModalStaff.firstName} ${stampModalStaff.lastName}`}
          maxWidth={460}
          footer={
            <View style={styles.modalFooter}>
              <Button title="Close" variant="ghost" onPress={() => setStampModalStaff(null)} />
            </View>
          }
        >
          <View style={styles.stampModalContent}>
            <View style={styles.stampBoxLarge}>
              <ThemedText variant="bodyBold" color={theme.colors.primary} style={styles.stampNameLarge}>
                {`${stampModalStaff.title ? `${stampModalStaff.title} ` : 'DR. '}${stampModalStaff.firstName} ${stampModalStaff.lastName}`.toUpperCase()}
              </ThemedText>
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                {stampModalStaff.specialty || 'General / Outpatient Medicine'}
              </ThemedText>
              <View style={styles.stampDivider} />
              <ThemedText variant="smallBold" color={theme.colors.text}>
                {stampModalStaff.prcLicenseNumber ? `PRC No. ${stampModalStaff.prcLicenseNumber}` : 'PRC: Not configured'}
              </ThemedText>
              {stampModalStaff.ptrNumber ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {stampModalStaff.ptrNumber}
                </ThemedText>
              ) : null}
              {stampModalStaff.s2LicenseNumber ? (
                <ThemedText variant="captionBold" color={theme.colors.emergency}>
                  {stampModalStaff.s2LicenseNumber}
                </ThemedText>
              ) : null}
            </View>

            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.stampNotice}>
              This official statutory stamp is applied to digital consultation slips, e-prescriptions, laboratory orders, and official medical certificates.
            </ThemedText>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  staffList: {
    gap: theme.spacing.sm,
  },
  staffItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  staffIdentityCol: {
    flex: 1,
    minWidth: 260,
    gap: 4,
  },
  staffNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  staffActionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  formRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  roleSelectionGroup: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  roleSubgroup: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  customRoleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  roleDescriptionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    marginTop: theme.spacing.xs,
  },
  customCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  categoryChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  miniChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
    flexShrink: 0,
  },
  miniChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipScrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  flex1: {
    flex: 1,
  },
  flexWide: {
    flex: 2,
    minWidth: 180,
  },
  flexNarrow: {
    flex: 1,
    minWidth: 100,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.emergencySubtle,
    borderRadius: theme.radii.md,
    marginBottom: theme.spacing.md,
  },
  credentialSection: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  credentialHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  generateBtn: {
    marginBottom: 20,
  },
  credSummaryCard: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  credRow: {
    gap: 2,
  },
  stampPreviewCard: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  stampBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.primary,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  stampBoxLarge: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    gap: 4,
    width: '100%',
  },
  stampName: {
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  stampNameLarge: {
    textAlign: 'center',
    letterSpacing: 1,
  },
  stampDivider: {
    width: '80%',
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  stampModalContent: {
    gap: theme.spacing.md,
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  stampNotice: {
    textAlign: 'center',
    paddingHorizontal: theme.spacing.md,
  },
});
