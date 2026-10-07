import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { usePatientId } from 'hooks/usePatientId';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { unlockMakWithFrk } from '../../../services/files/frkService';
import type { FilesScreenProps } from './navigationTypes';
import { useTheme } from '@react-navigation/native';
import { dialog } from '@utils/dialog';

const BRAND = '#7C3AED';

export default function FRKEntryScreen({ route }: FilesScreenProps<'FRKEntryScreen'>) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = (useBottomTabBarHeight?.() || 96) + insets.bottom;
  const theme = useTheme();
  const patientId = usePatientId();
  const { encryptedMAK } = route.params;
  const [frkInput, setFrkInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFrkChange = (text: string) => {
    const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const formatted = cleaned.match(/.{1,4}/g)?.join('-') || cleaned;
    setFrkInput(formatted.substring(0, 19));
  };

  const handleSubmit = useCallback(async () => {
    const cleaned = frkInput.trim().toUpperCase();
    if (cleaned.replace(/-/g, '').length !== 16) {
      dialog.alert('Invalid Key', 'The Recovery Key should be exactly 16 characters.');
      return;
    }
    
    setIsSubmitting(true);
    const success = await unlockMakWithFrk(patientId, cleaned, encryptedMAK);
    setIsSubmitting(false);

    if (success) {
      dialog.alert('Success', 'Your files have been successfully unlocked!', [
        { text: 'Continue', onPress: () => navigation.goBack() }
      ]);
    } else {
      dialog.alert('Error', 'The Recovery Key is incorrect. Please try again.');
    }
  }, [frkInput, patientId, encryptedMAK, navigation]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: tabBarHeight } } keyboardShouldPersistTaps="handled" bounces={false} >
        <ThemedView style={[styles.container]}>
          <View style={styles.content}>
            <ThemedText style={styles.title}>Unlock Files</ThemedText>
            <ThemedText style={styles.subtitle}>
              Please enter your 16-character File Recovery Key (FRK) to access your end-to-end encrypted files on this device.
            </ThemedText>

            <View style={[styles.inputContainer, { borderColor: theme.colors.border }]}>
              <TextInput
                style={[styles.input, { color: theme.colors.text }]}
                placeholder="ABCD-EFGH-IJKL-MNOP"
                placeholderTextColor={theme.colors.text}
                value={frkInput}
                onChangeText={handleFrkChange}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={19}
              />
            </View>
          </View>

          <Pressable onPress={handleSubmit} style={styles.submitBtn} disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.submitBtnText}>Unlock Files</ThemedText>
            )}
          </Pressable>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', gap: 20 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', opacity: 0.8, lineHeight: 22 },
  inputContainer: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    justifyContent: 'center',
    marginTop: 20,
  },
  input: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 2,
    textAlign: 'center',
  },
  submitBtn: { 
    backgroundColor: BRAND, 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    height: 56,
    justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' }
});
