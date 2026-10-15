import * as Crypto from 'expo-crypto';
import { aesDecryptBase64, aesEncrypt, base64ToBytes, deriveAesKeyBase64, generateAesKeyBase64 } from './aes';
import { storage } from '@utils/storage';
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

// Generate a cryptographically random 16-character FRK (e.g. ABCD-EFGH-IJKL-MNOP)
export function generateFrk() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomBytes = Crypto.getRandomBytes(16);
  let frk = '';
  for (let i = 0; i < 16; i++) {
    frk += chars.charAt(randomBytes[i] % chars.length);
  }
  return `${frk.slice(0, 4)}-${frk.slice(4, 8)}-${frk.slice(8, 12)}-${frk.slice(12, 16)}`;
}

// Derive a 256-bit AES key (base64) from the FRK string using SHA-256 for simplicity
async function deriveKeyFromFrk(frk: string): Promise<string> {
  return deriveAesKeyBase64(frk.replace(/-/g, '').toUpperCase());
}

// Ensure the device has the MAK initialized
export async function initializeMakAndFrkIfNeeded(
  patientId: string, 
  getToken: () => Promise<string | null>
) {
  let config = await getFileConfig(patientId, getToken);
  
  // Do we have the MAK locally and backend has it?
  const localMak = await storage.getItemAsync(getMakSecureKey(patientId));
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
    makEncoded = await generateAesKeyBase64();
  }
  
  // Encrypt MAK with FRK
  // Pass makEncoded (base64 string) directly, since BinaryInput accepts base64 strings
  const sealed = await aesEncrypt(makEncoded, frkKey);
  
  const encryptedMAKJson = JSON.stringify({
    cipherText: sealed.combinedBase64,
    iv: sealed.ivBase64,
    tag: sealed.tagBase64,
    algorithm: 'AES-256-GCM'
  });

  // Save to backend
  if (hasFileApi()) {
      await saveFileConfig(patientId, getToken, encryptedMAKJson);
  }
  
  // Save locally
  await storage.setItemAsync(getMakSecureKey(patientId), makEncoded);
  await storage.setItemAsync(getFrkSecureKey(patientId), newFrk);

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
    const combinedBytes = base64ToBytes(parsed.cipherText);
    const makEncoded = await aesDecryptBase64(combinedBytes, frkKey);
    
    // Success, save locally
    await storage.setItemAsync(getMakSecureKey(patientId), makEncoded);
    await storage.setItemAsync(getFrkSecureKey(patientId), frk);
    return true;
  } catch (error) {
    console.error('Failed to unlock MAK', error);
    return false;
  }
}

// Regenerate FRK (assumes MAK is already available locally)
export async function regenerateFrk(patientId: string, getToken: () => Promise<string | null>): Promise<string> {
  const localMak = await storage.getItemAsync(getMakSecureKey(patientId));
  if (!localMak) {
    throw new Error('Cannot regenerate FRK: No Master Access Key found on this device.');
  }

  const newFrk = generateFrk();
  const frkKey = await deriveKeyFromFrk(newFrk);
  
  // Encrypt existing local MAK with the new FRK
  const sealed = await aesEncrypt(localMak, frkKey);
  
  const encryptedMAKJson = JSON.stringify({
    cipherText: sealed.combinedBase64,
    iv: sealed.ivBase64,
    tag: sealed.tagBase64,
    algorithm: 'AES-256-GCM'
  });

  // Save to backend
  if (hasFileApi()) {
      await saveFileConfig(patientId, getToken, encryptedMAKJson);
  }
  
  // Save new FRK locally
  await storage.setItemAsync(getFrkSecureKey(patientId), newFrk);

  // Update local DB
  await db
    .update(fileUploadConfig)
    .set({ encryptedMAK: encryptedMAKJson })
    .where(eq(fileUploadConfig.patientId, patientId));

  return newFrk;
}
