import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

export interface WrappedKeyModel {
  Alg: string;
  Kid?: string | null;
  Iv: string;
  Tag: string;
  CipherText: string;
}

export interface EncryptedEnvelopeResult {
  ciphertext: Buffer;
  ivBase64: string;
  tagBase64: string;
  encryptedHash: string;
  encryptedSizeBytes: number;
  wrappedKeyJson: string;
  wrappedKey: WrappedKeyModel;
  encryptionAlgorithm: "AES-256-GCM";
  keyScheme: "cmk-v1" | "pmk-v1";
}

const MIN_SECRET_LENGTH = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const DEK_BYTES = 32;

export function assertValidMasterSecret(masterSecret: string, label: string): void {
  if (!masterSecret || masterSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`${label} must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
}

/**
 * Matches ClinicEncryptionKeyRing / PatientEncryptionKeyRing:
 * Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(secret)), 0, 4).ToLowerInvariant()
 */
export function computeKeyId(masterSecret: string): string {
  assertValidMasterSecret(masterSecret, "MasterSecret");
  const digest = createHash("sha256").update(Buffer.from(masterSecret, "utf8")).digest();
  return digest.subarray(0, 4).toString("hex").toLowerCase();
}

export function sha256Hex(data: Uint8Array | Buffer): string {
  return createHash("sha256").update(data).digest("hex").toLowerCase();
}

/**
 * Normalizes a UUID string into 32-char lowercase hex without hyphens (.NET Guid `:N` format).
 */
export function formatUuidNoHyphens(uuid: string): string {
  const hex = uuid.trim().replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`Invalid UUID: "${uuid}"`);
  }
  return hex;
}

/**
 * Normalizes a UUID string into 36-char lowercase hyphenated format (.NET Guid `"D"` format).
 */
export function formatUuidHyphenated(uuid: string): string {
  const hex = formatUuidNoHyphens(uuid);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Matches ClinicEncryptionService.DeriveClinicMasterKey:
 * salt = UTF8(tenantId.Trim().ToLowerInvariant())
 * info = UTF8($"{clinicId:N}:ClinicEz:ClinicEncryption:v1")
 */
export function deriveCmk(masterSecret: string, tenantId: string, clinicId: string): Buffer {
  assertValidMasterSecret(masterSecret, "Clinic MasterSecret");
  const trimmedTenant = tenantId.trim().toLowerCase();
  if (!trimmedTenant) {
    throw new Error("tenantId cannot be empty.");
  }
  const ikm = Buffer.from(masterSecret, "utf8");
  const salt = Buffer.from(trimmedTenant, "utf8");
  const info = Buffer.from(`${formatUuidNoHyphens(clinicId)}:ClinicEz:ClinicEncryption:v1`, "utf8");
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, 32));
}

/**
 * Matches PatientEncryptionService.DerivePatientMasterKey:
 * salt = UTF8(patientId.ToString("D").ToLowerInvariant())
 * info = UTF8("clinicez-pmk-v1")
 */
export function derivePmk(masterSecret: string, patientId: string): Buffer {
  assertValidMasterSecret(masterSecret, "Patient MasterSecret");
  const ikm = Buffer.from(masterSecret, "utf8");
  const salt = Buffer.from(formatUuidHyphenated(patientId), "utf8");
  const info = Buffer.from("clinicez-pmk-v1", "utf8");
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, 32));
}

function encryptWithKek(
  plaintext: Uint8Array,
  kek: Buffer,
  keyId: string,
  keyScheme: "cmk-v1" | "pmk-v1",
): EncryptedEnvelopeResult {
  const dek = randomBytes(DEK_BYTES);
  const fileIv = randomBytes(GCM_IV_BYTES);
  const wrapIv = randomBytes(GCM_IV_BYTES);

  try {
    const fileCipher = createCipheriv("aes-256-gcm", dek, fileIv, { authTagLength: GCM_TAG_BYTES });
    const ciphertext = Buffer.concat([fileCipher.update(plaintext), fileCipher.final()]);
    const fileTag = fileCipher.getAuthTag();

    const wrapCipher = createCipheriv("aes-256-gcm", kek, wrapIv, { authTagLength: GCM_TAG_BYTES });
    const wrappedDekCiphertext = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
    const wrapTag = wrapCipher.getAuthTag();

    const wrappedKey: WrappedKeyModel = {
      Alg: "AES-256-GCM",
      Kid: keyId,
      Iv: wrapIv.toString("base64"),
      Tag: wrapTag.toString("base64"),
      CipherText: wrappedDekCiphertext.toString("base64"),
    };

    return {
      ciphertext,
      ivBase64: fileIv.toString("base64"),
      tagBase64: fileTag.toString("base64"),
      encryptedHash: sha256Hex(ciphertext),
      encryptedSizeBytes: ciphertext.length,
      wrappedKeyJson: JSON.stringify(wrappedKey),
      wrappedKey,
      encryptionAlgorithm: "AES-256-GCM",
      keyScheme,
    };
  } finally {
    dek.fill(0);
    kek.fill(0);
  }
}

function decryptWithKek(
  ciphertext: Uint8Array,
  ivBase64: string,
  tagBase64: string,
  wrappedKeyJson: string,
  kek: Buffer,
  expectedKeyId?: string,
): Buffer {
  const model = parseWrappedKeyJson(wrappedKeyJson);
  if (model.Alg !== "AES-256-GCM") {
    kek.fill(0);
    throw new Error(`Unsupported wrapped key algorithm: ${model.Alg}`);
  }
  if (expectedKeyId && model.Kid && model.Kid !== expectedKeyId) {
    kek.fill(0);
    throw new Error(`KeyId mismatch: expected ${expectedKeyId}, got ${model.Kid}`);
  }

  const wrapIv = Buffer.from(model.Iv, "base64");
  const wrapTag = Buffer.from(model.Tag, "base64");
  const wrappedDekCiphertext = Buffer.from(model.CipherText, "base64");

  const dek = Buffer.alloc(wrappedDekCiphertext.length);
  try {
    const unwrapDecipher = createDecipheriv("aes-256-gcm", kek, wrapIv, {
      authTagLength: GCM_TAG_BYTES,
    });
    unwrapDecipher.setAuthTag(wrapTag);
    const unwrapped = Buffer.concat([
      unwrapDecipher.update(wrappedDekCiphertext),
      unwrapDecipher.final(),
    ]);
    unwrapped.copy(dek);
    unwrapped.fill(0);
  } finally {
    kek.fill(0);
  }

  try {
    const fileIv = Buffer.from(ivBase64, "base64");
    const fileTag = Buffer.from(tagBase64, "base64");
    const fileDecipher = createDecipheriv("aes-256-gcm", dek, fileIv, {
      authTagLength: GCM_TAG_BYTES,
    });
    fileDecipher.setAuthTag(fileTag);
    return Buffer.concat([fileDecipher.update(ciphertext), fileDecipher.final()]);
  } finally {
    dek.fill(0);
  }
}

export function parseWrappedKeyJson(wrappedKeyJson: string): WrappedKeyModel {
  const parsed = JSON.parse(wrappedKeyJson) as Record<string, unknown>;
  const requiredKeys: Array<keyof WrappedKeyModel> = ["Alg", "Kid", "Iv", "Tag", "CipherText"];
  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`WrappedKeyJson missing PascalCase property "${key}"`);
    }
  }
  if (typeof parsed.Alg !== "string" || typeof parsed.Iv !== "string" || typeof parsed.Tag !== "string" || typeof parsed.CipherText !== "string") {
    throw new Error("WrappedKeyJson properties Alg, Iv, Tag, CipherText must be strings.");
  }
  return {
    Alg: parsed.Alg,
    Kid: parsed.Kid === null || parsed.Kid === undefined ? null : String(parsed.Kid),
    Iv: parsed.Iv,
    Tag: parsed.Tag,
    CipherText: parsed.CipherText,
  };
}

export function encryptClinicPayload(
  plaintext: Uint8Array,
  tenantId: string,
  clinicId: string,
  masterSecret: string,
): EncryptedEnvelopeResult {
  const keyId = computeKeyId(masterSecret);
  const cmk = deriveCmk(masterSecret, tenantId, clinicId);
  return encryptWithKek(plaintext, cmk, keyId, "cmk-v1");
}

export function decryptClinicPayload(
  ciphertext: Uint8Array,
  ivBase64: string,
  tagBase64: string,
  wrappedKeyJson: string,
  tenantId: string,
  clinicId: string,
  masterSecret: string,
  enforceKidMatch = true,
): Buffer {
  const keyId = computeKeyId(masterSecret);
  const cmk = deriveCmk(masterSecret, tenantId, clinicId);
  return decryptWithKek(
    ciphertext,
    ivBase64,
    tagBase64,
    wrappedKeyJson,
    cmk,
    enforceKidMatch ? keyId : undefined,
  );
}

export function encryptPatientPayload(
  plaintext: Uint8Array,
  patientId: string,
  masterSecret: string,
): EncryptedEnvelopeResult {
  const keyId = computeKeyId(masterSecret);
  const pmk = derivePmk(masterSecret, patientId);
  return encryptWithKek(plaintext, pmk, keyId, "pmk-v1");
}

export function decryptPatientPayload(
  ciphertext: Uint8Array,
  ivBase64: string,
  tagBase64: string,
  wrappedKeyJson: string,
  patientId: string,
  masterSecret: string,
  enforceKidMatch = true,
): Buffer {
  const keyId = computeKeyId(masterSecret);
  const pmk = derivePmk(masterSecret, patientId);
  return decryptWithKek(
    ciphertext,
    ivBase64,
    tagBase64,
    wrappedKeyJson,
    pmk,
    enforceKidMatch ? keyId : undefined,
  );
}

export function clinicObjectKey(tenantId: string, clinicId: string, attachmentId: string): string {
  return `tenants/${tenantId}/clinics/${formatUuidHyphenated(clinicId)}/records/${formatUuidHyphenated(attachmentId)}.cez`;
}

export function patientObjectKey(patientId: string, fileId: string): string {
  return `patients/${formatUuidHyphenated(patientId)}/records/${formatUuidHyphenated(fileId)}.cez`;
}
