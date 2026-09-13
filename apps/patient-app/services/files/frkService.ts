import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { db } from '@db/index';
import { fileUploadConfig } from '@db/schema/fileUploadConfig';
import { eq } from 'drizzle-orm';
import { hasFileApi, saveFileConfig } from '../api/filesApi';
import { getFileConfig } from './filesService';

const MAK_KEY_PREFIX = 'patient_mak_key';
const FRK_KEY_PREFIX = 'patient_frk_key';

function getMakSecureKey(patientId: string) {
  return `${MAK_KEY_PREFIX}_${patientId}`;
}

function getFrkSecureKey(patientId: string) {
  return `${FRK_KEY_PREFIX}_${patientId}`;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(str: string) {
  // Use digestStringAsync to avoid needing TextEncoder which is not available natively in React Native
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, str);
}

// Generate a random 16-character FRK (e.g. ABCD-EFGH-IJKL-MNOP)
export function generateFrk() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let frk = '';
  for (let i = 0; i < 16; i++) {
    frk += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${frk.slice(0, 4)}-${frk.slice(4, 8)}-${frk.slice(8, 12)}-${frk.slice(12, 16)}`;
}

// Derive a 256-bit AES key from the FRK string using SHA-256 for simplicity
async function deriveKeyFromFrk(frk: string): Promise<Crypto.AESEncryptionKey> {
  const hashHex = await sha256(frk.replace(/-/g, '').toUpperCase());
  // take first 32 bytes (64 hex chars) - actually sha256 is exactly 32 bytes (64 hex chars)
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
  }
  const encoded = Buffer.from(bytes).toString('base64');
  return Crypto.AESEncryptionKey.import(encoded, 'base64');
}

// Ensure the device has the MAK initialized
export async function initializeMakAndFrkIfNeeded(
  patientId: string, 
  getToken: () => Promise<string | null>
) {
  let config = await getFileConfig(patientId, getToken);
  
  // Do we have the MAK locally and backend has it?
  const localMak = await SecureStore.getItemAsync(getMakSecureKey(patientId));
  if (localMak && config.encryptedMAK) {
    return { status: 'ready' as const }; // we are good!
  }

  // If we don't have MAK locally, but backend has EncryptedMAK, we need the user to enter FRK
  if (!localMak && config.encryptedMAK) {
    return { status: 'needs_frk' as const, encryptedMAK: config.encryptedMAK };
  }

  // If backend does NOT have EncryptedMAK, we need to generate one, encrypt it with a new FRK, and upload it
  const newFrk = generateFrk();
  const frkKey = await deriveKeyFromFrk(newFrk);
  
  // Use existing MAK if we have it, otherwise generate random MAK
  let makEncoded = localMak;
  if (!makEncoded) {
    const mak = await Crypto.AESEncryptionKey.generate(Crypto.AESKeySize.AES256);
    makEncoded = await mak.encoded('base64');
  }
  
  // Encrypt MAK with FRK
  // Pass makEncoded (base64 string) directly, since BinaryInput accepts base64 strings
  const sealed = await Crypto.aesEncryptAsync(makEncoded, frkKey);
  
  const encryptedMAKJson = JSON.stringify({
    cipherText: await sealed.combined('base64'),
    iv: await sealed.iv('base64'),
    tag: await sealed.tag('base64'),
    algorithm: 'AES-256-GCM'
  });

  // Save to backend
  if (hasFileApi()) {
      await saveFileConfig(patientId, getToken, encryptedMAKJson);
  }
  
  // Save locally
  await SecureStore.setItemAsync(getMakSecureKey(patientId), makEncoded);
  await SecureStore.setItemAsync(getFrkSecureKey(patientId), newFrk);

  // Update local DB to reflect the new encryptedMAK
  await db
    .update(fileUploadConfig)
    .set({ encryptedMAK: encryptedMAKJson })
    .where(eq(fileUploadConfig.patientId, patientId));

  return { status: 'generated' as const, frk: newFrk };
}

// Process user-entered FRK
export async function unlockMakWithFrk(patientId: string, frk: string, encryptedMAKJson: string) {
  try {
    const frkKey = await deriveKeyFromFrk(frk);
    const parsed = JSON.parse(encryptedMAKJson);
    const combinedBytes = new Uint8Array(Buffer.from(parsed.cipherText, 'base64'));
    const sealed = Crypto.AESSealedData.fromCombined(
      combinedBytes, 
      { ivLength: 12, tagLength: 16 }
    );
    const makEncoded = await Crypto.aesDecryptAsync(sealed, frkKey, { output: 'base64' });
    
    // Success, save locally
    await SecureStore.setItemAsync(getMakSecureKey(patientId), makEncoded);
    await SecureStore.setItemAsync(getFrkSecureKey(patientId), frk);
    return true;
  } catch (error) {
    console.error('Failed to unlock MAK', error);
    return false;
  }
}

// Regenerate FRK (assumes MAK is already available locally)
export async function regenerateFrk(patientId: string, getToken: () => Promise<string | null>): Promise<string> {
  const localMak = await SecureStore.getItemAsync(getMakSecureKey(patientId));
  if (!localMak) {
    throw new Error('Cannot regenerate FRK: No Master Access Key found on this device.');
  }

  const newFrk = generateFrk();
  const frkKey = await deriveKeyFromFrk(newFrk);
  
  // Encrypt existing local MAK with the new FRK
  const sealed = await Crypto.aesEncryptAsync(localMak, frkKey);
  
  const encryptedMAKJson = JSON.stringify({
    cipherText: await sealed.combined('base64'),
    iv: await sealed.iv('base64'),
    tag: await sealed.tag('base64'),
    algorithm: 'AES-256-GCM'
  });

  // Save to backend
  if (hasFileApi()) {
      await saveFileConfig(patientId, getToken, encryptedMAKJson);
  }
  
  // Save new FRK locally
  await SecureStore.setItemAsync(getFrkSecureKey(patientId), newFrk);

  // Update local DB
  await db
    .update(fileUploadConfig)
    .set({ encryptedMAK: encryptedMAKJson })
    .where(eq(fileUploadConfig.patientId, patientId));

  return newFrk;
}
