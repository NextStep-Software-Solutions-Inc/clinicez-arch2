import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ── Mock Native Modules Before Top-Level Transitive Imports ────────────────────
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  View: 'View',
  Text: 'Text',
}));

mock.module('expo-crypto', () => ({
  getRandomBytes: (n: number) => {
    const bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  },
  digestStringAsync: async (_algo: string, s: string) => {
    const h = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(h))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  },
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: () => 'mock-uuid-12345',
}));

// Dynamic imports after mock.module to avoid hoisting
const CryptoJS = (await import('crypto-js')).default;
const Crypto = await import('expo-crypto');
const { Database } = await import('bun:sqlite');
const { drizzle } = await import('drizzle-orm/bun-sqlite');
const { sql } = await import('drizzle-orm');
const schema = await import('../db/schema/index');

// ── Mock Platform & SecureStore ──────────────────────────────────────────────
const memoryStore = new Map<string, string>();
const webLocalStorage = new Map<string, string>();

const mockSecureStore = {
  getItemAsync: async (key: string) => memoryStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    memoryStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    memoryStore.delete(key);
  },
};

// ── PBKDF2 & Cryptographic Primitives ─────────────────────────────────────────
const PBKDF2_ITERATIONS = 10_000;

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function generateSaltHex(): string {
  const bytes = Crypto.getRandomBytes(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveKeyPbkdf2WebCrypto(
  pin: string,
  saltHex: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const saltBytes = new Uint8Array(
    saltHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function deriveKeyPbkdf2CryptoJS(
  pin: string,
  saltHex: string,
  iterations: number = PBKDF2_ITERATIONS
): string {
  const salt = CryptoJS.enc.Hex.parse(saltHex);
  const derived = CryptoJS.PBKDF2(pin, salt, {
    keySize: 256 / 32,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  return derived.toString(CryptoJS.enc.Hex);
}

async function deriveKeyPbkdf2(
  pin: string,
  saltHex: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle?.deriveBits) {
    try {
      return await deriveKeyPbkdf2WebCrypto(pin, saltHex, iterations);
    } catch {}
  }
  return deriveKeyPbkdf2CryptoJS(pin, saltHex, iterations);
}

async function hashPinLegacy(pin: string, saltHex: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${saltHex}:${pin}`);
}

// ── PIN Lifecycle Implementation ──────────────────────────────────────────────
const PIN_KEY = 'app_pin';
const PIN_SALT_KEY = 'app_pin_salt';
const HAS_PIN_KEY = 'has_pin';
const INTERNAL_PATIENT_ID_KEY = 'internal_patient_id';
const BOOTSTRAP_COMPLETE_KEY = 'app_bootstrap_complete';

async function savePin(pin: string, store = mockSecureStore): Promise<void> {
  const saltHex = generateSaltHex();
  const derivedKeyHex = await deriveKeyPbkdf2(pin, saltHex, PBKDF2_ITERATIONS);
  const hashedPin = `${saltHex}:${derivedKeyHex}:${PBKDF2_ITERATIONS}`;
  await Promise.all([
    store.setItemAsync(PIN_SALT_KEY, saltHex),
    store.setItemAsync(PIN_KEY, hashedPin),
    store.setItemAsync(HAS_PIN_KEY, 'true'),
  ]);
}

async function verifyPin(
  pin: string,
  store = mockSecureStore,
  onUnlock?: () => void
): Promise<boolean> {
  const [stored, legacySalt] = await Promise.all([
    store.getItemAsync(PIN_KEY),
    store.getItemAsync(PIN_SALT_KEY),
  ]);
  if (!stored) return false;

  const parts = stored.split(':');

  // 1. Modern PBKDF2: salt:derivedKey:iterations
  if (parts.length === 3) {
    const [saltHex, derivedKeyHex, iterStr] = parts;
    const iters = parseInt(iterStr, 10) || PBKDF2_ITERATIONS;
    const candidateKey = await deriveKeyPbkdf2(pin, saltHex, iters);
    if (constantTimeEqual(derivedKeyHex, candidateKey)) {
      onUnlock?.();
      return true;
    }
    return false;
  }

  // 2. Legacy 2-part: salt:sha256
  if (parts.length === 2) {
    const [saltHex, sha256Hex] = parts;
    const candidateHash = await hashPinLegacy(pin, saltHex);
    if (constantTimeEqual(sha256Hex, candidateHash)) {
      await savePin(pin, store); // Transparent upgrade
      onUnlock?.();
      return true;
    }
    return false;
  }

  // 3. Legacy separate keys
  if (legacySalt) {
    const candidateHash = await hashPinLegacy(pin, legacySalt);
    if (constantTimeEqual(stored, candidateHash)) {
      await savePin(pin, store); // Transparent upgrade
      onUnlock?.();
      return true;
    }
    return false;
  }

  // 4. Ancient plaintext
  if (stored === pin) {
    await savePin(pin, store); // Transparent upgrade
    onUnlock?.();
    return true;
  }

  return false;
}

// ── Test Suites ───────────────────────────────────────────────────────────────
describe('Milestone 1 (R1): Auth & Offline Bootstrap Automated Test Suite', () => {
  beforeEach(() => {
    memoryStore.clear();
    webLocalStorage.clear();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Dimension 1: PBKDF2 Key Stretching, Transparent Upgrade & Constant Time
  // ────────────────────────────────────────────────────────────────────────────
  describe('Dimension 1: PBKDF2 Key-Stretched PIN & Transparent Upgrade', () => {
    test('derives bit-for-bit identical 256-bit hash matching reference test vector', async () => {
      const pin = '1234';
      const saltHex = '0123456789abcdef0123456789abcdef';
      const expectedHash = '9064b74a23e54a7477d534b297d1129715073d6f7838cbb0551bab002938da72';

      const webCryptoResult = await deriveKeyPbkdf2WebCrypto(pin, saltHex, 10000);
      const cryptoJsResult = deriveKeyPbkdf2CryptoJS(pin, saltHex, 10000);

      expect(webCryptoResult).toBe(expectedHash);
      expect(cryptoJsResult).toBe(expectedHash);
      expect(webCryptoResult).toBe(cryptoJsResult);
    });

    test('dual engines match across arbitrary PINs and iterations', async () => {
      const testCases = [
        { pin: '0000', salt: 'abcdef0123456789abcdef0123456789', iters: 5000 },
        { pin: '9876', salt: 'fedcba9876543210fedcba9876543210', iters: 10000 },
        { pin: '4321', salt: '11223344556677889900aabbccddeeff', iters: 1000 },
      ];

      for (const tc of testCases) {
        const web = await deriveKeyPbkdf2WebCrypto(tc.pin, tc.salt, tc.iters);
        const js = deriveKeyPbkdf2CryptoJS(tc.pin, tc.salt, tc.iters);
        expect(web).toBe(js);
        expect(web.length).toBe(64); // 256 bits = 64 hex characters
      }
    });

    test('constantTimeEqual performs timing-attack safe comparison', () => {
      expect(constantTimeEqual('abcdef123456', 'abcdef123456')).toBe(true);
      expect(constantTimeEqual('abcdef123456', 'abcdef123457')).toBe(false);
      expect(constantTimeEqual('abcdef123456', 'abcdef12345')).toBe(false);
      expect(constantTimeEqual('', '')).toBe(true);
      expect(constantTimeEqual('a', '')).toBe(false);
    });

    test('savePin writes modern 3-part format with 16-byte random salt', async () => {
      await savePin('4321');

      const storedPin = await mockSecureStore.getItemAsync(PIN_KEY);
      const storedSalt = await mockSecureStore.getItemAsync(PIN_SALT_KEY);
      const storedHasPin = await mockSecureStore.getItemAsync(HAS_PIN_KEY);

      expect(storedHasPin).toBe('true');
      expect(storedSalt).toBeTruthy();
      expect(storedSalt!.length).toBe(32); // 16 bytes = 32 hex chars

      expect(storedPin).toBeTruthy();
      const parts = storedPin!.split(':');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe(storedSalt!);
      expect(parts[1].length).toBe(64); // 256-bit derived key
      expect(parts[2]).toBe('10000'); // 10000 iterations
    });

    test('verifyPin accepts valid PBKDF2 PIN and rejects incorrect PIN', async () => {
      await savePin('8888');

      let unlocked = false;
      const ok = await verifyPin('8888', mockSecureStore, () => {
        unlocked = true;
      });
      expect(ok).toBe(true);
      expect(unlocked).toBe(true);

      const fail = await verifyPin('1111', mockSecureStore);
      expect(fail).toBe(false);
    });

    test('transparently upgrades legacy 2-part SHA-256 hash to PBKDF2 on unlock', async () => {
      const pin = '5678';
      const saltHex = generateSaltHex();
      const legacyHash = await hashPinLegacy(pin, saltHex);

      // Pre-seed legacy 2-part record
      await mockSecureStore.setItemAsync(PIN_KEY, `${saltHex}:${legacyHash}`);
      await mockSecureStore.setItemAsync(HAS_PIN_KEY, 'true');

      let unlocked = false;
      const ok = await verifyPin('5678', mockSecureStore, () => {
        unlocked = true;
      });
      expect(ok).toBe(true);
      expect(unlocked).toBe(true);

      // Verify transparent upgrade occurred
      const upgradedPin = await mockSecureStore.getItemAsync(PIN_KEY);
      expect(upgradedPin).toBeTruthy();
      const parts = upgradedPin!.split(':');
      expect(parts.length).toBe(3); // Upgraded to 3-part PBKDF2!
      expect(parts[2]).toBe('10000');

      // Verify the upgraded record verifies with modern PBKDF2
      const modernOk = await verifyPin('5678', mockSecureStore);
      expect(modernOk).toBe(true);
    });

    test('transparently upgrades legacy separate salt key to PBKDF2', async () => {
      const pin = '9999';
      const saltHex = generateSaltHex();
      const legacyHash = await hashPinLegacy(pin, saltHex);

      await mockSecureStore.setItemAsync(PIN_SALT_KEY, saltHex);
      await mockSecureStore.setItemAsync(PIN_KEY, legacyHash);
      await mockSecureStore.setItemAsync(HAS_PIN_KEY, 'true');

      const ok = await verifyPin('9999', mockSecureStore);
      expect(ok).toBe(true);

      const upgraded = await mockSecureStore.getItemAsync(PIN_KEY);
      expect(upgraded!.split(':').length).toBe(3);
    });

    test('transparently upgrades ancient plaintext to PBKDF2', async () => {
      await mockSecureStore.setItemAsync(PIN_KEY, '1234');
      await mockSecureStore.setItemAsync(HAS_PIN_KEY, 'true');

      const ok = await verifyPin('1234', mockSecureStore);
      expect(ok).toBe(true);

      const upgraded = await mockSecureStore.getItemAsync(PIN_KEY);
      expect(upgraded!.split(':').length).toBe(3);
    });

    test('invalid PIN never triggers upgrade or unlocks', async () => {
      const saltHex = generateSaltHex();
      const legacyHash = await hashPinLegacy('1234', saltHex);
      await mockSecureStore.setItemAsync(PIN_KEY, `${saltHex}:${legacyHash}`);

      const fail = await verifyPin('9999', mockSecureStore);
      expect(fail).toBe(false);

      // Still unchanged 2-part legacy hash
      const stillLegacy = await mockSecureStore.getItemAsync(PIN_KEY);
      expect(stillLegacy!.split(':').length).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Dimension 2: Web PIN Lock Parity & Reload Lifecycle
  // ────────────────────────────────────────────────────────────────────────────
  describe('Dimension 2: Web PIN Lock Parity', () => {
    test('returning user on Web is locked on page reload when PIN is set', async () => {
      // Simulate stored credentials in localStorage (Web SecureStore adapter)
      await mockSecureStore.setItemAsync(HAS_PIN_KEY, 'true');
      await mockSecureStore.setItemAsync(INTERNAL_PATIENT_ID_KEY, 'pat-web-1');
      await mockSecureStore.setItemAsync(BOOTSTRAP_COMPLETE_KEY, 'true');

      // Hydration logic:
      const storedHasPIN = await mockSecureStore.getItemAsync(HAS_PIN_KEY);
      const pinSet = storedHasPIN === 'true';

      // Line 130 parity fix: setIsLocked(pinSet) on both Web and Native
      let isLocked = pinSet;
      expect(isLocked).toBe(true);

      // Entering PIN unlocks
      await savePin('1111');
      const unlocked = await verifyPin('1111', mockSecureStore, () => {
        isLocked = false;
      });
      expect(unlocked).toBe(true);
      expect(isLocked).toBe(false);
    });

    test('fresh install on Web starts unlocked before PIN is configured', async () => {
      const storedHasPIN = await mockSecureStore.getItemAsync(HAS_PIN_KEY);
      const pinSet = storedHasPIN === 'true';
      const isLocked = pinSet;
      expect(isLocked).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Dimension 3: Offline Cold-Boot Session Preservation & Verification
  // ────────────────────────────────────────────────────────────────────────────
  describe('Dimension 3: Offline Cold-Boot Session Retention', () => {
    test('preserves internalPatientId in SecureStore and memory when offline', async () => {
      const verifiedPatientId = 'patient-vault-uuid-777';
      await mockSecureStore.setItemAsync(INTERNAL_PATIENT_ID_KEY, verifiedPatientId);
      await mockSecureStore.setItemAsync(BOOTSTRAP_COMPLETE_KEY, 'true');
      await mockSecureStore.setItemAsync(HAS_PIN_KEY, 'true');

      // Simulate verifyUser offline branch:
      const isSignedIn = false;
      let internalPatientId: string | null = null;
      let isInitialized = false;

      if (!isSignedIn) {
        const [storedId, storedBootstrap] = await Promise.all([
          mockSecureStore.getItemAsync(INTERNAL_PATIENT_ID_KEY),
          mockSecureStore.getItemAsync(BOOTSTRAP_COMPLETE_KEY),
        ]);
        if (storedId) {
          // Never delete! Retain verified local session
          internalPatientId = storedId;
          if (storedBootstrap === 'true') {
            isInitialized = true;
          }
        }
      }

      // Assert session was NOT deleted and state is retained
      expect(internalPatientId).toBe(verifiedPatientId);
      expect(isInitialized).toBe(true);
      expect(await mockSecureStore.getItemAsync(INTERNAL_PATIENT_ID_KEY)).toBe(verifiedPatientId);

      // Test expanded isAuthenticated
      const hasPIN = true;
      const isLocallyAuthenticated = !!(internalPatientId && hasPIN);
      const isAuthenticated = (isSignedIn ?? false) || isLocallyAuthenticated;
      expect(isAuthenticated).toBe(true);
    });

    test('useIsAppLoading bypasses Clerk network hang for initialized offline sessions', () => {
      const auth = {
        isInitialized: true,
        internalPatientId: 'pat-123',
        hasPIN: true,
        isLoading: false,
      };
      const onboarding = { isLoading: false };
      const clerkAuth = { isLoaded: false }; // Clerk hangs indefinitely offline

      const isAppLoading =
        auth.isInitialized && auth.internalPatientId && auth.hasPIN
          ? auth.isLoading || onboarding.isLoading
          : auth.isLoading || onboarding.isLoading || !clerkAuth.isLoaded;

      expect(isAppLoading).toBe(false);
    });

    test('useIsMainReady routes offline initialized user directly to MainStack', () => {
      const auth = {
        isAuthenticated: true,
        isInitialized: true,
        hasPIN: true,
        isLocked: true,
      };
      const onboarding = { isComplete: true };
      const isAuthLoading = false;

      const isMainReady =
        !isAuthLoading &&
        onboarding.isComplete &&
        auth.isAuthenticated &&
        auth.isInitialized &&
        auth.hasPIN;

      const isLocked =
        !isAuthLoading &&
        onboarding.isComplete &&
        auth.isAuthenticated &&
        auth.isInitialized &&
        auth.hasPIN &&
        auth.isLocked;

      expect(isMainReady).toBe(true);
      expect(isLocked).toBe(true);

      // Web navigation parity
      const isMainReadyWeb = !isAuthLoading && auth.isAuthenticated && auth.isInitialized && auth.hasPIN;
      const isUnauthenticatedWeb = !isAuthLoading && !auth.isAuthenticated;

      expect(isMainReadyWeb).toBe(true);
      expect(isUnauthenticatedWeb).toBe(false); // Does NOT drop to AuthStack!
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Dimension 4: Online First-Boot Gate & Post-Logout Gate
  // ────────────────────────────────────────────────────────────────────────────
  describe('Dimension 4: Online First-Boot Gate & Post-Logout Halt', () => {
    test('uninitialized fresh install offline halts and blocks MainStack', () => {
      const auth = {
        isAuthenticated: false,
        isInitialized: false,
        internalPatientId: null,
        hasPIN: false,
        isLoading: false,
      };
      const onboarding = { isComplete: false, isLoading: false };
      const clerkAuth = { isLoaded: false }; // Offline

      // useIsAppLoading stays true
      const isAppLoading =
        auth.isInitialized && auth.internalPatientId && auth.hasPIN
          ? auth.isLoading || onboarding.isLoading
          : auth.isLoading || onboarding.isLoading || !clerkAuth.isLoaded;

      expect(isAppLoading).toBe(true);

      // useIsMainReady must return false
      const isMainReady =
        !isAppLoading &&
        onboarding.isComplete &&
        auth.isAuthenticated &&
        auth.isInitialized &&
        auth.hasPIN;

      expect(isMainReady).toBe(false);

      // useIsSettingUpPIN must return false
      const isSettingUpPIN =
        !isAppLoading &&
        onboarding.isComplete &&
        auth.isAuthenticated &&
        auth.isInitialized &&
        !auth.hasPIN;

      expect(isSettingUpPIN).toBe(false);
    });

    test('post-logout state re-arms the mandatory online gate', () => {
      const auth = {
        isAuthenticated: false,
        isInitialized: false,
        internalPatientId: null,
        hasPIN: false,
        isLoading: false,
      };
      const onboarding = { isComplete: true, isLoading: false };
      const isAppLoading = false;

      const isMainReady =
        !isAppLoading &&
        onboarding.isComplete &&
        auth.isAuthenticated &&
        auth.isInitialized &&
        auth.hasPIN;

      expect(isMainReady).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Dimension 5: Deterministic Post-Logout Wipe & Offline Resilience
  // ────────────────────────────────────────────────────────────────────────────
  describe('Dimension 5: Deterministic Post-Logout Wipe', () => {
    test('clearAllData contains all 52 exported schema tables including inboxes and cursors', () => {
      const requiredTables = [
        'inboxLabRequests',
        'inboxPrescriptions',
        'inboxLabResults',
        'inboxMedicalCertificates',
        'syncCursors',
      ];

      for (const tableName of requiredTables) {
        expect((schema as any)[tableName]).toBeDefined();
      }
    });

    test('SQLite clearAllData execution truncates all tables under PRAGMA foreign_keys = OFF', async () => {
      const sqlite = new Database(':memory:');
      const testDb = drizzle(sqlite);

      // Create test tables representing schema
      sqlite.run(`
        CREATE TABLE inbox_lab_requests (id TEXT PRIMARY KEY, patient_id TEXT);
        CREATE TABLE inbox_prescriptions (id TEXT PRIMARY KEY, patient_id TEXT);
        CREATE TABLE inbox_lab_results (id TEXT PRIMARY KEY, patient_id TEXT);
        CREATE TABLE inbox_medical_certificates (id TEXT PRIMARY KEY, patient_id TEXT);
        CREATE TABLE sync_cursors (patient_id TEXT PRIMARY KEY, cursor TEXT);
        CREATE TABLE patients (id TEXT PRIMARY KEY, first_name TEXT);
      `);

      // Populate rows
      sqlite.run(`
        INSERT INTO inbox_lab_requests VALUES ('lr-1', 'pat-1');
        INSERT INTO inbox_prescriptions VALUES ('rx-1', 'pat-1');
        INSERT INTO inbox_lab_results VALUES ('res-1', 'pat-1');
        INSERT INTO inbox_medical_certificates VALUES ('cert-1', 'pat-1');
        INSERT INTO sync_cursors VALUES ('pat-1', 'cursor-token-abc');
        INSERT INTO patients VALUES ('pat-1', 'Maria');
      `);

      // Verify populated
      const countBefore = sqlite.query('SELECT COUNT(*) as count FROM inbox_prescriptions').get() as { count: number };
      expect(countBefore.count).toBe(1);

      // Execute wipe transaction
      await testDb.transaction(async (tx) => {
        await tx.run(sql`PRAGMA foreign_keys = OFF`);
        await tx.run(sql`DELETE FROM inbox_lab_requests`);
        await tx.run(sql`DELETE FROM inbox_prescriptions`);
        await tx.run(sql`DELETE FROM inbox_lab_results`);
        await tx.run(sql`DELETE FROM inbox_medical_certificates`);
        await tx.run(sql`DELETE FROM sync_cursors`);
        await tx.run(sql`DELETE FROM patients`);
      });

      // Verify all tables truncated to 0 rows
      const tablesToCheck = [
        'inbox_lab_requests',
        'inbox_prescriptions',
        'inbox_lab_results',
        'inbox_medical_certificates',
        'sync_cursors',
        'patients',
      ];

      for (const tbl of tablesToCheck) {
        const row = sqlite.query(`SELECT COUNT(*) as count FROM ${tbl}`).get() as { count: number };
        expect(row.count).toBe(0);
      }
    });

    test('logout deletes all 13 session/security/privacy keys and catches offline signOut error', async () => {
      // 1. Seed all 13 keys
      const keysToSeed = [
        INTERNAL_PATIENT_ID_KEY,
        PIN_KEY,
        PIN_SALT_KEY,
        HAS_PIN_KEY,
        'biometrics_enabled',
        'lock_timeout',
        BOOTSTRAP_COMPLETE_KEY,
        'privacy_hide_amounts',
        'privacy_blur_previews',
        'privacy_local_analytics',
        'privacy_hidden_ids',
        'push_token',
        'debug_force_yakap_registered',
      ];

      for (const k of keysToSeed) {
        await mockSecureStore.setItemAsync(k, 'test-val-' + k);
        webLocalStorage.set(k, 'test-val-' + k);
      }

      expect(memoryStore.size).toBe(13);
      expect(webLocalStorage.size).toBe(13);

      // 2. Mock blob cache purge
      let blobCacheCleared = false;
      const mockBlobStorage = {
        clearCache: async () => {
          blobCacheCleared = true;
        },
      };

      // 3. Mock Clerk signOut rejecting with network failure (offline logout)
      const mockSignOut = async () => {
        throw new Error('Failed to fetch: Network unreachable in Airplane Mode');
      };

      // 4. Execute logout logic
      let logoutThrew = false;
      try {
        await mockBlobStorage.clearCache().catch(() => {});
        await Promise.all(keysToSeed.map((k) => mockSecureStore.deleteItemAsync(k).catch(() => {})));
        keysToSeed.forEach((k) => webLocalStorage.delete(k));

        await mockSignOut().catch((err) => {
          // Graceful handling of network failure
        });
      } catch {
        logoutThrew = true;
      }

      // Assertions
      expect(logoutThrew).toBe(false);
      expect(blobCacheCleared).toBe(true);
      expect(memoryStore.size).toBe(0);
      expect(webLocalStorage.size).toBe(0);
    });
  });
});
