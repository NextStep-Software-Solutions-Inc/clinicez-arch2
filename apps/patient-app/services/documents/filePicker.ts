import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { UploadFile } from '../api/multipart';
import { IMAGE_UPLOAD_QUALITY } from '../files/fileCompression';
import { UPLOAD_ALLOWED_MIME_TYPES } from './uploadRules';

export interface PickedFile {
  file: UploadFile;
  /** Size in bytes when the picker reports it. */
  size: number | null;
}

export class MediaPermissionError extends Error {
  constructor() {
    super('Photo access is needed to attach a picture. Enable it in your device settings.');
    this.name = 'MediaPermissionError';
  }
}

function mimeFromName(name: string): string {
  return name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '';
}

/** Lets the user choose a PDF or image from the device. Resolves null when cancelled. */
export async function pickDocumentFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...UPLOAD_ALLOWED_MIME_TYPES],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  return {
    file: { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? mimeFromName(asset.name) },
    size: asset.size ?? null,
  };
}

/** Lets the user choose a photo from the library. Resolves null when cancelled. */
export async function pickPhotoFile(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new MediaPermissionError();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: IMAGE_UPLOAD_QUALITY,
  });
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  return {
    file: {
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
    },
    size: asset.fileSize ?? null,
  };
}
