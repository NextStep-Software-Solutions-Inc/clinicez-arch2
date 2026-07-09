import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import type { FilesScreenProps } from './navigationTypes';

const BRAND = '#7C3AED';

export default function FRKSetupScreen({ route }: FilesScreenProps<'FRKSetupScreen'>) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { frk } = route.params;
  const [copied, setCopied] = useState(false);

  const copyToClipboard = useCallback(async () => {
    await Clipboard.setStringAsync(frk);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [frk]);

  const handleContinue = useCallback(() => {
    Alert.alert(
      'Are you sure?',
      'If you lose this key, you will not be able to recover your encrypted files on a new device. Please make sure you have saved it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'I have saved it', style: 'default', onPress: () => navigation.goBack() }
      ]
    );
  }, [navigation]);

  return (
    <ThemedView style={[styles.container, { paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.content}>
        <ThemedText style={styles.title}>File Recovery Key</ThemedText>
        <ThemedText style={styles.subtitle}>
          Your files are end-to-end encrypted. We have generated a unique File Recovery Key (FRK) for you. 
          You will need this key to access your files if you log in from a new device.
        </ThemedText>

        <View style={styles.keyContainer}>
          <ThemedText style={styles.keyText}>{frk}</ThemedText>
        </View>

        <Pressable onPress={copyToClipboard} style={styles.copyBtn}>
          <ThemedText style={styles.copyBtnText}>{copied ? 'Copied!' : 'Copy to Clipboard'}</ThemedText>
        </Pressable>

        <Pressable onPress={handleContinue} style={styles.continueBtn}>
          <ThemedText style={styles.continueBtnText}>I have saved my key</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', opacity: 0.8, lineHeight: 22 },
  keyContainer: { 
    backgroundColor: 'rgba(124,58,237,0.1)', 
    padding: 20, 
    borderRadius: 16, 
    borderWidth: 2, 
    borderColor: 'rgba(124,58,237,0.3)',
    marginTop: 20,
  },
  keyText: { fontSize: 22, fontWeight: '800', color: BRAND, letterSpacing: 2 },
  copyBtn: { marginTop: 10, padding: 12 },
  copyBtnText: { fontSize: 16, fontWeight: '700', color: BRAND },
  continueBtn: { 
    backgroundColor: BRAND, 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' }
});
