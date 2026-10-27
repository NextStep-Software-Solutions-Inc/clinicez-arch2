import { Platform } from 'react-native';

export interface PickedDocumentResult {
  uri: string;
  name: string;
  size?: number;
  mimeType: string;
  base64: string;
  documentType: 'PDF' | 'Photo';
}

/**
 * Prompts user to pick an external lab result document (PDF, JPG, PNG)
 * and returns metadata along with base64 data URI for upload.
 */
export async function pickLabResultDocument(): Promise<PickedDocumentResult | null> {
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const isPdf = Boolean(
    asset.name?.toLowerCase().endsWith('.pdf') || asset.mimeType === 'application/pdf'
  );
  const documentType: 'PDF' | 'Photo' = isPdf ? 'PDF' : 'Photo';
  const mimeType = asset.mimeType || (isPdf ? 'application/pdf' : 'image/jpeg');

  // Convert to base64 data URI
  let dataUri = '';

  // Web: If asset.file is available, convert directly via FileReader
  if (Platform.OS === 'web' && (asset as any).file && typeof FileReader !== 'undefined') {
    dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read document file.'));
      reader.readAsDataURL((asset as any).file);
    });
  } else if (Platform.OS === 'web' && asset.uri) {
    if (asset.uri.startsWith('data:')) {
      dataUri = asset.uri;
    } else {
      try {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to convert file to data URI.'));
          reader.readAsDataURL(blob);
        });
      } catch {
        dataUri = asset.uri;
      }
    }
  } else {
    // Native (iOS / Android)
    try {
      const FileSystem = await import('expo-file-system');
      if (FileSystem && FileSystem.readAsStringAsync) {
        const b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        dataUri = `data:${mimeType};base64,${b64}`;
      } else {
        dataUri = asset.uri;
      }
    } catch {
      dataUri = asset.uri;
    }
  }

  return {
    uri: asset.uri,
    name: asset.name,
    size: asset.size,
    mimeType,
    base64: dataUri,
    documentType,
  };
}
