import React, { useState, useEffect } from 'react';
import { ScrollView, View, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUser, useSession, useClerk } from '@clerk/expo';
import { useForm, Controller } from 'react-hook-form';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useSafeHeaderHeight } from '../../../hooks/useSafeHeaderHeight';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import { AppIcon } from '@ui/Icon';
import { Skeleton } from '@ui/Skeleton';
import { dialog } from '@utils/dialog';
import { executeChangeOrSetPassword, type ReverificationCodeKind } from '../../../utils/passwordHelpers';

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  verificationCode: string;
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
  const { colors, spacing, radii, sizes, typography } = useAppTheme();
  const { user, isLoaded: isUserLoaded } = useUser();
  const { session, isLoaded: isSessionLoaded } = useSession();
  const clerk = useClerk();
  const [verificationMode, setVerificationMode] = useState<ReverificationCodeKind | null>(null);

  const isLoaded = Boolean(isUserLoaded && isSessionLoaded);
  const isSetPasswordMode = user?.passwordEnabled === false;

  useEffect(() => {
    if (isLoaded) {
      navigation.setOptions({
        title: isSetPasswordMode ? 'Set Password' : 'Change Password',
      });
    }
  }, [isLoaded, isSetPasswordMode, navigation]);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '', verificationCode: '' },
  });

  const newPasswordValue = watch('newPassword');
  const currentPasswordValue = watch('currentPassword');

  const onSubmit = async (data: FormValues) => {
    const res = await executeChangeOrSetPassword({
      user,
      session,
      clerk,
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
      isSetPasswordMode,
      emailVerificationCode: verificationMode === 'email_code' ? data.verificationCode : undefined,
      secondFactorCode: verificationMode === 'second_factor' ? data.verificationCode : undefined,
    });

    if (res.success) {
      setVerificationMode(null);
      dialog.alert(
        isSetPasswordMode ? 'Password Set' : 'Password Changed',
        isSetPasswordMode
          ? 'Your password has been created successfully.'
          : 'Your password has been updated successfully.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } else if (res.requiresVerificationCode) {
      setVerificationMode(res.requiresVerificationCode);
      dialog.alert(
        'Verification Required',
        res.error ?? 'Please enter your verification code to continue.',
      );
    } else {
      dialog.alert(
        'Error',
        res.error ??
          (isSetPasswordMode
            ? 'Failed to set password. Please try again.'
            : 'Failed to change password. Please check your current password and try again.'),
      );
    }
  };

  const divider = <View style={[styles.divider, { backgroundColor: colors.border, marginLeft: spacing.lg }]} />;
  const headerHeight = useSafeHeaderHeight();

  if (!isLoaded) {
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
          <Skeleton height={16} width="70%" radius={radii.sm} />

          <Card padding="none" elevation="sm" style={styles.card}>
            <View style={{ padding: spacing.lg, gap: spacing.sm }}>
              <Skeleton height={12} width="40%" radius={radii.xs} />
              <Skeleton height={24} width="90%" radius={radii.xs} />
            </View>
            {divider}
            <View style={{ padding: spacing.lg, gap: spacing.sm }}>
              <Skeleton height={12} width="40%" radius={radii.xs} />
              <Skeleton height={24} width="90%" radius={radii.xs} />
            </View>
            {divider}
            <View style={{ padding: spacing.lg, gap: spacing.sm }}>
              <Skeleton height={12} width="40%" radius={radii.xs} />
              <Skeleton height={24} width="90%" radius={radii.xs} />
            </View>
          </Card>

          <Skeleton height={sizes.controlLg ?? 48} width="100%" radius={radii.md} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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
          {isSetPasswordMode
            ? 'Set a password for your account to enable password sign-in. Your password must be at least 8 characters long.'
            : 'Your new password must be at least 8 characters long.'}
        </ThemedText>

        {/* Fields card */}
        <Card padding="none" elevation="sm" style={styles.card}>
          {!isSetPasswordMode && (
            <>
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
            </>
          )}

          <Controller
            control={control}
            name="newPassword"
            rules={{
              required: 'New password is required',
              minLength: { value: 8, message: 'Password must be at least 8 characters' },
              validate: (val) => {
                if (!isSetPasswordMode && currentPasswordValue && val === currentPasswordValue) {
                  return 'New password must be different from current password';
                }
                return true;
              },
            }}
            render={({ field: { value, onChange } }) => (
              <PasswordField
                label={isSetPasswordMode ? 'Password' : 'New Password'}
                value={value}
                onChangeText={onChange}
                error={errors.newPassword?.message}
                placeholder={isSetPasswordMode ? 'Enter password' : 'Enter new password'}
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
                label={isSetPasswordMode ? 'Confirm Password' : 'Confirm New Password'}
                value={value}
                onChangeText={onChange}
                error={errors.confirmPassword?.message}
                placeholder={isSetPasswordMode ? 'Re-enter password' : 'Re-enter new password'}
                returnKeyType={verificationMode ? 'next' : 'done'}
                onSubmitEditing={verificationMode ? undefined : handleSubmit(onSubmit)}
              />
            )}
          />

          {verificationMode && (
            <>
              {divider}

              <Controller
                control={control}
                name="verificationCode"
                rules={{ required: 'Verification code is required' }}
                render={({ field: { value, onChange } }) => (
                  <View
                    style={[
                      styles.fieldWrapper,
                      { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
                    ]}
                  >
                    <ThemedText variant="captionBold" color="textMuted">
                      {verificationMode === 'email_code'
                        ? 'Email Verification Code'
                        : 'Authenticator Code'}
                    </ThemedText>
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
                      onChangeText={onChange}
                      placeholder={
                        verificationMode === 'email_code'
                          ? 'Enter 6-digit code sent to your email'
                          : 'Enter 6-digit authenticator code'
                      }
                      placeholderTextColor={colors.textLight}
                      keyboardType="number-pad"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit(onSubmit)}
                    />
                    {errors.verificationCode?.message ? (
                      <ThemedText variant="small" color="emergencyText">
                        {errors.verificationCode.message}
                      </ThemedText>
                    ) : null}
                  </View>
                )}
              />
            </>
          )}
        </Card>

        {/* Submit button */}
        <Button
          label={isSetPasswordMode ? 'Set Password' : 'Change Password'}
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
