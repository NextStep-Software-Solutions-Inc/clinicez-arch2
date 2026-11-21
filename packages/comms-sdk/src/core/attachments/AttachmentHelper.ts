import { CommsAttachmentDto } from '../types';
import { AttachmentValidationError } from '../errors';

export interface AttachmentValidationResult {
  isValid: boolean;
  mimeType: string | null;
  errorMessage?: string;
}

export class AttachmentHelper {
  public static readonly MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB hard cap
  private static readonly DANGEROUS_EXTENSIONS = new Set([
    '.exe', '.bat', '.cmd', '.vbs', '.ps1', '.sh', '.msi', '.scr',
    '.jar', '.js', '.com', '.hta', '.vbe', '.wsf'
  ]);

  /**
   * Pre-flight magic bytes inspection of the first 32 bytes of a file.
   */
  public static readonly verifyFile = AttachmentHelper.validateHeaderBytes;

  public static async validateHeaderBytes(
    file: Blob | ArrayBuffer | Uint8Array,
    fileName: string
  ): Promise<AttachmentValidationResult> {
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';
    if (AttachmentHelper.DANGEROUS_EXTENSIONS.has(ext)) {
      return {
        isValid: false,
        mimeType: null,
        errorMessage: `Dangerous executable extension '${ext}' blocked.`
      };
    }

    let bytes: Uint8Array;
    if (file instanceof Uint8Array) {
      bytes = file.subarray(0, 32);
    } else if (file instanceof ArrayBuffer) {
      bytes = new Uint8Array(file.slice(0, 32));
    } else {
      // Blob
      const slice = file.slice(0, 32);
      const buffer = await slice.arrayBuffer();
      bytes = new Uint8Array(buffer);
    }

    if (bytes.length < 4) {
      return {
        isValid: false,
        mimeType: null,
        errorMessage: 'File is too small to inspect header magic bytes.'
      };
    }

    // PDF check: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    if (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2D
    ) {
      return { isValid: true, mimeType: 'application/pdf' };
    }

    // JPEG check: 0xFF 0xD8 0xFF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return { isValid: true, mimeType: 'image/jpeg' };
    }

    // PNG check: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4E &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0D &&
      bytes[5] === 0x0A &&
      bytes[6] === 0x1A &&
      bytes[7] === 0x0A
    ) {
      return { isValid: true, mimeType: 'image/png' };
    }

    // WebP check: RIFF....WEBP (0x52 0x49 0x46 0x46 and offset 8..11 is 0x57 0x45 0x42 0x50)
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return { isValid: true, mimeType: 'image/webp' };
    }

    // HEIC check: offset 4..7 has ftyp (0x66 0x74 0x79 0x70)
    if (
      bytes.length >= 12 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    ) {
      return { isValid: true, mimeType: 'image/heic' };
    }

    return {
      isValid: false,
      mimeType: null,
      errorMessage: 'Unrecognized magic bytes. Allowed formats: PDF, JPEG, PNG, WebP, HEIC.'
    };
  }

  /**
   * Multipart upload with real-time progress reporting.
   */
  public static async uploadAttachment(
    uploadUrl: string,
    file: Blob | File | { uri: string; name: string; type: string; size: number },
    fileName: string,
    token: string,
    onProgress?: (percent: number) => void
  ): Promise<CommsAttachmentDto> {
    const fileSize = 'size' in file ? file.size : 0;
    if (fileSize > this.MAX_FILE_SIZE_BYTES) {
      throw new AttachmentValidationError(
        `Attachment exceeds maximum allowed size of 10 MB (${fileSize} bytes).`
      );
    }

    if (file instanceof Blob) {
      const validation = await this.validateHeaderBytes(file, fileName);
      if (!validation.isValid || !validation.mimeType) {
        throw new AttachmentValidationError(validation.errorMessage ?? 'File validation failed.');
      }
    }

    if (typeof XMLHttpRequest !== 'undefined') {
      return new Promise<CommsAttachmentDto>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        if (xhr.upload && onProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              onProgress(Math.round((event.loaded / event.total) * 100));
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response.data ?? response);
            } catch {
              reject(new AttachmentValidationError('Invalid JSON response from upload endpoint.'));
            }
          } else {
            reject(new AttachmentValidationError(`Upload failed with HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => reject(new AttachmentValidationError('Network error during attachment upload.'));

        const formData = new FormData();
        formData.append('file', file as any, fileName);
        xhr.send(formData);
      });
    }

    // Fallback for Node/Bun fetch
    const formData = new FormData();
    formData.append('file', file as any, fileName);

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    if (!res.ok) {
      throw new AttachmentValidationError(`Upload failed with HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    return json.data ?? json;
  }

  /**
   * Client-side download decryption using AES-256-GCM.
   * Expects payload: IV (12 bytes) + Ciphertext + Tag (16 bytes).
   */
  public static async decryptAttachment(
    ciphertextWithIvAndTag: ArrayBuffer,
    dekBytes: Uint8Array
  ): Promise<ArrayBuffer> {
    const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
    if (!subtle) {
      throw new Error('Web Crypto API (crypto.subtle) is required for attachment decryption.');
    }

    if (ciphertextWithIvAndTag.byteLength < 28) {
      throw new AttachmentValidationError('Ciphertext buffer too small to contain IV and GCM tag.');
    }

    const iv = ciphertextWithIvAndTag.slice(0, 12);
    const dataAndTag = ciphertextWithIvAndTag.slice(12);

    const cryptoKey = await subtle.importKey(
      'raw',
      dekBytes as any,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    return await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv),
        tagLength: 128
      },
      cryptoKey,
      dataAndTag
    );
  }
}

export const verifyFile = AttachmentHelper.validateHeaderBytes;
