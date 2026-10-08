import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
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
import { notify } from '../../utils/feedback';
import { clinicService, StaffMember, StaffRole, ResetStaffPasswordResult } from '../../services/clinicService';
import { Chip, FieldGroup } from './common';

interface StaffManagementTabProps {
  staff: StaffMember[];
  setStaff: React.Dispatch<React.SetStateAction<StaffMember[]>>;
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
  staffLoadError,
  showSkeletons,
  activeStaffCount,
  maxStaffSeats,
  onRefreshStaff,
  showAddModal,
  setShowAddModal,
  onStaffAdded,
}: StaffManagementTabProps) {
  // Add Staff Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [title, setTitle] = useState('');
  const [role, setRole] = useState<StaffRole>('Doctor');
  const [email, setEmail] = useState('');
  const [prc, setPrc] = useState('');
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

  const handleOpenAddModal = () => {
    setFirstName('');
    setLastName('');
    setTitle('');
    setRole('Doctor');
    setEmail('');
    setPrc('');
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

    const [created, err] = await clinicService.createStaff({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      title: title.trim() || undefined,
      role,
      email: email.trim() || undefined,
      prcLicenseNumber: prc.trim() || undefined,
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

  const handleDeactivate = async (staffMember: StaffMember) => {
    const [_, err] = await clinicService.deactivateStaff(staffMember.id);
    if (err) {
      notify.error(err.message || 'Could not deactivate staff member.');
      return;
    }
    setStaff((prev) =>
      prev.map((s) => (s.id === staffMember.id ? { ...s, isActive: !s.isActive } : s))
    );
    notify.success(
      `${staffMember.firstName} ${staffMember.lastName} ${staffMember.isActive ? 'deactivated' : 'reactivated'}.`
    );
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
                          s.specialty,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                    </View>

                    <View style={styles.staffActionsCol}>
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
                        onPress={() => handleDeactivate(s)}
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

        <View style={styles.formRow}>
          <Input
            containerStyle={styles.flexNarrow}
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Dr. / RN / Ms."
          />
          <FieldGroup label="Staff Category / Role">
            <View style={styles.chipRow}>
              {(['Doctor', 'Nurse', 'Receptionist', 'Cashier'] as const).map((r) => (
                <Chip key={r} label={r} active={role === r} onPress={() => setRole(r)} />
              ))}
            </View>
          </FieldGroup>
        </View>

        <View style={styles.formRow}>
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

        <Input
          label="PRC license number"
          required={role === 'Doctor'}
          value={prc}
          onChangeText={setPrc}
          placeholder="PRC license number (mandatory for doctors)"
        />

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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
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
    minWidth: 120,
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
});
