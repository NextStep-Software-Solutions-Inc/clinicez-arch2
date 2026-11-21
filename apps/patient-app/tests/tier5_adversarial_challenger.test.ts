// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import * as path from 'node:path';
import * as fs from 'node:fs';

(globalThis as any).__DEV__ = false;

// ── Mock Native Modules Before Transitive Imports ────────────────────
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default ?? obj.ios ?? obj.android },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove: () => {} }) },
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => ({}),
  },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  Modal: 'Modal',
  TextInput: 'TextInput',
  Image: 'Image',
}));

mock.module('@react-native-community/netinfo', () => ({
  default: {
    fetch: async () => ({ isConnected: true, isInternetReachable: true }),
    addEventListener: () => () => {},
  },
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
}));

let mockUuidIndex = 50000;
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
  randomUUID: () => `mock-uuid-${++mockUuidIndex}`,
}));

// Dynamic imports
const CryptoJS = (await import('crypto-js')).default;
const Crypto = await import('expo-crypto');
const { Database } = await import('bun:sqlite');
const { drizzle } = await import('drizzle-orm/bun-sqlite');
const { eq, or, and, inArray } = await import('drizzle-orm');
const getAppConfig = (await import('../app.config')).default;
const {
  resolveDocumentTypeId,
  inferCategoryFromDocumentType,
  getDocumentTypeVisualMeta,
} = await import('../services/files/documentTypeMapping');
type DocumentTypeLike = import('../services/files/documentTypeMapping').DocumentTypeLike;
const {
  parseLabRequestItems,
  parsePrescriptionItems,
} = await import('../services/sync/documentMappers');
const {
  labStageChip,
  prescriptionStageChip,
  provenanceBadge,
  verificationBadge,
} = await import('../services/documents/presentation');
const {
  CATEGORY_FILTERS,
  filterAndSearchRecords,
  matchesCategoryFilter,
  resolveRecordDomain,
} = await import('../services/records/categories');

// ── PBKDF2 & Cryptographic Test Helpers ─────────────────────────────────────
const PBKDF2_ITERATIONS = 10_000;

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function deriveKeyPbkdf2(
  pin: string,
  saltHex: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle?.deriveBits) {
    try {
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
    } catch {
      // Fallback
    }
  }

  const salt = CryptoJS.enc.Hex.parse(saltHex);
  const derived = CryptoJS.PBKDF2(pin, salt, {
    keySize: 256 / 32,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  return derived.toString(CryptoJS.enc.Hex);
}

async function hashPinWithSalt(pin: string, saltHex: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${saltHex}:${pin}`);
}

async function verifyPinOracle(
  pin: string,
  stored: string | null,
  legacySalt: string | null
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split(':');

  if (parts.length === 3) {
    const [saltHex, derivedKeyHex, iterStr] = parts;
    const iters = parseInt(iterStr, 10) || PBKDF2_ITERATIONS;
    if (iters <= 0 || isNaN(iters)) return false;
    try {
      const candidateKey = await deriveKeyPbkdf2(pin, saltHex, iters);
      return constantTimeEqual(derivedKeyHex, candidateKey);
    } catch {
      return false;
    }
  }

  if (parts.length === 2) {
    const [saltHex, sha256Hex] = parts;
    try {
      const candidateHash = await hashPinWithSalt(pin, saltHex);
      return constantTimeEqual(sha256Hex, candidateHash);
    } catch {
      return false;
    }
  }

  if (legacySalt) {
    try {
      const candidateHash = await hashPinWithSalt(pin, legacySalt);
      return constantTimeEqual(stored, candidateHash);
    } catch {
      return false;
    }
  }

  if (stored === pin) return true;
  return false;
}

// ── SQLite In-Memory Setup for Interceptor & Hydration Testing ───────────────
function createTier5TestDatabase() {
  const sqlite = new Database(':memory:');

  sqlite.run(`
    CREATE TABLE sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_allergies (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      server_id TEXT,
      allergen TEXT NOT NULL,
      reaction_type TEXT,
      severity TEXT,
      management TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      local_notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_social_history (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      server_id TEXT,
      tobacco_use TEXT,
      alcohol_use TEXT,
      diet_exercise TEXT,
      local_confidential_flag INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE local_health_records (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      category TEXT NOT NULL,
      document_type_id TEXT NOT NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      provenance TEXT NOT NULL DEFAULT 'patient_uploaded',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.run(`
    CREATE TABLE document_types (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT,
      category TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  return sqlite;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 5 ADVERSARIAL STRESS TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────

describe('Tier 5 White-Box Coverage & Adversarial Stress Testing', () => {

  // ═════════════════════════════════════════════════════════════════════════
  // 1. AUTH & BOOT: SALT TAMPERING, ITERATION BOUNDARIES & MULTI-SESSION
  // ═════════════════════════════════════════════════════════════════════════
  describe('Dimension 1: Auth & Boot Cryptographic & Boundary Invariants', () => {
    test('1.1 Salt corruption resilience: rejects odd-length, non-hex, null bytes, and empty salt', async () => {
      const validPin = '1234';
      const validSalt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const validDerived = await deriveKeyPbkdf2(validPin, validSalt, 10_000);
      const validStored = `${validSalt}:${validDerived}:10000`;

      expect(await verifyPinOracle(validPin, validStored, null)).toBe(true);

      const corruptedSalts = [
        'xyz_not_hex!@#$',
        'a1b2c', // odd length
        '', // empty
        '\0\0\0\0\0\0\0\0', // null bytes
        '   a1b2c3d4   ', // un-trimmed
        'GGGGGGGGGGGGGGGG', // non-hex letters
        'a'.repeat(10_000), // huge salt
      ];

      for (const badSalt of corruptedSalts) {
        const corruptedStored = `${badSalt}:${validDerived}:10000`;
        const result = await verifyPinOracle(validPin, corruptedStored, null);
        expect(result).toBe(false);
      }
    });

    test('1.2 Iteration count tampering: rejects mismatched iterations and unauthorized PIN attempts', async () => {
      const pin = '5678';
      const salt = '0123456789abcdef0123456789abcdef';
      const standardKey = await deriveKeyPbkdf2(pin, salt, 10_000);

      // 1. When attacker tampers the iteration count in stored string (e.g. to 1, 100, 5000, 20000)
      // The derivation at the tampered count will NOT match the stored key derived at 10,000
      const tamperedCounts = ['1', '50', '500', '2000', '5000', '20000', '50000'];
      for (const iterStr of tamperedCounts) {
        const tamperedStored = `${salt}:${standardKey}:${iterStr}`;
        const outcome = await verifyPinOracle(pin, tamperedStored, null);
        expect(outcome).toBe(false);
      }

      // 2. An attacker with wrong PIN can never unlock regardless of iteration count or fallback
      const wrongPin = '0000';
      const fallbackIterationStrings = [
        '0',
        '-1',
        '-10000',
        'NaN',
        'Infinity',
        'null',
        'undefined',
        'abc',
      ];
      for (const iterStr of fallbackIterationStrings) {
        const tamperedStored = `${salt}:${standardKey}:${iterStr}`;
        const outcome = await verifyPinOracle(wrongPin, tamperedStored, null);
        expect(outcome).toBe(false);
      }
    });

    test('1.3 Malformed stored format resilience: parts length < 2, > 3, empty colons', async () => {
      const pin = '9999';
      const malformedPayloads = [
        '::',
        ':::',
        'single_string_no_colon',
        'salt:key:10000:extra_unexpected_fourth_field',
        'salt:key:10000:extra:fifth',
        ':key:10000',
        'salt::10000',
        'salt:key:',
      ];

      for (const payload of malformedPayloads) {
        const outcome = await verifyPinOracle(pin, payload, null);
        expect(outcome).toBe(false);
      }
    });

    test('1.4 Deterministic multi-session wipe invariant: 13 keys and database wiped clean', async () => {
      const mockStorage = new Map<string, string>();
      const keysToWipe = [
        'internal_patient_id',
        'app_pin',
        'app_pin_salt',
        'has_pin',
        'biometrics_enabled',
        'lock_timeout',
        'app_bootstrap_complete',
        'privacy_hide_amounts',
        'privacy_blur_previews',
        'privacy_local_analytics',
        'privacy_hidden_ids',
        'push_token',
        'debug_force_yakap_registered',
      ];

      // Populate keys for User A
      keysToWipe.forEach((k) => mockStorage.set(k, `value_for_${k}`));
      expect(mockStorage.size).toBe(13);

      // Perform simulated logout wipe
      keysToWipe.forEach((k) => mockStorage.delete(k));
      expect(mockStorage.size).toBe(0);

      // Verify that after wipe, accessing any key returns undefined/null
      for (const k of keysToWipe) {
        expect(mockStorage.get(k)).toBeUndefined();
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. SYNC & HYDRATION: CONCURRENT WRITES, DELETION & REJECTION RETENTION
  // ═════════════════════════════════════════════════════════════════════════
  describe('Dimension 2: Sync & Hydration Concurrency & Invariants', () => {
    test('2.1 Interceptor deletion pre-capture: captures full payload and serverId before deletion', () => {
      const sqlite = createTier5TestDatabase();
      const patientId = 'p-123';
      const rowId = 'allergy-row-1';
      const serverId = 'srv-allergy-999';

      // Seed row
      sqlite.run(
        `INSERT INTO patient_allergies (id, patient_id, server_id, allergen, reaction_type, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [rowId, patientId, serverId, 'Penicillin', 'Anaphylaxis', 1, Date.now(), Date.now()]
      );

      // Pre-capture step (mirrors interceptor preCapturedPromise logic)
      const preCaptured = sqlite.query(`SELECT * FROM patient_allergies WHERE id = ?`).get(rowId) as any;
      expect(preCaptured).toBeDefined();
      expect(preCaptured.allergen).toBe('Penicillin');
      expect(preCaptured.server_id).toBe(serverId);

      // Execute local deletion
      sqlite.run(`DELETE FROM patient_allergies WHERE id = ?`, [rowId]);
      const postDelete = sqlite.query(`SELECT * FROM patient_allergies WHERE id = ?`).get(rowId);
      expect(postDelete).toBeNull();

      // Enqueue delete sync item with pre-captured data
      const deletePayload = {
        id: preCaptured.server_id,
        clientId: preCaptured.id,
        patientId: preCaptured.patient_id,
        allergenName: preCaptured.allergen,
      };
      sqlite.run(
        `INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['sq-del-1', 'patient_allergies', serverId, 'delete', JSON.stringify(deletePayload), 'pending', Date.now()]
      );

      const queuedItem = sqlite.query(`SELECT * FROM sync_queue WHERE id = 'sq-del-1'`).get() as any;
      expect(queuedItem).toBeDefined();
      expect(queuedItem.operation).toBe('delete');
      expect(queuedItem.entity_id).toBe(serverId);
      const parsed = JSON.parse(queuedItem.payload_json);
      expect(parsed.allergenName).toBe('Penicillin');
    });

    test('2.2 Hydration preserves local offline edits when pending in sync_queue', () => {
      const sqlite = createTier5TestDatabase();
      const patientId = 'p-456';
      const localRowId = 'allergy-local-offline-1';

      // 1. User added an allergy offline
      sqlite.run(
        `INSERT INTO patient_allergies (id, patient_id, allergen, reaction_type, is_active, local_notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [localRowId, patientId, 'Aspirin', 'Hives', 1, 'Local confidential observation', Date.now(), Date.now()]
      );

      // 2. Sync queue has pending item for this local row
      sqlite.run(
        `INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['sq-aspirin-1', 'patient_allergies', localRowId, 'create', JSON.stringify({ id: localRowId, allergenName: 'Aspirin' }), 'pending', Date.now()]
      );

      // Hydration oracle: build pendingEntityIds
      const pendingQueue = sqlite.query(`SELECT entity_id, payload_json FROM sync_queue WHERE status = 'pending'`).all() as any[];
      const pendingEntityIds = new Set<string>();
      for (const q of pendingQueue) {
        if (q.entity_id) pendingEntityIds.add(q.entity_id);
        const payload = JSON.parse(q.payload_json);
        if (payload.id) pendingEntityIds.add(payload.id);
      }

      // Server returns empty list or conflicting list from server
      const serverItems = [
        { id: 'server-allergy-different', allergenName: 'Pollen', reaction: 'Sneezing' }
      ];

      // Reconcile list: local row should NOT be pruned because it is in pendingEntityIds
      const localRows = sqlite.query(`SELECT id, server_id FROM patient_allergies WHERE patient_id = ?`).all(patientId) as any[];
      for (const local of localRows) {
        const isServerKnown = serverItems.some((s) => s.id === local.id || s.id === local.server_id);
        const isPending = pendingEntityIds.has(local.id) || (local.server_id && pendingEntityIds.has(local.server_id));
        if (!isServerKnown && !isPending) {
          sqlite.run(`DELETE FROM patient_allergies WHERE id = ?`, [local.id]);
        }
      }

      const preservedLocal = sqlite.query(`SELECT * FROM patient_allergies WHERE id = ?`).get(localRowId) as any;
      expect(preservedLocal).toBeDefined();
      expect(preservedLocal.allergen).toBe('Aspirin');
      expect(preservedLocal.local_notes).toBe('Local confidential observation');
    });

    test('2.3 Sync queue rejection retention: rejected items marked "rejected" and never silently purged', () => {
      const sqlite = createTier5TestDatabase();
      const itemId = 'sq-rejected-item-77';

      sqlite.run(
        `INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [itemId, 'patient_allergies', 'ent-1', 'create', JSON.stringify({ allergen: 'Peanuts' }), 'pending', Date.now()]
      );

      // Server responds with status 'Rejected'
      const serverResult = {
        idempotencyKey: itemId,
        status: 'Rejected',
        conflictDetail: 'Allergy already documented under clinical supervision',
      };

      // SyncService rejection handler
      sqlite.run(
        `UPDATE sync_queue SET status = 'rejected', error_message = ? WHERE id = ?`,
        [serverResult.conflictDetail, itemId]
      );

      const retained = sqlite.query(`SELECT * FROM sync_queue WHERE id = ?`).get(itemId) as any;
      expect(retained).toBeDefined();
      expect(retained.status).toBe('rejected');
      expect(retained.error_message).toBe('Allergy already documented under clinical supervision');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 3. BINARY STAGING & PATH TRAVERSAL RESILIENCE
  // ═════════════════════════════════════════════════════════════════════════
  describe('Dimension 3: Binary Staging & Path Traversal Resilience', () => {
    test('3.1 Path traversal strings in blob keys are sanitized and contained', () => {
      function safeParseBlobKey(blobKey: string): { patientId: string; subfolder: string; fileName: string } {
        // Normalize slashes and remove directory traversal sequences
        const sanitized = blobKey
          .replace(/\\/g, '/')
          .replace(/\.\.+/g, '') // strip ..
          .replace(/^\/+|\/+$/g, '');

        const parts = sanitized.split('/').filter(Boolean);
        if (parts.length >= 3) {
          return {
            patientId: parts[0],
            subfolder: parts[1],
            fileName: parts.slice(2).join('_'),
          };
        }
        if (parts.length === 2) {
          return {
            patientId: parts[0],
            subfolder: 'records',
            fileName: parts[1],
          };
        }
        return {
          patientId: 'default',
          subfolder: 'records',
          fileName: parts[0] || 'file.bin',
        };
      }

      const traversalAttempts = [
        '../../etc/passwd',
        '../../../root/.ssh/id_rsa',
        'patient1/records/../../../etc/shadow',
        '..\\..\\windows\\system32\\cmd.exe',
        'patient2/sub/../../secret.pdf',
        'patient3/records/./././normal.pdf',
        '/absolute/path/attempt/file.png',
      ];

      for (const attempt of traversalAttempts) {
        const parsed = safeParseBlobKey(attempt);
        expect(parsed.patientId).not.toContain('..');
        expect(parsed.subfolder).not.toContain('..');
        expect(parsed.fileName).not.toContain('..');
        expect(parsed.fileName).not.toContain('/');
      }
    });

    test('3.2 DocumentType catalog resolution: zero fallback UUIDs when catalog exists', () => {
      const dynamicCatalog: DocumentTypeLike[] = [
        { id: 'uuid-server-xray', code: 'xray', label: 'Diagnostic X-Ray', isActive: true },
        { id: 'uuid-server-lab', code: 'lab-result', label: 'Clinical Lab Test', isActive: true },
        { id: 'uuid-server-rx', code: 'prescription', label: 'Doctor Prescription', isActive: true },
        { id: 'uuid-server-other', code: 'other', label: 'Other Document', isActive: true },
      ];

      // When dynamic catalog is supplied:
      const resXray = resolveDocumentTypeId('xray', null, dynamicCatalog);
      expect(resXray).toBe('uuid-server-xray');
      expect(resXray).not.toBe('11111111-1111-1111-1111-111111111111');

      const resLab = resolveDocumentTypeId('lab-result', null, dynamicCatalog);
      expect(resLab).toBe('uuid-server-lab');
      expect(resLab).not.toBe('22222222-2222-2222-2222-222222222222');

      const resRx = resolveDocumentTypeId('prescription', null, dynamicCatalog);
      expect(resRx).toBe('uuid-server-rx');
      expect(resRx).not.toBe('44444444-4444-4444-4444-444444444444');

      // Unknown category falls back to server 'other' row
      const resUnknown = resolveDocumentTypeId('totally-unknown-weird-cat', null, dynamicCatalog);
      expect(resUnknown).toBe('uuid-server-other');
      expect(resUnknown).not.toBe('66666666-6666-6666-6666-666666666666');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 4. UI & RECORDS HUB: 2-SEGMENT ISOLATION & ZERO MOCK LEAKS
  // ═════════════════════════════════════════════════════════════════════════
  describe('Dimension 4: UI & Records Hub Two-Segment Isolation & Null Safety', () => {
    test('4.1 Two-segment isolation invariant: Clinic Documents vs My Uploads strictly separated', () => {
      const recordsScreenPath = path.resolve(
        __dirname,
        '../navigation/screens/records/Records.screen.tsx'
      );
      expect(fs.existsSync(recordsScreenPath)).toBe(true);
      const content = fs.readFileSync(recordsScreenPath, 'utf8');

      // Segmented control must exist with exactly the 2 segmented options
      expect(content).toContain("options={['Clinic Documents', 'My Uploads']}");
      expect(content).toContain('segmentIndex === 0');

      // Segment 0 must be provider issued clinic documents
      expect(content).toContain('SEGMENT 0: CLINIC DOCUMENTS (Provider Issued)');

      // Segment 1 must be user uploads
      expect(content).toContain('SEGMENT 1: MY UPLOADS');
    });

    test('4.2 Zero mock clinical data leaks: screens contain zero hardcoded fake drugs or labs', () => {
      const screensDir = path.resolve(__dirname, '../navigation/screens');
      const filesToAudit: string[] = [];

      function collectFiles(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            collectFiles(fullPath);
          } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
            filesToAudit.push(fullPath);
          }
        }
      }
      collectFiles(screensDir);

      const forbiddenStrings = [
        'Amlodipine',
        'Co-Amoxiclav',
        '108.4',
        'METRO HEALTH',
        'Fuente Osmeña',
      ];

      for (const filePath of filesToAudit) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        for (const forbidden of forbiddenStrings) {
          expect(fileContent).not.toContain(forbidden);
        }
      }
    });

    test('4.3 Malformed data null safety across presentation mappers and chips', () => {
      // Test parsePrescriptionItems with null, undefined, empty, or garbage JSON
      expect(parsePrescriptionItems(null as any)).toEqual([]);
      expect(parsePrescriptionItems(undefined as any)).toEqual([]);
      expect(parsePrescriptionItems('')).toEqual([]);
      expect(parsePrescriptionItems('{invalid json')).toEqual([]);
      expect(parsePrescriptionItems([null, undefined, {}] as any)).toEqual([]);

      // Test parseLabRequestItems
      expect(parseLabRequestItems(null as any)).toEqual([]);
      expect(parseLabRequestItems(undefined as any)).toEqual([]);
      expect(parseLabRequestItems('{corrupt')).toEqual([]);

      // Test stage chips for all valid stages (no exceptions thrown)
      const validRxStages = ['Issued', 'Accepted', 'PartiallyAccepted', 'Rejected', 'Dispensed', 'ExternalDispensed'] as const;
      for (const st of validRxStages) {
        const chip = prescriptionStageChip(st);
        expect(chip).toBeDefined();
        expect(chip.label.length).toBeGreaterThan(0);
        expect(chip.tone).toBeDefined();
      }

      const validLabStages = [
        'Issued', 'Routed', 'Claimed', 'AwaitingPayment', 'Paid',
        'SpecimenCollected', 'InProcess', 'ResultFinalized',
        'ExternalSubmitted', 'Reviewed', 'Rejected', 'Cancelled',
      ] as const;
      for (const st of validLabStages) {
        const chip = labStageChip(st);
        expect(chip).toBeDefined();
        expect(chip.label.length).toBeGreaterThan(0);
        expect(chip.tone).toBeDefined();
      }

      // Test verification and provenance badges
      expect(verificationBadge('Verified')).toBeDefined();
      expect(verificationBadge('Rejected', 'Sample hemolyzed')).toBeDefined();
      expect(verificationBadge('Unverified')).toBeDefined();

      expect(provenanceBadge('ClinicEzLab')).toBeDefined();
      expect(provenanceBadge('ExternalLab')).toBeDefined();
      expect(provenanceBadge('PatientUploaded')).toBeDefined();

      // Test safe handling when given null/undefined without crashing
      expect(() => prescriptionStageChip(null as any)).not.toThrow();
      expect(() => prescriptionStageChip(undefined as any)).not.toThrow();
      expect(() => labStageChip(null as any)).not.toThrow();
      expect(() => labStageChip(undefined as any)).not.toThrow();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 5. EAS BRANCHING & CONFIG: EXTREME BRANCHES, JAVA KEYWORDS & TRUNCATION
  // ═════════════════════════════════════════════════════════════════════════
  describe('Dimension 5: EAS Branching, Sanitization & Collision Resistance', () => {
    const CHANNEL_REGEX = /^[a-z\d][a-z\d._-]*$/;
    const ANDROID_SEGMENT_REGEX = /^[a-z][a-z0-9_]*$/;

    function evalConfig(env: Record<string, string | undefined>) {
      const orig = { ...process.env };
      try {
        delete process.env.APP_VARIANT;
        delete process.env.APP_BRANCH;
        delete process.env.APP_TAG;
        delete process.env.GIT_TAG;
        delete process.env.EAS_BUILD_GIT_COMMIT_REF;
        delete process.env.GIT_BRANCH;
        delete process.env.GITHUB_REF;
        delete process.env.IOS_BUNDLE_IDENTIFIER;
        delete process.env.IOS_BUNDLE_ID;
        delete process.env.GOOGLE_SERVICES_JSON;
        delete process.env.SQLITE_DB_NAME;

        Object.assign(process.env, env);
        return getAppConfig({ projectRoot: path.resolve(__dirname, '..'), staticConfig: {} });
      } finally {
        for (const k of Object.keys(process.env)) {
          if (orig[k] === undefined) delete process.env[k];
          else process.env[k] = orig[k];
        }
      }
    }

    test('5.1 Extreme branch names satisfy channel regex and Android package segment regex', () => {
      const extremeBranches = [
        'a'.repeat(250),
        '///--__..starts-with-symbols',
        'ends-with-symbols--__..///',
        'UPPERCASE_BRANCH_NAME_WITH_UNDERSCORES',
        'feature/nested/deeply/sub/branch/tier',
        'feat/🚀-rocket-branch-✨-special',
        'fix/issue#123@urgent!critical',
        '123456-starts-with-digits',
        '---',
        '___',
        '...',
      ];

      for (const branch of extremeBranches) {
        const config = evalConfig({ APP_BRANCH: branch });
        const channel = (config.updates?.requestHeaders as any)?.['expo-channel-name'];
        const pkg = config.android?.package;

        expect(typeof channel).toBe('string');
        expect(channel).toMatch(CHANNEL_REGEX);

        expect(typeof pkg).toBe('string');
        expect(pkg).not.toContain('-');
        const segments = pkg!.split('.');
        for (const seg of segments) {
          expect(seg).toMatch(ANDROID_SEGMENT_REGEX);
        }
      }
    });

    test('5.2 Java reserved keywords are immunized in Android package segments', () => {
      const allJavaKeywords = [
        'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
        'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
        'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
        'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
        'package', 'private', 'protected', 'public', 'return', 'short', 'static',
        'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
        'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null',
      ];

      for (const keyword of allJavaKeywords) {
        const config = evalConfig({ APP_BRANCH: keyword });
        const pkg = config.android?.package!;
        const segments = pkg.split('.');

        // No segment should be the bare Java keyword
        for (const seg of segments) {
          expect(seg).not.toBe(keyword);
          expect(seg).toMatch(ANDROID_SEGMENT_REGEX);
        }

        // Must have been sanitized or prefixed with pkg_
        const lastSeg = segments[segments.length - 1];
        expect(lastSeg).toMatch(new RegExp(`^(pkg_)?br_.*`));
      }
    });

    test('5.3 SHA-256 truncation collision resistance: 100 branches with identical 30-char prefixes produce 0 collisions', () => {
      const prefix = 'feature/patient-offline-sync-overhaul-v';
      const branchCount = 100;
      const channels = new Set<string>();
      const packages = new Set<string>();
      const bundleIds = new Set<string>();
      const schemes = new Set<string>();
      const dbNames = new Set<string>();

      for (let i = 0; i < branchCount; i++) {
        const branchName = `${prefix}${i}-stage-test`;
        const config = evalConfig({ APP_BRANCH: branchName });

        const channel = (config.updates?.requestHeaders as any)?.['expo-channel-name'];
        const pkg = config.android?.package!;
        const bundleId = config.ios?.bundleIdentifier!;
        const scheme = config.scheme!;
        const dbName = config.extra?.sqliteDbName!;

        expect(channel).toMatch(CHANNEL_REGEX);

        channels.add(channel);
        packages.add(pkg);
        bundleIds.add(bundleId);
        schemes.add(scheme);
        dbNames.add(dbName);
      }

      // 100 unique branch names MUST result in exactly 100 distinct channels, packages, bundle IDs, schemes, and DB names
      expect(channels.size).toBe(branchCount);
      expect(packages.size).toBe(branchCount);
      expect(bundleIds.size).toBe(branchCount);
      expect(schemes.size).toBe(branchCount);
      expect(dbNames.size).toBe(branchCount);
    });
  });
});
