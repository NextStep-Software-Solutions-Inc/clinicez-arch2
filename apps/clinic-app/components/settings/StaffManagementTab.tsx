import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { SkeletonList } from '../ui/Skeleton';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Icon, { IconName } from '../ui/Icon';
import ActionMenu from '../ui/ActionMenu';
import SegmentedControl from '../ui/SegmentedControl';
import SignatureSpecimenModal from './SignatureSpecimenModal';
import { theme } from '../../constants/theme';
import { notify, Alert } from '../../utils/feedback';
import {
  clinicService,
  StaffMember,
  StaffRole,
  ResetStaffPasswordResult,
  ClinicRole,
  SignatureMode,
} from '../../services/clinicService';
import { Chip, FieldGroup } from './common';

import {
  RoleOption,
  SYSTEM_ROLE_ORDER,
  inferStaffRole,
  FALLBACK_SYSTEM_ROLES,
  isSelfStaffMember,
  canModifyStaffRole,
} from '../../services/roleUtils';
import { useAuth } from '../../context/AuthContext';
import { useStaff } from '../../context/StaffContext';
import { useClinic } from '../../context/ClinicContext';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { DoctorRosterCalendarModal } from '../roster/DoctorRosterCalendarModal';
import { resolveStaffBadge, getAvailableStaffActions } from '../../utils/staffStatus';
import { buildStaffCreationPayload } from '../../utils/staffManagement';

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
  const { isCompact } = useBreakpoint();
  const { user } = useAuth();
  const { current: currentStaff, reload: refreshGlobalStaff } = useStaff();
  const { rooms = [], refreshRooms } = useClinic();

  const isSelf = (target: StaffMember | null | undefined): boolean =>
    isSelfStaffMember(target, user) || isSelfStaffMember(target, currentStaff);

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
  const [pan, setPan] = useState('');
  const [stampModalStaff, setStampModalStaff] = useState<StaffMember | null>(null);
  const [specialty, setSpecialty] = useState('');
  const [assignedRoomIds, setAssignedRoomIds] = useState<string[]>([]);
  const [inviteDeliveryMode, setInviteDeliveryMode] = useState<'email' | 'link' | 'password' | 'none'>('email');
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

  // Success Invite Modal State
  const [inviteModal, setInviteModal] = useState<{
    visible: boolean;
    name: string;
    email?: string;
    role: string;
    inviteUrl: string;
    sentEmail: boolean;
    isPasswordReset?: boolean;
  } | null>(null);

  // Password Reset Modal State
  const [resetModalStaff, setResetModalStaff] = useState<StaffMember | null>(null);
  const [resetDeliveryMode, setResetDeliveryMode] = useState<'email' | 'link' | 'password'>('email');
  const [customResetPassword, setCustomResetPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Edit Staff Modal State
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [middleName, setMiddleName] = useState('');
  const [phone, setPhone] = useState('');
  const [isActiveStaff, setIsActiveStaff] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [signatureSpecimen, setSignatureSpecimen] = useState<string | null>(null);
  const [defaultSignatureMode, setDefaultSignatureMode] = useState<SignatureMode>('ESignatureSpecimen');
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  const isEditingSelf = isSelf(editingStaff);
  const isSystemAdminStaff = (s?: StaffMember | null) => {
    if (!s || !s.isActive) return false;
    return s.role === 'Admin' || s.roleName === 'Clinic Administrator';
  };
  const activeSystemAdmins = (staff || []).filter(isSystemAdminStaff);
  const isSoleActiveAdmin = Boolean(
    editingStaff &&
      isSystemAdminStaff(editingStaff) &&
      activeSystemAdmins.length <= 1
  );

  // Doctor Roster Calendar Modal State
  const [rosterModalVisible, setRosterModalVisible] = useState(false);
  const [rosterDoctorId, setRosterDoctorId] = useState<string | undefined>(undefined);
  const doctors = (staff || []).filter((s) => s.role === 'Doctor' && s.isActive);

  // Sort active rooms so Doctor sees Consultation rooms first and Nurse sees Triage/Treatment first
  const activeRoomsForRole = React.useMemo(() => {
    const active = (rooms || []).filter((r) => r.isActive);
    return [...active].sort((a, b) => {
      if (role === 'Doctor') {
        const aScore = a.type === 'Consultation' ? 0 : 1;
        const bScore = b.type === 'Consultation' ? 0 : 1;
        if (aScore !== bScore) return aScore - bScore;
      } else if (role === 'Nurse') {
        const aScore = a.type === 'Treatment' || a.type === 'Triage' ? 0 : 1;
        const bScore = b.type === 'Treatment' || b.type === 'Triage' ? 0 : 1;
        if (aScore !== bScore) return aScore - bScore;
      }
      return a.displayOrder - b.displayOrder;
    });
  }, [rooms, role]);

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
    if (editingStaff && (!canModifyStaffRole(editingStaff, user) || !canModifyStaffRole(editingStaff, currentStaff))) {
      return;
    }
    if (isSoleActiveAdmin && r.name !== 'Clinic Administrator') {
      notify.error('Cannot change the role of the only active Clinic Administrator.');
      return;
    }
    setSelectedRoleId(r.id);
    setRole(r.staffRole);
    if (r.staffRole !== 'Doctor' && r.staffRole !== 'Nurse') {
      setAssignedRoomIds([]);
    }
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
    setMiddleName('');
    setTitle('Dr.');
    const defaultDoctor =
      systemRoleOptions.find((r) => r.staffRole === 'Doctor') ||
      systemRoleOptions[0] ||
      FALLBACK_SYSTEM_ROLES[0];
    setSelectedRoleId(defaultDoctor.id);
    setRole(defaultDoctor.staffRole);
    setEmail('');
    setPhone('');
    setPrc('');
    setPtr('');
    setS2('');
    setPan('');
    setSpecialty('');
    setAssignedRoomIds([]);
    setInviteDeliveryMode('email');
    setTemporaryPassword(generateRandomPassword());
    setSignatureSpecimen(null);
    setDefaultSignatureMode('ESignatureSpecimen');
    setAddError(null);
    setShowAddModal(true);
  };

  useEffect(() => {
    if (showAddModal && !temporaryPassword) {
      setTitle((prev) => prev || 'Dr.');
      const defaultDoctor =
        systemRoleOptions.find((r) => r.staffRole === 'Doctor') ||
        systemRoleOptions[0] ||
        FALLBACK_SYSTEM_ROLES[0];
      if (!selectedRoleId) {
        setSelectedRoleId(defaultDoctor.id);
        setRole(defaultDoctor.staffRole);
      }
      setTemporaryPassword(generateRandomPassword());
      setAddError(null);
    }
  }, [showAddModal, temporaryPassword, selectedRoleId, systemRoleOptions]);

  const handleOpenEditModal = (s: StaffMember) => {
    setEditingStaff(s);
    setFirstName(s.firstName || '');
    setLastName(s.lastName || '');
    setMiddleName(s.middleName || '');
    setTitle(s.title || '');
    setEmail(s.email || '');
    setPhone(s.phoneNumber || '');
    setPrc(s.prcLicenseNumber || '');
    setPtr(s.ptrNumber || '');
    setS2(s.s2LicenseNumber || '');
    setPan(s.philHealthPan || '');
    setSpecialty(s.specialty || '');
    setSignatureSpecimen(s.signatureSpecimen || null);
    setDefaultSignatureMode(s.defaultSignatureMode || 'ESignatureSpecimen');
    setAssignedRoomIds(s.assignedRoomIds ?? (s.assignedRoomId ? [s.assignedRoomId] : []));
    setRole(s.role);
    setIsActiveStaff(s.isActive);

    const matchingRole =
      (s.clinicRoleId ? allRoleOptions.find((r) => r.id === s.clinicRoleId) : null) ||
      systemRoleOptions.find((r) => r.staffRole === s.role) ||
      systemRoleOptions[0];

    if (matchingRole) {
      setSelectedRoleId(matchingRole.id);
    }
    setEditError(null);
  };

  const handleSaveEditStaff = async () => {
    if (!editingStaff) return;

    if (!firstName.trim() || !lastName.trim()) {
      setEditError('First and last name are required.');
      return;
    }

    const effectiveStaffRole: StaffRole = isEditingSelf ? editingStaff.role : role;

    if (isEditingSelf && role !== editingStaff.role) {
      setEditError('You cannot change or downgrade your own clinic role.');
      return;
    }

    if (isSoleActiveAdmin) {
      if (selectedRoleOption.name !== 'Clinic Administrator') {
        setEditError('Cannot change the role of the only active Clinic Administrator.');
        return;
      }
      if (!isActiveStaff) {
        setEditError('Cannot deactivate the only active Clinic Administrator.');
        return;
      }
    }

    if (effectiveStaffRole === 'Doctor' && !prc.trim()) {
      setEditError('PRC License Number is mandatory for Doctors.');
      return;
    }

    setSavingEdit(true);
    setEditError(null);

    const effectiveRoleId = selectedRoleId || selectedRoleOption.id;
    const resolvedClinicRoleId = effectiveRoleId.startsWith('sys-') ? undefined : effectiveRoleId;
    const clinicRoleId = isEditingSelf ? editingStaff.clinicRoleId : resolvedClinicRoleId;

    const canHaveRoom = effectiveStaffRole === 'Doctor' || effectiveStaffRole === 'Nurse';
    const nextRoomIds = canHaveRoom ? assignedRoomIds : [];

    const [updated, err] = await clinicService.updateStaff(editingStaff.id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      middleName: middleName.trim() || undefined,
      title: title.trim() || undefined,
      role: effectiveStaffRole,
      clinicRoleId: clinicRoleId || undefined,
      email: email.trim() || undefined,
      phoneNumber: phone.trim() || undefined,
      prcLicenseNumber: effectiveStaffRole === 'Doctor' ? prc.trim() : undefined,
      ptrNumber: effectiveStaffRole === 'Doctor' ? ptr.trim() || undefined : undefined,
      s2LicenseNumber: effectiveStaffRole === 'Doctor' ? s2.trim() || undefined : undefined,
      philHealthPan: effectiveStaffRole === 'Doctor' ? pan.trim() || undefined : undefined,
      specialty: specialty.trim() || undefined,
      assignedRoomIds: nextRoomIds,
      isActive: isEditingSelf ? editingStaff.isActive : isActiveStaff,
      signatureSpecimen: effectiveStaffRole === 'Doctor' ? signatureSpecimen : undefined,
      defaultSignatureMode: effectiveStaffRole === 'Doctor' ? defaultSignatureMode : undefined,
    });

    setSavingEdit(false);

    if (err || !updated) {
      setEditError(err?.message || 'Failed to update staff member.');
      return;
    }

    setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditingStaff(null);
    notify.success(`Staff member ${updated.firstName} ${updated.lastName} updated.`);
    await Promise.all([onRefreshStaff(), refreshRooms(), refreshGlobalStaff()]);
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

    let deliveryPayload: ReturnType<typeof buildStaffCreationPayload>;
    try {
      deliveryPayload = buildStaffCreationPayload(inviteDeliveryMode, email, temporaryPassword);
    } catch (err: any) {
      setAddError(err.message || 'Invalid staff invitation settings.');
      return;
    }

    setAddingStaff(true);
    setAddError(null);

    const effectiveRoleId = selectedRoleId || selectedRoleOption.id;
    const clinicRoleId = effectiveRoleId.startsWith('sys-') ? undefined : effectiveRoleId;
    const canHaveRoom = role === 'Doctor' || role === 'Nurse';

    const [created, err] = await clinicService.createStaff({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      middleName: middleName.trim() || undefined,
      title: title.trim() || undefined,
      role,
      clinicRoleId: clinicRoleId || undefined,
      email: deliveryPayload.email,
      phoneNumber: phone.trim() || undefined,
      prcLicenseNumber: role === 'Doctor' ? prc.trim() : undefined,
      ptrNumber: role === 'Doctor' ? ptr.trim() || undefined : undefined,
      s2LicenseNumber: role === 'Doctor' ? s2.trim() || undefined : undefined,
      philHealthPan: role === 'Doctor' ? pan.trim() || undefined : undefined,
      specialty: specialty.trim() || undefined,
      signatureSpecimen: role === 'Doctor' ? signatureSpecimen : undefined,
      defaultSignatureMode: role === 'Doctor' ? defaultSignatureMode : undefined,
      assignedRoomIds: canHaveRoom && assignedRoomIds.length > 0 ? assignedRoomIds : undefined,
      initialPassword: deliveryPayload.initialPassword,
      sendInviteEmail: deliveryPayload.sendInviteEmail,
    });

    setAddingStaff(false);

    if (err || !created) {
      setAddError(err?.message || 'Failed to create staff member. Check facility seat limits.');
      return;
    }

    setStaff((prev) => [...prev, created]);
    setShowAddModal(false);
    await Promise.all([onStaffAdded(), refreshRooms(), refreshGlobalStaff()]);

    if (inviteDeliveryMode === 'email' || inviteDeliveryMode === 'link') {
      const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
      const inviteUrl =
        created.inviteUrl ||
        (created.invitationToken
          ? (origin ? `${origin}/invitations/${created.invitationToken}` : `/invitations/${created.invitationToken}`)
          : '');

      setInviteModal({
        visible: true,
        name: `${created.firstName} ${created.lastName}`.trim(),
        email: created.email || email.trim(),
        role: created.roleName || created.role,
        inviteUrl,
        sentEmail: inviteDeliveryMode === 'email',
      });
    } else if (inviteDeliveryMode === 'password' && temporaryPassword) {
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

    const isLinkReset = resetDeliveryMode === 'email' || resetDeliveryMode === 'link';
    const [result, err] = await clinicService.resetStaffPassword(
      resetModalStaff.id,
      isLinkReset ? undefined : customResetPassword.trim() || undefined,
      {
        sendResetEmail: resetDeliveryMode === 'email',
        generateResetLink: isLinkReset,
      }
    );

    setResettingPassword(false);

    if (err || !result) {
      setResetError(err?.message || 'Could not reset staff password.');
      return;
    }

    const targetStaff = resetModalStaff;
    setResetModalStaff(null);
    setCustomResetPassword('');

    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    const resetUrl =
      result.resetUrl ||
      (result.resetToken
        ? origin
          ? `${origin}/invitations/${result.resetToken}`
          : `/invitations/${result.resetToken}`
        : '');

    // Update local state
    setStaff((prev) =>
      prev.map((s) =>
        s.id === targetStaff.id
          ? {
              ...s,
              hasCredentials: true,
              mustChangePassword: true,
              invitationToken: result.resetToken ?? s.invitationToken,
              inviteUrl: resetUrl || s.inviteUrl,
            }
          : s
      )
    );

    if (isLinkReset) {
      setInviteModal({
        visible: true,
        name: result.staffName,
        email: result.email,
        role: targetStaff.roleName || targetStaff.role,
        inviteUrl: resetUrl,
        sentEmail: resetDeliveryMode === 'email',
        isPasswordReset: true,
      });
    } else {
      // Show credentials modal with the generated temporary password
      setCredentialsModal({
        visible: true,
        name: result.staffName,
        email: result.email,
        role: targetStaff.roleName || targetStaff.role,
        temporaryPassword: result.temporaryPassword,
      });
    }
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

  const handleResendInvite = async (staffMember: StaffMember) => {
    const [updated, err] = await clinicService.resendStaffInvitation(staffMember.id, true);
    if (err || !updated) {
      notify.error(err?.message || 'Could not resend invitation email.');
      return;
    }
    setStaff((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    notify.success(`Invitation email resent to ${updated.email || staffMember.email}.`);
    await onRefreshStaff();
  };

  const handleRevokeInvite = (staffMember: StaffMember) => {
    const isPendingInvite = staffMember.status === 'Invited' && !staffMember.hasCredentials;
    if (!isPendingInvite && isSystemAdminStaff(staffMember) && activeSystemAdmins.length <= 1) {
      notify.error('Cannot revoke the only active Clinic Administrator.');
      return;
    }

    Alert.alert(
      isPendingInvite ? 'Revoke Invitation' : 'Revoke Facility Access',
      isPendingInvite
        ? `Are you sure you want to revoke the invitation for ${staffMember.firstName} ${staffMember.lastName}? The invitation link will be immediately invalidated.`
        : `Are you sure you want to revoke facility access for ${staffMember.firstName} ${staffMember.lastName}? Their status will be marked as Revoked and active sessions will be signed out.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            const [ok, err] = await clinicService.revokeStaffInvitation(staffMember.id);
            if (err || !ok) {
              notify.error(err?.message || 'Could not revoke staff access.');
              return;
            }
            setStaff((prev) =>
              prev.map((item) =>
                item.id === staffMember.id ? { ...item, status: 'Revoked', isActive: false } : item
              )
            );
            notify.success(
              isPendingInvite
                ? `Invitation for ${staffMember.firstName} ${staffMember.lastName} revoked.`
                : `Facility access for ${staffMember.firstName} ${staffMember.lastName} revoked.`
            );
            await Promise.all([onRefreshStaff(), refreshGlobalStaff()]);
          },
        },
      ]
    );
  };

  const handleReinviteStaff = async (staffMember: StaffMember) => {
    const [updated, err] = await clinicService.reinviteStaffMember(staffMember.id, true);
    if (err || !updated) {
      notify.error(err?.message || 'Could not re-invite staff member.');
      return;
    }
    setStaff((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    notify.success(`Sent a new 7-day invitation to ${updated.email || staffMember.email}.`);

    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    const inviteUrl =
      updated.inviteUrl ||
      (updated.invitationToken
        ? origin
          ? `${origin}/invitations/${updated.invitationToken}`
          : `/invitations/${updated.invitationToken}`
        : '');
    if (inviteUrl) {
      setInviteModal({
        visible: true,
        name: `${updated.firstName} ${updated.lastName}`.trim(),
        email: updated.email || staffMember.email,
        role: updated.roleName || updated.role,
        inviteUrl,
        sentEmail: true,
      });
    }
    await onRefreshStaff();
  };

  const handleRemoveStaff = (staffMember: StaffMember) => {
    Alert.alert(
      'Remove from Facility',
      `Are you sure you want to permanently remove ${staffMember.firstName} ${staffMember.lastName} from the facility staff directory?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const [ok, err] = await clinicService.removeStaffMember(staffMember.id);
            if (err || !ok) {
              notify.error(err?.message || 'Could not remove staff member from facility.');
              return;
            }
            setStaff((prev) => prev.filter((item) => item.id !== staffMember.id));
            notify.success(`${staffMember.firstName} ${staffMember.lastName} removed from facility directory.`);
            await Promise.all([onRefreshStaff(), refreshGlobalStaff()]);
          },
        },
      ]
    );
  };

  const handleSuspendStaff = (staffMember: StaffMember) => {
    if (isSystemAdminStaff(staffMember) && activeSystemAdmins.length <= 1) {
      notify.error('Cannot suspend the only active Clinic Administrator.');
      return;
    }

    Alert.alert(
      'Suspend Staff Member',
      `Are you sure you want to suspend ${staffMember.firstName} ${staffMember.lastName}? They will immediately be signed out of all devices.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            const [updated, err] = await clinicService.suspendStaffMember(staffMember.id);
            if (err || !updated) {
              notify.error(err?.message || 'Could not suspend staff member.');
              return;
            }
            setStaff((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
            notify.success(`${staffMember.firstName} ${staffMember.lastName} suspended.`);
            await Promise.all([onRefreshStaff(), refreshGlobalStaff()]);
          },
        },
      ]
    );
  };

  const handleReactivateStaff = async (staffMember: StaffMember) => {
    const [updated, err] = await clinicService.reactivateStaff(staffMember.id);
    if (err || !updated) {
      notify.error(err?.message || 'Could not reactivate staff member. Check facility seats and license.');
      return;
    }
    setStaff((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    notify.success(`${staffMember.firstName} ${staffMember.lastName} reactivated.`);
    await Promise.all([onRefreshStaff(), refreshGlobalStaff()]);
  };

  const copyToClipboard = async (text: string, successMsg = 'Login credentials copied to clipboard!') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      notify.success(successMsg);
    } else {
      notify.info('Select and copy from the screen.');
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
            <View style={[styles.headerActionsRow, isCompact && styles.headerActionsRowMobile]}>
              <Button
                title="Doctor Rosters & Schedules"
                icon="calendar"
                variant="outline"
                size="sm"
                style={isCompact ? styles.flexBtn : undefined}
                onPress={() => {
                  setRosterDoctorId(doctors[0]?.id);
                  setRosterModalVisible(true);
                }}
              />
              <Button
                title="Add staff member"
                icon="plus"
                size="sm"
                style={isCompact ? styles.flexBtn : undefined}
                onPress={handleOpenAddModal}
                disabled={maxStaffSeats != null && activeStaffCount >= maxStaffSeats}
              />
            </View>
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
                const isSelfRow = isSelf(s);
                const isExpired =
                  s.isExpired ||
                  (s.status === 'Invited' &&
                    !!s.invitationExpiresAt &&
                    new Date(s.invitationExpiresAt).getTime() < Date.now());
                const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
                const inviteUrl =
                  s.inviteUrl ||
                  (s.invitationToken
                    ? (origin ? `${origin}/invitations/${s.invitationToken}` : `/invitations/${s.invitationToken}`)
                    : '');
                const staffBadge = resolveStaffBadge(s);
                const actions = getAvailableStaffActions(
                  { ...s, inviteUrl: inviteUrl || s.inviteUrl },
                  { isSelf: isSelfRow }
                );

                return (
                  <View key={s.id} style={styles.staffItem}>
                    <View style={styles.staffIdentityCol}>
                      <View style={styles.staffNameRow}>
                        <ThemedText variant="bodyBold">{fullName}</ThemedText>
                        {isSelfRow ? (
                          <Badge label="You" variant="info" size="sm" />
                        ) : null}
                        <Badge label={s.role} variant={s.role === 'Doctor' ? 'primary' : 'neutral'} size="sm" />
                        {s.assignedRoomNames && s.assignedRoomNames.length > 0 ? (
                          s.assignedRoomNames.map((roomName, idx) => (
                            <Badge
                              key={roomName}
                              label={idx === 0 && s.assignedRoomNames!.length > 1 ? `${roomName} (Primary)` : roomName}
                              variant={idx === 0 ? 'primary' : 'outline'}
                              size="sm"
                              icon="clinic"
                            />
                          ))
                        ) : s.assignedRoomName ? (
                          <Badge label={s.assignedRoomName} variant="primary" size="sm" icon="clinic" />
                        ) : null}
                        {s.roleName && s.roleName !== s.role ? (
                          <Badge label={s.roleName} variant="purple" size="sm" />
                        ) : null}
                        <Badge
                          label={staffBadge.label}
                          variant={staffBadge.variant}
                          size="sm"
                          icon={staffBadge.icon}
                        />
                      </View>

                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {[
                          s.roleName,
                          s.email ? s.email : 'No email',
                          s.prcLicenseNumber ? `PRC ${s.prcLicenseNumber}` : null,
                          s.ptrNumber ? `PTR ${s.ptrNumber}` : null,
                          s.philHealthPan ? `PAN ${s.philHealthPan}` : null,
                          s.s2LicenseNumber ? `S2 ${s.s2LicenseNumber}` : null,
                          s.specialty,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                    </View>

                    <View style={[styles.staffActionsCol, isCompact && styles.staffActionsColMobile]}>
                      {actions.includes('edit') ? (
                        <Button
                          title="Edit"
                          icon="edit"
                          variant="ghost"
                          size="sm"
                          style={isCompact ? styles.flexBtn : undefined}
                          onPress={() => handleOpenEditModal(s)}
                        />
                      ) : null}
                      {actions.length === 0 && s.status === 'Revoked' ? (
                        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.revokedText}>
                          Revoked
                        </ThemedText>
                      ) : actions.length > 0 ? (
                        <ActionMenu
                          align="right"
                          triggerAriaLabel={`More actions for ${fullName}`}
                          items={[
                            ...(s.role === 'Doctor' && actions.includes('edit')
                              ? [
                                  {
                                    id: 'roster',
                                    label: 'Roster & Schedule',
                                    icon: 'calendar' as const,
                                    hint: 'Configure weekly shifts & leaves',
                                    onPress: () => {
                                      setRosterDoctorId(s.id);
                                      setRosterModalVisible(true);
                                    },
                                  },
                                  {
                                    id: 'stamp',
                                    label: 'View Doctor Stamp',
                                    icon: 'eye' as const,
                                    hint: 'Preview credentials & signature imprint',
                                    onPress: () => setStampModalStaff(s),
                                  },
                                ]
                              : []),
                            ...(actions.includes('copy-invite') && inviteUrl
                              ? [
                                  {
                                    id: 'copy-invite',
                                    label: 'Copy Invite Link',
                                    icon: 'copy' as const,
                                    hint: 'Copy direct invitation link',
                                    onPress: () =>
                                      copyToClipboard(inviteUrl, 'Invitation link copied to clipboard!'),
                                  },
                                ]
                              : []),
                            ...(actions.includes('resend-invite')
                              ? [
                                  {
                                    id: 'resend-invite',
                                    label: 'Resend Invitation Email',
                                    icon: 'mail' as const,
                                    hint: 'Generate new token & send email',
                                    onPress: () => handleResendInvite(s),
                                  },
                                ]
                              : []),
                            ...(actions.includes('reinvite-staff')
                              ? [
                                  {
                                    id: 'reinvite-staff',
                                    label: 'Re-invite Staff Member',
                                    icon: 'mail' as const,
                                    hint: 'Generate fresh 7-day token & send email',
                                    onPress: () => handleReinviteStaff(s),
                                  },
                                ]
                              : []),
                            ...(actions.includes('reset-pwd')
                              ? [
                                  {
                                    id: 'reset-pwd',
                                    label: 'Reset Password',
                                    icon: 'key' as const,
                                    hint: 'Send reset email, link, or temporary password',
                                    dividerBefore: s.role === 'Doctor',
                                    onPress: () => {
                                      setResetModalStaff(s);
                                      setResetDeliveryMode('email');
                                      setCustomResetPassword(generateRandomPassword());
                                      setResetError(null);
                                    },
                                  },
                                ]
                              : []),
                            ...(actions.includes('reactivate-staff')
                              ? [
                                  {
                                    id: 'reactivate-staff',
                                    label: 'Reactivate Staff Member',
                                    icon: 'checkCircle' as const,
                                    hint: 'Restore staff login access',
                                    dividerBefore: s.role === 'Doctor',
                                    onPress: () => handleReactivateStaff(s),
                                  },
                                ]
                              : []),
                            ...(actions.includes('suspend-staff')
                              ? [
                                  {
                                    id: 'suspend-staff',
                                    label: 'Suspend Staff Member',
                                    icon: 'alert' as const,
                                    hint: 'Suspend access and active sessions',
                                    destructive: true,
                                    dividerBefore: true,
                                    onPress: () => handleSuspendStaff(s),
                                  },
                                ]
                              : []),
                            ...(actions.includes('revoke-invite')
                              ? [
                                  {
                                    id: 'revoke-invite',
                                    label:
                                      s.status === 'Invited' && !s.hasCredentials
                                        ? 'Revoke Invitation'
                                        : 'Revoke Access',
                                    icon: 'close' as const,
                                    hint:
                                      s.status === 'Invited' && !s.hasCredentials
                                        ? 'Cancel invitation'
                                        : 'Mark as Revoked and terminate access',
                                    destructive: true,
                                    dividerBefore: !actions.includes('suspend-staff'),
                                    onPress: () => handleRevokeInvite(s),
                                  },
                                ]
                              : []),
                            ...(actions.includes('remove-staff')
                              ? [
                                  {
                                    id: 'remove-staff',
                                    label: 'Remove from Facility',
                                    icon: 'trash' as const,
                                    hint: 'Permanently remove from staff directory',
                                    destructive: true,
                                    dividerBefore: !actions.includes('revoke-invite'),
                                    onPress: () => handleRemoveStaff(s),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      ) : null}
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
            <Button
              title={
                inviteDeliveryMode === 'email'
                  ? 'Send Invitation Email'
                  : inviteDeliveryMode === 'link'
                  ? 'Generate Invite Link'
                  : inviteDeliveryMode === 'password'
                  ? 'Create & Provision'
                  : 'Add Staff Member'
              }
              onPress={handleCreateStaff}
              loading={addingStaff}
            />
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
            label="Middle name"
            value={middleName}
            onChangeText={setMiddleName}
            placeholder="Middle name"
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
          label="Contact phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. 0917-123-4567"
          keyboardType="phone-pad"
        />

        {role === 'Doctor' ? (
          <>
            <View style={styles.formRow}>
              <Input
                containerStyle={styles.flexWide}
                label="PRC license number"
                required
                value={prc}
                onChangeText={setPrc}
                placeholder="e.g. 0108924 (Mandatory for doctors)"
              />
              <Input
                containerStyle={styles.flexWide}
                label="PhilHealth Accreditation Number (PAN)"
                value={pan}
                onChangeText={setPan}
                placeholder="e.g. 1200-9876543-2 (Konsulta)"
              />
            </View>
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

            {/* Official Doctor Stamp & Signature Live Specimen */}
            <View style={styles.stampPreviewCard}>
              <View style={styles.stampHeaderRow}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Official Doctor Stamp & Signature Preview
                </ThemedText>
                {defaultSignatureMode === 'ESignatureSpecimen' ? (
                  <Badge label="Digitally Certified" variant="success" icon="check" size="sm" />
                ) : defaultSignatureMode === 'DigitalSealOnly' ? (
                  <Badge label="Digital Seal" variant="primary" icon="shield" size="sm" />
                ) : (
                  <Badge label="Wet Signature" variant="neutral" size="sm" />
                )}
              </View>

              <View style={styles.stampControlsRow}>
                <View style={styles.segmentedWrapperSmall}>
                  <SegmentedControl<SignatureMode>
                    value={defaultSignatureMode}
                    onChange={(mode) => setDefaultSignatureMode(mode)}
                    options={[
                      { value: 'ESignatureSpecimen', label: 'E-Sign' },
                      { value: 'DigitalSealOnly', label: 'Seal' },
                      { value: 'WetSignature', label: 'Wet' },
                    ]}
                  />
                </View>
                <Button
                  title={signatureSpecimen ? 'Edit Specimen' : 'Upload / Draw'}
                  variant="outline"
                  size="sm"
                  icon="edit"
                  onPress={() => setSignatureModalVisible(true)}
                />
              </View>

              <View style={styles.stampBox}>
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
                        [No E-Signature specimen configured]
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
          </>
        ) : null}

        <Input
          label="Specialty or clinical designation"
          value={specialty}
          onChangeText={setSpecialty}
          placeholder="e.g. Pediatrics, Triage Nursing, Billing Officer"
        />

        {(role === 'Doctor' || role === 'Nurse') && activeRoomsForRole.length > 0 ? (
          <FieldGroup label="Assigned Room / Station (Optional)">
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              {role === 'Doctor'
                ? 'Optional. Patients checked in to this doctor will automatically be routed to their assigned room.'
                : 'Optional. Nurses assigned to a Treatment Room or Triage Station default to that station on login.'}
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={styles.chipScrollRow}
            >
              <Chip
                label="Unassigned / Floating"
                active={assignedRoomIds.length === 0}
                onPress={() => setAssignedRoomIds([])}
              />
              {activeRoomsForRole.map((room) => {
                const isSelected = assignedRoomIds.includes(room.id);
                return (
                  <Chip
                    key={room.id}
                    label={`${room.name} (${room.type})`}
                    active={isSelected}
                    onPress={() => {
                      setAssignedRoomIds((prev) =>
                        prev.includes(room.id)
                          ? prev.filter((id) => id !== room.id)
                          : [...prev, room.id],
                      );
                    }}
                  />
                );
              })}
            </ScrollView>
            {assignedRoomIds.length > 1 && (
              <View style={{ marginTop: theme.spacing.xs, gap: theme.spacing.xs }}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Primary / Default Room (tap to change):
                </ThemedText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                  {assignedRoomIds.map((roomId, idx) => {
                    const room = (rooms || []).find((r) => r.id === roomId) || activeRoomsForRole.find((r) => r.id === roomId);
                    const roomName = room?.name || 'Assigned Room';
                    const isPrimary = idx === 0;
                    return (
                      <Chip
                        key={roomId}
                        label={isPrimary ? `${roomName} (Primary)` : roomName}
                        active={isPrimary}
                        onPress={() => {
                          if (!isPrimary) {
                            setAssignedRoomIds((prev) => [roomId, ...prev.filter((id) => id !== roomId)]);
                          }
                        }}
                      />
                    );
                  })}
                </View>
              </View>
            )}
            {assignedRoomIds.length === 1 && (
              <View style={{ marginTop: theme.spacing.xs }}>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Primary / Default Room: <ThemedText variant="captionBold" color={theme.colors.primary}>{((rooms || []).find((r) => r.id === assignedRoomIds[0]) || activeRoomsForRole.find((r) => r.id === assignedRoomIds[0]))?.name ?? 'Assigned Room'}</ThemedText>
                </ThemedText>
              </View>
            )}
          </FieldGroup>
        ) : null}

        {/* Workstation Account & Delivery Mode */}
        <View style={styles.credentialSection}>
          <View style={styles.credentialHeaderRow}>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              Workstation Login & Invitation Mode
            </ThemedText>
          </View>

          <View style={{ marginVertical: theme.spacing.xs }}>
            <SegmentedControl<'email' | 'link' | 'password' | 'none'>
              value={inviteDeliveryMode}
              onChange={setInviteDeliveryMode}
              options={[
                { value: 'email', label: 'Email Invite' },
                { value: 'link', label: 'Copy Link' },
                { value: 'password', label: 'Direct Password' },
                { value: 'none', label: 'No Login' },
              ]}
            />
          </View>

          {inviteDeliveryMode === 'email' ? (
            <>
              <Input
                label="Sign-in email address"
                required
                value={email}
                onChangeText={setEmail}
                placeholder="doctor@clinic.com"
                keyboardType="email-address"
                autoCapitalize="none"
                helperText="An invitation email with a secure setup link will be sent to this address (valid for 7 days)."
              />
            </>
          ) : inviteDeliveryMode === 'link' ? (
            <>
              <Input
                label="Sign-in email address (Optional)"
                value={email}
                onChangeText={setEmail}
                placeholder="doctor@clinic.com"
                keyboardType="email-address"
                autoCapitalize="none"
                helperText="A shareable invitation link will be created. You can copy and share it via chat or SMS."
              />
            </>
          ) : inviteDeliveryMode === 'password' ? (
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

      {/* Edit Staff Modal */}
      {editingStaff ? (
        <Modal
          visible
          onClose={() => setEditingStaff(null)}
          title="Edit staff member"
          subtitle={`Update details and credentials for ${editingStaff.firstName} ${editingStaff.lastName}`}
          maxWidth={540}
          footer={
            <View style={styles.modalFooter}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setEditingStaff(null)}
                disabled={savingEdit}
              />
              <Button
                title="Save Changes"
                onPress={handleSaveEditStaff}
                loading={savingEdit}
              />
            </View>
          }
        >
          {editError ? (
            <View style={styles.errorBox}>
              <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
              <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
                {editError}
              </ThemedText>
            </View>
          ) : null}

          {/* Role Selection */}
          <View style={styles.roleSelectionGroup}>
            <FieldGroup label="Staff Role *">
              {isEditingSelf ? (
                <View style={styles.selfRoleNoticeBox}>
                  <Icon name="shield" size={theme.sizes.iconSm} color={theme.colors.primary} />
                  <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.flex1}>
                    You cannot change or downgrade your own clinic role. Ask another clinic administrator to update your role assignment.
                  </ThemedText>
                </View>
              ) : (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Select the system standard role or a clinic custom role.
                </ThemedText>
              )}

              {isSoleActiveAdmin ? (
                <View style={styles.systemNotice}>
                  <Icon name="shield" size={theme.sizes.iconSm} color={theme.colors.primary} />
                  <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.flex1}>
                    Primary System Administrator: A facility must always maintain at least one active staff member assigned to the built-in Clinic Administrator role.
                  </ThemedText>
                </View>
              ) : null}

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
                      disabled={isEditingSelf || (isSoleActiveAdmin && r.name !== 'Clinic Administrator')}
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
                        disabled={isEditingSelf || isSoleActiveAdmin}
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
                        disabled={isEditingSelf}
                        onPress={() => {
                          if (isEditingSelf) return;
                          setRole(cat);
                          if (cat === 'Doctor' && !title) setTitle('Dr.');
                          if (cat === 'Nurse' && (!title || title === 'Dr.')) setTitle('RN');
                        }}
                        style={[
                          styles.miniChip,
                          role === cat && styles.miniChipActive,
                          isEditingSelf && styles.miniChipDisabled,
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

          {/* Name Fields */}
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
              label="Middle name"
              value={middleName}
              onChangeText={setMiddleName}
              placeholder="Middle name"
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

          {/* Contact Fields */}
          <View style={styles.formRow}>
            <Input
              containerStyle={styles.flexWide}
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="doctor@clinic.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              containerStyle={styles.flexWide}
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              placeholder="0917-123-4567"
              keyboardType="phone-pad"
            />
          </View>

          {/* Active Status Row */}
          <View style={styles.activeStatusRow}>
            <View style={styles.flex1}>
              <ThemedText variant="smallBold" color={theme.colors.text}>
                Staff Account Status
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {isEditingSelf
                  ? 'Active: you cannot deactivate your own workstation account.'
                  : isSoleActiveAdmin
                  ? 'Active: primary administrator. Cannot deactivate the only active Clinic Administrator.'
                  : isActiveStaff
                  ? 'Active: staff member can be assigned consultations and access workstation.'
                  : 'Deactivated: staff member cannot log in or be assigned.'}
              </ThemedText>
            </View>
            <Button
              title={isActiveStaff ? 'Active' : 'Deactivated'}
              variant={isActiveStaff ? 'success' : 'danger'}
              size="sm"
              disabled={isEditingSelf || isSoleActiveAdmin}
              onPress={() => {
                if (isEditingSelf || isSoleActiveAdmin) return;
                setIsActiveStaff((prev) => !prev);
              }}
            />
          </View>

          {role === 'Doctor' ? (
            <>
              <View style={styles.formRow}>
                <Input
                  containerStyle={styles.flexWide}
                  label="PRC license number"
                  required
                  value={prc}
                  onChangeText={setPrc}
                  placeholder="e.g. 0108924 (Mandatory for doctors)"
                />
                <Input
                  containerStyle={styles.flexWide}
                  label="PhilHealth Accreditation Number (PAN)"
                  value={pan}
                  onChangeText={setPan}
                  placeholder="e.g. 1200-9876543-2 (Konsulta)"
                />
              </View>
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

              {/* Official Doctor Stamp & Signature Live Specimen */}
              <View style={styles.stampPreviewCard}>
                <View style={styles.stampHeaderRow}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Official Doctor Stamp & Signature Preview
                  </ThemedText>
                  {defaultSignatureMode === 'ESignatureSpecimen' ? (
                    <Badge label="Digitally Certified" variant="success" icon="check" size="sm" />
                  ) : defaultSignatureMode === 'DigitalSealOnly' ? (
                    <Badge label="Digital Seal" variant="primary" icon="shield" size="sm" />
                  ) : (
                    <Badge label="Wet Signature" variant="neutral" size="sm" />
                  )}
                </View>

                <View style={styles.stampControlsRow}>
                  <View style={styles.segmentedWrapperSmall}>
                    <SegmentedControl<SignatureMode>
                      value={defaultSignatureMode}
                      onChange={(mode) => setDefaultSignatureMode(mode)}
                      options={[
                        { value: 'ESignatureSpecimen', label: 'E-Sign' },
                        { value: 'DigitalSealOnly', label: 'Seal' },
                        { value: 'WetSignature', label: 'Wet' },
                      ]}
                    />
                  </View>
                  <Button
                    title={signatureSpecimen ? 'Edit Specimen' : 'Upload / Draw'}
                    variant="outline"
                    size="sm"
                    icon="edit"
                    onPress={() => setSignatureModalVisible(true)}
                  />
                </View>

                <View style={styles.stampBox}>
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
                          [No E-Signature specimen configured]
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
            </>
          ) : null}

          <Input
            label="Specialty or clinical designation"
            value={specialty}
            onChangeText={setSpecialty}
            placeholder="e.g. Pediatrics, Triage Nursing, Billing Officer"
          />

          {(role === 'Doctor' || role === 'Nurse') && activeRoomsForRole.length > 0 ? (
            <FieldGroup label="Assigned Room / Station (Optional)">
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {role === 'Doctor'
                  ? 'Optional. Patients checked in to this doctor will automatically be routed to their assigned room.'
                  : 'Optional. Nurses assigned to a Treatment Room or Triage Station default to that station on login.'}
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled
                contentContainerStyle={styles.chipScrollRow}
              >
                <Chip
                  label="Unassigned / Floating"
                  active={assignedRoomIds.length === 0}
                  onPress={() => setAssignedRoomIds([])}
                />
                {activeRoomsForRole.map((room) => {
                  const isSelected = assignedRoomIds.includes(room.id);
                  return (
                    <Chip
                      key={room.id}
                      label={`${room.name} (${room.type})`}
                      active={isSelected}
                      onPress={() => {
                        setAssignedRoomIds((prev) =>
                          prev.includes(room.id)
                            ? prev.filter((id) => id !== room.id)
                            : [...prev, room.id],
                        );
                      }}
                    />
                  );
                })}
              </ScrollView>
              {assignedRoomIds.length > 1 && (
                <View style={{ marginTop: theme.spacing.xs, gap: theme.spacing.xs }}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Primary / Default Room (tap to change):
                  </ThemedText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                    {assignedRoomIds.map((roomId, idx) => {
                      const room = (rooms || []).find((r) => r.id === roomId) || activeRoomsForRole.find((r) => r.id === roomId);
                      const roomName = room?.name || 'Assigned Room';
                      const isPrimary = idx === 0;
                      return (
                        <Chip
                          key={roomId}
                          label={isPrimary ? `${roomName} (Primary)` : roomName}
                          active={isPrimary}
                          onPress={() => {
                            if (!isPrimary) {
                              setAssignedRoomIds((prev) => [roomId, ...prev.filter((id) => id !== roomId)]);
                            }
                          }}
                        />
                      );
                    })}
                  </View>
                </View>
              )}
              {assignedRoomIds.length === 1 && (
                <View style={{ marginTop: theme.spacing.xs }}>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Primary / Default Room: <ThemedText variant="captionBold" color={theme.colors.primary}>{((rooms || []).find((r) => r.id === assignedRoomIds[0]) || activeRoomsForRole.find((r) => r.id === assignedRoomIds[0]))?.name ?? 'Assigned Room'}</ThemedText>
                  </ThemedText>
                </View>
              )}
            </FieldGroup>
          ) : null}
        </Modal>
      ) : null}

      {/* Password Reset Modal */}
      {resetModalStaff ? (
        <Modal
          visible
          onClose={() => setResetModalStaff(null)}
          title="Reset staff password"
          subtitle={`Choose how to reset workstation credentials for ${resetModalStaff.firstName} ${resetModalStaff.lastName}`}
          maxWidth={480}
          footer={
            <View style={styles.modalFooter}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setResetModalStaff(null)}
                disabled={resettingPassword}
              />
              <Button
                title={
                  resetDeliveryMode === 'email'
                    ? 'Send Reset Email'
                    : resetDeliveryMode === 'link'
                    ? 'Generate Reset Link'
                    : 'Set Temporary Password'
                }
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

          <View style={{ marginVertical: theme.spacing.xs }}>
            <SegmentedControl<'email' | 'link' | 'password'>
              value={resetDeliveryMode}
              onChange={setResetDeliveryMode}
              options={[
                { value: 'email', label: 'Email Reset Link' },
                { value: 'link', label: 'Copy Reset Link' },
                { value: 'password', label: 'Direct Password' },
              ]}
            />
          </View>

          {resetDeliveryMode === 'email' ? (
            <View style={styles.inviteNoticeBox}>
              <Icon name="mail" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.flex1}>
                A password reset email with a secure 7-day setup link will be sent to {resetModalStaff.email || 'the staff member'}. Active workstation sessions will be signed out.
              </ThemedText>
            </View>
          ) : resetDeliveryMode === 'link' ? (
            <View style={styles.inviteNoticeBox}>
              <Icon name="copy" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.flex1}>
                A secure 7-day password setup link will be generated for you to copy and share directly via chat or messaging. Active workstation sessions will be signed out.
              </ThemedText>
            </View>
          ) : (
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
          )}
        </Modal>
      ) : null}

      {/* Staff Invitation / Password Reset Link & Delivery Modal */}
      {inviteModal?.visible ? (
        <Modal
          visible
          onClose={() => setInviteModal(null)}
          title={inviteModal.isPasswordReset ? 'Password Reset Link Ready' : 'Staff Invitation Ready'}
          subtitle={
            inviteModal.sentEmail
              ? inviteModal.isPasswordReset
                ? 'A password reset email has been sent and the direct link is ready.'
                : 'An invitation email has been sent and the direct link is ready.'
              : inviteModal.isPasswordReset
              ? 'Share this password reset link with the staff member to set a new password.'
              : 'Share the invitation link with the staff member to complete account setup.'
          }
          maxWidth={480}
          footer={
            <View style={styles.modalFooter}>
              <Button
                title="Done"
                variant="primary"
                onPress={() => setInviteModal(null)}
              />
            </View>
          }
        >
          <View style={styles.credSummaryCard}>
            <View style={styles.credRow}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>Staff Member</ThemedText>
              <ThemedText variant="bodyBold">{inviteModal.name}</ThemedText>
            </View>
            <View style={styles.credRow}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>Role</ThemedText>
              <ThemedText variant="bodyBold">{inviteModal.role}</ThemedText>
            </View>
            {inviteModal.email ? (
              <View style={styles.credRow}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>Email Address</ThemedText>
                <ThemedText variant="bodyBold">{inviteModal.email}</ThemedText>
              </View>
            ) : null}
            <View style={styles.credRow}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {inviteModal.isPasswordReset ? 'Password Reset Link (Valid for 7 days)' : 'Invitation Link (Valid for 7 days)'}
              </ThemedText>
              <ThemedText variant="captionBold" color={theme.colors.primary} numberOfLines={2} selectable>
                {inviteModal.inviteUrl}
              </ThemedText>
            </View>
          </View>

          {inviteModal.sentEmail ? (
            <View style={styles.inviteNoticeBox}>
              <Icon name="mail" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.flex1}>
                {inviteModal.isPasswordReset
                  ? `A password reset email was sent to ${inviteModal.email || 'the provided address'}. They can also use this direct link to set their new password.`
                  : `An invitation email was sent to ${inviteModal.email || 'the provided address'}. They can also use this direct link to set their password.`}
              </ThemedText>
            </View>
          ) : (
            <View style={styles.inviteNoticeBox}>
              <Icon name="copy" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.flex1}>
                Copy this link and send it directly to the staff member via chat or messaging.
              </ThemedText>
            </View>
          )}

          <Button
            title={inviteModal.isPasswordReset ? 'Copy Password Reset Link' : 'Copy Invitation Link'}
            icon="copy"
            variant="outline"
            onPress={() =>
              copyToClipboard(
                inviteModal.inviteUrl,
                inviteModal.isPasswordReset
                  ? 'Password reset link copied to clipboard!'
                  : 'Invitation link copied to clipboard!'
              )
            }
          />
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
              {/* Signature Specimen Overlay or Mode Indicator */}
              {stampModalStaff.defaultSignatureMode === 'ESignatureSpecimen' || (!stampModalStaff.defaultSignatureMode && stampModalStaff.signatureSpecimen) ? (
                stampModalStaff.signatureSpecimen ? (
                  <View style={styles.stampSignatureOverlayLarge}>
                    <Image
                      source={{ uri: stampModalStaff.signatureSpecimen }}
                      style={styles.stampSignatureImageLarge}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <View style={styles.stampSignatureEmptyLarge}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      [No E-Signature specimen uploaded]
                    </ThemedText>
                  </View>
                )
              ) : stampModalStaff.defaultSignatureMode === 'WetSignature' ? (
                <View style={styles.stampWetSignatureBox}>
                  <View style={styles.stampWetLine} />
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Physician Wet Signature (Pen)
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.stampSealBox}>
                  <Badge label="Digital Verification Seal" variant="primary" icon="shield" size="sm" />
                </View>
              )}

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
              {stampModalStaff.philHealthPan ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {`PhilHealth PAN: ${stampModalStaff.philHealthPan}`}
                </ThemedText>
              ) : null}
              {stampModalStaff.s2LicenseNumber ? (
                <ThemedText variant="captionBold" color={theme.colors.emergency}>
                  {stampModalStaff.s2LicenseNumber}
                </ThemedText>
              ) : null}
            </View>

            <View style={styles.stampModalBadgeRow}>
              {stampModalStaff.defaultSignatureMode === 'ESignatureSpecimen' || (!stampModalStaff.defaultSignatureMode && stampModalStaff.signatureSpecimen) ? (
                <Badge label="Digitally Certified & Locked" variant="success" icon="check" />
              ) : stampModalStaff.defaultSignatureMode === 'DigitalSealOnly' ? (
                <Badge label="Digital Verification Seal" variant="primary" icon="shield" />
              ) : (
                <Badge label="Wet Signature Mode" variant="neutral" />
              )}
            </View>

            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.stampNotice}>
              This official statutory stamp is applied to digital consultation slips, e-prescriptions, laboratory orders, and official medical certificates.
            </ThemedText>
          </View>
        </Modal>
      ) : null}

      {/* Signature Specimen Modal */}
      {signatureModalVisible ? (
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
          onSave={(newSig, newMode) => {
            setSignatureSpecimen(newSig);
            setDefaultSignatureMode(newMode);
          }}
        />
      ) : null}

      {rosterModalVisible ? (
        <DoctorRosterCalendarModal
          visible={rosterModalVisible}
          onClose={() => setRosterModalVisible(false)}
          doctors={doctors}
          initialDoctorId={rosterDoctorId}
          onAddStaff={() => {
            setRosterModalVisible(false);
            handleOpenAddModal();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  headerActionsRowMobile: {
    width: '100%',
    flexDirection: 'row',
    gap: theme.spacing.sm,
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
  staffActionsColMobile: {
    width: '100%',
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  flexBtn: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  revokedText: {
    fontStyle: 'italic',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
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
  selfRoleNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primary,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    marginTop: theme.spacing.xs,
  },
  systemNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
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
  miniChipDisabled: {
    opacity: 0.5,
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
  inviteNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    marginBottom: theme.spacing.md,
  },
  credRow: {
    gap: 2,
  },
  activeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    marginVertical: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  stampPreviewCard: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  stampHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  stampControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  segmentedWrapperSmall: {
    flex: 1,
    minWidth: 160,
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
  stampSignatureOverlay: {
    width: '100%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  stampSignatureImage: {
    width: 180,
    height: 46,
  },
  stampSignatureEmpty: {
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
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
  stampSignatureOverlayLarge: {
    width: '100%',
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  stampSignatureImageLarge: {
    width: 240,
    height: 56,
  },
  stampSignatureEmptyLarge: {
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  stampWetSignatureBox: {
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  stampWetLine: {
    width: 180,
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.textMuted,
  },
  stampSealBox: {
    marginBottom: theme.spacing.xs,
  },
  stampModalBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
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
