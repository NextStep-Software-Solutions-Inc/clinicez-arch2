import React, { useState } from 'react';
import { ScrollView, View, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import { useForm, Controller } from 'react-hook-form';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useSafeHeaderHeight } from '../../../hooks/useSafeHeaderHeight';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import { AppIcon } from '@ui/Icon';
import { dialog } from '@utils/dialog';

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ── PasswordField ─────────────────────────────────────────────────────────────

interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  placeholder?: string;
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
}

function PasswordField({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  returnKeyType,
  onSubmitEditing,
}: PasswordFieldProps) {
  const { colors, spacing, sizes, typography } = useAppTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.fieldWrapper, { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs }]}>
      <ThemedText variant="captionBold" color="textMuted">
        {label}
      </ThemedText>
      <View style={[styles.inputRow, { gap: spacing.sm }]}>
        <TextInput
          style={[
            styles.input,
            typography.bodyLarge,
            {
              color: colors.text,
              paddingVertical: spacing.xs,
              outlineStyle: 'none',
            } as object,
          ]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          placeholder={placeholder}
          placeholderTextColor={colors.textLight}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType={returnKeyType ?? 'done'}
          onSubmitEditing={onSubmitEditing}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <AppIcon
            name={visible ? 'eyeOff' : 'eye'}
            size={sizes.iconMd}
            color="textMuted"
          />
        </Pressable>
      </View>
      {error ? (
        <ThemedText variant="small" color="emergencyText">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

// ── ChangePasswordScreen ──────────────────────────────────────────────────────

export default function ChangePasswordScreen() {
  const navigation = useNavigation<any>();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { user } = useUser();

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const newPasswordValue = watch('newPassword');

  const onSubmit = async (data: FormValues) => {
    try {
      await user?.updatePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        signOutOfOtherSessions: false,
      });
      dialog.alert('Password Changed', 'Your password has been updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      const message =
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        'Failed to change password. Please check your current password and try again.';
      dialog.alert('Error', message);
    }
  };

  const divider = <View style={[styles.divider, { backgroundColor: colors.border, marginLeft: spacing.lg }]} />;
  const headerHeight = useSafeHeaderHeight();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentContainerStyle={[
          styles.container,
          {
            padding: spacing.lg,
            gap: spacing.lg,
            maxWidth: sizes.formMaxWidth,
            alignSelf: 'center',
            width: '100%',
            paddingBottom: spacing['3xl'] ?? 48,
          },
        ]}
      >
      <ThemedText variant="body" color="textSecondary">
        Your new password must be at least 8 characters long.
      </ThemedText>

      {/* Fields card */}
      <Card padding="none" elevation="sm" style={styles.card}>
        <Controller
          control={control}
          name="currentPassword"
          rules={{ required: 'Current password is required' }}
          render={({ field: { value, onChange } }) => (
            <PasswordField
              label="Current Password"
              value={value}
              onChangeText={onChange}
              error={errors.currentPassword?.message}
              placeholder="Enter current password"
              returnKeyType="next"
            />
          )}
        />

        {divider}

        <Controller
          control={control}
          name="newPassword"
          rules={{
            required: 'New password is required',
            minLength: { value: 8, message: 'Password must be at least 8 characters' },
          }}
          render={({ field: { value, onChange } }) => (
            <PasswordField
              label="New Password"
              value={value}
              onChangeText={onChange}
              error={errors.newPassword?.message}
              placeholder="Enter new password"
              returnKeyType="next"
            />
          )}
        />

        {divider}

        <Controller
          control={control}
          name="confirmPassword"
          rules={{
            required: 'Please confirm your new password',
            validate: (val) => val === newPasswordValue || 'Passwords do not match',
          }}
          render={({ field: { value, onChange } }) => (
            <PasswordField
              label="Confirm New Password"
              value={value}
              onChangeText={onChange}
              error={errors.confirmPassword?.message}
              placeholder="Re-enter new password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit(onSubmit)}
            />
          )}
        />
      </Card>

      {/* Submit button */}
      <Button
        label="Change Password"
        variant="primary"
        size="lg"
        fullWidth
        loading={isSubmitting}
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {},
  card: {
    overflow: 'hidden',
  },
  divider: {
    height: 1,
  },
  fieldWrapper: {},
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
  },
});
