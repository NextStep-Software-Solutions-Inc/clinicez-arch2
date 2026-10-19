import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, StaffMember } from '../../services/clinicService';
import { validatePasswordPolicy } from '../../services/passwordPolicy';

export interface StaffAccessModalProps {
  staff: StaffMember | null;
  onClose: () => void;
}

/**
 * Administrator tools for one staff member's sign-in: issue a temporary password (they must replace it at next
 * sign-in) or sign them out of every device. Requires `staff:manage`; the server enforces it regardless of the UI.
 */
export default function StaffAccessModal({ staff, onClose }: StaffAccessModalProps) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  if (!staff) return null;
  const name = `${staff.firstName} ${staff.lastName}`.trim();

  const issuePassword = async () => {
    if (!staff.email) return setError('Add an email address to this staff member first. It is their sign-in name.');
    const problems = validatePasswordPolicy(password);
    if (problems.length > 0) return setError(problems.join(' '));
    setBusy(true);
    setError(null);
    const [, err] = await clinicService.setStaffTemporaryPassword(staff.id, password);
    setBusy(false);
    if (err) return setError(err.message || 'Could not set the temporary password.');
    notify.success(`Temporary password set for ${name}. Share it with them in person.`);
    close();
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    const [, err] = await clinicService.revokeStaffSessions(staff.id);
    setBusy(false);
    if (err) return setError(err.message || 'Could not sign this person out.');
    notify.success(`${name} was signed out of all devices.`);
    close();
  };

  return (
    <Modal
      visible
      onClose={close}
      title="Sign-in access"
      subtitle={staff.email ? `${name} · ${staff.email}` : name}
      maxWidth={460}
      footer={
        <View style={styles.footer}>
          <Button title="Close" variant="secondary" onPress={close} disabled={busy} />
          <Button title="Set temporary password" loading={busy} onPress={issuePassword} />
        </View>
      }
    >
      <View style={styles.form}>
        {error ? (
          <ThemedText variant="small" color={theme.colors.emergencyText}>
            {error}
          </ThemedText>
        ) : null}
        <Input
          label="Temporary password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          helperText="At least 10 characters with a letter and a digit. They will be asked to choose their own at first sign-in."
        />
        <Button title="Sign out of all devices" variant="secondary" icon="logout" onPress={revoke} disabled={busy} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: theme.spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
});
