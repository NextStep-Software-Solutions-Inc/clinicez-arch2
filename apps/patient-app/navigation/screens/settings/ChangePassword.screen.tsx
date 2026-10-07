import { useState } from 'react';
import { ScrollView, View, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import { useForm, Controller } from 'react-hook-form';
import { MaterialSymbol, SFSymbol } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
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

function PasswordField({ label, value, onChangeText, error, placeholder, returnKeyType, onSubmitEditing }: PasswordFieldProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={fieldStyles.wrapper}>
      <ThemedText style={[fieldStyles.label, { color: colors.text, opacity: 0.65 }]}>
        {label}
      </ThemedText>
      <View style={fieldStyles.inputRow}>
        <TextInput
          style={[fieldStyles.input, { color: colors.text as string }]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          placeholder={placeholder}
          placeholderTextColor={(colors.text as string) + '55'}
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
          {Platform.select({
            android: (
              <MaterialSymbol
                name={(visible ? 'visibility_off' : 'visibility') as any}
                size={20}
                color={(colors.text as string) + '80'}
              />
            ),
            ios: (
              <SFSymbol
                name={(visible ? 'eye.slash.fill' : 'eye.fill') as any}
                size={16}
                color={(colors.text as string) + '80'}
              />
            ),
          })}
        </Pressable>
      </View>
      {error ? <ThemedText style={fieldStyles.error}>{error}</ThemedText> : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  error: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 2,
  },
});

// ── ChangePasswordScreen ──────────────────────────────────────────────────────

export default function ChangePasswordScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
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

  const divider = <View style={[styles.divider, { backgroundColor: colors.border }]} />;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.container}
    >
      <ThemedText style={[styles.hint, { color: colors.text, opacity: 0.6 }]}>
        Your new password must be at least 8 characters long.
      </ThemedText>

      {/* Fields card */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
      </View>

      {/* Submit button */}
      <Pressable
        onPress={handleSubmit(onSubmit)}
        disabled={isSubmitting}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary },
          pressed && styles.buttonPressed,
          isSubmitting && styles.buttonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Change password"
        accessibilityState={{ disabled: isSubmitting }}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>Change Password</ThemedText>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  button: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
